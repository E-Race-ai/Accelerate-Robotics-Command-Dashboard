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

describe('GET /sprints/:id (nested)', () => {
  let db, cleanup, handlers;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    delete require.cache[require.resolve('../../src/routes/tracker')];
    handlers = require('../../src/routes/tracker').__testHandlers(wrapAsLibsqlHelper(db));

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

  it('returns the sprint with nested projects, tasks, subtasks, and hydrated support', async () => {
    const res = mockRes();
     await handlers.getSprint({ params: { id: 's1' } }, res);
    const body = res.body;
    expect(body.id).toBe('s1');
    expect(body.people).toHaveLength(2);
    expect(body.projects).toHaveLength(1);
    expect(body.projects[0].support_ids).toEqual([1, 2]);
    expect(body.projects[0].tasks).toHaveLength(1);
    expect(body.projects[0].tasks[0].subtasks).toHaveLength(1);
    expect(body.projects[0].tasks[0].subtasks[0].name).toBe('Site visit');
  });

  it('returns 404 for unknown sprint', async () => {
    const res = mockRes();
     await handlers.getSprint({ params: { id: 'nope' } }, res);
    expect(res.statusCode).toBe(404);
  });
});
