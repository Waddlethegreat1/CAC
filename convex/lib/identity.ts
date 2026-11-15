import { ConvexError } from "convex/values";
import type { QueryCtx } from "../_generated/server";

export const callerFor = (ctx: QueryCtx, deviceId: string) =>
  ctx.db.query("users").withIndex("by_device", (q) => q.eq("deviceId", deviceId)).unique();

export async function requireCaller(ctx: QueryCtx, deviceId: string) {
  const user = await callerFor(ctx, deviceId);
  if (!user) throw new ConvexError({ code: "not_onboarded", message: "Finish onboarding first" });
  return user;
}
