import type { TextStyle } from "react-native";

import type { Doc } from "@/convex/_generated/dataModel";

const light = {
  ember: "#E2531F",
  emberInk: "#C2410C",
  emberSoft: "rgba(226, 83, 31, 0.12)",
  gold: "#A86A00",
  goldSoft: "rgba(168, 106, 0, 0.14)",
  ink: "#16171D",
  muted: "#6A6A6F",
  subtle: "#8E8E93",
  bg: "#FAFAFB",
  surface: "#FFFFFF",
  secondary: "rgba(0, 0, 0, 0.05)",
  line: "rgba(0, 0, 0, 0.08)",
  lineStrong: "rgba(0, 0, 0, 0.18)",
  danger: "#C7332F",
  success: "#1F9D3A",
  white: "#FFFFFF",
};

export type Palette = typeof light;

const dark: Palette = {
  ember: "#FF7A45",
  emberInk: "#FF9A6B",
  emberSoft: "rgba(255, 122, 69, 0.12)",
  gold: "#F2B33D",
  goldSoft: "rgba(242, 179, 61, 0.14)",
  ink: "#F1F1F3",
  muted: "#A3A3A6",
  subtle: "#7C7C80",
  bg: "#121213",
  surface: "#1A1A1B",
  secondary: "rgba(255, 255, 255, 0.08)",
  line: "rgba(255, 255, 255, 0.1)",
  lineStrong: "rgba(255, 255, 255, 0.22)",
  danger: "#E5534B",
  success: "#3FB950",
  white: "#FFFFFF",
};

export const palettes = { light, dark };

export const colors = {
  ...light,
  card: light.surface,
  faint: light.line,
  accent: light.ember,
  accentSoft: light.emberSoft,
  money: light.gold,
  moneySoft: light.goldSoft,
};

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };

export const layout = {
  screenPadding: 20,
  cardGap: 10,
  cardPadding: 14,
  tapTarget: 44,
  buttonHeight: 44,
  filterChipHeight: 34,
  interestChipHeight: 40,
};

export const radius = { xs: 6, sm: 10, md: 14, lg: 16, pill: 999, tag: 6, button: 10, input: 10, card: 14 };

export const weight = { body: "400", medium: "500", title: "600" } as const satisfies Record<string, TextStyle["fontWeight"]>;

const tracking = (size: number) => size * -0.02;

export const type = {
  onboardingTitle: { fontSize: 26, lineHeight: 30, fontWeight: weight.title, letterSpacing: tracking(26) },
  screenTitle: { fontSize: 24, lineHeight: 29, fontWeight: weight.title, letterSpacing: tracking(24) },
  detailTitle: { fontSize: 22, lineHeight: 27, fontWeight: weight.title, letterSpacing: tracking(22) },
  brand: { fontSize: 17, lineHeight: 22, fontWeight: weight.title, letterSpacing: tracking(17) },
  cardTitle: { fontSize: 15, lineHeight: 20, fontWeight: weight.title },
  body: { fontSize: 15, lineHeight: 20, fontWeight: weight.body },
  bodyStrong: { fontSize: 15, lineHeight: 20, fontWeight: weight.medium },
  meta: { fontSize: 13, lineHeight: 18, fontWeight: weight.body },
  label: { fontSize: 13, lineHeight: 18, fontWeight: weight.medium },
  tag: { fontSize: 12, lineHeight: 16, fontWeight: weight.body },
  tab: { fontSize: 11, lineHeight: 13, fontWeight: weight.medium },
  numeric: { fontVariant: ["tabular-nums"] },
} as const satisfies Record<string, TextStyle>;

export const shadow = {
  card: {
    shadowColor: "#000",
    shadowOpacity: 0.06,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
    borderWidth: 0.5,
    borderColor: light.line,
  },
  plate: {
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 1,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
};

export const INVESTOR_LIKELY_MIN = 70;
export const INVESTOR_SOME_MIN = 40;

type EventType = Doc<"events">["eventType"];

export const EVENT_TYPE_META: Record<EventType, { label: string; color: string; emoji: string }> = {
  hackathon: { label: "Hackathon", color: "#5B5BD6", emoji: "💻" },
  pitch_competition: { label: "Pitch competition", color: light.ember, emoji: "🎤" },
  demo_day: { label: "Demo day", color: "#E5484D", emoji: "🚀" },
  networking: { label: "Networking", color: "#12A594", emoji: "🤝" },
  workshop: { label: "Workshop", color: "#D6409F", emoji: "🛠️" },
  talk: { label: "Talk", color: "#8E4EC6", emoji: "🎙️" },
  conference: { label: "Conference", color: "#0090FF", emoji: "🏛️" },
  career_fair: { label: "Career fair", color: "#AD7F58", emoji: "🎓" },
  social: { label: "Social", color: "#46A758", emoji: "🎉" },
  other: { label: "Event", color: light.muted, emoji: "📍" },
};
