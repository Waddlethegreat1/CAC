import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { InvestorBadge } from "@/components/investor-badge";
import { colors, EVENT_TYPE_META, radius } from "@/constants/theme";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import { INTERESTS } from "@/convex/lib/interests";
import { dateBadge, formatDistance, relativeDay } from "@/lib/format";

export type CardEvent = {
  _id: Id<"events">;
  title: string;
  startTime: number;
  endTime?: number;
  city: string;
  isOnline: boolean;
  imageUrl?: string;
  organizer?: string;
  eventType: Doc<"events">["eventType"];
  investorScore: number;
  distanceKm?: number | null;
  matched?: string[];
};

const interestLabel = (id: string) => INTERESTS.find((i) => i.id === id)?.label ?? id;

export function EventCard({ event }: { event: CardEvent }) {
  const meta = EVENT_TYPE_META[event.eventType];
  const badge = dateBadge(event.startTime);
  const distance = formatDistance(event.distanceKm ?? null, event.isOnline);
  const place = [event.isOnline ? undefined : event.city, distance].filter(Boolean).join(" · ");
  return (
    <Pressable
      testID={`event-card-${event._id}`}
      accessibilityRole="button"
      accessibilityLabel={event.title}
      onPress={() => router.push({ pathname: "/event/[id]", params: { id: event._id } })}
      style={({ pressed }) => [styles.card, pressed && { transform: [{ scale: 0.985 }] }]}
    >
      <View style={[styles.date, { backgroundColor: meta.color }]}>
        {event.imageUrl ? <Image source={{ uri: event.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : null}
        <View style={styles.dateInner}>
          <Text style={styles.month}>{badge.month}</Text>
          <Text style={styles.day}>{badge.day}</Text>
        </View>
      </View>
      <View style={styles.body}>
        <View style={styles.row}>
          <Text style={[styles.type, { color: meta.color }]}>
            {meta.emoji} {meta.label}
          </Text>
          <InvestorBadge score={event.investorScore} />
        </View>
        <Text style={styles.title} numberOfLines={2}>
          {event.title}
        </Text>
        <Text style={styles.meta} numberOfLines={1}>
          {relativeDay(event.startTime, event.endTime)}
          {place ? ` · ${place}` : ""}
        </Text>
        {event.matched && event.matched.length > 0 ? (
          <Text style={styles.match} numberOfLines={1}>
            Matches {event.matched.map(interestLabel).join(", ")}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    padding: 12,
    gap: 12,
    shadowColor: "#000",
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  date: { width: 64, height: 76, borderRadius: radius.sm, overflow: "hidden", justifyContent: "flex-end" },
  dateInner: { backgroundColor: "rgba(0,0,0,0.35)", paddingVertical: 4, alignItems: "center" },
  month: { color: colors.white, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  day: { color: colors.white, fontSize: 20, fontWeight: "800", marginTop: -2 },
  body: { flex: 1, gap: 4 },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 6 },
  type: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  title: { fontSize: 16, fontWeight: "700", color: colors.ink, lineHeight: 21 },
  meta: { fontSize: 13, color: colors.muted },
  match: { fontSize: 12, color: colors.accent, fontWeight: "600" },
});
