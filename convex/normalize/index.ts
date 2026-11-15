import type { Infer } from "convex/values";
import { inBayArea, lookupCity, nearestCity } from "../lib/geo";
import type { RawEvent } from "../lib/rawEvent";
import { isRelevant, rulesEnricher, type Enricher } from "../lib/tagger";
import type { normalizedEvent } from "../schema";

export type NormalizedEvent = Infer<typeof normalizedEvent>;

export async function normalize(raw: RawEvent, enricher: Enricher = rulesEnricher): Promise<NormalizedEvent | null> {
  const startTime = Date.parse(raw.startsAt);
  if (Number.isNaN(startTime)) return null;
  const endTime = raw.endsAt ? Date.parse(raw.endsAt) : undefined;
  const loc = raw.location;

  let lat = loc.lat;
  let lng = loc.lng;
  let city = loc.online ? "Online" : undefined;
  if (!loc.online) {
    const known = lookupCity([loc.city, loc.name, loc.address].filter(Boolean).join(" "));
    if (lat === undefined || lng === undefined) {
      if (!known) return null;
      lat = known.lat;
      lng = known.lng;
    }
    if (!inBayArea({ lat, lng })) return null;
    city = known?.name ?? loc.city ?? nearestCity({ lat, lng }).name;
  }

  const hosts = raw.hosts ?? [];
  const enrichment = await enricher.enrich({
    title: raw.title,
    description: raw.description,
    organizer: raw.organizer,
    hosts,
    sourceTags: raw.sourceTags ?? [],
    sourceEventType: raw.sourceEventType,
  });
  if (!isRelevant(enrichment)) return null;

  return {
    title: raw.title,
    description: raw.description,
    startTime,
    endTime: endTime !== undefined && !Number.isNaN(endTime) ? endTime : undefined,
    timezone: raw.timezone,
    venue: loc.online ? undefined : loc.name,
    address: loc.address,
    lat,
    lng,
    city: city!,
    isOnline: loc.online,
    url: raw.url,
    imageUrl: raw.imageUrl,
    source: raw.source,
    sourceId: raw.sourceId,
    organizer: raw.organizer,
    hosts,
    ...enrichment,
  };
}
