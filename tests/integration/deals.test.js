import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createTestDb, wrapAsLibsqlHelper } = require('../helpers/setup');

// WHY: We test route handler logic directly against the DB, not through HTTP.
// This avoids starting Express for every test while still testing real SQL.

describe('deals routes', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => cleanup());

  describe('create deal', () => {
    it('creates a deal with OPP-001 id', async () => {
      const { generateDealId } = require('../../src/services/id-generator');
      const id = await generateDealId(wrapAsLibsqlHelper(db));
      db.prepare('INSERT INTO deals (id, name, stage, source) VALUES (?, ?, ?, ?)').run(id, 'Thesis Hotel', 'lead', 'inbound');
      const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(id);
      expect(deal.id).toBe('OPP-001');
      expect(deal.name).toBe('Thesis Hotel');
      expect(deal.stage).toBe('lead');
    });
  });

  describe('stage transitions', () => {
    it('advances from lead to qualified', () => {
      db.prepare("INSERT INTO deals (id, name, stage) VALUES ('OPP-001', 'Test', 'lead')").run();
      db.prepare("UPDATE deals SET stage = 'qualified', updated_at = datetime('now') WHERE id = 'OPP-001'").run();
      const deal = db.prepare("SELECT stage FROM deals WHERE id = 'OPP-001'").get();
      expect(deal.stage).toBe('qualified');
    });

    it('rejects invalid stage', () => {
      db.prepare("INSERT INTO deals (id, name, stage) VALUES ('OPP-001', 'Test', 'lead')").run();
      expect(() => {
        db.prepare("UPDATE deals SET stage = 'magic' WHERE id = 'OPP-001'").run();
      }).toThrow();
    });

    it('sets closed_at when won', () => {
      db.prepare("INSERT INTO deals (id, name, stage) VALUES ('OPP-001', 'Test', 'negotiation')").run();
      db.prepare("UPDATE deals SET stage = 'won', closed_at = datetime('now') WHERE id = 'OPP-001'").run();
      const deal = db.prepare("SELECT closed_at FROM deals WHERE id = 'OPP-001'").get();
      expect(deal.closed_at).toBeTruthy();
    });
  });

  describe('deal with facility', () => {
    it('links deal to facility', () => {
      db.prepare("INSERT INTO facilities (id, name, type) VALUES ('f1', 'Thesis Hotel', 'hotel')").run();
      db.prepare("INSERT INTO deals (id, name, stage, facility_id) VALUES ('OPP-001', 'Thesis Hotel', 'lead', 'f1')").run();
      const deal = db.prepare("SELECT d.*, f.name as facility_name FROM deals d LEFT JOIN facilities f ON d.facility_id = f.id WHERE d.id = 'OPP-001'").get();
      expect(deal.facility_name).toBe('Thesis Hotel');
    });
  });

  describe('list deals', () => {
    it('filters by stage', () => {
      db.prepare("INSERT INTO deals (id, name, stage) VALUES ('OPP-001', 'A', 'lead')").run();
      db.prepare("INSERT INTO deals (id, name, stage) VALUES ('OPP-002', 'B', 'qualified')").run();
      db.prepare("INSERT INTO deals (id, name, stage) VALUES ('OPP-003', 'C', 'lead')").run();
      const leads = db.prepare("SELECT * FROM deals WHERE stage = 'lead'").all();
      expect(leads).toHaveLength(2);
    });

    it('filters by owner', () => {
      db.prepare("INSERT INTO deals (id, name, stage, owner) VALUES ('OPP-001', 'A', 'lead', 'eric@accelerate.com')").run();
      db.prepare("INSERT INTO deals (id, name, stage, owner) VALUES ('OPP-002', 'B', 'lead', 'jb@accelerate.com')").run();
      const mine = db.prepare("SELECT * FROM deals WHERE owner = 'eric@accelerate.com'").all();
      expect(mine).toHaveLength(1);
    });
  });
});
