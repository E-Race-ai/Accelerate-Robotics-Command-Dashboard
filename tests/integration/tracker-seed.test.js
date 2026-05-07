import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// WHY: src/db/database.js requires DATABASE_URL at module load; use memory for tests.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file::memory:';
const { createTestDb, wrapAsLibsqlHelper } = require('../helpers/setup');
const { seedTracker } = require('../../src/db/tracker-seed');

describe('tracker seed', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => cleanup());

  it('seeds 12 people', async () => {
    await seedTracker(wrapAsLibsqlHelper(db));
    const n = db.prepare(`SELECT COUNT(*) as c FROM tracker_people`).get().c;
    expect(n).toBe(12);
  });

  it('seeds one sprint named "Hotel Bots - Sprint 1"', async () => {
    await seedTracker(wrapAsLibsqlHelper(db));
    const sprints = db.prepare(`SELECT * FROM tracker_sprints`).all();
    expect(sprints).toHaveLength(1);
    expect(sprints[0].name).toBe('Hotel Bots - Sprint 1');
  });

  it('seeds 10 projects', async () => {
    await seedTracker(wrapAsLibsqlHelper(db));
    const n = db.prepare(`SELECT COUNT(*) as c FROM tracker_items WHERE level = 'project'`).get().c;
    // WHY: 10 from the v2 workstream list + 1 standalone "Go / no-go" milestone-project = 11
    expect(n).toBe(11);
  });

  it('marks projects with [VERIFY] notes as needs_verification=1', async () => {
    await seedTracker(wrapAsLibsqlHelper(db));
    const n = db.prepare(
      `SELECT COUNT(*) as c FROM tracker_items WHERE level = 'project' AND needs_verification = 1`
    ).get().c;
    expect(n).toBeGreaterThan(0);
  });

  it('creates the V1 launched milestone under Deal + Prospects', async () => {
    await seedTracker(wrapAsLibsqlHelper(db));
    const ms = db.prepare(
      `SELECT i.name, i.is_milestone, p.name as parent_name
       FROM tracker_items i
       JOIN tracker_items p ON p.id = i.parent_id
       WHERE i.is_milestone = 1 AND p.name = 'Deal + Prospects'`
    ).get();
    expect(ms).toBeTruthy();
    expect(ms.name).toMatch(/V1 launched/i);
  });

  it('creates the go/no-go milestone at sprint end', async () => {
    await seedTracker(wrapAsLibsqlHelper(db));
    const sprint = db.prepare(`SELECT end_date FROM tracker_sprints`).get();
    const gonogo = db.prepare(
      `SELECT * FROM tracker_items WHERE is_milestone = 1 AND parent_id IS NULL`
    ).get();
    expect(gonogo).toBeTruthy();
    expect(gonogo.start_date).toBe(sprint.end_date);
    expect(gonogo.color).toBe('red');
  });

  it('is idempotent — running twice produces the same row counts', async () => {
    await seedTracker(wrapAsLibsqlHelper(db));
    const first = db.prepare(`SELECT COUNT(*) as c FROM tracker_items`).get().c;
    await seedTracker(wrapAsLibsqlHelper(db));
    const second = db.prepare(`SELECT COUNT(*) as c FROM tracker_items`).get().c;
    expect(second).toBe(first);
  });
});
