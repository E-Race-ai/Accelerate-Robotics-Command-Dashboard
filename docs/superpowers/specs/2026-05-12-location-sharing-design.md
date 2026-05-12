# Location Sharing — Design (DRAFT, paused mid-brainstorming)

**Status:** ⏸ Paused 2026-05-12 (second pause point — wider-scope decisions
now captured, Tessie token validated, awaiting Tesla account link and
final design approval before implementation). See "Current resume point"
at the bottom.

---

## 🤖 For a fresh Claude reading this (resume protocol)

If you're a new Claude session and the user has asked you to resume this
work, do exactly the following before doing anything else:

```bash
# 1. Land on the right branch
cd ~/Code/accelerate-robotics
git fetch origin
git checkout docs/location-sharing-design
git pull --ff-only

# 2. Confirm you're reading the right thing
ls docs/superpowers/specs/2026-05-12-location-sharing-design.md
ls pages/mockup-findmy-circle.html

# 3. Verify external state — what's running, what data is flowing
echo "--- accelerate-robotics dev server (dashboard) ---"
lsof -nP -iTCP:3000 -sTCP:LISTEN | tail -2
echo "--- tesla-mobile-office (local helper) ---"
lsof -nP -iTCP:3115 -sTCP:LISTEN | tail -2
echo "--- Tessie still authenticated? ---"
curl -s http://127.0.0.1:3115/api/tesla/now | python3 -m json.tool 2>/dev/null | head -20
```

Expected results after the above:

- `dashboard dev server` on :3000 — may or may not be running. If absent and
  the user wants to test, restart with `cd ~/Code/accelerate-robotics &&
  npm run dev` in a background process.
- `local helper` on :3115 — may or may not be running. If absent and the
  user wants to verify Tessie status, restart with `cd
  ~/Code/tesla-mobile-office && npm start` in a background process.
- `tessie.configured` — should be `true` if the Tessie token Eric saved
  on 2026-05-12 is still valid (Tessie tokens don't expire unless he
  revoked them).
- `live: null` → the Tessie ↔ Tesla OAuth was not yet completed when we
  paused. `live: {...}` → he completed it; that's the implementation green
  light to show real Tesla GPS in the dashboard.

Then read this **entire doc** before responding to the user. The
"Decisions made so far" table and "Current resume point" section together
tell you what was settled vs. what's next.

## ⛔ What is NOT in scope, even if the user phrases it broadly

- Do not write any code in `src/` or `public/` (in this repo) without
  first confirming the user wants to move from brainstorming to
  implementation. The brainstorming gate has not been cleared.
- Do not modify `~/Code/tesla-mobile-office` for the location-sharing
  feature (the only change there so far is the unrelated `setupSave`
  scope fix on local branch `fix/setup-save-scope-error`).
- Do not commit anything to `main` of either repo. All work stays on
  feature branches until the user explicitly merges.
- The mockup `pages/mockup-findmy-circle.html` is a design artifact, not
  production code. It currently lives on `docs/location-sharing-design`
  only; it must not ship to production via a merge to `main` without the
  user's explicit OK. If it does eventually need to live somewhere
  long-lived, move it to `docs/superpowers/mockups/` first.

## 🧭 Decision tree when the user gives a vague prompt

If the user says something like *"pick back up"* or *"continue this":*

1. Run the verify-state block above.
2. Report a one-paragraph status: branch state, helper state, Tessie
   state, dashboard state.
3. Ask the user explicitly which of these they want to do next:
   - Keep brainstorming (uncover new questions or revise decisions)?
   - Move to writing-plans → produce an implementation plan from
     "Current resume point" → "Step 4. Build the dashboard's Tessie
     integration"?
   - Validate a specific piece (e.g., that Tessie still authenticates,
     that Eric has completed the Tesla link)?
   - Something else entirely?

Do NOT start implementing without that explicit answer.

---

## Terminology — important, was a source of confusion

