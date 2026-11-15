import { useMutation, useQuery } from "convex/react";
import { router, useLocalSearchParams, type ErrorBoundaryProps } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, Linking, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button } from "@/components/button";
import { Card, Notice, PendingVerificationNotice, Pill, ScreenHeader, SectionTitle, styles, VerificationBadge } from "@/components/connections/ui";
import { colors, space } from "@/constants/theme";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDeviceId } from "@/lib/device";
import { confirm, errorCopy, eventEnded, shortDate, useIsVerifiedHost } from "@/lib/connections";

type EventSummary = { _id: Id<"events">; title: string; startTime: number; endTime?: number };

export function ErrorBoundary({ error, retry }: ErrorBoundaryProps) {
  return (
    <SafeAreaView style={styles.safe}>
      <ScreenHeader title="Company" fallback="/companies" />
      <View style={styles.content}>
        <Notice tone="danger" title="Couldn't load this company" body={errorCopy(error)} />
        <Button label="Try again" variant="outline" style={{ marginTop: space.md }} onPress={retry} />
      </View>
    </SafeAreaView>
  );
}

function useRun() {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (key: string, action: () => Promise<unknown>) => {
    setBusy(key);
    setError(null);
    try { await action(); return true; } catch (e) { setError(errorCopy(e)); return false; } finally { setBusy(null); }
  };
  return { busy, error, run };
}

