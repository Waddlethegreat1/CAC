import { describe, expect, test } from "vitest";
import inPersonExpected from "../../fixtures/devpost/in-person-page-1.expected.json";
import inPersonPage from "../../fixtures/devpost/in-person-page-1.json";
import onlineExpected from "../../fixtures/devpost/online-page-1.expected.json";
import onlinePage from "../../fixtures/devpost/online-page-1.json";
import { devpostAdapter, parseDevpostDates, parseDevpostPage } from "./devpost";

describe("devpost adapter", () => {
  test("parses saved in-person and online pages into RawEvents", () => {
    expect(parseDevpostPage(inPersonPage)).toEqual(inPersonExpected);
    expect(parseDevpostPage(onlinePage)).toEqual(onlineExpected);
  });

  test("in-person hackathons keep their venue and Pacific dates", () => {
    const immerse = parseDevpostPage(inPersonPage).find((e) => e.title.startsWith("Immerse the Bay"));
    expect(immerse?.location).toEqual({ online: false, name: "Stanford University" });
    expect(immerse?.startsAt).toMatch(/T09:00:00-0[78]:00$/);
    expect(immerse?.timezone).toBe("America/Los_Angeles");
  });

  test("parses every Devpost date range format", () => {
    expect(parseDevpostDates("Oct 30 - Dec 04, 2026")).toEqual({
      start: { year: 2026, month: 9, day: 30 },
      end: { year: 2026, month: 11, day: 4 },
    });
    expect(parseDevpostDates("Nov 14 - 15, 2026")?.end).toEqual({ year: 2026, month: 10, day: 15 });
    expect(parseDevpostDates("Dec 28 - Jan 04, 2027")?.start.year).toBe(2026);
    expect(parseDevpostDates("Dec 15, 2026 - Jan 10, 2027")?.end.year).toBe(2027);
    expect(parseDevpostDates("Nov 15, 2026")?.start).toEqual({ year: 2026, month: 10, day: 15 });
    expect(parseDevpostDates("Rolling")).toBeUndefined();
  });

  test("fetch pages through the feed URL until a page comes back empty", async () => {
    const requested: string[] = [];
    const http = {
      text: async (url: string) => {
        requested.push(url);
        return JSON.stringify(new URL(url).searchParams.get("page") === "1" ? inPersonPage : { hackathons: [] });
      },
    };
    const events = await devpostAdapter.fetch(
      { source: "devpost", name: "test", url: "https://devpost.com/api/hackathons?challenge_type[]=in-person" },
      http,
    );
    expect(events).toEqual(inPersonExpected);
    expect(requested).toHaveLength(2);
    expect(requested[0]).toContain("page=1");
  });
});