We deliberately stopped abbreviating mid-session because the shortened forms
caused real misunderstanding. **Use the long forms in any future thread.**

- **The dashboard** = `accelerate-robotics` = this repo, deployed to Render,
  what reps open every day. Earlier abbreviated "AR" — avoid.
- **The local helper** = `tesla-mobile-office` = a separate small Node app
  in `~/Code/tesla-mobile-office`, runs locally on the rep's Mac at
  `http://localhost:3115`, gathers data from LAN/iCloud-bound things the
  cloud dashboard can't reach. Earlier abbreviated "tmo" — avoid.

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

Captured from the AskUserQuestion answers across the 2026-05-12 brainstorming
session (two rounds — Find My-only first, wider-scope second).

### Round 1 — Find My-only design

| Decision | Choice | Why |
|---|---|---|
| Scope | **Multi-user from day one** | Avoid a rewrite when Ben is no longer the only rep. Each rep gets their own location stream. |
| Topology (Find My) | **Piggyback on local helper** | The Find My bridge already exists in `~/Code/tesla-mobile-office` (`server/findmy-bridge.js` + `scripts/findmy-bridge/poll-devices.py`). Each rep runs the local helper; its bridge POSTs locations to the dashboard. |
| Bridge auth to dashboard | **Bridge logs in like a browser** | Bridge POSTs `{email, password}` to `/api/auth/login`, gets the JWT cookie, reuses it on heartbeat POSTs. No new auth surface in the dashboard. 401 → re-login. |
| Trigger UX | **One-shot button** | `📍 Drop circle at my location` next to the existing orange "Click map to drop circle" button. Subtitle shows freshness ("Ben's iPhone 17 Pro · 2 min ago"). Polled every 30s. |
| Default radius | 1 mi | Matches the existing map's default. Adjustable via the existing slider in the circle's popup. |
| Stale threshold | 10 min | Subtitle goes amber + warning beyond this. Click still works. |
| Primary device (Find My) | Latest-updated device per user | For v1. Future: let user designate primary in settings. |

### Round 2 — Wider scope (Tessie + MiFi + unified onboarding)

| Decision | Choice | Why |
|---|---|---|
| Setup model | **Hybrid** | Browser geolocation as zero-install floor. Local helper as opt-in upgrade for richer sources. Every rep gets *something* working with no setup; reps who install the local helper get the richer multi-source experience. |
| Source picking with multiple available | **Auto-pick the best by accuracy + recency** | One button, no dropdown. Subtitle surfaces which source was used (`Tesla · 30s ago` / `iPhone · 2 min ago` / `Browser · 12s ago`). Ranking: Tesla GPS ~5m > Find My ~12m > browser ~30m, broken by recency. |
| Tessie wiring | **Dashboard reads Tessie directly** | Tessie is HTTPS, the cloud dashboard can call it. No local helper needed for the Tesla source. Per-user token stored in the dashboard's user table. Reps who only want Tesla GPS skip the local helper entirely. |
| MiFi wiring | **Local helper required** (deferred) | MiFi 3100 is LAN-only — Render can't reach it. Local helper polls MiFi locally and POSTs to dashboard. Same heartbeat pipe as Find My. |
| Find My wiring | **Local helper required** (deferred) | pyicloud needs an interactive 2FA setup + a persistent Python process per user. Cloud server can't do this. |

### Three rep onboarding tiers

| Tier | Setup work | Sources |
|---|---|---|
| 1 — Floor | Click "allow" on browser geolocation once | Browser geolocation |
| 2 — Tessie | Paste Tessie token in dashboard settings | Browser + Tesla GPS |
| 3 — Full | Install local helper, configure Find My + MiFi | All four sources |

Each tier is purely additive. The radius button works at every tier.

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

## Validated this session (real data, real state)

### Tessie token

- Eric generated a Tessie API token and pasted it into the local helper's
  `⚙ Setup` wizard.
- Local helper now reports `tessie.configured: true` from
  `GET http://localhost:3115/api/tesla/now`.
