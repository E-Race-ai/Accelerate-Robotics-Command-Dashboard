import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createTestDb } = require('../helpers/setup');

describe('assessment schema', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => cleanup());

  it('creates an assessment with required fields', () => {
    const id = 'asm-test-001';
    db.prepare(`
      INSERT INTO assessments (id, property_name, assigned_to, facility_type)
      VALUES (?, ?, ?, ?)
    `).run(id, 'Thesis Hotel', 'Tyler', 'hotel');

    const row = db.prepare('SELECT * FROM assessments WHERE id = ?').get(id);
    expect(row.property_name).toBe('Thesis Hotel');
    expect(row.assigned_to).toBe('Tyler');
    expect(row.status).toBe('draft');
  });

  it('creates zones linked to an assessment', () => {
    db.prepare("INSERT INTO assessments (id, property_name, assigned_to) VALUES ('a1', 'Test', 'Eric')").run();

    db.prepare(`
      INSERT INTO assessment_zones (id, assessment_id, zone_type, zone_name, floor_surfaces, robot_readiness)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('z1', 'a1', 'lobby', 'Main Lobby', JSON.stringify(['marble', 'tile']), 'ready');

    const zone = db.prepare('SELECT * FROM assessment_zones WHERE id = ?').get('z1');
    expect(zone.zone_type).toBe('lobby');
    expect(JSON.parse(zone.floor_surfaces)).toEqual(['marble', 'tile']);
    expect(zone.robot_readiness).toBe('ready');
  });

  it('cascades zone deletes when assessment is deleted', () => {
    db.prepare("INSERT INTO assessments (id, property_name, assigned_to) VALUES ('a1', 'Test', 'Eric')").run();
    db.prepare("INSERT INTO assessment_zones (id, assessment_id, zone_type, zone_name) VALUES ('z1', 'a1', 'lobby', 'Lobby')").run();

    db.prepare('DELETE FROM assessments WHERE id = ?').run('a1');
    const zone = db.prepare('SELECT * FROM assessment_zones WHERE id = ?').get('z1');
    expect(zone).toBeUndefined();
  });

  it('creates stakeholders linked to an assessment', () => {
    db.prepare("INSERT INTO assessments (id, property_name, assigned_to) VALUES ('a1', 'Test', 'Eric')").run();

    db.prepare(`
      INSERT INTO assessment_stakeholders (id, assessment_id, name, role, title, department)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('s1', 'a1', 'Brent Reynolds', 'decision_maker', 'Owner', 'Executive');

    const stakeholder = db.prepare('SELECT * FROM assessment_stakeholders WHERE id = ?').get('s1');
    expect(stakeholder.name).toBe('Brent Reynolds');
    expect(stakeholder.role).toBe('decision_maker');
  });

  it('rejects invalid assessment status', () => {
    expect(() => {
      db.prepare("INSERT INTO assessments (id, property_name, assigned_to, status) VALUES ('a1', 'Test', 'Eric', 'invalid')").run();
    }).toThrow();
  });

  it('rejects invalid stakeholder role', () => {
    db.prepare("INSERT INTO assessments (id, property_name, assigned_to) VALUES ('a1', 'Test', 'Eric')").run();
    expect(() => {
      db.prepare("INSERT INTO assessment_stakeholders (id, assessment_id, name, role) VALUES ('s1', 'a1', 'Test', 'invalid_role')").run();
    }).toThrow();
  });

  it('stores and retrieves photo metadata (without blob for unit test)', () => {
    db.prepare("INSERT INTO assessments (id, property_name, assigned_to) VALUES ('a1', 'Test', 'Eric')").run();
    db.prepare("INSERT INTO assessment_zones (id, assessment_id, zone_type, zone_name) VALUES ('z1', 'a1', 'lobby', 'Lobby')").run();

    db.prepare(`
      INSERT INTO assessment_photos (id, assessment_id, zone_id, checklist_item, caption, annotations)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('p1', 'a1', 'z1', 'wide_lobby_shot', 'Main lobby from entrance',
      JSON.stringify([{ type: 'pin', x: 100, y: 200, label: 'Front desk' }]));

    const photo = db.prepare('SELECT * FROM assessment_photos WHERE id = ?').get('p1');
    expect(photo.checklist_item).toBe('wide_lobby_shot');
    expect(JSON.parse(photo.annotations)).toHaveLength(1);
  });
});
