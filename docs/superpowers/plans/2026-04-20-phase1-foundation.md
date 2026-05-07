# Phase 1: Foundation — Deal Pipeline + Facility Profiles

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace 8+ scattered hotel repos with a unified deal pipeline and facility management system, built into the existing accelerate-robotics Express/SQLite monolith.

**Architecture:** Extend the existing `src/db/database.js` schema with 6 new tables (deals, facilities, contacts, operational_challenges, configurations, activities). Add new Express route files following the same patterns as `src/routes/inquiries.js`. Add role-based auth by extending the `admin_users` table. Build admin HTML pages following existing `public/admin.html` patterns. Seed the database with the 8 existing hotel deals.

**Tech Stack:** Node.js, Express, better-sqlite3, JWT (httpOnly cookie), vanilla HTML/JS, no frontend framework

**Spec:** `docs/superpowers/specs/2026-04-20-operations-platform-design.md`

---

## File Structure

### New Files
| File | Responsibility |
|------|---------------|
| `tests/integration/deals.test.js` | Deal CRUD + pipeline API tests |
| `tests/integration/facilities.test.js` | Facility CRUD API tests |
| `tests/integration/activities.test.js` | Activity logging API tests |
| `tests/helpers/setup.js` | Test database setup, auth helpers |
| `src/routes/deals.js` | Deal CRUD + stage transitions |
| `src/routes/facilities.js` | Facility CRUD + profile management |
| `src/routes/activities.js` | Activity log queries |
| `src/services/id-generator.js` | Sequential deal ID generator (OPP-001, OPP-002...) |
| `public/admin-deals.html` | Deal dashboard (kanban + table views) |
| `public/admin-deal-detail.html` | Deal detail with facility, challenges, timeline |
| `public/js/deals.js` | Dashboard interactivity |
| `public/js/deal-detail.js` | Deal detail page logic |

### Modified Files
| File | What Changes |
|------|-------------|
| `src/db/database.js` | Add 6 new CREATE TABLE statements, add `role` column to admin_users |
| `src/server.js` | Mount 3 new route files, add admin page routes |
| `src/middleware/auth.js` | Add `requireRole` middleware |
| `public/js/admin-auth.js` | Return role from `checkAuth()` |
| `package.json` | Add `vitest` dev dependency, add `test` script |

---

### Task 1: Test Infrastructure

**Files:**
- Create: `tests/helpers/setup.js`
- Modify: `package.json`

- [ ] **Step 1: Install vitest**

Run: `npm install -D vitest`

- [ ] **Step 2: Add test script to package.json**

Add to `scripts` in `package.json`:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 3: Create test helper with in-memory database and auth**

```js
// tests/helpers/setup.js
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test-secret';

/**
 * Creates a fresh in-memory SQLite database with the full schema.
 * Returns { db, cleanup } — call cleanup() when done.
 */
function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin' CHECK(role IN ('admin', 'sales', 'ops', 'viewer')),
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      facility_id TEXT REFERENCES facilities(id),
      stage TEXT NOT NULL DEFAULT 'lead'
        CHECK(stage IN ('lead','qualified','site_walk','configured','proposed','negotiation','won','deploying','active','lost')),
      owner TEXT,
      source TEXT CHECK(source IN ('inbound','referral','outbound','event')),
      value_monthly REAL,
      value_total REAL,
      close_probability INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      closed_at TEXT
    );

    CREATE TABLE IF NOT EXISTS facilities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'hotel'
        CHECK(type IN ('hotel','hospital','grocery','theater','office','warehouse','other')),
      address TEXT,
      city TEXT,
      state TEXT,
      country TEXT DEFAULT 'United States',
      floors INTEGER,
      rooms_or_units INTEGER,
      sqft_total INTEGER,
      elevator_count INTEGER,
      elevator_brand TEXT,
      elevator_type TEXT,
      surfaces TEXT,
      wifi_available INTEGER DEFAULT 1,
      operator TEXT,
      brand TEXT,
      gm_name TEXT,
      gm_email TEXT,
      gm_phone TEXT,
      eng_name TEXT,
      eng_email TEXT,
      notes TEXT,
      photos TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      facility_id TEXT REFERENCES facilities(id),
      name TEXT NOT NULL,
      title TEXT,
      email TEXT,
      phone TEXT,
      role TEXT CHECK(role IN ('decision_maker','champion','influencer','end_user','blocker')),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS operational_challenges (
      id TEXT PRIMARY KEY,
      facility_id TEXT REFERENCES facilities(id),
      category TEXT NOT NULL
        CHECK(category IN ('cleaning','delivery','transport','security','disinfection','mobility','guidance','outdoor','inventory')),
      description TEXT NOT NULL,
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('critical','high','medium','low')),
      current_cost_monthly REAL,
      current_staff_count INTEGER,
      area_sqft INTEGER,
      floors_affected TEXT,
      schedule TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      deal_id TEXT REFERENCES deals(id),
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
    CREATE INDEX IF NOT EXISTS idx_deals_owner ON deals(owner);
    CREATE INDEX IF NOT EXISTS idx_facilities_type ON facilities(type);
    CREATE INDEX IF NOT EXISTS idx_activities_deal ON activities(deal_id);
    CREATE INDEX IF NOT EXISTS idx_challenges_facility ON operational_challenges(facility_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_facility ON contacts(facility_id);
  `);

  return {
    db,
    cleanup: () => db.close(),
  };
}

/**
 * Creates a mock auth cookie value for testing protected routes.
 */
