const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { generateId } = require('../services/id-generator');

const router = express.Router();

const VALID_TYPES = ['hotel', 'hospital', 'grocery', 'theater', 'office', 'warehouse', 'other'];
const VALID_CHALLENGE_CATEGORIES = ['cleaning', 'delivery', 'transport', 'security', 'disinfection', 'mobility', 'guidance', 'outdoor', 'inventory'];
const VALID_CONTACT_ROLES = ['decision_maker', 'champion', 'influencer', 'end_user', 'blocker'];

// ── List facilities ────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const { type } = req.query;
  let sql = 'SELECT * FROM facilities';
  const params = [];
  if (type) {
    sql += ' WHERE type = ?';
    params.push(type);
  }
  sql += ' ORDER BY updated_at DESC';
  res.json(await db.all(sql, params));
});

// ── Get single facility with challenges and contacts ───────────
router.get('/:id', requireAuth, async (req, res) => {
  const facility = await db.one('SELECT * FROM facilities WHERE id = ?', [req.params.id]);
  if (!facility) return res.status(404).json({ error: 'Facility not found' });

  facility.challenges = await db.all(
    'SELECT * FROM operational_challenges WHERE facility_id = ? ORDER BY priority DESC',
    [req.params.id]
  );

  facility.contacts = await db.all(
    'SELECT * FROM contacts WHERE facility_id = ? ORDER BY created_at',
    [req.params.id]
  );

  res.json(facility);
});

// ── Create facility ────────────────────────────────────────────
router.post('/', requireAuth, requireRole('admin', 'sales', 'ops'), async (req, res) => {
  const { name, type, address, city, state, country, floors, rooms_or_units, sqft_total,
    elevator_count, elevator_brand, elevator_type, surfaces, wifi_available,
    operator, brand, gm_name, gm_email, gm_phone, eng_name, eng_email, notes } = req.body;

  if (!name) return res.status(400).json({ error: 'Facility name is required' });
  if (type && !VALID_TYPES.includes(type)) {
    return res.status(400).json({ error: `Type must be one of: ${VALID_TYPES.join(', ')}` });
  }

  const id = generateId();
  await db.run(`
    INSERT INTO facilities (id, name, type, address, city, state, country, floors, rooms_or_units,
      sqft_total, elevator_count, elevator_brand, elevator_type, surfaces, wifi_available,
      operator, brand, gm_name, gm_email, gm_phone, eng_name, eng_email, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, name, type || 'hotel', address || null, city || null, state || null,
    country || 'United States', floors || null, rooms_or_units || null, sqft_total || null,
    elevator_count || null, elevator_brand || null, elevator_type || null,
    surfaces ? JSON.stringify(surfaces) : null, wifi_available ?? 1,
    operator || null, brand || null, gm_name || null, gm_email || null,
    gm_phone || null, eng_name || null, eng_email || null, notes || null]);

  const facility = await db.one('SELECT * FROM facilities WHERE id = ?', [id]);
  res.status(201).json(facility);
});

// ── Update facility ────────────────────────────────────────────
router.patch('/:id', requireAuth, requireRole('admin', 'sales', 'ops'), async (req, res) => {
  const existing = await db.one('SELECT * FROM facilities WHERE id = ?', [req.params.id]);
  if (!existing) return res.status(404).json({ error: 'Facility not found' });

  if (req.body.type && !VALID_TYPES.includes(req.body.type)) {
    return res.status(400).json({ error: `Type must be one of: ${VALID_TYPES.join(', ')}` });
  }

  const allowedFields = ['name', 'type', 'address', 'city', 'state', 'country', 'floors',
    'rooms_or_units', 'sqft_total', 'elevator_count', 'elevator_brand', 'elevator_type',
    'surfaces', 'wifi_available', 'operator', 'brand', 'gm_name', 'gm_email', 'gm_phone',
    'eng_name', 'eng_email', 'notes', 'photos'];

  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) {
      // WHY: surfaces and photos are arrays stored as JSON strings
      updates[field] = (field === 'surfaces' || field === 'photos') && Array.isArray(req.body[field])
        ? JSON.stringify(req.body[field])
        : req.body[field];
    }
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.updated_at = new Date().toISOString();
  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = [...Object.values(updates), req.params.id];
  await db.run(`UPDATE facilities SET ${setClauses} WHERE id = ?`, values);

  const updated = await db.one('SELECT * FROM facilities WHERE id = ?', [req.params.id]);
  res.json(updated);
});

// ── Challenges CRUD (nested under facility) ────────────────────
router.get('/:id/challenges', requireAuth, async (req, res) => {
  res.json(await db.all('SELECT * FROM operational_challenges WHERE facility_id = ? ORDER BY priority DESC', [req.params.id]));
});

router.post('/:id/challenges', requireAuth, requireRole('admin', 'sales', 'ops'), async (req, res) => {
  const { category, description, priority, current_cost_monthly, current_staff_count, area_sqft, floors_affected, schedule } = req.body;

  if (!category || !description) {
    return res.status(400).json({ error: 'Category and description are required' });
  }
  if (!VALID_CHALLENGE_CATEGORIES.includes(category)) {
    return res.status(400).json({ error: `Category must be one of: ${VALID_CHALLENGE_CATEGORIES.join(', ')}` });
  }

  const id = generateId();
  await db.run(`
    INSERT INTO operational_challenges (id, facility_id, category, description, priority, current_cost_monthly, current_staff_count, area_sqft, floors_affected, schedule)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, req.params.id, category, description, priority || 'medium',
    current_cost_monthly || null, current_staff_count || null, area_sqft || null,
    floors_affected ? JSON.stringify(floors_affected) : null, schedule || null]);

  res.status(201).json(await db.one('SELECT * FROM operational_challenges WHERE id = ?', [id]));
});

router.delete('/:facilityId/challenges/:challengeId', requireAuth, requireRole('admin', 'sales'), async (req, res) => {
  const result = await db.run('DELETE FROM operational_challenges WHERE id = ? AND facility_id = ?', [req.params.challengeId, req.params.facilityId]);
  if (result.changes === 0) return res.status(404).json({ error: 'Challenge not found' });
  res.json({ ok: true });
});

// ── Contacts CRUD (nested under facility) ──────────────────────
router.get('/:id/contacts', requireAuth, async (req, res) => {
  res.json(await db.all('SELECT * FROM contacts WHERE facility_id = ? ORDER BY created_at', [req.params.id]));
});

router.post('/:id/contacts', requireAuth, requireRole('admin', 'sales'), async (req, res) => {
  const { name, title, email, phone, role, notes } = req.body;

  if (!name) return res.status(400).json({ error: 'Contact name is required' });
  if (role && !VALID_CONTACT_ROLES.includes(role)) {
    return res.status(400).json({ error: `Role must be one of: ${VALID_CONTACT_ROLES.join(', ')}` });
  }

  const id = generateId();
  await db.run(`
    INSERT INTO contacts (id, facility_id, name, title, email, phone, role, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `, [id, req.params.id, name, title || null, email || null, phone || null, role || null, notes || null]);

  res.status(201).json(await db.one('SELECT * FROM contacts WHERE id = ?', [id]));
});

router.delete('/:facilityId/contacts/:contactId', requireAuth, requireRole('admin', 'sales'), async (req, res) => {
  const result = await db.run('DELETE FROM contacts WHERE id = ? AND facility_id = ?', [req.params.contactId, req.params.facilityId]);
  if (result.changes === 0) return res.status(404).json({ error: 'Contact not found' });
  res.json({ ok: true });
});

module.exports = router;
