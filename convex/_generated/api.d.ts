/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as adapters_devpost from "../adapters/devpost.js";
import type * as adapters_fixture from "../adapters/fixture.js";
import type * as adapters_ical from "../adapters/ical.js";
import type * as adapters_index from "../adapters/index.js";
import type * as adapters_jsonld from "../adapters/jsonld.js";
import type * as adapters_luma from "../adapters/luma.js";
import type * as adapters_mlh from "../adapters/mlh.js";
import type * as crons from "../crons.js";
import type * as events from "../events.js";
import type * as feed from "../feed.js";
import type * as feeds from "../feeds.js";
import type * as ingest from "../ingest.js";
import type * as interests from "../interests.js";
import type * as investor from "../investor.js";
import type * as lib_adapter from "../lib/adapter.js";
import type * as lib_geo from "../lib/geo.js";
import type * as lib_http from "../lib/http.js";
import type * as lib_interests from "../lib/interests.js";
import type * as lib_ranking from "../lib/ranking.js";
import type * as lib_rawEvent from "../lib/rawEvent.js";
import type * as lib_robots from "../lib/robots.js";
import type * as lib_scouting from "../lib/scouting.js";
import type * as lib_store from "../lib/store.js";
import type * as lib_tagger from "../lib/tagger.js";
import type * as lib_time from "../lib/time.js";
import type * as links from "../links.js";
import type * as normalize_backfill from "../normalize/backfill.js";
import type * as normalize_dedupe from "../normalize/dedupe.js";
import type * as normalize_embed from "../normalize/embed.js";
import type * as normalize_geocode from "../normalize/geocode.js";
import type * as normalize_index from "../normalize/index.js";
import type * as saves from "../saves.js";
import type * as seed from "../seed.js";
import type * as users from "../users.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  "adapters/devpost": typeof adapters_devpost;
  "adapters/fixture": typeof adapters_fixture;
  "adapters/ical": typeof adapters_ical;
  "adapters/index": typeof adapters_index;
  "adapters/jsonld": typeof adapters_jsonld;
  "adapters/luma": typeof adapters_luma;
  "adapters/mlh": typeof adapters_mlh;
  crons: typeof crons;
  events: typeof events;
  feed: typeof feed;
  feeds: typeof feeds;
  ingest: typeof ingest;
  interests: typeof interests;
  investor: typeof investor;
  "lib/adapter": typeof lib_adapter;
  "lib/geo": typeof lib_geo;
  "lib/http": typeof lib_http;
  "lib/interests": typeof lib_interests;
  "lib/ranking": typeof lib_ranking;
  "lib/rawEvent": typeof lib_rawEvent;
  "lib/robots": typeof lib_robots;
  "lib/scouting": typeof lib_scouting;
  "lib/store": typeof lib_store;
  "lib/tagger": typeof lib_tagger;
  "lib/time": typeof lib_time;
  links: typeof links;
  "normalize/backfill": typeof normalize_backfill;
  "normalize/dedupe": typeof normalize_dedupe;
  "normalize/embed": typeof normalize_embed;
  "normalize/geocode": typeof normalize_geocode;
  "normalize/index": typeof normalize_index;
  saves: typeof saves;
  seed: typeof seed;
  users: typeof users;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
