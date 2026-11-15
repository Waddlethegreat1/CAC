import { useMutation, useQuery } from "convex/react";
import * as Location from "expo-location";
import { router } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Chip } from "@/components/chip";
import { colors, radius } from "@/constants/theme";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { BAY_AREA_CITIES, inBayArea, nearestCity } from "@/convex/lib/geo";
import { useDeviceId } from "@/lib/device";

type Role = "student" | "investor";
type Place = { city: string; lat: number; lng: number; locationSource: "device" | "city" };

const ROLES: { id: Role; title: string; blurb: string; emoji: string }[] = [
  { id: "student", title: "Student", blurb: "Find hackathons, pitch nights, and founders to meet.", emoji: "🎓" },
  { id: "investor", title: "Investor", blurb: "Scout student founders and demo days worth your time.", emoji: "🔭" },
];

const STUDENT_DEFAULTS = ["hackathons", "pitch", "networking"];
const INVESTOR_DEFAULTS = ["pitch", "vc", "founders"];

export default function Onboarding() {
  const deviceId = useDeviceId();
  const existing = useQuery(api.users.get, deviceId ? { deviceId } : "skip");
  if (!deviceId || existing === undefined) return <ActivityIndicator style={{ flex: 1 }} color={colors.accent} />;
  return <OnboardingForm deviceId={deviceId} existing={existing} />;
}

