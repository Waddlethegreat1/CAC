# Scout

Scout finds nearby startup events tied to what you care about. Students find hackathons, pitch competitions, and networking nights; investors find student events worth scouting. A Convex backend pulls listings from public sources into one feed, ranks it by interest match, soonness, and distance, and flags events where investors are likely to be in the room.

## Layout

```
app/                    Expo app (expo-router, TypeScript); Revyl config in app/.revyl/
convex/
  schema.ts             tables: feeds, fetch_log, raw_listings, events, users, interests, saves
  lib/rawEvent.ts       RawEvent type + validator (the adapter contract)
  lib/adapter.ts        Adapter interface: fetch(feed) -> RawEvent[]
  adapters/<source>.ts  one file per source (devpost, luma)
  normalize/            RawEvent -> events row: geo, Bay Area filter, rules tagger
  lib/tagger.ts         rules-based tags, event type, audience, investor score (Enricher seam for LLM tagging)
  ingest.ts             runDue / runFeed actions, store + fetch_log mutations
  feed.ts               ranked feed query
  crons.ts              due feeds every 30 min, daily demo seed refresh
  seed.ts               22 realistic Bay Area events so the feed is never empty
fixtures/<source>/      saved pages + expected RawEvent JSON for offline adapter tests
docs/tasks.md           task breakdown for the parallel build
```

`AGENTS.md`, `convex/adapters/AGENTS.md`, and `.capy/rules/convex.md` hold the rules every agent follows. Schema and contract changes (`schema.ts`, `lib/rawEvent.ts`, `lib/adapter.ts`) go through the owning PR and are named in its title.

## Setup

Requires Node 22+ and pnpm 10.

```bash
pnpm install
```

### Environment variables

| Variable | Where | Purpose |
| - | - | - |
| `CONVEX_DEPLOYMENT` | root `.env.local` (written by `npx convex dev`) | Which deployment the Convex CLI targets |
| `CONVEX_DEPLOY_KEY` | shell / CI secret, optional | Non-interactive CLI access to a cloud deployment (a `dev:` key for agents, `prod:` only in GitHub secrets) |
| `EXPO_PUBLIC_CONVEX_URL` | `app/.env.local` | Convex client URL the app connects to (`https://<name>.convex.cloud`, or `http://127.0.0.1:3210` locally) |
| `REVYL_API_KEY` | shell / CI secret | Revyl CLI auth for builds and test runs (or `revyl auth login`) |

No source needs an API key today: Devpost's public hackathon JSON and Luma's public pages are read without auth.

## Run the backend

```bash
npx convex dev                       # pushes functions and watches; writes root .env.local
pnpm seed                            # feeds, interests, and demo events
pnpm ingest                          # fetch every feed now (the cron does this every 30 min)
```

With no Convex login and no deploy key, `npx convex dev` in a non-interactive shell starts an anonymous local backend on port 3210. `CONVEX_AGENT_MODE=anonymous npx convex dev` forces that mode. With `CONVEX_DEPLOY_KEY` set it pushes to that key's deployment instead.

Then point the app at it:

```bash
grep EXPO_PUBLIC_CONVEX_URL .env.local > app/.env.local   # cloud deployment
echo EXPO_PUBLIC_CONVEX_URL=http://127.0.0.1:3210 > app/.env.local   # local backend
```

## Run the app

```bash
pnpm app            # expo start; press i for an iOS simulator, a for Android
```

Location uses `expo-location`, so a development build (`npx expo run:ios`) or a Revyl build is needed for the device-location path; picking a city works everywhere.

## Checks

```bash
pnpm typecheck      # convex, tests, and app
pnpm test           # vitest + convex-test, fully offline against fixtures/
pnpm lint
```

## Revyl tests

Revyl config lives in `app/.revyl/config.yaml` (from `revyl init`), with the iOS app `Scout iOS` linked to the `preview` and `development` profiles. The smoke test is `app/.revyl/tests/smoke-onboarding-feed.yaml`: onboarding as a student, the feed showing events near Palo Alto, event detail, save, and Open link.

```bash
curl -fsSL https://revyl.com/install.sh | sh
cd app
revyl build --profile preview --platform ios --env EXPO_PUBLIC_CONVEX_URL=https://<name>.convex.cloud
revyl test run smoke-onboarding-feed
revyl dev --platform ios             # hot-reload dev loop on a cloud simulator
```

Release builds bundle the JS, so pass the Convex URL at build time with `--env`. After editing a test YAML: `revyl test push smoke-onboarding-feed --force`.

## Sources

| Source | Tier | What we read |
| - | - | - |
| Devpost | public JSON API | `devpost.com/api/hackathons` (in-person and online, paged) |
| Luma | structured data in the page | `__NEXT_DATA__` on public city and calendar pages (`luma.com/sf`, community calendars) |

Requests are spaced at least one second apart per domain and identify as `CAC-EventsBot`. Only public listings are read; no attendee data is stored, and fixtures are trimmed to the fields the parsers read.
