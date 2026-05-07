# ADR-0006: Turso/libsql for hosted SQLite

**Status:** Accepted
**Date:** 2026-04-23
**Supersedes part of:** [ADR-0001: SQLite over Postgres](0001-sqlite-over-postgres.md) — the choice of SQLite stands; the choice of *where it runs* changes.

## Context

ADR-0001 chose file-based SQLite (`better-sqlite3`) on a persistent disk. That survived one deployment platform (Railway) only after a volume-mount misconfiguration quietly wiped production on every deploy for weeks. Moving to Render surfaced the same risk: the database file lives inside the container, and a disk mount has to be set up, verified, and maintained by a human. One bad setting = silent data loss.

The symptom wasn't SQLite. The symptom was *SQLite stored next to the compute*. Whenever compute is ephemeral and storage is the persistence layer, you're one misconfiguration away from data loss — and there's no audit trail when it happens.

## Decision

Move production storage to **Turso** (hosted libsql, a SQLite fork exposed over the network).

- Connection via `@libsql/client` using `DATABASE_URL` + `DATABASE_AUTH_TOKEN`
- Local dev connects to `file:./data/accelerate.db` via the same client (libsql supports local files)
- Tests use in-memory `better-sqlite3` wrapped in a libsql-style `{ one, all, run, transaction }` helper — same API surface, fast in-process execution
- No disk mount on Render; the persistent disk line is removed from `render.yaml`

## Rationale

- **Schema stays SQLite.** Turso is a SQLite fork. Every `CREATE TABLE`, every `CHECK` constraint, every `INSERT OR REPLACE`, every `?` placeholder — unchanged. The migration was execution-layer only, not schema.
- **Compute-storage separation.** The app container can restart, scale, or move to a new region without touching the data. No volume ever needs to be verified again.
- **Managed backups.** Turso runs daily backups on the Starter plan. Previously we had none — disk snapshots on Render are separate and cost more.
- **Real-time local/cloud sync.** Eric's Mac and the Render container can point at the same `DATABASE_URL`, so edits made locally are immediately visible in production. This was the trigger for the whole Stage 2 conversation.
- **Multi-writer.** libsql over the network handles concurrent writers cleanly. File-based SQLite can deadlock on WAL contention under concurrent writes (rare at our scale, but not impossible).

## Consequences

### Positive
- Data loss from container ephemerality is impossible now — storage is a separate managed service.
- Local dev and production share one data store, killing the "your changes aren't showing on cloud" class of bugs.
- Backups happen automatically.

### Negative
- Every query is now a network round-trip. For our admin tool traffic (single-digit QPS), latency is a non-issue. If we ever need per-request local reads, libsql supports embedded replicas.
- The codebase is now fully async. Every route handler changed signature. Every future route must remember `await`.
- Turso is a smaller project than Postgres or MySQL. If Turso disappears we'd need to migrate; the migration is straightforward because it's still SQLite (can dump → restore to a standalone SQLite file).

### Neutral
- Authenticated with a JWT-like token issued by Turso. Rotation via `turso db tokens create`. Stored as a Render env var.

## Rollback plan

If Turso has a sustained outage, we can:
1. Dump latest backup from Turso CLI: `turso db shell <db> ".dump" > backup.sql`
2. Load into a local `better-sqlite3` file
3. Flip `DATABASE_URL` to `file:/app/data/accelerate.db`, attach a Render disk
4. Redeploy — the app runs on local SQLite again

This is a 15-minute DR path, not a rewrite.

## Related

- [ADR-0001: SQLite over Postgres](0001-sqlite-over-postgres.md) — still stands for the schema choice
- Migration PR: `feat/turso-libsql-migration` branch
