const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { generateId } = require('../services/id-generator');

const router = express.Router();

// ── Valid enum values ──────────────────────────────────────────
const VALID_STATUSES = ['draft', 'in_progress', 'completed', 'synced'];
const VALID_UNION_STATUSES = ['union', 'non_union', 'mixed'];
// WHY: Matches CHECK constraint in schema; validated here to give a clear 400 before SQLite throws
const VALID_ZONE_TYPES = ['lobby', 'restaurant', 'guest_floor', 'pool_deck', 'kitchen',
  'laundry', 'boh_corridor', 'parking_garage', 'event_space', 'fitness_center',
  'spa', 'exterior', 'other'];
const VALID_STAKEHOLDER_ROLES = ['decision_maker', 'influencer', 'champion', 'blocker', 'technical'];
const VALID_READINESS = ['ready', 'minor_work', 'major_work', 'not_feasible'];
// WHY: Hardcoded team list matches the field team; update here when roster changes
const TEAM_MEMBERS = ['Cory', 'Tyler', 'David', 'Eric', 'Lydia', 'JB', 'Ben'];

// ── Shared upsert logic (POST and PUT both call this) ──────────
// WHY: Offline-first design — client generates a UUID and always sends full state.
// INSERT OR REPLACE handles both "create" and "update" from the same sync payload.
function upsertAssessment(id, body, res) {
  const {
    deal_id, facility_type, property_name, property_address, property_type,
    rooms, floors, elevators, elevator_make, year_built, last_renovation,
    gm_name, gm_email, gm_phone, engineering_contact, engineering_email,
    fb_director, fb_outlets, event_space_sqft, union_status, union_details,
    assigned_to, status, operations_data, infrastructure_data, notes, synced_at,
    zones, stakeholders,
  } = body;

  if (!property_name) return res.status(400).json({ error: 'property_name is required' });
  if (!assigned_to) return res.status(400).json({ error: 'assigned_to is required' });
  if (status && !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
  }
  if (union_status && !VALID_UNION_STATUSES.includes(union_status)) {
    return res.status(400).json({ error: `union_status must be one of: ${VALID_UNION_STATUSES.join(', ')}` });
  }

  // WHY: INSERT OR REPLACE replaces all columns atomically — safe for offline sync
  // where the client always sends the complete assessment state.
  db.prepare(`
    INSERT OR REPLACE INTO assessments (
      id, deal_id, facility_type, property_name, property_address, property_type,
      rooms, floors, elevators, elevator_make, year_built, last_renovation,
      gm_name, gm_email, gm_phone, engineering_contact, engineering_email,
      fb_director, fb_outlets, event_space_sqft, union_status, union_details,
      assigned_to, status, operations_data, infrastructure_data, notes,
      created_at, updated_at, synced_at
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      COALESCE((SELECT created_at FROM assessments WHERE id = ?), datetime('now')),
      datetime('now'),
      ?
    )
  `).run(
    id, deal_id || null, facility_type || 'hotel', property_name, property_address || null,
    property_type || null, rooms || null, floors || null, elevators || null,
    elevator_make || null, year_built || null, last_renovation || null,
    gm_name || null, gm_email || null, gm_phone || null,
    engineering_contact || null, engineering_email || null,
    fb_director || null, fb_outlets || null, event_space_sqft || null,
    union_status || null, union_details || null,
    assigned_to, status || 'draft',
    operations_data != null ? JSON.stringify(operations_data) : null,
    infrastructure_data != null ? JSON.stringify(infrastructure_data) : null,
    notes || null,
    // created_at COALESCE back-reference needs the id again
    id,
    synced_at || null,
  );

  // ── Zone sync: delete-and-reinsert ─────────────────────────────
  // WHY: Client sends the full canonical zone list on every sync; simpler than diffing
  if (Array.isArray(zones)) {
    db.prepare('DELETE FROM assessment_zones WHERE assessment_id = ?').run(id);

    const insertZone = db.prepare(`
      INSERT INTO assessment_zones (
        id, assessment_id, zone_type, zone_name, floor_number, floor_surfaces,
        corridor_width_ft, ceiling_height_ft, door_width_min_ft,
        wifi_strength, wifi_network, lighting, foot_traffic,
        current_cleaning_method, cleaning_frequency, cleaning_contractor, cleaning_shift,
        delivery_method, staffing_notes, pain_points,
        robot_readiness, readiness_notes, template_data, notes, sort_order
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?, ?, ?
      )
    `);

    zones.forEach((z, idx) => {
      insertZone.run(
        z.id || generateId(), id,
        z.zone_type || 'other', z.zone_name || 'Zone',
        z.floor_number ?? null,
        z.floor_surfaces != null ? JSON.stringify(z.floor_surfaces) : null,
        z.corridor_width_ft ?? null, z.ceiling_height_ft ?? null, z.door_width_min_ft ?? null,
        z.wifi_strength || null, z.wifi_network || null,
        z.lighting || null, z.foot_traffic || null,
        z.current_cleaning_method || null, z.cleaning_frequency || null,
        z.cleaning_contractor || null, z.cleaning_shift || null,
        z.delivery_method || null, z.staffing_notes || null,
        z.pain_points || null,
        z.robot_readiness || null, z.readiness_notes || null,
        z.template_data != null ? JSON.stringify(z.template_data) : null,
        z.notes || null,
        z.sort_order ?? idx,
      );
    });
  }

  // ── Stakeholder sync: delete-and-reinsert ──────────────────────
  if (Array.isArray(stakeholders)) {
    db.prepare('DELETE FROM assessment_stakeholders WHERE assessment_id = ?').run(id);

    const insertStakeholder = db.prepare(`
      INSERT INTO assessment_stakeholders (
        id, assessment_id, name, title, department, role,
        email, phone, notes, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stakeholders.forEach((s, idx) => {
      // WHY: Skip incomplete stakeholder entries — partial records from autosave shouldn't persist
      if (!s.name || !s.role) return;
      insertStakeholder.run(
        s.id || generateId(), id,
        s.name, s.title || null, s.department || null, s.role,
        s.email || null, s.phone || null, s.notes || null,
        s.sort_order ?? idx,
      );
    });
  }

  const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get(id);
  return res.status(200).json(assessment);
}

// ── GET /meta/team ─────────────────────────────────────────────
// WHY: Registered BEFORE /:id so Express doesn't match 'meta' as an :id param
router.get('/meta/team', requireAuth, (req, res) => {
  res.json(TEAM_MEMBERS);
});

// ── GET / — List assessments ───────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const { assigned_to, status, deal_id } = req.query;

  let sql = `
    SELECT a.*,
      (SELECT COUNT(*) FROM assessment_zones WHERE assessment_id = a.id) AS zone_count,
      (SELECT COUNT(*) FROM assessment_photos WHERE assessment_id = a.id) AS photo_count
    FROM assessments a
  `;
  const conditions = [];
  const params = [];

  if (assigned_to) {
    conditions.push('a.assigned_to = ?');
    params.push(assigned_to);
  }
  if (status) {
    conditions.push('a.status = ?');
    params.push(status);
  }
  if (deal_id) {
    conditions.push('a.deal_id = ?');
    params.push(deal_id);
  }

  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY a.updated_at DESC';

  res.json(db.prepare(sql).all(...params));
});

// ── GET /:id — Get single assessment ──────────────────────────
router.get('/:id', requireAuth, (req, res) => {
  const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
  if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

  assessment.zones = db.prepare(
    'SELECT * FROM assessment_zones WHERE assessment_id = ? ORDER BY sort_order'
  ).all(req.params.id);

  assessment.stakeholders = db.prepare(
    'SELECT * FROM assessment_stakeholders WHERE assessment_id = ? ORDER BY sort_order'
  ).all(req.params.id);

  // WHY: Exclude photo_data BLOB from list response — blobs are large and only needed
  // when downloading a specific photo. Thumbnail column is kept for preview use.
  assessment.photos = db.prepare(`
    SELECT id, assessment_id, zone_id, checklist_item, thumbnail, annotations, caption, taken_at
    FROM assessment_photos
    WHERE assessment_id = ?
    ORDER BY taken_at
  `).all(req.params.id);

  res.json(assessment);
});

// ── POST / — Create or upsert assessment ──────────────────────
router.post('/', requireAuth, (req, res) => {
  // WHY: Client always provides the UUID for offline-first support.
  // Fall back to server-generated ID for clients that don't.
  const id = req.body.id || generateId();
  return upsertAssessment(id, req.body, res);
});

// ── PUT /:id — Update assessment ──────────────────────────────
router.put('/:id', requireAuth, (req, res) => {
  return upsertAssessment(req.params.id, req.body, res);
});

// ── DELETE /:id — Delete assessment ───────────────────────────
router.delete('/:id', requireAuth, (req, res) => {
  const existing = db.prepare('SELECT id FROM assessments WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Assessment not found' });

  // WHY: ON DELETE CASCADE in schema handles zones, stakeholders, and photos automatically
  db.prepare('DELETE FROM assessments WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── GET /:id/fleet-input — Transform for Fleet Designer ────────
router.get('/:id/fleet-input', requireAuth, (req, res) => {
  const assessment = db.prepare('SELECT * FROM assessments WHERE id = ?').get(req.params.id);
  if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

  const zones = db.prepare(
    'SELECT * FROM assessment_zones WHERE assessment_id = ? ORDER BY sort_order'
  ).all(req.params.id);

  // Collect unique surfaces across all zones
  const surfaceSet = new Set();
  for (const zone of zones) {
    if (zone.floor_surfaces) {
      try {
        const surfaces = JSON.parse(zone.floor_surfaces);
        if (Array.isArray(surfaces)) surfaces.forEach(s => surfaceSet.add(s));
      } catch {
        // WHY: Malformed JSON in floor_surfaces shouldn't crash fleet-input — skip silently
      }
    }
  }

  // Identify outdoor amenities from zone types
  const outdoorZoneTypes = ['pool_deck', 'exterior', 'parking_garage'];
  const outdoorAmenities = [...new Set(
    zones
      .filter(z => outdoorZoneTypes.includes(z.zone_type))
      .map(z => z.zone_type)
  )];

  // Generate goal suggestions based on zone data
  const goalMap = new Map(); // keyed by goalId to deduplicate

  for (const zone of zones) {
    const type = zone.zone_type;
    const readiness = zone.robot_readiness;
    const surfaces = zone.floor_surfaces ? (() => {
      try { return JSON.parse(zone.floor_surfaces); } catch { return []; }
    })() : [];
    const hasPainPoints = !!zone.pain_points;
    const actionable = readiness === 'ready' || readiness === 'minor_work';

    if ((type === 'guest_floor') && surfaces.includes('carpet') && actionable) {
      goalMap.set('carpet_cleaning', { goalId: 'carpet_cleaning', label: 'Carpet Cleaning' });
    }

    if ((type === 'guest_floor' || type === 'lobby') &&
        (surfaces.includes('hard floor') || surfaces.includes('tile') ||
         surfaces.includes('marble') || surfaces.includes('hardwood') ||
         surfaces.includes('vinyl')) && actionable) {
      goalMap.set('hard_floor_cleaning', { goalId: 'hard_floor_cleaning', label: 'Hard Floor Cleaning' });
    }

    if (type === 'restaurant' && hasPainPoints) {
      goalMap.set('food_runner', { goalId: 'food_runner', label: 'Food Runner / Delivery' });
    }

    if (type === 'laundry') {
      goalMap.set('linen_transport', { goalId: 'linen_transport', label: 'Linen Transport' });
    }

    if (type === 'pool_deck') {
      goalMap.set('pool_deck_cleaning', { goalId: 'pool_deck_cleaning', label: 'Pool Deck Cleaning' });
    }

    if (type === 'parking_garage') {
      goalMap.set('parking_sweep', { goalId: 'parking_sweep', label: 'Parking Sweep' });
    }
  }

  const suggestedGoals = [...goalMap.values()];

  res.json({
    property: {
      name: assessment.property_name,
      address: assessment.property_address,
      type: assessment.property_type || assessment.facility_type,
      rooms: assessment.rooms,
      floors: assessment.floors,
      elevators: assessment.elevators,
    },
    facility: {
      surfaces: [...surfaceSet],
      outdoorAmenities,
    },
    suggestedGoals,
    zones: zones.map(z => ({
      id: z.id,
      type: z.zone_type,
      name: z.zone_name,
      floor: z.floor_number,
      surfaces: z.floor_surfaces ? (() => {
        try { return JSON.parse(z.floor_surfaces); } catch { return []; }
      })() : [],
      readiness: z.robot_readiness,
    })),
  });
});

module.exports = router;
