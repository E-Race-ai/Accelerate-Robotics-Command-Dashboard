# ADR 0001 — SQLite over Postgres for the backing store

- **Status:** Accepted
- **Date:** 2025-12-14
- **Deciders:** Eric

## Context

We need a backing store for:

- Admin users (a handful of rows)
- Inquiries (marketing contact form — dozens to low thousands over any reasonable horizon)
- Notification recipients (a handful of rows)

The working set for the foreseeable future is **kilobytes**, not megabytes or gigabytes. We're a single-process Node.js monolith deployed on Railway. We have no analyst team, no reporting pipeline, and no cross-service consumers.

The relevant forces:

- **Simplicity matters more than scale right now.** We're not optimizing for 10k writes/sec; we're optimizing for shipping the next site.
- **Ops surface must be tiny.** One person operates this.
- **Backups are still required.** Any lost inquiry is a lost lead.

## Options considered

### Option A: SQLite (better-sqlite3)

- **Pros:**
  - Zero infra — single file, no network service
  - Synchronous API matches the monolith's shape
  - Free, no quota, no connection limits
  - WAL mode gives solid crash recovery and concurrent reads
  - Backup is `cp data/accelerate.db backup/`
- **Cons:**
  - Single-writer limits throughput (fine for our load)
  - Migration story is homegrown until we adopt a tool
  - No first-class cloud-managed backup — we have to own it
  - Scaling horizontally requires a rewrite or a LiteFS-like sync layer

### Option B: Postgres (Railway add-on, Neon, or Supabase)

- **Pros:**
  - Better concurrency, stronger migration tooling
  - Managed backups on most providers
  - Standard industry choice, easier to hire for
- **Cons:**
  - Managed DB cost adds up ($10–$25/mo minimum)
  - Connection pooling is another thing to reason about
  - Overkill for our data volume
  - More env vars, more secrets to rotate

### Option C: Firestore / DynamoDB

- **Pros:** Infinite scale.
- **Cons:** NoSQL constraint on queries; vendor lock-in; cost more than SQLite.

## Decision

**SQLite via better-sqlite3** with WAL mode. The file lives at `./data/accelerate.db` locally and on a persistent Railway volume in production.

## Consequences

- **Positive:**
  - Zero infra cost beyond the existing Railway service
  - Backup is a file copy (see [`../../50-operations/runbooks/backup-database.md`](../../50-operations/runbooks/backup-database.md))
  - No connection pool management
  - Code stays simple — synchronous DB calls
- **Negative:**
  - When we do need Postgres (horizontal scale, analytics, multi-region), we'll have to migrate
  - No managed point-in-time recovery; our backup cadence matters
- **Neutral:**
  - Schema changes need discipline until we adopt a migration tool

## Follow-ups

- Adopt a migration tool (candidates: drizzle-kit, or plain SQL files in `migrations/`)
- Document backup + restore in a runbook (done)
- Revisit this ADR if we outgrow SQLite (write throughput or query complexity)

## References

- `src/db/database.js`
- [`../database-schema.md`](../database-schema.md)
- [`../../.claude/rules/database-migrations.md`](../../.claude/rules/database-migrations.md)
