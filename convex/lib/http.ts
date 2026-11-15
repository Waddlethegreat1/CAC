import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalMutation, internalQuery, type ActionCtx } from "../_generated/server";
import type { Http } from "./adapter";
import { ROBOTS_USER_AGENT, isAllowed } from "./robots";

export const USER_AGENT = `${ROBOTS_USER_AGENT}/0.1 (+https://github.com/waddlethegreat1/cac)`;
export const DOMAIN_INTERVAL_MS = 1000;
export const ROBOTS_TTL_MS = 24 * 60 * 60 * 1000;
export const ROBOTS_ERROR_TTL_MS = 10 * 60 * 1000;
const DISALLOW_ALL = "User-agent: *\nDisallow: /\n";

export class RobotsDisallowedError extends Error {
  constructor(url: string) {
    super(`robots.txt disallows ${url}`);
    this.name = "RobotsDisallowedError";
  }
}

export const getRobots = internalQuery({
  args: { domain: v.string() },
  handler: async (ctx, { domain }) =>
    ctx.db
      .query("robots_cache")
      .withIndex("by_domain", (q) => q.eq("domain", domain))
      .unique(),
});

export const putRobots = internalMutation({
  args: { domain: v.string(), body: v.string(), ttlMs: v.number() },
  handler: async (ctx, { domain, body, ttlMs }) => {
    const now = Date.now();
    const row = { domain, body, fetchedAt: now, expiresAt: now + ttlMs };
    const existing = await ctx.db
      .query("robots_cache")
      .withIndex("by_domain", (q) => q.eq("domain", domain))
      .unique();
    if (existing) await ctx.db.replace(existing._id, row);
    else await ctx.db.insert("robots_cache", row);
  },
});

export const reserveSlot = internalMutation({
  args: { domain: v.string() },
  returns: v.number(),
  handler: async (ctx, { domain }) => {
    const now = Date.now();
    const existing = await ctx.db
      .query("domain_rate")
      .withIndex("by_domain", (q) => q.eq("domain", domain))
      .unique();
    const at = Math.max(now, existing?.nextAllowedAt ?? 0);
    const nextAllowedAt = at + DOMAIN_INTERVAL_MS;
    if (existing) await ctx.db.patch(existing._id, { nextAllowedAt });
    else await ctx.db.insert("domain_rate", { domain, nextAllowedAt });
    return at;
  },
});

export function makeHttp(ctx: ActionCtx): Http {
  const throttledFetch = async (url: string, accept: string) => {
    const domain = new URL(url).host;
    const at = await ctx.runMutation(internal.lib.http.reserveSlot, { domain });
    const wait = at - Date.now();
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
    return fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: accept } });
  };

  const robotsFor = async (url: string) => {
    const { host, origin } = new URL(url);
    const cached = await ctx.runQuery(internal.lib.http.getRobots, { domain: host });
    if (cached && cached.expiresAt > Date.now()) return cached.body;
    let body: string;
    let ttlMs = ROBOTS_TTL_MS;
    try {
      const res = await throttledFetch(`${origin}/robots.txt`, "text/plain");
      if (res.ok) body = await res.text();
      else if (res.status >= 400 && res.status < 500) body = "";
      else {
        body = DISALLOW_ALL;
        ttlMs = ROBOTS_ERROR_TTL_MS;
      }
    } catch {
      body = DISALLOW_ALL;
      ttlMs = ROBOTS_ERROR_TTL_MS;
    }
    await ctx.runMutation(internal.lib.http.putRobots, { domain: host, body, ttlMs });
    return body;
  };

  return {
    async text(url, accept = "*/*") {
      if (!isAllowed(await robotsFor(url), url)) throw new RobotsDisallowedError(url);
      const res = await throttledFetch(url, accept);
      if (!res.ok) throw new Error(`${url} responded ${res.status}`);
      return res.text();
    },
  };
}
