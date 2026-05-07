import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
// WHY: src/db/database.js requires DATABASE_URL at module load; use memory for tests.
process.env.DATABASE_URL = process.env.DATABASE_URL || 'file::memory:';
const { createTestDb, wrapAsLibsqlHelper } = require('../helpers/setup');

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
    handlers = require('../../src/routes/tracker').__testHandlers(wrapAsLibsqlHelper(db));
  });

  afterEach(() => cleanup());

  it('POST /people creates a person', async () => {
    const res = mockRes();
     await handlers.createPerson({ body: { initials: 'ER', full_name: 'Eric' } }, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.initials).toBe('ER');
    expect(res.body.full_name).toBe('Eric');
    expect(res.body.id).toBeGreaterThan(0);
  });

  it('POST /people rejects missing initials', async () => {
    const res = mockRes();
     await handlers.createPerson({ body: {} }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/initials/i);
  });

  it('GET /people returns only active rows', async () => {
    const insert = db.prepare(`INSERT INTO tracker_people (initials, active) VALUES (?, ?)`);
    insert.run('ER', 1);
    insert.run('XX', 0);
    insert.run('LG', 1);
    const res = mockRes();
     await handlers.listPeople({}, res);
    expect(res.body.map(p => p.initials).sort()).toEqual(['ER', 'LG']);
  });

  it('PATCH /people/:id updates full_name', async () => {
    const info = db.prepare(`INSERT INTO tracker_people (initials) VALUES ('ER')`).run();
    const res = mockRes();
     await handlers.updatePerson(
      { params: { id: info.lastInsertRowid }, body: { full_name: 'Eric' } },
      res
    );
    expect(res.body.full_name).toBe('Eric');
  });

  it('DELETE /people/:id soft-deletes (active=0)', async () => {
    const info = db.prepare(`INSERT INTO tracker_people (initials) VALUES ('ER')`).run();
    const res = mockRes();
     await handlers.deletePerson({ params: { id: info.lastInsertRowid } }, res);
    expect(res.body.ok).toBe(true);
    const row = db.prepare(`SELECT active FROM tracker_people WHERE id = ?`).get(info.lastInsertRowid);
    expect(row.active).toBe(0);
  });
});
