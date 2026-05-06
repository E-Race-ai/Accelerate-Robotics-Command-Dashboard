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

describe('item routes', () => {
  let db, cleanup, handlers, sprintId;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    delete require.cache[require.resolve('../../src/routes/tracker')];
    handlers = require('../../src/routes/tracker').__testHandlers(wrapAsLibsqlHelper(db));
    sprintId = 's1';
    db.prepare(`INSERT INTO tracker_sprints (id, name, start_date, end_date)
                VALUES (?, 'S1', '2026-04-22', '2026-05-13')`).run(sprintId);
  });

  afterEach(() => cleanup());

  it('creates a project (no parent, level=project)', async () => {
    const res = mockRes();
     await handlers.createItem({
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

  it('rejects a project with a parent', async () => {
    db.prepare(`INSERT INTO tracker_items (id, sprint_id, level, name, start_date, end_date)
                VALUES ('p1', ?, 'project', 'P', '2026-04-22', '2026-04-29')`).run(sprintId);
    const res = mockRes();
     await handlers.createItem({
      body: {
        sprint_id: sprintId, level: 'project', parent_id: 'p1', name: 'X',
        start_date: '2026-04-22', end_date: '2026-04-29',
      },
    }, res);
    expect(res.statusCode).toBe(400);
  });

  it('creates a task under a project', async () => {
    db.prepare(`INSERT INTO tracker_items (id, sprint_id, level, name, start_date, end_date)
                VALUES ('p1', ?, 'project', 'P', '2026-04-22', '2026-04-29')`).run(sprintId);
    const res = mockRes();
     await handlers.createItem({
      body: {
        sprint_id: sprintId, level: 'task', parent_id: 'p1', name: 'T',
        start_date: '2026-04-22', end_date: '2026-04-25',
      },
    }, res);
    expect(res.statusCode).toBe(201);
    expect(res.body.parent_id).toBe('p1');
  });

  it('rejects a subtask whose parent is a project (not a task)', async () => {
    db.prepare(`INSERT INTO tracker_items (id, sprint_id, level, name, start_date, end_date)
                VALUES ('p1', ?, 'project', 'P', '2026-04-22', '2026-04-29')`).run(sprintId);
    const res = mockRes();
     await handlers.createItem({
      body: {
        sprint_id: sprintId, level: 'subtask', parent_id: 'p1', name: 'S',
        start_date: '2026-04-22', end_date: '2026-04-23',
      },
    }, res);
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/subtask/i);
  });

  it('rejects an unknown sprint_id', async () => {
    const res = mockRes();
     await handlers.createItem({
      body: {
        sprint_id: 'nope', level: 'project', name: 'P',
        start_date: '2026-04-22', end_date: '2026-04-29',
      },
    }, res);
    expect(res.statusCode).toBe(400);
  });

  it('rejects status not in enum', async () => {
    const res = mockRes();
     await handlers.createItem({
      body: {
        sprint_id: sprintId, level: 'project', name: 'P',
        start_date: '2026-04-22', end_date: '2026-04-29',
        status: 'done',
      },
    }, res);
    expect(res.statusCode).toBe(400);
  });

  it('PATCH updates status (inline-edit path)', async () => {
    db.prepare(`INSERT INTO tracker_items (id, sprint_id, level, name, start_date, end_date)
                VALUES ('p1', ?, 'project', 'P', '2026-04-22', '2026-04-29')`).run(sprintId);
    const res = mockRes();
     await handlers.updateItem(
      { params: { id: 'p1' }, body: { status: 'in_progress' } },
      res
    );
    expect(res.body.status).toBe('in_progress');
  });

  it('PATCH rejects changing sprint_id or level', async () => {
    db.prepare(`INSERT INTO tracker_items (id, sprint_id, level, name, start_date, end_date)
                VALUES ('p1', ?, 'project', 'P', '2026-04-22', '2026-04-29')`).run(sprintId);
    const res = mockRes();
     await handlers.updateItem(
      { params: { id: 'p1' }, body: { level: 'task' } },
      res
    );
    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/level|sprint_id|immutable/i);
  });

  it('DELETE cascades to children', async () => {
    db.prepare(`INSERT INTO tracker_items (id, sprint_id, level, name, start_date, end_date)
                VALUES ('p1', ?, 'project', 'P', '2026-04-22', '2026-04-29')`).run(sprintId);
    db.prepare(`INSERT INTO tracker_items (id, sprint_id, parent_id, level, name, start_date, end_date)
                VALUES ('t1', ?, 'p1', 'task', 'T', '2026-04-22', '2026-04-24')`).run(sprintId);
    const res = mockRes();
     await handlers.deleteItem({ params: { id: 'p1' } }, res);
    const rows = db.prepare(`SELECT id FROM tracker_items WHERE sprint_id = ?`).all(sprintId);
    expect(rows).toHaveLength(0);
  });
});
