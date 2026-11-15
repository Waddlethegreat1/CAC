import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { rawEvent } from "./lib/rawEvent";

export const eventType = v.union(
  v.literal("hackathon"),
  v.literal("pitch_competition"),
  v.literal("demo_day"),
  v.literal("networking"),
  v.literal("workshop"),
  v.literal("talk"),
  v.literal("conference"),
  v.literal("career_fair"),
  v.literal("social"),
  v.literal("other"),
);

export const audience = v.union(
  v.literal("students"),
  v.literal("founders"),
  v.literal("investors"),
  v.literal("developers"),
  v.literal("general"),
);

export const role = v.union(v.literal("student"), v.literal("investor"));

export const eventFields = {
  title: v.string(),
  description: v.string(),
  startTime: v.number(),
  endTime: v.optional(v.number()),
  timezone: v.string(),
  venue: v.optional(v.string()),
  address: v.optional(v.string()),
  lat: v.optional(v.number()),
  lng: v.optional(v.number()),
  city: v.string(),
  isOnline: v.boolean(),
  url: v.string(),
  imageUrl: v.optional(v.string()),
  source: v.string(),
  sourceId: v.string(),
  organizer: v.optional(v.string()),
  hosts: v.array(v.string()),
  tags: v.array(v.string()),
  eventType,
  audience: v.array(audience),
  investorScore: v.number(),
  investorSignals: v.array(v.string()),
};

export const normalizedEvent = v.object(eventFields);

export const eventSource = v.object({ url: v.string(), source: v.string(), sourceId: v.string() });

export default defineSchema({
  feeds: defineTable({
    source: v.string(),
    name: v.string(),
    url: v.string(),
    enabled: v.boolean(),
    intervalMinutes: v.number(),
    tier: v.optional(v.string()),
    lastFetchedAt: v.optional(v.number()),
    nextFetchAt: v.optional(v.number()),
    lastStatus: v.optional(v.union(v.literal("ok"), v.literal("error"))),
  })
    .index("by_url", ["url"])
    .index("by_source", ["source"])
    .index("by_enabled_nextFetchAt", ["enabled", "nextFetchAt"]),

  fetch_log: defineTable({
    feedId: v.id("feeds"),
    startedAt: v.number(),
    finishedAt: v.number(),
    durationMs: v.number(),
    status: v.union(v.literal("ok"), v.literal("error"), v.literal("skipped_robots")),
    rawCount: v.number(),
    insertedCount: v.number(),
    error: v.optional(v.string()),
  }).index("by_feed", ["feedId", "startedAt"]),

  robots_cache: defineTable({
    domain: v.string(),
    body: v.string(),
    fetchedAt: v.number(),
    expiresAt: v.number(),
  }).index("by_domain", ["domain"]),

  domain_rate: defineTable({
    domain: v.string(),
    nextAllowedAt: v.number(),
  }).index("by_domain", ["domain"]),

  raw_listings: defineTable({
    feedId: v.optional(v.id("feeds")),
    source: v.string(),
    sourceId: v.string(),
    raw: rawEvent,
    fetchedAt: v.number(),
  }).index("by_source_sourceId", ["source", "sourceId"]),

  events: defineTable({
    ...eventFields,
    rawListingId: v.optional(v.id("raw_listings")),
    lastSeenAt: v.number(),
    school: v.optional(v.string()),
    studentDensity: v.optional(v.number()),
    dedupeKey: v.optional(v.string()),
    sources: v.optional(v.array(eventSource)),
  })
    .index("by_start", ["startTime"])
    .index("by_dedupeKey", ["dedupeKey"])
    .index("by_school_start", ["school", "startTime"])
    .index("by_source_sourceId", ["source", "sourceId"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["city", "eventType", "source"],
    }),

  geocode_cache: defineTable({
    key: v.string(),
    lat: v.optional(v.number()),
    lng: v.optional(v.number()),
    city: v.optional(v.string()),
    fetchedAt: v.number(),
  }).index("by_key", ["key"]),

  users: defineTable({
    deviceId: v.string(),
    role,
    interests: v.array(v.string()),
    city: v.string(),
    lat: v.number(),
    lng: v.number(),
    locationSource: v.union(v.literal("device"), v.literal("city")),
    radiusKm: v.optional(v.number()),
    updatedAt: v.number(),
  }).index("by_device", ["deviceId"]),

  interests: defineTable({
    slug: v.string(),
    label: v.string(),
    emoji: v.string(),
    order: v.number(),
  }).index("by_slug", ["slug"]),

  saves: defineTable({
    userId: v.id("users"),
    eventId: v.id("events"),
    savedAt: v.number(),
  })
    .index("by_user", ["userId", "savedAt"])
    .index("by_user_event", ["userId", "eventId"])
    .index("by_event", ["eventId"]),

  attendance: defineTable({
    userId: v.id("users"),
    eventId: v.id("events"),
    going: v.boolean(),
    attended: v.optional(v.boolean()),
    rating: v.optional(v.number()),
    investors: v.optional(v.union(v.literal("yes"), v.literal("no"), v.literal("unsure"))),
    note: v.optional(v.string()),
    dismissedAt: v.optional(v.number()),
  })
    .index("by_user_event", ["userId", "eventId"])
    .index("by_user_going", ["userId", "going"])
    .index("by_user_attended", ["userId", "attended"]),

  attendance_totals: defineTable({
    eventId: v.id("events"),
    ratingCount: v.number(),
    ratingSum: v.number(),
    investorConfirmations: v.number(),
  }).index("by_event", ["eventId"]),
});
