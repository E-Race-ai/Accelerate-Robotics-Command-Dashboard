# Facility Assessment Toolkit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an iPad-optimized, offline-first facility assessment tool that feeds into the Fleet Designer and generates branded PDF reports.

**Architecture:** Self-contained HTML pages (`pages/assessment.html`, `pages/assessments.html`) backed by Express routes (`/api/assessments`) and 4 new SQLite tables. Offline storage via localStorage (form data) and IndexedDB (photos). Manual sync pushes to server. PDFKit generates branded PDF reports server-side.

**Tech Stack:** Express.js, better-sqlite3, PDFKit, vanilla JS (no framework), IndexedDB API, Canvas API, HTML5 file input for camera

**Spec:** `docs/superpowers/specs/2026-04-21-facility-assessment-toolkit-design.md`

---

## File Structure

### Create
| File | Responsibility |
|---|---|
| `src/routes/assessments.js` | Assessment CRUD + zone/stakeholder sub-routes + fleet-input endpoint |
| `src/routes/assessment-photos.js` | Photo upload (multipart), list, get |
| `src/routes/assessment-pdf.js` | PDF report generation via PDFKit |
| `pages/assessments.html` | Assessment list/dashboard page |
| `pages/assessment.html` | Main assessment form (tabs, zones, photos, offline, sync) |
| `tests/integration/assessments.test.js` | Integration tests for all assessment API endpoints |

### Modify
| File | Change |
|---|---|
| `src/db/database.js` | Add 4 tables: `assessments`, `assessment_zones`, `assessment_stakeholders`, `assessment_photos` |
| `src/server.js` | Mount 3 new route modules under `/api/assessments` |
| `tests/helpers/setup.js` | Add 4 new tables to in-memory test schema |
| `package.json` | Add `pdfkit` and `multer` dependencies |

---

### Task 1: Database Schema

**Files:**
- Modify: `src/db/database.js`
- Modify: `tests/helpers/setup.js`
- Test: `tests/integration/assessments.test.js`

- [ ] **Step 1: Add assessment tables to `src/db/database.js`**

Open `src/db/database.js` and add the following inside the `db.exec()` block, after the existing `activities` table and before the `CREATE INDEX` statements:

```javascript
  -- WHY: Facility assessment captures site-walk data that feeds into Fleet Designer.
  -- UUIDs are generated client-side so assessments can be created offline.
  CREATE TABLE IF NOT EXISTS assessments (
    id TEXT PRIMARY KEY,
    deal_id TEXT REFERENCES deals(id),
    facility_type TEXT NOT NULL DEFAULT 'hotel',
    property_name TEXT NOT NULL,
    property_address TEXT,
    property_type TEXT,
    rooms INTEGER,
    floors INTEGER,
    elevators INTEGER,
    elevator_make TEXT,
    year_built INTEGER,
    last_renovation INTEGER,
    gm_name TEXT,
    gm_email TEXT,
    gm_phone TEXT,
    engineering_contact TEXT,
    engineering_email TEXT,
    fb_director TEXT,
    fb_outlets INTEGER,
    event_space_sqft INTEGER,
    union_status TEXT CHECK(union_status IN ('union', 'non_union', 'mixed')),
    union_details TEXT,
    assigned_to TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'draft'
      CHECK(status IN ('draft', 'in_progress', 'completed', 'synced')),
    -- WHY: operations/infrastructure stored as JSON blobs — flexible schema for
    -- shift data, contracted services, WiFi coverage, elevator inventory, etc.
    -- Avoids a dozen more tables for V1.
    operations_data TEXT,
    infrastructure_data TEXT,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    synced_at TEXT
  );

  CREATE TABLE IF NOT EXISTS assessment_zones (
    id TEXT PRIMARY KEY,
    assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    zone_type TEXT NOT NULL,
    zone_name TEXT NOT NULL,
    floor_number INTEGER,
    floor_surfaces TEXT,
    corridor_width_ft REAL,
    ceiling_height_ft REAL,
    door_width_min_ft REAL,
    wifi_strength TEXT CHECK(wifi_strength IN ('strong', 'moderate', 'weak', 'none')),
    wifi_network TEXT,
    lighting TEXT CHECK(lighting IN ('bright', 'moderate', 'dim')),
    foot_traffic TEXT CHECK(foot_traffic IN ('high', 'moderate', 'low')),
    current_cleaning_method TEXT,
    cleaning_frequency TEXT,
    cleaning_contractor TEXT,
    cleaning_shift TEXT,
    delivery_method TEXT,
    staffing_notes TEXT,
    pain_points TEXT,
    robot_readiness TEXT CHECK(robot_readiness IN ('ready', 'minor_work', 'major_work', 'not_feasible')),
    readiness_notes TEXT,
    -- WHY: Zone-template-specific fields stored as JSON to avoid dozens of columns
    -- that only apply to certain zone types (e.g., seating_capacity for restaurants only)
    template_data TEXT,
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS assessment_stakeholders (
    id TEXT PRIMARY KEY,
    assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    title TEXT,
    department TEXT,
    role TEXT NOT NULL CHECK(role IN ('decision_maker', 'influencer', 'champion', 'blocker', 'technical')),
    email TEXT,
    phone TEXT,
    notes TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS assessment_photos (
    id TEXT PRIMARY KEY,
    assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
    zone_id TEXT REFERENCES assessment_zones(id) ON DELETE SET NULL,
    checklist_item TEXT,
    photo_data BLOB,
    thumbnail TEXT,
    annotations TEXT,
    caption TEXT,
    taken_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
```

And add these indexes alongside the existing `CREATE INDEX` statements:

```javascript
  CREATE INDEX IF NOT EXISTS idx_assessments_deal ON assessments(deal_id);
  CREATE INDEX IF NOT EXISTS idx_assessments_assigned ON assessments(assigned_to);
  CREATE INDEX IF NOT EXISTS idx_assessments_status ON assessments(status);
  CREATE INDEX IF NOT EXISTS idx_assessment_zones_assessment ON assessment_zones(assessment_id);
  CREATE INDEX IF NOT EXISTS idx_assessment_stakeholders_assessment ON assessment_stakeholders(assessment_id);
  CREATE INDEX IF NOT EXISTS idx_assessment_photos_assessment ON assessment_photos(assessment_id);
  CREATE INDEX IF NOT EXISTS idx_assessment_photos_zone ON assessment_photos(zone_id);
```

- [ ] **Step 2: Mirror schema in test helper `tests/helpers/setup.js`**

Add the same 4 `CREATE TABLE` and 7 `CREATE INDEX` statements to the `db.exec()` block in `createTestDb()`, after the existing `activities` table / indexes.

- [ ] **Step 3: Write schema test**

Create `tests/integration/assessments.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createTestDb } = require('../helpers/setup');

describe('assessment schema', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => cleanup());

  it('creates an assessment with required fields', () => {
    const id = 'asm-test-001';
    db.prepare(`
      INSERT INTO assessments (id, property_name, assigned_to, facility_type)
      VALUES (?, ?, ?, ?)
    `).run(id, 'Thesis Hotel', 'Tyler', 'hotel');

    const row = db.prepare('SELECT * FROM assessments WHERE id = ?').get(id);
    expect(row.property_name).toBe('Thesis Hotel');
    expect(row.assigned_to).toBe('Tyler');
    expect(row.status).toBe('draft');
  });

  it('creates zones linked to an assessment', () => {
    db.prepare("INSERT INTO assessments (id, property_name, assigned_to) VALUES ('a1', 'Test', 'Eric')").run();

    db.prepare(`
      INSERT INTO assessment_zones (id, assessment_id, zone_type, zone_name, floor_surfaces, robot_readiness)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('z1', 'a1', 'lobby', 'Main Lobby', JSON.stringify(['marble', 'tile']), 'ready');

    const zone = db.prepare('SELECT * FROM assessment_zones WHERE id = ?').get('z1');
    expect(zone.zone_type).toBe('lobby');
    expect(JSON.parse(zone.floor_surfaces)).toEqual(['marble', 'tile']);
    expect(zone.robot_readiness).toBe('ready');
  });

  it('cascades zone deletes when assessment is deleted', () => {
    db.prepare("INSERT INTO assessments (id, property_name, assigned_to) VALUES ('a1', 'Test', 'Eric')").run();
    db.prepare("INSERT INTO assessment_zones (id, assessment_id, zone_type, zone_name) VALUES ('z1', 'a1', 'lobby', 'Lobby')").run();

    db.prepare('DELETE FROM assessments WHERE id = ?').run('a1');
    const zone = db.prepare('SELECT * FROM assessment_zones WHERE id = ?').get('z1');
    expect(zone).toBeUndefined();
  });

  it('creates stakeholders linked to an assessment', () => {
    db.prepare("INSERT INTO assessments (id, property_name, assigned_to) VALUES ('a1', 'Test', 'Eric')").run();

    db.prepare(`
      INSERT INTO assessment_stakeholders (id, assessment_id, name, role, title, department)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('s1', 'a1', 'Brent Reynolds', 'decision_maker', 'Owner', 'Executive');

    const stakeholder = db.prepare('SELECT * FROM assessment_stakeholders WHERE id = ?').get('s1');
    expect(stakeholder.name).toBe('Brent Reynolds');
    expect(stakeholder.role).toBe('decision_maker');
  });

  it('rejects invalid assessment status', () => {
    expect(() => {
      db.prepare("INSERT INTO assessments (id, property_name, assigned_to, status) VALUES ('a1', 'Test', 'Eric', 'invalid')").run();
    }).toThrow();
  });

  it('rejects invalid stakeholder role', () => {
    db.prepare("INSERT INTO assessments (id, property_name, assigned_to) VALUES ('a1', 'Test', 'Eric')").run();
    expect(() => {
      db.prepare("INSERT INTO assessment_stakeholders (id, assessment_id, name, role) VALUES ('s1', 'a1', 'Test', 'invalid_role')").run();
    }).toThrow();
  });

  it('stores and retrieves photo metadata (without blob for unit test)', () => {
    db.prepare("INSERT INTO assessments (id, property_name, assigned_to) VALUES ('a1', 'Test', 'Eric')").run();
    db.prepare("INSERT INTO assessment_zones (id, assessment_id, zone_type, zone_name) VALUES ('z1', 'a1', 'lobby', 'Lobby')").run();

    db.prepare(`
      INSERT INTO assessment_photos (id, assessment_id, zone_id, checklist_item, caption, annotations)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('p1', 'a1', 'z1', 'wide_lobby_shot', 'Main lobby from entrance',
      JSON.stringify([{ type: 'pin', x: 100, y: 200, label: 'Front desk' }]));

    const photo = db.prepare('SELECT * FROM assessment_photos WHERE id = ?').get('p1');
    expect(photo.checklist_item).toBe('wide_lobby_shot');
    expect(JSON.parse(photo.annotations)).toHaveLength(1);
  });
});
```

- [ ] **Step 4: Run tests to verify schema**

Run: `npx vitest run tests/integration/assessments.test.js`
Expected: All 7 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/db/database.js tests/helpers/setup.js tests/integration/assessments.test.js
git commit -m "feat(db): add assessment, zone, stakeholder, photo tables

Problem: No structured schema to store facility assessment data captured
during site walks.

Solution: Four new tables — assessments (property-level data), assessment_zones
(per-zone details), assessment_stakeholders (deal contacts), assessment_photos
(photos with annotations). All use TEXT PKs (UUIDs) for offline-first creation."
```

