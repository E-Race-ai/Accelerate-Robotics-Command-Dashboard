# Location Sharing — Design (DRAFT, paused mid-brainstorming)

**Status:** ⏸ Paused mid-brainstorming on 2026-05-12. Scope is widening before we
finish. See "Resume point" at the bottom.

**Goal:** Let a rep on a site visit drop a radius circle on the Hotel
Research map at their *current location* with one click — no manual map
clicks, no copy-paste of coordinates. The radius circle then powers the
existing within-X-miles hotel count + brand breakdown + AI-fit-avg
overlay (already built into the map).

## Original triggering ask

User: "Lets work on adding it to the hotel research tab as a function with
the map. I want the user, in this case Ben, to be able to have the ability
to use the location feature from find my to automatically use the radius
feature in the map section of the hotel research tile."

## Decisions made so far

Captured from the AskUserQuestion answers in the 2026-05-12 brainstorming session.

| Decision | Choice | Why |
|---|---|---|
| Scope | **Multi-user from day one** | Avoid a rewrite when Ben is no longer the only rep. Each rep gets their own location stream. |
| Topology | **Piggyback on tesla-mobile-office** | The bridge already exists there (`server/findmy-bridge.js` + `scripts/findmy-bridge/poll-devices.py`). Each rep runs tesla-mobile-office locally; its bridge POSTs locations to AR. |
| Bridge auth to AR | **Bridge logs in like a browser** | Bridge POSTs `{email, password}` to `/api/auth/login`, gets the JWT cookie, reuses it on heartbeat POSTs. No new auth surface in AR. 401 → re-login. |
| Trigger UX | **One-shot button** | `📍 Drop circle at my location` next to the existing orange "Click map to drop circle" button. Subtitle shows freshness ("Ben's iPhone 17 Pro · 2 min ago"). Polled every 30s. |
| Default radius | 1 mi | Matches the existing map's default. Adjustable via the existing slider in the circle's popup. |
| Stale threshold | 10 min | Subtitle goes amber + warning beyond this. Click still works. |
| Primary device | Latest-updated device per user | For v1. Future: let user designate primary in settings. |

## Architecture sketch

```
┌──────────────────────────────┐         ┌──────────────────────────────┐
│  Ben's Mac                   │         │  AR production (Render)      │
│  tesla-mobile-office         │         │                              │
│  ┌────────────────────────┐  │         │  ┌────────────────────────┐  │
│  │ poll-devices.py        │  │         │  │ Hotel Research page    │  │
│  │ (pyicloud, every 30s)  │  │         │  │   📍 Drop @ my loc     │  │
│  └──┬─────────────────────┘  │         │  └─────────┬──────────────┘  │
│     │ lat,lng + cookie       │  HTTPS  │            │ GET             │
│     ▼ POST                   ├─────────┼─►          ▼ /api/me/location│
│  /api/me/location/heartbeat  │         │  ┌────────────────────────┐  │
│                              │         │  │ src/routes/locations.js│  │
│  (login cookie cached in     │         │  └─────────┬──────────────┘  │
│   findmy-bridge.js, refresh  │         │            ▼                 │
│   on 401)                    │         │  user_locations table        │
└──────────────────────────────┘         └──────────────────────────────┘
```

## Server-side surface (planned)

**`POST /api/me/location/heartbeat`** — bridge sends a location update.
- Auth: JWT cookie (existing AR auth)
- Body: `{ device_id, device_name, lat, lng, accuracy_m, reported_at }`
- Validates: lat -90..90, lng -180..180, `reported_at` not future, not >1 day old
- Upserts into `user_locations` (`UNIQUE(user_id, device_id)`)

**`GET /api/me/location`** — returns latest known location for the
authenticated user.
- Auth: JWT cookie
- Returns: `{ device_id, device_name, lat, lng, accuracy_m, reported_at, age_s }`
- 404 if no heartbeats have ever landed for this user.

## Database schema (planned)

```sql
CREATE TABLE IF NOT EXISTS user_locations (
  id          INTEGER PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id),
  device_id   TEXT NOT NULL,    -- stable hash from poll-devices.py
  device_name TEXT,             -- friendly name (e.g. "Ben's iPhone 17 Pro")
  lat         REAL NOT NULL,
  lng         REAL NOT NULL,
  accuracy_m  REAL,             -- horizontal accuracy in meters from pyicloud
  reported_at TEXT NOT NULL,    -- ISO when the device reported
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, device_id)
);
```

## Client-side surface (planned)

`pages/hotel-research.html` — new button + freshness subtitle in the
existing controls row, just below "Click map to drop circle":

```
☐ 🐳 Deep researched only  [📏 Click map to drop circle]  ✕ Clear circles
                            [📍 Drop circle at my location]
                            • Ben's iPhone 17 Pro · 2 min ago
```

The new button reuses the existing `placeRadiusCircle(lat, lng, radiusMi)`
function (defined at `hotel-research.html:4242`), so circle persistence,
popup editing, and slider behavior all come for free.

States:
- **Fresh** (≤10 min): green dot, "Ben's iPhone 17 Pro · N min ago"
- **Stale** (>10 min): amber, "(stale)" suffix, click still works
- **No data**: disabled grey, "How to connect" link → modal with setup instructions

