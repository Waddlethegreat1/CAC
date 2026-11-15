import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { api, internal } from "./_generated/api";
import { parseEventPage } from "./adapters/jsonld";
import { PAST_TEST_EVENT_ID, PAST_TEST_EVENT_TITLE, SCOUT_TEST_EVENT_ID, SCOUT_TEST_EVENT_PATH, SCOUT_TEST_EVENT_TITLE, scoutTestEventTimes } from "./lib/fixtures";
import { INVESTORS_LIKELY_MIN } from "./lib/ranking";
import { normalize } from "./normalize";
import schema from "./schema";

const modules = import.meta.glob(["./**/*.ts", "./**/*.js", "!./**/*.test.ts", "!./**/*.d.ts"]);

const SITE = "https://cac-test.convex.site";
const ROUTE = `${SITE}${SCOUT_TEST_EVENT_PATH}`;
const DAY = 86_400_000;

const sfStudent = {
  deviceId: "device-1",
  role: "student" as const,
  interests: ["hackathons"],
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
    expect(event).toMatchObject({ city: "San Francisco", eventType: "hackathon" });
    expect(event!.investorScore).toBeLessThan(INVESTORS_LIKELY_MIN);
    expect(event!.investorSignals).toEqual([]);
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
    expect(event.investorScore).toBeLessThan(INVESTORS_LIKELY_MIN);
    const investorsLikely = await t.query(api.feed.ranked, { deviceId: sfStudent.deviceId, filter: "investors" });
    expect(investorsLikely?.events.map((e) => e._id)).not.toContain(event._id);

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
  test("refuses to run unless ENABLE_TEST_FIXTURES is 1", async () => {
    const t = convexTest(schema, modules);
    stubFetch(t);
    await t.action(api.links.submit, { deviceId: sfStudent.deviceId, url: ROUTE });
    for (const value of [undefined, "0", "true"]) {
      vi.stubEnv("ENABLE_TEST_FIXTURES", value);
      await expect(t.mutation(internal.fixtures.purgeSynthetic, {})).rejects.toThrow(/ENABLE_TEST_FIXTURES/);
    }
    expect(await t.run((ctx) => ctx.db.query("events").collect())).toHaveLength(1);
  });

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

describe("fixtures.seedPastCommitment", () => {
  const deviceId = "fresh-install-device";

  test("refuses to run unless ENABLE_TEST_FIXTURES is 1", async () => {
    const t = convexTest(schema, modules);
    for (const value of [undefined, "0", "true"]) {
      vi.stubEnv("ENABLE_TEST_FIXTURES", value);
      await expect(t.mutation(api.fixtures.seedPastCommitment, { deviceId })).rejects.toThrow(/ENABLE_TEST_FIXTURES/);
    }
    const [events, users, attendance] = await t.run(async (ctx) => [
      await ctx.db.query("events").collect(),
      await ctx.db.query("users").collect(),
      await ctx.db.query("attendance").collect(),
    ]);
    expect([events, users, attendance]).toEqual([[], [], []]);
  });

  test("creates a synthetic SF event that ended about 26 hours ago and shows it on the check-in card", async () => {
    const t = convexTest(schema, modules);
    const { eventId, commitmentId } = await t.mutation(api.fixtures.seedPastCommitment, { deviceId });
    const event = (await t.run((ctx) => ctx.db.get(eventId)))!;
    expect(event).toMatchObject({ sourceId: PAST_TEST_EVENT_ID, title: PAST_TEST_EVENT_TITLE, synthetic: true, city: "San Francisco" });
    expect(Date.now() - event.endTime!).toBeGreaterThan(25 * 3_600_000);
    expect(Date.now() - event.endTime!).toBeLessThan(27 * 3_600_000);
    expect(await t.run((ctx) => ctx.db.get(commitmentId))).toMatchObject({ eventId, going: true });
    expect(await t.query(api.users.get, { deviceId })).toMatchObject({ deviceId, city: "San Francisco" });

    const pending = await t.query(api.attendance.pending, { deviceId, now: Date.now() });
    expect(pending.map((e) => e._id)).toEqual([eventId]);
    expect(await t.query(api.attendance.mine, { deviceId })).toEqual([{ eventId, going: true }]);
  });

  test("is idempotent and reuses an onboarded user", async () => {
    const t = convexTest(schema, modules);
    const userId = await t.mutation(api.users.upsert, { ...sfStudent, deviceId });
    const first = await t.mutation(api.fixtures.seedPastCommitment, { deviceId });
    expect(await t.mutation(api.fixtures.seedPastCommitment, { deviceId })).toEqual(first);
    const [events, users, attendance] = await t.run(async (ctx) => [
      await ctx.db.query("events").collect(),
      await ctx.db.query("users").collect(),
      await ctx.db.query("attendance").collect(),
    ]);
    expect(events).toHaveLength(1);
    expect(users.map((u) => u._id)).toEqual([userId]);
    expect(attendance).toMatchObject([{ _id: first.commitmentId, userId, eventId: first.eventId, going: true }]);

    const other = await t.mutation(api.fixtures.seedPastCommitment, { deviceId: "second-device" });
    expect(other.eventId).toBe(first.eventId);
    expect(other.commitmentId).not.toBe(first.commitmentId);
  });

  test("keeps the event out of feed.ranked, investor.ranked, and QA", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.users.upsert, { ...sfStudent, deviceId });
    const { eventId } = await t.mutation(api.fixtures.seedPastCommitment, { deviceId });
    const feed = await t.query(api.feed.ranked, { deviceId });
    expect(feed?.events.map((e) => e._id)).not.toContain(eventId);
    const investor = await t.query(api.investor.ranked, { deviceId });
    expect(investor.events.map((e) => e._id)).not.toContain(eventId);
    const qa = await t.query(internal.qa.report, {});
    expect(qa.totals.events).toBe(0);
  });

  test("purgeSynthetic removes the event and leaves no orphaned attendance rows", async () => {
    const t = convexTest(schema, modules);
    const { eventId } = await t.mutation(api.fixtures.seedPastCommitment, { deviceId });
    await t.mutation(api.fixtures.seedPastCommitment, { deviceId: "second-device" });
    await t.mutation(api.attendance.respond, { deviceId, eventId, attended: true, rating: 4, investors: "yes" });
    expect(await t.run((ctx) => ctx.db.query("attendance_totals").collect())).toHaveLength(1);

    expect(await t.mutation(internal.fixtures.purgeSynthetic, {})).toMatchObject({ events: 1, more: false });
    const [events, attendance, totals] = await t.run(async (ctx) => [
      await ctx.db.query("events").collect(),
      await ctx.db.query("attendance").collect(),
      await ctx.db.query("attendance_totals").collect(),
    ]);
    expect([events, attendance, totals]).toEqual([[], [], []]);
    expect(await t.query(api.attendance.pending, { deviceId, now: Date.now() })).toEqual([]);
  });
});