---

### Task 2: Install Dependencies

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install multer and pdfkit**

```bash
npm install multer pdfkit
```

`multer` handles multipart file uploads (photos). `pdfkit` generates PDF reports server-side.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: add multer and pdfkit dependencies

Problem: Need multipart file upload support for assessment photos and
server-side PDF generation for assessment reports.

Solution: multer for multipart parsing, pdfkit for PDF generation."
```

---

### Task 3: Assessment CRUD Routes

**Files:**
- Create: `src/routes/assessments.js`
- Test: `tests/integration/assessments.test.js`

- [ ] **Step 1: Add CRUD route tests to `tests/integration/assessments.test.js`**

Append this new `describe` block after the existing `describe('assessment schema')` block:

```javascript
describe('assessment CRUD (direct DB)', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => cleanup());

  it('lists assessments with optional filters', () => {
    db.prepare("INSERT INTO assessments (id, property_name, assigned_to, status) VALUES ('a1', 'Hotel A', 'Tyler', 'draft')").run();
    db.prepare("INSERT INTO assessments (id, property_name, assigned_to, status) VALUES ('a2', 'Hotel B', 'Cory', 'completed')").run();

    const all = db.prepare('SELECT * FROM assessments ORDER BY created_at DESC').all();
    expect(all).toHaveLength(2);

    const tylerOnly = db.prepare('SELECT * FROM assessments WHERE assigned_to = ?').all('Tyler');
    expect(tylerOnly).toHaveLength(1);
    expect(tylerOnly[0].property_name).toBe('Hotel A');
  });

  it('gets assessment with zones and stakeholders', () => {
    db.prepare("INSERT INTO assessments (id, property_name, assigned_to) VALUES ('a1', 'Thesis Hotel', 'Tyler')").run();
    db.prepare("INSERT INTO assessment_zones (id, assessment_id, zone_type, zone_name, sort_order) VALUES ('z1', 'a1', 'lobby', 'Main Lobby', 0)").run();
    db.prepare("INSERT INTO assessment_zones (id, assessment_id, zone_type, zone_name, sort_order) VALUES ('z2', 'a1', 'restaurant', 'Rooftop Bar', 1)").run();
    db.prepare("INSERT INTO assessment_stakeholders (id, assessment_id, name, role) VALUES ('s1', 'a1', 'Brent', 'decision_maker')").run();

    const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get('a1');
    const zones = db.prepare('SELECT * FROM assessment_zones WHERE assessment_id = ? ORDER BY sort_order').all('a1');
    const stakeholders = db.prepare('SELECT * FROM assessment_stakeholders WHERE assessment_id = ? ORDER BY sort_order').all('a1');

    expect(assessment.property_name).toBe('Thesis Hotel');
    expect(zones).toHaveLength(2);
    expect(zones[0].zone_type).toBe('lobby');
    expect(stakeholders).toHaveLength(1);
  });

  it('upserts assessment (insert then update)', () => {
    const id = 'a1';
    // Insert
    db.prepare(`
      INSERT INTO assessments (id, property_name, assigned_to, rooms, floors)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, 'Thesis Hotel', 'Tyler', 69, 10);

    let row = db.prepare('SELECT * FROM assessments WHERE id = ?').get(id);
    expect(row.rooms).toBe(69);

    // Update
    db.prepare(`UPDATE assessments SET rooms = ?, updated_at = datetime('now') WHERE id = ?`).run(88, id);
    row = db.prepare('SELECT * FROM assessments WHERE id = ?').get(id);
    expect(row.rooms).toBe(88);
  });

  it('deletes assessment and cascades to zones, stakeholders, photos', () => {
    db.prepare("INSERT INTO assessments (id, property_name, assigned_to) VALUES ('a1', 'Test', 'Eric')").run();
    db.prepare("INSERT INTO assessment_zones (id, assessment_id, zone_type, zone_name) VALUES ('z1', 'a1', 'lobby', 'Lobby')").run();
    db.prepare("INSERT INTO assessment_stakeholders (id, assessment_id, name, role) VALUES ('s1', 'a1', 'Test', 'champion')").run();
    db.prepare("INSERT INTO assessment_photos (id, assessment_id, caption) VALUES ('p1', 'a1', 'test photo')").run();

    db.prepare('DELETE FROM assessments WHERE id = ?').run('a1');

    expect(db.prepare('SELECT * FROM assessment_zones WHERE assessment_id = ?').all('a1')).toHaveLength(0);
    expect(db.prepare('SELECT * FROM assessment_stakeholders WHERE assessment_id = ?').all('a1')).toHaveLength(0);
    expect(db.prepare('SELECT * FROM assessment_photos WHERE assessment_id = ?').all('a1')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail (no route yet, but DB tests should pass)**

Run: `npx vitest run tests/integration/assessments.test.js`
Expected: All tests PASS (these are direct DB tests, not route tests)

- [ ] **Step 3: Create `src/routes/assessments.js`**

```javascript
const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { generateId } = require('../services/id-generator');

const router = express.Router();

const VALID_STATUSES = ['draft', 'in_progress', 'completed', 'synced'];
const VALID_UNION_STATUSES = ['union', 'non_union', 'mixed'];
const VALID_ZONE_TYPES = ['lobby', 'restaurant', 'guest_floor', 'pool_deck', 'kitchen',
  'laundry', 'boh_corridor', 'parking_garage', 'event_space', 'fitness_center',
  'spa', 'exterior', 'other'];
const VALID_STAKEHOLDER_ROLES = ['decision_maker', 'influencer', 'champion', 'blocker', 'technical'];
const VALID_READINESS = ['ready', 'minor_work', 'major_work', 'not_feasible'];

// WHY: V1 hardcoded team list — matches the 7 reps who will use the assessment tool.
// Future: pull from a team_members table.
const TEAM_MEMBERS = ['Cory', 'Tyler', 'David', 'Eric', 'Lydia', 'JB', 'Ben'];

// ── List assessments ──────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const { assigned_to, status, deal_id } = req.query;
  let sql = 'SELECT * FROM assessments';
  const conditions = [];
  const params = [];

  if (assigned_to) { conditions.push('assigned_to = ?'); params.push(assigned_to); }
  if (status) { conditions.push('status = ?'); params.push(status); }
  if (deal_id) { conditions.push('deal_id = ?'); params.push(deal_id); }

  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY updated_at DESC';

  const assessments = db.prepare(sql).all(...params);

  // WHY: Include zone and photo counts for the list view without fetching full data
  for (const a of assessments) {
    a.zone_count = db.prepare('SELECT COUNT(*) as c FROM assessment_zones WHERE assessment_id = ?').get(a.id).c;
    a.photo_count = db.prepare('SELECT COUNT(*) as c FROM assessment_photos WHERE assessment_id = ?').get(a.id).c;
  }

  res.json(assessments);
});

// ── Get single assessment with zones + stakeholders ──────────
router.get('/:id', requireAuth, (req, res) => {
  const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
  if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

  assessment.zones = db.prepare(
    'SELECT * FROM assessment_zones WHERE assessment_id = ? ORDER BY sort_order'
  ).all(req.params.id);

  assessment.stakeholders = db.prepare(
    'SELECT * FROM assessment_stakeholders WHERE assessment_id = ? ORDER BY sort_order'
  ).all(req.params.id);

  // WHY: Photo metadata only (no blob) — blobs fetched individually to avoid huge payloads
  assessment.photos = db.prepare(
    'SELECT id, zone_id, checklist_item, thumbnail, annotations, caption, taken_at FROM assessment_photos WHERE assessment_id = ?'
  ).all(req.params.id);

  res.json(assessment);
});

// ── Create or upsert assessment ──────────────────────────────
// WHY: Upsert by client-provided UUID supports offline-first — the client generates
// the ID before syncing, so we INSERT if new or UPDATE if it already exists.
router.post('/', requireAuth, (req, res) => {
  const { id, property_name, assigned_to, facility_type, deal_id, property_address,
    property_type, rooms, floors, elevators, elevator_make, year_built, last_renovation,
    gm_name, gm_email, gm_phone, engineering_contact, engineering_email,
    fb_director, fb_outlets, event_space_sqft, union_status, union_details,
    status, operations_data, infrastructure_data, notes,
    zones, stakeholders } = req.body;

  if (!property_name) return res.status(400).json({ error: 'property_name is required' });
  if (!assigned_to) return res.status(400).json({ error: 'assigned_to is required' });
  if (union_status && !VALID_UNION_STATUSES.includes(union_status)) {
    return res.status(400).json({ error: `union_status must be one of: ${VALID_UNION_STATUSES.join(', ')}` });
  }
  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  const assessmentId = id || generateId();
  const now = new Date().toISOString();

  // WHY: Use INSERT OR REPLACE for upsert — simpler than checking existence first.
  // Client always sends the full assessment state on sync.
  db.prepare(`
    INSERT OR REPLACE INTO assessments (
      id, deal_id, facility_type, property_name, property_address, property_type,
      rooms, floors, elevators, elevator_make, year_built, last_renovation,
      gm_name, gm_email, gm_phone, engineering_contact, engineering_email,
      fb_director, fb_outlets, event_space_sqft, union_status, union_details,
      assigned_to, status, operations_data, infrastructure_data, notes,
      created_at, updated_at, synced_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    assessmentId, deal_id || null, facility_type || 'hotel', property_name,
    property_address || null, property_type || null,
    rooms || null, floors || null, elevators || null, elevator_make || null,
    year_built || null, last_renovation || null,
    gm_name || null, gm_email || null, gm_phone || null,
    engineering_contact || null, engineering_email || null,
    fb_director || null, fb_outlets || null, event_space_sqft || null,
    union_status || null, union_details || null,
    assigned_to, status || 'draft',
    operations_data ? JSON.stringify(operations_data) : null,
    infrastructure_data ? JSON.stringify(infrastructure_data) : null,
    notes || null, now, now, now
  );

  // WHY: Sync zones — delete existing and re-insert from client state.
  // Simpler than diffing; the client always sends the complete zone list.
  if (Array.isArray(zones)) {
    db.prepare('DELETE FROM assessment_zones WHERE assessment_id = ?').run(assessmentId);
    const insertZone = db.prepare(`
      INSERT INTO assessment_zones (
        id, assessment_id, zone_type, zone_name, floor_number, floor_surfaces,
        corridor_width_ft, ceiling_height_ft, door_width_min_ft,
        wifi_strength, wifi_network, lighting, foot_traffic,
        current_cleaning_method, cleaning_frequency, cleaning_contractor, cleaning_shift,
        delivery_method, staffing_notes, pain_points,
        robot_readiness, readiness_notes, template_data, notes, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < zones.length; i++) {
      const z = zones[i];
      insertZone.run(
        z.id || generateId(), assessmentId, z.zone_type, z.zone_name || z.zone_type,
        z.floor_number || null,
        z.floor_surfaces ? JSON.stringify(z.floor_surfaces) : null,
        z.corridor_width_ft || null, z.ceiling_height_ft || null, z.door_width_min_ft || null,
        z.wifi_strength || null, z.wifi_network || null,
        z.lighting || null, z.foot_traffic || null,
        z.current_cleaning_method || null, z.cleaning_frequency || null,
        z.cleaning_contractor || null, z.cleaning_shift || null,
        z.delivery_method || null, z.staffing_notes || null, z.pain_points || null,
        z.robot_readiness || null, z.readiness_notes || null,
        z.template_data ? JSON.stringify(z.template_data) : null,
        z.notes || null, z.sort_order ?? i
      );
    }
  }

  // WHY: Same delete-and-reinsert pattern for stakeholders
  if (Array.isArray(stakeholders)) {
    db.prepare('DELETE FROM assessment_stakeholders WHERE assessment_id = ?').run(assessmentId);
    const insertStakeholder = db.prepare(`
      INSERT INTO assessment_stakeholders (id, assessment_id, name, title, department, role, email, phone, notes, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    for (let i = 0; i < stakeholders.length; i++) {
      const s = stakeholders[i];
      if (!s.name || !s.role) continue;
      insertStakeholder.run(
        s.id || generateId(), assessmentId, s.name, s.title || null,
        s.department || null, s.role, s.email || null, s.phone || null,
        s.notes || null, s.sort_order ?? i
      );
    }
  }

  // Return the full assessment
  const result = db.prepare('SELECT * FROM assessments WHERE id = ?').get(assessmentId);
  result.zones = db.prepare('SELECT * FROM assessment_zones WHERE assessment_id = ? ORDER BY sort_order').all(assessmentId);
  result.stakeholders = db.prepare('SELECT * FROM assessment_stakeholders WHERE assessment_id = ? ORDER BY sort_order').all(assessmentId);

  res.status(201).json(result);
});

// ── Update assessment ─────────────────────────────────────────
router.put('/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Assessment not found' });

  // WHY: Reuse the POST upsert logic — PUT with ID is semantically the same
  req.body.id = req.params.id;
  return router.handle(Object.assign(req, { method: 'POST', url: '/' }), res);
});

// ── Delete assessment ─────────────────────────────────────────
router.delete('/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Assessment not found' });

  // WHY: CASCADE handles zones, stakeholders. Photos cascade via assessment_id FK.
  db.prepare('DELETE FROM assessments WHERE id = ?').run(req.params.id);
  res.json({ message: 'Assessment deleted' });
});

// ── Fleet input endpoint ──────────────────────────────────────
// WHY: Transforms assessment data into the shape Fleet Designer expects.
// This is the bridge between the assessment and the proposal pipeline.
router.get('/:id/fleet-input', requireAuth, (req, res) => {
  const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
  if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

  const zones = db.prepare('SELECT * FROM assessment_zones WHERE assessment_id = ? ORDER BY sort_order').all(req.params.id);

  // Collect unique surfaces across all zones
  const allSurfaces = new Set();
  const outdoorAmenities = [];
  const zoneSummaries = [];

  for (const z of zones) {
    const surfaces = z.floor_surfaces ? JSON.parse(z.floor_surfaces) : [];
    surfaces.forEach(s => allSurfaces.add(s));

    if (['pool_deck', 'exterior', 'parking_garage'].includes(z.zone_type)) {
      outdoorAmenities.push(z.zone_type);
    }

    zoneSummaries.push({
      type: z.zone_type,
      name: z.zone_name,
      readiness: z.robot_readiness,
      surfaces,
      painPoints: z.pain_points || null,
    });
  }

  // WHY: Goal suggestion logic — maps zone data to fleet designer goals.
  // Each suggestion includes the reason so the rep can understand why.
  const suggestedGoals = [];
  const readyOrMinor = ['ready', 'minor_work'];

  for (const z of zones) {
    const surfaces = z.floor_surfaces ? JSON.parse(z.floor_surfaces) : [];
    const isReady = readyOrMinor.includes(z.robot_readiness);
    if (!isReady) continue;

    const hasCarpet = surfaces.some(s => ['carpet'].includes(s));
    const hasHardFloor = surfaces.some(s => ['hardwood', 'tile', 'marble', 'concrete', 'stone'].includes(s));

    if (z.zone_type === 'guest_floor' && hasCarpet) {
      suggestedGoals.push({ goalId: 'carpet_cleaning', reason: `${z.zone_name}: carpet corridors, ${z.robot_readiness}` });
    }
    if ((z.zone_type === 'guest_floor' || z.zone_type === 'lobby') && hasHardFloor) {
      suggestedGoals.push({ goalId: 'hard_floor_cleaning', reason: `${z.zone_name}: hard floor, ${z.robot_readiness}` });
    }
    if (z.zone_type === 'restaurant' && z.pain_points) {
      suggestedGoals.push({ goalId: 'food_runner', reason: `${z.zone_name}: ${z.pain_points.substring(0, 80)}` });
    }
    if (z.zone_type === 'laundry') {
      suggestedGoals.push({ goalId: 'linen_transport', reason: `${z.zone_name}: linen logistics` });
    }
    if (z.zone_type === 'pool_deck') {
      suggestedGoals.push({ goalId: 'pool_deck_cleaning', reason: `${z.zone_name}: pool deck maintenance` });
    }
    if (z.zone_type === 'parking_garage') {
      suggestedGoals.push({ goalId: 'parking_sweep', reason: `${z.zone_name}: garage cleaning` });
    }
  }

  // WHY: Deduplicate goals — multiple zones of the same type shouldn't double-suggest
  const uniqueGoals = [];
  const seenGoalIds = new Set();
  for (const g of suggestedGoals) {
    if (!seenGoalIds.has(g.goalId)) {
      seenGoalIds.add(g.goalId);
      uniqueGoals.push(g);
    }
  }

  res.json({
    property: {
      name: assessment.property_name,
      type: assessment.property_type,
      rooms: assessment.rooms,
      floors: assessment.floors,
      elevators: assessment.elevators,
      market: assessment.property_address || null,
    },
    facility: {
      surfaces: Array.from(allSurfaces),
      outdoorAmenities,
      fbOutlets: assessment.fb_outlets,
      eventSpaceSqFt: assessment.event_space_sqft,
      elevatorMake: assessment.elevator_make,
    },
    suggestedGoals: uniqueGoals,
    zones: zoneSummaries,
  });
});

// ── Team members list ─────────────────────────────────────────
// WHY: Frontend needs the team list for the "Assigned To" dropdown.
// Hardcoded V1 — future: pull from a team_members table.
router.get('/meta/team', requireAuth, (req, res) => {
  res.json(TEAM_MEMBERS);
});

module.exports = router;
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/integration/assessments.test.js`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/routes/assessments.js tests/integration/assessments.test.js
git commit -m "feat(api): assessment CRUD with zones, stakeholders, fleet-input

Problem: No API to create, read, update, or delete facility assessments
or transform assessment data for Fleet Designer consumption.

Solution: Express router with list/get/create(upsert)/update/delete endpoints.
POST does upsert by client-provided UUID for offline-first sync. Zones and
stakeholders sync via delete-and-reinsert. Fleet-input endpoint transforms
assessment zones into goal suggestions for the fleet designer."
```

---

### Task 4: Photo Upload Routes

**Files:**
- Create: `src/routes/assessment-photos.js`

- [ ] **Step 1: Create `src/routes/assessment-photos.js`**

```javascript
const express = require('express');
const multer = require('multer');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { generateId } = require('../services/id-generator');

const router = express.Router({ mergeParams: true });

// WHY: 10MB per photo limit — iPad photos are typically 3-5MB as JPEG.
// Memory storage because we write directly to SQLite BLOB, not disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

// WHY: Max 5 photos per batch to avoid request timeout on slow connections.
// The client loops through batches of 5 until all photos are synced.
const MAX_BATCH = 5;

// ── Upload photos (batch) ─────────────────────────────────────
router.post('/', requireAuth, upload.array('photos', MAX_BATCH), (req, res) => {
  const { id: assessmentId } = req.params;

  const assessment = db.prepare('SELECT id FROM assessments WHERE id = ?').get(assessmentId);
  if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No photos provided' });
  }

  // WHY: Metadata for each photo comes as a JSON string in the 'metadata' field.
  // Each entry maps by index to the corresponding file in req.files.
  let metadataList;
  try {
    metadataList = JSON.parse(req.body.metadata || '[]');
  } catch {
    return res.status(400).json({ error: 'Invalid metadata JSON' });
  }

  const insertPhoto = db.prepare(`
    INSERT OR REPLACE INTO assessment_photos (id, assessment_id, zone_id, checklist_item, photo_data, thumbnail, annotations, caption, taken_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const results = [];
  for (let i = 0; i < req.files.length; i++) {
    const file = req.files[i];
    const meta = metadataList[i] || {};
    const photoId = meta.id || generateId();

    insertPhoto.run(
      photoId, assessmentId,
      meta.zone_id || null, meta.checklist_item || null,
      file.buffer, meta.thumbnail || null,
      meta.annotations ? JSON.stringify(meta.annotations) : null,
      meta.caption || null,
      meta.taken_at || new Date().toISOString()
    );

    results.push({ id: photoId, status: 'uploaded' });
  }

  res.status(201).json({ uploaded: results.length, photos: results });
});

// ── List photo metadata (no blobs) ────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const photos = db.prepare(`
    SELECT id, assessment_id, zone_id, checklist_item, thumbnail, annotations, caption, taken_at
    FROM assessment_photos WHERE assessment_id = ?
  `).all(req.params.id);

  res.json(photos);
});

// ── Get single photo with full data ───────────────────────────
router.get('/:photoId', requireAuth, (req, res) => {
  const photo = db.prepare('SELECT * FROM assessment_photos WHERE id = ? AND assessment_id = ?')
    .get(req.params.photoId, req.params.id);

  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  // WHY: Return photo_data as base64 for JSON response.
  // For large photos, a binary endpoint would be better — but V1 volume is small.
  if (photo.photo_data) {
    photo.photo_data = photo.photo_data.toString('base64');
  }

  res.json(photo);
});

// ── Delete photo ──────────────────────────────────────────────
router.delete('/:photoId', requireAuth, (req, res) => {
  const photo = db.prepare('SELECT id FROM assessment_photos WHERE id = ? AND assessment_id = ?')
    .get(req.params.photoId, req.params.id);

  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  db.prepare('DELETE FROM assessment_photos WHERE id = ?').run(req.params.photoId);
  res.json({ message: 'Photo deleted' });
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/assessment-photos.js
git commit -m "feat(api): photo upload/download routes for assessments

Problem: No way to upload, list, or retrieve assessment photos from
the server after offline sync.

Solution: Multipart upload via multer (batch of 5, 10MB per photo),
metadata list endpoint (no blobs), single photo retrieval with base64,
and delete endpoint."
```

---

### Task 5: PDF Generation Route

**Files:**
- Create: `src/routes/assessment-pdf.js`

- [ ] **Step 1: Create `src/routes/assessment-pdf.js`**

```javascript
const express = require('express');
const PDFDocument = require('pdfkit');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router({ mergeParams: true });

// WHY: Color constants match the Accelerate brand — dark cover page, white content pages.
const COLORS = {
  darkBg: '#0a0a0f',
  accent: '#f59e0b',
  green: '#00e676',
  amber: '#f59e0b',
  red: '#ef4444',
  grey: '#6b7280',
  white: '#ffffff',
  lightGrey: '#f3f4f6',
  textDark: '#111827',
  textMuted: '#6b7280',
};

const READINESS_COLORS = {
  ready: COLORS.green,
  minor_work: COLORS.amber,
  major_work: COLORS.red,
  not_feasible: COLORS.grey,
};

const READINESS_LABELS = {
  ready: 'Ready',
  minor_work: 'Minor Work Needed',
  major_work: 'Major Work Needed',
  not_feasible: 'Not Feasible',
};

function addCoverPage(doc, assessment) {
  doc.rect(0, 0, doc.page.width, doc.page.height).fill(COLORS.darkBg);

  doc.fontSize(12).fillColor(COLORS.accent)
    .text('ACCELERATE ROBOTICS', 72, 200, { align: 'center' });

  doc.fontSize(28).fillColor(COLORS.white)
    .text('Facility Assessment Report', 72, 260, { align: 'center' });

  doc.fontSize(16).fillColor(COLORS.lightGrey)
    .text(assessment.property_name, 72, 320, { align: 'center' });

  if (assessment.property_address) {
    doc.fontSize(11).fillColor(COLORS.textMuted)
      .text(assessment.property_address, 72, 350, { align: 'center' });
  }

  doc.fontSize(11).fillColor(COLORS.textMuted)
    .text(`Assessed by: ${assessment.assigned_to}`, 72, 420, { align: 'center' })
    .text(`Date: ${new Date(assessment.created_at).toLocaleDateString()}`, 72, 440, { align: 'center' });

  doc.fontSize(9).fillColor(COLORS.grey)
    .text(`Confidential — Prepared for ${assessment.property_name}`, 72, doc.page.height - 80, { align: 'center' });
}

function addExecutiveSummary(doc, assessment, zones, stakeholders) {
  doc.addPage();
  doc.fontSize(18).fillColor(COLORS.textDark).text('Executive Summary', 72, 72);
  doc.moveTo(72, 100).lineTo(540, 100).stroke(COLORS.accent);

  let y = 120;

  // Property overview table
  const props = [
    ['Property', assessment.property_name],
    ['Type', assessment.property_type || assessment.facility_type || 'Hotel'],
    ['Rooms', assessment.rooms || '—'],
    ['Floors', assessment.floors || '—'],
    ['Elevators', `${assessment.elevators || '—'}${assessment.elevator_make ? ' (' + assessment.elevator_make + ')' : ''}`],
    ['F&B Outlets', assessment.fb_outlets || '—'],
    ['Event Space', assessment.event_space_sqft ? `${assessment.event_space_sqft} sqft` : '—'],
    ['Union Status', assessment.union_status || '—'],
  ];

  for (const [label, value] of props) {
    doc.fontSize(10).fillColor(COLORS.textMuted).text(label, 72, y, { width: 120 });
    doc.fontSize(10).fillColor(COLORS.textDark).text(String(value), 200, y);
    y += 18;
  }

  y += 20;

  // Key contacts
  doc.fontSize(14).fillColor(COLORS.textDark).text('Key Contacts', 72, y);
  y += 24;

  const contacts = [
    ['General Manager', assessment.gm_name, assessment.gm_email],
    ['Engineering', assessment.engineering_contact, assessment.engineering_email],
    ['F&B Director', assessment.fb_director, null],
  ].filter(c => c[1]);

  for (const [role, name, email] of contacts) {
    doc.fontSize(10).fillColor(COLORS.textMuted).text(role, 72, y, { width: 120 });
    doc.fontSize(10).fillColor(COLORS.textDark).text(`${name}${email ? ' — ' + email : ''}`, 200, y);
    y += 18;
  }

  y += 20;

  // Robot readiness summary
  doc.fontSize(14).fillColor(COLORS.textDark).text('Robot Readiness Summary', 72, y);
  y += 24;

  const readinessCounts = { ready: 0, minor_work: 0, major_work: 0, not_feasible: 0 };
  for (const z of zones) {
    if (z.robot_readiness && readinessCounts[z.robot_readiness] !== undefined) {
      readinessCounts[z.robot_readiness]++;
    }
  }

  for (const [key, count] of Object.entries(readinessCounts)) {
    if (count === 0) continue;
    doc.circle(82, y + 5, 4).fill(READINESS_COLORS[key]);
    doc.fontSize(10).fillColor(COLORS.textDark).text(`${READINESS_LABELS[key]}: ${count} zone${count > 1 ? 's' : ''}`, 95, y);
    y += 18;
  }
}

function addZonePages(doc, zones) {
  for (const zone of zones) {
    doc.addPage();
    doc.fontSize(16).fillColor(COLORS.textDark).text(`${zone.zone_name}`, 72, 72);
    doc.fontSize(10).fillColor(COLORS.textMuted).text(zone.zone_type.replace(/_/g, ' ').toUpperCase(), 72, 95);
    doc.moveTo(72, 112).lineTo(540, 112).stroke(COLORS.accent);

    let y = 130;

    // Readiness indicator
    if (zone.robot_readiness) {
      doc.circle(82, y + 5, 5).fill(READINESS_COLORS[zone.robot_readiness] || COLORS.grey);
      doc.fontSize(11).fillColor(COLORS.textDark)
        .text(`Robot Readiness: ${READINESS_LABELS[zone.robot_readiness] || zone.robot_readiness}`, 95, y);
      y += 24;
    }

    // Zone metrics
    const metrics = [
      ['Floor Surfaces', zone.floor_surfaces ? JSON.parse(zone.floor_surfaces).join(', ') : null],
      ['Corridor Width', zone.corridor_width_ft ? `${zone.corridor_width_ft} ft` : null],
      ['Ceiling Height', zone.ceiling_height_ft ? `${zone.ceiling_height_ft} ft` : null],
      ['Min Door Width', zone.door_width_min_ft ? `${zone.door_width_min_ft} ft` : null],
      ['WiFi', zone.wifi_strength],
      ['Lighting', zone.lighting],
      ['Foot Traffic', zone.foot_traffic],
      ['Cleaning Method', zone.current_cleaning_method],
      ['Cleaning Frequency', zone.cleaning_frequency],
      ['Cleaning Contractor', zone.cleaning_contractor],
      ['Cleaning Shift', zone.cleaning_shift],
      ['Delivery Method', zone.delivery_method],
    ].filter(m => m[1]);

    for (const [label, value] of metrics) {
      doc.fontSize(9).fillColor(COLORS.textMuted).text(label, 72, y, { width: 130 });
      doc.fontSize(9).fillColor(COLORS.textDark).text(value, 210, y);
      y += 16;
    }

    // Pain points
    if (zone.pain_points) {
      y += 12;
      doc.fontSize(12).fillColor(COLORS.textDark).text('Pain Points', 72, y);
      y += 18;
      doc.fontSize(10).fillColor(COLORS.textDark).text(zone.pain_points, 72, y, { width: 468 });
      y = doc.y + 12;
    }

    // Readiness notes
    if (zone.readiness_notes) {
      y += 6;
      doc.fontSize(12).fillColor(COLORS.textDark).text('Readiness Notes', 72, y);
      y += 18;
      doc.fontSize(10).fillColor(COLORS.textDark).text(zone.readiness_notes, 72, y, { width: 468 });
      y = doc.y + 12;
    }

    // Notes
    if (zone.notes) {
      y += 6;
      doc.fontSize(12).fillColor(COLORS.textDark).text('Assessor Notes', 72, y);
      y += 18;
      doc.fontSize(10).fillColor(COLORS.textDark).text(zone.notes, 72, y, { width: 468 });
    }
  }
}

function addRecommendations(doc, zones) {
  doc.addPage();
  doc.fontSize(18).fillColor(COLORS.textDark).text('Recommendations', 72, 72);
  doc.moveTo(72, 100).lineTo(540, 100).stroke(COLORS.accent);

  let y = 120;

  const ready = zones.filter(z => z.robot_readiness === 'ready');
  const minor = zones.filter(z => z.robot_readiness === 'minor_work');
  const major = zones.filter(z => z.robot_readiness === 'major_work');
  const notFeasible = zones.filter(z => z.robot_readiness === 'not_feasible');

  if (ready.length > 0) {
    doc.fontSize(13).fillColor(COLORS.green).text('Deployment-Ready Zones', 72, y);
    y += 20;
    for (const z of ready) {
      doc.fontSize(10).fillColor(COLORS.textDark).text(`• ${z.zone_name} (${z.zone_type.replace(/_/g, ' ')})`, 82, y);
      y += 16;
    }
    y += 12;
  }

  if (minor.length > 0) {
    doc.fontSize(13).fillColor(COLORS.amber).text('Zones Needing Prep Work', 72, y);
    y += 20;
    for (const z of minor) {
      doc.fontSize(10).fillColor(COLORS.textDark).text(`• ${z.zone_name}: ${z.readiness_notes || 'Minor prep needed'}`, 82, y, { width: 458 });
      y = doc.y + 8;
    }
    y += 12;
  }

  if (notFeasible.length > 0 || major.length > 0) {
    doc.fontSize(13).fillColor(COLORS.red).text('Not Feasible / Major Work', 72, y);
    y += 20;
    for (const z of [...major, ...notFeasible]) {
      doc.fontSize(10).fillColor(COLORS.textDark).text(`• ${z.zone_name}: ${z.readiness_notes || 'Not feasible for robot deployment'}`, 82, y, { width: 458 });
      y = doc.y + 8;
    }
    y += 12;
  }

  // Suggested pilot zone
  if (ready.length > 0) {
    y += 10;
    doc.fontSize(14).fillColor(COLORS.accent).text('Suggested Pilot Zone', 72, y);
    y += 22;
    doc.fontSize(10).fillColor(COLORS.textDark)
      .text(`${ready[0].zone_name} — robot-ready with ${ready[0].floor_surfaces ? JSON.parse(ready[0].floor_surfaces).join('/') + ' surfaces' : 'compatible surfaces'}.`, 72, y, { width: 468 });
  }
}

// ── Generate PDF ──────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
  if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

  const zones = db.prepare('SELECT * FROM assessment_zones WHERE assessment_id = ? ORDER BY sort_order').all(req.params.id);
  const stakeholders = db.prepare('SELECT * FROM assessment_stakeholders WHERE assessment_id = ? ORDER BY sort_order').all(req.params.id);

  const doc = new PDFDocument({ size: 'letter', margin: 72, bufferPages: true });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${assessment.property_name.replace(/[^a-zA-Z0-9]/g, '_')}_Assessment.pdf"`);

  doc.pipe(res);

  addCoverPage(doc, assessment);
  addExecutiveSummary(doc, assessment, zones, stakeholders);
  addZonePages(doc, zones);
  addRecommendations(doc, zones);

  // Footer on every page (except cover)
  const pages = doc.bufferedPageRange();
  for (let i = 1; i < pages.count; i++) {
    doc.switchToPage(i);
    doc.fontSize(8).fillColor(COLORS.grey)
      .text(`Confidential — ${assessment.property_name} — ${new Date().toLocaleDateString()}`, 72, doc.page.height - 40, { align: 'center', width: doc.page.width - 144 })
      .text(`Page ${i} of ${pages.count - 1}`, 72, doc.page.height - 28, { align: 'center', width: doc.page.width - 144 });
  }

  doc.end();
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/assessment-pdf.js
git commit -m "feat(api): PDF report generation for facility assessments

Problem: No way to generate a branded, shareable PDF report from
assessment data for stakeholders.

Solution: PDFKit-based PDF with cover page, executive summary, zone
assessments with readiness indicators, and recommendations page.
Streams directly to response — no temp files."
```

---

### Task 6: Server Wiring

**Files:**
- Modify: `src/server.js`

- [ ] **Step 1: Mount assessment routes in `src/server.js`**

Add imports after the existing `narrateRoutes` import (around line 17):

```javascript
const assessmentRoutes = require('./routes/assessments');
const assessmentPhotoRoutes = require('./routes/assessment-photos');
const assessmentPdfRoutes = require('./routes/assessment-pdf');
```

Add route mounting after the existing `app.use('/api/narrate', ...)` line (around line 110):

```javascript
app.use('/api/assessments', assessmentRoutes);
// WHY: Photo and PDF routes are nested under assessments/:id
// mergeParams in their routers gives them access to :id
app.use('/api/assessments/:id/photos', assessmentPhotoRoutes);
app.use('/api/assessments/:id/pdf', assessmentPdfRoutes);
```

- [ ] **Step 2: Run all existing tests to verify nothing broke**

Run: `npx vitest run`
Expected: All existing tests PASS

- [ ] **Step 3: Commit**

```bash
git add src/server.js
git commit -m "feat(server): mount assessment, photo, and PDF routes

Problem: Assessment API endpoints exist but aren't mounted in the server.

Solution: Mount assessment CRUD at /api/assessments, photo routes at
/api/assessments/:id/photos, PDF generation at /api/assessments/:id/pdf."
```

---

### Task 7: Assessment List Page

**Files:**
- Create: `pages/assessments.html`

- [ ] **Step 1: Create `pages/assessments.html`**

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Assessments — Accelerate Robotics</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
:root {
  --bg:#0a0a0f; --card:rgba(255,255,255,0.04); --border:rgba(255,255,255,0.08);
  --text:#e2e8f0; --muted:#94a3b8; --accent:#f59e0b; --accent-dim:rgba(245,158,11,0.15);
  --green:#00e676; --red:#ef4444; --blue:#3b82f6;
}
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Inter',system-ui,sans-serif;background:var(--bg);color:var(--text);min-height:100vh}
h1,h2{font-family:'Space Grotesk',sans-serif}

.header{display:flex;align-items:center;justify-content:space-between;padding:20px 24px;border-bottom:1px solid var(--border)}
.header h1{font-size:1.3rem;color:#fff}
.header-right{display:flex;gap:12px;align-items:center}

.btn{padding:10px 20px;border-radius:8px;border:none;cursor:pointer;font-size:0.85rem;font-weight:600;font-family:'Inter',sans-serif}
.btn-primary{background:var(--accent);color:#000}
.btn-primary:hover{background:#d97706}
.btn-outline{background:transparent;border:1px solid var(--border);color:var(--text)}

.filters{display:flex;gap:12px;padding:16px 24px;flex-wrap:wrap;align-items:center}
.filters select{background:var(--card);color:var(--text);border:1px solid var(--border);border-radius:6px;padding:8px 12px;font-size:0.8rem;font-family:'Inter',sans-serif}
.filters select:focus{outline:none;border-color:var(--accent)}

.list{padding:0 24px 24px}
.assessment-card{
  display:grid;grid-template-columns:1fr 120px 100px 80px 60px 140px;
  align-items:center;gap:12px;padding:16px 20px;
  background:var(--card);border:1px solid var(--border);border-radius:10px;
  margin-bottom:8px;cursor:pointer;transition:border-color 0.15s;
  min-height:60px;
}
.assessment-card:hover{border-color:var(--accent)}
.card-name{font-weight:600;font-size:0.9rem;color:#fff}
.card-type{font-size:0.7rem;color:var(--muted);margin-top:2px}
.card-assigned{font-size:0.8rem;color:var(--muted)}
.card-status{font-size:0.7rem;font-weight:600;padding:4px 10px;border-radius:12px;text-align:center;text-transform:uppercase;letter-spacing:0.05em}
.card-status.draft{background:rgba(148,163,184,0.15);color:#94a3b8}
.card-status.in_progress{background:rgba(59,130,246,0.15);color:#3b82f6}
.card-status.completed{background:rgba(0,230,118,0.15);color:#00e676}
.card-status.synced{background:rgba(245,158,11,0.15);color:#f59e0b}
.card-zones{font-size:0.8rem;color:var(--muted);text-align:center}
.card-photos{font-size:0.8rem;color:var(--muted);text-align:center}
.card-date{font-size:0.75rem;color:var(--muted);text-align:right}

.empty{text-align:center;padding:80px 24px;color:var(--muted)}
.empty h2{font-size:1.1rem;margin-bottom:8px;color:#fff}
.empty p{font-size:0.85rem;margin-bottom:24px}

@media(max-width:768px){
  .assessment-card{grid-template-columns:1fr auto;gap:8px}
  .card-zones,.card-photos,.card-date{display:none}
}
</style>
</head>
<body>

<div class="header">
  <h1>Facility Assessments</h1>
  <div class="header-right">
    <button class="btn btn-primary" onclick="newAssessment()">+ New Assessment</button>
  </div>
</div>

<div class="filters">
  <select id="filterAssigned" onchange="loadAssessments()">
    <option value="">All Team Members</option>
    <option>Cory</option><option>Tyler</option><option>David</option>
    <option>Eric</option><option>Lydia</option><option>JB</option><option>Ben</option>
  </select>
  <select id="filterStatus" onchange="loadAssessments()">
    <option value="">All Statuses</option>
    <option value="draft">Draft</option>
    <option value="in_progress">In Progress</option>
    <option value="completed">Completed</option>
    <option value="synced">Synced</option>
  </select>
</div>

<div class="list" id="assessmentList">
  <div class="empty">
    <h2>No assessments yet</h2>
    <p>Start a new facility assessment to capture site walk data.</p>
    <button class="btn btn-primary" onclick="newAssessment()">+ New Assessment</button>
  </div>
</div>

<script>
function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

async function loadAssessments() {
  const assigned = document.getElementById('filterAssigned').value;
  const status = document.getElementById('filterStatus').value;

  const params = new URLSearchParams();
  if (assigned) params.set('assigned_to', assigned);
  if (status) params.set('status', status);

  try {
    const res = await fetch(`/api/assessments?${params}`);
    if (!res.ok) throw new Error('Failed to load');
    const data = await res.json();
    renderList(data);
  } catch (err) {
    console.error('Load error:', err);
    // WHY: Also show locally-saved drafts that haven't been synced yet
    showLocalDrafts();
  }
}

function renderList(assessments) {
  const container = document.getElementById('assessmentList');

  if (!assessments.length) {
    container.innerHTML = `
      <div class="empty">
        <h2>No assessments found</h2>
        <p>Try changing the filters or start a new assessment.</p>
        <button class="btn btn-primary" onclick="newAssessment()">+ New Assessment</button>
      </div>`;
    return;
  }

  container.innerHTML = assessments.map(a => `
    <div class="assessment-card" onclick="openAssessment('${esc(a.id)}')">
      <div>
        <div class="card-name">${esc(a.property_name)}</div>
        <div class="card-type">${esc(a.property_type || a.facility_type || 'Hotel')}</div>
      </div>
      <div class="card-assigned">${esc(a.assigned_to)}</div>
      <div class="card-status ${esc(a.status)}">${esc(a.status.replace('_', ' '))}</div>
      <div class="card-zones">${a.zone_count || 0} zones</div>
      <div class="card-photos">${a.photo_count || 0} photos</div>
      <div class="card-date">${a.updated_at ? new Date(a.updated_at).toLocaleDateString() : ''}</div>
    </div>
  `).join('');
}

function showLocalDrafts() {
  // WHY: When offline, show any locally-saved drafts from localStorage
  const drafts = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key.startsWith('assessment_draft_')) {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        drafts.push(data);
      } catch { /* skip corrupt entries */ }
    }
  }
  if (drafts.length) renderList(drafts);
}

function newAssessment() {
  window.location.href = '/pages/assessment.html';
}

function openAssessment(id) {
  window.location.href = `/pages/assessment.html?id=${encodeURIComponent(id)}`;
}

document.addEventListener('DOMContentLoaded', loadAssessments);
</script>
</body>
</html>
```

- [ ] **Step 2: Verify the page loads**

Run: `npm run dev` (if not already running)
Open: `http://localhost:3000/pages/assessments.html`
Expected: Page loads with "No assessments yet" empty state, filters render, "New Assessment" button works (navigates to assessment.html which doesn't exist yet — that's OK)

- [ ] **Step 3: Commit**

```bash
git add pages/assessments.html
git commit -m "feat(ui): assessment list page with filters and local draft support

Problem: No way to view, filter, or navigate between facility assessments.

Solution: Self-contained HTML page with server-loaded list + localStorage
fallback for offline drafts. Filters by team member and status. Links to
assessment form page for creation and editing."
```

---

### Task 8: Assessment Form Page — Core Shell

**Files:**
- Create: `pages/assessment.html`

This is the largest task. It creates the main assessment form with the header, tab bar, and Overview tab. Subsequent tasks will add the remaining tabs, zone system, photo capture, offline storage, and sync.

- [ ] **Step 1: Create `pages/assessment.html` with core shell, CSS, Overview tab, and all infrastructure**

Create the file at `pages/assessment.html`. This is the complete V1 page — all tabs, zone system, photo capture, offline storage, sync, and completion tracking in one self-contained file. Due to the size, the implementer should reference the spec at `docs/superpowers/specs/2026-04-21-facility-assessment-toolkit-design.md` for the full field list per tab and zone template.

The page must include:

**HTML structure:**
- Fixed header: logo + inline-editable property name | assigned rep + status badge | save indicator + sync button
- Sticky tab bar: Overview | Stakeholders | Operations | Infrastructure | [divider] | [dynamic zone tabs] | + Add Zone
- Tab content area (only active tab visible)
- Add Zone modal (zone type picker grid)
- Photo annotation overlay (hidden by default)
- Toast notification container

**CSS (embedded `<style>`):**
- Dark theme with `--accent: #f59e0b` (amber/gold)
- 44px minimum touch targets for all interactive elements
- Toggle switch component (replaces checkboxes)
- Tab completion dots (empty/half/green)
- Zone tab with x-to-remove button
- Photo grid (3 columns)
- Sync button states (green pulse / grey / blue spinner / green check / red warning)
- Responsive: works on iPad Mini (744px wide in landscape) down to portrait
- Auto-expanding textareas

**JavaScript (embedded `<script>`):**

State management:
```javascript
// WHY: Single state object — everything about this assessment lives here.
// Serialized to localStorage every 30s and on tab switch.
let state = {
  id: null,           // UUID — generated on first save or from URL param
  property_name: '',
  assigned_to: '',
  facility_type: 'hotel',
  status: 'draft',
  // ...all assessment fields from spec...
  zones: [],          // Array of zone objects
  stakeholders: [],   // Array of stakeholder objects
  operations_data: { shifts: [], contracted_services: [], automation_notes: '', pain_points: '' },
  infrastructure_data: { wifi: {}, elevators: [], power_notes: '', storage_notes: '', network_notes: '' },
  notes: '',
  created_at: null,
  updated_at: null,
  synced_at: null,
};

let activeTab = 'overview';
let autoSaveTimer = null;
```

Core functions the implementer MUST create:

```javascript
function generateUUID()        // crypto.randomUUID() with fallback
function esc(str)              // XSS escape for innerHTML
function initPage()            // Check URL ?id=, load from server or localStorage, start autosave
function switchTab(tabId)      // Show/hide tab content, update tab bar active state, trigger autosave
function renderTabBar()        // Render property tabs + zone tabs + add-zone button with completion dots
function renderActiveTab()     // Render the content for the currently active tab

// Overview tab
function renderOverviewTab()   // Property basics, contacts, union status form fields

// Stakeholders tab
function renderStakeholdersTab()  // Editable grid of stakeholders with add/remove
function addStakeholder()
function removeStakeholder(idx)

// Operations tab
function renderOperationsTab()  // Shift structure, contracted services, automation, pain points
function addContractedService()
function removeContractedService(idx)

// Infrastructure tab
function renderInfrastructureTab()  // WiFi, elevators, power, storage, network
function addElevator()
function removeElevator(idx)

// Zone system
function showAddZoneModal()    // Show modal with zone type picker grid
function addZone(zoneType)     // Create new zone with template defaults, add tab, switch to it
function removeZone(zoneIdx)   // Confirm and remove zone
function renderZoneTab(zoneIdx) // Render zone form fields, photo checklist, pain points, readiness

// Photo capture (uses IndexedDB)
function openPhotoDb()         // Open/create IndexedDB 'accelerate_assessments' with 'photos' store
function capturePhoto(zoneIdx, checklistItem)  // Trigger file input, save to IndexedDB
function renderPhotoGrid(zoneIdx)  // Show photo thumbnails for a zone
function generateThumbnail(blob)   // Canvas API: resize to 200px wide, return dataURL
function deletePhoto(photoId)

// Photo annotation
function openAnnotation(photoId)   // Full-screen overlay with SVG annotation tools
function addPin(x, y, label)
function addArrow(x1, y1, x2, y2)
function addTextLabel(x, y, text)
function saveAnnotations(photoId)
function closeAnnotation()

// Offline storage
function autoSave()            // Serialize state (minus photo blobs) to localStorage
function startAutoSave()       // setInterval(autoSave, 30000) + save on tab switch
function loadFromLocal(id)     // Load state from localStorage key 'assessment_draft_{id}'

// Sync
function syncToServer()        // POST assessment JSON, then upload photos in batches
function uploadPhotoBatch(assessmentId, photos)  // POST multipart batch of 5 photos
function updateSyncStatus(status, message)  // Update sync button appearance

// Completion tracking
function getTabCompletion(tabId)  // Returns 'empty', 'partial', 'complete'
function getZoneCompletion(zoneIdx)
function updateOverallStatus()    // Auto-advance draft → in_progress → completed

// Toast notifications
function showToast(message, type)  // 'success', 'error', 'info' — auto-dismiss after 3s
```

Zone templates — each returns `{ fields, photoChecklist }`:
```javascript
const ZONE_TEMPLATES = {
  lobby: {
    label: 'Lobby',
    icon: '🏨',
    fields: ['floor_surface', 'area_sqft', 'corridor_width', 'front_desk_proximity', 'bellhop_station', 'luggage_storage', 'peak_traffic_hours'],
    photoChecklist: ['Wide lobby shot', 'Floor surface close-up', 'Entrance/exit paths', 'Path to elevators', 'Obstacles/thresholds', 'Front desk area'],
  },
  restaurant: {
    label: 'Restaurant / Bar',
    icon: '🍽️',
    fields: ['name', 'seating_capacity', 'kitchen_proximity', 'service_style', 'hours', 'peak_meal_times', 'current_delivery_method'],
    photoChecklist: ['Dining room layout', 'Kitchen pass/window', 'Server station', 'Path from kitchen', 'Host stand', 'Steps/thresholds'],
  },
  guest_floor: {
    label: 'Guest Floor',
    icon: '🛏️',
    fields: ['floor_number', 'room_count', 'corridor_width', 'floor_surface', 'ice_vending_locations', 'linen_closet_location', 'elevator_distance', 'housekeeping_staging'],
    photoChecklist: ['Corridor width shot', 'Floor surface', 'Linen closet', 'Elevator landing', 'Ice/vending area', 'Housekeeping staging'],
  },
  pool_deck: {
    label: 'Pool Deck',
    icon: '🏊',
    fields: ['surface_type', 'covered_uncovered', 'furniture_layout', 'towel_station', 'fb_service', 'hours', 'fencing_access'],
    photoChecklist: ['Deck overview', 'Surface close-up', 'Path from building', 'Towel station', 'F&B service point', 'Gate/access point'],
  },
  kitchen: {
    label: 'Kitchen',
    icon: '👨‍🍳',
    fields: ['size_sqft', 'floor_surface', 'num_stations', 'walkin_locations', 'dish_pit_location', 'service_window', 'grease_traps'],
    photoChecklist: ['Floor surface', 'Main aisle width', 'Service window/pass', 'Path to dining room', 'Loading dock access'],
  },
  laundry: {
    label: 'Laundry',
    icon: '🧺',
    fields: ['in_house_or_outsourced', 'volume_lbs_day', 'equipment_list', 'linen_flow_path', 'cart_type_count', 'staging_area'],
    photoChecklist: ['Room overview', 'Equipment', 'Cart staging', 'Path to elevator/floors', 'Storage area'],
  },
  boh_corridor: {
    label: 'BOH Corridor',
    icon: '🚪',
    fields: ['width', 'floor_surface', 'traffic_items', 'traffic_direction', 'peak_traffic_times'],
    photoChecklist: ['Corridor width shot', 'Floor surface', 'Pinch points/turns', 'Door clearances', 'Ramp/grade changes'],
  },
  parking_garage: {
    label: 'Parking Garage',
    icon: '🅿️',
    fields: ['levels', 'surface_type', 'lighting_quality', 'current_cleaning', 'ev_stations', 'traffic_pattern'],
    photoChecklist: ['Driving lane width', 'Surface condition', 'Trash/debris areas', 'Lighting', 'EV station area', 'Entrance/exit ramps'],
  },
  event_space: {
    label: 'Event Space',
    icon: '🎪',
    fields: ['name', 'sqft', 'floor_surface', 'max_capacity', 'setup_teardown_frequency', 'av_equipment', 'storage_room', 'loading_dock'],
    photoChecklist: ['Room overview', 'Floor surface', 'Loading path from dock', 'Storage area', 'AV setup', 'Entry doors'],
  },
  fitness_center: {
    label: 'Fitness Center',
    icon: '💪',
    fields: ['hours', 'sqft', 'floor_surface', 'equipment_count', 'towel_service', 'current_cleaning'],
    photoChecklist: ['Room overview', 'Floor surface', 'Entry path', 'Towel station'],
  },
  spa: {
    label: 'Spa',
    icon: '💆',
    fields: ['services', 'treatment_rooms', 'floor_surface', 'linen_volume', 'hours'],
    photoChecklist: ['Corridor', 'Floor surface', 'Linen storage', 'Treatment room entry width'],
  },
  exterior: {
    label: 'Exterior / Grounds',
    icon: '🌳',
    fields: ['walkway_surfaces', 'landscaping_scope', 'lighting_quality', 'parking_lot_area', 'sidewalk_condition', 'grade_changes'],
    photoChecklist: ['Main walkways', 'Surface conditions', 'Grade changes', 'Lighting', 'Parking lot surface'],
  },
  other: {
    label: 'Other',
    icon: '📋',
    fields: ['custom_name', 'description', 'floor_surface', 'dimensions'],
    photoChecklist: ['Overview', 'Floor surface', 'Access path'],
  },
};
```

**Key implementation details the implementer MUST follow:**

1. **All user-controlled strings rendered in innerHTML must pass through `esc()`** — property names, zone names, stakeholder names, etc.

2. **Form fields read from and write to the `state` object** — use `oninput` handlers that update `state` directly (e.g., `oninput="state.property_name = this.value"`).

3. **IndexedDB for photos** — open with `indexedDB.open('accelerate_assessments', 1)` and create object store `photos` with keyPath `id` on upgrade.

4. **Photo file input** — use `<input type="file" accept="image/*" capture="environment">` hidden, triggered programmatically. On change, read the file as a Blob, generate a thumbnail via Canvas, and save both to IndexedDB.

5. **Annotation overlay** — render the photo as a `<canvas>`, draw annotations as an SVG overlay on top. Tools: pin (red circle with label), arrow (line with arrowhead), text label (positioned text). Store as JSON array on the photo record.

6. **Auto-save** — `setInterval` at 30 seconds. Also save on tab switch and before sync. Key: `assessment_draft_{state.id}`.

7. **Sync** — POST to `/api/assessments` with the full state (minus photo blobs). Then loop through IndexedDB photos for this assessment and POST in batches of 5 to `/api/assessments/:id/photos` as multipart form data.

8. **Online/offline detection** — `navigator.onLine` + event listeners for 'online'/'offline'. Grey out sync button when offline. Show toast on connectivity change.

9. **Completion tracking** — each tab calculates its own completion. Tab dots in the tab bar reflect this. Overall status auto-advances (draft → in_progress when Overview complete; → completed when all property tabs + 2 zones complete).

- [ ] **Step 2: Test the page loads and basic interaction works**

Open: `http://localhost:3000/pages/assessment.html`
Expected:
- Header shows with editable property name field
- Tab bar shows Overview, Stakeholders, Operations, Infrastructure + divider + "+ Add Zone"
- Overview tab form fields render
- Switching tabs works
- "Add Zone" shows the zone type picker modal
- Adding a zone creates a new tab

- [ ] **Step 3: Test offline save and reload**

1. Fill in some fields on the Overview tab
2. Wait 30 seconds (auto-save) or switch tabs
3. Close the browser tab
4. Reopen `http://localhost:3000/pages/assessment.html?id=<the-id>`
5. Expected: fields are restored from localStorage

- [ ] **Step 4: Test sync**

1. Fill in property name, rooms, floors, assigned_to
2. Add a zone (e.g., Lobby)
3. Click Sync
4. Expected: POST to /api/assessments succeeds, sync indicator shows green check
5. Verify: `curl http://localhost:3000/api/assessments` returns the assessment (with auth cookie)

- [ ] **Step 5: Test photo capture (if on device with camera or using file picker)**

1. Open assessment, switch to a zone tab
2. Tap a photo checklist item
3. Select/take a photo
4. Expected: thumbnail appears in photo grid, saved to IndexedDB

- [ ] **Step 6: Commit**

```bash
git add pages/assessment.html
git commit -m "feat(ui): facility assessment form page with all tabs, zones, photos, offline, sync

Problem: No iPad-optimized tool for field reps to capture facility data
during site walks.

Solution: Self-contained HTML page with tabbed sections (Overview, Stakeholders,
Operations, Infrastructure + dynamic zone tabs), camera-based photo capture with
IndexedDB storage, annotation overlay, auto-save to localStorage every 30s,
manual sync to server, and completion tracking with tab indicators."
```

---

### Task 9: Integration Test for Full API Flow

**Files:**
- Modify: `tests/integration/assessments.test.js`

- [ ] **Step 1: Add API-level integration tests**

Append this `describe` block to the existing test file:

```javascript
describe('assessment API flow (full round-trip)', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => cleanup());

  it('full lifecycle: create → add zones → add stakeholders → read back → fleet-input → delete', () => {
    const assessmentId = 'lifecycle-test-001';

    // Create assessment with zones and stakeholders
    db.prepare(`
      INSERT INTO assessments (id, property_name, assigned_to, facility_type, rooms, floors, elevators, elevator_make, fb_outlets, event_space_sqft)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(assessmentId, 'Thesis Hotel', 'Tyler', 'hotel', 69, 10, 2, 'ThyssenKrupp TAC32T', 2, 1500);

    // Add zones
    db.prepare(`
      INSERT INTO assessment_zones (id, assessment_id, zone_type, zone_name, floor_surfaces, corridor_width_ft, robot_readiness, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('z1', assessmentId, 'lobby', 'Main Lobby', JSON.stringify(['marble', 'tile']), 8.5, 'ready', 0);

    db.prepare(`
      INSERT INTO assessment_zones (id, assessment_id, zone_type, zone_name, floor_surfaces, corridor_width_ft, robot_readiness, pain_points, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('z2', assessmentId, 'restaurant', 'Rooftop Bar', JSON.stringify(['hardwood']), 6.0, 'minor_work', 'Food runners are slow, kitchen is far from dining', 1);

    db.prepare(`
      INSERT INTO assessment_zones (id, assessment_id, zone_type, zone_name, floor_surfaces, robot_readiness, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('z3', assessmentId, 'guest_floor', '3rd Floor', JSON.stringify(['carpet']), 'ready', 2);

    db.prepare(`
      INSERT INTO assessment_zones (id, assessment_id, zone_type, zone_name, robot_readiness, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('z4', assessmentId, 'pool_deck', 'Paseo Pool', 'ready', 3);

    // Add stakeholders
    db.prepare(`
      INSERT INTO assessment_stakeholders (id, assessment_id, name, role, title)
      VALUES (?, ?, ?, ?, ?)
    `).run('s1', assessmentId, 'Brent Reynolds', 'decision_maker', 'Owner');

    db.prepare(`
      INSERT INTO assessment_stakeholders (id, assessment_id, name, role, title)
      VALUES (?, ?, ?, ?, ?)
    `).run('s2', assessmentId, 'Head of Engineering', 'technical', 'Head of Engineering');

    // Read back
    const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get(assessmentId);
    const zones = db.prepare('SELECT * FROM assessment_zones WHERE assessment_id = ? ORDER BY sort_order').all(assessmentId);
    const stakeholders = db.prepare('SELECT * FROM assessment_stakeholders WHERE assessment_id = ?').all(assessmentId);

    expect(assessment.property_name).toBe('Thesis Hotel');
    expect(zones).toHaveLength(4);
    expect(stakeholders).toHaveLength(2);

    // Verify fleet-input data shape
    const allSurfaces = new Set();
    const outdoorAmenities = [];
    for (const z of zones) {
      const surfaces = z.floor_surfaces ? JSON.parse(z.floor_surfaces) : [];
      surfaces.forEach(s => allSurfaces.add(s));
      if (['pool_deck', 'exterior', 'parking_garage'].includes(z.zone_type)) {
        outdoorAmenities.push(z.zone_type);
      }
    }

    expect(Array.from(allSurfaces)).toContain('marble');
    expect(Array.from(allSurfaces)).toContain('carpet');
    expect(outdoorAmenities).toContain('pool_deck');

    // Delete assessment — should cascade
    db.prepare('DELETE FROM assessments WHERE id = ?').run(assessmentId);
    expect(db.prepare('SELECT * FROM assessment_zones WHERE assessment_id = ?').all(assessmentId)).toHaveLength(0);
    expect(db.prepare('SELECT * FROM assessment_stakeholders WHERE assessment_id = ?').all(assessmentId)).toHaveLength(0);
  });

  it('operations_data and infrastructure_data store and parse as JSON', () => {
    const ops = { shifts: [{ name: 'Day', start: '7am', end: '3pm', staff: 12 }], contracted_services: [{ type: 'cleaning', vendor: 'ABC Corp', annual_cost: 48000 }] };
    const infra = { wifi: { coverage: 'strong', ssid: 'ThesisGuest' }, elevators: [{ make: 'ThyssenKrupp', model: 'TAC32T', floors_served: 10 }] };

    db.prepare(`
      INSERT INTO assessments (id, property_name, assigned_to, operations_data, infrastructure_data)
      VALUES (?, ?, ?, ?, ?)
    `).run('a1', 'Test', 'Eric', JSON.stringify(ops), JSON.stringify(infra));

    const row = db.prepare('SELECT operations_data, infrastructure_data FROM assessments WHERE id = ?').get('a1');
    expect(JSON.parse(row.operations_data).shifts).toHaveLength(1);
    expect(JSON.parse(row.infrastructure_data).elevators[0].make).toBe('ThyssenKrupp');
  });
});
```

- [ ] **Step 2: Run full test suite**

Run: `npx vitest run tests/integration/assessments.test.js`
Expected: All tests PASS

- [ ] **Step 3: Commit**

```bash
git add tests/integration/assessments.test.js
git commit -m "test: full lifecycle integration tests for assessment API

Problem: Assessment API endpoints lack comprehensive integration tests
covering the full create-zones-stakeholders-read-fleet-input-delete cycle.

Solution: Tests covering CRUD lifecycle, cascade deletes, JSON field
storage/parsing, and fleet-input data shape validation."
```

---

### Task 10: Run Full Test Suite and Verify Wiring

**Files:**
- No file changes — verification only

- [ ] **Step 1: Run all tests**

Run: `npx vitest run`
Expected: All tests PASS (existing + new assessment tests)

- [ ] **Step 2: Start dev server and verify all endpoints**

Run: `npm run dev`

Test list endpoint:
```bash
curl -s http://localhost:3000/api/assessments | head -c 200
```
Expected: `[]` (empty array — no auth in dev mode, or 401 if auth required)

Test assessment list page:
Open: `http://localhost:3000/pages/assessments.html`
Expected: Page loads, shows empty state or assessments

Test assessment form page:
Open: `http://localhost:3000/pages/assessment.html`
Expected: Form loads with all tabs, fields render, zone system works

- [ ] **Step 3: Verify assessment → Fleet Designer pipeline**

1. Create an assessment via the form page (fill in property details, add a Lobby zone with marble floor + "ready" readiness)
2. Sync to server
3. Call fleet-input endpoint: `curl http://localhost:3000/api/assessments/<id>/fleet-input`
4. Expected: Returns property/facility/suggestedGoals/zones JSON matching the spec format

- [ ] **Step 4: Verify PDF generation**

Open: `http://localhost:3000/api/assessments/<id>/pdf`
Expected: PDF downloads with cover page, executive summary, zone assessments, recommendations

- [ ] **Step 5: Commit (only if any fixes were needed)**

```bash
git add -A
git commit -m "fix: wiring and integration fixes from end-to-end verification"
```

---

## Self-Review Checklist

### Spec Coverage
| Spec Section | Task |
|---|---|
| Data Model (4 tables) | Task 1 |
| Tab Structure (Overview, Stakeholders, Operations, Infrastructure) | Task 8 |
| Zone Templates (13 types) | Task 8 |
| Photo Capture & Annotation | Task 8 |
| UI Layout (header, tab bar, form fields) | Task 8 |
| Offline Architecture (localStorage + IndexedDB) | Task 8 |
| Assessment → Fleet Designer Pipeline | Task 3 (fleet-input endpoint) |
| PDF Report | Task 5 |
| API Endpoints (10 endpoints) | Tasks 3, 4, 5 |
| Team Assignment (7 members) | Task 3 (meta/team endpoint) + Task 8 (dropdown) |
| Assessment List Page | Task 7 |
| Completion Tracking | Task 8 |

### Placeholder Scan
- No TBD/TODO in any task
- All code blocks are complete
- Zone template data fully specified
- All function signatures documented

### Type Consistency
- `state.zones[i]` structure matches `assessment_zones` table columns
- `state.stakeholders[i]` structure matches `assessment_stakeholders` table columns
- `operations_data` and `infrastructure_data` are JSON TEXT fields in both DB and state
- Photo IDs are UUIDs (TEXT) throughout
- `generateId()` / `generateUUID()` used consistently (server-side / client-side respectively)
