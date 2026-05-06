# Project Tracker — Design Spec

**Date:** 2026-04-23
**Status:** Approved (design)
**Author:** Eric Race + Claude

## Goal

Add a lightweight, multi-sprint project tracker to the admin portal. Admins can create sprints; under each sprint create projects, tasks, and subtasks; assign owners and support from a managed people list; set absolute start/end dates; update status; and flag rows that need verification. The first sprint is seeded from `docs/60-roadmap/project_tracker_v2.md` ("Hotel Bots - Sprint 1").

## Context

The team is running a 3-week sprint toward a go/no-go decision on the Hotel Robotics business unit. `project_tracker_v2.md` is a draft spec that assumed a React + Vite + localStorage build matching the separate ATL Calc stack. This portal is vanilla HTML + Tailwind CDN + Express + SQLite with no build step, and the tracker is inherently multi-user, so the implementation reconciles the doc against this codebase's patterns.

Future sprints will run in parallel or sequentially; the schema is designed to handle both without a rewrite.

---

## 1. Non-goals (MVP)

Explicitly out of scope for the first version:

- PNG / PDF export
- Comment threads per row
- Drag-to-reorder rows and drag-to-resize Gantt bars
- Multi-sprint cross-calendar view
- Owner / status filters (revisit after first real use)
- Per-person login coupling (people stay decoupled from `admin_users`; a nullable `admin_user_id` column is added via one-shot `ALTER TABLE` when individual logins formalize — target is the next month)
- Arbitrary hierarchy depth (fixed at 4 levels: Sprint → Project → Task → Subtask)

---

## 2. Data model

Five new tables added to `src/db/database.js` using the existing `CREATE TABLE IF NOT EXISTS` pattern. SQLite.

### 2.1 `tracker_sprints`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | Matches the existing `deals.id` TEXT-id pattern |
| name | TEXT | NOT NULL | |
| description | TEXT | | |
| start_date | TEXT | NOT NULL | ISO date (YYYY-MM-DD) |
| end_date | TEXT | NOT NULL | ISO date; server enforces `start_date <= end_date` |
| created_at | TEXT | DEFAULT (datetime('now')) | |
| updated_at | TEXT | DEFAULT (datetime('now')) | |

### 2.2 `tracker_items`

Unified table for projects, tasks, and subtasks. Chosen over three separate tables because the three levels share ~95% of their columns; one table + a `level` CHECK constraint means one set of API routes and one set of UI rendering code.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | |
| sprint_id | TEXT | NOT NULL REFERENCES tracker_sprints(id) ON DELETE CASCADE | |
| parent_id | TEXT | REFERENCES tracker_items(id) ON DELETE CASCADE | NULL for projects |
| level | TEXT | NOT NULL CHECK (level IN ('project','task','subtask')) | |
| name | TEXT | NOT NULL | Max 200 chars (server-validated) |
| description | TEXT | | Max 5000 chars (server-validated) |
| owner_id | INTEGER | REFERENCES tracker_people(id) | "Owner" for projects, "lead" for tasks/subtasks |
| color | TEXT | | Only meaningful on projects; NULL on tasks/subtasks |
| start_date | TEXT | NOT NULL | ISO date |
| end_date | TEXT | NOT NULL | ISO date; server enforces `start_date <= end_date` |
| status | TEXT | NOT NULL DEFAULT 'not_started' CHECK(status IN ('not_started','in_progress','blocked','complete')) | |
| needs_verification | INTEGER | NOT NULL DEFAULT 0 CHECK(needs_verification IN (0,1)) | |
| verification_note | TEXT | | Free-text; surfaced in the drawer when `needs_verification = 1` |
| is_milestone | INTEGER | NOT NULL DEFAULT 0 CHECK(is_milestone IN (0,1)) | Renders as diamond; `start_date` should equal `end_date` but not enforced |
| sort_order | INTEGER | NOT NULL DEFAULT 0 | Stable display order within a parent |
| created_at | TEXT | DEFAULT (datetime('now')) | |
| updated_at | TEXT | DEFAULT (datetime('now')) | |

**Hierarchy rules** (enforced in the API, not at the DB level):

- A `project` row must have `parent_id IS NULL`.
- A `task` row's `parent_id` must reference a `tracker_items` row with `level = 'project'`.
- A `subtask` row's `parent_id` must reference a `tracker_items` row with `level = 'task'`.
- `sprint_id` and `level` are immutable after creation. Moving items across sprints or levels is out of scope for MVP.

