import { useMutation } from "convex/react";
import { Redirect } from "expo-router";

import { DevSeed } from "@/components/dev-seed";
import { api } from "@/convex/_generated/api";

const ENABLED = process.env.EXPO_PUBLIC_TEST_FIXTURES === "1";

export default function SeedTalentMatch() {
  if (!ENABLED) return <Redirect href="/" />;
  return <Seed />;
}

function Seed() {
  const seed = useMutation(api.fixtures.seedTalentMatch);
  return <DevSeed role="student" seed={(deviceId) => seed({ deviceId })} open={({ eventId }) => ({ tab: "feed", push: { pathname: "/event/[id]", params: { id: eventId } } })} />;
}
