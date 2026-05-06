// Improvement Requests — public-facing form where any user can submit an
// improvement idea. All submissions are visible to all users (no auth
// required for GET or POST) so the team can track request status together.

const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { generateId } = require('../services/id-generator');

const router = express.Router();

const ALLOWED_CATEGORY = new Set(['ui', 'workflow', 'performance', 'integration', 'documentation', 'other']);
const ALLOWED_PRIORITY = new Set(['low', 'medium', 'high', 'critical']);
const ALLOWED_STATUS = new Set(['new', 'under_review', 'planned', 'in_progress', 'completed', 'declined']);

// WHY: Best-effort activity logger — failure must NEVER fail the user-facing call
async function logActivity(actor, action, detail) {
  try {
    await db.run(
      `INSERT INTO activities (id, deal_id, actor, action, detail) VALUES (?, NULL, ?, ?, ?)`,
      [generateId(), actor || 'anonymous', action, JSON.stringify(detail || {})],
    );
  } catch (e) {
    console.warn('[improvement] activity log failed:', e.message);
  }
}

// ── POST / — Public submit (no auth) ─────────────────────────
router.post('/', async (req, res) => {
  const {
    title, description, category, priority,
    user_name, user_email,
  } = req.body || {};

  if (!title || !String(title).trim()) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!description || !String(description).trim()) {
    return res.status(400).json({ error: 'description is required' });
  }
  if (String(title).length > 200) {
    return res.status(400).json({ error: 'title too long (max 200 chars)' });
  }
  if (String(description).length > 10000) {
    return res.status(400).json({ error: 'description too long (max 10000 chars)' });
  }

  const cat = category && ALLOWED_CATEGORY.has(category) ? category : 'other';
  const prio = priority && ALLOWED_PRIORITY.has(priority) ? priority : 'medium';

  try {
    const r = await db.run(
      `INSERT INTO improvement_requests (title, description, category, priority, user_name, user_email)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        String(title).trim(),
        String(description).trim(),
        cat,
        prio,
        user_name ? String(user_name).slice(0, 100) : null,
        user_email ? String(user_email).slice(0, 200) : null,
      ],
    );

    const requestId = r.lastInsertRowid;
    const actor = (user_name && String(user_name).trim())
      || (user_email && String(user_email).trim())
      || 'anonymous';

    await logActivity(actor, 'improvement_requested', {
      request_id: requestId,
      title: String(title).trim(),
      category: cat,
      priority: prio,
    });

    res.status(201).json({ ok: true, id: requestId });
  } catch (e) {
    console.error('[improvement] submit failed:', e);
    res.status(500).json({ error: 'Failed to save improvement request' });
  }
});

// ── GET / — Public list (all users can track) ────────────────
router.get('/', async (req, res) => {
  const { status, category } = req.query;
  const where = [];
  const args = [];
  if (status && ALLOWED_STATUS.has(status)) { where.push('status = ?'); args.push(status); }
  if (category && ALLOWED_CATEGORY.has(category)) { where.push('category = ?'); args.push(category); }

  try {
    const rows = await db.all(
      `SELECT id, title, description, category, priority, status,
              user_name, user_email, assigned_to, created_at, resolved_at
       FROM improvement_requests
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY
         CASE priority WHEN 'critical' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         created_at DESC
       LIMIT 500`,
      args,
    );
    res.json(rows);
  } catch (e) {
    console.error('[improvement] list failed:', e);
    res.status(500).json({ error: 'Failed to load improvement requests' });
  }
});

// ── GET /team — list portal users for assignment dropdown ─────
router.get('/team', async (_req, res) => {
  try {
    const rows = await db.all(
      `SELECT email, name FROM admin_users WHERE status = 'active' ORDER BY name COLLATE NOCASE, email`,
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load team' });
  }
});

// ── PATCH /:id — Update status and/or assignment (admin only) ─
router.patch('/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });

  const { status, assigned_to } = req.body || {};
  const sets = [];
  const args = [];

  if (status) {
    if (!ALLOWED_STATUS.has(status)) {
      return res.status(400).json({ error: `status must be one of: ${[...ALLOWED_STATUS].join(', ')}` });
    }
    sets.push('status = ?');
    args.push(status);
    if (status === 'completed' || status === 'declined') {
      sets.push("resolved_at = datetime('now')");
    } else {
      sets.push('resolved_at = NULL');
    }
  }

  if (assigned_to !== undefined) {
    sets.push('assigned_to = ?');
    args.push(assigned_to || null);
  }

  if (sets.length === 0) return res.status(400).json({ error: 'no valid fields to update' });

  args.push(id);
  try {
    const r = await db.run(
      `UPDATE improvement_requests SET ${sets.join(', ')} WHERE id = ?`,
      args,
    );
    if (!r.changes) return res.status(404).json({ error: 'not found' });
    const updated = await db.one('SELECT * FROM improvement_requests WHERE id = ?', [id]);
    res.json({ ok: true, request: updated });
  } catch (e) {
    console.error('[improvement] update failed:', e);
    res.status(500).json({ error: 'Failed to update request' });
  }
});

// ── DELETE /:id — Remove request (admin only) ────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });

  try {
    const r = await db.run('DELETE FROM improvement_requests WHERE id = ?', [id]);
    if (!r.changes) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[improvement] delete failed:', e);
    res.status(500).json({ error: 'Failed to delete request' });
  }
});

module.exports = router;
