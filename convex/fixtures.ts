import { v } from "convex/values";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, type MutationCtx } from "./_generated/server";
import { ensureUser, writeGoing } from "./attendanceModel";
import { claimOf, endOf, membershipOf } from "./lib/connections";
import { isFixtureUrl, PAST_TEST_EVENT_ID, PAST_TEST_EVENT_TITLE } from "./lib/fixtures";
import { sourcesOf } from "./normalize/dedupe";
import { deleteEventRefs } from "./normalize/reassignEventRefs";

const BATCH = 100;
const HOUR = 3_600_000;
const FIXTURE_SOURCE = "cac-fixtures";
const MATCH_EVENT_ID = "cac-scout-test-match-event";
const MATCH_COMPANY = { name: "Scout Test Co", slug: "scout-test-co", domain: "scout-test.example" };
const MATCH_MEMBER_DEVICE = "fixture-scout-test-co-member";
const VERIFIED_BY = "fixture";

export const seedTalentMatch = mutation({
  args: { deviceId: v.string() },
  returns: v.object({ companyId: v.id("companies"), eventId: v.id("events"), memberDeviceId: v.string(), memberUserId: v.id("users") }),
  handler: async (ctx, { deviceId }) => {
    if (process.env.ENABLE_TEST_FIXTURES !== "1") throw new Error("seedTalentMatch requires ENABLE_TEST_FIXTURES=1");
    if (deviceId === MATCH_MEMBER_DEVICE) throw new Error("seedTalentMatch needs a talent device, not the fixture member");
    const userId = await ensureUser(ctx, deviceId);
    if ((await ctx.db.get(userId))!.role !== "student") throw new Error("seedTalentMatch needs a device whose user is a student");
    const now = Date.now();

    const company = await ctx.db.query("companies").withIndex("by_slug", (q) => q.eq("slug", MATCH_COMPANY.slug)).unique();
    const companyId = company?._id ?? await ctx.db.insert("companies", {
      ...MATCH_COMPANY, website: `https://${MATCH_COMPANY.domain}`, createdAt: now, verifiedAt: now, verifiedBy: VERIFIED_BY,
    });
    if (company && company.verifiedAt === undefined) await ctx.db.patch(companyId, { verifiedAt: now, verifiedBy: VERIFIED_BY });

    const member = await ctx.db.query("users").withIndex("by_device", (q) => q.eq("deviceId", MATCH_MEMBER_DEVICE)).unique();
    const memberUserId = member?._id ?? await ctx.db.insert("users", {
      deviceId: MATCH_MEMBER_DEVICE, role: "host", name: "Scout Test Co Recruiter", interests: ["startups"],
      city: "San Francisco", lat: 37.7749, lng: -122.4194, locationSource: "city", updatedAt: now,
      workEmail: `recruiter@${MATCH_COMPANY.domain}`, workDomain: MATCH_COMPANY.domain, workEmailVerifiedAt: now, workEmailVerifiedVia: "dev",
    });
    if (!await membershipOf(ctx, companyId, memberUserId)) await ctx.db.insert("company_members", { companyId, userId: memberUserId, role: "owner", createdAt: now });

    const existing = await ctx.db
      .query("events")
      .withIndex("by_source_sourceId", (q) => q.eq("source", FIXTURE_SOURCE).eq("sourceId", MATCH_EVENT_ID))
      .unique();
    const eventId = existing?._id ?? await ctx.db.insert("events", {
      title: "[TEST] Scout fixture demo day",
      description: "Synthetic test data for CAC end-to-end tests, not a real event. A past demo day hosted by Scout Test Co used to exercise talent interest and chat.",
      startTime: now - 28 * HOUR, endTime: now - 26 * HOUR, timezone: "America/Los_Angeles",
      venue: "CAC Test Venue", address: "1 Market St, San Francisco, CA 94105", lat: 37.7941, lng: -122.3951,
      city: "San Francisco", isOnline: false, url: `https://${MATCH_COMPANY.domain}/events/${MATCH_EVENT_ID}`,
      source: FIXTURE_SOURCE, sourceId: MATCH_EVENT_ID, organizer: MATCH_COMPANY.name, hosts: [MATCH_COMPANY.name], tags: ["test"],
      eventType: "demo_day", audience: ["students"], investorScore: 0, investorSignals: [], lastSeenAt: now, synthetic: true,
    });

    const claim = await claimOf(ctx, companyId, eventId);
    if (!claim) await ctx.db.insert("event_hosts", { eventId, companyId, claimedBy: memberUserId, status: "approved", createdAt: now });
    else if (claim.status === "pending") await ctx.db.patch(claim._id, { status: "approved" });

    const record = (await ctx.db.get((await writeGoing(ctx, userId, eventId, true))!))!;
    const event = (await ctx.db.get(eventId))!;
    if (record._creationTime >= endOf(event)) {
      const endTime = Math.floor(record._creationTime) + 1;
      await ctx.db.patch(eventId, { startTime: endTime - 2 * HOUR, endTime });
    }
    return { companyId, eventId, memberDeviceId: MATCH_MEMBER_DEVICE, memberUserId };
  },
});

