export type Coordinates = { lat: number; lng: number };
export type LocatedEvent = { _id: string; isOnline: boolean; lat?: number; lng?: number };
export type MarkerGroup = Coordinates & { ids: string[]; saved: boolean };

export function validCoordinates(event: { lat?: number; lng?: number }): event is Coordinates {
  return typeof event.lat === "number" && typeof event.lng === "number" &&
    Number.isFinite(event.lat) && Number.isFinite(event.lng) &&
    Math.abs(event.lat) <= 90 && Math.abs(event.lng) <= 180;
}

export function mapEvents<T extends LocatedEvent>(events: T[]) {
  const online = events.filter((event) => event.isOnline).length;
  const located = events.filter((event): event is T & Coordinates => !event.isOnline && validCoordinates(event));
  return { events: located.slice(0, 60), online, unlocated: events.length - online - located.length };
}

export function selectedEvent<T extends { _id: string }>(events: T[], id: string | null): T | undefined {
  return events.find((event) => event._id === id) ?? events[0];
}

export function markerGroups(events: (LocatedEvent & Coordinates)[], savedIds: Set<string>): MarkerGroup[] {
  const groups = new Map<string, MarkerGroup>();
  for (const event of events) {
    const key = `${event.lat},${event.lng}`;
    const group = groups.get(key) ?? { lat: event.lat, lng: event.lng, ids: [], saved: false };
    group.ids.push(event._id);
    group.saved ||= savedIds.has(event._id);
    groups.set(key, group);
  }
  return [...groups.values()];
}

export function nextInGroup(ids: string[], selectedId?: string): string {
  return ids[(ids.indexOf(selectedId ?? "") + 1) % ids.length];
}