- `live: null` — expected. Eric has not completed the Tessie ↔ Tesla
  OAuth flow yet (that's a Tessie-side step, not a code change). When
  he does, `live` will populate with GPS, SOC, range, etc., and the
  same token will work for the dashboard's direct integration too.
- The first token Eric generated was pasted in chat and is therefore
  considered burned. He rotated it before saving in the wizard. **Both
  the dashboard's eventual token storage and the local helper's `.env`
  use the rotated token.**

### Bug fixed in the local helper

- `setupSave()` in `tesla-mobile-office/public/shell.js` had a
  block-scoping bug: `tok` and `pw` were declared `const` inside the
  per-feature branches but read at function scope after the await, so
  saving either Tessie *or* Apple credentials threw `ReferenceError: pw
  is not defined`.
- Fixed by hoisting both to `let` at function scope.
- Committed on local branch `fix/setup-save-scope-error` in
  `~/Code/tesla-mobile-office`. **That repo has no remote configured**,
  so the fix lives only on Eric's Mac. To preserve it across branch
  switches, merge to local main: `git checkout main && git merge
  fix/setup-save-scope-error`.

## Current resume point

Paused **before building the Tessie integration in the dashboard.**

When resumed, the next steps are:

1. **(Optional, no code)** Eric completes the Tessie ↔ Tesla OAuth flow
   inside Tessie so `live` starts returning GPS. Lets us test the
   dashboard integration with real data instead of synthetic empty
   responses.
2. **Design self-review** on this doc (per the brainstorming skill flow)
   to catch placeholders, contradictions, ambiguity, scope drift.
3. **Get final design approval** from Eric on the now-complete decision
   set in this doc.
4. **Build the dashboard's Tessie integration** on a new branch (separate
   from `docs/location-sharing-design`):
   - SQLite migration: `tessie_token TEXT` column on `users` (or new
     `user_settings` table — TBD during plan-writing).
   - `src/adapters/tessie.js` — server-side Tessie HTTPS client.
   - `GET /api/me/tesla/location` — auth-required endpoint that
     returns `{ lat, lng, heading, age_s, source: 'tesla' }` or 404.
   - Settings panel (in user profile or a new "Connections" page) to
     paste the token.
   - Hotel Research button's source-picker logic gains Tesla as a
     candidate.
5. **Then-and-only-then** layer in Find My + MiFi via the local helper's
   bridge POSTing heartbeats to the dashboard. That's a separate plan.

## Artifacts produced this session

| File | Status | Purpose |
|---|---|---|
| `pages/mockup-findmy-circle.html` | Committed on this branch | Interactive HTML mockup with 12 fake hotel pins in West Hollywood, three toggleable bridge states, and a working click-to-drop animation. Visual approval artifact — not real wiring. Open at `http://localhost:3000/pages/mockup-findmy-circle.html` when accelerate-robotics' dev server is running. Has hardcoded coords; Eric correctly flagged this as misleading — replacement plan is part of step 4 above. |
| `docs/superpowers/specs/2026-05-12-location-sharing-design.md` | This file | Design-in-progress; updated with Round 2 decisions. |
| `~/Code/tesla-mobile-office` branch `fix/setup-save-scope-error` | Local-only (no remote) | Bug fix for the setup wizard. See "Bug fixed in the local helper" above. |

## How to resume

1. Open this file.
2. Read the "Decisions made so far" table — both rounds.
3. Confirm decisions still hold (especially the hybrid model and
   Tessie-direct wiring).
4. Start a new session with `Skill: superpowers:brainstorming` if any
   decision needs revisiting, otherwise jump to
   `Skill: superpowers:writing-plans` to produce an implementation
   plan from step 4 of "Current resume point".
5. Verify in the local helper that `tessie.configured: true` is still
   true (`curl -s http://127.0.0.1:3115/api/tesla/now | jq .tessie`).
   If Eric has completed the Tessie ↔ Tesla OAuth flow by then, `live`
   should also be non-null.