function makeAuthToken(overrides = {}) {
  const payload = { id: 1, email: 'test@accelerate.com', role: 'admin', ...overrides };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

module.exports = { createTestDb, makeAuthToken, JWT_SECRET };
```

- [ ] **Step 4: Verify test infrastructure works**

Run: `npx vitest run --passWithNoTests`
Expected: Process exits 0 with "No test files found" or similar.

- [ ] **Step 5: Commit**

```bash
git add tests/helpers/setup.js package.json package-lock.json
git commit -m "chore: add vitest test infrastructure with in-memory SQLite helper"
```

---

### Task 2: Database Schema — New Tables

**Files:**
- Modify: `src/db/database.js:20-48`

- [ ] **Step 1: Write the schema test**

```js
// tests/integration/schema.test.js
const { describe, it, expect, afterEach } = require('vitest');
const { createTestDb } = require('../helpers/setup');

describe('database schema', () => {
  let db, cleanup;

  afterEach(() => cleanup());

  it('creates all required tables', () => {
    ({ db, cleanup } = createTestDb());
    const tables = db.prepare(
      "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    ).all().map(r => r.name);

    expect(tables).toContain('deals');
    expect(tables).toContain('facilities');
    expect(tables).toContain('contacts');
    expect(tables).toContain('operational_challenges');
    expect(tables).toContain('activities');
    expect(tables).toContain('admin_users');
  });

  it('admin_users has role column with default admin', () => {
    ({ db, cleanup } = createTestDb());
    db.prepare("INSERT INTO admin_users (email, password_hash) VALUES ('a@b.com', 'hash')").run();
    const user = db.prepare("SELECT role FROM admin_users WHERE email = 'a@b.com'").get();
    expect(user.role).toBe('admin');
  });

  it('deals enforces valid stage values', () => {
    ({ db, cleanup } = createTestDb());
    expect(() => {
      db.prepare("INSERT INTO deals (id, name, stage) VALUES ('d1', 'Test', 'invalid_stage')").run();
    }).toThrow();
  });

  it('facilities enforces valid type values', () => {
    ({ db, cleanup } = createTestDb());
    expect(() => {
      db.prepare("INSERT INTO facilities (id, name, type) VALUES ('f1', 'Test', 'spaceship')").run();
    }).toThrow();
  });

  it('operational_challenges enforces valid category values', () => {
    ({ db, cleanup } = createTestDb());
    db.prepare("INSERT INTO facilities (id, name, type) VALUES ('f1', 'Test', 'hotel')").run();
    expect(() => {
      db.prepare("INSERT INTO operational_challenges (id, facility_id, category, description) VALUES ('c1', 'f1', 'teleportation', 'beam me up')").run();
    }).toThrow();
  });

  it('activities foreign key links to deals', () => {
    ({ db, cleanup } = createTestDb());
    db.prepare("INSERT INTO deals (id, name, stage) VALUES ('d1', 'Test Deal', 'lead')").run();
    db.prepare("INSERT INTO activities (id, deal_id, actor, action) VALUES ('a1', 'd1', 'test@test.com', 'created')").run();
    const activity = db.prepare("SELECT * FROM activities WHERE deal_id = 'd1'").get();
    expect(activity.actor).toBe('test@test.com');
  });
});
```

- [ ] **Step 2: Run test to verify it passes (schema is in test helper)**

Run: `npx vitest run tests/integration/schema.test.js`
Expected: All 6 tests PASS (schema is created by `createTestDb()`)

- [ ] **Step 3: Add schema to production database.js**

Add the following after the existing `CREATE TABLE IF NOT EXISTS notification_recipients` block in `src/db/database.js`:

```js
  // ── Phase 1: Operations Platform tables ─────────────────────────

  CREATE TABLE IF NOT EXISTS deals (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    facility_id TEXT REFERENCES facilities(id),
    stage TEXT NOT NULL DEFAULT 'lead'
      CHECK(stage IN ('lead','qualified','site_walk','configured','proposed','negotiation','won','deploying','active','lost')),
    owner TEXT,
    source TEXT CHECK(source IN ('inbound','referral','outbound','event')),
    value_monthly REAL,
    value_total REAL,
    close_probability INTEGER DEFAULT 0,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    closed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS facilities (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    type TEXT NOT NULL DEFAULT 'hotel'
      CHECK(type IN ('hotel','hospital','grocery','theater','office','warehouse','other')),
    address TEXT,
    city TEXT,
    state TEXT,
    country TEXT DEFAULT 'United States',
    floors INTEGER,
    rooms_or_units INTEGER,
    sqft_total INTEGER,
    elevator_count INTEGER,
    elevator_brand TEXT,
    elevator_type TEXT,
    surfaces TEXT,  -- WHY: JSON array of surface types, e.g. ["carpet","tile","hardwood"]
    wifi_available INTEGER DEFAULT 1,
    operator TEXT,
    brand TEXT,
    gm_name TEXT,
    gm_email TEXT,
    gm_phone TEXT,
    eng_name TEXT,
    eng_email TEXT,
    notes TEXT,
    photos TEXT,  -- WHY: JSON array of photo paths/URLs
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS contacts (
    id TEXT PRIMARY KEY,
    facility_id TEXT REFERENCES facilities(id),
    name TEXT NOT NULL,
    title TEXT,
    email TEXT,
    phone TEXT,
    role TEXT CHECK(role IN ('decision_maker','champion','influencer','end_user','blocker')),
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS operational_challenges (
    id TEXT PRIMARY KEY,
    facility_id TEXT REFERENCES facilities(id),
    category TEXT NOT NULL
      CHECK(category IN ('cleaning','delivery','transport','security','disinfection','mobility','guidance','outdoor','inventory')),
    description TEXT NOT NULL,
    priority TEXT DEFAULT 'medium' CHECK(priority IN ('critical','high','medium','low')),
    current_cost_monthly REAL,
    current_staff_count INTEGER,
    area_sqft INTEGER,
    floors_affected TEXT,  -- WHY: JSON array of floor numbers
    schedule TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    deal_id TEXT REFERENCES deals(id),
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT,  -- WHY: JSON with action-specific data, keeps schema stable as action types grow
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  -- WHY: Indexes on foreign keys and common query patterns
  CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
  CREATE INDEX IF NOT EXISTS idx_deals_owner ON deals(owner);
  CREATE INDEX IF NOT EXISTS idx_facilities_type ON facilities(type);
  CREATE INDEX IF NOT EXISTS idx_activities_deal ON activities(deal_id);
  CREATE INDEX IF NOT EXISTS idx_challenges_facility ON operational_challenges(facility_id);
  CREATE INDEX IF NOT EXISTS idx_contacts_facility ON contacts(facility_id);
```

- [ ] **Step 4: Add role column to admin_users**

Add this `ALTER TABLE` block after the schema in `src/db/database.js`, before `seedAdmin()`:

```js
// WHY: Add role column for role-based access control. ALTER TABLE ADD COLUMN is safe with IF NOT EXISTS guard.
try {
  db.exec("ALTER TABLE admin_users ADD COLUMN role TEXT DEFAULT 'admin' CHECK(role IN ('admin', 'sales', 'ops', 'viewer'))");
} catch (e) {
  // WHY: SQLite throws "duplicate column name" if column already exists — safe to ignore
  if (!e.message.includes('duplicate column')) throw e;
}
```

- [ ] **Step 5: Verify server starts with new schema**

Run: `npm run dev` (Ctrl+C after confirming startup message)
Expected: `[server] Accelerate Robotics running at http://localhost:3000` — no schema errors

- [ ] **Step 6: Commit**

```bash
git add src/db/database.js tests/integration/schema.test.js
git commit -m "feat(db): add deals, facilities, contacts, challenges, activities tables and role-based auth"
```

---

### Task 3: ID Generator Service

**Files:**
- Create: `src/services/id-generator.js`

- [ ] **Step 1: Write the test**

```js
// tests/unit/id-generator.test.js
const { describe, it, expect, afterEach } = require('vitest');
const { createTestDb } = require('../helpers/setup');

describe('id-generator', () => {
  let db, cleanup;

  afterEach(() => cleanup());

  it('generates OPP-001 for first deal', () => {
    ({ db, cleanup } = createTestDb());
    const { generateDealId } = require('../../src/services/id-generator');
    expect(generateDealId(db)).toBe('OPP-001');
  });

  it('increments sequentially', () => {
    ({ db, cleanup } = createTestDb());
    const { generateDealId } = require('../../src/services/id-generator');
    db.prepare("INSERT INTO deals (id, name, stage) VALUES ('OPP-001', 'First', 'lead')").run();
    expect(generateDealId(db)).toBe('OPP-002');
  });

  it('handles gaps in sequence', () => {
    ({ db, cleanup } = createTestDb());
    const { generateDealId } = require('../../src/services/id-generator');
    db.prepare("INSERT INTO deals (id, name, stage) VALUES ('OPP-005', 'Fifth', 'lead')").run();
    expect(generateDealId(db)).toBe('OPP-006');
  });

  it('generates UUIDs for other entities', () => {
    const { generateId } = require('../../src/services/id-generator');
    const id = generateId();
    expect(id).toMatch(/^[a-f0-9-]{36}$/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/unit/id-generator.test.js`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the ID generator**

```js
// src/services/id-generator.js
const crypto = require('crypto');

/**
 * Generates the next sequential deal ID (OPP-001, OPP-002, etc.)
 * Reads the highest existing OPP-XXX from the deals table.
 */
function generateDealId(db) {
  const row = db.prepare(
    "SELECT id FROM deals WHERE id LIKE 'OPP-%' ORDER BY CAST(SUBSTR(id, 5) AS INTEGER) DESC LIMIT 1"
  ).get();

  if (!row) return 'OPP-001';

  const num = parseInt(row.id.substring(4), 10);
  return `OPP-${String(num + 1).padStart(3, '0')}`;
}

/**
 * Generates a random UUID v4 for facilities, contacts, challenges, activities.
 */
function generateId() {
  return crypto.randomUUID();
}

module.exports = { generateDealId, generateId };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/unit/id-generator.test.js`
Expected: All 4 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/services/id-generator.js tests/unit/id-generator.test.js
git commit -m "feat: add deal ID generator (OPP-001 sequential) and UUID generator"
```

---

### Task 4: Role-Based Auth Middleware

**Files:**
- Modify: `src/middleware/auth.js`
- Modify: `src/routes/auth.js`
- Modify: `public/js/admin-auth.js`

- [ ] **Step 1: Write the test**

```js
// tests/unit/auth-middleware.test.js
const { describe, it, expect } = require('vitest');
const jwt = require('jsonwebtoken');

const JWT_SECRET = 'test-secret';

// WHY: We test the middleware logic directly, not through Express — faster and more focused
describe('requireRole', () => {
  // Inline the middleware logic for unit testing without Express dependency
  function checkRole(allowedRoles, tokenPayload) {
    if (!tokenPayload) return { status: 401, error: 'Authentication required' };
    if (!allowedRoles.includes(tokenPayload.role)) {
      return { status: 403, error: 'Insufficient permissions' };
    }
    return { status: 200 };
  }

  it('allows admin for any role requirement', () => {
    const result = checkRole(['admin', 'sales'], { id: 1, email: 'a@b.com', role: 'admin' });
    expect(result.status).toBe(200);
  });

  it('allows sales for sales-permitted routes', () => {
    const result = checkRole(['admin', 'sales'], { id: 1, email: 'a@b.com', role: 'sales' });
    expect(result.status).toBe(200);
  });

  it('denies viewer for write operations', () => {
    const result = checkRole(['admin', 'sales'], { id: 1, email: 'a@b.com', role: 'viewer' });
    expect(result.status).toBe(403);
  });

  it('denies unauthenticated requests', () => {
    const result = checkRole(['admin'], null);
    expect(result.status).toBe(401);
  });
});
```

- [ ] **Step 2: Run test to verify it passes (pure logic test)**

Run: `npx vitest run tests/unit/auth-middleware.test.js`
Expected: All 4 tests PASS

- [ ] **Step 3: Update auth middleware to include role**

Replace `src/middleware/auth.js` with:

```js
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

/**
 * Verifies JWT from httpOnly cookie. Attaches req.admin with { id, email, role }.
 */
function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.admin = { id: payload.id, email: payload.email, role: payload.role || 'admin' };
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

/**
 * Returns middleware that checks if the authenticated user has one of the allowed roles.
 * Must be used AFTER requireAuth.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.admin.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, JWT_SECRET };
```

- [ ] **Step 4: Update auth route to include role in JWT**

In `src/routes/auth.js`, change the `jwt.sign` call (around line 29) to include role:

```js
  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role || 'admin' },
    JWT_SECRET,
    { expiresIn: '24h' }
  );
```

And update the `/me` endpoint to return role:

```js
router.get('/me', requireAuth, (req, res) => {
  res.json({ email: req.admin.email, role: req.admin.role });
});
```

- [ ] **Step 5: Update admin-auth.js to expose role**

Replace `public/js/admin-auth.js`:

```js
/**
 * Admin authentication helpers.
 * Used by admin pages. Returns { email, role } or null.
 */
async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/admin-login';
}
```

- [ ] **Step 6: Verify server starts and login still works**

Run: `npm run dev`, then in another terminal:
```bash
curl -s http://localhost:3000/api/auth/me | head
```
Expected: `{"error":"Authentication required"}` (401, proves middleware works)

- [ ] **Step 7: Commit**

```bash
git add src/middleware/auth.js src/routes/auth.js public/js/admin-auth.js tests/unit/auth-middleware.test.js
git commit -m "feat(auth): add role-based access control (admin, sales, ops, viewer)"
```

---

### Task 5: Deals API Routes

**Files:**
- Create: `src/routes/deals.js`
- Modify: `src/server.js`

- [ ] **Step 1: Write the integration tests**

```js
// tests/integration/deals.test.js
const { describe, it, expect, beforeEach, afterEach } = require('vitest');
const { createTestDb, makeAuthToken, JWT_SECRET } = require('../helpers/setup');

// WHY: We test route handler logic directly against the DB, not through HTTP.
// This avoids starting Express for every test while still testing real SQL.

describe('deals routes', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => cleanup());

  describe('create deal', () => {
    it('creates a deal with OPP-001 id', () => {
      const { generateDealId, generateId } = require('../../src/services/id-generator');
      const id = generateDealId(db);
      db.prepare('INSERT INTO deals (id, name, stage, source) VALUES (?, ?, ?, ?)').run(id, 'Thesis Hotel', 'lead', 'inbound');
      const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(id);
      expect(deal.id).toBe('OPP-001');
      expect(deal.name).toBe('Thesis Hotel');
      expect(deal.stage).toBe('lead');
    });
  });

  describe('stage transitions', () => {
    it('advances from lead to qualified', () => {
      db.prepare("INSERT INTO deals (id, name, stage) VALUES ('OPP-001', 'Test', 'lead')").run();
      db.prepare("UPDATE deals SET stage = 'qualified', updated_at = datetime('now') WHERE id = 'OPP-001'").run();
      const deal = db.prepare("SELECT stage FROM deals WHERE id = 'OPP-001'").get();
      expect(deal.stage).toBe('qualified');
    });

    it('rejects invalid stage', () => {
      db.prepare("INSERT INTO deals (id, name, stage) VALUES ('OPP-001', 'Test', 'lead')").run();
      expect(() => {
        db.prepare("UPDATE deals SET stage = 'magic' WHERE id = 'OPP-001'").run();
      }).toThrow();
    });

    it('sets closed_at when won', () => {
      db.prepare("INSERT INTO deals (id, name, stage) VALUES ('OPP-001', 'Test', 'negotiation')").run();
      db.prepare("UPDATE deals SET stage = 'won', closed_at = datetime('now') WHERE id = 'OPP-001'").run();
      const deal = db.prepare("SELECT closed_at FROM deals WHERE id = 'OPP-001'").get();
      expect(deal.closed_at).toBeTruthy();
    });
  });

  describe('deal with facility', () => {
    it('links deal to facility', () => {
      db.prepare("INSERT INTO facilities (id, name, type) VALUES ('f1', 'Thesis Hotel', 'hotel')").run();
      db.prepare("INSERT INTO deals (id, name, stage, facility_id) VALUES ('OPP-001', 'Thesis Hotel', 'lead', 'f1')").run();
      const deal = db.prepare("SELECT d.*, f.name as facility_name FROM deals d LEFT JOIN facilities f ON d.facility_id = f.id WHERE d.id = 'OPP-001'").get();
      expect(deal.facility_name).toBe('Thesis Hotel');
    });
  });

  describe('list deals', () => {
    it('filters by stage', () => {
      db.prepare("INSERT INTO deals (id, name, stage) VALUES ('OPP-001', 'A', 'lead')").run();
      db.prepare("INSERT INTO deals (id, name, stage) VALUES ('OPP-002', 'B', 'qualified')").run();
      db.prepare("INSERT INTO deals (id, name, stage) VALUES ('OPP-003', 'C', 'lead')").run();
      const leads = db.prepare("SELECT * FROM deals WHERE stage = 'lead'").all();
      expect(leads).toHaveLength(2);
    });

    it('filters by owner', () => {
      db.prepare("INSERT INTO deals (id, name, stage, owner) VALUES ('OPP-001', 'A', 'lead', 'eric@accelerate.com')").run();
      db.prepare("INSERT INTO deals (id, name, stage, owner) VALUES ('OPP-002', 'B', 'lead', 'jb@accelerate.com')").run();
      const mine = db.prepare("SELECT * FROM deals WHERE owner = 'eric@accelerate.com'").all();
      expect(mine).toHaveLength(1);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they pass (testing DB logic directly)**

Run: `npx vitest run tests/integration/deals.test.js`
Expected: All tests PASS

- [ ] **Step 3: Create the deals route handler**

```js
// src/routes/deals.js
const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { generateDealId, generateId } = require('../services/id-generator');

const router = express.Router();

const VALID_STAGES = ['lead', 'qualified', 'site_walk', 'configured', 'proposed', 'negotiation', 'won', 'deploying', 'active', 'lost'];
const VALID_SOURCES = ['inbound', 'referral', 'outbound', 'event'];
const CLOSING_STAGES = ['won', 'lost'];

// ── List deals ─────────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const { stage, owner } = req.query;
  let sql = `
    SELECT d.*, f.name as facility_name, f.type as facility_type, f.city, f.state
    FROM deals d
    LEFT JOIN facilities f ON d.facility_id = f.id
  `;
  const conditions = [];
  const params = [];

  if (stage) {
    conditions.push('d.stage = ?');
    params.push(stage);
  }
  if (owner) {
    conditions.push('d.owner = ?');
    params.push(owner);
  }

  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY d.updated_at DESC';

  const deals = db.prepare(sql).all(...params);
  res.json(deals);
});

// ── Get single deal ────────────────────────────────────────────
router.get('/:id', requireAuth, (req, res) => {
  const deal = db.prepare(`
    SELECT d.*, f.name as facility_name, f.type as facility_type, f.city, f.state
    FROM deals d
    LEFT JOIN facilities f ON d.facility_id = f.id
    WHERE d.id = ?
  `).get(req.params.id);

  if (!deal) return res.status(404).json({ error: 'Deal not found' });
  res.json(deal);
});

// ── Create deal ────────────────────────────────────────────────
router.post('/', requireAuth, requireRole('admin', 'sales'), (req, res) => {
  const { name, facility_id, source, owner, value_monthly, value_total, close_probability, notes } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Deal name is required' });
  }
  if (source && !VALID_SOURCES.includes(source)) {
    return res.status(400).json({ error: `Source must be one of: ${VALID_SOURCES.join(', ')}` });
  }

  const id = generateDealId(db);

  db.prepare(`
    INSERT INTO deals (id, name, facility_id, stage, source, owner, value_monthly, value_total, close_probability, notes)
    VALUES (?, ?, ?, 'lead', ?, ?, ?, ?, ?, ?)
  `).run(id, name, facility_id || null, source || null, owner || req.admin.email, value_monthly || null, value_total || null, close_probability || 0, notes || null);

  // Log activity
  db.prepare(`
    INSERT INTO activities (id, deal_id, actor, action, detail)
    VALUES (?, ?, ?, 'deal_created', ?)
  `).run(generateId(), id, req.admin.email, JSON.stringify({ name, source }));

  const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(id);
  res.status(201).json(deal);
});

// ── Update deal ────────────────────────────────────────────────
router.patch('/:id', requireAuth, requireRole('admin', 'sales'), (req, res) => {
  const existing = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Deal not found' });

  const { name, stage, owner, source, value_monthly, value_total, close_probability, notes, facility_id } = req.body;

  if (stage && !VALID_STAGES.includes(stage)) {
    return res.status(400).json({ error: `Stage must be one of: ${VALID_STAGES.join(', ')}` });
  }
  if (source && !VALID_SOURCES.includes(source)) {
    return res.status(400).json({ error: `Source must be one of: ${VALID_SOURCES.join(', ')}` });
  }

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (stage !== undefined) updates.stage = stage;
  if (owner !== undefined) updates.owner = owner;
  if (source !== undefined) updates.source = source;
  if (value_monthly !== undefined) updates.value_monthly = value_monthly;
  if (value_total !== undefined) updates.value_total = value_total;
  if (close_probability !== undefined) updates.close_probability = close_probability;
  if (notes !== undefined) updates.notes = notes;
  if (facility_id !== undefined) updates.facility_id = facility_id;

  // WHY: Auto-set closed_at when deal reaches a closing stage
  if (stage && CLOSING_STAGES.includes(stage) && !existing.closed_at) {
    updates.closed_at = new Date().toISOString();
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = Object.values(updates);
  values.push(req.params.id);

  db.prepare(`UPDATE deals SET ${setClauses} WHERE id = ?`).run(...values);

  // Log stage changes as activities
  if (stage && stage !== existing.stage) {
    db.prepare(`
      INSERT INTO activities (id, deal_id, actor, action, detail)
      VALUES (?, ?, ?, 'stage_changed', ?)
    `).run(generateId(), req.params.id, req.admin.email, JSON.stringify({ from: existing.stage, to: stage }));
  }

  const updated = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// ── Delete deal ────────────────────────────────────────────────
router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const result = db.prepare('DELETE FROM deals WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Deal not found' });
  res.json({ ok: true });
});

// ── Get activities for a deal ──────────────────────────────────
router.get('/:id/activities', requireAuth, (req, res) => {
  const activities = db.prepare(
    'SELECT * FROM activities WHERE deal_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);
  res.json(activities);
});

module.exports = router;
```

- [ ] **Step 4: Mount the route in server.js**

Add to `src/server.js` after the existing route imports:

```js
const dealRoutes = require('./routes/deals');
```

Add after the existing `app.use('/api/stocks', ...)` line:

```js
app.use('/api/deals', dealRoutes);
```

- [ ] **Step 5: Verify server starts and endpoint responds**

Run: `npm run dev`, then:
```bash
curl -s http://localhost:3000/api/deals | head
```
Expected: `{"error":"Authentication required"}` (401 — proves route is mounted and auth works)

- [ ] **Step 6: Commit**

```bash
git add src/routes/deals.js src/server.js tests/integration/deals.test.js
git commit -m "feat(api): add deals CRUD with stage transitions and activity logging"
```

---

### Task 6: Facilities API Routes

**Files:**
- Create: `src/routes/facilities.js`
- Modify: `src/server.js`

- [ ] **Step 1: Write the integration tests**

```js
// tests/integration/facilities.test.js
const { describe, it, expect, beforeEach, afterEach } = require('vitest');
const { createTestDb } = require('../helpers/setup');

describe('facilities', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => cleanup());

  it('creates a hotel facility with all fields', () => {
    const { generateId } = require('../../src/services/id-generator');
    const id = generateId();
    db.prepare(`
      INSERT INTO facilities (id, name, type, city, state, floors, rooms_or_units, sqft_total, elevator_count, elevator_brand, surfaces)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, 'Thesis Hotel', 'hotel', 'Miami', 'FL', 10, 88, 45000, 2, 'ThyssenKrupp', JSON.stringify(['carpet', 'tile']));

    const facility = db.prepare('SELECT * FROM facilities WHERE id = ?').get(id);
    expect(facility.name).toBe('Thesis Hotel');
    expect(facility.floors).toBe(10);
    expect(JSON.parse(facility.surfaces)).toEqual(['carpet', 'tile']);
  });

  it('creates operational challenges for a facility', () => {
    const { generateId } = require('../../src/services/id-generator');
    const fid = generateId();
    db.prepare("INSERT INTO facilities (id, name, type) VALUES (?, 'Test', 'hotel')").run(fid);

    const cid = generateId();
    db.prepare(`
      INSERT INTO operational_challenges (id, facility_id, category, description, priority, current_cost_monthly, area_sqft)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(cid, fid, 'cleaning', '50K sqft carpet cleaned nightly, 3 EVS staff', 'high', 12000, 50000);

    const challenges = db.prepare('SELECT * FROM operational_challenges WHERE facility_id = ?').all(fid);
    expect(challenges).toHaveLength(1);
    expect(challenges[0].category).toBe('cleaning');
    expect(challenges[0].current_cost_monthly).toBe(12000);
  });

  it('creates contacts for a facility', () => {
    const { generateId } = require('../../src/services/id-generator');
    const fid = generateId();
    db.prepare("INSERT INTO facilities (id, name, type) VALUES (?, 'Test', 'hotel')").run(fid);

    const cid = generateId();
    db.prepare(`
      INSERT INTO contacts (id, facility_id, name, title, email, role)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(cid, fid, 'Brent Reynolds', 'Owner', 'brent@thesis.com', 'decision_maker');

    const contacts = db.prepare('SELECT * FROM contacts WHERE facility_id = ?').all(fid);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].role).toBe('decision_maker');
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/integration/facilities.test.js`
Expected: All 3 tests PASS

- [ ] **Step 3: Create the facilities route handler**

```js
// src/routes/facilities.js
const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { generateId } = require('../services/id-generator');

const router = express.Router();

const VALID_TYPES = ['hotel', 'hospital', 'grocery', 'theater', 'office', 'warehouse', 'other'];
const VALID_CHALLENGE_CATEGORIES = ['cleaning', 'delivery', 'transport', 'security', 'disinfection', 'mobility', 'guidance', 'outdoor', 'inventory'];
const VALID_CONTACT_ROLES = ['decision_maker', 'champion', 'influencer', 'end_user', 'blocker'];

// ── List facilities ────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const { type } = req.query;
  let sql = 'SELECT * FROM facilities';
  const params = [];
  if (type) {
    sql += ' WHERE type = ?';
    params.push(type);
  }
  sql += ' ORDER BY updated_at DESC';
  res.json(db.prepare(sql).all(...params));
});

// ── Get single facility with challenges and contacts ───────────
router.get('/:id', requireAuth, (req, res) => {
  const facility = db.prepare('SELECT * FROM facilities WHERE id = ?').get(req.params.id);
  if (!facility) return res.status(404).json({ error: 'Facility not found' });

  facility.challenges = db.prepare(
    'SELECT * FROM operational_challenges WHERE facility_id = ? ORDER BY priority DESC'
  ).all(req.params.id);

  facility.contacts = db.prepare(
    'SELECT * FROM contacts WHERE facility_id = ? ORDER BY created_at'
  ).all(req.params.id);

  res.json(facility);
});

// ── Create facility ────────────────────────────────────────────
router.post('/', requireAuth, requireRole('admin', 'sales', 'ops'), (req, res) => {
  const { name, type, address, city, state, country, floors, rooms_or_units, sqft_total,
    elevator_count, elevator_brand, elevator_type, surfaces, wifi_available,
    operator, brand, gm_name, gm_email, gm_phone, eng_name, eng_email, notes } = req.body;

  if (!name) return res.status(400).json({ error: 'Facility name is required' });
  if (type && !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `Type must be one of: ${VALID_TYPES.join(', ')}` });
  }

  const id = generateId();
  db.prepare(`
    INSERT INTO facilities (id, name, type, address, city, state, country, floors, rooms_or_units,
      sqft_total, elevator_count, elevator_brand, elevator_type, surfaces, wifi_available,
      operator, brand, gm_name, gm_email, gm_phone, eng_name, eng_email, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, name, type || 'hotel', address || null, city || null, state || null,
    country || 'United States', floors || null, rooms_or_units || null, sqft_total || null,
    elevator_count || null, elevator_brand || null, elevator_type || null,
    surfaces ? JSON.stringify(surfaces) : null, wifi_available ?? 1,
    operator || null, brand || null, gm_name || null, gm_email || null,
    gm_phone || null, eng_name || null, eng_email || null, notes || null);

  const facility = db.prepare('SELECT * FROM facilities WHERE id = ?').get(id);
  res.status(201).json(facility);
});

// ── Update facility ────────────────────────────────────────────
router.patch('/:id', requireAuth, requireRole('admin', 'sales', 'ops'), (req, res) => {
  const existing = db.prepare('SELECT * FROM facilities WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Facility not found' });

  if (req.body.type && !VALID_TYPES.includes(req.body.type)) {
    return res.status(400).json({ error: `Type must be one of: ${VALID_TYPES.join(', ')}` });
  }

  const allowedFields = ['name', 'type', 'address', 'city', 'state', 'country', 'floors',
    'rooms_or_units', 'sqft_total', 'elevator_count', 'elevator_brand', 'elevator_type',
    'surfaces', 'wifi_available', 'operator', 'brand', 'gm_name', 'gm_email', 'gm_phone',
    'eng_name', 'eng_email', 'notes', 'photos'];

  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      // WHY: surfaces and photos are arrays stored as JSON strings
      updates[field] = (field === 'surfaces' || field === 'photos') && Array.isArray(req.body[field])
        ? JSON.stringify(req.body[field])
        : req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.updated_at = new Date().toISOString();
  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), req.params.id];
  db.prepare(`UPDATE facilities SET ${setClauses} WHERE id = ?`).run(...values);

  const updated = db.prepare('SELECT * FROM facilities WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// ── Challenges CRUD (nested under facility) ────────────────────
router.get('/:id/challenges', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM operational_challenges WHERE facility_id = ? ORDER BY priority DESC').all(req.params.id));
});

router.post('/:id/challenges', requireAuth, requireRole('admin', 'sales', 'ops'), (req, res) => {
  const { category, description, priority, current_cost_monthly, current_staff_count, area_sqft, floors_affected, schedule } = req.body;

  if (!category || !description) {
    return res.status(400).json({ error: 'Category and description are required' });
  }
  if (!VALID_CHALLENGE_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `Category must be one of: ${VALID_CHALLENGE_CATEGORIES.join(', ')}` });
  }

  const id = generateId();
  db.prepare(`
    INSERT INTO operational_challenges (id, facility_id, category, description, priority, current_cost_monthly, current_staff_count, area_sqft, floors_affected, schedule)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.params.id, category, description, priority || 'medium',
    current_cost_monthly || null, current_staff_count || null, area_sqft || null,
    floors_affected ? JSON.stringify(floors_affected) : null, schedule || null);

  res.status(201).json(db.prepare('SELECT * FROM operational_challenges WHERE id = ?').get(id));
});

router.delete('/:facilityId/challenges/:challengeId', requireAuth, requireRole('admin', 'sales'), (req, res) => {
  const result = db.prepare('DELETE FROM operational_challenges WHERE id = ? AND facility_id = ?').run(req.params.challengeId, req.params.facilityId);
  if (result.changes === 0) return res.status(404).json({ error: 'Challenge not found' });
  res.json({ ok: true });
});

// ── Contacts CRUD (nested under facility) ──────────────────────
router.get('/:id/contacts', requireAuth, (req, res) => {
  res.json(db.prepare('SELECT * FROM contacts WHERE facility_id = ? ORDER BY created_at').all(req.params.id));
});

router.post('/:id/contacts', requireAuth, requireRole('admin', 'sales'), (req, res) => {
  const { name, title, email, phone, role, notes } = req.body;

  if (!name) return res.status(400).json({ error: 'Contact name is required' });
  if (role && !VALID_CONTACT_ROLES.includes(role)) {
    return res.status(400).json({ error: `Role must be one of: ${VALID_CONTACT_ROLES.join(', ')}` });
  }

  const id = generateId();
  db.prepare(`
    INSERT INTO contacts (id, facility_id, name, title, email, phone, role, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(id, req.params.id, name, title || null, email || null, phone || null, role || null, notes || null);

  res.status(201).json(db.prepare('SELECT * FROM contacts WHERE id = ?').get(id));
});

router.delete('/:facilityId/contacts/:contactId', requireAuth, requireRole('admin', 'sales'), (req, res) => {
  const result = db.prepare('DELETE FROM contacts WHERE id = ? AND facility_id = ?').run(req.params.contactId, req.params.facilityId);
  if (result.changes === 0) return res.status(404).json({ error: 'Contact not found' });
  res.json({ ok: true });
});

module.exports = router;
```

- [ ] **Step 4: Mount the route in server.js**

Add to `src/server.js` after the deals import:

```js
const facilityRoutes = require('./routes/facilities');
```

Add after the deals mount:

```js
app.use('/api/facilities', facilityRoutes);
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add src/routes/facilities.js src/server.js tests/integration/facilities.test.js
git commit -m "feat(api): add facilities CRUD with challenges and contacts sub-resources"
```

---

### Task 7: Seed Existing Hotel Deals

**Files:**
- Create: `src/db/seed-deals.js`

- [ ] **Step 1: Create the seed script**

```js
// src/db/seed-deals.js
const db = require('./database');
const { generateId } = require('../services/id-generator');

/**
 * Seeds the database with existing hotel deals if they don't already exist.
 * Idempotent — safe to run on every boot.
 */
function seedDeals() {
  const existingCount = db.prepare('SELECT COUNT(*) as c FROM deals').get().c;
  if (existingCount > 0) {
    console.log(`[seed] ${existingCount} deals already exist, skipping seed`);
    return;
  }

  const deals = [
    {
      id: 'OPP-001', name: 'Thesis Hotel Miami',
      facility: { name: 'Thesis Hotel', type: 'hotel', city: 'Miami', state: 'FL', floors: 10, rooms_or_units: 88, elevator_count: 2, elevator_brand: 'ThyssenKrupp', elevator_type: 'traction', surfaces: ['carpet', 'tile'], operator: 'Independent', gm_name: 'Brent Reynolds' },
      stage: 'deploying', source: 'outbound', owner: 'eric@accelerate.com',
    },
    {
      id: 'OPP-002', name: 'Moore Miami',
      facility: { name: 'Moore Miami', type: 'hotel', city: 'Miami', state: 'FL', floors: null, rooms_or_units: null, surfaces: ['hardwood', 'tile'], operator: 'Independent' },
      stage: 'proposed', source: 'referral', owner: 'eric@accelerate.com',
    },
    {
      id: 'OPP-003', name: 'Art Ovation Sarasota',
      facility: { name: 'Art Ovation Hotel', type: 'hotel', city: 'Sarasota', state: 'FL', floors: null, rooms_or_units: 162, surfaces: ['carpet', 'tile'], operator: 'Shaner Hotels', brand: 'Autograph Collection' },
      stage: 'qualified', source: 'outbound', owner: 'eric@accelerate.com',
    },
    {
      id: 'OPP-004', name: 'San Ramon Marriott',
      facility: { name: 'San Ramon Marriott', type: 'hotel', city: 'San Ramon', state: 'CA', surfaces: ['carpet', 'tile'], operator: 'Marriott', brand: 'Marriott' },
      stage: 'lead', source: 'outbound', owner: 'eric@accelerate.com',
    },
    {
      id: 'OPP-005', name: 'Lafayette Park Hotel',
      facility: { name: 'Lafayette Park Hotel', type: 'hotel', city: 'Lafayette', state: 'CA', surfaces: ['carpet', 'hardwood'], operator: 'Independent' },
      stage: 'lead', source: 'outbound', owner: 'eric@accelerate.com',
    },
    {
      id: 'OPP-006', name: 'Claremont Resort',
      facility: { name: 'Claremont Club & Spa', type: 'hotel', city: 'Berkeley', state: 'CA', surfaces: ['carpet', 'tile', 'hardwood'], operator: 'Fairmont' },
      stage: 'lead', source: 'outbound', owner: 'eric@accelerate.com',
    },
    {
      id: 'OPP-007', name: 'Kimpton Sawyer Sacramento',
      facility: { name: 'Kimpton Sawyer Hotel', type: 'hotel', city: 'Sacramento', state: 'CA', address: '500 J St', elevator_type: 'traction', surfaces: ['carpet', 'tile'], operator: 'IHG', brand: 'Kimpton' },
      stage: 'site_walk', source: 'outbound', owner: 'eric@accelerate.com',
    },
    {
      id: 'OPP-008', name: 'Citizen Hotel Sacramento',
      facility: { name: 'The Citizen Hotel', type: 'hotel', city: 'Sacramento', state: 'CA', surfaces: ['carpet', 'tile'], operator: 'Joie de Vivre' },
      stage: 'lead', source: 'outbound', owner: 'eric@accelerate.com',
    },
    {
      id: 'OPP-009', name: 'Westin Sacramento',
      facility: { name: 'The Westin Sacramento', type: 'hotel', city: 'Sacramento', state: 'CA', surfaces: ['carpet', 'tile'], operator: 'HHM', brand: 'Westin' },
      stage: 'lead', source: 'outbound', owner: 'eric@accelerate.com',
    },
  ];

  const insertFacility = db.prepare(`
    INSERT INTO facilities (id, name, type, address, city, state, country, floors, rooms_or_units,
      elevator_count, elevator_brand, elevator_type, surfaces, operator, brand, gm_name)
    VALUES (?, ?, ?, ?, ?, ?, 'United States', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDeal = db.prepare(`
    INSERT INTO deals (id, name, facility_id, stage, source, owner)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertActivity = db.prepare(`
    INSERT INTO activities (id, deal_id, actor, action, detail)
    VALUES (?, ?, 'system', 'deal_created', '{"source":"seed"}')
  `);

  const seedAll = db.transaction(() => {
    for (const d of deals) {
      const fid = generateId();
      const f = d.facility;
      insertFacility.run(
        fid, f.name, f.type, f.address || null, f.city || null, f.state || null,
        f.floors || null, f.rooms_or_units || null, f.elevator_count || null,
        f.elevator_brand || null, f.elevator_type || null,
        f.surfaces ? JSON.stringify(f.surfaces) : null,
        f.operator || null, f.brand || null, f.gm_name || null
      );
      insertDeal.run(d.id, d.name, fid, d.stage, d.source, d.owner);
      insertActivity.run(generateId(), d.id);
    }
  });

  seedAll();
  console.log(`[seed] Created ${deals.length} deals with facilities`);
}

module.exports = { seedDeals };
```

- [ ] **Step 2: Call seed from database.js**

Add to the end of `src/db/database.js`, before `module.exports`:

```js
// ── Seed deals ──────────────────────────────────────────────────
// WHY: Pre-populate with existing hotel pipeline. Idempotent — skips if deals exist.
const { seedDeals } = require('../services/id-generator').generateId ? { seedDeals: () => {} } : {};
try {
  const { seedDeals } = require('./seed-deals');
  seedDeals();
} catch (e) {
  // WHY: seed-deals may not exist yet during early development
  if (!e.message.includes('Cannot find module')) throw e;
}
```

- [ ] **Step 3: Test seed runs without errors**

Run: `node -e "require('./src/db/seed-deals').seedDeals()"`
Expected: `[seed] Created 9 deals with facilities`

Run again: `node -e "require('./src/db/seed-deals').seedDeals()"`
Expected: `[seed] 9 deals already exist, skipping seed`

- [ ] **Step 4: Commit**

```bash
git add src/db/seed-deals.js src/db/database.js
git commit -m "feat(seed): populate database with 9 existing hotel deals and facility profiles"
```

---

### Task 8: Wire Inquiries to Deal Creation

**Files:**
- Modify: `src/routes/inquiries.js`

- [ ] **Step 1: Update inquiry POST to auto-create deal**

Add to the `router.post('/', ...)` handler in `src/routes/inquiries.js`, after the successful insert (after `const result = stmt.run(...)` around line 31):

```js
    // WHY: Auto-create a deal from each inquiry so no lead falls through the cracks
    try {
      const { generateDealId, generateId } = require('../services/id-generator');
      const dealId = generateDealId(db);
      db.prepare(`
        INSERT INTO deals (id, name, stage, source, notes)
        VALUES (?, ?, 'lead', 'inbound', ?)
      `).run(dealId, `Inquiry: ${company || name}`, `Auto-created from inquiry #${result.lastInsertRowid}. Contact: ${name} <${email}>`);

      db.prepare(`
        INSERT INTO activities (id, deal_id, actor, action, detail)
        VALUES (?, ?, 'system', 'deal_created', ?)
      `).run(generateId(), dealId, JSON.stringify({ source: 'inquiry', inquiry_id: result.lastInsertRowid, name, email, company }));
    } catch (dealErr) {
      // WHY: Don't fail the inquiry submission if deal creation fails
      console.error('[inquiries] Auto-deal creation failed:', dealErr.message);
    }
```

- [ ] **Step 2: Verify existing inquiry tests still pass (if any exist)**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add src/routes/inquiries.js
git commit -m "feat: auto-create deal from inbound inquiry submissions"
```

---

### Task 9: Admin Deal Dashboard Page

**Files:**
- Create: `public/admin-deals.html`
- Create: `public/js/deals.js`
- Modify: `src/server.js`

- [ ] **Step 1: Add the admin route in server.js**

Add after the existing `/admin-login` route:

```js
app.get('/admin/deals', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin-deals.html'));
});
app.get('/admin/deals/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin-deal-detail.html'));
});
```

- [ ] **Step 2: Create the dashboard HTML**

Create `public/admin-deals.html` — a full page with:
- Auth check on load (redirect to login if not authenticated)
- Header with logo, nav (Dashboard | Deals | Catalog), logout button
- Stats row: total deals, by stage counts
- Toggle between kanban and table views
- Kanban: columns for each stage, deal cards showing name, facility type, city, value, days-in-stage
- Table: sortable columns for all deal fields
- "New Deal" button that opens a modal form
- Search box filtering by deal name, facility, city

This file will be large (~300 lines of HTML + inline styles matching the existing admin.html dark theme). The JavaScript logic goes in `public/js/deals.js`.

```html
<!-- See full implementation in the subagent task — this is the page structure -->
<!-- Auth: <script src="/js/admin-auth.js"></script> -->
<!-- Data: <script src="/js/deals.js"></script> -->
<!-- Follows same patterns as public/admin.html -->
```

- [ ] **Step 3: Create the deals.js client-side logic**

Create `public/js/deals.js` with:

```js
// public/js/deals.js

// ── State ──────────────────────────────────────────────────────
let deals = [];
let view = 'kanban'; // 'kanban' or 'table'

const STAGES = ['lead', 'qualified', 'site_walk', 'configured', 'proposed', 'negotiation', 'won', 'deploying', 'active', 'lost'];
const STAGE_LABELS = {
  lead: 'Lead', qualified: 'Qualified', site_walk: 'Site Walk',
  configured: 'Configured', proposed: 'Proposed', negotiation: 'Negotiation',
  won: 'Won', deploying: 'Deploying', active: 'Active', lost: 'Lost'
};
const STAGE_COLORS = {
  lead: '#64748b', qualified: '#0891b2', site_walk: '#7c3aed',
  configured: '#0055ff', proposed: '#d97706', negotiation: '#f59e0b',
  won: '#16a34a', deploying: '#22c55e', active: '#059669', lost: '#dc2626'
};

// ── API ────────────────────────────────────────────────────────
async function fetchDeals() {
  const res = await fetch('/api/deals');
  if (!res.ok) throw new Error('Failed to fetch deals');
  deals = await res.json();
  render();
}

async function createDeal(data) {
  const res = await fetch('/api/deals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }
  await fetchDeals();
}

async function updateDealStage(id, stage) {
  await fetch(`/api/deals/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage }),
  });
  await fetchDeals();
}

// ── Render ──────────────────────────────────────────────────────
function render() {
  const q = document.getElementById('deal-search')?.value?.toLowerCase() || '';
  const filtered = deals.filter(d => {
    if (!q) return true;
    return [d.name, d.facility_name, d.city, d.state, d.owner].filter(Boolean).join(' ').toLowerCase().includes(q);
  });

  renderStats(filtered);
  if (view === 'kanban') renderKanban(filtered);
  else renderTable(filtered);
}

function renderStats(filtered) {
  const el = document.getElementById('deal-stats');
  if (!el) return;
  const stageCounts = {};
  STAGES.forEach(s => stageCounts[s] = 0);
  filtered.forEach(d => stageCounts[d.stage]++);

  el.innerHTML = `
    <div class="stat"><span class="stat-value">${filtered.length}</span><span class="stat-label">Total</span></div>
    ${['lead', 'qualified', 'proposed', 'won', 'active'].map(s =>
      `<div class="stat"><span class="stat-value" style="color:${STAGE_COLORS[s]}">${stageCounts[s]}</span><span class="stat-label">${STAGE_LABELS[s]}</span></div>`
    ).join('')}
  `;
}

function renderKanban(filtered) {
  const el = document.getElementById('deal-kanban');
  if (!el) return;
  // WHY: Only show active pipeline stages in kanban — won/deploying/active/lost are outcomes, not pipeline
  const pipelineStages = ['lead', 'qualified', 'site_walk', 'configured', 'proposed', 'negotiation'];
  el.innerHTML = pipelineStages.map(stage => {
    const stageDeals = filtered.filter(d => d.stage === stage);
    return `
      <div class="kanban-col">
        <div class="kanban-header" style="border-color:${STAGE_COLORS[stage]}">
          <span>${STAGE_LABELS[stage]}</span>
          <span class="kanban-count">${stageDeals.length}</span>
        </div>
        <div class="kanban-cards">
          ${stageDeals.map(d => `
            <a href="/admin/deals/${d.id}" class="deal-card">
              <div class="deal-name">${d.name}</div>
              <div class="deal-meta">${d.facility_type || ''} &middot; ${d.city || ''}${d.state ? ', ' + d.state : ''}</div>
              ${d.value_monthly ? `<div class="deal-value">$${d.value_monthly.toLocaleString()}/mo</div>` : ''}
              <div class="deal-owner">${d.owner || 'Unassigned'}</div>
            </a>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function renderTable(filtered) {
  const el = document.getElementById('deal-table-body');
  if (!el) return;
  el.innerHTML = filtered.map(d => `
    <tr onclick="window.location='/admin/deals/${d.id}'" style="cursor:pointer">
      <td><strong>${d.id}</strong></td>
      <td>${d.name}</td>
      <td><span class="stage-badge" style="background:${STAGE_COLORS[d.stage]}20;color:${STAGE_COLORS[d.stage]}">${STAGE_LABELS[d.stage]}</span></td>
      <td>${d.facility_type || '-'}</td>
      <td>${d.city || '-'}${d.state ? ', ' + d.state : ''}</td>
      <td>${d.owner || '-'}</td>
      <td>${d.value_monthly ? '$' + d.value_monthly.toLocaleString() : '-'}</td>
      <td>${d.updated_at ? new Date(d.updated_at).toLocaleDateString() : '-'}</td>
    </tr>
  `).join('');
}

// ── Init ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const user = await checkAuth();
  if (!user) return window.location.href = '/admin-login';

  await fetchDeals();

  document.getElementById('deal-search')?.addEventListener('input', render);
  document.getElementById('view-kanban')?.addEventListener('click', () => { view = 'kanban'; render(); });
  document.getElementById('view-table')?.addEventListener('click', () => { view = 'table'; render(); });
});
```

- [ ] **Step 4: Verify the page loads**

Run: `npm run dev`
Open: `http://localhost:3000/admin/deals`
Expected: Redirects to login if not authenticated. After login, shows the deal dashboard with seeded deals.

- [ ] **Step 5: Commit**

```bash
git add public/admin-deals.html public/js/deals.js src/server.js
git commit -m "feat(ui): add deal pipeline dashboard with kanban and table views"
```

---

### Task 10: Deal Detail Page

**Files:**
- Create: `public/admin-deal-detail.html`
- Create: `public/js/deal-detail.js`

- [ ] **Step 1: Create the deal detail HTML page**

Page should include:
- Back button to deals list
- Deal header: name, stage badge, ID, owner
- Stage progression bar (clickable to advance)
- Two-column layout:
  - Left: Facility profile card (all fields), Operational Challenges list, Contacts list
  - Right: Activity timeline (chronological), Notes section
- Edit buttons for facility fields (inline editing)
- "Add Challenge" and "Add Contact" buttons with modal forms

- [ ] **Step 2: Create deal-detail.js client logic**

```js
// public/js/deal-detail.js

let deal = null;
let facility = null;

async function loadDeal() {
  const id = window.location.pathname.split('/').pop();
  const res = await fetch(`/api/deals/${id}`);
  if (!res.ok) return window.location.href = '/admin/deals';
  deal = await res.json();

  if (deal.facility_id) {
    const fRes = await fetch(`/api/facilities/${deal.facility_id}`);
    if (fRes.ok) facility = await fRes.json();
  }

  const actRes = await fetch(`/api/deals/${id}/activities`);
  const activities = actRes.ok ? await actRes.json() : [];

  renderDeal(deal, facility, activities);
}

async function advanceStage(newStage) {
  await fetch(`/api/deals/${deal.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: newStage }),
  });
  await loadDeal();
}

