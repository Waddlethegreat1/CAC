import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation } from "./_generated/server";
import { isFixtureUrl } from "./lib/fixtures";
import { sourcesOf } from "./normalize/dedupe";
import { deleteEventRefs } from "./normalize/reassignEventRefs";

const BATCH = 100;

export const purgeSynthetic = internalMutation({
  args: {},
  returns: v.object({ events: v.number(), rawListings: v.number(), linkSubmissions: v.number(), saves: v.number(), more: v.boolean() }),
  handler: async (ctx) => {
    if (process.env.ENABLE_TEST_FIXTURES !== "1") throw new Error("purgeSynthetic requires ENABLE_TEST_FIXTURES=1");
    const events = await ctx.db
      .query("events")
      .filter((q) => q.eq(q.field("synthetic"), true))
      .take(BATCH);
    const purged = new Set<Id<"events">>(events.map((e) => e._id));
    const counts = { events: 0, rawListings: 0, linkSubmissions: 0, saves: 0 };
    for (const event of events) {
      const removed = await deleteEventRefs(ctx, event._id);
      counts.saves += removed.saves;

      const listingIds = new Set<Id<"raw_listings">>(event.rawListingId ? [event.rawListingId] : []);
      for (const { source, sourceId } of sourcesOf(event)) {
        const listings = await ctx.db
          .query("raw_listings")
          .withIndex("by_source_sourceId", (q) => q.eq("source", source).eq("sourceId", sourceId))
          .collect();
        for (const listing of listings) listingIds.add(listing._id);
      }
      for (const id of listingIds) {
        if (!(await ctx.db.get(id))) continue;
        await ctx.db.delete(id);
        counts.rawListings++;
      }
      await ctx.db.delete(event._id);
      counts.events++;
    }

    for (const submission of await ctx.db.query("link_submissions").collect()) {
      const remaining = submission.eventIds.filter((id) => !purged.has(id));
      if (isFixtureUrl(submission.url)) {
        await ctx.db.delete(submission._id);
        counts.linkSubmissions++;
      } else if (remaining.length !== submission.eventIds.length) {
        await ctx.db.patch(submission._id, { eventIds: remaining });
      }
    }

    const more = events.length === BATCH;
    if (more) await ctx.scheduler.runAfter(0, internal.fixtures.purgeSynthetic, {});
    return { ...counts, more };
  },
});
