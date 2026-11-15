import { useQuery } from "convex/react";
import { router } from "expo-router";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EventCard } from "@/components/event-card";
import { colors } from "@/constants/theme";
import { api } from "@/convex/_generated/api";
import { useDeviceId } from "@/lib/device";

export default function Saved() {
  const deviceId = useDeviceId();
  const saved = useQuery(api.saves.list, deviceId ? { deviceId } : "skip");
  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <FlatList
        data={saved ?? []}
        keyExtractor={(e) => e._id}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => <EventCard event={item} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Pressable accessibilityRole="button" accessibilityLabel="Back" onPress={() => router.back()}>
              <Text style={styles.back}>‹ Feed</Text>
            </Pressable>
            <Text style={styles.h1}>Saved</Text>
          </View>
        }
        ListEmptyComponent={saved ? <Text style={styles.empty}>Tap ♡ Save on an event to keep it here.</Text> : undefined}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  header: { gap: 6, paddingTop: 8, paddingBottom: 16 },
  back: { color: colors.accent, fontWeight: "700", fontSize: 16 },
  h1: { fontSize: 32, fontWeight: "900", color: colors.ink, letterSpacing: -0.8 },
  empty: { textAlign: "center", color: colors.muted, marginTop: 40 },
});