### 2.3 `tracker_people`

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT | Matches the existing `admin_users` pattern |
| initials | TEXT | NOT NULL | Short label shown in the UI (e.g. "ER", "Lydia") |
| full_name | TEXT | | Long-form name when known |
| notes | TEXT | | Free-text context (role, team) |
| active | INTEGER | NOT NULL DEFAULT 1 CHECK(active IN (0,1)) | Soft-delete flag so historical assignments still resolve |
| created_at | TEXT | DEFAULT (datetime('now')) | |

### 2.4 `tracker_item_support`

Many-to-many between items and people for the "support / contributors" column.

| Column | Type | Constraints |
|---|---|---|
| item_id | TEXT | NOT NULL REFERENCES tracker_items(id) ON DELETE CASCADE |
| person_id | INTEGER | NOT NULL REFERENCES tracker_people(id) ON DELETE CASCADE |
| PRIMARY KEY | | (item_id, person_id) |

### 2.5 Pragmas

Existing `src/db/database.js` already sets `journal_mode = WAL` and `foreign_keys = ON`. No new pragmas needed — but `foreign_keys = ON` is required for the `ON DELETE CASCADE` rules above to fire.

---

## 3. API

New file `src/routes/tracker.js`, mounted at `/api/tracker` in `src/server.js`. All routes behind the existing `requireAuth` middleware. Conventions follow `src/routes/deals.js`.

### 3.1 Sprints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/tracker/sprints` | List all sprints (id, name, start_date, end_date) |
| GET | `/api/tracker/sprints/:id` | Returns the sprint + full nested item tree (projects → tasks → subtasks, each with hydrated `support[]`) + active people list. This is the single read the frontend hits on page load. |
| POST | `/api/tracker/sprints` | Create. Body: `{ name, description?, start_date, end_date }`. |
| PATCH | `/api/tracker/sprints/:id` | Partial update (name, description, dates). |
| DELETE | `/api/tracker/sprints/:id` | Cascades to all items via FK. |

### 3.2 Items

| Method | Path | Purpose |
|---|---|---|
| POST | `/api/tracker/items` | Create. Body: `{ sprint_id, parent_id?, level, name, description?, owner_id?, color?, start_date, end_date, status?, needs_verification?, verification_note?, is_milestone?, sort_order? }`. Server validates hierarchy per §2.2. |
| PATCH | `/api/tracker/items/:id` | Partial update. Used by both inline edits (status, owner_id) and the side-panel drawer. `sprint_id` and `level` are rejected. |
| DELETE | `/api/tracker/items/:id` | Cascades to children. |
| PUT | `/api/tracker/items/:id/support` | Replaces the full support list. Body: `{ person_ids: number[] }`. Wraps the insert/delete in a transaction. |

