import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc } from "./_generated/dataModel";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { ADAPTERS } from "./adapters";
import { basicHttp } from "./lib/http";
import { rawEvent } from "./lib/rawEvent";
import { ensureDefaults, upsertEvent, upsertRawListing } from "./lib/store";
import { normalize } from "./normalize";
import { normalizedEvent } from "./schema";

const BATCH = 50;

export const ensureFeeds = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    await ensureDefaults(ctx);
    return null;
  },
});

export const getFeed = internalQuery({
  args: { feedId: v.id("feeds") },
  handler: (ctx, { feedId }) => ctx.db.get(feedId),
});

export const listFeeds = internalQuery({
  args: {},
  handler: (ctx) => ctx.db.query("feeds").collect(),
});

export const store = internalMutation({
  args: {
    feedId: v.id("feeds"),
    items: v.array(v.object({ raw: rawEvent, event: v.union(normalizedEvent, v.null()) })),
  },
  returns: v.null(),
  handler: async (ctx, { feedId, items }) => {
    for (const { raw, event } of items) {
      const rawListingId = await upsertRawListing(ctx, raw, feedId);
      if (event) await upsertEvent(ctx, event, rawListingId);
    }
    return null;
  },
});

export const logFetch = internalMutation({
  args: {
    feedId: v.id("feeds"),
    startedAt: v.number(),
    status: v.union(v.literal("ok"), v.literal("error")),
    rawCount: v.number(),
    insertedCount: v.number(),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const finishedAt = Date.now();
    await ctx.db.insert("fetch_log", { ...args, finishedAt, durationMs: finishedAt - args.startedAt });
    const feed = await ctx.db.get(args.feedId);
    if (!feed) return null;
    await ctx.db.patch(args.feedId, {
      lastFetchedAt: finishedAt,
      nextFetchAt: finishedAt + feed.intervalMinutes * 60_000,
      lastStatus: args.status,
    });
    return null;
  },
});

export const runFeed = internalAction({
  args: { feedId: v.id("feeds") },
  returns: v.object({ fetched: v.number(), kept: v.number() }),
  handler: async (ctx, { feedId }): Promise<{ fetched: number; kept: number }> => {
    const feed: Doc<"feeds"> | null = await ctx.runQuery(internal.ingest.getFeed, { feedId });
    if (!feed) throw new Error(`Unknown feed ${feedId}`);
    const adapter = ADAPTERS[feed.source];
    if (!adapter) throw new Error(`No adapter for source ${feed.source}`);
    const startedAt = Date.now();
    try {
      const raws = await adapter.fetch(feed, basicHttp);
      const items = await Promise.all(raws.map(async (raw) => ({ raw, event: await normalize(raw) })));
      for (let i = 0; i < items.length; i += BATCH) {
        await ctx.runMutation(internal.ingest.store, { feedId, items: items.slice(i, i + BATCH) });
      }
      const kept = items.filter((i) => i.event).length;
      await ctx.runMutation(internal.ingest.logFetch, { feedId, startedAt, status: "ok", rawCount: raws.length, insertedCount: kept });
      return { fetched: raws.length, kept };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      await ctx.runMutation(internal.ingest.logFetch, { feedId, startedAt, status: "error", rawCount: 0, insertedCount: 0, error });
      throw err;
    }
  },
});

export const runDue = internalAction({
  args: { force: v.optional(v.boolean()) },
  returns: v.array(v.string()),
  handler: async (ctx, { force }): Promise<string[]> => {
    await ctx.runMutation(internal.ingest.ensureFeeds, {});
    const feeds: Doc<"feeds">[] = await ctx.runQuery(internal.ingest.listFeeds, {});
    const now = Date.now();
    const due = feeds.filter((f) => f.enabled && (force || (f.lastFetchedAt ?? 0) + f.intervalMinutes * 60_000 <= now));
    for (const [i, feed] of due.entries()) {
      await ctx.scheduler.runAfter(i * 2000, internal.ingest.runFeed, { feedId: feed._id });
    }
    return due.map((f) => f.name);
  },
});
