# Project Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a multi-sprint project tracker to the admin portal, seeded from `docs/60-roadmap/project_tracker_v2.md` ("Hotel Bots - Sprint 1") and designed to hold future sprints.

**Architecture:** New `admin-project-tracker.html` backed by five new SQLite tables (`tracker_sprints`, `tracker_items`, `tracker_people`, `tracker_item_support`) and REST routes under `/api/tracker` behind `requireAuth`. Unified `tracker_items` table carries projects/tasks/subtasks with a `level` CHECK constraint. Gantt UI with inline edits for status/owner, side-panel drawer for everything else. No build step — follows the existing vanilla HTML + Tailwind CDN + vanilla JS pattern used by every other admin page.

**Tech Stack:** Node.js + Express, `better-sqlite3`, vanilla HTML + Tailwind CDN, vanilla JS, Vitest for tests. `crypto.randomUUID()` for IDs via `src/services/id-generator.js`.

**Reference spec:** [`docs/superpowers/specs/2026-04-23-project-tracker-design.md`](../specs/2026-04-23-project-tracker-design.md)

---

## File Map

**New files**
```
public/admin-project-tracker.html        ← page
public/js/tracker.js                     ← client logic
src/routes/tracker.js                    ← API
src/services/tracker-validation.js       ← pure validators (unit-tested)
src/db/tracker-seed.js                   ← one-shot seed
tests/integration/tracker.test.js
tests/unit/tracker-validation.test.js
```

**Modified files**
```
src/db/database.js                       ← 5 new CREATE TABLE blocks
tests/helpers/setup.js                   ← same 5 blocks for test DB
src/server.js                            ← mount /api/tracker + /admin/project-tracker + invoke seed
public/admin-command-center.html         ← add tool tile
docs/20-architecture/database-schema.md  ← document 5 new tables
CHANGELOG.md                             ← user-visible entry
```

---

## Task 1: Schema — five new tables in prod and test DBs

**Files:**
- Modify: `src/db/database.js` (append at the end of the existing `db.exec` block, after `prospects` table)
- Modify: `tests/helpers/setup.js` (same blocks, inside the `createTestDb()` `db.exec` call)
- Test: `tests/integration/tracker-schema.test.js` (new)

- [ ] **Step 1: Write the failing schema test**

Create `tests/integration/tracker-schema.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createTestDb } = require('../helpers/setup');

describe('tracker schema', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => cleanup());

  it('creates all five tracker tables', () => {
    const rows = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' AND name LIKE 'tracker_%' ORDER BY name"
    ).all();
    const names = rows.map(r => r.name);
    expect(names).toEqual([
      'tracker_item_support',
      'tracker_items',
      'tracker_people',
      'tracker_sprints',
    ]);
  });

  it('enforces level CHECK on tracker_items', () => {
    db.prepare(`INSERT INTO tracker_sprints (id, name, start_date, end_date)
                VALUES ('s1', 'Test', '2026-04-22', '2026-05-13')`).run();
    expect(() => {
      db.prepare(`INSERT INTO tracker_items (id, sprint_id, level, name, start_date, end_date)
                  VALUES ('i1', 's1', 'garbage', 'X', '2026-04-22', '2026-04-22')`).run();
    }).toThrow();
  });

  it('cascades delete from sprint to items', () => {
    db.prepare(`INSERT INTO tracker_sprints (id, name, start_date, end_date)
                VALUES ('s1', 'Test', '2026-04-22', '2026-05-13')`).run();
    db.prepare(`INSERT INTO tracker_items (id, sprint_id, level, name, start_date, end_date)
                VALUES ('i1', 's1', 'project', 'P1', '2026-04-22', '2026-04-29')`).run();
    db.prepare(`DELETE FROM tracker_sprints WHERE id = 's1'`).run();
    const items = db.prepare(`SELECT id FROM tracker_items WHERE sprint_id = 's1'`).all();
    expect(items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run the test and confirm failure**

Run: `npm test -- tests/integration/tracker-schema.test.js`
Expected: FAIL — tables do not exist.

Note: the test helper uses `tests` at the project root; `npm test` runs `vitest run`.

- [ ] **Step 3: Add the five CREATE TABLE blocks to `src/db/database.js`**

Open `src/db/database.js`. Find the closing backtick of the existing `db.exec(\`...\`);` call that contains the `prospects` table. Insert the following **inside** that same template string, after the `prospects` table definition (before the closing `);`):

```sql

  -- ── Project tracker (sprint-based multi-project planner) ────────

  CREATE TABLE IF NOT EXISTS tracker_sprints (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tracker_people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    initials TEXT NOT NULL,
    full_name TEXT,
    notes TEXT,
    active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- WHY: Single table for projects + tasks + subtasks — they share 95% of columns.
  -- The level CHECK + parent_id FK enforce the 4-level hierarchy (sprint → project → task → subtask).
  CREATE TABLE IF NOT EXISTS tracker_items (
    id TEXT PRIMARY KEY,
    sprint_id TEXT NOT NULL REFERENCES tracker_sprints(id) ON DELETE CASCADE,
    parent_id TEXT REFERENCES tracker_items(id) ON DELETE CASCADE,
    level TEXT NOT NULL CHECK(level IN ('project', 'task', 'subtask')),
    name TEXT NOT NULL,
    description TEXT,
    owner_id INTEGER REFERENCES tracker_people(id),
    color TEXT,
    start_date TEXT NOT NULL,
    end_date TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'not_started'
      CHECK(status IN ('not_started', 'in_progress', 'blocked', 'complete')),
    needs_verification INTEGER NOT NULL DEFAULT 0 CHECK(needs_verification IN (0, 1)),
    verification_note TEXT,
    is_milestone INTEGER NOT NULL DEFAULT 0 CHECK(is_milestone IN (0, 1)),
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS tracker_item_support (
    item_id TEXT NOT NULL REFERENCES tracker_items(id) ON DELETE CASCADE,
    person_id INTEGER NOT NULL REFERENCES tracker_people(id) ON DELETE CASCADE,
    PRIMARY KEY (item_id, person_id)
  );
```

- [ ] **Step 4: Add the same five blocks to `tests/helpers/setup.js`**

Open `tests/helpers/setup.js`. Find the `db.exec(\`...\`)` call inside `createTestDb()`. Insert the five `CREATE TABLE` blocks (identical to Step 3) into that same template string, after the `prospects` table definition.

- [ ] **Step 5: Re-run the schema test, confirm pass**

Run: `npm test -- tests/integration/tracker-schema.test.js`
Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add src/db/database.js tests/helpers/setup.js tests/integration/tracker-schema.test.js
git commit -m "$(cat <<'EOF'
feat(tracker): Add schema for project tracker

Problem: Need SQLite tables to back the admin project tracker page.
Solution: Add tracker_sprints, tracker_people, tracker_items, and
tracker_item_support tables to both the prod schema and the test helper.
Unified tracker_items table uses a level CHECK + parent_id FK to enforce
the 4-level hierarchy. Schema tests assert tables exist, enum CHECKs fire,
and sprint delete cascades to items.
EOF
)"
```

---

## Task 2: Validation helpers (pure functions, unit-tested)

**Files:**
- Create: `src/services/tracker-validation.js`
- Test: `tests/unit/tracker-validation.test.js`

- [ ] **Step 1: Write the failing unit tests**

Create `tests/unit/tracker-validation.test.js`:

```javascript
import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  isValidDateRange,
  isValidLevel,
  isValidStatus,
  validateParentForLevel,
  trimBounded,
} = require('../../src/services/tracker-validation');

