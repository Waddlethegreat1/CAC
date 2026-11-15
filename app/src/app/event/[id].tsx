import { useMutation, useQuery } from "convex/react";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { colors, EVENT_TYPE_META, radius } from "@/constants/theme";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { INTERESTS } from "@/convex/lib/interests";
import { useDeviceId } from "@/lib/device";
import { formatRange } from "@/lib/format";

const SOURCE_LABEL: Record<string, string> = { devpost: "Devpost", luma: "Luma", seed: "Scout picks" };

export default function EventDetail() {
  const { id } = useLocalSearchParams<{ id: Id<"events"> }>();
  const deviceId = useDeviceId();
  const event = useQuery(api.events.get, { id });
  const saved = useQuery(api.saves.isSaved, deviceId ? { deviceId, eventId: id } : "skip");
  const toggle = useMutation(api.saves.toggle);

  if (event === undefined) return <ActivityIndicator style={{ flex: 1 }} color={colors.accent} />;
  if (event === null) {
    return (
      <SafeAreaView style={styles.safe}>
        <Text style={styles.missing}>This event is no longer listed.</Text>
      </SafeAreaView>
    );
  }

  const meta = EVENT_TYPE_META[event.eventType];
  const tagLabels = event.tags.map((t) => INTERESTS.find((i) => i.id === t)).filter((i) => i !== undefined);

  return (
    <View style={styles.safe}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }}>
        <View style={[styles.hero, { backgroundColor: meta.color }]}>
          {event.imageUrl ? <Image source={{ uri: event.imageUrl }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Text style={styles.heroEmoji}>{meta.emoji}</Text>}
          <SafeAreaView edges={["top"]} style={styles.heroBar}>
            <Pressable testID="back" accessibilityRole="button" accessibilityLabel="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/feed"))} style={styles.round}>
              <Text style={styles.roundText}>‹</Text>
            </Pressable>
          </SafeAreaView>
        </View>
        <View style={styles.body}>
          <Text style={[styles.type, { color: meta.color }]}>
            {meta.label} · via {SOURCE_LABEL[event.source] ?? event.source}
          </Text>
          <Text testID="event-title" style={styles.title}>
            {event.title}
          </Text>
          <View style={styles.facts}>
            <Text style={styles.fact}>🗓 {formatRange(event.startTime, event.endTime)}</Text>
            <Text style={styles.fact}>📍 {event.isOnline ? "Online" : [event.venue, event.city].filter(Boolean).join(", ")}</Text>
            {event.organizer ? <Text style={styles.fact}>👥 {event.organizer}</Text> : null}
          </View>

          <View style={[styles.signal, event.investorScore >= 60 && styles.signalOn]}>
            <View style={styles.signalHead}>
              <Text style={styles.signalTitle}>{event.investorScore >= 60 ? "💰 Investors likely" : "Investor signal"}</Text>
              <Text style={styles.signalScore}>{event.investorScore}/100</Text>
            </View>
            <View style={styles.meter}>
              <View style={[styles.meterFill, { width: `${event.investorScore}%` }]} />
            </View>
            {event.investorSignals.length ? (
              event.investorSignals.map((s) => (
                <Text key={s} style={styles.reason}>
                  • {s}
                </Text>
              ))
            ) : (
              <Text style={styles.reason}>No investor signals in this listing yet.</Text>
            )}
          </View>

          {event.description ? <Text style={styles.description}>{event.description}</Text> : null}

          {tagLabels.length ? (
            <View style={styles.tags}>
              {tagLabels.map((t) => (
                <View key={t.id} style={styles.tag}>
                  <Text style={styles.tagText}>
                    {t.emoji} {t.label}
                  </Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      </ScrollView>
      <SafeAreaView edges={["bottom"]} style={styles.bottom}>
        <Pressable
          testID="save-event"
          accessibilityRole="button"
          accessibilityLabel={saved ? "Saved" : "Save"}
          disabled={!deviceId}
          onPress={() => deviceId && toggle({ deviceId, eventId: event._id })}
          style={[styles.save, saved && styles.saveOn]}
        >
          <Text style={[styles.saveText, saved && { color: colors.white }]}>{saved ? "♥ Saved" : "♡ Save"}</Text>
        </Pressable>
        <Pressable testID="open-link" accessibilityRole="button" onPress={() => WebBrowser.openBrowserAsync(event.url)} style={styles.open}>
          <Text style={styles.openText}>Open event page ↗</Text>
        </Pressable>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  missing: { textAlign: "center", marginTop: 80, color: colors.muted },
  hero: { height: 240, justifyContent: "center", alignItems: "center" },
  heroEmoji: { fontSize: 88 },
  heroBar: { position: "absolute", top: 0, left: 16 },
  round: { width: 40, height: 40, borderRadius: 20, backgroundColor: "rgba(255,255,255,0.92)", alignItems: "center", justifyContent: "center", marginTop: 6 },
  roundText: { fontSize: 28, fontWeight: "700", color: colors.ink, marginTop: -3 },
  body: { padding: 20, gap: 14 },
  type: { fontSize: 13, fontWeight: "800", textTransform: "uppercase", letterSpacing: 0.6 },
  title: { fontSize: 28, fontWeight: "900", color: colors.ink, letterSpacing: -0.6, lineHeight: 32 },
  facts: { gap: 6 },
  fact: { fontSize: 15, color: colors.ink },
  signal: { backgroundColor: colors.card, borderRadius: radius.md, padding: 16, gap: 8 },
  signalOn: { backgroundColor: colors.moneySoft },
  signalHead: { flexDirection: "row", justifyContent: "space-between" },
  signalTitle: { fontWeight: "800", fontSize: 16, color: colors.money },
  signalScore: { fontWeight: "800", fontSize: 16, color: colors.money },
  meter: { height: 6, borderRadius: 3, backgroundColor: "rgba(14,138,95,0.15)", overflow: "hidden" },
  meterFill: { height: 6, backgroundColor: colors.money },
  reason: { color: colors.ink, fontSize: 14 },
  description: { fontSize: 16, lineHeight: 23, color: colors.ink },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: 12, paddingVertical: 6 },
  tagText: { fontSize: 13, fontWeight: "600", color: colors.ink },
  bottom: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: "row",
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.faint,
  },
  save: { paddingHorizontal: 20, paddingVertical: 16, borderRadius: radius.pill, backgroundColor: colors.card, marginBottom: 8 },
  saveOn: { backgroundColor: colors.ink },
  saveText: { fontWeight: "800", fontSize: 16, color: colors.ink },
  open: { flex: 1, alignItems: "center", paddingVertical: 16, borderRadius: radius.pill, backgroundColor: colors.accent, marginBottom: 8 },
  openText: { color: colors.white, fontWeight: "800", fontSize: 16 },
});
