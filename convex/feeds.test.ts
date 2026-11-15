import { convexTest } from "convex-test";
import { afterEach, describe, expect, test, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { isAllowed } from "./lib/robots";
import { resolveAdapter } from "./adapters";
import { icalAdapter } from "./adapters/ical";
import { jsonldAdapter } from "./adapters/jsonld";
import stubEvents from "../fixtures/fixture/events.json";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);
const MINUTE = 60_000;

const stubFeed = { source: "fixture", name: "Stub", url: "https://example.test/events.json", intervalMinutes: 60 };

function stubFetch(routes: Record<string, { status?: number; body: string }>) {
  const calls: { url: string; at: number }[] = [];
  const fn = vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    calls.push({ url, at: Date.now() });
    const route = routes[url];
    if (!route) return new Response("not found", { status: 404 });
    return new Response(route.body, { status: route.status ?? 200 });
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("seed loader", () => {
  test("upserts by url and is idempotent", async () => {
    const t = convexTest(schema, modules);
    const feeds = [stubFeed, { source: "luma", name: "Luma SF", url: "https://luma.com/sf" }];
    expect(await t.mutation(internal.feeds.seed, { feeds })).toEqual({ inserted: 2, updated: 0, unchanged: 0, disabled: 0 });
    expect(await t.mutation(internal.feeds.seed, { feeds })).toEqual({ inserted: 0, updated: 0, unchanged: 2, disabled: 0 });
    const renamed = [{ ...stubFeed, name: "Stub renamed" }];
    expect(await t.mutation(internal.feeds.seed, { feeds: renamed })).toEqual({ inserted: 0, updated: 1, unchanged: 0, disabled: 0 });
    const rows = await t.run((ctx) => ctx.db.query("feeds").collect());
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.source === "luma")?.intervalMinutes).toBe(360);
    expect(await t.mutation(internal.feeds.seed, { feeds: [], disableSources: ["luma"] })).toMatchObject({ disabled: 1 });
    const luma = await t.run((ctx) => ctx.db.query("feeds").withIndex("by_source", (q) => q.eq("source", "luma")).unique());
    expect(luma?.enabled).toBe(false);
  });
});

describe("adapter registry", () => {
  test("resolves by source first, then by tier", () => {
    expect(resolveAdapter({ source: "ical", tier: "feed" })).toBe(icalAdapter);
    expect(resolveAdapter({ source: "html", tier: "JSON-LD" })).toBe(jsonldAdapter);
    expect(resolveAdapter({ source: "html", tier: "extraction" })).toBeUndefined();
  });
});

describe("due-feed selection", () => {
  test("tick claims only enabled feeds whose nextFetchAt has passed", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
    const t = convexTest(schema, modules);
    const now = Date.now();
    const [due, future, disabled, legacy] = await t.run(async (ctx) => [
      await ctx.db.insert("feeds", { ...stubFeed, enabled: true, nextFetchAt: now - MINUTE }),
      await ctx.db.insert("feeds", { ...stubFeed, url: "https://example.test/b", enabled: true, nextFetchAt: now + MINUTE }),
      await ctx.db.insert("feeds", { ...stubFeed, url: "https://example.test/c", enabled: false, nextFetchAt: now - MINUTE }),
      await ctx.db.insert("feeds", { ...stubFeed, url: "https://example.test/d", enabled: true }),
    ]);
    await t.mutation(internal.ingest.runDue, {});
    const claimed = (await t.run((ctx) => ctx.db.system.query("_scheduled_functions").collect())).map(
      (s) => s.args[0].feedId,
    );
    expect(new Set(claimed)).toEqual(new Set([due, legacy]));
    expect(claimed).not.toContain(future);
    expect(claimed).not.toContain(disabled);

    const claimedRow = await t.run((ctx) => ctx.db.get(due));
    expect(claimedRow?.nextFetchAt).toBe(now + 60 * MINUTE);
    expect(await t.mutation(internal.ingest.runDue, {})).toEqual([]);
    vi.setSystemTime(now + 61 * MINUTE);
    expect(await t.mutation(internal.ingest.runDue, {})).toHaveLength(3);
  });

  test("runFeed stores raw listings, logs the fetch and reschedules", async () => {
    const t = convexTest(schema, modules);
    const calls = stubFetch({
      "https://example.test/robots.txt": { body: "User-agent: *\nDisallow: /private\n" },
      "https://example.test/events.json": { body: JSON.stringify(stubEvents) },
    });
    const feedId = await t.run((ctx) => ctx.db.insert("feeds", { ...stubFeed, enabled: true, nextFetchAt: 0 }));
    await t.action(internal.ingest.runFeed, { feedId });
    await t.action(internal.ingest.runFeed, { feedId });

    expect(calls.map((c) => c.url)).toEqual([
      "https://example.test/robots.txt",
      "https://example.test/events.json",
      "https://example.test/events.json",
    ]);
    const listings = await t.run((ctx) => ctx.db.query("raw_listings").collect());
    expect(listings.map((l) => l.sourceId).sort()).toEqual(["fixture-1", "fixture-2"]);
    const logs = await t.query(internal.feeds.recentFetches, { feedId });
    expect(logs.map((l) => [l.status, l.rawCount, l.insertedCount])).toEqual([
      ["ok", 2, 2],
      ["ok", 2, 2],
    ]);
    expect(logs[0].durationMs).toBeGreaterThanOrEqual(0);
    const feed = await t.run((ctx) => ctx.db.get(feedId));
    expect(feed?.lastStatus).toBe("ok");
    expect(feed!.nextFetchAt!).toBeGreaterThan(Date.now() + 59 * MINUTE);
  });

  test("a feed with no adapter is logged as an error", async () => {
    const t = convexTest(schema, modules);
    const feedId = await t.run((ctx) =>
      ctx.db.insert("feeds", { ...stubFeed, source: "nope", enabled: true, nextFetchAt: 0 }),
    );
    await t.action(internal.ingest.runFeed, { feedId });
    const [log] = await t.query(internal.feeds.recentFetches, { feedId });
    expect(log.status).toBe("error");
    expect(log.error).toContain("No adapter for source nope");
  });
});

