---
name: schema-diff
description: Preview a SQLite schema change and its impact before applying it to a production database
---

# /schema-diff — Preview a schema change

## When to use

User wants to change `src/db/database.js` — adding a table, adding a column, changing a constraint — and wants to see the impact before applying it.

## Steps

1. **Read the current schema** from `src/db/database.js`.

2. **Read the production database schema** (if accessible):
   ```bash
   sqlite3 data/accelerate.db .schema
   ```

3. **Compare the two.** Differences mean a past change was made in code that hasn't been applied to the production DB yet.

4. **Read the proposed change** the user wants to make.

5. **Print three things:**
   - **Diff summary** — which tables and columns change
   - **Rows affected** — estimate from a `SELECT COUNT(*)` on affected tables
   - **Risk level** — LOW, MEDIUM, HIGH with explanation

   **Risk heuristics:**
   - LOW: new table with no foreign keys, new nullable column
   - MEDIUM: new column with DEFAULT, adding index, new CHECK constraint
   - HIGH: DROP COLUMN, NOT NULL without DEFAULT, RENAME, foreign key changes, data type changes

6. **Generate the migration SQL**:
   - For new tables: the `CREATE TABLE` statement
   - For new columns: the `ALTER TABLE ... ADD COLUMN` statement
   - For destructive changes: the multi-step copy-rename dance SQLite requires

7. **Remind the user** of the backup runbook: `docs/50-operations/runbooks/backup-database.md`

8. **Do not apply the change.** This skill is read-only. The user makes the decision.

## Output format

```
Schema Change Preview
---------------------
Current: src/db/database.js (N tables)
Proposed: + adds column `foo` to `inquiries`

Diff:
  inquiries:
    + foo TEXT DEFAULT NULL

Rows affected:
  inquiries: 142 rows (will get NULL foo)

Risk: LOW
  New nullable column, no constraints, no data transformation.

Migration SQL:
  ALTER TABLE inquiries ADD COLUMN foo TEXT;

Reminder: back up the production DB before applying.
  See docs/50-operations/runbooks/backup-database.md
```
