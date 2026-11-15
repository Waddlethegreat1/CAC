import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type ActionCtx, type QueryCtx } from "../_generated/server";
import { foldText, type GeoHit, type Geocoder } from "../lib/geo";
import { throttledFetch } from "../lib/http";

export const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
export const MISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const geoHit = v.object({ lat: v.number(), lng: v.number(), city: v.optional(v.string()) });

type NominatimResult = { lat: string; lon: string; address?: Record<string, string | undefined> };

export const geocodeKey = (query: string) => foldText(query);

function fromCache(row: Doc<"geocode_cache"> | null, now: number): GeoHit | null | undefined {
  if (!row) return undefined;
  if (row.lat !== undefined && row.lng !== undefined) return { lat: row.lat, lng: row.lng, city: row.city };
  return now - row.fetchedAt < MISS_TTL_MS ? null : undefined;
}

const readCache = (ctx: Pick<QueryCtx, "db">, key: string) =>
  ctx.db
    .query("geocode_cache")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();

export const getCached = internalQuery({
  args: { key: v.string() },
  handler: (ctx, { key }) => readCache(ctx, key),
});

export const putCached = internalMutation({
  args: { key: v.string(), hit: v.union(geoHit, v.null()) },
  returns: v.null(),
  handler: async (ctx, { key, hit }) => {
    const row = { key, lat: hit?.lat, lng: hit?.lng, city: hit?.city, fetchedAt: Date.now() };
    const existing = await readCache(ctx, key);
    if (existing) await ctx.db.replace(existing._id, row);
    else await ctx.db.insert("geocode_cache", row);
    return null;
  },
});

async function nominatim(ctx: ActionCtx, query: string): Promise<GeoHit | null | undefined> {
  const url = `${NOMINATIM_URL}?${new URLSearchParams({ q: query, format: "jsonv2", limit: "1", addressdetails: "1" })}`;
  const res = await throttledFetch(ctx, url, "application/json");
  if (!res.ok) return undefined;
  const [top] = (await res.json()) as NominatimResult[];
  if (!top) return null;
  const lat = Number(top.lat);
  const lng = Number(top.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const city = top.address?.city ?? top.address?.town ?? top.address?.village;
  return city ? { lat, lng, city } : { lat, lng };
}

export function nominatimGeocoder(ctx: ActionCtx): Geocoder {
  const memo = new Map<string, Promise<GeoHit | null>>();
  const resolve = async (key: string, query: string) => {
    const cached = fromCache(await ctx.runQuery(internal.normalize.geocode.getCached, { key }), Date.now());
    if (cached !== undefined) return cached;
    const hit = await nominatim(ctx, query).catch(() => undefined);
    if (hit === undefined) return null;
    await ctx.runMutation(internal.normalize.geocode.putCached, { key, hit });
    return hit;
  };
  return (query) => {
    const key = geocodeKey(query);
    if (!key) return Promise.resolve(null);
    if (!memo.has(key)) memo.set(key, resolve(key, query));
    return memo.get(key)!;
  };
}

export function cachedGeocoder(ctx: Pick<QueryCtx, "db">): Geocoder {
  return async (query) => {
    const key = geocodeKey(query);
    return key ? (fromCache(await readCache(ctx, key), Date.now()) ?? null) : null;
  };
}

export const lookup = internalAction({
  args: { query: v.string() },
  returns: v.union(geoHit, v.null()),
  handler: (ctx, { query }) => nominatimGeocoder(ctx)(query),
});
