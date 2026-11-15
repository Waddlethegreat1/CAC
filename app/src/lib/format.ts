const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAY = 86_400_000;

export function formatTime(ms: number) {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  return `${h % 12 || 12}${m ? `:${String(m).padStart(2, "0")}` : ""} ${h < 12 ? "AM" : "PM"}`;
}

export function dateBadge(ms: number) {
  const d = new Date(ms);
  return { month: MONTHS[d.getMonth()].toUpperCase(), day: String(d.getDate()) };
}

export function relativeDay(start: number, end: number | undefined, now = Date.now()) {
  if (start <= now && (end ?? start) >= now) return "Happening now";
  const startOfToday = new Date(now).setHours(0, 0, 0, 0);
  const days = Math.floor((new Date(start).setHours(0, 0, 0, 0) - startOfToday) / DAY);
  if (days === 0) return `Today · ${formatTime(start)}`;
  if (days === 1) return `Tomorrow · ${formatTime(start)}`;
  if (days < 7) return `${DAYS[new Date(start).getDay()]} · ${formatTime(start)}`;
  return `${DAYS[new Date(start).getDay()]}, ${MONTHS[new Date(start).getMonth()]} ${new Date(start).getDate()}`;
}

export function formatRange(start: number, end?: number) {
  const s = new Date(start);
  const head = `${DAYS[s.getDay()]}, ${MONTHS[s.getMonth()]} ${s.getDate()}`;
  if (!end) return `${head} · ${formatTime(start)}`;
  const e = new Date(end);
  if (e.toDateString() === s.toDateString()) return `${head} · ${formatTime(start)} – ${formatTime(end)}`;
  return `${head} – ${DAYS[e.getDay()]}, ${MONTHS[e.getMonth()]} ${e.getDate()}`;
}

export function formatDistance(km: number | null, isOnline: boolean) {
  if (isOnline) return "Online";
  if (km === null) return undefined;
  const miles = km * 0.621371;
  return miles < 0.5 ? "Nearby" : `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
}