function OnboardingForm({ deviceId, existing }: { deviceId: string; existing: Doc<"users"> | null }) {
  const catalog = useQuery(api.interests.list);
  const upsert = useMutation(api.users.upsert);
  const [step, setStep] = useState(0);
  const [role, setRole] = useState<Role | null>(existing?.role ?? null);
  const [interests, setInterests] = useState<string[]>(existing?.interests ?? []);
  const [place, setPlace] = useState<Place | null>(
    existing ? { city: existing.city, lat: existing.lat, lng: existing.lng, locationSource: existing.locationSource } : null,
  );
  const [locating, setLocating] = useState(false);
  const [saving, setSaving] = useState(false);

  const pickRole = (r: Role) => {
    setRole(r);
    if (interests.length === 0) setInterests(r === "student" ? STUDENT_DEFAULTS : INVESTOR_DEFAULTS);
  };

  const toggleInterest = (id: string) =>
    setInterests((cur) => (cur.includes(id) ? cur.filter((i) => i !== id) : [...cur, id]));

  const useMyLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("Location is off", "Pick a city instead, or enable location in Settings.");
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      setPlace({ city: inBayArea(coords) ? nearestCity(coords).name : "Near you", ...coords, locationSource: "device" });
    } catch {
      Alert.alert("Couldn't get your location", "Pick a city instead.");
    } finally {
      setLocating(false);
    }
  };

  const finish = async () => {
    if (!role || !place) return;
    setSaving(true);
    try {
      await upsert({ deviceId, role, interests, ...place });
      router.replace("/feed");
    } finally {
      setSaving(false);
    }
  };

  const canContinue = [role !== null, interests.length > 0, place !== null][step];

  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <View style={styles.progress}>
        {[0, 1, 2].map((i) => (
          <View key={i} style={[styles.bar, i <= step && styles.barOn]} />
        ))}
      </View>
      <ScrollView contentContainerStyle={styles.content}>
        {step === 0 && (
          <>
            <Text style={styles.kicker}>Welcome to Scout</Text>
            <Text style={styles.h1}>Startup events near you, ranked for you.</Text>
            <Text style={styles.sub}>Which best describes you?</Text>
            <View style={{ gap: 12 }}>
              {ROLES.map((r) => (
                <Pressable
                  key={r.id}
                  testID={`role-${r.id}`}
                  accessibilityRole="button"
                  onPress={() => pickRole(r.id)}
                  style={[styles.roleCard, role === r.id && styles.roleOn]}
                >
                  <Text style={styles.roleEmoji}>{r.emoji}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.roleTitle, role === r.id && { color: colors.white }]}>{r.title}</Text>
                    <Text style={[styles.roleBlurb, role === r.id && { color: "#D9D4CC" }]}>{r.blurb}</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          </>
        )}
        {step === 1 && (
          <>
            <Text style={styles.kicker}>Step 2 of 3</Text>
            <Text style={styles.h1}>What are you into?</Text>
            <Text style={styles.sub}>Pick a few. We rank events that match higher.</Text>
            <View style={styles.chips}>
              {catalog === undefined ? <ActivityIndicator color={colors.accent} /> : null}
              {catalog?.map((i) => (
                <Chip
                  key={i.slug}
                  testID={`interest-${i.slug}`}
                  label={`${i.emoji} ${i.label}`}
                  selected={interests.includes(i.slug)}
                  onPress={() => toggleInterest(i.slug)}
                />
              ))}
            </View>
          </>
        )}
        {step === 2 && (
          <>
            <Text style={styles.kicker}>Step 3 of 3</Text>
            <Text style={styles.h1}>Where are you?</Text>
            <Text style={styles.sub}>We use this to sort events by distance. It stays on your profile only.</Text>
            <Pressable testID="use-location" accessibilityRole="button" onPress={useMyLocation} style={styles.locate}>
              {locating ? <ActivityIndicator color={colors.accent} /> : <Text style={styles.locateText}>📍 Use my current location</Text>}
            </Pressable>
            {place?.locationSource === "device" ? <Text style={styles.located}>Located near {place.city}</Text> : null}
            <Text style={styles.or}>or pick a city</Text>
            <View style={styles.chips}>
              {BAY_AREA_CITIES.map((c) => (
                <Chip
                  key={c.name}
                  testID={`city-${c.name}`}
                  label={c.name}
                  selected={place?.locationSource === "city" && place.city === c.name}
                  onPress={() => setPlace({ city: c.name, lat: c.lat, lng: c.lng, locationSource: "city" })}
                />
              ))}
            </View>
          </>
        )}
      </ScrollView>
      <View style={styles.footer}>
        {step > 0 ? (
          <Pressable accessibilityRole="button" onPress={() => setStep(step - 1)} style={styles.back}>
            <Text style={styles.backText}>Back</Text>
          </Pressable>
        ) : null}
        <Pressable
          testID="onboarding-next"
          accessibilityRole="button"
          disabled={!canContinue || saving}
          onPress={() => (step < 2 ? setStep(step + 1) : finish())}
          style={[styles.cta, (!canContinue || saving) && { opacity: 0.35 }]}
        >
          {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.ctaText}>{step < 2 ? "Continue" : "Show my events"}</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  progress: { flexDirection: "row", gap: 6, paddingHorizontal: 24, paddingTop: 8 },
  bar: { flex: 1, height: 4, borderRadius: 2, backgroundColor: colors.faint },
  barOn: { backgroundColor: colors.accent },
  content: { padding: 24, gap: 12 },
  kicker: { color: colors.accent, fontWeight: "800", fontSize: 13, textTransform: "uppercase", letterSpacing: 1 },
  h1: { fontSize: 32, fontWeight: "900", color: colors.ink, letterSpacing: -0.8, lineHeight: 36 },
  sub: { fontSize: 16, color: colors.muted, marginBottom: 12 },
  roleCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    padding: 18,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.faint,
  },
  roleOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  roleEmoji: { fontSize: 32 },
  roleTitle: { fontSize: 18, fontWeight: "800", color: colors.ink },
  roleBlurb: { fontSize: 14, color: colors.muted, marginTop: 2 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  locate: {
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    padding: 18,
    alignItems: "center",
  },
  locateText: { color: colors.accent, fontWeight: "800", fontSize: 16 },
  located: { color: colors.money, fontWeight: "700", textAlign: "center" },
  or: { color: colors.muted, textAlign: "center", marginVertical: 8 },
  footer: { flexDirection: "row", gap: 10, paddingHorizontal: 24, paddingBottom: 12, paddingTop: 8 },
  back: { paddingHorizontal: 20, justifyContent: "center", borderRadius: radius.pill, backgroundColor: colors.card },
  backText: { fontWeight: "700", color: colors.ink, fontSize: 16 },
  cta: { flex: 1, backgroundColor: colors.accent, borderRadius: radius.pill, paddingVertical: 17, alignItems: "center" },
  ctaText: { color: colors.white, fontWeight: "800", fontSize: 17 },
});
