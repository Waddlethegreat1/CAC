import type { Adapter } from "../lib/adapter";
import { politeFetchText } from "../lib/http";
import type { RawEvent } from "../lib/rawEvent";
import { toZonedIso, zonedToUtc } from "../lib/time";

type DevpostHackathon = {
  id: number;
  title: string;
  url: string;
  displayed_location?: { location?: string };
  thumbnail_url?: string;
  submission_period_dates?: string;
  themes?: { name: string }[];
  prize_amount?: string;
  organization_name?: string;
  registrations_count?: number;
  invite_only?: boolean;
};

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const TIMEZONE = "America/Los_Angeles";
const MAX_PAGES = 5;

type LocalDate = { year: number; month: number; day: number };

export function parseDevpostDates(text: string): { start: LocalDate; end: LocalDate } | undefined {
  const range = text.trim().match(/^([A-Za-z]{3}) (\d{1,2})(?:, (\d{4}))? - (?:([A-Za-z]{3}) )?(\d{1,2}), (\d{4})$/);
  if (range) {
    const startMonth = MONTHS.indexOf(range[1].toLowerCase());
    const endMonth = range[4] ? MONTHS.indexOf(range[4].toLowerCase()) : startMonth;
    if (startMonth < 0 || endMonth < 0) return undefined;
    const endYear = Number(range[6]);
    const startYear = range[3] ? Number(range[3]) : startMonth > endMonth ? endYear - 1 : endYear;
    return {
      start: { year: startYear, month: startMonth, day: Number(range[2]) },
      end: { year: endYear, month: endMonth, day: Number(range[5]) },
    };
  }
  const single = text.trim().match(/^([A-Za-z]{3}) (\d{1,2}), (\d{4})$/);
  const month = single ? MONTHS.indexOf(single[1].toLowerCase()) : -1;
  if (!single || month < 0) return undefined;
  const date = { year: Number(single[3]), month, day: Number(single[2]) };
  return { start: date, end: date };
}

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, "").trim();
const at = (d: LocalDate, hour: number, minute: number) =>
  toZonedIso(zonedToUtc(d.year, d.month, d.day, hour, minute, TIMEZONE), TIMEZONE);

export function parseDevpostPage(json: { hackathons?: DevpostHackathon[] }): RawEvent[] {
  const events: RawEvent[] = [];
  for (const h of json.hackathons ?? []) {
    if (h.invite_only) continue;
    const dates = h.submission_period_dates ? parseDevpostDates(h.submission_period_dates) : undefined;
    if (!dates) continue;
    const place = (h.displayed_location?.location ?? "Online").trim();
    const online = /^online$/i.test(place);
    const themes = (h.themes ?? []).map((t) => t.name);
    const prize = h.prize_amount ? stripHtml(h.prize_amount) : undefined;
    const description = [
      `${online ? "Online" : "In-person"} hackathon${h.organization_name ? ` by ${h.organization_name}` : ""}.`,
      prize && prize !== "$0" ? `${prize} in prizes.` : undefined,
      themes.length ? `Themes: ${themes.join(", ")}.` : undefined,
      h.registrations_count ? `${h.registrations_count.toLocaleString("en-US")} registered.` : undefined,
    ]
      .filter(Boolean)
      .join(" ");
    events.push({
      source: "devpost",
      sourceId: String(h.id),
      title: h.title.trim(),
      description,
      url: h.url,
      startsAt: at(dates.start, 9, 0),
      endsAt: at(dates.end, 23, 59),
      timezone: TIMEZONE,
      location: online ? { online: true } : { online: false, name: place },
      organizer: h.organization_name ?? undefined,
      imageUrl: h.thumbnail_url ? (h.thumbnail_url.startsWith("//") ? `https:${h.thumbnail_url}` : h.thumbnail_url) : undefined,
      sourceTags: themes,
      sourceEventType: "hackathon",
    });
  }
  return events;
}

export const devpostAdapter: Adapter = {
  source: "devpost",
  async fetch(feed) {
    const byId = new Map<string, RawEvent>();
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = new URL(feed.url);
      url.searchParams.set("page", String(page));
      const parsed = parseDevpostPage(JSON.parse(await politeFetchText(url.toString(), "application/json")));
      if (parsed.length === 0) break;
      parsed.forEach((e) => byId.set(e.sourceId, e));
    }
    return [...byId.values()];
  },
};
