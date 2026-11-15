import { v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { ended, eventDoc, investors, MAX_COMMITMENTS, recordFor, recordsFor, saveResponse, userFor, writeGoing } from "./attendanceModel";

export const mine = query({
  args: { deviceId: v.string() },
  returns: v.array(v.object({
    eventId: v.id("events"), going: v.boolean(), attended: v.optional(v.boolean()),
    rating: v.optional(v.number()), investors: v.optional(investors), note: v.optional(v.string()),
  })),
  handler: async (ctx, { deviceId }) => {
    const user = await userFor(ctx, deviceId);
    if (!user) return [];
    return (await recordsFor(ctx, user._id)).map(({ eventId, going, attended, rating, investors, note }) => ({
      eventId, going, ...(attended === undefined ? {} : { attended }),
      ...(rating === undefined ? {} : { rating }), ...(investors === undefined ? {} : { investors }),
      ...(note === undefined ? {} : { note }),
    }));
  },
});

export const setGoing = mutation({
  args: { deviceId: v.string(), eventId: v.id("events"), going: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { deviceId, eventId, going }) => {
    const user = await userFor(ctx, deviceId);
    if (!user) throw new Error("Finish onboarding before committing to events");
    if (!await ctx.db.get(eventId)) throw new Error("Event not found");
    await writeGoing(ctx, user._id, eventId, going);
    return null;
  },
});

export const pending = query({
  args: { deviceId: v.string(), now: v.number() },
  returns: v.array(eventDoc),
  handler: async (ctx, { deviceId, now }) => {
    if (!Number.isFinite(now)) throw new Error("Invalid time");
    const user = await userFor(ctx, deviceId);
    if (!user) return [];
    const records = await ctx.db.query("attendance").withIndex("by_user_going", (q) => q.eq("userId", user._id).eq("going", true)).take(MAX_COMMITMENTS);
    const events = await Promise.all(records.filter((r) => r.attended === undefined && r.dismissedAt === undefined).map((r) => ctx.db.get(r.eventId)));
    return events.filter((e) => e !== null).filter((e) => ended(e, Math.min(now, Date.now()))).sort((a, b) => a.startTime - b.startTime);
  },
});

export const dismiss = mutation({
  args: { deviceId: v.string(), eventId: v.id("events") },
  returns: v.null(),
  handler: async (ctx, { deviceId, eventId }) => {
    const user = await userFor(ctx, deviceId);
    if (!user) throw new Error("Finish onboarding before dismissing events");
    const record = await recordFor(ctx, user._id, eventId);
    const event = await ctx.db.get(eventId);
    if (!record?.going || !event || !ended(event, Date.now())) throw new Error("An ended commitment is required");
    if (record.dismissedAt === undefined) await ctx.db.patch(record._id, { dismissedAt: Date.now() });
    return null;
  },
});

export const respond = mutation({
  args: {
    deviceId: v.string(), eventId: v.id("events"), attended: v.boolean(),
    rating: v.optional(v.number()), investors: v.optional(investors), note: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { deviceId, eventId, ...response }) => {
    const user = await userFor(ctx, deviceId);
    if (!user) throw new Error("Finish onboarding before responding");
    const record = await recordFor(ctx, user._id, eventId);
    const event = await ctx.db.get(eventId);
    if (!record?.going || !event || !ended(event, Date.now())) throw new Error("An ended commitment is required");
    if (response.rating !== undefined && (!Number.isInteger(response.rating) || response.rating < 1 || response.rating > 5)) throw new Error("Rating must be an integer from 1 to 5");
    if (response.attended && (response.rating === undefined || response.investors === undefined)) throw new Error("Attendance requires a rating and investor response");
    if (!response.attended && (response.rating !== undefined || response.investors !== undefined)) throw new Error("Only attendees can rate or report investors");
    if (response.note !== undefined && (Array.from(response.note).length > 240 || /[\r\n\u0085\u2028\u2029]/u.test(response.note))) throw new Error("Note must be one line of at most 240 characters");
    await saveResponse(ctx, record, response);
    return null;
  },
});

export const history = query({
  args: { deviceId: v.string() },
  returns: v.array(v.object({ event: eventDoc, rating: v.union(v.number(), v.null()), note: v.union(v.string(), v.null()), investors: v.union(investors, v.null()) })),
  handler: async (ctx, { deviceId }) => {
    const user = await userFor(ctx, deviceId);
    if (!user) return [];
    const records = await ctx.db.query("attendance").withIndex("by_user_attended", (q) => q.eq("userId", user._id).eq("attended", true)).take(MAX_COMMITMENTS);
    const rows = await Promise.all(records.map(async (r) => {
      const event = await ctx.db.get(r.eventId);
      return event ? { event, rating: r.rating ?? null, note: r.note ?? null, investors: r.investors ?? null } : null;
    }));
    return rows.filter((r) => r !== null).sort((a, b) => b.event.startTime - a.event.startTime);
  },
});

export const aggregate = query({
  args: { eventId: v.id("events") },
  returns: v.union(v.null(), v.object({ ratingCount: v.number(), averageWorthIt: v.number(), investorConfirmations: v.number() })),
  handler: async (ctx, { eventId }) => {
    const totals = await ctx.db.query("attendance_totals").withIndex("by_event", (q) => q.eq("eventId", eventId)).unique();
    if (!totals || totals.ratingCount < 3) return null;
    return { ratingCount: totals.ratingCount, averageWorthIt: totals.ratingSum / totals.ratingCount, investorConfirmations: totals.investorConfirmations };
  },
});

export const goingForUser = internalQuery({
  args: { userId: v.id("users") },
  returns: v.array(eventDoc),
  handler: async (ctx, { userId }) => {
    const records = await ctx.db.query("attendance").withIndex("by_user_going", (q) => q.eq("userId", userId).eq("going", true)).take(MAX_COMMITMENTS);
    const events = await Promise.all(records.map((r) => ctx.db.get(r.eventId)));
    return events.filter((e) => e !== null);
  },
});
