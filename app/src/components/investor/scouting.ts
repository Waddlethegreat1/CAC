import type { Doc } from "../../../../convex/_generated/dataModel";

export type ScoutEvent = Pick<
  Doc<"events">,
  | "_id"
  | "title"
  | "description"
  | "startTime"
  | "endTime"
  | "city"
  | "venue"
  | "isOnline"
  | "organizer"
  | "hosts"
  | "tags"
  | "eventType"
  | "audience"
  | "investorScore"
  | "investorSignals"
  | "source"
>;

export type TypeFilter = "all" | "pitch" | "hackathon" | "networking";
export type DateFilter = "any" | "week" | "month";

export type Filters = { school: string | null; type: TypeFilter; date: DateFilter };

export type Scouted = {
  event: ScoutEvent;
  school: string | null;
  studentDensity: number;
  scoutScore: number;
  reasons: string[];
};

const DAY = 86_400_000;
const DEFAULT_DURATION = 3 * 3600_000;

const SCHOOLS: [string, RegExp][] = [
  ["Stanford", /\b(stanford|treehacks|startx|bases|gsb|huang engineering)\b/i],
  ["UC Berkeley", /\b(uc berkeley|berkeley skydeck|skydeck|haas|cal hacks|jacobs hall|berkeley)\b/i],
  ["UCSF", /\b(ucsf|mission bay conference)\b/i],
  ["Santa Clara", /\b(santa clara university|scu|leavey|ciocca)\b/i],
  ["San José State", /\b(sjsu|san jos[eé] state)\b/i],
  ["USF", /\b(usf|university of san francisco)\b/i],
  ["SF State", /\b(sfsu|sf state|san francisco state)\b/i],
];

const STUDENT_WORDS = /\b(students?|undergrad\w*|grad students|campus|university|college|student[- ]led|club|new grads?|interns?)\b/i;
const STUDENT_ONLY = /\b(students? only|open to all [a-z]+ students|student teams?|student founders?|student hackathon)\b/i;

const STUDENT_TYPES: Doc<"events">["eventType"][] = ["hackathon", "pitch_competition", "demo_day", "career_fair"];

const text = (e: ScoutEvent) =>
  [e.title, e.venue ?? "", e.organizer ?? "", e.hosts.join(" "), e.city, e.description].join(" \n ");

export function inferSchool(e: ScoutEvent): string | null {
  const head = [e.title, e.venue ?? "", e.organizer ?? "", e.hosts.join(" "), e.city].join(" \n ");
  return SCHOOLS.find(([, re]) => re.test(head))?.[0] ?? SCHOOLS.find(([, re]) => re.test(e.description))?.[0] ?? null;
}

export function studentDensity(e: ScoutEvent, school = inferSchool(e)): number {
  const t = text(e);
  let d = 0;
  if (e.audience.includes("students")) d += 0.35;
  if (school) d += 0.3;
  if (STUDENT_WORDS.test(t)) d += 0.15;
  if (STUDENT_ONLY.test(t)) d += 0.15;
  if (STUDENT_TYPES.includes(e.eventType)) d += 0.05;
  return Math.min(1, Math.round(d * 100) / 100);
}

export const isLive = (e: Pick<ScoutEvent, "startTime" | "endTime">, now: number) =>
  (e.endTime ?? e.startTime + DEFAULT_DURATION) >= now;

const isLongRunning = (e: ScoutEvent) => e.endTime !== undefined && e.endTime - e.startTime > 2 * DAY;

export function soonness(e: ScoutEvent, now: number) {
  if (isLongRunning(e) && e.startTime < now) return 0.3;
  return Math.max(0, 1 - Math.max(0, e.startTime - now) / (30 * DAY));
}

function densityReason(e: ScoutEvent, school: string | null, density: number) {
  const kind =
    e.eventType === "hackathon" ? "Student hackathon" : e.eventType === "pitch_competition" ? "Student pitch competition" : e.eventType === "demo_day" ? "Student demos" : "Student crowd";
  if (school) return `${kind} at ${school}`;
  if (density >= 0.5) return `${kind} expected`;
  return null;
}

export function scout(e: ScoutEvent, now: number): Scouted {
  const school = inferSchool(e);
  const density = studentDensity(e, school);
  const scoutScore = Math.round(100 * (0.55 * (e.investorScore / 100) + 0.3 * density + 0.15 * soonness(e, now)));
  const student = densityReason(e, school, density);
  const reasons = [...e.investorSignals.slice(0, 2), ...(student ? [student] : [])];
  return { event: e, school, studentDensity: density, scoutScore, reasons };
}

export const isStudentEvent = (s: Scouted) => s.studentDensity >= 0.35;

export function rankForInvestors(events: ScoutEvent[], now: number): Scouted[] {
  return events
    .filter((e) => isLive(e, now))
    .map((e) => scout(e, now))
    .filter(isStudentEvent)
    .sort((a, b) => b.scoutScore - a.scoutScore || a.event.startTime - b.event.startTime);
}

const TYPE_MATCH: Record<Exclude<TypeFilter, "all">, Doc<"events">["eventType"][]> = {
  pitch: ["pitch_competition", "demo_day"],
  hackathon: ["hackathon"],
  networking: ["networking", "career_fair", "social"],
};

export function applyFilters(list: Scouted[], f: Filters, now: number): Scouted[] {
  const horizon = f.date === "week" ? now + 7 * DAY : f.date === "month" ? now + 30 * DAY : Infinity;
  return list.filter(
    (s) =>
      (f.school === null || s.school === f.school) &&
      (f.type === "all" || TYPE_MATCH[f.type].includes(s.event.eventType)) &&
      s.event.startTime <= horizon,
  );
}

export function weekShortlist(list: Scouted[], now: number, size = 3): Scouted[] {
  return list
    .filter((s) => s.event.startTime <= now + 7 * DAY && !(isLongRunning(s.event) && s.event.startTime < now) && s.event.investorScore >= 60)
    .slice(0, size);
}

export function schoolsIn(list: Scouted[]): string[] {
  const present = new Set(list.map((s) => s.school).filter((s) => s !== null));
  return SCHOOLS.map(([name]) => name).filter((name) => present.has(name));
}
