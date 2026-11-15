import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { role } from "./schema";

export const get = query({
  args: { deviceId: v.string() },
  handler: (ctx, { deviceId }) =>
    ctx.db
      .query("users")
      .withIndex("by_device", (q) => q.eq("deviceId", deviceId))
      .unique(),
});

export const upsert = mutation({
  args: {
    deviceId: v.string(),
    role,
    interests: v.array(v.string()),
    city: v.string(),
    lat: v.number(),
    lng: v.number(),
    locationSource: v.union(v.literal("device"), v.literal("city")),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_device", (q) => q.eq("deviceId", args.deviceId))
      .unique();
    const doc = { ...args, updatedAt: Date.now() };
    if (existing) {
      await ctx.db.replace(existing._id, doc);
      return existing._id;
    }
    return ctx.db.insert("users", doc);
  },
});
