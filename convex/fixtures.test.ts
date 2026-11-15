import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { parseEventPage } from "./adapters/jsonld";
import { SCOUT_TEST_EVENT_ID, SCOUT_TEST_EVENT_PATH, SCOUT_TEST_EVENT_TITLE, scoutTestEventTimes } from "./lib/fixtures";
import { normalize } from "./normalize";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);

const SITE = "https://cac-test.convex.site";
const ROUTE = `${SITE}${SCOUT_TEST_EVENT_PATH}`;
const DAY = 86_400_000;

const sfStudent = {
  deviceId: "device-1",
  role: "student" as const,
  interests: ["pitch"],
  city: "San Francisco",
  lat: 37.7749,
  lng: -122.4194,
  locationSource: "city" as const,
};

async function routeHtml(t: ReturnType<typeof convexTest>) {
  const res = await t.fetch(SCOUT_TEST_EVENT_PATH, { method: "GET" });
  return { status: res.status, body: await res.text() };
}

function stubFetch(t: ReturnType<typeof convexTest>) {
  vi.stubGlobal("fetch", async (input: string | URL | Request) => {
    const url = String(input);
    if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
    if (url === ROUTE) return new Response((await routeHtml(t)).body.replaceAll("https://localhost", SITE).replaceAll("http://localhost", SITE));
    throw new Error(`unexpected live fetch: ${url}`);
  });
}

beforeEach(() => vi.stubEnv("ENABLE_TEST_FIXTURES", "1"));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("scout test event route", () => {
  test("is a 404 unless ENABLE_TEST_FIXTURES is 1", async () => {
    const t = convexTest(schema, modules);
    for (const value of [undefined, "", "0", "true"]) {
      vi.stubEnv("ENABLE_TEST_FIXTURES", value);
      expect((await routeHtml(t)).status).toBe(404);
    }
  });

  test("serves Event JSON-LD that the jsonld adapter parses into an upcoming San Francisco event", async () => {
    const t = convexTest(schema, modules);
    const { status, body } = await routeHtml(t);
    expect(status).toBe(200);
    const [raw, ...rest] = parseEventPage(body, ROUTE);
    expect(rest).toEqual([]);
    const { start, end } = scoutTestEventTimes(Date.now());
    expect(raw).toMatchObject({ title: SCOUT_TEST_EVENT_TITLE, timezone: "America/Los_Angeles" });
    expect(new URL(raw.url).pathname).toBe(SCOUT_TEST_EVENT_PATH);
    expect(Date.parse(raw.startsAt)).toBe(start);
    expect(Date.parse(raw.endsAt!)).toBe(end);
    expect(raw.startsAt).toMatch(/T18:00:00-0[78]:00$/);
    expect(raw.description).toMatch(/synthetic test data/i);
    expect(raw.location).toMatchObject({ online: false, name: "CAC Test Venue", city: "San Francisco", lat: 37.7941, lng: -122.3951 });
    expect(body).toContain(SCOUT_TEST_EVENT_ID);
    expect(start - Date.now()).toBeGreaterThan(6 * DAY);
    expect(start - Date.now()).toBeLessThan(8 * DAY);
    const event = await normalize(raw);
    expect(event).toMatchObject({ city: "San Francisco", eventType: "pitch_competition" });
  });
});

describe("submitting the route through links.submit", () => {
  test("marks the event synthetic, shows it in feed.ranked, and keeps it out of investor.ranked and QA", async () => {
    const t = convexTest(schema, modules);
    stubFetch(t);
    await t.mutation(api.users.upsert, sfStudent);
    const result = await t.action(api.links.submit, { deviceId: sfStudent.deviceId, url: ROUTE });
    expect(result.status).toBe("added");
    const [event] = await t.run((ctx) => ctx.db.query("events").collect());
    expect(event).toMatchObject({ title: SCOUT_TEST_EVENT_TITLE, synthetic: true });
    expect(event.studentDensity).toBeGreaterThanOrEqual(0.35);

    const feed = await t.query(api.feed.ranked, { deviceId: sfStudent.deviceId });
    expect(feed?.events.map((e) => e._id)).toContain(event._id);

    const { _id, _creationTime, synthetic, ...copy } = event;
    const realId = await t.run((ctx) => ctx.db.insert("events", { ...copy, sourceId: "real-copy", url: "https://example.com/real", sources: undefined }));
    const investor = await t.query(api.investor.ranked, { deviceId: sfStudent.deviceId });
    expect(investor.events.map((e) => e._id)).toEqual([realId]);

    const qa = await t.query(internal.qa.report, {});
    expect(qa.totals.events).toBe(1);
    expect(qa.feeds).toEqual([]);
  });
});

describe("fixtures.purgeSynthetic", () => {
  test("deletes synthetic events with their raw listings, link submissions, and saves, and nothing else", async () => {
    const t = convexTest(schema, modules);
    stubFetch(t);
    await t.mutation(api.users.upsert, sfStudent);
    const { eventIds } = await t.action(api.links.submit, { deviceId: sfStudent.deviceId, url: ROUTE });
    const userId = (await t.run((ctx) => ctx.db.query("users").first()))!._id;
    const realId = await t.run(async (ctx) => {
      const synthetic = (await ctx.db.get(eventIds[0]))!;
      const { _id, _creationTime, synthetic: _flag, ...copy } = synthetic;
      const id = await ctx.db.insert("events", { ...copy, sourceId: "real", url: "https://example.com/real", sources: undefined, rawListingId: undefined });
      await ctx.db.insert("saves", { userId, eventId: synthetic._id, savedAt: 1 });
      await ctx.db.insert("saves", { userId, eventId: id, savedAt: 2 });
      await ctx.db.insert("link_submissions", { deviceId: "other", url: "https://example.com/real", status: "added", eventIds: [id, synthetic._id], createdAt: 1 });
      return id;
    });

    expect(await t.mutation(internal.fixtures.purgeSynthetic, {})).toEqual({ events: 1, rawListings: 1, linkSubmissions: 1, saves: 1, more: false });
    const [events, listings, submissions, saves] = await t.run(async (ctx) => [
      await ctx.db.query("events").collect(),
      await ctx.db.query("raw_listings").collect(),
      await ctx.db.query("link_submissions").collect(),
      await ctx.db.query("saves").collect(),
    ]);
    expect(events.map((e) => e._id)).toEqual([realId]);
    expect(listings).toEqual([]);
    expect(submissions).toMatchObject([{ url: "https://example.com/real", eventIds: [realId] }]);
    expect(saves).toMatchObject([{ eventId: realId }]);
  });
});
