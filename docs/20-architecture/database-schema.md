# Database Schema

SQLite schema. Lives in `src/db/database.js` as a single `CREATE TABLE IF NOT EXISTS` block that runs on boot. No migration framework yet — see [`../../.claude/rules/database-migrations.md`](../../.claude/rules/database-migrations.md).

## Engine

- **better-sqlite3** — synchronous, fast, embedded
- **Journal mode:** WAL (write-ahead log) for better concurrency
- **Foreign keys:** enabled via `PRAGMA foreign_keys = ON`
- **File path:** `./data/accelerate.db` (override with `DB_PATH` env var)
- **Directory is auto-created** on boot if missing

## Tables

### `admin_users`

Admin accounts for the `/admin` dashboard.

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `email` | TEXT | UNIQUE NOT NULL | Lowercase by convention |
| `password_hash` | TEXT | NOT NULL | bcrypt, 12 rounds |
| `created_at` | TEXT | DEFAULT datetime('now') | ISO-ish string |

**Seeding:** on boot, if `ADMIN_EMAIL` and `ADMIN_PASSWORD` env vars are set and no admin exists with that email, a new row is inserted.

### `inquiries`

Public contact form submissions. Single source of truth for leads.

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `name` | TEXT | NOT NULL | |
| `email` | TEXT | NOT NULL | Validated on insert |
| `company` | TEXT | nullable | |
| `phone` | TEXT | nullable | |
| `message` | TEXT | NOT NULL | Max 5000 chars (enforced by route) |
| `status` | TEXT | DEFAULT 'new', CHECK IN ('new', 'reviewed', 'contacted', 'archived') | |
| `created_at` | TEXT | DEFAULT datetime('now') | |
| `reviewed_at` | TEXT | nullable | Updated via PATCH |

**Lifecycle:** `new` → `reviewed` → `contacted` → `archived`.

### `notification_recipients`

Who gets emailed when a new inquiry comes in.

| Column | Type | Constraint | Notes |
|---|---|---|---|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `email` | TEXT | UNIQUE NOT NULL | |
| `name` | TEXT | nullable | |
| `active` | INTEGER | DEFAULT 1, CHECK IN (0,1) | Soft-off switch |
| `created_at` | TEXT | DEFAULT datetime('now') | |

**Seeding:** on admin seed, the seeded admin email is also inserted here so they receive inquiry notifications by default.

## Operational notes

- **No foreign keys between these tables yet.** Recipients are independent of admin users; deleting an admin does not remove their recipient entry.
- **No soft-delete on `inquiries`** — use `status = 'archived'` instead.
- **Timestamps are TEXT, not INTEGER.** This is SQLite idiomatic — `datetime('now')` returns a string. We sort lexicographically, which works because ISO format is sortable.
- **Backup strategy:** See [`../50-operations/runbooks/backup-database.md`](../50-operations/runbooks/backup-database.md).

## Related

- [`api-reference.md`](api-reference.md) — HTTP endpoints that query these tables
- [`adr/0001-sqlite-over-postgres.md`](adr/0001-sqlite-over-postgres.md) — why SQLite
- [`../../.claude/rules/database-migrations.md`](../../.claude/rules/database-migrations.md) — rules for schema changes
- [`../50-operations/runbooks/backup-database.md`](../50-operations/runbooks/backup-database.md) — backup procedure

## Project tracker

Sprint-based multi-project planner. Page at `/admin/project-tracker`.

### `tracker_sprints`

Top-level container for a time-boxed workstream sprint.

| Column | Type | Constraints |
|---|---|---|
| id | TEXT | PRIMARY KEY (UUID) |
| name | TEXT | NOT NULL |
| description | TEXT | |
| start_date | TEXT | NOT NULL (ISO date; API enforces start ≤ end) |
| end_date | TEXT | NOT NULL |
| created_at / updated_at | TEXT | DEFAULT (datetime('now')) |

### `tracker_items`

Unified table for projects / tasks / subtasks — one table instead of three because they share nearly all columns; the `level` CHECK + `parent_id` FK enforce the hierarchy.

