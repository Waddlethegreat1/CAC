import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { DEFAULT_FEEDS } from "../adapters";
import type { NormalizedEvent } from "../normalize";
import { INTERESTS } from "./interests";
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

export async function upsertEvent(ctx: MutationCtx, event: NormalizedEvent, rawListingId?: Id<"raw_listings">) {
  const existing = await ctx.db
    .query("events")
    .withIndex("by_source_sourceId", (q) => q.eq("source", event.source).eq("sourceId", event.sourceId))
    .unique();
  const doc = { ...event, rawListingId, lastSeenAt: Date.now() };
  if (existing) {
    await ctx.db.replace(existing._id, doc);
    return existing._id;
  }
  return ctx.db.insert("events", doc);
}

export async function ensureDefaults(ctx: MutationCtx) {
  for (const feed of DEFAULT_FEEDS) {
    const existing = await ctx.db
      .query("feeds")
      .withIndex("by_url", (q) => q.eq("url", feed.url))
      .unique();
    if (!existing) await ctx.db.insert("feeds", { ...feed, enabled: true });
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
