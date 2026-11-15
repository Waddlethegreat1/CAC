import { useQuery } from "convex/react";
import { Redirect, router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, FlatList, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Chip } from "@/components/chip";
import { EventCard, type CardEvent } from "@/components/event-card";
import { colors, radius } from "@/constants/theme";
import { api } from "@/convex/_generated/api";
import { useDeviceId } from "@/lib/device";

type Filter = "all" | "investors" | "hackathons" | "pitch" | "networking" | "week";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "For you" },
  { id: "investors", label: "💰 Investors likely" },
  { id: "week", label: "This week" },
  { id: "hackathons", label: "Hackathons" },
  { id: "pitch", label: "Pitch & demo days" },
  { id: "networking", label: "Networking" },
];

export default function Feed() {
  const deviceId = useDeviceId();
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const feed = useQuery(api.feed.ranked, deviceId ? { deviceId, filter } : "skip");
  const results = useQuery(api.events.search, q.trim() ? { q } : "skip");

  if (feed === null) return <Redirect href="/onboarding" />;

  const searching = q.trim().length > 0;
  const data: CardEvent[] | undefined = searching ? results : feed?.events;

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <FlatList
        testID="feed-list"
        data={data ?? []}
        keyExtractor={(e) => e._id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => <EventCard event={item} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.topRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.kicker}>Events near</Text>
                <Pressable accessibilityRole="button" onPress={() => router.push("/onboarding")}>
                  <Text style={styles.city}>{feed?.city ?? " "} ▾</Text>
                </Pressable>
              </View>
              <Pressable testID="open-saved" accessibilityRole="button" accessibilityLabel="Saved events" onPress={() => router.push("/saved")} style={styles.iconBtn}>
                <Text style={styles.iconText}>♥ Saved</Text>
              </Pressable>
            </View>
            <TextInput
              testID="search-input"
              value={q}
              onChangeText={setQ}
              placeholder="Search events"
              placeholderTextColor={colors.muted}
              style={styles.search}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {!searching ? (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
                {FILTERS.map((f) => (
                  <Chip key={f.id} testID={`filter-${f.id}`} label={f.label} selected={filter === f.id} onPress={() => setFilter(f.id)} />
                ))}
              </ScrollView>
            ) : null}
          </View>
        }
        ListEmptyComponent={
          data === undefined ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={colors.accent} />
          ) : (
            <Text style={styles.empty}>{searching ? "No events match that search." : "Nothing here yet. Try another filter."}</Text>
          )
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  header: { gap: 14, paddingTop: 8, paddingBottom: 14 },
  topRow: { flexDirection: "row", alignItems: "center" },
  kicker: { color: colors.muted, fontSize: 13, fontWeight: "600" },
  city: { color: colors.ink, fontSize: 28, fontWeight: "900", letterSpacing: -0.6 },
  iconBtn: { backgroundColor: colors.card, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 9 },
  iconText: { color: colors.accent, fontWeight: "800" },
  search: {
    backgroundColor: colors.card,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
  },
  filters: { gap: 8, paddingRight: 16 },
  empty: { textAlign: "center", color: colors.muted, marginTop: 40, fontSize: 15 },
});
