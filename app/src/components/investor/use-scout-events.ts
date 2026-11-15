import { useQueries, useQuery } from "convex/react";
import { useMemo } from "react";

import { api } from "@/convex/_generated/api";
import type { Doc } from "@/convex/_generated/dataModel";

export function useScoutEvents(deviceId: string | null): Doc<"events">[] | undefined | null {
  const feed = useQuery(api.feed.ranked, deviceId ? { deviceId, filter: "all" } : "skip");
  const requests = useMemo(
    () => Object.fromEntries((feed?.events ?? []).map((e) => [e._id, { query: api.events.get, args: { id: e._id } }])),
    [feed],
  );
  const docs = useQueries(requests);
  if (feed === undefined) return undefined;
  if (feed === null) return null;
  const values = Object.values(docs);
  if (values.length < feed.events.length || values.some((d) => d === undefined)) return undefined;
  return values.filter((d): d is Doc<"events"> => !!d && !(d instanceof Error));
}
