import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// WHY: src/db/database.js requires DATABASE_URL at module load; use memory for tests.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file::memory:';
const { createTestDb, wrapAsLibsqlHelper } = require('../helpers/setup');

function mockRes() {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
}

describe('reorderItems (POST /items/reorder)', () => {
  let db, cleanup, handlers;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    delete require.cache[require.resolve('../../src/routes/tracker')];
    handlers = require('../../src/routes/tracker').__testHandlers(wrapAsLibsqlHelper(db));
    db.prepare(`INSERT INTO tracker_sprints (id, name, start_date, end_date)
                VALUES ('s1', 'S', '2026-04-22', '2026-05-13')`).run();
    // Three sibling projects
    db.prepare(`INSERT INTO tracker_items (id, sprint_id, level, name, start_date, end_date, sort_order)
                VALUES
                  ('p1', 's1', 'project', 'A', '2026-04-22', '2026-04-29', 0),
                  ('p2', 's1', 'project', 'B', '2026-04-22', '2026-04-29', 1),
                  ('p3', 's1', 'project', 'C', '2026-04-22', '2026-04-29', 2)`).run();
    // Two sibling tasks under p1
    db.prepare(`INSERT INTO tracker_items (id, sprint_id, parent_id, level, name, start_date, end_date, sort_order)
                VALUES
                  ('t1', 's1', 'p1', 'task', 'T1', '2026-04-22', '2026-04-25', 0),
                  ('t2', 's1', 'p1', 'task', 'T2', '2026-04-22', '2026-04-25', 1)`).run();
  });

  afterEach(() => cleanup());

  it('reorders top-level siblings (projects) by new index', async () => {
    const res = mockRes();
     await handlers.reorderItems({ body: { ordered_ids: ['p3', 'p1', 'p2'] } }, res);
    expect(res.statusCode).toBe(200);
    const rows = db.prepare(`SELECT id, sort_order FROM tracker_items
                             WHERE parent_id IS NULL ORDER BY sort_order`).all();
    expect(rows).toEqual([
      { id: 'p3', sort_order: 0 },
      { id: 'p1', sort_order: 1 },
      { id: 'p2', sort_order: 2 },
    ]);
  });

  it('reorders siblings under a common parent (tasks under p1)', async () => {
    const res = mockRes();
     await handlers.reorderItems({ body: { ordered_ids: ['t2', 't1'] } }, res);
    expect(res.statusCode).toBe(200);
    const rows = db.prepare(`SELECT id, sort_order FROM tracker_items
                             WHERE parent_id = 'p1' ORDER BY sort_order`).all();
    expect(rows).toEqual([
      { id: 't2', sort_order: 0 },
      { id: 't1', sort_order: 1 },
    ]);
  });

  it('rejects mixed parents (can only reorder siblings)', async () => {
    const res = mockRes();
    // p1 has parent NULL, t1 has parent p1 — different parents
     await handlers.reorderItems({ body: { ordered_ids: ['p1', 't1'] } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/same parent|siblings/i);
  });

  it('rejects an unknown id', async () => {
    const res = mockRes();
     await handlers.reorderItems({ body: { ordered_ids: ['p1', 'ghost'] } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects a non-array body', async () => {
    const res = mockRes();
     await handlers.reorderItems({ body: { ordered_ids: 'nope' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects an empty array', async () => {
    const res = mockRes();
     await handlers.reorderItems({ body: { ordered_ids: [] } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects duplicates in ordered_ids', async () => {
    const res = mockRes();
     await handlers.reorderItems({ body: { ordered_ids: ['p1', 'p1', 'p2'] } }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/duplicate/i);
  });
});
