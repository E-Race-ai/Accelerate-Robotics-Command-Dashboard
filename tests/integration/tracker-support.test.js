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

describe('support M2M', () => {
  let db, cleanup, handlers;
  let itemId;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    delete require.cache[require.resolve('../../src/routes/tracker')];
    handlers = require('../../src/routes/tracker').__testHandlers(wrapAsLibsqlHelper(db));

    db.prepare(`INSERT INTO tracker_sprints (id, name, start_date, end_date)
                VALUES ('s1', 'S', '2026-04-22', '2026-05-13')`).run();
    db.prepare(`INSERT INTO tracker_items (id, sprint_id, level, name, start_date, end_date)
                VALUES ('p1', 's1', 'project', 'P', '2026-04-22', '2026-04-29')`).run();
    db.prepare(`INSERT INTO tracker_people (initials) VALUES ('A'),('B'),('C')`).run();
    itemId = 'p1';
  });

  afterEach(() => cleanup());

  it('replaces the support list', async () => {
    const res = mockRes();
     await handlers.setSupport(
      { params: { id: itemId }, body: { person_ids: [1, 2] } },
      res
    );
    expect(res.body.support_ids).toEqual([1, 2]);
  });

  it('replacing with a different list removes the old entries', async () => {
    db.prepare(`INSERT INTO tracker_item_support (item_id, person_id) VALUES ('p1', 1), ('p1', 2)`).run();
    const res = mockRes();
     await handlers.setSupport(
      { params: { id: itemId }, body: { person_ids: [3] } },
      res
    );
    const rows = db.prepare(`SELECT person_id FROM tracker_item_support WHERE item_id = 'p1' ORDER BY person_id`).all();
    expect(rows.map(r => r.person_id)).toEqual([3]);
  });

  it('rejects person_ids that do not exist', async () => {
    const res = mockRes();
     await handlers.setSupport(
      { params: { id: itemId }, body: { person_ids: [1, 99] } },
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('rejects non-array body', async () => {
    const res = mockRes();
     await handlers.setSupport(
      { params: { id: itemId }, body: { person_ids: 'nope' } },
      res
    );
    expect(res.statusCode).toBe(400);
  });

  it('404 when item does not exist', async () => {
    const res = mockRes();
     await handlers.setSupport(
      { params: { id: 'ghost' }, body: { person_ids: [1] } },
      res
    );
    expect(res.statusCode).toBe(404);
  });

  it('rejects duplicate person_ids', async () => {
    const res = mockRes();
     await handlers.setSupport(
      { params: { id: itemId }, body: { person_ids: [1, 1, 2] } },
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/duplicate/i);
  });
});