describe("fixtures.seedTalentMatch", () => {
  const deviceId = "fresh-talent-device";
  const tick = () => vi.setSystemTime(Date.now() + 1000);

  beforeEach(() => vi.useFakeTimers({ toFake: ["Date"] }));
  afterEach(() => vi.useRealTimers());

  async function seed(t: ReturnType<typeof convexTest>, device = deviceId) {
    const result = await t.mutation(api.fixtures.seedTalentMatch, { deviceId: device });
    tick();
    return result;
  }

  async function match(t: ReturnType<typeof convexTest>) {
    const seeded = await seed(t);
    const { connectionId } = await t.mutation(api.connections.expressInterest, { deviceId, companyId: seeded.companyId, eventId: seeded.eventId });
    expect(await t.mutation(api.connections.respond, { deviceId: seeded.memberDeviceId, connectionId, accept: true })).toEqual({ status: "accepted" });
    return { ...seeded, connectionId };
  }

  test("refuses to run unless ENABLE_TEST_FIXTURES is 1", async () => {
    const t = convexTest(schema, modules);
    for (const value of [undefined, "0", "true"]) {
      vi.stubEnv("ENABLE_TEST_FIXTURES", value);
      await expect(t.mutation(api.fixtures.seedTalentMatch, { deviceId })).rejects.toThrow(/ENABLE_TEST_FIXTURES/);
    }
    const tables = await t.run(async (ctx) => Promise.all((["events", "users", "companies", "company_members", "event_hosts", "attendance"] as const)
      .map((table) => ctx.db.query(table).collect())));
    expect(tables.flat()).toEqual([]);
  });

  test("seeds a verified host company, its member, and an ended synthetic event the device went to", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seed(t);
    expect(seeded.memberDeviceId).toBe("fixture-scout-test-co-member");
    const [event, company, member, claims, memberships] = await t.run(async (ctx) => [
      await ctx.db.get(seeded.eventId),
      await ctx.db.get(seeded.companyId),
      await ctx.db.get(seeded.memberUserId),
      await ctx.db.query("event_hosts").collect(),
      await ctx.db.query("company_members").collect(),
    ] as const);
    expect(event).toMatchObject({ sourceId: "cac-scout-test-match-event", title: "[TEST] Scout fixture demo day", synthetic: true, city: "San Francisco", hosts: ["Scout Test Co"] });
    expect(event!.endTime).toBeLessThan(Date.now());
    expect(company).toMatchObject({ name: "Scout Test Co", slug: "scout-test-co", domain: "scout-test.example", verifiedBy: "fixture" });
    expect(company!.verifiedAt).toBeTypeOf("number");
    expect(member).toMatchObject({ deviceId: seeded.memberDeviceId, role: "host", workDomain: "scout-test.example", workEmailVerifiedVia: "dev" });
    expect(claims).toMatchObject([{ eventId: seeded.eventId, companyId: seeded.companyId, status: "approved" }]);
    expect(memberships).toMatchObject([{ companyId: seeded.companyId, userId: seeded.memberUserId, role: "owner" }]);
    expect(await t.query(api.users.get, { deviceId })).toMatchObject({ deviceId, role: "student" });

    const discover = await t.query(api.connections.discover, { deviceId });
    expect(discover).toMatchObject([{ event: { _id: seeded.eventId }, companies: [{ company: { _id: seeded.companyId, verified: true }, connectionStatus: null }] }]);
  });

  test("lets the device express interest and the member see it in eventMatches and the inbox", async () => {
    const t = convexTest(schema, modules);
    const seeded = await seed(t);
    const talentUserId = (await t.query(api.users.get, { deviceId }))!._id;
    expect(await t.mutation(api.connections.expressInterest, { deviceId, companyId: seeded.companyId, eventId: seeded.eventId }))
      .toMatchObject({ status: "pending" });

    const matches = await t.query(api.hosts.eventMatches, { deviceId: seeded.memberDeviceId, eventId: seeded.eventId, companyId: seeded.companyId });
    expect(matches.matches).toMatchObject([{ talent: { userId: talentUserId }, attended: true, interested: true, mutual: false }]);
    const inbox = await t.query(api.connections.inbox, { deviceId: seeded.memberDeviceId });
    expect(inbox.companies).toMatchObject([{ company: { _id: seeded.companyId }, role: "owner", incoming: [{ talent: { userId: talentUserId } }] }]);
  });

  test("opens chat for both sides after a mutual match", async () => {
    const t = convexTest(schema, modules);
    const { connectionId, memberDeviceId, eventId, companyId } = await match(t);
    const matches = await t.query(api.hosts.eventMatches, { deviceId: memberDeviceId, eventId, companyId });
    expect(matches.matches).toMatchObject([{ mutual: true }]);
    await t.mutation(api.chat.send, { deviceId, connectionId, body: "Hi from talent" });
    tick();
    await t.mutation(api.chat.send, { deviceId: memberDeviceId, connectionId, body: "Hi from Scout Test Co" });
    for (const [device, mine] of [[deviceId, [true, false]], [memberDeviceId, [false, true]]] as const) {
      const { messages } = await t.query(api.chat.list, { deviceId: device, connectionId });
      expect(messages.map((m) => [m.body, m.mine, m.fromTalent])).toEqual([["Hi from talent", mine[0], true], ["Hi from Scout Test Co", mine[1], false]]);
    }
  });

  test("is idempotent per device, keeps existing connections, and stays eligible for a second device", async () => {
    const t = convexTest(schema, modules);
    const first = await match(t);
    const { connectionId, ...ids } = first;
    expect(await seed(t)).toEqual(ids);
    const tables = await t.run(async (ctx) => ({
      events: await ctx.db.query("events").collect(),
      companies: await ctx.db.query("companies").collect(),
      users: await ctx.db.query("users").collect(),
      members: await ctx.db.query("company_members").collect(),
      claims: await ctx.db.query("event_hosts").collect(),
      attendance: await ctx.db.query("attendance").collect(),
      connections: await ctx.db.query("connections").collect(),
    }));
    expect(Object.fromEntries(Object.entries(tables).map(([k, rows]) => [k, rows.length])))
      .toEqual({ events: 1, companies: 1, users: 2, members: 1, claims: 1, attendance: 1, connections: 1 });
    expect(tables.connections).toMatchObject([{ _id: connectionId, status: "accepted" }]);

    const second = await seed(t, "second-talent-device");
    expect(second).toEqual(ids);
    for (const device of [deviceId, "second-talent-device"]) {
      expect(await t.query(api.connections.discover, { deviceId: device })).toHaveLength(1);
    }
    expect(await t.mutation(api.connections.expressInterest, { deviceId: "second-talent-device", companyId: ids.companyId, eventId: ids.eventId }))
      .toMatchObject({ status: "pending" });
    const matches = await t.query(api.hosts.eventMatches, { deviceId: ids.memberDeviceId, eventId: ids.eventId, companyId: ids.companyId });
    expect(matches.matches).toHaveLength(2);
  });

  test("keeps the event out of feed.ranked, investor.ranked, and QA", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.users.upsert, { ...sfStudent, deviceId });
    const { eventId } = await seed(t);
    const feed = await t.query(api.feed.ranked, { deviceId });
    expect(feed?.events.map((e) => e._id)).not.toContain(eventId);
    const investor = await t.query(api.investor.ranked, { deviceId });
    expect(investor.events.map((e) => e._id)).not.toContain(eventId);
    const qa = await t.query(internal.qa.report, {});
    expect(qa.totals.events).toBe(0);
  });

  test("purgeSynthetic removes the event, company, member, claims, connections, and messages and leaves no orphans", async () => {
    const t = convexTest(schema, modules);
    const { connectionId } = await match(t);
    await t.mutation(api.chat.send, { deviceId, connectionId, body: "Hi" });
    const realCompany = await t.run((ctx) => ctx.db.insert("companies", { name: "Real Co", slug: "real-co", createdAt: 1 }));

    expect(await t.mutation(internal.fixtures.purgeSynthetic, {})).toMatchObject({ events: 1, more: false });
    const tables = await t.run(async (ctx) => ({
      events: await ctx.db.query("events").collect(),
      companies: await ctx.db.query("companies").collect(),
      users: await ctx.db.query("users").collect(),
      members: await ctx.db.query("company_members").collect(),
      claims: await ctx.db.query("event_hosts").collect(),
      attendance: await ctx.db.query("attendance").collect(),
      connections: await ctx.db.query("connections").collect(),
      messages: await ctx.db.query("messages").collect(),
    }));
    expect(tables.companies.map((c) => c._id)).toEqual([realCompany]);
    expect(tables.users.map((u) => u.deviceId)).toEqual([deviceId]);
    expect({ ...tables, companies: [], users: [] }).toEqual({ events: [], companies: [], users: [], members: [], claims: [], attendance: [], connections: [], messages: [] });
    expect(await t.query(api.connections.inbox, { deviceId })).toMatchObject({ talent: { incoming: [], outgoing: [], connected: [] } });
  });
});