export default function CompanyScreen() {
  const { id } = useLocalSearchParams<{ id: Id<"companies"> }>();
  const deviceId = useDeviceId();
  const isHost = useIsVerifiedHost();
  const page = useQuery(api.companies.get, deviceId ? { deviceId, companyId: id } : "skip");
  const me = useQuery(api.users.get, deviceId ? { deviceId } : "skip");
  const removeMember = useMutation(api.companies.removeMember);
  const unclaim = useMutation(api.companies.unclaimEvent);
  const { busy, error, run } = useRun();

  if (page === undefined) return <ActivityIndicator style={{ flex: 1, backgroundColor: colors.bg }} color={colors.ember} />;
  if (page === null) {
    return (
      <SafeAreaView style={styles.safe}>
        <ScreenHeader title="Company" fallback="/companies" />
        <View style={styles.content}><Notice title="This company no longer exists" /></View>
      </SafeAreaView>
    );
  }
  const { company, myRole, members, pendingInvites, hostedEvents } = page;
  const owner = myRole === "owner";
  const member = myRole !== null && isHost === true;

  const leave = async () => {
    if (!deviceId || !me) return;
    if (!await confirm(`Leave ${company.name}?`, "You'll lose access to its inbox and chats. An owner can invite you again", "Leave")) return;
    if (await run("leave", () => removeMember({ deviceId, companyId: company._id, userId: me._id }))) router.replace("/companies");
  };

  return (
    <SafeAreaView style={styles.safe} edges={["top"]}>
      <ScreenHeader title={company.name} subtitle={myRole ? (owner ? "You own this company" : "You're a member") : undefined} fallback="/companies" />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={[styles.inline, { flexWrap: "wrap" }]}>
          <VerificationBadge company={company} />
          {company.website ? (
            <Pressable accessibilityRole="link" onPress={() => Linking.openURL(company.website!).catch(() => undefined)}>
              <Text style={[styles.meta, { color: colors.emberInk }]}>{company.website.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")}</Text>
            </Pressable>
          ) : null}
        </View>
        {member && !company.verified ? <PendingVerificationNotice /> : null}
        {error ? <Notice tone="danger" title="That didn't work" body={error} /> : null}

        <SectionTitle>Members</SectionTitle>
        <Card>
          {members.map((m, i) => {
            const self = m.userId !== undefined && m.userId === me?._id;
            return (
              <View key={m.userId ?? `${m.name}-${i}`} style={[styles.row, styles.inline, i > 0 && styles.divider]}>
                <Text style={[styles.body, { flex: 1 }]}>{m.name ?? "Unnamed member"}{self ? " (you)" : ""}</Text>
                {m.role ? <Pill label={m.role === "owner" ? "Owner" : "Member"} /> : null}
                {owner && m.role === "member" && m.userId ? (
                  <Button
                    testID={`remove-${m.userId}`}
                    label="Remove"
                    variant="ghost"
                    style={styles.small}
                    loading={busy === m.userId}
                    onPress={async () => {
                      if (deviceId && m.userId && await confirm(`Remove ${m.name ?? "this member"}?`, "They lose access to this company's inbox and chats", "Remove")) await run(m.userId, () => removeMember({ deviceId, companyId: company._id, userId: m.userId! }));
                    }}
                  />
                ) : null}
              </View>
            );
          })}
        </Card>
        {myRole === "member" ? <Button testID="leave-company" label="Leave company" variant="ghost" loading={busy === "leave"} onPress={() => void leave()} /> : null}

        {owner ? <Invites companyId={company._id} pending={pendingInvites ?? []} /> : null}

        <SectionTitle>Hosted events</SectionTitle>
        {hostedEvents.length ? (
          <Card>
            {hostedEvents.map((e, i) => (
              <View key={e._id} style={[styles.row, i > 0 && styles.divider]}>
                <Pressable accessibilityRole="button" onPress={() => router.push({ pathname: "/event/[id]", params: { id: e._id } })}>
                  <Text style={styles.title}>{e.title}</Text>
                  <Text style={styles.meta}>{shortDate(e.startTime)} · {eventEnded(e) ? "Ended" : "Upcoming"}</Text>
                </Pressable>
                {member ? (
                  <View style={styles.actions}>
                    {eventEnded(e) && company.verified ? (
                      <Button testID={`talent-${e._id}`} label="See talent who went" variant="outline" style={styles.small} onPress={() => router.push({ pathname: "/company/[id]/talent/[eventId]", params: { id: company._id, eventId: e._id } })} />
                    ) : null}
                    {owner ? <Button testID={`unclaim-${e._id}`} label="Unclaim" variant="ghost" style={styles.small} loading={busy === e._id} onPress={() => deviceId && void run(e._id, () => unclaim({ deviceId, companyId: company._id, eventId: e._id }))} /> : null}
                  </View>
                ) : null}
              </View>
            ))}
          </Card>
        ) : (
          <Text style={styles.meta}>No claimed events yet</Text>
        )}
        {member && company.verified ? <Claimable companyId={company._id} /> : null}
        {member && !company.verified ? <Text style={[styles.meta, { marginTop: space.sm }]}>You can claim events once Scout verifies this company</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Invites({ companyId, pending }: { companyId: Id<"companies">; pending: { email: string; createdAt: number }[] }) {
  const deviceId = useDeviceId();
  const invite = useMutation(api.companies.invite);
  const cancel = useMutation(api.companies.cancelInvite);
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const { busy, error, run } = useRun();
  const send = async () => {
    if (!deviceId) return;
    setSent(false);
    if (await run("invite", () => invite({ deviceId, companyId, email }))) {
      setEmail("");
      setSent(true);
    }
  };
  return (
    <>
      <SectionTitle>Invite a teammate</SectionTitle>
      <Card style={{ padding: 14, gap: space.sm }}>
        <TextInput testID="invite-email" accessibilityLabel="Teammate's email" value={email} onChangeText={(t) => { setEmail(t); setSent(false); }} placeholder="name@company.com" placeholderTextColor={colors.subtle} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" style={styles.input} />
        <Button testID="send-invite" label="Send invite" loading={busy === "invite"} disabled={!email.trim()} onPress={() => void send()} />
        {sent ? <Text testID="invite-sent" style={styles.meta}>Invite saved. Whoever has or adds that email on their Scout profile will see it in Companies</Text> : null}
        {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
      </Card>
      {pending.length ? (
        <>
          <SectionTitle>Pending invites</SectionTitle>
          <Card>
            {pending.map((p, i) => (
              <View key={p.email} style={[styles.row, styles.inline, i > 0 && styles.divider]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.body} numberOfLines={1}>{p.email}</Text>
                  <Text style={styles.meta}>Sent {shortDate(p.createdAt)}</Text>
                </View>
                <Button testID={`cancel-invite-${i}`} label="Cancel" variant="ghost" style={styles.small} loading={busy === p.email} onPress={() => deviceId && void run(p.email, () => cancel({ deviceId, companyId, email: p.email }))} />
              </View>
            ))}
          </Card>
        </>
      ) : null}
    </>
  );
}

function Claimable({ companyId }: { companyId: Id<"companies"> }) {
  const deviceId = useDeviceId();
  const events = useQuery(api.companies.claimable, deviceId ? { deviceId, companyId } : "skip");
  const claim = useMutation(api.companies.claimEvent);
  const { busy, error, run } = useRun();
  return (
    <>
      <SectionTitle>Events listing you as host</SectionTitle>
      {events === undefined ? (
        <ActivityIndicator color={colors.ember} />
      ) : events.length ? (
        <Card>
          {events.map((e: EventSummary, i) => (
            <View key={e._id} style={[styles.row, styles.inline, i > 0 && styles.divider]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.title}>{e.title}</Text>
                <Text style={styles.meta}>{shortDate(e.startTime)} · {eventEnded(e) ? "Ended" : "Upcoming"}</Text>
              </View>
              <Button testID={`claim-${e._id}`} label="Claim" variant="outline" style={styles.small} loading={busy === e._id} onPress={() => deviceId && void run(e._id, () => claim({ deviceId, companyId, eventId: e._id }))} />
            </View>
          ))}
        </Card>
      ) : (
        <Text style={styles.meta}>No unclaimed events list this company as host or organizer right now</Text>
      )}
      <Text style={[styles.meta, { marginTop: space.sm }]}>Only events whose listing names this company as host or organizer can be claimed</Text>
      {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    </>
  );
}
