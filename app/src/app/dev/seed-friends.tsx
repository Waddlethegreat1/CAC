import { useMutation } from "convex/react";
import { Redirect, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/theme";
import { api } from "@/convex/_generated/api";
import { useDeviceId } from "@/lib/device";

const ENABLED = process.env.EXPO_PUBLIC_TEST_FIXTURES === "1";
const SETTLE_MS = 1500;

export default function SeedFriends() {
  if (!ENABLED) return <Redirect href="/" />;
  return <Seed />;
}

function Seed() {
  const deviceId = useDeviceId();
  const { to } = useLocalSearchParams<{ to?: string }>();
  const seed = useMutation(api.fixtures.seedFriendsDemo);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!deviceId) return;
    seed({ deviceId })
      .then(({ goingEventId }) => setTimeout(() => (to === "event" ? router.replace({ pathname: "/event/[id]", params: { id: goingEventId } }) : router.replace("/friends")), SETTLE_MS))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [deviceId, seed, to]);

  return (
    <View style={styles.center}>
      {error ? <Text style={styles.error}>Seeding failed: {error}</Text> : <ActivityIndicator color={colors.ember} />}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, backgroundColor: colors.bg },
  error: { color: colors.danger, textAlign: "center" },
});