describe('tracker-validation', () => {
  describe('isValidDateRange', () => {
    it('accepts equal dates', () => {
      expect(isValidDateRange('2026-04-22', '2026-04-22')).toBe(true);
    });
    it('accepts start before end', () => {
      expect(isValidDateRange('2026-04-22', '2026-05-13')).toBe(true);
    });
    it('rejects end before start', () => {
      expect(isValidDateRange('2026-05-13', '2026-04-22')).toBe(false);
    });
    it('rejects non-date strings', () => {
      expect(isValidDateRange('not-a-date', '2026-04-22')).toBe(false);
    });
  });

  describe('isValidLevel', () => {
    it('accepts project, task, subtask', () => {
      expect(isValidLevel('project')).toBe(true);
      expect(isValidLevel('task')).toBe(true);
      expect(isValidLevel('subtask')).toBe(true);
    });
    it('rejects anything else', () => {
      expect(isValidLevel('sprint')).toBe(false);
      expect(isValidLevel('')).toBe(false);
      expect(isValidLevel(undefined)).toBe(false);
    });
  });

  describe('isValidStatus', () => {
    it('accepts the four statuses', () => {
      expect(isValidStatus('not_started')).toBe(true);
      expect(isValidStatus('in_progress')).toBe(true);
      expect(isValidStatus('blocked')).toBe(true);
      expect(isValidStatus('complete')).toBe(true);
    });
    it('rejects done (we renamed it)', () => {
      expect(isValidStatus('done')).toBe(false);
    });
  });

  describe('validateParentForLevel', () => {
    it('project must have null parent', () => {
      expect(validateParentForLevel('project', null)).toEqual({ ok: true });
      expect(validateParentForLevel('project', { level: 'project' }).ok).toBe(false);
    });
    it('task parent must be project', () => {
      expect(validateParentForLevel('task', { level: 'project' })).toEqual({ ok: true });
      expect(validateParentForLevel('task', null).ok).toBe(false);
      expect(validateParentForLevel('task', { level: 'task' }).ok).toBe(false);
    });
    it('subtask parent must be task', () => {
      expect(validateParentForLevel('subtask', { level: 'task' })).toEqual({ ok: true });
      expect(validateParentForLevel('subtask', { level: 'project' }).ok).toBe(false);
      expect(validateParentForLevel('subtask', null).ok).toBe(false);
    });
  });

  describe('trimBounded', () => {
    it('returns null for undefined', () => {
      expect(trimBounded(undefined, 10)).toBeNull();
    });
    it('trims whitespace', () => {
      expect(trimBounded('  hi  ', 10)).toBe('hi');
    });
    it('rejects strings over the cap', () => {
      expect(trimBounded('a'.repeat(11), 10)).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/unit/tracker-validation.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Create the validation module**

Create `src/services/tracker-validation.js`:

```javascript
const LEVELS = ['project', 'task', 'subtask'];
const STATUSES = ['not_started', 'in_progress', 'blocked', 'complete'];

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isValidDateRange(start, end) {
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) return false;
  return start <= end;
}

function isValidLevel(level) {
  return LEVELS.includes(level);
}

function isValidStatus(status) {
  return STATUSES.includes(status);
}

/**
 * Returns { ok: true } or { ok: false, reason }.
 * parentRow is the full row from tracker_items (needs `level`), or null for top-level.
 */
function validateParentForLevel(level, parentRow) {
  if (level === 'project') {
    return parentRow === null
      ? { ok: true }
      : { ok: false, reason: 'projects must have no parent' };
  }
  if (level === 'task') {
    if (!parentRow) return { ok: false, reason: 'task requires a project parent' };
    return parentRow.level === 'project'
      ? { ok: true }
      : { ok: false, reason: `task parent must be a project, got ${parentRow.level}` };
  }
  if (level === 'subtask') {
    if (!parentRow) return { ok: false, reason: 'subtask requires a task parent' };
    return parentRow.level === 'task'
      ? { ok: true }
      : { ok: false, reason: `subtask parent must be a task, got ${parentRow.level}` };
  }
  return { ok: false, reason: `unknown level: ${level}` };
}

/**
 * Returns:
 *   null if input is undefined/null
 *   the trimmed string if within the cap
 *   false if the trimmed string exceeds the cap (signal to the caller to 400)
 */
function trimBounded(value, maxLen) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (trimmed.length > maxLen) return false;
  return trimmed;
}

module.exports = {
  LEVELS,
  STATUSES,
  isValidDateRange,
  isValidLevel,
  isValidStatus,
  validateParentForLevel,
  trimBounded,
};
```

- [ ] **Step 4: Run and confirm pass**

Run: `npm test -- tests/unit/tracker-validation.test.js`
Expected: 15 passed.

- [ ] **Step 5: Commit**

```bash
git add src/services/tracker-validation.js tests/unit/tracker-validation.test.js
git commit -m "$(cat <<'EOF'
feat(tracker): Add pure validation helpers for tracker

Problem: The tracker API needs date-range, enum, parent-hierarchy,
and length-cap checks — better to isolate them so they can be unit-tested.
Solution: Pure module src/services/tracker-validation.js with four
validators plus a trimBounded helper that returns the trimmed string,
null, or false for over-cap. Fully unit-covered.
EOF
)"
```

---

## Task 3: People API routes

**Files:**
- Create: `src/routes/tracker.js`
- Modify: `src/server.js` (mount the new router)
- Test: `tests/integration/tracker-people.test.js`

- [ ] **Step 1: Write the failing integration test**

Create `tests/integration/tracker-people.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createTestDb } = require('../helpers/setup');

// WHY: We test route logic by calling it directly against a test DB — same pattern as deals.test.js.
// We build a minimal req/res pair since the handlers only read body/params/query and call res.json/status.

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

describe('people routes', () => {
  let db, cleanup, handlers;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    // WHY: The route module imports the real db — we swap in our test db via the factory export.
    delete require.cache[require.resolve('../../src/routes/tracker')];
    handlers = require('../../src/routes/tracker').__testHandlers(db);
  });

  afterEach(() => cleanup());

  it('POST /people creates a person', () => {
    const res = mockRes();
    handlers.createPerson({ body: { initials: 'ER', full_name: 'Eric' } }, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.initials).toBe('ER');
    expect(res.body.full_name).toBe('Eric');
    expect(res.body.id).toBeGreaterThan(0);
  });

  it('POST /people rejects missing initials', () => {
    const res = mockRes();
    handlers.createPerson({ body: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/initials/i);
  });

  it('GET /people returns only active rows', () => {
    const insert = db.prepare(`INSERT INTO tracker_people (initials, active) VALUES (?, ?)`);
    insert.run('ER', 1);
    insert.run('XX', 0);
    insert.run('LG', 1);
    const res = mockRes();
    handlers.listPeople({}, res);
    expect(res.body.map(p => p.initials).sort()).toEqual(['ER', 'LG']);
  });

  it('PATCH /people/:id updates full_name', () => {
    const info = db.prepare(`INSERT INTO tracker_people (initials) VALUES ('ER')`).run();
    const res = mockRes();
    handlers.updatePerson(
      { params: { id: info.lastInsertRowid }, body: { full_name: 'Eric' } },
      res
    );
    expect(res.body.full_name).toBe('Eric');
  });

  it('DELETE /people/:id soft-deletes (active=0)', () => {
    const info = db.prepare(`INSERT INTO tracker_people (initials) VALUES ('ER')`).run();
    const res = mockRes();
    handlers.deletePerson({ params: { id: info.lastInsertRowid } }, res);
    expect(res.body.ok).toBe(true);
    const row = db.prepare(`SELECT active FROM tracker_people WHERE id = ?`).get(info.lastInsertRowid);
    expect(row.active).toBe(0);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/integration/tracker-people.test.js`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create `src/routes/tracker.js` scaffold with people routes**

Create `src/routes/tracker.js`:

```javascript
const express = require('express');
const defaultDb = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { trimBounded } = require('../services/tracker-validation');

const NAME_MAX = 200;
const TEXT_MAX = 5000;

// WHY: Factory pattern lets us inject a test DB — every handler reads from the `db` closure.
// Exported as __testHandlers so integration tests can exercise the handlers without HTTP.
function makeHandlers(db) {
  // ── People ─────────────────────────────────────────────────────
  function listPeople(req, res) {
    const rows = db.prepare(
      `SELECT * FROM tracker_people WHERE active = 1 ORDER BY initials`
    ).all();
    res.json(rows);
  }

  function createPerson(req, res) {
    const initials = trimBounded(req.body?.initials, 20);
    const fullName = trimBounded(req.body?.full_name, NAME_MAX);
    const notes = trimBounded(req.body?.notes, TEXT_MAX);
    if (!initials) return res.status(400).json({ error: 'initials is required' });
    if (fullName === false) return res.status(400).json({ error: `full_name exceeds ${NAME_MAX} chars` });
    if (notes === false) return res.status(400).json({ error: `notes exceeds ${TEXT_MAX} chars` });

    const info = db.prepare(
      `INSERT INTO tracker_people (initials, full_name, notes) VALUES (?, ?, ?)`
    ).run(initials, fullName, notes);
    const row = db.prepare(`SELECT * FROM tracker_people WHERE id = ?`).get(info.lastInsertRowid);
    res.status(201).json(row);
  }

  function updatePerson(req, res) {
    const existing = db.prepare(`SELECT * FROM tracker_people WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Person not found' });

    const updates = {};
    if (req.body?.initials !== undefined) {
      const v = trimBounded(req.body.initials, 20);
      if (!v) return res.status(400).json({ error: 'initials cannot be empty' });
      updates.initials = v;
    }
    if (req.body?.full_name !== undefined) {
      const v = trimBounded(req.body.full_name, NAME_MAX);
      if (v === false) return res.status(400).json({ error: `full_name exceeds ${NAME_MAX} chars` });
      updates.full_name = v;
    }
    if (req.body?.notes !== undefined) {
      const v = trimBounded(req.body.notes, TEXT_MAX);
      if (v === false) return res.status(400).json({ error: `notes exceeds ${TEXT_MAX} chars` });
      updates.notes = v;
    }
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE tracker_people SET ${setClauses} WHERE id = ?`).run(
      ...Object.values(updates), req.params.id
    );
    const row = db.prepare(`SELECT * FROM tracker_people WHERE id = ?`).get(req.params.id);
    res.json(row);
  }

  function deletePerson(req, res) {
    const existing = db.prepare(`SELECT id FROM tracker_people WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Person not found' });
    db.prepare(`UPDATE tracker_people SET active = 0 WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  }

  return { listPeople, createPerson, updatePerson, deletePerson };
}

const handlers = makeHandlers(defaultDb);

const router = express.Router();
router.use(requireAuth);

router.get('/people', handlers.listPeople);
router.post('/people', handlers.createPerson);
router.patch('/people/:id', handlers.updatePerson);
router.delete('/people/:id', handlers.deletePerson);

module.exports = router;
module.exports.__testHandlers = makeHandlers;
```

- [ ] **Step 4: Mount the router in `src/server.js`**

In `src/server.js`, add an import near the other route imports (after `const prospectRoutes = require('./routes/prospects');`):

```javascript
const trackerRoutes = require('./routes/tracker');
```

And add a mount line in the API routes block, after the `prospects` mount:

```javascript
app.use('/api/tracker', trackerRoutes);
```

- [ ] **Step 5: Run tests, confirm pass**

Run: `npm test -- tests/integration/tracker-people.test.js`
Expected: 5 passed.

- [ ] **Step 6: Commit**

```bash
git add src/routes/tracker.js src/server.js tests/integration/tracker-people.test.js
git commit -m "$(cat <<'EOF'
feat(tracker): Add /api/tracker/people CRUD

Problem: Tracker needs a managed people list (dropdown source for
owners + support), decoupled from admin_users.
Solution: POST/GET/PATCH/DELETE under /api/tracker/people. Soft-delete
sets active=0 so historical owner_id references keep resolving. Handlers
are exported via a __testHandlers factory so tests can exercise them
against an in-memory DB without HTTP.
EOF
)"
```

---

## Task 4: Sprints API routes

**Files:**
- Modify: `src/routes/tracker.js`
- Test: `tests/integration/tracker-sprints.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/tracker-sprints.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createTestDb } = require('../helpers/setup');

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

describe('sprint routes', () => {
  let db, cleanup, handlers;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    delete require.cache[require.resolve('../../src/routes/tracker')];
    handlers = require('../../src/routes/tracker').__testHandlers(db);
  });

  afterEach(() => cleanup());

  it('POST /sprints creates a sprint', () => {
    const res = mockRes();
    handlers.createSprint(
      { body: { name: 'S1', start_date: '2026-04-22', end_date: '2026-05-13' } },
      res
    );
    expect(res.statusCode).toBe(201);
    expect(res.body.name).toBe('S1');
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('POST /sprints rejects missing fields', () => {
    const res = mockRes();
    handlers.createSprint({ body: { name: 'S1' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('POST /sprints rejects end_date before start_date', () => {
    const res = mockRes();
    handlers.createSprint(
      { body: { name: 'S1', start_date: '2026-05-13', end_date: '2026-04-22' } },
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/date/i);
  });

  it('GET /sprints lists sprints', () => {
    db.prepare(`INSERT INTO tracker_sprints (id, name, start_date, end_date) VALUES
                ('s1', 'A', '2026-04-22', '2026-05-13'),
                ('s2', 'B', '2026-05-14', '2026-06-04')`).run();
    const res = mockRes();
    handlers.listSprints({}, res);
    expect(res.body).toHaveLength(2);
  });

  it('PATCH /sprints/:id updates name and dates', () => {
    db.prepare(`INSERT INTO tracker_sprints (id, name, start_date, end_date)
                VALUES ('s1', 'A', '2026-04-22', '2026-05-13')`).run();
    const res = mockRes();
    handlers.updateSprint(
      { params: { id: 's1' }, body: { name: 'Renamed', end_date: '2026-05-20' } },
      res
    );
    expect(res.body.name).toBe('Renamed');
    expect(res.body.end_date).toBe('2026-05-20');
  });

  it('DELETE /sprints/:id cascades to items', () => {
    db.prepare(`INSERT INTO tracker_sprints (id, name, start_date, end_date)
                VALUES ('s1', 'A', '2026-04-22', '2026-05-13')`).run();
    db.prepare(`INSERT INTO tracker_items (id, sprint_id, level, name, start_date, end_date)
                VALUES ('i1', 's1', 'project', 'P', '2026-04-22', '2026-04-29')`).run();
    const res = mockRes();
    handlers.deleteSprint({ params: { id: 's1' } }, res);
    const items = db.prepare(`SELECT id FROM tracker_items WHERE sprint_id = 's1'`).all();
    expect(items).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/integration/tracker-sprints.test.js`
Expected: FAIL — `createSprint is not a function`.

- [ ] **Step 3: Add sprint handlers to `src/routes/tracker.js`**

In `src/routes/tracker.js`, add these imports at the top:

```javascript
const { generateId } = require('../services/id-generator');
const { isValidDateRange } = require('../services/tracker-validation');
```

Inside `makeHandlers(db)`, add the sprint handlers below the people handlers (before `return { ... };`):

```javascript
  // ── Sprints ────────────────────────────────────────────────────
  function listSprints(req, res) {
    const rows = db.prepare(
      `SELECT id, name, description, start_date, end_date, created_at, updated_at
       FROM tracker_sprints
       ORDER BY start_date DESC`
    ).all();
    res.json(rows);
  }

  function createSprint(req, res) {
    const name = trimBounded(req.body?.name, NAME_MAX);
    const description = trimBounded(req.body?.description, TEXT_MAX);
    const { start_date, end_date } = req.body || {};
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (description === false) return res.status(400).json({ error: `description exceeds ${TEXT_MAX} chars` });
    if (!start_date || !end_date) return res.status(400).json({ error: 'start_date and end_date are required (YYYY-MM-DD)' });
    if (!isValidDateRange(start_date, end_date)) return res.status(400).json({ error: 'start_date must be <= end_date and both in YYYY-MM-DD' });

    const id = generateId();
    db.prepare(
      `INSERT INTO tracker_sprints (id, name, description, start_date, end_date) VALUES (?, ?, ?, ?, ?)`
    ).run(id, name, description, start_date, end_date);
    const row = db.prepare(`SELECT * FROM tracker_sprints WHERE id = ?`).get(id);
    res.status(201).json(row);
  }

  function updateSprint(req, res) {
    const existing = db.prepare(`SELECT * FROM tracker_sprints WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Sprint not found' });

    const updates = {};
    if (req.body?.name !== undefined) {
      const v = trimBounded(req.body.name, NAME_MAX);
      if (!v) return res.status(400).json({ error: 'name cannot be empty' });
      updates.name = v;
    }
    if (req.body?.description !== undefined) {
      const v = trimBounded(req.body.description, TEXT_MAX);
      if (v === false) return res.status(400).json({ error: `description exceeds ${TEXT_MAX} chars` });
      updates.description = v;
    }
    if (req.body?.start_date !== undefined) updates.start_date = req.body.start_date;
    if (req.body?.end_date !== undefined) updates.end_date = req.body.end_date;

    const finalStart = updates.start_date ?? existing.start_date;
    const finalEnd = updates.end_date ?? existing.end_date;
    if (!isValidDateRange(finalStart, finalEnd)) {
      return res.status(400).json({ error: 'start_date must be <= end_date and both in YYYY-MM-DD' });
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    updates.updated_at = new Date().toISOString();

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE tracker_sprints SET ${setClauses} WHERE id = ?`).run(
      ...Object.values(updates), req.params.id
    );
    const row = db.prepare(`SELECT * FROM tracker_sprints WHERE id = ?`).get(req.params.id);
    res.json(row);
  }

  function deleteSprint(req, res) {
    const existing = db.prepare(`SELECT id FROM tracker_sprints WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Sprint not found' });
    db.prepare(`DELETE FROM tracker_sprints WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  }
```

Update the `return` line inside `makeHandlers` to include the new handlers:

```javascript
  return {
    listPeople, createPerson, updatePerson, deletePerson,
    listSprints, createSprint, updateSprint, deleteSprint,
  };
```

Add the router wires below the existing `router.delete('/people/:id', ...)` line:

```javascript
router.get('/sprints', handlers.listSprints);
router.post('/sprints', handlers.createSprint);
router.patch('/sprints/:id', handlers.updateSprint);
router.delete('/sprints/:id', handlers.deleteSprint);
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npm test -- tests/integration/tracker-sprints.test.js`
Expected: 6 passed.

- [ ] **Step 5: Commit**

```bash
git add src/routes/tracker.js tests/integration/tracker-sprints.test.js
git commit -m "$(cat <<'EOF'
feat(tracker): Add /api/tracker/sprints CRUD

Problem: Sprints are the top-level container for projects/tasks/subtasks.
Solution: POST/GET/PATCH/DELETE under /api/tracker/sprints with
date-range validation on every write. UUIDs via generateId(). DELETE
cascades to items via the existing FK.
EOF
)"
```

---

## Task 5: Items API — create, update, delete, with hierarchy validation

**Files:**
- Modify: `src/routes/tracker.js`
- Test: `tests/integration/tracker-items.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/tracker-items.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createTestDb } = require('../helpers/setup');

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

describe('item routes', () => {
  let db, cleanup, handlers, sprintId;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    delete require.cache[require.resolve('../../src/routes/tracker')];
    handlers = require('../../src/routes/tracker').__testHandlers(db);
    sprintId = 's1';
    db.prepare(`INSERT INTO tracker_sprints (id, name, start_date, end_date)
                VALUES (?, 'S1', '2026-04-22', '2026-05-13')`).run(sprintId);
  });

  afterEach(() => cleanup());

  it('creates a project (no parent, level=project)', () => {
    const res = mockRes();
    handlers.createItem({
      body: {
        sprint_id: sprintId, level: 'project', name: 'Deploy',
        start_date: '2026-04-22', end_date: '2026-05-13',
        color: 'green',
      },
    }, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.level).toBe('project');
    expect(res.body.color).toBe('green');
  });

  it('rejects a project with a parent', () => {
    db.prepare(`INSERT INTO tracker_items (id, sprint_id, level, name, start_date, end_date)
                VALUES ('p1', ?, 'project', 'P', '2026-04-22', '2026-04-29')`).run(sprintId);
    const res = mockRes();
    handlers.createItem({
      body: {
        sprint_id: sprintId, level: 'project', parent_id: 'p1', name: 'X',
        start_date: '2026-04-22', end_date: '2026-04-29',
      },
    }, res);
    expect(res.statusCode).toBe(400);
  });

  it('creates a task under a project', () => {
    db.prepare(`INSERT INTO tracker_items (id, sprint_id, level, name, start_date, end_date)
                VALUES ('p1', ?, 'project', 'P', '2026-04-22', '2026-04-29')`).run(sprintId);
    const res = mockRes();
    handlers.createItem({
      body: {
        sprint_id: sprintId, level: 'task', parent_id: 'p1', name: 'T',
        start_date: '2026-04-22', end_date: '2026-04-25',
      },
    }, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.parent_id).toBe('p1');
  });

  it('rejects a subtask whose parent is a project (not a task)', () => {
    db.prepare(`INSERT INTO tracker_items (id, sprint_id, level, name, start_date, end_date)
                VALUES ('p1', ?, 'project', 'P', '2026-04-22', '2026-04-29')`).run(sprintId);
    const res = mockRes();
    handlers.createItem({
      body: {
        sprint_id: sprintId, level: 'subtask', parent_id: 'p1', name: 'S',
        start_date: '2026-04-22', end_date: '2026-04-23',
      },
    }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/subtask/i);
  });

  it('rejects an unknown sprint_id', () => {
    const res = mockRes();
    handlers.createItem({
      body: {
        sprint_id: 'nope', level: 'project', name: 'P',
        start_date: '2026-04-22', end_date: '2026-04-29',
      },
    }, res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects status not in enum', () => {
    const res = mockRes();
    handlers.createItem({
      body: {
        sprint_id: sprintId, level: 'project', name: 'P',
        start_date: '2026-04-22', end_date: '2026-04-29',
        status: 'done',
      },
    }, res);
    expect(res.statusCode).toBe(400);
  });

  it('PATCH updates status (inline-edit path)', () => {
    db.prepare(`INSERT INTO tracker_items (id, sprint_id, level, name, start_date, end_date)
                VALUES ('p1', ?, 'project', 'P', '2026-04-22', '2026-04-29')`).run(sprintId);
    const res = mockRes();
    handlers.updateItem(
      { params: { id: 'p1' }, body: { status: 'in_progress' } },
      res
    );
    expect(res.body.status).toBe('in_progress');
  });

  it('PATCH rejects changing sprint_id or level', () => {
    db.prepare(`INSERT INTO tracker_items (id, sprint_id, level, name, start_date, end_date)
                VALUES ('p1', ?, 'project', 'P', '2026-04-22', '2026-04-29')`).run(sprintId);
    const res = mockRes();
    handlers.updateItem(
      { params: { id: 'p1' }, body: { level: 'task' } },
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/level|sprint_id|immutable/i);
  });

  it('DELETE cascades to children', () => {
    db.prepare(`INSERT INTO tracker_items (id, sprint_id, level, name, start_date, end_date)
                VALUES ('p1', ?, 'project', 'P', '2026-04-22', '2026-04-29')`).run(sprintId);
    db.prepare(`INSERT INTO tracker_items (id, sprint_id, parent_id, level, name, start_date, end_date)
                VALUES ('t1', ?, 'p1', 'task', 'T', '2026-04-22', '2026-04-24')`).run(sprintId);
    const res = mockRes();
    handlers.deleteItem({ params: { id: 'p1' } }, res);
    const rows = db.prepare(`SELECT id FROM tracker_items WHERE sprint_id = ?`).all(sprintId);
    expect(rows).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/integration/tracker-items.test.js`
Expected: FAIL — `createItem is not a function`.

- [ ] **Step 3: Add item handlers to `src/routes/tracker.js`**

At the top of the file, extend the validator import:

```javascript
const {
  isValidDateRange,
  isValidLevel,
  isValidStatus,
  validateParentForLevel,
} = require('../services/tracker-validation');
```

Inside `makeHandlers(db)`, add these handlers below the sprint handlers:

```javascript
  // ── Items (project/task/subtask) ───────────────────────────────

  // WHY: Small helper to hydrate a single item with its support list — used across create/update.
  function hydrateItem(id) {
    const row = db.prepare(`SELECT * FROM tracker_items WHERE id = ?`).get(id);
    if (!row) return null;
    const support = db.prepare(
      `SELECT person_id FROM tracker_item_support WHERE item_id = ? ORDER BY person_id`
    ).all(id).map(r => r.person_id);
    return { ...row, support_ids: support };
  }

  function createItem(req, res) {
    const b = req.body || {};
    const name = trimBounded(b.name, NAME_MAX);
    const description = trimBounded(b.description, TEXT_MAX);
    const verification_note = trimBounded(b.verification_note, TEXT_MAX);

    if (!name) return res.status(400).json({ error: 'name is required' });
    if (description === false) return res.status(400).json({ error: `description exceeds ${TEXT_MAX} chars` });
    if (verification_note === false) return res.status(400).json({ error: `verification_note exceeds ${TEXT_MAX} chars` });
    if (!b.sprint_id) return res.status(400).json({ error: 'sprint_id is required' });
    if (!isValidLevel(b.level)) return res.status(400).json({ error: "level must be 'project', 'task', or 'subtask'" });
    if (!b.start_date || !b.end_date) return res.status(400).json({ error: 'start_date and end_date are required' });
    if (!isValidDateRange(b.start_date, b.end_date)) return res.status(400).json({ error: 'start_date must be <= end_date (YYYY-MM-DD)' });
    if (b.status !== undefined && !isValidStatus(b.status)) {
      return res.status(400).json({ error: "status must be one of not_started, in_progress, blocked, complete" });
    }

    const sprint = db.prepare(`SELECT id FROM tracker_sprints WHERE id = ?`).get(b.sprint_id);
    if (!sprint) return res.status(400).json({ error: 'sprint_id does not exist' });

    let parentRow = null;
    if (b.parent_id) {
      parentRow = db.prepare(`SELECT id, level, sprint_id FROM tracker_items WHERE id = ?`).get(b.parent_id);
      if (!parentRow) return res.status(400).json({ error: 'parent_id does not exist' });
      if (parentRow.sprint_id !== b.sprint_id) {
        return res.status(400).json({ error: 'parent_id belongs to a different sprint' });
      }
    }
    const parentCheck = validateParentForLevel(b.level, parentRow);
    if (!parentCheck.ok) return res.status(400).json({ error: parentCheck.reason });

    if (b.owner_id !== undefined && b.owner_id !== null) {
      const owner = db.prepare(`SELECT id FROM tracker_people WHERE id = ?`).get(b.owner_id);
      if (!owner) return res.status(400).json({ error: 'owner_id does not exist' });
    }

    const id = generateId();
    db.prepare(`
      INSERT INTO tracker_items
        (id, sprint_id, parent_id, level, name, description, owner_id, color,
         start_date, end_date, status, needs_verification, verification_note,
         is_milestone, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      id,
      b.sprint_id,
      b.parent_id || null,
      b.level,
      name,
      description,
      b.owner_id || null,
      b.color || null,
      b.start_date,
      b.end_date,
      b.status || 'not_started',
      b.needs_verification ? 1 : 0,
      verification_note,
      b.is_milestone ? 1 : 0,
      Number.isInteger(b.sort_order) ? b.sort_order : 0
    );

    res.status(201).json(hydrateItem(id));
  }

  function updateItem(req, res) {
    const existing = db.prepare(`SELECT * FROM tracker_items WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Item not found' });

    const b = req.body || {};
    if ('sprint_id' in b || 'level' in b) {
      return res.status(400).json({ error: 'sprint_id and level are immutable; delete and recreate instead' });
    }
    if ('parent_id' in b) {
      return res.status(400).json({ error: 'parent_id is immutable in MVP; delete and recreate instead' });
    }

    const updates = {};

    if (b.name !== undefined) {
      const v = trimBounded(b.name, NAME_MAX);
      if (!v) return res.status(400).json({ error: 'name cannot be empty' });
      updates.name = v;
    }
    if (b.description !== undefined) {
      const v = trimBounded(b.description, TEXT_MAX);
      if (v === false) return res.status(400).json({ error: `description exceeds ${TEXT_MAX} chars` });
      updates.description = v;
    }
    if (b.verification_note !== undefined) {
      const v = trimBounded(b.verification_note, TEXT_MAX);
      if (v === false) return res.status(400).json({ error: `verification_note exceeds ${TEXT_MAX} chars` });
      updates.verification_note = v;
    }
    if (b.owner_id !== undefined) {
      if (b.owner_id !== null) {
        const owner = db.prepare(`SELECT id FROM tracker_people WHERE id = ?`).get(b.owner_id);
        if (!owner) return res.status(400).json({ error: 'owner_id does not exist' });
      }
      updates.owner_id = b.owner_id;
    }
    if (b.color !== undefined) updates.color = b.color;
    if (b.start_date !== undefined) updates.start_date = b.start_date;
    if (b.end_date !== undefined) updates.end_date = b.end_date;
    if (b.status !== undefined) {
      if (!isValidStatus(b.status)) return res.status(400).json({ error: 'status invalid' });
      updates.status = b.status;
    }
    if (b.needs_verification !== undefined) updates.needs_verification = b.needs_verification ? 1 : 0;
    if (b.is_milestone !== undefined) updates.is_milestone = b.is_milestone ? 1 : 0;
    if (b.sort_order !== undefined && Number.isInteger(b.sort_order)) updates.sort_order = b.sort_order;

    const finalStart = updates.start_date ?? existing.start_date;
    const finalEnd = updates.end_date ?? existing.end_date;
    if (!isValidDateRange(finalStart, finalEnd)) {
      return res.status(400).json({ error: 'start_date must be <= end_date (YYYY-MM-DD)' });
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }
    updates.updated_at = new Date().toISOString();

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE tracker_items SET ${setClauses} WHERE id = ?`).run(
      ...Object.values(updates), req.params.id
    );
    res.json(hydrateItem(req.params.id));
  }

  function deleteItem(req, res) {
    const existing = db.prepare(`SELECT id FROM tracker_items WHERE id = ?`).get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Item not found' });
    db.prepare(`DELETE FROM tracker_items WHERE id = ?`).run(req.params.id);
    res.json({ ok: true });
  }
```

Update the `return` to include the new handlers:

```javascript
  return {
    listPeople, createPerson, updatePerson, deletePerson,
    listSprints, createSprint, updateSprint, deleteSprint,
    createItem, updateItem, deleteItem,
  };
```

Add the router wires at the bottom of the file, after the sprint routes:

```javascript
router.post('/items', handlers.createItem);
router.patch('/items/:id', handlers.updateItem);
router.delete('/items/:id', handlers.deleteItem);
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npm test -- tests/integration/tracker-items.test.js`
Expected: 9 passed.

- [ ] **Step 5: Commit**

```bash
git add src/routes/tracker.js tests/integration/tracker-items.test.js
git commit -m "$(cat <<'EOF'
feat(tracker): Add /api/tracker/items CRUD with hierarchy validation

Problem: Projects, tasks, and subtasks share a table and must enforce
the 4-level hierarchy at the API (CHECK alone can't express parent-level).
Solution: POST/PATCH/DELETE handlers validate level, parent level match,
sprint existence, owner existence, date range, status enum, and length
caps. sprint_id, level, and parent_id are immutable in MVP — delete
and recreate is the supported flow.
EOF
)"
```

---

## Task 6: Support M2M — PUT /items/:id/support

**Files:**
- Modify: `src/routes/tracker.js`
- Test: `tests/integration/tracker-support.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/tracker-support.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createTestDb } = require('../helpers/setup');

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

describe('support M2M', () => {
  let db, cleanup, handlers;
  let itemId;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    delete require.cache[require.resolve('../../src/routes/tracker')];
    handlers = require('../../src/routes/tracker').__testHandlers(db);

    db.prepare(`INSERT INTO tracker_sprints (id, name, start_date, end_date)
                VALUES ('s1', 'S', '2026-04-22', '2026-05-13')`).run();
    db.prepare(`INSERT INTO tracker_items (id, sprint_id, level, name, start_date, end_date)
                VALUES ('p1', 's1', 'project', 'P', '2026-04-22', '2026-04-29')`).run();
    db.prepare(`INSERT INTO tracker_people (initials) VALUES ('A'),('B'),('C')`).run();
    itemId = 'p1';
  });

  afterEach(() => cleanup());

  it('replaces the support list', () => {
    const res = mockRes();
    handlers.setSupport(
      { params: { id: itemId }, body: { person_ids: [1, 2] } },
      res
    );
    expect(res.body.support_ids).toEqual([1, 2]);
  });

  it('replacing with a different list removes the old entries', () => {
    db.prepare(`INSERT INTO tracker_item_support (item_id, person_id) VALUES ('p1', 1), ('p1', 2)`).run();
    const res = mockRes();
    handlers.setSupport(
      { params: { id: itemId }, body: { person_ids: [3] } },
      res
    );
    const rows = db.prepare(`SELECT person_id FROM tracker_item_support WHERE item_id = 'p1' ORDER BY person_id`).all();
    expect(rows.map(r => r.person_id)).toEqual([3]);
  });

  it('rejects person_ids that do not exist', () => {
    const res = mockRes();
    handlers.setSupport(
      { params: { id: itemId }, body: { person_ids: [1, 99] } },
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects non-array body', () => {
    const res = mockRes();
    handlers.setSupport(
      { params: { id: itemId }, body: { person_ids: 'nope' } },
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when item does not exist', () => {
    const res = mockRes();
    handlers.setSupport(
      { params: { id: 'ghost' }, body: { person_ids: [1] } },
      res
    );
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/integration/tracker-support.test.js`
Expected: FAIL — `setSupport is not a function`.

- [ ] **Step 3: Add the `setSupport` handler**

Inside `makeHandlers(db)` in `src/routes/tracker.js`, below `deleteItem`:

```javascript
  function setSupport(req, res) {
    const item = db.prepare(`SELECT id FROM tracker_items WHERE id = ?`).get(req.params.id);
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const ids = req.body?.person_ids;
    if (!Array.isArray(ids)) return res.status(400).json({ error: 'person_ids must be an array' });
    if (!ids.every(n => Number.isInteger(n) && n > 0)) {
      return res.status(400).json({ error: 'person_ids must be positive integers' });
    }

    // WHY: Validate all person_ids exist before mutating — avoids partial writes on error.
    if (ids.length > 0) {
      const placeholders = ids.map(() => '?').join(',');
      const found = db.prepare(
        `SELECT id FROM tracker_people WHERE id IN (${placeholders})`
      ).all(...ids);
      if (found.length !== new Set(ids).size) {
        return res.status(400).json({ error: 'one or more person_ids do not exist' });
      }
    }

    // WHY: Transaction so "replace" is atomic — observers never see a half-empty list.
    const replace = db.transaction((itemId, personIds) => {
      db.prepare(`DELETE FROM tracker_item_support WHERE item_id = ?`).run(itemId);
      const ins = db.prepare(`INSERT INTO tracker_item_support (item_id, person_id) VALUES (?, ?)`);
      for (const pid of personIds) ins.run(itemId, pid);
    });
    replace(req.params.id, ids);

    const support = db.prepare(
      `SELECT person_id FROM tracker_item_support WHERE item_id = ? ORDER BY person_id`
    ).all(req.params.id).map(r => r.person_id);
    res.json({ id: req.params.id, support_ids: support });
  }
```

Add to the `return` object and to the router:

```javascript
  return {
    listPeople, createPerson, updatePerson, deletePerson,
    listSprints, createSprint, updateSprint, deleteSprint,
    createItem, updateItem, deleteItem,
    setSupport,
  };
```

```javascript
router.put('/items/:id/support', handlers.setSupport);
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npm test -- tests/integration/tracker-support.test.js`
Expected: 5 passed.

- [ ] **Step 5: Commit**

```bash
git add src/routes/tracker.js tests/integration/tracker-support.test.js
git commit -m "$(cat <<'EOF'
feat(tracker): Add PUT /api/tracker/items/:id/support

Problem: Projects need an editable contributor/support list independent
of the single owner_id.
Solution: PUT replaces the full list in a single transaction, validates
every person_id exists before mutating so partial writes never happen.
EOF
)"
```

---

## Task 7: Nested sprint read — `GET /api/tracker/sprints/:id`

**Files:**
- Modify: `src/routes/tracker.js`
- Test: `tests/integration/tracker-nested-read.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/tracker-nested-read.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createTestDb } = require('../helpers/setup');

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

describe('GET /sprints/:id (nested)', () => {
  let db, cleanup, handlers;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    delete require.cache[require.resolve('../../src/routes/tracker')];
    handlers = require('../../src/routes/tracker').__testHandlers(db);

    db.prepare(`INSERT INTO tracker_sprints (id, name, start_date, end_date)
                VALUES ('s1', 'S', '2026-04-22', '2026-05-13')`).run();
    db.prepare(`INSERT INTO tracker_people (id, initials) VALUES (1, 'ER'), (2, 'TR')`).run();
    db.prepare(`INSERT INTO tracker_items (id, sprint_id, level, name, owner_id, start_date, end_date, sort_order)
                VALUES ('p1', 's1', 'project', 'Deploy', 1, '2026-04-22', '2026-05-13', 0)`).run();
    db.prepare(`INSERT INTO tracker_items (id, sprint_id, parent_id, level, name, start_date, end_date, sort_order)
                VALUES ('t1', 's1', 'p1', 'task', 'Pilot', '2026-04-22', '2026-04-29', 0)`).run();
    db.prepare(`INSERT INTO tracker_items (id, sprint_id, parent_id, level, name, start_date, end_date, sort_order)
                VALUES ('st1', 's1', 't1', 'subtask', 'Site visit', '2026-04-22', '2026-04-23', 0)`).run();
    db.prepare(`INSERT INTO tracker_item_support (item_id, person_id) VALUES ('p1', 1), ('p1', 2)`).run();
  });

  afterEach(() => cleanup());

  it('returns the sprint with nested projects, tasks, subtasks, and hydrated support', () => {
    const res = mockRes();
    handlers.getSprint({ params: { id: 's1' } }, res);
    const body = res.body;
    expect(body.id).toBe('s1');
    expect(body.people).toHaveLength(2);
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0].support_ids).toEqual([1, 2]);
    expect(body.projects[0].tasks).toHaveLength(1);
    expect(body.projects[0].tasks[0].subtasks).toHaveLength(1);
    expect(body.projects[0].tasks[0].subtasks[0].name).toBe('Site visit');
  });

  it('returns 404 for unknown sprint', () => {
    const res = mockRes();
    handlers.getSprint({ params: { id: 'nope' } }, res);
    expect(res.statusCode).toBe(404);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/integration/tracker-nested-read.test.js`
Expected: FAIL — `getSprint is not a function`.

- [ ] **Step 3: Add the `getSprint` handler**

Inside `makeHandlers(db)`, below `updateSprint`:

```javascript
  function getSprint(req, res) {
    const sprint = db.prepare(`SELECT * FROM tracker_sprints WHERE id = ?`).get(req.params.id);
    if (!sprint) return res.status(404).json({ error: 'Sprint not found' });

    const items = db.prepare(
      `SELECT * FROM tracker_items WHERE sprint_id = ? ORDER BY sort_order, created_at`
    ).all(req.params.id);

    const supportRows = db.prepare(
      `SELECT item_id, person_id FROM tracker_item_support
       WHERE item_id IN (SELECT id FROM tracker_items WHERE sprint_id = ?)
       ORDER BY person_id`
    ).all(req.params.id);
    const supportByItem = new Map();
    for (const r of supportRows) {
      if (!supportByItem.has(r.item_id)) supportByItem.set(r.item_id, []);
      supportByItem.get(r.item_id).push(r.person_id);
    }

    const people = db.prepare(
      `SELECT * FROM tracker_people WHERE active = 1 ORDER BY initials`
    ).all();

    // WHY: Build the nested tree in one pass — O(N) with map lookups instead of per-row queries.
    const itemById = new Map();
    for (const it of items) {
      itemById.set(it.id, {
        ...it,
        support_ids: supportByItem.get(it.id) || [],
        tasks: [],       // populated for projects
        subtasks: [],    // populated for tasks
      });
    }
    const projects = [];
    for (const it of items) {
      const node = itemById.get(it.id);
      if (it.level === 'project') {
        projects.push(node);
      } else if (it.level === 'task') {
        const parent = itemById.get(it.parent_id);
        if (parent) parent.tasks.push(node);
      } else if (it.level === 'subtask') {
        const parent = itemById.get(it.parent_id);
        if (parent) parent.subtasks.push(node);
      }
    }

    res.json({ ...sprint, projects, people });
  }
```

Update the `return` and router:

```javascript
  return {
    listPeople, createPerson, updatePerson, deletePerson,
    listSprints, getSprint, createSprint, updateSprint, deleteSprint,
    createItem, updateItem, deleteItem,
    setSupport,
  };
```

```javascript
router.get('/sprints/:id', handlers.getSprint);
```

- [ ] **Step 4: Run tests, confirm pass**

Run: `npm test -- tests/integration/tracker-nested-read.test.js`
Expected: 2 passed.

- [ ] **Step 5: Run the full test suite to catch any regressions**

Run: `npm test`
Expected: all tracker tests pass; no regressions in existing suites.

- [ ] **Step 6: Commit**

```bash
git add src/routes/tracker.js tests/integration/tracker-nested-read.test.js
git commit -m "$(cat <<'EOF'
feat(tracker): Add nested GET /api/tracker/sprints/:id

Problem: The client needs the full sprint tree (projects → tasks →
subtasks, plus hydrated support) in a single read on page load.
Solution: One SELECT for items, one for support, one for people, then
assemble the nested tree in a single O(N) pass via an id→node Map.
EOF
)"
```

---

## Task 8: Seed module — Hotel Bots Sprint 1 from the v2 doc

**Files:**
- Create: `src/db/tracker-seed.js`
- Modify: `src/server.js` (invoke the seed on boot)
- Test: `tests/integration/tracker-seed.test.js`

- [ ] **Step 1: Write the failing test**

Create `tests/integration/tracker-seed.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createTestDb } = require('../helpers/setup');
const { seedTracker } = require('../../src/db/tracker-seed');

describe('tracker seed', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => cleanup());

  it('seeds 12 people', () => {
    seedTracker(db);
    const n = db.prepare(`SELECT COUNT(*) as c FROM tracker_people`).get().c;
    expect(n).toBe(12);
  });

  it('seeds one sprint named "Hotel Bots - Sprint 1"', () => {
    seedTracker(db);
    const sprints = db.prepare(`SELECT * FROM tracker_sprints`).all();
    expect(sprints).toHaveLength(1);
    expect(sprints[0].name).toBe('Hotel Bots - Sprint 1');
  });

  it('seeds 10 projects', () => {
    seedTracker(db);
    const n = db.prepare(`SELECT COUNT(*) as c FROM tracker_items WHERE level = 'project'`).get().c;
    // WHY: 10 from the v2 workstream list + 1 standalone "Go / no-go" milestone-project = 11
    expect(n).toBe(11);
  });

  it('marks projects with [VERIFY] notes as needs_verification=1', () => {
    seedTracker(db);
    const n = db.prepare(
      `SELECT COUNT(*) as c FROM tracker_items WHERE level = 'project' AND needs_verification = 1`
    ).get().c;
    expect(n).toBeGreaterThan(0);
  });

  it('creates the V1 launched milestone under Deal + Prospects', () => {
    seedTracker(db);
    const ms = db.prepare(
      `SELECT i.name, i.is_milestone, p.name as parent_name
       FROM tracker_items i
       JOIN tracker_items p ON p.id = i.parent_id
       WHERE i.is_milestone = 1 AND p.name = 'Deal + Prospects'`
    ).get();
    expect(ms).toBeTruthy();
    expect(ms.name).toMatch(/V1 launched/i);
  });

  it('creates the go/no-go milestone at sprint end', () => {
    seedTracker(db);
    const sprint = db.prepare(`SELECT end_date FROM tracker_sprints`).get();
    const gonogo = db.prepare(
      `SELECT * FROM tracker_items WHERE is_milestone = 1 AND parent_id IS NULL`
    ).get();
    expect(gonogo).toBeTruthy();
    expect(gonogo.start_date).toBe(sprint.end_date);
    expect(gonogo.color).toBe('red');
  });

  it('is idempotent — running twice produces the same row counts', () => {
    seedTracker(db);
    const first = db.prepare(`SELECT COUNT(*) as c FROM tracker_items`).get().c;
    seedTracker(db);
    const second = db.prepare(`SELECT COUNT(*) as c FROM tracker_items`).get().c;
    expect(second).toBe(first);
  });
});
```

- [ ] **Step 2: Run and confirm failure**

Run: `npm test -- tests/integration/tracker-seed.test.js`
Expected: FAIL — `Cannot find module '../../src/db/tracker-seed'`.

- [ ] **Step 3: Create the seed module**

Create `src/db/tracker-seed.js`:

```javascript
const crypto = require('crypto');

// WHY: Seed uses yesterday as the sprint start, per spec:
//   name: "Hotel Bots - Sprint 1", start = 2026-04-22, end = 2026-05-13 (start + 21 days).
// Hardcoded rather than computed from `today` so the seed is deterministic in tests
// and produces the exact spec output. Users can edit dates in the UI after load.
const SPRINT_START = '2026-04-22';
const SPRINT_END = '2026-05-13';

// WHY: People list from the spec §5.1. Initials are unique; full_name nullable for rows the user didn't specify.
const PEOPLE = [
  { initials: 'ER', full_name: 'Eric' },
  { initials: 'TR', full_name: 'Tyler' },
  { initials: 'MS', full_name: 'Matthias' },
  { initials: 'LG', full_name: 'Lydia' },
  { initials: 'CB', full_name: 'Corey' },
  { initials: 'JL', full_name: 'JB' },
  { initials: 'BN', full_name: 'Ben' },
  { initials: 'VH', full_name: 'Vicki' },
  { initials: 'KM', full_name: 'Kaylie' },
  { initials: 'CS', full_name: 'Celia' },
  { initials: 'DG', full_name: 'David' },
  { initials: 'RH', full_name: 'Richa' },
];

// WHY: Week anchor helpers — sprint runs 2026-04-22 (week 1 start) through 2026-05-13 (week 3 end).
// Using string dates directly avoids timezone gotchas with Date objects.
const WEEK1_START = '2026-04-22';
const WEEK2_START = '2026-04-29';
const WEEK3_END = '2026-05-13';

// WHY: Project definitions from v2 doc, §5.3 of the design spec.
// Each `support` entry references initials (resolved to person ids at insert time).
const PROJECTS = [
  {
    name: 'Deploy',
    owner: 'ER',
    support: ['CB', 'TR', 'DG'],
    color: 'green',
    start: WEEK2_START,
    end: WEEK3_END,
    needs_verification: 1,
    verification_note: 'New workstream from expanded list. Likely overlaps with or replaces original "Operations / rollout."',
  },
  {
    name: 'Deal + Prospects',
    owner: 'LG',
    support: ['ER', 'TR', 'MS'],
    color: 'blue',
    start: WEEK1_START,
    end: WEEK3_END,
    needs_verification: 1,
    verification_note: 'Previously ER owned proposal gen/CRM. V1 launched today, V2 iteration ongoing.',
    milestones: [
      { name: 'V1 launched', date: WEEK1_START },
    ],
    tasks: [
      { name: 'V1 launch', owner: 'ER', start: WEEK1_START, end: WEEK1_START, is_milestone: 0, status: 'complete' },
      { name: 'V2 iteration & build-out', owner: 'ER', start: WEEK1_START, end: WEEK3_END },
    ],
  },
  {
    name: 'Assessments',
    owner: 'CB',
    support: ['CS', 'DG', 'ER'],
    color: 'teal',
    start: WEEK1_START,
    end: WEEK3_END,
    needs_verification: 1,
    verification_note: 'New workstream — likely onsite/property assessments for pilot candidates.',
  },
  {
    name: 'Robot command',
    owner: 'DG',
    support: ['KM', 'CS', 'ER'],
    color: 'purple',
    start: WEEK1_START,
    end: WEEK2_START, // Weeks 1-2 ~ two weeks
    needs_verification: 1,
    verification_note: 'Replaces or refines original "Tech research → V1 orchestration layer." Richa (RH) may still be involved — confirm.',
  },
  {
    name: 'Service van',
    owner: 'CS',
    support: ['ER', 'TR', 'KM'],
    color: 'amber',
    start: WEEK2_START,
    end: WEEK3_END,
    needs_verification: 1,
    verification_note: 'New workstream — mobile service/support vehicle for deployed robots.',
  },
  {
    name: 'Elevator Sim',
    owner: 'ER',
    support: ['DG'],
    color: 'purple',
    start: WEEK1_START,
    end: WEEK2_START,
    needs_verification: 1,
    verification_note: 'Replaces original "Tech research → Elevator integration." Now framed as simulation work covering all elevator types/vendors. Co-owned by ER + DG.',
  },
  {
    name: 'Robot catalog',
    owner: 'LG',
    support: ['ER', 'TR', 'DG'],
    color: 'coral',
    start: WEEK1_START,
    end: WEEK3_END,
    needs_verification: 1,
    verification_note: 'New workstream — catalog of robot models/capabilities. May overlap with original "Tech research → Vendor matrix."',
  },
  {
    name: 'Investor + Financial',
    owner: 'ER',
    support: ['TR', 'MS'],
    color: 'pink',
    start: WEEK2_START,
    end: WEEK3_END,
    needs_verification: 1,
    verification_note: 'Merges original "Business model & pricing (ROI)," "Board / existing investor," and "Net new investor pitch." May want to split back out — confirm.',
  },
  {
    name: 'Robot Dossier',
    owner: 'ER',
    support: ['DG', 'TR'],
    color: 'coral',
    start: WEEK1_START,
    end: WEEK2_START,
    needs_verification: 1,
    verification_note: 'New workstream — per-robot detailed spec/capability dossiers.',
  },
  {
    name: 'Inquiries + Public website',
    owner: 'LG',
    support: ['CS'],
    color: 'amber',
    start: WEEK1_START,
    end: WEEK3_END,
    needs_verification: 1,
    verification_note: 'Likely replaces or expands original "Marketing brochures." Covers inbound inquiries + public-facing web presence.',
  },
];

function seedTracker(db) {
  // WHY: Idempotent — bail if seed has already run.
  const existing = db.prepare(`SELECT COUNT(*) as c FROM tracker_sprints`).get().c;
  if (existing > 0) return;

  const tx = db.transaction(() => {
    // 1. People
    const insertPerson = db.prepare(
      `INSERT INTO tracker_people (initials, full_name) VALUES (?, ?)`
    );
    const personIdByInitials = new Map();
    for (const p of PEOPLE) {
      const info = insertPerson.run(p.initials, p.full_name);
      personIdByInitials.set(p.initials, info.lastInsertRowid);
    }

    // 2. Sprint
    const sprintId = crypto.randomUUID();
    db.prepare(
      `INSERT INTO tracker_sprints (id, name, description, start_date, end_date) VALUES (?, ?, ?, ?, ?)`
    ).run(
      sprintId,
      'Hotel Bots - Sprint 1',
      'First sprint: 3-week workstreams leading to a go/no-go decision on the hotel robotics BU.',
      SPRINT_START,
      SPRINT_END
    );

    // 3. Projects + their tasks + milestones
    const insertItem = db.prepare(`
      INSERT INTO tracker_items
        (id, sprint_id, parent_id, level, name, description, owner_id, color,
         start_date, end_date, status, needs_verification, verification_note, is_milestone, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const insertSupport = db.prepare(
      `INSERT INTO tracker_item_support (item_id, person_id) VALUES (?, ?)`
    );

    PROJECTS.forEach((proj, idx) => {
      const projectId = crypto.randomUUID();
      insertItem.run(
        projectId,
        sprintId,
        null,
        'project',
        proj.name,
        null,
        personIdByInitials.get(proj.owner) || null,
        proj.color,
        proj.start,
        proj.end,
        'not_started',
        proj.needs_verification || 0,
        proj.verification_note || null,
        0,
        idx
      );
      for (const initials of proj.support || []) {
        const pid = personIdByInitials.get(initials);
        if (pid) insertSupport.run(projectId, pid);
      }

      (proj.tasks || []).forEach((t, tIdx) => {
        const taskId = crypto.randomUUID();
        insertItem.run(
          taskId,
          sprintId,
          projectId,
          'task',
          t.name,
          null,
          personIdByInitials.get(t.owner) || null,
          null,
          t.start,
          t.end,
          t.status || 'not_started',
          0,
          null,
          t.is_milestone || 0,
          tIdx
        );
      });

      (proj.milestones || []).forEach((m, mIdx) => {
        const mId = crypto.randomUUID();
        insertItem.run(
          mId,
          sprintId,
          projectId,
          'task',
          m.name,
          null,
          null,
          null,
          m.date,
          m.date,
          'complete',
          0,
          null,
          1,
          100 + mIdx // push milestones to bottom of the project's task list
        );
      });
    });

    // 4. Go / no-go milestone — standalone project-level milestone at sprint end.
    const gonogoId = crypto.randomUUID();
    insertItem.run(
      gonogoId,
      sprintId,
      null,
      'project',
      'Go / no-go decision',
      'Final gate at sprint end.',
      null,
      'red',
      SPRINT_END,
      SPRINT_END,
      'not_started',
      0,
      null,
      1,
      PROJECTS.length
    );
  });

  tx();
}

module.exports = { seedTracker };
```

- [ ] **Step 4: Run the seed tests, confirm pass**

Run: `npm test -- tests/integration/tracker-seed.test.js`
Expected: 7 passed.

- [ ] **Step 5: Invoke the seed from `src/server.js`**

In `src/server.js`, find the existing line:

```javascript
const { seedProspects } = require('./db/seed-prospects');
```

Add right below it:

```javascript
const { seedTracker } = require('./db/tracker-seed');
```

Then find the existing `seedProspects();` call near the bottom (just before `app.listen`), and add right after it:

```javascript
seedTracker(require('./db/database'));
```

- [ ] **Step 6: Smoke test the seed**

Run: `npm run dev &` (wait 2 seconds for boot, then:)

```bash
curl -s http://localhost:3000/api/tracker/sprints | head
```

Expected: JSON array with one sprint named `Hotel Bots - Sprint 1`.

Kill the dev server.

- [ ] **Step 7: Commit**

```bash
git add src/db/tracker-seed.js src/server.js tests/integration/tracker-seed.test.js
git commit -m "$(cat <<'EOF'
feat(tracker): Seed Hotel Bots Sprint 1 from v2 doc

Problem: Team needs the v2 workstream data loaded so the first sprint is
usable out of the box.
Solution: Idempotent seed module creates 12 people, the 2026-04-22 →
2026-05-13 sprint, 10 projects with owners/support/colors/verification
notes per v2, 2 task rows for Deal + Prospects (V1 launched complete,
V2 iteration ongoing), plus a standalone go/no-go milestone-project at
sprint end. Wrapped in a transaction; bails if any sprint already exists.
EOF
)"
```

---

## Task 9: Admin page shell + navigation tile

**Files:**
- Create: `public/admin-project-tracker.html`
- Create: `public/js/tracker.js` (empty scaffold — populated in later tasks)
- Modify: `src/server.js` (register the clean-URL route)
- Modify: `public/admin-command-center.html` (add tool tile)

- [ ] **Step 1: Create the page shell**

Create `public/admin-project-tracker.html`:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Project Tracker — Accelerate Robotics</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Space+Grotesk:wght@600;700;800&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/brand.css">
  <style>
    * { font-family: 'Inter', system-ui, sans-serif; }
    h1, h2, h3, .headline { font-family: 'Space Grotesk', 'Inter', sans-serif; }

    /* ── Gantt grid ────────────────────────────────────────── */
    .gantt { display: grid; grid-template-columns: 420px 1fr; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; background: white; }
    .gantt-header { display: contents; }
    .gantt-header > div { background: #f9fafb; border-bottom: 1px solid #e5e7eb; padding: 10px 14px; font-size: 0.72rem; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.04em; }
    .gantt-row { display: contents; }
    .gantt-row > div { border-bottom: 1px solid #f3f4f6; padding: 10px 14px; position: relative; }
    .gantt-row:last-child > div { border-bottom: none; }

    .gantt-left { display: grid; grid-template-columns: 1fr 80px 60px 110px; gap: 8px; align-items: center; font-size: 0.85rem; }
    .gantt-right { position: relative; min-height: 36px; background: repeating-linear-gradient(to right, #fafafa 0, #fafafa calc(33.333% - 1px), #e5e7eb calc(33.333% - 1px), #e5e7eb 33.333%); }

    .row-name { font-weight: 600; color: #111827; display: flex; align-items: center; gap: 6px; }
    .row-name .caret { cursor: pointer; color: #9ca3af; user-select: none; }
    .row-name.level-1 { padding-left: 18px; font-weight: 500; }
    .row-name.level-2 { padding-left: 36px; font-weight: 400; color: #4b5563; }

    .pill { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 0.72rem; font-weight: 600; cursor: pointer; }
    .pill-not_started { background: #f3f4f6; color: #4b5563; }
    .pill-in_progress { background: #dbeafe; color: #1e40af; }
    .pill-blocked     { background: #fee2e2; color: #991b1b; }
    .pill-complete    { background: #dcfce7; color: #166534; }

    .verify-dot { width: 8px; height: 8px; border-radius: 50%; background: #f59e0b; display: inline-block; margin-right: 4px; }

    .bar { position: absolute; top: 10px; bottom: 10px; border-radius: 4px; }

    .milestone { position: absolute; top: 50%; width: 12px; height: 12px; transform: translate(-50%, -50%) rotate(45deg); }
    .milestone.gonogo { background: #A32D2D; }
    .milestone.gonogo-line { position: absolute; top: 0; bottom: 0; width: 0; border-left: 2px dashed #A32D2D; }

    /* ── Side panel drawer ─────────────────────────────────── */
    .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: 440px; background: white; box-shadow: -4px 0 12px rgba(0,0,0,0.08); transform: translateX(100%); transition: transform 0.2s ease; z-index: 50; overflow-y: auto; }
    .drawer.open { transform: translateX(0); }
    .drawer-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0); pointer-events: none; transition: background 0.2s; z-index: 40; }
    .drawer-backdrop.open { background: rgba(0,0,0,0.2); pointer-events: auto; }

    .modal-backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: none; z-index: 60; }
    .modal-backdrop.open { display: flex; align-items: center; justify-content: center; }
    .modal { background: white; border-radius: 12px; padding: 24px; max-width: 560px; width: 100%; max-height: 80vh; overflow-y: auto; }
  </style>
</head>
<body class="bg-slate-50 min-h-screen">
  <main class="max-w-7xl mx-auto px-6 py-8">
    <nav class="text-xs text-slate-500 mb-4">
      <a href="/admin" class="hover:text-slate-800">Command Center</a>
      <span class="mx-2">›</span>
      <span class="text-slate-800 font-medium">Project Tracker</span>
    </nav>

    <header class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold text-slate-900 headline">Project Tracker</h1>
        <p class="text-sm text-slate-500 mt-1">Sprint-based workstream planner</p>
      </div>
      <div class="flex items-center gap-3">
        <select id="sprint-selector" class="border border-slate-300 rounded-md px-3 py-2 text-sm"></select>
        <button id="btn-new-sprint" class="bg-slate-900 text-white text-sm font-semibold px-4 py-2 rounded-md hover:bg-slate-800">+ New Sprint</button>
        <button id="btn-manage-people" class="border border-slate-300 text-slate-700 text-sm font-semibold px-4 py-2 rounded-md hover:bg-slate-100">Manage People</button>
      </div>
    </header>

    <section id="sprint-context" class="bg-white rounded-lg border border-slate-200 p-4 mb-6 flex items-center justify-between">
      <div>
        <div id="sprint-name" class="text-lg font-semibold text-slate-900">Loading…</div>
        <div id="sprint-dates" class="text-xs text-slate-500"></div>
      </div>
      <div id="sprint-summary" class="text-xs text-slate-600"></div>
    </section>

    <section id="gantt-root"></section>

    <div class="mt-4">
      <button id="btn-add-project" class="text-sm text-slate-600 hover:text-slate-900 font-medium">+ Add Project</button>
    </div>
  </main>

  <!-- Drawer -->
  <div class="drawer-backdrop" id="drawer-backdrop"></div>
  <aside class="drawer" id="drawer">
    <div class="p-6">
      <h2 class="text-lg font-semibold mb-4" id="drawer-title">Item</h2>
      <form id="drawer-form" class="space-y-4"></form>
    </div>
  </aside>

  <!-- Manage People modal -->
  <div class="modal-backdrop" id="people-modal-backdrop">
    <div class="modal">
      <h2 class="text-lg font-semibold mb-4 headline">Manage People</h2>
      <div id="people-list" class="space-y-2 mb-4"></div>
      <form id="person-add-form" class="flex gap-2 mb-4">
        <input id="person-initials" placeholder="Initials" maxlength="20" class="border border-slate-300 rounded px-3 py-1 text-sm flex-none w-24" required>
        <input id="person-fullname" placeholder="Full name (optional)" class="border border-slate-300 rounded px-3 py-1 text-sm flex-1">
        <button type="submit" class="bg-slate-900 text-white text-sm px-4 py-1 rounded">Add</button>
      </form>
      <div class="text-right">
        <button id="people-modal-close" class="text-sm text-slate-500">Close</button>
      </div>
    </div>
  </div>

  <script type="module" src="/js/tracker.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create the empty client module**

Create `public/js/tracker.js`:

```javascript
// Populated in Tasks 10–14.
console.log('[tracker] module loaded');
```

- [ ] **Step 3: Register the clean-URL route in `src/server.js`**

In `src/server.js`, find the block of `app.get('/admin/...')` SPA routes near the bottom. Add a new one after the existing `app.get('/admin/deals', ...)` entry:

```javascript
app.get('/admin/project-tracker', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin-project-tracker.html'));
});
```

- [ ] **Step 4: Add a tool-card tile in `public/admin-command-center.html`**

Open `public/admin-command-center.html`. Search for an existing `<a class="tool-card"` anchor (e.g. the one that points to `/admin/deals`). Copy its structure and add a new tile right next to it, pointing to `/admin/project-tracker`. Use the same CSS classes already present in the file. The tile label text is "Project Tracker" and the subtitle is "Sprint-based workstream planner".

Concretely, locate the closest `<a ... href="/admin/deals" ...>...</a>` block and paste an analogous block after it:

```html
<a class="tool-card" href="/admin/project-tracker">
  <div class="tool-card-title">Project Tracker</div>
  <div class="tool-card-sub">Sprint-based workstream planner</div>
</a>
```

If the existing tile uses different class/structure, mirror it exactly so the new tile looks native to the grid.

- [ ] **Step 5: Boot and smoke-test the page**

Run: `npm run dev &`

Open `http://localhost:3000/admin/project-tracker` in a browser. Expected:
- Page renders with "Project Tracker" heading, a sprint selector (empty until Task 10), "+ New Sprint" and "Manage People" buttons
- The Command Center tile navigates here
- DevTools console logs `[tracker] module loaded`

Kill the dev server.

- [ ] **Step 6: Commit**

```bash
git add public/admin-project-tracker.html public/js/tracker.js public/admin-command-center.html src/server.js
git commit -m "$(cat <<'EOF'
feat(tracker): Scaffold project tracker page and nav tile

Problem: Need the static page shell, empty client module, clean-URL
route, and a Command Center tile before wiring up data.
Solution: admin-project-tracker.html with Tailwind styles for the Gantt
grid + drawer + modal. Empty tracker.js module. /admin/project-tracker
routed in server.js. Tool card added to the Command Center grid.
EOF
)"
```

---

## Task 10: Client data layer — fetch sprint list, render selector, fetch active sprint

**Files:**
- Modify: `public/js/tracker.js`

- [ ] **Step 1: Replace `public/js/tracker.js` with the data-layer skeleton**

Replace the contents of `public/js/tracker.js`:

```javascript
// WHY: Single-file client module — no bundler in this repo. Tailwind + fetch only.

const state = {
  sprints: [],        // { id, name, start_date, end_date }
  currentSprint: null, // full hydrated sprint { ...sprint, projects: [...], people: [...] }
  peopleById: new Map(),
};

// ── Fetch helpers ─────────────────────────────────────────────
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function loadSprintList() {
  state.sprints = await api('GET', '/api/tracker/sprints');
}

async function loadSprint(id) {
  state.currentSprint = await api('GET', `/api/tracker/sprints/${id}`);
  state.peopleById = new Map(state.currentSprint.people.map(p => [p.id, p]));
}

// ── DOM helpers ───────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

function renderSprintSelector() {
  const sel = el('sprint-selector');
  sel.innerHTML = state.sprints
    .map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
    .join('');
  if (state.currentSprint) sel.value = state.currentSprint.id;
}

function renderSprintContext() {
  if (!state.currentSprint) return;
  el('sprint-name').textContent = state.currentSprint.name;
  el('sprint-dates').textContent = `${state.currentSprint.start_date} → ${state.currentSprint.end_date}`;

  const counts = { not_started: 0, in_progress: 0, blocked: 0, complete: 0 };
  const walk = (node) => {
    if (node.status) counts[node.status] = (counts[node.status] || 0) + 1;
    (node.tasks || []).forEach(walk);
    (node.subtasks || []).forEach(walk);
  };
  state.currentSprint.projects.forEach(walk);
  el('sprint-summary').textContent =
    `${counts.blocked} blocked · ${counts.in_progress} in progress · ${counts.complete} complete`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Render pipeline (Gantt is added in Task 11) ─────────────
function renderAll() {
  renderSprintSelector();
  renderSprintContext();
  // Gantt render added in Task 11.
}

// ── Wire-up ───────────────────────────────────────────────────
el('sprint-selector').addEventListener('change', async (e) => {
  await loadSprint(e.target.value);
  renderAll();
});

(async function init() {
  try {
    await loadSprintList();
    if (state.sprints.length === 0) {
      el('sprint-name').textContent = 'No sprints yet — click "+ New Sprint"';
      return;
    }
    await loadSprint(state.sprints[0].id);
    renderAll();
  } catch (err) {
    console.error(err);
    el('sprint-name').textContent = 'Error loading tracker — check console';
  }
})();

// Exported for later tasks (inline edits, drawer, etc.)
export { state, api, loadSprint, renderAll, escapeHtml };
```

- [ ] **Step 2: Smoke test**

Run: `npm run dev &`

Open `http://localhost:3000/admin/project-tracker`. Expected:
- Sprint selector is populated with "Hotel Bots - Sprint 1"
- Context bar shows the sprint name and `2026-04-22 → 2026-05-13`
- Summary shows counts (e.g. `0 blocked · 0 in progress · 1 complete` — the V1-launched task is seeded complete)

Kill the dev server.

- [ ] **Step 3: Commit**

```bash
git add public/js/tracker.js
git commit -m "$(cat <<'EOF'
feat(tracker): Wire client data layer — sprint list + full sprint fetch

Problem: Page needs to load sprints and pick one to display before
anything else can render.
Solution: tracker.js fetches /api/tracker/sprints, populates the
selector, and hydrates the selected sprint via /api/tracker/sprints/:id.
Renders name, date range, and a status summary.
EOF
)"
```

---

## Task 11: Gantt render — projects, tasks, subtasks, bars

**Files:**
- Modify: `public/js/tracker.js`

- [ ] **Step 1: Add Gantt rendering to `tracker.js`**

In `public/js/tracker.js`, add these helpers above `renderAll`:

```javascript
// ── Color palette (v2 doc §4.5) ─────────────────────────────
const COLOR_MAP = {
  purple: { fill: '#EEEDFE', text: '#26215C' },
  amber:  { fill: '#FAEEDA', text: '#412402' },
  teal:   { fill: '#E1F5EE', text: '#04342C' },
  coral:  { fill: '#FAECE7', text: '#4A1B0C' },
  pink:   { fill: '#FBEAF0', text: '#4B1528' },
  blue:   { fill: '#E6F1FB', text: '#042C53' },
  green:  { fill: '#EAF3DE', text: '#173404' },
  gray:   { fill: '#F3F4F6', text: '#1F2937' },
  red:    { fill: '#A32D2D', text: '#FFFFFF' },
};
function colorFor(key) { return COLOR_MAP[key] || COLOR_MAP.gray; }

// ── Date math ───────────────────────────────────────────────
function daysBetween(aIso, bIso) {
  const a = new Date(aIso + 'T00:00:00Z').getTime();
  const b = new Date(bIso + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000);
}

function positionFor(start, end, sprintStart, sprintEnd) {
  const total = daysBetween(sprintStart, sprintEnd) || 1;
  const leftDays = Math.max(0, daysBetween(sprintStart, start));
  const widthDays = Math.max(0, daysBetween(start, end));
  return {
    left: (leftDays / total) * 100,
    width: Math.max(0.5, (widthDays / total) * 100),
  };
}

function weekHeaders(sprintStart, sprintEnd) {
  // WHY: Up to 6 weeks renders as week columns; longer spans switch to a single span header.
  const totalDays = daysBetween(sprintStart, sprintEnd) + 1;
  if (totalDays <= 42) {
    const weeks = Math.max(1, Math.ceil(totalDays / 7));
    return Array.from({ length: weeks }, (_, i) => `Week ${i + 1}`);
  }
  return [`${sprintStart} → ${sprintEnd}`];
}

// ── Gantt render ────────────────────────────────────────────
function renderGantt() {
  const root = el('gantt-root');
  const s = state.currentSprint;
  if (!s) { root.innerHTML = ''; return; }

  const headers = weekHeaders(s.start_date, s.end_date);
  const headerCols = headers.map(h => `<div class="text-center">${escapeHtml(h)}</div>`).join('');
  const headerRight = `<div style="display:grid; grid-template-columns: repeat(${headers.length}, 1fr);">${headerCols}</div>`;

  const rowsHtml = [];
  for (const proj of s.projects) {
    rowsHtml.push(renderRow(proj, 0, s, proj));
    for (const task of proj.tasks || []) {
      rowsHtml.push(renderRow(task, 1, s, proj));
      for (const sub of task.subtasks || []) {
        rowsHtml.push(renderRow(sub, 2, s, proj));
      }
    }
  }

  root.innerHTML = `
    <div class="gantt">
      <div class="gantt-header">
        <div>Name / Owner / Support / Status</div>
        <div>${headerRight.replace('display:grid', 'display:grid')}</div>
      </div>
      ${rowsHtml.join('')}
    </div>
  `;
}

function renderRow(node, level, sprint, ancestorProject) {
  const owner = node.owner_id ? state.peopleById.get(node.owner_id)?.initials ?? '—' : '—';
  const supportCount = (node.support_ids || []).length;
  const supportBadge = supportCount > 0 ? `+${supportCount}` : '—';

  const verifyDot = node.needs_verification ? `<span class="verify-dot" title="${escapeHtml(node.verification_note || 'Needs verification')}"></span>` : '';
  const caret = (level === 0 && (node.tasks || []).length > 0) || (level === 1 && (node.subtasks || []).length > 0) ? '▾' : '';

  const color = colorFor(ancestorProject.color);
  const isGoNoGo = node.is_milestone && node.color === 'red' && level === 0;

  const { left, width } = positionFor(node.start_date, node.end_date, sprint.start_date, sprint.end_date);
  let bar;
  if (node.is_milestone) {
    const diamondClass = isGoNoGo ? 'milestone gonogo' : 'milestone';
    const line = isGoNoGo ? `<span class="milestone gonogo-line" style="left:${left}%;"></span>` : '';
    bar = `${line}<span class="${diamondClass}" style="left:${left}%; background:${color.fill};"></span>`;
  } else {
    bar = `<div class="bar" style="left:${left}%; width:${width}%; background:${color.fill};"></div>`;
  }

  return `
    <div class="gantt-row" data-item-id="${node.id}">
      <div class="gantt-left">
        <div class="row-name level-${level}">
          <span class="caret">${caret}</span>${verifyDot}${escapeHtml(node.name)}
        </div>
        <div class="owner-cell" data-item-id="${node.id}" data-field="owner_id">${escapeHtml(owner)}</div>
        <div class="text-xs text-slate-500">${supportBadge}</div>
        <div class="status-cell" data-item-id="${node.id}" data-field="status">
          <span class="pill pill-${node.status}">${escapeHtml(statusLabel(node.status))}</span>
        </div>
      </div>
      <div class="gantt-right">${bar}</div>
    </div>
  `;
}

function statusLabel(s) {
  return {
    not_started: 'Not Started',
    in_progress: 'In Progress',
    blocked: 'Blocked',
    complete: 'Complete',
  }[s] || s;
}
```

Update `renderAll` to call `renderGantt`:

```javascript
function renderAll() {
  renderSprintSelector();
  renderSprintContext();
  renderGantt();
}
```

- [ ] **Step 2: Smoke test in the browser**

Run: `npm run dev &`

Open `http://localhost:3000/admin/project-tracker`. Expected:
- 11 rows total (10 projects + 1 Go/no-go milestone-project), each with a colored bar
- Deal + Prospects expanded-style row with 2 tasks (V1 launched and V2 iteration) visible as nested rows
- Go / no-go row shows a red diamond with a dashed line at the far right
- Status pills visible with per-status colors
- Amber dot on every row that has a verification note (all the [VERIFY] projects)

Kill the dev server.

- [ ] **Step 3: Commit**

```bash
git add public/js/tracker.js
git commit -m "$(cat <<'EOF'
feat(tracker): Render Gantt grid with projects/tasks/subtasks/milestones

Problem: Page needs a readable visual of the sprint — owners, support
count, status pill, and a timeline bar per row.
Solution: Two-column CSS grid (420px left + flex right). Bars
positioned by absolute date math. Milestones render as rotated diamonds;
the go/no-go milestone also draws a red dashed vertical line. Support
count badges and amber verify dots per row.
EOF
)"
```

---

## Task 12: Inline edits — status and owner

**Files:**
- Modify: `public/js/tracker.js`

- [ ] **Step 1: Add inline-edit handlers to `tracker.js`**

Below the existing event listener for `sprint-selector`, add:

```javascript
// ── Inline edits ──────────────────────────────────────────────
// WHY: Event delegation from gantt-root — rows are re-rendered each change,
// so per-row listeners would leak. One listener catches clicks on status and owner cells.
el('gantt-root').addEventListener('click', (e) => {
  const statusCell = e.target.closest('.status-cell');
  const ownerCell = e.target.closest('.owner-cell');
  if (statusCell) {
    openStatusPicker(statusCell);
  } else if (ownerCell) {
    openOwnerPicker(ownerCell);
  }
});

function openStatusPicker(cell) {
  const id = cell.dataset.itemId;
  const options = ['not_started', 'in_progress', 'blocked', 'complete'];
  const select = document.createElement('select');
  select.className = 'text-xs border border-slate-300 rounded px-1 py-0.5';
  select.innerHTML = options.map(o => `<option value="${o}">${escapeHtml(statusLabel(o))}</option>`).join('');
  select.value = findNode(id).status;
  cell.innerHTML = '';
  cell.appendChild(select);
  select.focus();
  select.addEventListener('change', async () => {
    await patchItem(id, { status: select.value });
    await loadSprint(state.currentSprint.id);
    renderAll();
  });
  select.addEventListener('blur', async () => {
    // WHY: blur without change — re-render to restore the pill.
    renderAll();
  });
}

function openOwnerPicker(cell) {
  const id = cell.dataset.itemId;
  const select = document.createElement('select');
  select.className = 'text-xs border border-slate-300 rounded px-1 py-0.5';
  const opts = ['<option value="">—</option>'].concat(
    state.currentSprint.people.map(p => `<option value="${p.id}">${escapeHtml(p.initials)}</option>`)
  );
  select.innerHTML = opts.join('');
  const node = findNode(id);
  if (node.owner_id) select.value = String(node.owner_id);
  cell.innerHTML = '';
  cell.appendChild(select);
  select.focus();
  select.addEventListener('change', async () => {
    const v = select.value ? Number(select.value) : null;
    await patchItem(id, { owner_id: v });
    await loadSprint(state.currentSprint.id);
    renderAll();
  });
  select.addEventListener('blur', () => {
    renderAll();
  });
}

async function patchItem(id, body) {
  return api('PATCH', `/api/tracker/items/${id}`, body);
}

// WHY: Flat search over the tree — small enough we don't need an index.
function findNode(id) {
  for (const p of state.currentSprint.projects) {
    if (p.id === id) return p;
    for (const t of p.tasks || []) {
      if (t.id === id) return t;
      for (const s of t.subtasks || []) if (s.id === id) return s;
    }
  }
  return null;
}
```

- [ ] **Step 2: Smoke test**

Run: `npm run dev &`

Open the page. Click a status pill → pick "In Progress" → verify the pill updates and the sprint summary at the top refreshes. Click an owner cell → pick a different person → verify it saves.

Kill the dev server.

- [ ] **Step 3: Commit**

```bash
git add public/js/tracker.js
git commit -m "$(cat <<'EOF'
feat(tracker): Add inline status and owner edits

Problem: Flipping a status or reassigning an owner is the
highest-frequency edit and shouldn't require opening the drawer.
Solution: Click the status pill or owner cell → inline select →
PATCH /api/tracker/items/:id → refresh sprint → re-render. Event
delegation on the Gantt root avoids per-row listener leaks.
EOF
)"
```

---

## Task 13: Side-panel drawer — create and edit for all levels

**Files:**
- Modify: `public/js/tracker.js`

- [ ] **Step 1: Add drawer rendering + wiring**

Append to `public/js/tracker.js`:

```javascript
// ── Drawer ────────────────────────────────────────────────────
// WHY: The drawer handles both edit (existing item) and create (empty form).
// The `mode` controls button visibility (delete only on edit) and save endpoint.
let drawerMode = null; // { kind: 'item', mode: 'create' | 'edit', level, sprint_id, parent_id?, id? }

function openDrawer(config) {
  drawerMode = config;
  renderDrawerForm();
  el('drawer').classList.add('open');
  el('drawer-backdrop').classList.add('open');
}

function closeDrawer() {
  drawerMode = null;
  el('drawer').classList.remove('open');
  el('drawer-backdrop').classList.remove('open');
}

el('drawer-backdrop').addEventListener('click', closeDrawer);

function renderDrawerForm() {
  const title = el('drawer-title');
  const form = el('drawer-form');
  if (!drawerMode) { form.innerHTML = ''; return; }

  const isEdit = drawerMode.mode === 'edit';
  const existing = isEdit ? findNode(drawerMode.id) : null;
  const level = drawerMode.level;
  title.textContent = `${isEdit ? 'Edit' : 'New'} ${level}`;

  const peopleOpts = (selectedId) => [
    '<option value="">—</option>',
    ...state.currentSprint.people.map(p =>
      `<option value="${p.id}" ${selectedId == p.id ? 'selected' : ''}>${escapeHtml(p.initials)}</option>`
    ),
  ].join('');

  const supportCheckboxes = () => state.currentSprint.people.map(p => {
    const checked = existing?.support_ids?.includes(p.id) ? 'checked' : '';
    return `<label class="inline-flex items-center gap-1 text-xs mr-2"><input type="checkbox" name="support" value="${p.id}" ${checked}> ${escapeHtml(p.initials)}</label>`;
  }).join('');

  const colorOptions = ['purple','amber','teal','coral','pink','blue','green','gray']
    .map(c => `<option value="${c}" ${existing?.color === c ? 'selected' : ''}>${c}</option>`).join('');

  form.innerHTML = `
    <label class="block text-xs font-semibold text-slate-600">Name
      <input name="name" value="${escapeHtml(existing?.name || '')}" required maxlength="200"
             class="mt-1 w-full border border-slate-300 rounded px-2 py-1 text-sm">
    </label>

    <label class="block text-xs font-semibold text-slate-600">Description
      <textarea name="description" rows="2" maxlength="5000"
                class="mt-1 w-full border border-slate-300 rounded px-2 py-1 text-sm">${escapeHtml(existing?.description || '')}</textarea>
    </label>

    <label class="block text-xs font-semibold text-slate-600">${level === 'project' ? 'Owner' : 'Lead'}
      <select name="owner_id" class="mt-1 w-full border border-slate-300 rounded px-2 py-1 text-sm">
        ${peopleOpts(existing?.owner_id)}
      </select>
    </label>

    ${level === 'project' ? `
      <div class="text-xs font-semibold text-slate-600">Support
        <div class="mt-1 flex flex-wrap gap-1">${supportCheckboxes()}</div>
      </div>
      <label class="block text-xs font-semibold text-slate-600">Color
        <select name="color" class="mt-1 w-full border border-slate-300 rounded px-2 py-1 text-sm">
          <option value="">(none)</option>${colorOptions}
        </select>
      </label>
    ` : ''}

    <div class="grid grid-cols-2 gap-3">
      <label class="block text-xs font-semibold text-slate-600">Start date
        <input type="date" name="start_date" required value="${escapeHtml(existing?.start_date || state.currentSprint.start_date)}"
               class="mt-1 w-full border border-slate-300 rounded px-2 py-1 text-sm">
      </label>
      <label class="block text-xs font-semibold text-slate-600">End date
        <input type="date" name="end_date" required value="${escapeHtml(existing?.end_date || state.currentSprint.end_date)}"
               class="mt-1 w-full border border-slate-300 rounded px-2 py-1 text-sm">
      </label>
    </div>

    <label class="block text-xs font-semibold text-slate-600">Status
      <select name="status" class="mt-1 w-full border border-slate-300 rounded px-2 py-1 text-sm">
        ${['not_started','in_progress','blocked','complete'].map(s =>
          `<option value="${s}" ${existing?.status === s ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}
      </select>
    </label>

    <label class="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
      <input type="checkbox" name="is_milestone" ${existing?.is_milestone ? 'checked' : ''}> Milestone (zero-duration)
    </label>

    <label class="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
      <input type="checkbox" name="needs_verification" ${existing?.needs_verification ? 'checked' : ''}> Needs verification
    </label>

    <label class="block text-xs font-semibold text-slate-600">Verification note
      <textarea name="verification_note" rows="2" maxlength="5000"
                class="mt-1 w-full border border-slate-300 rounded px-2 py-1 text-sm">${escapeHtml(existing?.verification_note || '')}</textarea>
    </label>

    <div class="flex items-center justify-between pt-4 border-t border-slate-200">
      <button type="button" id="drawer-cancel" class="text-sm text-slate-500">Cancel</button>
      <div class="flex gap-2">
        ${isEdit ? '<button type="button" id="drawer-delete" class="text-sm text-red-600 hover:text-red-800">Delete</button>' : ''}
        <button type="submit" class="bg-slate-900 text-white text-sm font-semibold px-4 py-1.5 rounded">Save</button>
      </div>
    </div>
  `;

  el('drawer-cancel').addEventListener('click', closeDrawer);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitDrawer(form);
  });
  if (isEdit) {
    el('drawer-delete').addEventListener('click', async () => {
      if (!confirm(`Delete "${existing.name}"? This cascades to children.`)) return;
      await api('DELETE', `/api/tracker/items/${existing.id}`);
      await loadSprint(state.currentSprint.id);
      renderAll();
      closeDrawer();
    });
  }
}

async function submitDrawer(form) {
  const fd = new FormData(form);
  const body = {
    name: fd.get('name'),
    description: fd.get('description') || null,
    owner_id: fd.get('owner_id') ? Number(fd.get('owner_id')) : null,
    start_date: fd.get('start_date'),
    end_date: fd.get('end_date'),
    status: fd.get('status'),
    is_milestone: fd.has('is_milestone'),
    needs_verification: fd.has('needs_verification'),
    verification_note: fd.get('verification_note') || null,
  };
  if (drawerMode.level === 'project') {
    body.color = fd.get('color') || null;
  }

  const supportIds = fd.getAll('support').map(Number);

  try {
    if (drawerMode.mode === 'edit') {
      await api('PATCH', `/api/tracker/items/${drawerMode.id}`, body);
      if (drawerMode.level === 'project') {
        await api('PUT', `/api/tracker/items/${drawerMode.id}/support`, { person_ids: supportIds });
      }
    } else {
      const created = await api('POST', '/api/tracker/items', {
        sprint_id: state.currentSprint.id,
        parent_id: drawerMode.parent_id || null,
        level: drawerMode.level,
        ...body,
      });
      if (drawerMode.level === 'project' && supportIds.length > 0) {
        await api('PUT', `/api/tracker/items/${created.id}/support`, { person_ids: supportIds });
      }
    }
    await loadSprint(state.currentSprint.id);
    renderAll();
    closeDrawer();
  } catch (err) {
    alert('Save failed: ' + err.message);
  }
}

// Row click → edit drawer
el('gantt-root').addEventListener('click', (e) => {
  const rowName = e.target.closest('.row-name');
  if (!rowName) return;
  const row = e.target.closest('.gantt-row');
  const id = row?.dataset?.itemId;
  if (!id) return;
  const node = findNode(id);
  if (!node) return;
  openDrawer({ kind: 'item', mode: 'edit', level: node.level, id });
});

// + Add Project button
el('btn-add-project').addEventListener('click', () => {
  openDrawer({ kind: 'item', mode: 'create', level: 'project' });
});

// + New Sprint button (opens a lightweight prompt for MVP)
el('btn-new-sprint').addEventListener('click', async () => {
  const name = prompt('Sprint name?');
  if (!name) return;
  const start = prompt('Start date (YYYY-MM-DD)?', new Date().toISOString().slice(0, 10));
  if (!start) return;
  const end = prompt('End date (YYYY-MM-DD)?');
  if (!end) return;
  try {
    const created = await api('POST', '/api/tracker/sprints', { name, start_date: start, end_date: end });
    await loadSprintList();
    await loadSprint(created.id);
    renderAll();
  } catch (err) {
    alert('Create failed: ' + err.message);
  }
});
```

- [ ] **Step 2: Smoke test**

Run: `npm run dev &`

Open the page. Test:
- Click a project row name → drawer opens with form prefilled → change description → Save → row updates
- Click "+ Add Project" → drawer opens empty → fill in name, dates, color, owner → Save → new project appears
- Click an existing project → check Delete works and cascades (task rows also disappear)

Kill the dev server.

- [ ] **Step 3: Commit**

```bash
git add public/js/tracker.js
git commit -m "$(cat <<'EOF'
feat(tracker): Add side-panel drawer for create/edit/delete

Problem: Everything beyond status/owner flips needs a multi-field form.
Solution: Right-side drawer with full item form — name, description,
owner, support (multi-select chips), dates, status, milestone toggle,
verification toggle + note, color (projects only). Save writes item
PATCH/POST and support PUT. Delete cascades. "+ Add Project" opens a
blank drawer. "+ New Sprint" uses a simple prompt trio for MVP.
EOF
)"
```

---

## Task 14: "+ Add Task" and "+ Add Subtask" affordances

**Files:**
- Modify: `public/js/tracker.js`

- [ ] **Step 1: Add nested "+ Add" buttons into the Gantt render**

In `public/js/tracker.js`, update `renderGantt` to append per-project and per-task add buttons. Replace the body of `renderGantt` with:

```javascript
function renderGantt() {
  const root = el('gantt-root');
  const s = state.currentSprint;
  if (!s) { root.innerHTML = ''; return; }

  const headers = weekHeaders(s.start_date, s.end_date);
  const headerCols = headers.map(h => `<div class="text-center">${escapeHtml(h)}</div>`).join('');

  const rowsHtml = [];
  for (const proj of s.projects) {
    rowsHtml.push(renderRow(proj, 0, s, proj));
    for (const task of proj.tasks || []) {
      rowsHtml.push(renderRow(task, 1, s, proj));
      for (const sub of task.subtasks || []) {
        rowsHtml.push(renderRow(sub, 2, s, proj));
      }
      rowsHtml.push(`
        <div class="gantt-row">
          <div class="gantt-left">
            <div class="row-name level-2">
              <button class="text-xs text-slate-500 hover:text-slate-900 add-subtask-btn" data-parent="${task.id}">+ Add Subtask</button>
            </div>
            <div></div><div></div><div></div>
          </div>
          <div class="gantt-right"></div>
        </div>
      `);
    }
    // WHY: Projects without children still get an "+ Add Task" row.
    if (proj.level === 'project') {
      rowsHtml.push(`
        <div class="gantt-row">
          <div class="gantt-left">
            <div class="row-name level-1">
              <button class="text-xs text-slate-500 hover:text-slate-900 add-task-btn" data-parent="${proj.id}">+ Add Task</button>
            </div>
            <div></div><div></div><div></div>
          </div>
          <div class="gantt-right"></div>
        </div>
      `);
    }
  }

  root.innerHTML = `
    <div class="gantt">
      <div class="gantt-header">
        <div>Name / Owner / Support / Status</div>
        <div style="display:grid; grid-template-columns: repeat(${headers.length}, 1fr);">${headerCols}</div>
      </div>
      ${rowsHtml.join('')}
    </div>
  `;
}
```

Then wire the add-task / add-subtask clicks by extending the existing `gantt-root` click handler. Replace the row-click handler block (the one that handles `.row-name`) with:

```javascript
el('gantt-root').addEventListener('click', (e) => {
  const addTask = e.target.closest('.add-task-btn');
  if (addTask) {
    openDrawer({ kind: 'item', mode: 'create', level: 'task', parent_id: addTask.dataset.parent });
    return;
  }
  const addSub = e.target.closest('.add-subtask-btn');
  if (addSub) {
    openDrawer({ kind: 'item', mode: 'create', level: 'subtask', parent_id: addSub.dataset.parent });
    return;
  }
  const rowName = e.target.closest('.row-name');
  if (!rowName) return;
  const row = e.target.closest('.gantt-row');
  const id = row?.dataset?.itemId;
  if (!id) return;
  const node = findNode(id);
  if (!node) return;
  openDrawer({ kind: 'item', mode: 'edit', level: node.level, id });
});
```

- [ ] **Step 2: Smoke test**

Run: `npm run dev &`

Expected:
- Under each project, a "+ Add Task" row appears at the bottom of its task list
- Under each task, a "+ Add Subtask" row appears at the bottom of its subtask list
- Clicking either opens the drawer in create mode with the correct parent and level
- Creating a task or subtask shows up in the Gantt immediately

Kill the dev server.

- [ ] **Step 3: Commit**

```bash
git add public/js/tracker.js
git commit -m "$(cat <<'EOF'
feat(tracker): Add inline + Add Task and + Add Subtask affordances

Problem: Users need to create tasks/subtasks in context without fishing
through a nested menu.
Solution: Render a bottom-anchored "+ Add Task" row inside each project
and "+ Add Subtask" inside each task. Click opens the drawer in create
mode with the right parent_id and level.
EOF
)"
```

---

## Task 15: Manage People modal

**Files:**
- Modify: `public/js/tracker.js`

- [ ] **Step 1: Add Manage People modal wiring**

Append to `public/js/tracker.js`:

```javascript
// ── Manage People modal ───────────────────────────────────────
function openPeopleModal() {
  renderPeopleList();
  el('people-modal-backdrop').classList.add('open');
}
function closePeopleModal() {
  el('people-modal-backdrop').classList.remove('open');
}

async function refreshPeople() {
  // WHY: Full sprint reload hydrates people via GET /sprints/:id
  await loadSprint(state.currentSprint.id);
  renderAll();
  renderPeopleList();
}

function renderPeopleList() {
  const list = el('people-list');
  list.innerHTML = state.currentSprint.people.map(p => `
    <div class="flex items-center justify-between border border-slate-200 rounded px-3 py-1.5">
      <div class="text-sm"><span class="font-semibold">${escapeHtml(p.initials)}</span>
        ${p.full_name ? `<span class="text-slate-500"> — ${escapeHtml(p.full_name)}</span>` : ''}
      </div>
      <button class="text-xs text-red-600 hover:text-red-800 del-person-btn" data-id="${p.id}">Remove</button>
    </div>
  `).join('') || '<div class="text-xs text-slate-500">No people yet.</div>';
}

el('btn-manage-people').addEventListener('click', openPeopleModal);
el('people-modal-close').addEventListener('click', closePeopleModal);
el('people-modal-backdrop').addEventListener('click', (e) => {
  if (e.target === el('people-modal-backdrop')) closePeopleModal();
});

el('people-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('.del-person-btn');
  if (!btn) return;
  if (!confirm('Deactivate this person? Historical assignments keep resolving.')) return;
  await api('DELETE', `/api/tracker/people/${btn.dataset.id}`);
  await refreshPeople();
});

el('person-add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const initials = el('person-initials').value.trim();
  const fullName = el('person-fullname').value.trim();
  if (!initials) return;
  try {
    await api('POST', '/api/tracker/people', { initials, full_name: fullName || null });
    el('person-initials').value = '';
    el('person-fullname').value = '';
    await refreshPeople();
  } catch (err) {
    alert('Add failed: ' + err.message);
  }
});
```

- [ ] **Step 2: Smoke test**

Run: `npm run dev &`

Open the page. Click "Manage People". Verify:
- 12 seeded people listed
- Add a new person "XX / Test" → appears in list and in the owner dropdown (reopen the drawer on any row to see)
- Remove the new person → it disappears; reopening the drawer doesn't show them

Kill the dev server.

- [ ] **Step 3: Commit**

```bash
git add public/js/tracker.js
git commit -m "$(cat <<'EOF'
feat(tracker): Add Manage People modal

Problem: Dropdowns are stale if you can't add or deactivate people.
Solution: Modal shows active people, with inline add (initials +
optional full name) and soft-delete. Post-mutation reloads the sprint so
owner/support pickers reflect the new list immediately.
EOF
)"
```

---

## Task 16: Docs and changelog

**Files:**
- Modify: `docs/20-architecture/database-schema.md`
- Modify: `CHANGELOG.md`

- [ ] **Step 1: Document the new tables**

Open `docs/20-architecture/database-schema.md`. Append a new section (or insert in the right alphabetical position if that's the existing pattern):

```markdown
## Project tracker

### `tracker_sprints`

Top-level container for a time-boxed workstream sprint.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | UUID via `generateId()` |
| name | TEXT | NOT NULL | |
| description | TEXT | | |
| start_date | TEXT | NOT NULL | ISO date |
| end_date | TEXT | NOT NULL | ISO date; API enforces start ≤ end |
| created_at | TEXT | DEFAULT (datetime('now')) | |
| updated_at | TEXT | DEFAULT (datetime('now')) | |

### `tracker_items`

Unified table for projects / tasks / subtasks. One table instead of three because they share nearly all columns.

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | |
| sprint_id | TEXT | NOT NULL REFERENCES tracker_sprints(id) ON DELETE CASCADE | |
| parent_id | TEXT | REFERENCES tracker_items(id) ON DELETE CASCADE | NULL for projects |
| level | TEXT | NOT NULL CHECK (level IN ('project','task','subtask')) | Hierarchy enforced in the API |
| name | TEXT | NOT NULL | |
| description | TEXT | | |
| owner_id | INTEGER | REFERENCES tracker_people(id) | "Owner" on projects, "lead" on tasks/subtasks |
| color | TEXT | | Only set on projects |
| start_date / end_date | TEXT | NOT NULL | ISO dates |
| status | TEXT | CHECK IN (not_started, in_progress, blocked, complete) | Default `not_started` |
| needs_verification | INTEGER | CHECK (0,1) | Amber badge in UI |
| verification_note | TEXT | | |
| is_milestone | INTEGER | CHECK (0,1) | Renders as a diamond |
| sort_order | INTEGER | NOT NULL DEFAULT 0 | Stable display order within a parent |
| created_at / updated_at | TEXT | DEFAULT (datetime('now')) | |

### `tracker_people`

Managed list of people for owner / support dropdowns. Decoupled from `admin_users`.

| Column | Type | Constraints |
|---|---|---|
| id | INTEGER | PRIMARY KEY AUTOINCREMENT |
| initials | TEXT | NOT NULL |
| full_name | TEXT | |
| notes | TEXT | |
| active | INTEGER | NOT NULL DEFAULT 1 CHECK (0,1) |
| created_at | TEXT | DEFAULT (datetime('now')) |

### `tracker_item_support`

Many-to-many: which people support which item.

| Column | Type | Constraints |
|---|---|---|
| item_id | TEXT | NOT NULL REFERENCES tracker_items(id) ON DELETE CASCADE |
| person_id | INTEGER | NOT NULL REFERENCES tracker_people(id) ON DELETE CASCADE |
| PRIMARY KEY | | (item_id, person_id) |
```

- [ ] **Step 2: Append the changelog entry**

Open `CHANGELOG.md`. Under the top "Unreleased" or current-dated section (follow the existing convention), add:

```markdown
- **Project Tracker** (2026-04-23): New admin page at `/admin/project-tracker` — sprint-based planner with projects/tasks/subtasks, Gantt view, inline status/owner edits, side-panel drawer for full edits, managed people list, seeded with Hotel Bots - Sprint 1 from the v2 roadmap doc.
```

- [ ] **Step 3: Run the full test suite**

Run: `npm test`
Expected: all tests pass — unit, integration, schema, seed.

- [ ] **Step 4: Manual end-to-end smoke**

Run: `npm run dev &`

Walk through the full path:
1. Open `/admin` → confirm the Project Tracker tile is present
2. Click it → page loads, Gantt shows 10 seeded projects + go/no-go milestone
3. Click a status pill → change → status updates and summary count updates
4. Click a row name → drawer opens → edit description → Save → row name stays but description persists (reopen drawer to confirm)
5. Click "+ Add Task" under Deploy → fill → Save → new task appears under Deploy
6. Click "Manage People" → add "XX" → reopen owner dropdown on any row → XX visible → deactivate → XX gone
7. Click "+ New Sprint" → create "Hotel Bots - Sprint 2" → selector switches → empty Gantt + "+ Add Project"

Kill the dev server.

- [ ] **Step 5: Commit**

```bash
git add docs/20-architecture/database-schema.md CHANGELOG.md
git commit -m "$(cat <<'EOF'
docs(tracker): Document schema + changelog for project tracker

Problem: Schema-doc and changelog must reflect new user-visible feature
per repo rules (.claude/rules/database-migrations.md and testing.md).
Solution: Schema doc gains 4 new table sections; CHANGELOG gets a
bullet under the current entry.
EOF
)"
```

---

## Self-review (run after final task)

Before declaring the plan done, verify:

- **Spec coverage:** every section of `docs/superpowers/specs/2026-04-23-project-tracker-design.md` maps to a task in this plan.
  - §2 Data model → Task 1
  - §3 API → Tasks 3–7
  - §4 UI (layout, inline, drawer, colors, +add, manage people) → Tasks 9–15
  - §5 Seed → Task 8
  - §6 Testing → embedded in every task (TDD)
  - §7 File layout → Tasks 1–16
  - §8 Wiring verification → Task 9 covers tile + route; Task 16 final smoke confirms the chain

- **Wiring checklist from `.claude/rules/wiring-verification.md`:** tile present on command center; page reachable; API routes mounted under `requireAuth`; CSP unchanged (no new external origins); field names match JSON shapes; `CHANGELOG.md` + schema doc updated.

- **Types / names / paths:** `generateId()` and `requireAuth` exist exactly as referenced. `createTestDb()` is the test helper. Route prefix is `/api/tracker`. Nothing references an undefined helper.

- **No placeholders:** every step has complete code or a concrete command. No TBDs.

If anything above is missing after implementation, add a follow-up commit on the same branch.
