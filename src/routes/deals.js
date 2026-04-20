const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { generateDealId, generateId } = require('../services/id-generator');

const router = express.Router();

const VALID_STAGES = ['lead', 'qualified', 'site_walk', 'configured', 'proposed', 'negotiation', 'won', 'deploying', 'active', 'lost'];
const VALID_SOURCES = ['inbound', 'referral', 'outbound', 'event'];
// WHY: won and lost are terminal stages — we record when the deal closed to track sales cycle length
const CLOSING_STAGES = ['won', 'lost'];

// ── List deals ─────────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const { stage, owner } = req.query;
  let sql = `
    SELECT d.*, f.name as facility_name, f.type as facility_type, f.city, f.state
    FROM deals d
    LEFT JOIN facilities f ON d.facility_id = f.id
  `;
  const conditions = [];
  const params = [];

  if (stage) {
    conditions.push('d.stage = ?');
    params.push(stage);
  }
  if (owner) {
    conditions.push('d.owner = ?');
    params.push(owner);
  }

  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY d.updated_at DESC';

  const deals = db.prepare(sql).all(...params);
  res.json(deals);
});

// ── Get single deal ────────────────────────────────────────────
router.get('/:id', requireAuth, (req, res) => {
  const deal = db.prepare(`
    SELECT d.*, f.name as facility_name, f.type as facility_type, f.city, f.state
    FROM deals d
    LEFT JOIN facilities f ON d.facility_id = f.id
    WHERE d.id = ?
  `).get(req.params.id);

  if (!deal) return res.status(404).json({ error: 'Deal not found' });
  res.json(deal);
});

// ── Create deal ────────────────────────────────────────────────
router.post('/', requireAuth, requireRole('admin', 'sales'), (req, res) => {
  const { name, facility_id, source, owner, value_monthly, value_total, close_probability, notes } = req.body;

  if (!name) {
    return res.status(400).json({ error: 'Deal name is required' });
  }
  if (source && !VALID_SOURCES.includes(source)) {
    return res.status(400).json({ error: `Source must be one of: ${VALID_SOURCES.join(', ')}` });
  }

  const id = generateDealId(db);

  db.prepare(`
    INSERT INTO deals (id, name, facility_id, stage, source, owner, value_monthly, value_total, close_probability, notes)
    VALUES (?, ?, ?, 'lead', ?, ?, ?, ?, ?, ?)
  `).run(id, name, facility_id || null, source || null, owner || req.admin.email, value_monthly || null, value_total || null, close_probability || 0, notes || null);

  // Log activity
  db.prepare(`
    INSERT INTO activities (id, deal_id, actor, action, detail)
    VALUES (?, ?, ?, 'deal_created', ?)
  `).run(generateId(), id, req.admin.email, JSON.stringify({ name, source }));

  const deal = db.prepare('SELECT * FROM deals WHERE id = ?').get(id);
  res.status(201).json(deal);
});

// ── Update deal ────────────────────────────────────────────────
router.patch('/:id', requireAuth, requireRole('admin', 'sales'), (req, res) => {
  const existing = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
  if (!existing) return res.status(404).json({ error: 'Deal not found' });

  const { name, stage, owner, source, value_monthly, value_total, close_probability, notes, facility_id } = req.body;

  if (stage && !VALID_STAGES.includes(stage)) {
    return res.status(400).json({ error: `Stage must be one of: ${VALID_STAGES.join(', ')}` });
  }
  if (source && !VALID_SOURCES.includes(source)) {
    return res.status(400).json({ error: `Source must be one of: ${VALID_SOURCES.join(', ')}` });
  }

  const updates = {};
  if (name !== undefined) updates.name = name;
  if (stage !== undefined) updates.stage = stage;
  if (owner !== undefined) updates.owner = owner;
  if (source !== undefined) updates.source = source;
  if (value_monthly !== undefined) updates.value_monthly = value_monthly;
  if (value_total !== undefined) updates.value_total = value_total;
  if (close_probability !== undefined) updates.close_probability = close_probability;
  if (notes !== undefined) updates.notes = notes;
  if (facility_id !== undefined) updates.facility_id = facility_id;

  // WHY: Auto-set closed_at when deal reaches a closing stage
  if (stage && CLOSING_STAGES.includes(stage) && !existing.closed_at) {
    updates.closed_at = new Date().toISOString();
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  updates.updated_at = new Date().toISOString();

  const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
  const values = Object.values(updates);
  values.push(req.params.id);

  db.prepare(`UPDATE deals SET ${setClauses} WHERE id = ?`).run(...values);

  // Log stage changes as activities
  if (stage && stage !== existing.stage) {
    db.prepare(`
      INSERT INTO activities (id, deal_id, actor, action, detail)
      VALUES (?, ?, ?, 'stage_changed', ?)
    `).run(generateId(), req.params.id, req.admin.email, JSON.stringify({ from: existing.stage, to: stage }));
  }

  const updated = db.prepare('SELECT * FROM deals WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// ── Delete deal ────────────────────────────────────────────────
router.delete('/:id', requireAuth, requireRole('admin'), (req, res) => {
  const result = db.prepare('DELETE FROM deals WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Deal not found' });
  res.json({ ok: true });
});

// ── Get activities for a deal ──────────────────────────────────
router.get('/:id/activities', requireAuth, (req, res) => {
  const activities = db.prepare(
    'SELECT * FROM activities WHERE deal_id = ? ORDER BY created_at DESC'
  ).all(req.params.id);
  res.json(activities);
});

module.exports = router;
