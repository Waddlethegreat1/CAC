import { ConvexProvider } from "convex/react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { colors } from "@/constants/theme";
import { convex } from "@/lib/convex";
import { DeviceProvider } from "@/lib/device";

export default function RootLayout() {
  return (
    <ConvexProvider client={convex}>
      <DeviceProvider>
        <SafeAreaProvider>
          <StatusBar style="dark" />
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="index" />
            <Stack.Screen name="onboarding" options={{ gestureEnabled: false }} />
            <Stack.Screen name="feed" options={{ gestureEnabled: false }} />
            <Stack.Screen name="event/[id]" />
            <Stack.Screen name="saved" />
          </Stack>
        </SafeAreaProvider>
      </DeviceProvider>
    </ConvexProvider>
  );
}
