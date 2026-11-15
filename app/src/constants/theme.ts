import type { Doc } from "@/convex/_generated/dataModel";

export const colors = {
  bg: "#F5F3EE",
  card: "#FFFFFF",
  ink: "#14110F",
  muted: "#6E6A64",
  faint: "#E6E2DA",
  accent: "#FF5A1F",
  accentSoft: "#FFE7DC",
  money: "#0E8A5F",
  moneySoft: "#DDF3EA",
  white: "#FFFFFF",
};

export const radius = { sm: 10, md: 16, lg: 24, pill: 999 };

type EventType = Doc<"events">["eventType"];

export const EVENT_TYPE_META: Record<EventType, { label: string; color: string; emoji: string }> = {
  hackathon: { label: "Hackathon", color: "#5B5BD6", emoji: "💻" },
  pitch_competition: { label: "Pitch competition", color: "#FF5A1F", emoji: "🎤" },
  demo_day: { label: "Demo day", color: "#E5484D", emoji: "🚀" },
  networking: { label: "Networking", color: "#12A594", emoji: "🤝" },
  workshop: { label: "Workshop", color: "#D6409F", emoji: "🛠️" },
  talk: { label: "Talk", color: "#8E4EC6", emoji: "🎙️" },
  conference: { label: "Conference", color: "#0090FF", emoji: "🏛️" },
  career_fair: { label: "Career fair", color: "#AD7F58", emoji: "🎓" },
  social: { label: "Social", color: "#46A758", emoji: "🎉" },
  other: { label: "Event", color: "#6E6A64", emoji: "📍" },
};
