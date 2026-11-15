import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { DEFAULT_FEEDS } from "../adapters";
import type { NormalizedEvent } from "../normalize";
import { dedupeKey, findDuplicate, mergeEvents, sourceOf, sourcesOf, unionSources, type EventSource } from "../normalize/dedupe";
import { isFixtureUrl } from "./fixtures";
import { INTERESTS } from "./interests";
import { scoutingFields } from "./scouting";
import type { RawEvent } from "./rawEvent";

export async function upsertRawListing(ctx: MutationCtx, raw: RawEvent, feedId?: Id<"feeds">) {
  const now = Date.now();
  const existing = await ctx.db
    .query("raw_listings")
    .withIndex("by_source_sourceId", (q) => q.eq("source", raw.source).eq("sourceId", raw.sourceId))
    .unique();
  if (existing) {
    await ctx.db.replace(existing._id, { feedId, source: raw.source, sourceId: raw.sourceId, raw, fetchedAt: now });
    return existing._id;
  }
  return ctx.db.insert("raw_listings", { feedId, source: raw.source, sourceId: raw.sourceId, raw, fetchedAt: now });
}

export function eventDoc(event: NormalizedEvent, sources: EventSource[], rawListingId?: Id<"raw_listings">) {
  const synthetic = isFixtureUrl(event.url) || sources.some((s) => isFixtureUrl(s.url) || isFixtureUrl(s.sourceId));
  return {
    ...event,
    ...scoutingFields(event),
    rawListingId,
    lastSeenAt: Date.now(),
    dedupeKey: dedupeKey(event),
    sources,
    ...(synthetic ? { synthetic } : {}),
  };
}

export function mergeInto(
  existing: Doc<"events">,
  event: NormalizedEvent,
  rawListingId?: Id<"raw_listings">,
  incoming: EventSource[] = [sourceOf(event)],
) {
  const sources = unionSources(sourcesOf(existing), incoming);
  const isPrimary = existing.source === event.source && existing.sourceId === event.sourceId;
  if (sources.length === 1) return eventDoc(event, sources, rawListingId ?? existing.rawListingId);
  const merged = isPrimary ? mergeEvents(event, existing) : mergeEvents(existing, event);
  return eventDoc(merged, sources, isPrimary ? (rawListingId ?? existing.rawListingId) : (existing.rawListingId ?? rawListingId));
}

export type UpsertResult = { id: Id<"events">; created: boolean; merged: boolean };

export async function upsertEvent(ctx: MutationCtx, event: NormalizedEvent, rawListingId?: Id<"raw_listings">): Promise<UpsertResult> {
  const existing = await findDuplicate(ctx, event);
  if (!existing) return { id: await ctx.db.insert("events", eventDoc(event, [sourceOf(event)], rawListingId)), created: true, merged: false };
  await ctx.db.replace(existing._id, mergeInto(existing, event, rawListingId));
  return { id: existing._id, created: false, merged: existing.source !== event.source || existing.sourceId !== event.sourceId };
}

export async function ensureDefaults(ctx: MutationCtx) {
  for (const feed of DEFAULT_FEEDS) {
    const existing = await ctx.db
      .query("feeds")
      .withIndex("by_url", (q) => q.eq("url", feed.url))
      .unique();
    if (!existing) await ctx.db.insert("feeds", { ...feed, enabled: feed.enabled ?? true });
  }
  for (const [order, interest] of INTERESTS.entries()) {
    const existing = await ctx.db
      .query("interests")
      .withIndex("by_slug", (q) => q.eq("slug", interest.id))
      .unique();
    const doc = { slug: interest.id, label: interest.label, emoji: interest.emoji, order };
    if (existing) await ctx.db.replace(existing._id, doc);
    else await ctx.db.insert("interests", doc);
  }
}
