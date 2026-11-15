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

export default defineSchema({
  feeds: defineTable({
    source: v.string(),
    name: v.string(),
    url: v.string(),
    enabled: v.boolean(),
    intervalMinutes: v.number(),
    lastFetchedAt: v.optional(v.number()),
    lastStatus: v.optional(v.union(v.literal("ok"), v.literal("error"))),
  })
    .index("by_url", ["url"])
    .index("by_source", ["source"]),

  fetch_log: defineTable({
    feedId: v.id("feeds"),
    startedAt: v.number(),
    finishedAt: v.number(),
    status: v.union(v.literal("ok"), v.literal("error")),
    fetched: v.number(),
    kept: v.number(),
    error: v.optional(v.string()),
  }).index("by_feed", ["feedId", "startedAt"]),

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
  })
    .index("by_start", ["startTime"])
    .index("by_source_sourceId", ["source", "sourceId"])
    .searchIndex("search_title", {
      searchField: "title",
      filterFields: ["city", "eventType", "source"],
    }),

  users: defineTable({
    deviceId: v.string(),
    role,
    interests: v.array(v.string()),
    city: v.string(),
    lat: v.number(),
    lng: v.number(),
    locationSource: v.union(v.literal("device"), v.literal("city")),
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
    .index("by_user_event", ["userId", "eventId"]),
});
