# Database Migration Policy

## Today's state

The schema lives in `src/db/database.js` as a single `CREATE TABLE IF NOT EXISTS` block that runs on server start. **There is no migration framework yet.** This works because we're pre-production and the schema is small.

When schema changes need to survive a production database with real data, we will introduce a migration tool (see [`docs/20-architecture/adr/0001-sqlite-over-postgres.md`](../../docs/20-architecture/adr/0001-sqlite-over-postgres.md)).

## Rules until then

### Adding a table

1. Add the `CREATE TABLE IF NOT EXISTS` statement in `src/db/database.js`
2. Include a `WHY:` comment if any design choice isn't obvious (e.g., why `TEXT` instead of `INTEGER` for timestamps)
3. Include all indexes and constraints in the same statement
4. Update [`docs/20-architecture/database-schema.md`](../../docs/20-architecture/database-schema.md)

### Adding a column

SQLite supports `ALTER TABLE ADD COLUMN` but the `CREATE TABLE IF NOT EXISTS` approach we use won't re-run. Until we have a migration tool:

1. Add the column to the `CREATE TABLE` statement for new databases
2. Write a one-shot `ALTER TABLE ... ADD COLUMN ... IF NOT EXISTS` statement (SQLite 3.35+) guarded by existence check
3. **Manually run** the ALTER against any production DB
4. Document the change in [`docs/20-architecture/database-schema.md`](../../docs/20-architecture/database-schema.md)
5. Update the CHANGELOG

### Changing or removing a column

**Stop and think.** SQLite's support for `DROP COLUMN` and `RENAME COLUMN` is limited and risky. Before doing either:

1. Write an ADR explaining why
2. Plan the backfill strategy for existing data
3. Consider if you actually need a new column with a different name, leaving the old one dormant
4. Back up the database first (`docs/50-operations/runbooks/backup-database.md`)

### Never

- **Never drop `admin_users`, `inquiries`, or `notification_recipients`** without an ADR and an explicit team decision
- **Never write raw SQL that runs on boot** without the `IF NOT EXISTS` guard — it will break restart
- **Never use `AUTOINCREMENT` for new tables** unless you need gap-free IDs — `INTEGER PRIMARY KEY` is faster and good enough
- **Never add a `NOT NULL` column to an existing table** without a DEFAULT — existing rows will fail the constraint

## When we do adopt a migration framework

Preferred candidates (decision pending, see roadmap):
- `drizzle-kit` — if we adopt Drizzle ORM anyway
- `node-pg-migrate` style — plain SQL up/down, SQLite flavor
- Custom: a `migrations/` folder of numbered `.sql` files run in order by a boot script

Any of these require:
- Every migration is reversible or explicitly one-way (documented)
- Migrations run automatically on server boot OR as an explicit CI step
- A `schema_migrations` table tracks what's been applied