async function purgeMatchCompany(ctx: MutationCtx) {
  const company = await ctx.db.query("companies").withIndex("by_slug", (q) => q.eq("slug", MATCH_COMPANY.slug)).unique();
  if (company?.verifiedBy === VERIFIED_BY) {
    const connections = await ctx.db.query("connections").withIndex("by_company_status", (q) => q.eq("companyId", company._id)).take(BATCH);
    for (const connection of connections) {
      for (const message of await ctx.db.query("messages").withIndex("by_connection", (q) => q.eq("connectionId", connection._id)).collect()) await ctx.db.delete(message._id);
      await ctx.db.delete(connection._id);
    }
    if (connections.length === BATCH) return true;
    const rows = await Promise.all([
      ctx.db.query("event_hosts").withIndex("by_company", (q) => q.eq("companyId", company._id)).collect(),
      ctx.db.query("company_members").withIndex("by_company", (q) => q.eq("companyId", company._id)).collect(),
      ctx.db.query("company_invites").withIndex("by_company", (q) => q.eq("companyId", company._id)).collect(),
      ctx.db.query("company_join_requests").withIndex("by_company", (q) => q.eq("companyId", company._id)).collect(),
    ]);
    for (const row of rows.flat()) await ctx.db.delete(row._id);
    await ctx.db.delete(company._id);
  }
  const member = await ctx.db.query("users").withIndex("by_device", (q) => q.eq("deviceId", MATCH_MEMBER_DEVICE)).unique();
  if (member) {
    const rows = await Promise.all([
      ctx.db.query("company_members").withIndex("by_user", (q) => q.eq("userId", member._id)).collect(),
      ctx.db.query("company_join_requests").withIndex("by_user", (q) => q.eq("userId", member._id)).collect(),
      ctx.db.query("email_verifications").withIndex("by_user", (q) => q.eq("userId", member._id)).collect(),
    ]);
    for (const row of rows.flat()) await ctx.db.delete(row._id);
    await ctx.db.delete(member._id);
  }
  return false;
}

export const seedPastCommitment = mutation({
  args: { deviceId: v.string() },
  returns: v.object({ eventId: v.id("events"), commitmentId: v.id("attendance") }),
  handler: async (ctx, { deviceId }) => {
    if (process.env.ENABLE_TEST_FIXTURES !== "1") throw new Error("seedPastCommitment requires ENABLE_TEST_FIXTURES=1");
    const userId = await ensureUser(ctx, deviceId);
    const existing = await ctx.db
      .query("events")
      .withIndex("by_source_sourceId", (q) => q.eq("source", FIXTURE_SOURCE).eq("sourceId", PAST_TEST_EVENT_ID))
      .unique();
    const now = Date.now();
    const eventId = existing?._id ?? await ctx.db.insert("events", {
      title: PAST_TEST_EVENT_TITLE,
      description: "Synthetic test data for CAC end-to-end tests, not a real event. A past evening hack night used to exercise the check-in card.",
      startTime: now - 28 * HOUR, endTime: now - 26 * HOUR, timezone: "America/Los_Angeles",
      venue: "CAC Test Venue", address: "1 Market St, San Francisco, CA 94105", lat: 37.7941, lng: -122.3951,
      city: "San Francisco", isOnline: false, url: `https://example.com/${PAST_TEST_EVENT_ID}`,
      source: FIXTURE_SOURCE, sourceId: PAST_TEST_EVENT_ID, organizer: "CAC test fixtures", hosts: [], tags: ["test"],
      eventType: "hackathon", audience: ["students"], investorScore: 0, investorSignals: [], lastSeenAt: now, synthetic: true,
    });
    const commitmentId = (await writeGoing(ctx, userId, eventId, true))!;
    return { eventId, commitmentId };
  },
});

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

    const more = events.length === BATCH || await purgeMatchCompany(ctx);
    if (more) await ctx.scheduler.runAfter(0, internal.fixtures.purgeSynthetic, {});
    return { ...counts, more };
  },
});
