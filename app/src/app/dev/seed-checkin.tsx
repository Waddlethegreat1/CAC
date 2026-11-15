import { useMutation } from "convex/react";
import { Redirect, router } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/theme";
import { api } from "@/convex/_generated/api";
import { useDeviceId } from "@/lib/device";

const ENABLED = process.env.EXPO_PUBLIC_TEST_FIXTURES === "1";

export default function SeedCheckin() {
  if (!ENABLED) return <Redirect href="/" />;
  return <Seed />;
}

function Seed() {
  const deviceId = useDeviceId();
  const seed = useMutation(api.fixtures.seedPastCommitment);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!deviceId) return;
    seed({ deviceId })
      .then(() => router.replace("/feed"))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, [deviceId, seed]);

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