describe("robots.txt", () => {
  test("parser honours groups, longest match, wildcards and allow ties", () => {
    const body = [
      "User-agent: *",
      "Disallow: /admin",
      "Disallow: /*.pdf$",
      "Allow: /admin/public",
      "",
      "User-agent: CAC-EventsBot",
      "Disallow: /events/private",
    ].join("\n");
    expect(isAllowed(body, "https://x.test/events/private/1")).toBe(false);
    expect(isAllowed(body, "https://x.test/admin")).toBe(true);
    expect(isAllowed(body, "https://x.test/admin", "OtherBot")).toBe(false);
    expect(isAllowed(body, "https://x.test/admin/public/a", "OtherBot")).toBe(true);
    expect(isAllowed(body, "https://x.test/a/b.pdf", "OtherBot")).toBe(false);
    expect(isAllowed(body, "https://x.test/a/b.pdf?x=1", "OtherBot")).toBe(true);
    expect(isAllowed("User-agent: *\nDisallow:\n", "https://x.test/anything")).toBe(true);
    expect(isAllowed("", "https://x.test/anything")).toBe(true);
  });

  test("a disallowed feed is skipped without fetching the page", async () => {
    const t = convexTest(schema, modules);
    const calls = stubFetch({
      "https://example.test/robots.txt": { body: "User-agent: *\nDisallow: /events\n" },
      "https://example.test/events.json": { body: JSON.stringify(stubEvents) },
    });
    const feedId = await t.run((ctx) => ctx.db.insert("feeds", { ...stubFeed, enabled: true, nextFetchAt: 0 }));
    await t.action(internal.ingest.runFeed, { feedId });
    expect(calls.map((c) => c.url)).toEqual(["https://example.test/robots.txt"]);
    const [log] = await t.query(internal.feeds.recentFetches, { feedId });
    expect(log.status).toBe("skipped_robots");
    expect(await t.run((ctx) => ctx.db.query("raw_listings").collect())).toHaveLength(0);
  });

  test("the cache is reused until its TTL expires, and a 5xx disallows everything", async () => {
    const t = convexTest(schema, modules);
    const calls = stubFetch({ "https://example.test/robots.txt": { status: 503, body: "down" } });
    const feedId = await t.run((ctx) => ctx.db.insert("feeds", { ...stubFeed, enabled: true, nextFetchAt: 0 }));
    await t.action(internal.ingest.runFeed, { feedId });
    await t.action(internal.ingest.runFeed, { feedId });
    expect(calls.map((c) => c.url)).toEqual(["https://example.test/robots.txt"]);
    const logs = await t.query(internal.feeds.recentFetches, { feedId });
    expect(logs.map((l) => l.status)).toEqual(["skipped_robots", "skipped_robots"]);

    await t.run(async (ctx) => {
      const row = await ctx.db.query("robots_cache").unique();
      await ctx.db.patch(row!._id, { expiresAt: Date.now() - 1 });
    });
    await t.action(internal.ingest.runFeed, { feedId });
    expect(calls.filter((c) => c.url.endsWith("/robots.txt"))).toHaveLength(2);
  });
});

describe("per-domain rate limiter", () => {
  test("reserves one slot per second per domain, independent across domains", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
    const t = convexTest(schema, modules);
    const now = Date.now();
    const slots = [];
    for (let i = 0; i < 3; i++) slots.push(await t.mutation(internal.lib.http.reserveSlot, { domain: "a.test" }));
    expect(slots[1] - slots[0]).toBe(1000);
    expect(slots[2] - slots[1]).toBe(1000);
    expect(slots[0] - now).toBeLessThan(5);
    const other = await t.mutation(internal.lib.http.reserveSlot, { domain: "b.test" });
    expect(other - now).toBeLessThan(5);
    vi.setSystemTime(now + 10_000);
    const later = await t.mutation(internal.lib.http.reserveSlot, { domain: "a.test" });
    expect(later - (now + 10_000)).toBeLessThan(5);
  });

  test("requests to one domain from separate runs are spaced at least 1s apart", async () => {
    const t = convexTest(schema, modules);
    const calls = stubFetch({
      "https://example.test/robots.txt": { body: "" },
      "https://example.test/events.json": { body: JSON.stringify(stubEvents) },
    });
    const feedId = await t.run((ctx) => ctx.db.insert("feeds", { ...stubFeed, enabled: true, nextFetchAt: 0 }));
    await Promise.all([
      t.action(internal.ingest.runFeed, { feedId }),
      t.action(internal.ingest.runFeed, { feedId }),
    ]);
    const times = calls.map((c) => c.at).sort((a, b) => a - b);
    expect(times.length).toBeGreaterThanOrEqual(3);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(990);
  }, 15_000);
});
