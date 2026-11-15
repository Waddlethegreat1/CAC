export type Feed = { url: string };

export type Http = { text(url: string, accept?: string): Promise<string> };

export type RawLocation = {
  name?: string;
  address?: string;
  lat?: number;
  lng?: number;
};

export type RawEvent = {
  source: string;
  sourceId: string;
  title: string;
  startsAt: string;
  endsAt?: string;
  location?: RawLocation;
  url: string;
  description?: string;
  organizer?: string;
  price?: { min: number; max: number; currency?: string };
  imageUrl?: string;
};

export interface Adapter {
  source: string;
  fetch(feed: Feed, http: Http): Promise<RawEvent[]>;
}
