import type { Infer } from "convex/values";
import { geocodeQuery, inBayArea, lookupCity, nearestCity, type GeoHit, type Geocoder } from "../lib/geo";
import type { RawEvent } from "../lib/rawEvent";
import { isRelevant, rulesEnricher, type Enricher } from "../lib/tagger";
import type { normalizedEvent } from "../schema";

export type NormalizedEvent = Infer<typeof normalizedEvent>;

export type NormalizeOptions = { enricher?: Enricher; geocode?: Geocoder };

export async function normalize(raw: RawEvent, { enricher = rulesEnricher, geocode }: NormalizeOptions = {}): Promise<NormalizedEvent | null> {
  const startTime = Date.parse(raw.startsAt);
  if (Number.isNaN(startTime)) return null;
  const endTime = raw.endsAt ? Date.parse(raw.endsAt) : undefined;
  const loc = raw.location;

  let lat = loc.lat;
  let lng = loc.lng;
  let city = loc.online ? "Online" : "";
  if (!loc.online) {
    const known = lookupCity([loc.city, loc.name, loc.address].filter(Boolean).join(" "));
    let hit: GeoHit | null = null;
    if (lat === undefined || lng === undefined) {
      const query = geocodeQuery(loc);
      hit = known ? { lat: known.lat, lng: known.lng } : geocode && query ? await geocode(query) : null;
      lat = hit?.lat;
      lng = hit?.lng;
    }
    if (lat !== undefined && lng !== undefined) {
      if (!inBayArea({ lat, lng })) return null;
      city = known?.name ?? loc.city ?? hit?.city ?? nearestCity({ lat, lng }).name;
    } else {
      city = known?.name ?? loc.city ?? "";
    }
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
    city,
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
