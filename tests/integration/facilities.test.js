import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createTestDb } = require('../helpers/setup');

describe('facilities', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => cleanup());

  it('creates a hotel facility with all fields', () => {
    const { generateId } = require('../../src/services/id-generator');
    const id = generateId();
    db.prepare(`
      INSERT INTO facilities (id, name, type, city, state, floors, rooms_or_units, sqft_total, elevator_count, elevator_brand, surfaces)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, 'Thesis Hotel', 'hotel', 'Miami', 'FL', 10, 88, 45000, 2, 'ThyssenKrupp', JSON.stringify(['carpet', 'tile']));

    const facility = db.prepare('SELECT * FROM facilities WHERE id = ?').get(id);
    expect(facility.name).toBe('Thesis Hotel');
    expect(facility.floors).toBe(10);
    expect(JSON.parse(facility.surfaces)).toEqual(['carpet', 'tile']);
  });

  it('creates operational challenges for a facility', () => {
    const { generateId } = require('../../src/services/id-generator');
    const fid = generateId();
    db.prepare("INSERT INTO facilities (id, name, type) VALUES (?, 'Test', 'hotel')").run(fid);

    const cid = generateId();
    db.prepare(`
      INSERT INTO operational_challenges (id, facility_id, category, description, priority, current_cost_monthly, area_sqft)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(cid, fid, 'cleaning', '50K sqft carpet cleaned nightly, 3 EVS staff', 'high', 12000, 50000);

    const challenges = db.prepare('SELECT * FROM operational_challenges WHERE facility_id = ?').all(fid);
    expect(challenges).toHaveLength(1);
    expect(challenges[0].category).toBe('cleaning');
    expect(challenges[0].current_cost_monthly).toBe(12000);
  });

  it('creates contacts for a facility', () => {
    const { generateId } = require('../../src/services/id-generator');
    const fid = generateId();
    db.prepare("INSERT INTO facilities (id, name, type) VALUES (?, 'Test', 'hotel')").run(fid);

    const cid = generateId();
    db.prepare(`
      INSERT INTO contacts (id, facility_id, name, title, email, role)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(cid, fid, 'Brent Reynolds', 'Owner', 'brent@thesis.com', 'decision_maker');

    const contacts = db.prepare('SELECT * FROM contacts WHERE facility_id = ?').all(fid);
    expect(contacts).toHaveLength(1);
    expect(contacts[0].role).toBe('decision_maker');
  });
});
