import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
// WHY: setup.js is CommonJS (better-sqlite3 CJS binding) — use createRequire to import it from ESM test context
const require = createRequire(import.meta.url);
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