On click: `flyTo(lat, lng)` (smooth 600ms pan) → `placeRadiusCircle(lat, lng, 1.0)` →
plant offset 📱 marker showing exactly where the iCloud reading came from.

## Bridge-side changes (planned)

`tesla-mobile-office/scripts/findmy-bridge/poll-devices.py` already POSTs to
a configurable `DASHBOARD_URL/api/mifi/location/heartbeat`. Changes:

1. Add a second POST destination: `AR_BASE_URL/api/me/location/heartbeat`
2. Maintain a separate AR session cookie (login on startup, refresh on 401)
3. Three new `.env` vars on the bridge side:
   - `AR_BASE_URL` (e.g. `https://command.accelerate-robotics.com`)
   - `AR_USER` (rep's AR email)
   - `AR_PASSWORD` (rep's AR password, stored plain in `.env`, gitignored)
4. Optional: setup wizard in tesla-mobile-office gains an "Connect to
   Accelerate Robotics" panel for these 3 vars.

## Artifacts produced this session

| File | Status | Purpose |
|---|---|---|
| `pages/mockup-findmy-circle.html` | Untracked, served at `http://localhost:3000/pages/mockup-findmy-circle.html` | Interactive HTML mockup with 12 fake hotel pins in West Hollywood, three toggleable bridge states, and a working click-to-drop animation. Visual approval artifact — not real wiring. |

The mockup uses **hardcoded coordinates** for "Ben's iPhone" (West
Hollywood). User correctly flagged this as misleading — Ben is actually in
Florida. To make it real, we need to either configure Eric's Apple ID in
tesla-mobile-office (quick demo path the user picked) or build the full
AR-side pipeline. We paused right before doing the configure step.

## Resume point

User picked the **quick demo path** (~20 min):
1. Eric configures his Apple ID + app-specific password in tesla-mobile-office's `⚙ Setup` modal at `http://localhost:3115`.
2. Bridge starts polling iCloud; data lands in tesla-mobile-office's `gps_snapshots` table (already wired).
3. AR gains a same-origin proxy endpoint `GET /api/findmy-demo/devices` that forwards to `http://localhost:3115/api/mifi/gps/devices` (sidesteps CSP/CORS).
4. Mockup fetches from `/api/findmy-demo/devices` on load + every 30s instead of using hardcoded coords.
5. Mockup auto-derives the fresh/stale/no-data state from the real `ts` field on the latest reading.

Then we re-evaluate the design with real data flowing before the full
production buildout.

## Open question that triggered the pause (next brainstorm round)

User wants to widen scope before we ship:

> "would like to talk through what it would look like to do the location set up
> with the other services: Tessie, mifi 3100, and set up wizard. Ideally, I would
> want this to be an easy process for the user to share their location with the
> dashboard so they can utilize the map feature with the radius."

Implications to explore in the next brainstorming session:
- **Three potential location sources** for the same rep:
  - **Find My** — iCloud device location (iPhone in pocket, accurate)
  - **Tessie** — Tesla GPS (when rep is driving the Model X)
  - **MiFi 3100** — Inseego hotspot GPS (when MiFi is the field connectivity)
- **Per-source freshness, accuracy, and trust** differ. Tesla GPS is most
  accurate while driving; iPhone wins when out of the car; MiFi is a
  reasonable fallback. Some logic to "pick the best current source" — or
  let the rep choose — is now in scope.
- **Setup wizard** should ideally be unified: one place where a rep
  configures *all* their location sources, regardless of source.
  - Where does this wizard live? AR (the dashboard the rep uses daily)
    or tesla-mobile-office (where the bridges run)?
  - If AR: the wizard collects credentials and pushes them to the
    rep's local tesla-mobile-office over what channel?
- **What surfaces the source choice?** A dropdown in the button ("Use
  iPhone / Tesla / MiFi"), or a single "best available" pick with the
  source labeled in the subtitle?
- **What if multiple sources disagree?** (iPhone says SF, Tesla says LA —
  rep left phone in office while driving.) Surface both, let user pick?
  Or trust the most recent reading?
- **Auth simplification.** Right now the plan is bridge-logs-in-like-a-browser.
  If a unified setup wizard is in AR, it could generate per-user API tokens
  that the bridge uses — cleaner than email/password in `.env`.

These are the questions the next brainstorming round should answer.

## How to resume

1. Open `docs/superpowers/specs/2026-05-12-location-sharing-design.md` (this file).
2. If continuing the quick-demo path: pick up at "Resume point" above —
   configure Apple ID in tesla-mobile-office, then build the proxy + mockup wiring.
3. If continuing the broader brainstorm: jump to "Open question that
   triggered the pause" and start a fresh `Skill: superpowers:brainstorming`
   session with this doc as context.

The mockup file `pages/mockup-findmy-circle.html` is untracked. To
preserve it across branches without committing into `pages/` (where it'd
ship with the next deploy), either:
- Move it to `docs/superpowers/mockups/2026-05-12-findmy-circle.html`
  before next deploy, OR
- Commit it alongside this spec on the same docs branch so it travels with
  the design record.