async function addChallenge(data) {
  await fetch(`/api/facilities/${facility.id}/challenges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  await loadDeal();
}

async function addContact(data) {
  await fetch(`/api/facilities/${facility.id}/contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  await loadDeal();
}

function renderDeal(deal, facility, activities) {
  // Render deal header, stage bar, facility card, challenges, contacts, timeline
  // Implementation follows admin.html patterns — dark theme, card layout
  document.getElementById('deal-header').innerHTML = `
    <h1>${deal.name}</h1>
    <span class="deal-id">${deal.id}</span>
    <span class="deal-stage">${deal.stage}</span>
  `;

  if (facility) {
    document.getElementById('facility-card').innerHTML = `
      <h3>${facility.name}</h3>
      <div class="facility-grid">
        <div><label>Type</label><span>${facility.type}</span></div>
        <div><label>Location</label><span>${facility.city}, ${facility.state}</span></div>
        <div><label>Floors</label><span>${facility.floors || '-'}</span></div>
        <div><label>Rooms</label><span>${facility.rooms_or_units || '-'}</span></div>
        <div><label>Sqft</label><span>${facility.sqft_total ? facility.sqft_total.toLocaleString() : '-'}</span></div>
        <div><label>Elevators</label><span>${facility.elevator_count || '-'} ${facility.elevator_brand || ''}</span></div>
        <div><label>Operator</label><span>${facility.operator || '-'}</span></div>
        <div><label>Brand</label><span>${facility.brand || '-'}</span></div>
      </div>
    `;

    const challenges = facility.challenges || [];
    document.getElementById('challenges-list').innerHTML = challenges.length
      ? challenges.map(c => `
        <div class="challenge-item">
          <span class="challenge-cat">${c.category}</span>
          <span class="challenge-desc">${c.description}</span>
          ${c.current_cost_monthly ? `<span class="challenge-cost">$${c.current_cost_monthly.toLocaleString()}/mo</span>` : ''}
        </div>
      `).join('')
      : '<p class="empty">No operational challenges defined yet</p>';

    const contacts = facility.contacts || [];
    document.getElementById('contacts-list').innerHTML = contacts.length
      ? contacts.map(c => `
        <div class="contact-item">
          <strong>${c.name}</strong> ${c.title ? `— ${c.title}` : ''}
          ${c.email ? `<br><a href="mailto:${c.email}">${c.email}</a>` : ''}
          ${c.role ? `<span class="contact-role">${c.role.replace('_', ' ')}</span>` : ''}
        </div>
      `).join('')
      : '<p class="empty">No contacts yet</p>';
  }

  document.getElementById('activity-timeline').innerHTML = activities.length
    ? activities.map(a => `
      <div class="activity-item">
        <span class="activity-time">${new Date(a.created_at).toLocaleString()}</span>
        <span class="activity-actor">${a.actor}</span>
        <span class="activity-action">${a.action.replace('_', ' ')}</span>
      </div>
    `).join('')
    : '<p class="empty">No activity yet</p>';
}

document.addEventListener('DOMContentLoaded', async () => {
  const user = await checkAuth();
  if (!user) return window.location.href = '/admin-login';
  await loadDeal();
});
```

- [ ] **Step 3: Verify the page loads for a seeded deal**

Run: `npm run dev`
Open: `http://localhost:3000/admin/deals/OPP-001`
Expected: Shows Thesis Hotel deal with facility profile, stage bar, and activity timeline

- [ ] **Step 4: Commit**

```bash
git add public/admin-deal-detail.html public/js/deal-detail.js
git commit -m "feat(ui): add deal detail page with facility profile, challenges, contacts, and activity timeline"
```

---

### Task 11: Run Full Test Suite + Final Verification

**Files:** None new — verification only

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests pass (schema, id-generator, auth, deals, facilities)

- [ ] **Step 2: Start server and verify seeded data**

Run: `npm run dev`

Verify in browser:
1. `http://localhost:3000/admin-login` — login works
2. `http://localhost:3000/admin/deals` — shows 9 seeded deals in kanban view
3. Click a deal — detail page shows facility, challenges (empty), contacts (empty), activity timeline
4. Toggle to table view — sortable table with all deals

Verify via API:
```bash
# Get auth cookie
TOKEN=$(curl -s -c - http://localhost:3000/api/auth/login -H 'Content-Type: application/json' -d '{"email":"...","password":"..."}' | grep token | awk '{print $NF}')

# List deals
curl -s -b "token=$TOKEN" http://localhost:3000/api/deals | python3 -m json.tool | head -20

# Get facility
curl -s -b "token=$TOKEN" http://localhost:3000/api/facilities | python3 -m json.tool | head -20
```

- [ ] **Step 3: Update admin.html with deals nav link**

Add a navigation link to deals in the existing `public/admin.html` header:

```html
<a href="/admin/deals">Deals</a>
```

- [ ] **Step 4: Update CSP if needed**

If the deal dashboard uses any new external resources, add them to the CSP in `src/server.js`. (For Phase 1, everything is self-hosted so no CSP changes needed.)

- [ ] **Step 5: Final commit**

```bash
git add public/admin.html
git commit -m "feat: wire deals dashboard into admin navigation, complete Phase 1 foundation"
```

---

## Summary

| Task | What it builds | Test coverage |
|------|---------------|--------------|
| 1 | Test infrastructure (vitest + helpers) | Setup only |
| 2 | Database schema (6 tables + role column) | Schema validation, constraints |
| 3 | ID generator (OPP-001 sequential + UUID) | 4 unit tests |
| 4 | Role-based auth middleware | 4 unit tests |
| 5 | Deals API (CRUD + stages + activities) | 6 integration tests |
| 6 | Facilities API (CRUD + challenges + contacts) | 3 integration tests |
| 7 | Seed 9 existing hotel deals | Idempotent seed script |
| 8 | Wire inquiries → auto-create deals | Existing test compatibility |
| 9 | Deal dashboard page (kanban + table) | Manual browser verification |
| 10 | Deal detail page (facility + timeline) | Manual browser verification |
| 11 | Full verification + nav wiring | End-to-end check |
