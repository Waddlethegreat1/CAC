import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { CONTACT_FIELDS, checkContactField } from "./lib/contact";
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
    radiusKm: v.optional(v.number()),
    name: v.optional(v.string()),
    email: v.optional(v.string()),
    phone: v.optional(v.string()),
    affiliation: v.optional(v.string()),
    linkedin: v.optional(v.string()),
  },
  returns: v.id("users"),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("users")
      .withIndex("by_device", (q) => q.eq("deviceId", args.deviceId))
      .unique();
    const doc = { ...args, radiusKm: args.radiusKm ?? existing?.radiusKm, updatedAt: Date.now() };
    for (const field of CONTACT_FIELDS) {
      const raw = args[field];
      if (raw === undefined) {
        doc[field] = existing?.[field];
        continue;
      }
      const result = checkContactField(field, raw);
      if ("error" in result) throw new ConvexError({ field, message: result.error });
      doc[field] = result.value || undefined;
    }
    if (existing) {
      await ctx.db.replace(existing._id, doc);
      return existing._id;
    }
    return ctx.db.insert("users", doc);
  },
});
