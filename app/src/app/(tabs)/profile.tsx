import { useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/button";
import { Icon } from "@/components/icon";
import { Segmented } from "@/components/segmented";
import { SelectChip } from "@/components/select-chip";
import { colors, layout, radius, shadow, space, type } from "@/constants/theme";
import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";
import { RADIUS_OPTIONS, useDeviceId, useSearchRadius } from "@/lib/device";
import { AREAS, cityPlace, locateDevice, type Place, type Role } from "@/lib/profile";

type User = Doc<"users">;

export default function ProfileScreen() {
  const deviceId = useDeviceId();
  const user = useQuery(api.users.get, deviceId ? { deviceId } : "skip");

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <Text style={styles.title} accessibilityRole="header">
        Profile
      </Text>
      {user === undefined ? (
        <ActivityIndicator style={{ flex: 1 }} color={colors.ember} />
      ) : user === null ? (
        <View style={styles.missing}>
          <Text style={styles.body}>No profile on this device yet</Text>
          <Button label="Set up Scout" onPress={() => router.replace("/onboarding")} />
        </View>
      ) : (
        <ProfileForm user={user} />
      )}
    </SafeAreaView>
  );
}

function ProfileForm({ user }: { user: User }) {
  const catalog = useQuery(api.interests.list);
  const upsert = useMutation(api.users.upsert);
  const { radiusKm, setRadiusKm } = useSearchRadius();
  const [editingInterests, setEditingInterests] = useState(false);
  const [draft, setDraft] = useState<string[]>(user.interests);
  const [areaOpen, setAreaOpen] = useState(false);
  const [locating, setLocating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  const flash = (text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 2500);
  };

  const save = async (patch: Partial<{ role: Role; interests: string[] } & Place>, done: string) => {
    setError(null);
    try {
      await upsert({
        deviceId: user.deviceId,
        role: user.role,
        interests: user.interests,
        city: user.city,
        lat: user.lat,
        lng: user.lng,
        locationSource: user.locationSource,
        ...patch,
      });
      flash(done);
      return true;
    } catch {
      setError("Couldn't save: no connection. Try again");
      return false;
    }
  };

  const labelFor = (slug: string) => catalog?.find((i) => i.slug === slug)?.label ?? slug;

  const saveInterests = async () => {
    if (draft.length === 0) return setError("Pick at least one interest");
    if (await save({ interests: draft }, "Interests saved")) setEditingInterests(false);
  };

  const useMyLocation = async () => {
    setLocating(true);
    const result = await locateDevice();
    setLocating(false);
    if ("error" in result) return setError(result.error);
    if (await save(result.place, `Area set to near ${result.place.city}`)) setAreaOpen(false);
  };

  const pickArea = async (name: string) => {
    const place = cityPlace(name);
    if (place && (await save(place, `Area set to ${name}`))) setAreaOpen(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.group}>I am</Text>
      <Segmented
        accessibilityLabel="Role"
        options={[
          { value: "student" as Role, label: "Student", testID: "profile-role-student" },
          { value: "investor" as Role, label: "Investor", testID: "profile-role-investor" },
        ]}
        value={user.role}
        onChange={(role) => {
          if (role !== user.role) void save({ role }, role === "investor" ? "Investor mode on. Your feed now scouts student events" : "Student mode on");
        }}
      />

      <Text style={styles.group}>Interests</Text>
      {editingInterests ? (
        <>
          <View style={styles.chips}>
            {catalog?.map((i) => (
              <SelectChip
                key={i.slug}
                testID={`profile-interest-${i.slug}`}
                label={i.label}
                selected={draft.includes(i.slug)}
                onPress={() => setDraft((cur) => (cur.includes(i.slug) ? cur.filter((s) => s !== i.slug) : [...cur, i.slug]))}
              />
            ))}
          </View>
          <View style={styles.row}>
            <Button
              variant="ghost"
              label="Cancel"
              style={{ flex: 1 }}
              onPress={() => {
                setDraft(user.interests);
                setEditingInterests(false);
                setError(null);
              }}
            />
            <Button testID="save-interests" label="Save interests" style={{ flex: 2 }} onPress={saveInterests} />
          </View>
        </>
      ) : (
        <>
          <View style={styles.chips}>
            {user.interests.map((slug) => (
              <View key={slug} style={styles.tag}>
                <Text style={styles.tagText}>{labelFor(slug)}</Text>
              </View>
            ))}
          </View>
          <Button
            testID="edit-interests"
            variant="outline"
            label="Edit interests"
            style={{ marginTop: space.md }}
            onPress={() => {
              setDraft(user.interests);
              setEditingInterests(true);
            }}
          />
        </>
      )}

      <Text style={styles.group}>Location</Text>
      <View style={styles.card}>
        <Pressable
          testID="profile-area"
          accessibilityRole="button"
          accessibilityState={{ expanded: areaOpen }}
          onPress={() => setAreaOpen(!areaOpen)}
          style={styles.prow}
        >
          <Text style={styles.body}>Area</Text>
          <Text style={styles.value}>{user.locationSource === "device" ? `Near ${user.city}` : user.city}</Text>
          <Icon name={areaOpen ? "chevron-left" : "chevron-right"} size={16} color={colors.subtle} />
        </Pressable>
        {areaOpen ? (
          <View style={styles.areaPicker}>
            <Button
              testID="profile-use-location"
              variant="outline"
              label={locating ? "Finding you" : "Use my location"}
              loading={locating}
              icon={<Icon name="locate" size={18} color={colors.ember} />}
              onPress={useMyLocation}
            />
            <View style={styles.chips}>
              {AREAS.map((c) => (
                <SelectChip
                  key={c.name}
                  testID={`profile-city-${c.name}`}
                  label={c.name}
                  selected={user.locationSource === "city" && user.city === c.name}
                  onPress={() => void pickArea(c.name)}
                />
              ))}
            </View>
          </View>
        ) : null}
        <View style={[styles.prow, styles.divider]}>
          <Text style={styles.body}>Distance</Text>
        </View>
        <View style={{ paddingHorizontal: layout.cardPadding, paddingBottom: layout.cardPadding }}>
          <Segmented
            accessibilityLabel="Distance"
            options={RADIUS_OPTIONS.map((o) => ({ value: o.km, label: o.label, testID: `profile-radius-${o.km}` }))}
            value={radiusKm}
            onChange={(km) => {
              setRadiusKm(km);
              flash("Distance updated");
            }}
          />
        </View>
      </View>

      <Text style={styles.error} accessibilityRole="alert">
        {error ?? ""}
      </Text>
      {notice ? (
        <View style={styles.notice} accessibilityLiveRegion="polite">
          <Icon name="check" size={16} color={colors.success} strokeWidth={2} />
          <Text style={styles.noticeText}>{notice}</Text>
        </View>
      ) : null}

      <Button testID="restart-onboarding" variant="ghost" label="Start onboarding over" onPress={() => router.push("/onboarding")} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  title: { ...type.screenTitle, color: colors.ink, paddingHorizontal: layout.screenPadding, paddingVertical: space.md },
  missing: { flex: 1, padding: layout.screenPadding, gap: space.lg, justifyContent: "center" },
  content: { paddingHorizontal: layout.screenPadding, paddingBottom: space.xxxl },
  group: { ...type.label, color: colors.muted, marginTop: space.xl, marginBottom: space.sm },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space.sm },
  row: { flexDirection: "row", gap: space.sm, marginTop: space.md },
  tag: { height: 28, paddingHorizontal: 10, borderRadius: radius.tag, backgroundColor: colors.secondary, justifyContent: "center" },
  tagText: { ...type.meta, color: colors.ink },
  card: { backgroundColor: colors.surface, borderRadius: radius.card, ...shadow.card },
  prow: { flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: layout.tapTarget + 4, paddingHorizontal: layout.cardPadding },
  divider: { borderTopWidth: 0.5, borderTopColor: colors.line },
  areaPicker: { paddingHorizontal: layout.cardPadding, paddingBottom: layout.cardPadding, gap: space.md },
  body: { ...type.body, color: colors.ink, flex: 1 },
  value: { ...type.body, color: colors.muted, paddingVertical: space.md },
  error: { ...type.meta, color: colors.danger, minHeight: 18, marginTop: space.md },
  notice: { flexDirection: "row", alignItems: "center", gap: space.sm, marginBottom: space.sm },
  noticeText: { ...type.meta, color: colors.ink },
});
