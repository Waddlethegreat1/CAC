import type { Doc } from "../_generated/dataModel";
import type { RawEvent } from "./rawEvent";

export type Feed = Pick<Doc<"feeds">, "source" | "name" | "url">;

export interface Adapter {
  source: string;
  fetch(feed: Feed): Promise<RawEvent[]>;
}
