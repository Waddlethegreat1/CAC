import { v, type Infer } from "convex/values";
import { internal } from "../_generated/api";
import type { Doc } from "../_generated/dataModel";
import { internalAction, internalMutation, internalQuery, type QueryCtx } from "../_generated/server";
import { parseEventPage } from "../adapters/jsonld";
import { RobotsDisallowedError, makeHttp } from "../lib/http";
import { scoutingFields } from "../lib/scouting";
import { markListingsGone } from "../lib/store";
import { eventPlace } from "../schema";
import { locate, type NormalizedEvent } from ".";
import { dedupeKey, pickEvent } from "./dedupe";
import { nominatimGeocoder } from "./geocode";

export const MAX_ENRICH_FETCHES = 40;
export const NONE_TTL_MS = 3 * 86_400_000;
export const ERROR_TTL_MS = 6 * 3600_000;

const ENRICH_HOST = /(^|\.)(luma\.com|lu\.ma|meetup\.com)$/i;
const PLACEHOLDER_PLACE = /\b(register|sign in|log in|rsvp|approved|to see (the )?(address|location))\b|^(tba|tbd)$/i;

export type EventPlace = Infer<typeof eventPlace>;

export const enrichTarget = v.object({ url: v.string(), source: v.string(), sourceId: v.string() });
export type EnrichTarget = Infer<typeof enrichTarget>;

const pageStatus = v.union(v.literal("found"), v.literal("none"), v.literal("error"));

export function isEnrichable(url: string): boolean {
  try {
    return ENRICH_HOST.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

export const needsPlace = (e: Pick<NormalizedEvent, "isOnline" | "lat" | "address">) => !e.isOnline && e.lat === undefined && !e.address;

export function isFresh(page: Doc<"event_pages">, now: number): boolean {
  if (page.status === "none") return now - page.fetchedAt < NONE_TTL_MS;
  if (page.status === "error") return now - page.fetchedAt < ERROR_TTL_MS;
  return true;
}

export async function readPage(ctx: Pick<QueryCtx, "db">, url: string) {
  const page = await ctx.db
    .query("event_pages")
    .withIndex("by_url", (q) => q.eq("url", url))
    .unique();
  return page && isFresh(page, Date.now()) ? page : null;
}

export const getPage = internalQuery({
  args: { url: v.string() },
  handler: (ctx, { url }) => readPage(ctx, url),
});

export const putPage = internalMutation({
  args: {
    url: v.string(),
    status: pageStatus,
    place: v.optional(eventPlace),
    outsideBayArea: v.optional(v.boolean()),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, page) => {
    const row = { ...page, fetchedAt: Date.now() };
    const existing = await ctx.db
      .query("event_pages")
      .withIndex("by_url", (q) => q.eq("url", page.url))
      .unique();
    if (existing) await ctx.db.replace(existing._id, row);
    else await ctx.db.insert("event_pages", row);
    return null;
  },
});

export const apply = internalMutation({
  args: enrichTarget,
  returns: v.union(v.literal("placed"), v.literal("dropped"), v.literal("skipped")),
  handler: async (ctx, { url, source, sourceId }) => {
    const page = await readPage(ctx, url);
    if (page?.status !== "found") return "skipped";
    const event = await ctx.db
      .query("events")
      .withIndex("by_source_sourceId", (q) => q.eq("source", source).eq("sourceId", sourceId))
      .first();
    if (!event || !needsPlace(event)) return "skipped";
    if (page.outsideBayArea) {
      const listing = await ctx.db
        .query("raw_listings")
        .withIndex("by_source_sourceId", (q) => q.eq("source", source).eq("sourceId", sourceId))
        .unique();
      if (listing) await markListingsGone(ctx, [listing._id]);
      return "dropped";
    }
    if (!page.place) return "skipped";
    const updated = { ...pickEvent(event), ...page.place };
    await ctx.db.patch(event._id, { ...page.place, ...scoutingFields(updated), dedupeKey: dedupeKey(updated) });
    return "placed";
  },
});

export const run = internalAction({
  args: { targets: v.array(enrichTarget), maxFetches: v.optional(v.number()) },
  returns: v.object({ fetched: v.number(), placed: v.number(), dropped: v.number(), deferred: v.number() }),
  handler: async (ctx, { targets, maxFetches = MAX_ENRICH_FETCHES }) => {
    const http = makeHttp(ctx);
    const geocode = nominatimGeocoder(ctx);
    const counts = { fetched: 0, placed: 0, dropped: 0, deferred: 0 };
    const fetchedUrls = new Set<string>();

    const fetchPage = async (url: string) => {
      try {
        const events = parseEventPage(await http.text(url, "text/html"), url);
        const loc = (events.find((e) => sameUrl(e.url, url)) ?? events[0])?.location;
        if (!loc || loc.online) return { url, status: "none" as const };
        const name = loc.name && !PLACEHOLDER_PLACE.test(loc.name) ? loc.name : undefined;
        const address = loc.address && !PLACEHOLDER_PLACE.test(loc.address) ? loc.address : undefined;
        const located = await locate({ ...loc, name, address }, geocode);
        if (!located) return { url, status: "found" as const, outsideBayArea: true };
        if (located.lat === undefined && !address && !name) return { url, status: "none" as const };
        const place = Object.fromEntries(
          Object.entries({ venue: name, address, lat: located.lat, lng: located.lng, city: located.city }).filter(([, x]) => x !== undefined),
        ) as EventPlace;
        return { url, status: "found" as const, place };
      } catch (err) {
        const error = err instanceof RobotsDisallowedError ? "robots.txt disallows the page" : err instanceof Error ? err.message : String(err);
        return { url, status: "error" as const, error: error.slice(0, 300) };
      }
    };

    for (const target of targets) {
      const cached = await ctx.runQuery(internal.normalize.enrich.getPage, { url: target.url });
      if (!cached && !fetchedUrls.has(target.url)) {
        if (counts.fetched >= maxFetches) {
          counts.deferred++;
          continue;
        }
        fetchedUrls.add(target.url);
        counts.fetched++;
        await ctx.runMutation(internal.normalize.enrich.putPage, await fetchPage(target.url));
      }
      const outcome = await ctx.runMutation(internal.normalize.enrich.apply, target);
      if (outcome === "placed") counts.placed++;
      if (outcome === "dropped") counts.dropped++;
    }
    console.log(`enrich ${JSON.stringify(counts)}`);
    return counts;
  },
});

function sameUrl(a: string, b: string): boolean {
  const strip = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/[?#].*$/, "").replace(/\/$/, "");
  return strip(a) === strip(b);
}
