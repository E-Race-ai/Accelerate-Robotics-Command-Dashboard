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

  it('creates all four tracker tables', () => {
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
