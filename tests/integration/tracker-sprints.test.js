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

describe('sprint routes', () => {
  let db, cleanup, handlers;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    delete require.cache[require.resolve('../../src/routes/tracker')];
    handlers = require('../../src/routes/tracker').__testHandlers(wrapAsLibsqlHelper(db));
  });

  afterEach(() => cleanup());

  it('POST /sprints creates a sprint', async () => {
    const res = mockRes();
     await handlers.createSprint(
      { body: { name: 'S1', start_date: '2026-04-22', end_date: '2026-05-13' } },
      res
    );
    expect(res.statusCode).toBe(201);
    expect(res.body.name).toBe('S1');
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('POST /sprints rejects missing fields', async () => {
    const res = mockRes();
     await handlers.createSprint({ body: { name: 'S1' } }, res);
    expect(res.statusCode).toBe(400);
  });

  it('POST /sprints rejects end_date before start_date', async () => {
    const res = mockRes();
     await handlers.createSprint(
      { body: { name: 'S1', start_date: '2026-05-13', end_date: '2026-04-22' } },
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/date/i);
  });

  it('GET /sprints lists sprints', async () => {
    db.prepare(`INSERT INTO tracker_sprints (id, name, start_date, end_date) VALUES
                ('s1', 'A', '2026-04-22', '2026-05-13'),
                ('s2', 'B', '2026-05-14', '2026-06-04')`).run();
    const res = mockRes();
     await handlers.listSprints({}, res);
    expect(res.body).toHaveLength(2);
  });

  it('PATCH /sprints/:id updates name and dates', async () => {
    db.prepare(`INSERT INTO tracker_sprints (id, name, start_date, end_date)
                VALUES ('s1', 'A', '2026-04-22', '2026-05-13')`).run();
    const res = mockRes();
     await handlers.updateSprint(
      { params: { id: 's1' }, body: { name: 'Renamed', end_date: '2026-05-20' } },
      res
    );
    expect(res.body.name).toBe('Renamed');
    expect(res.body.end_date).toBe('2026-05-20');
  });

  it('DELETE /sprints/:id cascades to items', async () => {
    db.prepare(`INSERT INTO tracker_sprints (id, name, start_date, end_date)
                VALUES ('s1', 'A', '2026-04-22', '2026-05-13')`).run();
    db.prepare(`INSERT INTO tracker_items (id, sprint_id, level, name, start_date, end_date)
                VALUES ('i1', 's1', 'project', 'P', '2026-04-22', '2026-04-29')`).run();
    const res = mockRes();
     await handlers.deleteSprint({ params: { id: 's1' } }, res);
    const items = db.prepare(`SELECT id FROM tracker_items WHERE sprint_id = 's1'`).all();
    expect(items).toHaveLength(0);
  });
});
