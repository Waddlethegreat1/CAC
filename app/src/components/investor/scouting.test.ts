import { describe, expect, it } from "vitest";
import type { Id } from "../../../../convex/_generated/dataModel";
import { applyFilters, inferSchool, rankForInvestors, schoolsIn, scout, studentDensity, weekShortlist, type ScoutEvent } from "./scouting";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 15, 18);

let n = 0;
const ev = (over: Partial<ScoutEvent>): ScoutEvent => ({
  _id: `e${n++}` as Id<"events">,
  title: "Event",
  description: "",
  startTime: NOW + DAY,
  city: "San Francisco",
  isOnline: false,
  hosts: [],
  tags: [],
  eventType: "networking",
  audience: ["general"],
  investorScore: 30,
  investorSignals: [],
  source: "seed",
  ...over,
});

const pitch = ev({
  title: "Stanford Startup Pitch Night",
  description: "Ten student teams pitch to a judging panel of seed investors. Open to all Stanford students.",
  city: "Stanford",
  organizer: "Stanford BASES",
  eventType: "pitch_competition",
  audience: ["founders", "investors", "students"],
  investorScore: 95,
  investorSignals: ["Pitch competition format", "Hosted by Pear VC", "Has a judging panel"],
  startTime: NOW + 2 * DAY,
});
const skydeck = ev({
  title: "Berkeley SkyDeck Demo Day",
  description: "Accelerator cohort presents to 300+ investors. Student founders can apply.",
  city: "Berkeley",
  eventType: "demo_day",
  audience: ["founders", "investors", "students"],
  investorScore: 100,
  investorSignals: ["Demo day format", "Mentions Berkeley SkyDeck"],
  startTime: NOW + 9 * DAY,
});
const mixer = ev({ title: "Founders & Funders Mixer", description: "Networking for founders and seed investors.", investorScore: 75, audience: ["founders", "investors"] });
const hack = ev({ title: "TreeHacks Winter Build Weekend", description: "A 36-hour student hackathon at Stanford.", city: "Stanford", eventType: "hackathon", audience: ["students", "developers"], investorScore: 25, startTime: NOW + 12 * DAY, endTime: NOW + 13.5 * DAY });
const past = ev({ title: "Cal Hacks past", eventType: "hackathon", audience: ["students"], startTime: NOW - 3 * DAY, endTime: NOW - 2 * DAY });

describe("investor scouting", () => {
  it("infers the school from venue, organizer, and title", () => {
    expect(inferSchool(pitch)).toBe("Stanford");
    expect(inferSchool(skydeck)).toBe("UC Berkeley");
    expect(inferSchool(mixer)).toBeNull();
  });

  it("scores student density higher for campus events", () => {
    expect(studentDensity(pitch)).toBeGreaterThan(0.8);
    expect(studentDensity(mixer)).toBe(0);
  });

  it("ranks student events by investor score and density, dropping non-student and past events", () => {
    const ranked = rankForInvestors([mixer, hack, past, skydeck, pitch], NOW);
    expect(ranked.map((s) => s.event.title)).toEqual([pitch.title, skydeck.title, hack.title]);
  });

  it("explains the score with signals and the school", () => {
    expect(scout(pitch, NOW).reasons).toEqual(["Pitch competition format", "Hosted by Pear VC", "Student pitch competition at Stanford"]);
  });

  it("filters by school, type, and date", () => {
    const ranked = rankForInvestors([hack, skydeck, pitch], NOW);
    expect(applyFilters(ranked, { school: "Stanford", type: "all", date: "any" }, NOW)).toHaveLength(2);
    expect(applyFilters(ranked, { school: null, type: "pitch", date: "any" }, NOW).map((s) => s.event.title)).toEqual([pitch.title, skydeck.title]);
    expect(applyFilters(ranked, { school: null, type: "all", date: "week" }, NOW).map((s) => s.event.title)).toEqual([pitch.title]);
    expect(schoolsIn(ranked)).toEqual(["Stanford", "UC Berkeley"]);
  });

  it("shortlists high-signal events starting this week", () => {
    const ranked = rankForInvestors([hack, skydeck, pitch], NOW);
    expect(weekShortlist(ranked, NOW).map((s) => s.event.title)).toEqual([pitch.title]);
  });
});
