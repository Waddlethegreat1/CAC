import type { Http } from "./adapter";

const MIN_INTERVAL_MS = 1000;
const lastRequestAt = new Map<string, number>();

export const USER_AGENT = "CAC-EventsBot/0.1 (+https://github.com/waddlethegreat1/cac)";

export async function politeFetchText(url: string, accept = "*/*"): Promise<string> {
  const host = new URL(url).host;
  const wait = (lastRequestAt.get(host) ?? 0) + MIN_INTERVAL_MS - Date.now();
  if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  lastRequestAt.set(host, Date.now());
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT, Accept: accept } });
  if (!res.ok) throw new Error(`${url} responded ${res.status}`);
  return res.text();
}

export const basicHttp: Http = { text: politeFetchText };
