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
