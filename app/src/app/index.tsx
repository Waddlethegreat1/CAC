import { useQuery } from "convex/react";
import { Redirect } from "expo-router";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { colors } from "@/constants/theme";
import { api } from "@/convex/_generated/api";
import { useDeviceId } from "@/lib/device";

export default function Index() {
  const deviceId = useDeviceId();
  const profile = useQuery(api.users.get, deviceId ? { deviceId } : "skip");

  if (!deviceId || profile === undefined) {
    return (
      <View style={styles.center}>
        <Text style={styles.logo}>Scout</Text>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }
  return <Redirect href={profile ? "/feed" : "/onboarding"} />;
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 16, backgroundColor: colors.bg },
  logo: { fontSize: 40, fontWeight: "900", color: colors.ink, letterSpacing: -1 },
});