### 3.3 People

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/tracker/people` | List active people (`active = 1`). |
| POST | `/api/tracker/people` | Body: `{ initials, full_name?, notes? }`. |
| PATCH | `/api/tracker/people/:id` | Partial update. |
| DELETE | `/api/tracker/people/:id` | Soft delete — sets `active = 0` so historical assignments continue to resolve. |

### 3.4 Validation (every POST / PATCH)

- Required fields → 400 with a specific message.
- `start_date <= end_date`.
- Enum whitelists: `status`, `level`.
- Foreign keys verified: sprint exists; parent exists and is the correct level for the child; `owner_id` (if supplied) exists in `tracker_people`.
- `name` max 200 chars; `description` and `verification_note` max 5000 chars (matching the `MAX_MESSAGE_LENGTH` pattern in `src/routes/inquiries.js`).

### 3.5 Rate limiting

None. All routes sit behind `requireAuth`, identical to `/api/deals`. The public rate limiter is reserved for unauthenticated endpoints.

---

## 4. UI

One page: `public/admin-project-tracker.html`. One JS module: `public/js/tracker.js`. Tailwind via CDN, matching every other admin page.

### 4.1 Layout

Three zones:

1. **Header bar**: sprint selector dropdown, "+ New Sprint" button, "Manage People" link, breadcrumb back to `admin-command-center.html`.
2. **Sprint context bar**: sprint name (inline-editable), date range (clicking opens the sprint drawer), and a small status summary ("3 blocked · 7 in progress · 2 complete").
3. **Gantt grid**: left-side table + right-side timeline, scrolling together vertically.

```
┌───────────────────────────┬────────────────────────────────┐
│ Name        Owner  Supp.  │  Week 1 │ Week 2 │ Week 3     │
├───────────────────────────┼────────────────────────────────┤
│ ▾ Deploy    ER     +4     │  ░░░▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░  │  ← project
│   ▾ Pilot   CB     —      │     ▓▓▓▓▓▓▓▓▓▓             │  ← task
│     • Site  CB     —      │        ▓▓▓▓                 │  ← subtask
│ ▸ Deal+Pro  Lydia  +3     │  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  │
│                           │  ◆ V1 launched                 │  ← milestone
│ ...                                                    ◆   │  ← go/no-go (red)
└───────────────────────────┴────────────────────────────────┘
```

- Left columns: `Name` · `Owner` · `Support count badge` · `Status pill`.
- Rows indented by level (project=0, task=1, subtask=2). Expand/collapse caret on any row with children.
- Timeline headings auto-computed: "Week 1 / Week 2 / Week 3" for sprints ≤ 6 weeks, month columns otherwise.
- Bars colored by the project's `color`; tasks/subtasks inherit the parent project's color.
- Milestones render as diamonds. Go/no-go uses red (#A32D2D) with a dashed vertical line; other milestones use the owning project's color.
- `[VERIFY]` rows get an amber dot next to the name; clicking opens the drawer.

### 4.2 Inline edits

- **Status pill** — click, dropdown of 4 values (Not Started / In Progress / Blocked / Complete), saves on change via `PATCH /api/tracker/items/:id`.
- **Owner cell** — click, dropdown of people, saves on change.
- All other edits route through the drawer.

### 4.3 Side-panel drawer

Slides in from the right. Opens on: clicking a row name, clicking "+ Add Project / Task / Subtask", clicking "Edit" in a row's overflow menu.

Fields:
- Name (required)
- Description
- Owner (single-select, people list)
- Support (multi-select chips, people list) — projects only; hidden on tasks/subtasks
- Start date, End date (ISO picker)
- Status
- `is_milestone` toggle (when on, collapses date pickers to a single "On" date)
- `needs_verification` toggle, with a `verification_note` textarea that appears when on
- Color (projects only) — swatch picker with the 8-color palette below

Buttons: Save · Cancel · Delete (with confirm).

### 4.4 "+ Add" affordances

- Sprint-level: "+ New Sprint" button in the header.
- Project-level: "+ Add Project" row at the bottom of the sprint's project list.
- Task-level: "+ Add Task" row appears inside each expanded project.
- Subtask-level: "+ Add Subtask" row appears inside each expanded task.

### 4.5 Color palette

Eight options for projects, mapped to Tailwind arbitrary values via a `colorMap` helper in `tracker.js`. Red is reserved for go/no-go.

| Key | Fill | Text |
|---|---|---|
| purple | #EEEDFE | #26215C |
| amber | #FAEEDA | #412402 |
| teal | #E1F5EE | #04342C |
| coral | #FAECE7 | #4A1B0C |
| pink | #FBEAF0 | #4B1528 |
| blue | #E6F1FB | #042C53 |
| green | #EAF3DE | #173404 |
| gray | #F3F4F6 | #1F2937 |
| red (reserved) | #A32D2D | — |

### 4.6 Manage People modal

Modal opened from the header. Lists active people; supports add / edit / soft-delete (deactivate). Bare-bones CRUD — no avatars, no roles.

---

## 5. Seed data

New file `src/db/tracker-seed.js`, called from `src/db/database.js` after the `CREATE TABLE` block. Runs only if `tracker_sprints` is empty — it's a no-op on every subsequent boot and will never clobber edits.

### 5.1 People (12 rows)

| initials | full_name |
|---|---|
| ER | Eric |
| TR | Tyler |
| MS | Matthias |
| LG | Lydia |
| CB | Corey |
| JL | JB |
| BN | Ben |
| VH | Vicki |
| KM | Kaylie |
| CS | Celia |
| DG | David |
| RH | Richa |

Mapping notes for seed:
- v1/v2 references to "Dan" map to `DG` (David). No separate "Dan" row.
- v2's "National" entry is not seeded (v2 flagged it as unclear: person vs. team/brand).

### 5.2 Sprint (1 row)

- name: `Hotel Bots - Sprint 1`
- start_date: `2026-04-22` (yesterday, per session date 2026-04-23)
- end_date: `2026-05-13` (start + 21 days)

### 5.3 Projects (10 rows)

From v2's workstream list, in order: Deploy, Deal + Prospects, Assessments, Robot command, Service van, Elevator Sim, Robot catalog, Investor + Financial, Robot Dossier, Inquiries + Public website.

For each project, seed:
- `owner_id` resolved from v2's "Owner" field
- `color` from the v2 color mapping (gray fallback where ambiguous)
- `start_date` / `end_date` computed from v2's week phrasing relative to the sprint's 2026-04-22 start (e.g. "Weeks 1–3" → sprint start/end; "Weeks 2-3" → start+7 / end)
- `needs_verification = 1` for any project v2 marks with `[VERIFY]`
- `verification_note` copied from the v2 note for that row
- Support list populated from v2's "Support" field (resolving names/initials against the seeded people table)

### 5.4 Tasks

Seed sub-task rows for projects that have them in v2 (at minimum: Deal + Prospects → "V1 launch" + "V2 iteration & build-out").

### 5.5 Milestones

- `V1 launched` — `tracker_items` row with `is_milestone = 1`, `parent_id` = the Deal + Prospects project, `start_date = end_date = 2026-04-22` (start of week 1), color inherits from parent.
- `Go / no-go decision` — `tracker_items` row with `level = 'project'`, `parent_id = NULL`, `is_milestone = 1`, `start_date = end_date = 2026-05-13` (sprint end), `color = red` reserved.

---

## 6. Testing

Per `.claude/rules/testing.md`.

### 6.1 Unit tests — `tests/unit/tracker-validation.test.js`

- Date-range validator: rejects `end_date < start_date`.
- Level-hierarchy validator: project has no parent; task parent must be project; subtask parent must be task.
- Enum validators: `status` and `level` accept only whitelisted values.

### 6.2 Integration tests — `tests/integration/tracker.test.js`

Hits a real SQLite database (no mocks, per the rule). Covers:

- Happy path: create sprint → create project → create task → create subtask. Verify nested read returns the full tree.
- Reject invalid parent levels (task with no parent, subtask with project as parent, etc.).
- PATCH `status` via inline-edit path (partial body).
- PUT support list replaces (not appends).
- DELETE sprint cascades to all descendants; DELETE people soft-deletes and preserves historical `owner_id` references.
- Length limits return 400 with a clear message.
- Unauthenticated requests return 401 (middleware coverage).

### 6.3 E2E

Out of scope for MVP. The integration suite + a manual walkthrough cover critical paths; a Playwright spec for the page is cheap to add once the UI is stable.

---

## 7. File layout

### 7.1 New files

```
public/admin-project-tracker.html      ← the page
public/js/tracker.js                   ← all client logic
src/routes/tracker.js                  ← API
src/db/tracker-seed.js                 ← one-shot seed
tests/integration/tracker.test.js
tests/unit/tracker-validation.test.js
```

### 7.2 Modified files

```
src/db/database.js                     ← 5 new CREATE TABLE blocks + call tracker-seed after create
src/server.js                          ← mount /api/tracker under requireAuth
public/admin-command-center.html       ← add tool-card tile linking to the tracker page
docs/20-architecture/database-schema.md ← document 5 new tables
CHANGELOG.md                           ← user-visible feature entry
```

---

## 8. Wiring verification

Per `.claude/rules/wiring-verification.md`.

### Backend
- [ ] `src/routes/tracker.js` mounted under `/api/tracker` in `src/server.js`
- [ ] All routes wrapped in `requireAuth`
- [ ] 5 new tables present in `src/db/database.js`
- [ ] Seed module imported and invoked after schema creation
- [ ] CSP in `src/server.js` already permits `cdn.tailwindcss.com`; no new external origins required

### Frontend
- [ ] `admin-project-tracker.html` reachable via tile on `admin-command-center.html`
- [ ] `admin-project-tracker.html` calls `checkAuth()` from `js/admin-auth.js` on load
- [ ] `public/js/tracker.js` makes real fetches to `/api/tracker/sprints`, `/api/tracker/sprints/:id`, `/api/tracker/people`
- [ ] Loading + error states handled for the initial sprint fetch
- [ ] Field names in the client match the JSON shapes returned by `src/routes/tracker.js`

### Cross-cutting
- [ ] Page title and breadcrumbs consistent with other admin pages
- [ ] `CHANGELOG.md` updated
- [ ] `docs/20-architecture/database-schema.md` reflects the 5 new tables

---

## 9. Future work (out of MVP)

- Per-person login coupling via a nullable `admin_user_id INTEGER REFERENCES admin_users(id)` column on `tracker_people`, added with `ALTER TABLE ADD COLUMN IF NOT EXISTS`.
- Owner / status filters in the UI.
- PNG / PDF export of a sprint view.
- Comment threads per item.
- Drag-to-reorder and drag-to-resize bars.
- A multi-sprint calendar view that overlays parallel sprints on one timeline.
