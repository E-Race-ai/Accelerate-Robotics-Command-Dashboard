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

describe('assessment API flow (full round-trip)', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => cleanup());

  it('full lifecycle: create → add zones → add stakeholders → read back → fleet-input → delete', () => {
    const assessmentId = 'lifecycle-test-001';

    // Create assessment with zones and stakeholders
    db.prepare(`
      INSERT INTO assessments (id, property_name, assigned_to, facility_type, rooms, floors, elevators, elevator_make, fb_outlets, event_space_sqft)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(assessmentId, 'Thesis Hotel', 'Tyler', 'hotel', 69, 10, 2, 'ThyssenKrupp TAC32T', 2, 1500);

    // Add zones
    db.prepare(`
      INSERT INTO assessment_zones (id, assessment_id, zone_type, zone_name, floor_surfaces, corridor_width_ft, robot_readiness, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('z1', assessmentId, 'lobby', 'Main Lobby', JSON.stringify(['marble', 'tile']), 8.5, 'ready', 0);

    db.prepare(`
      INSERT INTO assessment_zones (id, assessment_id, zone_type, zone_name, floor_surfaces, corridor_width_ft, robot_readiness, pain_points, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run('z2', assessmentId, 'restaurant', 'Rooftop Bar', JSON.stringify(['hardwood']), 6.0, 'minor_work', 'Food runners are slow, kitchen is far from dining', 1);

    db.prepare(`
      INSERT INTO assessment_zones (id, assessment_id, zone_type, zone_name, floor_surfaces, robot_readiness, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('z3', assessmentId, 'guest_floor', '3rd Floor', JSON.stringify(['carpet']), 'ready', 2);

    db.prepare(`
      INSERT INTO assessment_zones (id, assessment_id, zone_type, zone_name, robot_readiness, sort_order)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('z4', assessmentId, 'pool_deck', 'Paseo Pool', 'ready', 3);

    // Add stakeholders
    db.prepare(`
      INSERT INTO assessment_stakeholders (id, assessment_id, name, role, title)
      VALUES (?, ?, ?, ?, ?)
    `).run('s1', assessmentId, 'Brent Reynolds', 'decision_maker', 'Owner');

    db.prepare(`
      INSERT INTO assessment_stakeholders (id, assessment_id, name, role, title)
      VALUES (?, ?, ?, ?, ?)
    `).run('s2', assessmentId, 'Head of Engineering', 'technical', 'Head of Engineering');

    // Read back
    const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get(assessmentId);
    const zones = db.prepare('SELECT * FROM assessment_zones WHERE assessment_id = ? ORDER BY sort_order').all(assessmentId);
    const stakeholders = db.prepare('SELECT * FROM assessment_stakeholders WHERE assessment_id = ?').all(assessmentId);

    expect(assessment.property_name).toBe('Thesis Hotel');
    expect(zones).toHaveLength(4);
    expect(stakeholders).toHaveLength(2);

    // Verify fleet-input data shape
    const allSurfaces = new Set();
    const outdoorAmenities = [];
    for (const z of zones) {
      const surfaces = z.floor_surfaces ? JSON.parse(z.floor_surfaces) : [];
      surfaces.forEach(s => allSurfaces.add(s));
      if (['pool_deck', 'exterior', 'parking_garage'].includes(z.zone_type)) {
        outdoorAmenities.push(z.zone_type);
      }
    }

    expect(Array.from(allSurfaces)).toContain('marble');
    expect(Array.from(allSurfaces)).toContain('carpet');
    expect(outdoorAmenities).toContain('pool_deck');

    // Delete assessment — should cascade
    db.prepare('DELETE FROM assessments WHERE id = ?').run(assessmentId);
    expect(db.prepare('SELECT * FROM assessment_zones WHERE assessment_id = ?').all(assessmentId)).toHaveLength(0);
    expect(db.prepare('SELECT * FROM assessment_stakeholders WHERE assessment_id = ?').all(assessmentId)).toHaveLength(0);
  });

  it('operations_data and infrastructure_data store and parse as JSON', () => {
    const ops = { shifts: [{ name: 'Day', start: '7am', end: '3pm', staff: 12 }], contracted_services: [{ type: 'cleaning', vendor: 'ABC Corp', annual_cost: 48000 }] };
    const infra = { wifi: { coverage: 'strong', ssid: 'ThesisGuest' }, elevators: [{ make: 'ThyssenKrupp', model: 'TAC32T', floors_served: 10 }] };

    db.prepare(`
      INSERT INTO assessments (id, property_name, assigned_to, operations_data, infrastructure_data)
      VALUES (?, ?, ?, ?, ?)
    `).run('a1', 'Test', 'Eric', JSON.stringify(ops), JSON.stringify(infra));

    const row = db.prepare('SELECT operations_data, infrastructure_data FROM assessments WHERE id = ?').get('a1');
    expect(JSON.parse(row.operations_data).shifts).toHaveLength(1);
    expect(JSON.parse(row.infrastructure_data).elevators[0].make).toBe('ThyssenKrupp');
  });
});
