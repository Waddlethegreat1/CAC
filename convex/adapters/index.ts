import type { Adapter } from "../lib/adapter";
import { devpostAdapter } from "./devpost";
import { jsonldAdapter } from "./jsonld";
import { icalAdapter } from "./ical";
import { lumaAdapter } from "./luma";
import { mlhAdapter } from "./mlh";

export const ADAPTERS: Record<string, Adapter> = {
  [devpostAdapter.source]: devpostAdapter,
  [jsonldAdapter.source]: jsonldAdapter,
  [lumaAdapter.source]: lumaAdapter,
  [mlhAdapter.source]: mlhAdapter,
  [icalAdapter.source]: icalAdapter,
};

export const DEFAULT_FEEDS: { source: string; name: string; url: string; intervalMinutes: number; enabled?: boolean }[] = [
  {
    source: "devpost",
    name: "Devpost in-person hackathons",
    url: "https://devpost.com/api/hackathons?status[]=upcoming&status[]=open&challenge_type[]=in-person",
    intervalMinutes: 360,
  },
  {
    source: "devpost",
    name: "Devpost online hackathons",
    url: "https://devpost.com/api/hackathons?status[]=upcoming&status[]=open&challenge_type[]=online",
    intervalMinutes: 720,
  },
  { source: "mlh", name: "MLH 2027 season", url: "https://www.mlh.com/seasons/2027/events", intervalMinutes: 720, enabled: false },
  { source: "luma", name: "Luma San Francisco", url: "https://luma.com/sf", intervalMinutes: 180 },
  { source: "luma", name: "Luma: The AI Collective", url: "https://luma.com/genai-collective", intervalMinutes: 360 },
  { source: "luma", name: "Luma: Claude Community Events", url: "https://luma.com/claudecommunity", intervalMinutes: 360 },
  { source: "luma", name: "Luma: Latent Space", url: "https://luma.com/ls", intervalMinutes: 720 },
];
