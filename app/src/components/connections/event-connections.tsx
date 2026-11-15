import { useMutation, useQuery } from "convex/react";
import { router } from "expo-router";
import { useState } from "react";
import { Text, View } from "react-native";

import { Button } from "@/components/button";
import { InterestSheet } from "@/components/connections/interest-sheet";
import { Card, Notice, SectionTitle, styles, VerificationBadge } from "@/components/connections/ui";
import { layout } from "@/constants/theme";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useDeviceId } from "@/lib/device";
import { eventEnded, isPendingVerification, shortDate, useIsVerifiedHost } from "@/lib/connections";

type Company = { _id: Id<"companies">; name: string; verified?: boolean };

export function EventConnections({ event }: { event: { _id: Id<"events">; title: string; startTime: number; endTime?: number } }) {
  const deviceId = useDeviceId();
  const isHost = useIsVerifiedHost();
  const discover = useQuery(api.connections.discover, deviceId ? { deviceId } : "skip");
  const mine = useQuery(api.companies.mine, deviceId && isHost ? { deviceId } : "skip");
  if (!eventEnded(event)) return null;
  const hosts = discover?.find((d) => d.event._id === event._id)?.companies ?? [];
  const memberships = mine?.memberships ?? [];
  if (!hosts.length && !memberships.length) return null;
  return (
    <View testID="event-connections" style={{ marginHorizontal: layout.screenPadding }}>
      {hosts.length ? (
        <>
          <SectionTitle>Connect with the hosts</SectionTitle>
          <Card>
            {hosts.map((h, i) => (
              <HostRow key={h.company._id} eventId={event._id} eventTitle={event.title} company={h.company} status={h.connectionStatus} blockedUntil={h.blockedUntil} first={i === 0} />
            ))}
          </Card>
          <Text style={[styles.meta, { marginTop: 6 }]}>You went to this event, so you can tell its hosts you&apos;re interested. Chat opens when they accept</Text>
        </>
      ) : null}
      {memberships.map((m) => <HostedEventLink key={m.company._id} company={m.company} eventId={event._id} />)}
    </View>
  );
}

function HostRow({ eventId, eventTitle, company, status, blockedUntil, first }: { eventId: Id<"events">; eventTitle: string; company: Company; status: string | null; blockedUntil: number | null; first: boolean }) {
  const deviceId = useDeviceId();
  const express = useMutation(api.connections.expressInterest);
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const live = status === "pending" || status === "accepted";
  return (
    <View style={[styles.row, !first && styles.divider]}>
      <View style={styles.inline}>
        <Text style={styles.title}>{company.name}</Text>
        <VerificationBadge company={company} />
      </View>
      {status === "accepted" ? (
        <Button testID={`open-inbox-${company._id}`} label="Connected · Open Inbox" variant="outline" style={styles.small} onPress={() => router.push("/inbox")} />
      ) : status === "pending" ? (
        <Text style={styles.meta}>{sent ?? "Interest sent. Waiting for a reply. Manage it in Inbox"}</Text>
      ) : blockedUntil ? (
        <Text style={styles.meta}>This connection was declined. You can reach out again after {shortDate(blockedUntil)}</Text>
      ) : isPendingVerification(company) ? (
        <Text style={styles.meta}>This company is pending verification by Scout, so it can&apos;t receive interest yet</Text>
      ) : !live ? (
        <Button testID={`interested-${company._id}`} label={`Interested in ${company.name}`} style={styles.small} onPress={() => setOpen(true)} />
      ) : null}
      <InterestSheet
        visible={open}
        title={`Interested in ${company.name}`}
        subtitle={`They'll see your name and that you went to ${eventTitle}. Your contact details stay private unless you choose to share them after you connect`}
        placeholder="Add a short note, like what caught your eye"
        submitLabel="Send interest"
        onClose={() => setOpen(false)}
        onSubmit={async (message) => {
          if (!deviceId) return;
          const result = await express({ deviceId, companyId: company._id, eventId, ...(message ? { message } : {}) });
          setSent(result.status === "accepted" ? "They were already interested in you. You're connected" : "Interest sent. Waiting for a reply. Manage it in Inbox");
        }}
      />
    </View>
  );
}

function HostedEventLink({ company, eventId }: { company: Company; eventId: Id<"events"> }) {
  const deviceId = useDeviceId();
  const page = useQuery(api.companies.get, deviceId ? { deviceId, companyId: company._id } : "skip");
  if (!page?.hostedEvents.some((e) => e._id === eventId)) return null;
  return (
    <>
      <SectionTitle>Hosted by {company.name}</SectionTitle>
      {isPendingVerification(company) ? (
        <Notice tone="pending" title="Pending verification" body="Scout reviews new companies before they can reach talent. Talent who went will show here once your company is verified" />
      ) : (
        <Button
          testID={`event-talent-${company._id}`}
          label="See talent who went"
          variant="outline"
          onPress={() => router.push({ pathname: "/company/[id]/talent/[eventId]", params: { id: company._id, eventId } })}
        />
      )}
    </>
  );
}