| Column | Type | Constraints |
|---|---|---|
| id | TEXT | PRIMARY KEY (UUID) |
| sprint_id | TEXT | NOT NULL REFERENCES tracker_sprints(id) ON DELETE CASCADE |
| parent_id | TEXT | REFERENCES tracker_items(id) ON DELETE CASCADE (NULL for projects) |
| level | TEXT | NOT NULL CHECK (level IN ('project','task','subtask')) |
| name | TEXT | NOT NULL |
| description | TEXT | |
| owner_id | INTEGER | REFERENCES tracker_people(id) |
| color | TEXT | (only meaningful on projects) |
| start_date / end_date | TEXT | NOT NULL |
| status | TEXT | CHECK IN (not_started, in_progress, blocked, complete) |
| needs_verification | INTEGER | CHECK (0,1) |
| verification_note | TEXT | |
| is_milestone | INTEGER | CHECK (0,1) — renders as diamond |
| sort_order | INTEGER | NOT NULL DEFAULT 0 |
| created_at / updated_at | TEXT | DEFAULT (datetime('now')) |

**Hierarchy rules** (enforced in `src/services/tracker-validation.js`, not the DB): projects have no parent; task parent must be a project; subtask parent must be a task. `sprint_id`, `level`, and `parent_id` are immutable after creation.

### `tracker_people`

Managed list of people for owner / support dropdowns. Decoupled from `admin_users`.

| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| initials | TEXT | NOT NULL |
| full_name | TEXT | |
| notes | TEXT | |
| active | INTEGER | NOT NULL DEFAULT 1 CHECK (0,1) — soft delete |
| created_at | TEXT | DEFAULT (datetime('now')) |

### `tracker_item_support`

Many-to-many: which people support which item.

| Column | Type | Constraints |
|---|---|---|
| item_id | TEXT | NOT NULL REFERENCES tracker_items(id) ON DELETE CASCADE |
| person_id | INTEGER | NOT NULL REFERENCES tracker_people(id) ON DELETE CASCADE |
| PRIMARY KEY | | (item_id, person_id) |

### `hotels_saved`

Sales-rep prospecting database. Hotels saved from the Hotel Research tool (`/pages/hotel-research.html`) — searches OpenStreetMap by city/zip, then bookmarks candidates with rep-captured intel (actual nightly rate, deal status, notes).

| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| address | TEXT | nullable — stitched from OSM `addr:*` tags |
| city / state / zip / country | TEXT | nullable each |
| lat / lng | REAL | nullable — copied from OSM |
| brand | TEXT | nullable — chain or operator (e.g. "Hampton Inn") |
| stars | INTEGER | nullable — 1–5 |
| rooms | INTEGER | nullable — when OSM tags it |
| phone / website | TEXT | nullable |
| osm_id | TEXT | `${type}/${id}` from OSM, used to dedupe re-saves |
| est_adr_dollars | INTEGER | nullable — rep's actual rate (overrides the brand-based estimate shown in search) |
| status | TEXT | NOT NULL DEFAULT 'lead' CHECK IN ('lead', 'contacted', 'qualified', 'proposed', 'won', 'lost', 'archived') |
| notes | TEXT | nullable — free-form rep intel (decision-maker, follow-up dates, etc.) |
| saved_by | TEXT | nullable — admin email captured at insert time |
| created_at / updated_at | TEXT | DEFAULT (datetime('now')) |

**Indexes:** `(status, updated_at DESC)` for filtered list views, `(city)` for region-rollup reports.

**Why no real-time pricing:** real nightly rates require a paid partner API (Amadeus, Booking, Expedia EPS). The current build returns rough ADR estimates from a brand → rate lookup table or a star-rating fallback. Reps can override per-hotel via `est_adr_dollars` after calling the property.

### `whatsapp_groups`

Curated directory of company WhatsApp groups + communities. Powers `/pages/whatsapp-hub.html`. Editable via the admin UI (auth-gated CRUD at `/api/whatsapp`).

| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| name | TEXT | NOT NULL |
| description | TEXT | nullable — short blurb shown on the card |
| category | TEXT | NOT NULL DEFAULT 'team' CHECK IN ('team', 'project', 'customer', 'community', 'other') |
| invite_url | TEXT | nullable — host whitelisted to `chat.whatsapp.com` / `wa.me` at the route layer |
| member_count | INTEGER | NOT NULL DEFAULT 0 — manual entry, kept fresh by whoever updates the card |
| notes | TEXT | nullable — "what's currently being discussed" surface |
| pinned | INTEGER | NOT NULL DEFAULT 0 (0/1) — pinned cards sort first |
| created_by | TEXT | nullable — admin email captured at insert time |
| created_at / updated_at | TEXT | DEFAULT (datetime('now')) |

**Indexes:** `(category)`, `(pinned DESC, updated_at DESC)` for the default sort.

**Why directory, not feed:** WhatsApp doesn't expose a "read all my groups" API, and the Business API requires per-group opt-in plus paid templates. Curating names + invite links + freshness notes gives the heads-up view without fragile scraping.
