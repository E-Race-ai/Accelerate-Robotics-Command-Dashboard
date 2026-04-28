// Collab Bulletin Board — cross-team help requests. Anyone on the team can
// post a request (new feature, tool, integration, etc.) and either tag a
// specific person whose skills match, or leave it open for whoever has
// bandwidth to claim it.

const express = require('express');
const db = require('../db/database');
const { requireAuth, softAuth } = require('../middleware/auth');
const { generateId } = require('../services/id-generator');

const router = express.Router();

const ALLOWED_TYPE = new Set(['feature', 'tool', 'integration', 'doc', 'design', 'other']);
const ALLOWED_PRIORITY = new Set(['low', 'medium', 'high', 'urgent']);
const ALLOWED_STATUS = new Set(['open', 'claimed', 'in_progress', 'done', 'archived']);

// Best-effort activity logger — failure must NEVER fail the user-facing call
async function logActivity(actor, action, detail) {
  try {
    await db.run(
      `INSERT INTO activities (id, deal_id, actor, action, detail) VALUES (?, NULL, ?, ?, ?)`,
      [generateId(), actor || 'system', action, JSON.stringify(detail || {})],
    );
  } catch (e) {
    console.warn('[collab] activity log failed:', e.message);
  }
}

// ── POST / — Create request (public so toolkit users without admin auth can post) ──
// WHY: Originally gated with requireAuth, which 401'd in production for users
// whose JWT had expired (or who never had one). Form field for identity is the
// requester_name/_email pair. If the user is logged in (softAuth attaches
// req.admin), their identity wins over body fields.
// Security keyword auto-flag — catches tickets the submitter forgot to flag.
// Conservative list to avoid false positives ("password reset" UX work
// shouldn't paint hazard). Add new patterns as we encounter them.
const SECURITY_KEYWORD_RE = /\b(no-sandbox|csp|xss|sql\s*injection|csrf|cve-\d+|secret\s+leak|leaked\s+token|leaked\s+credential|auth\s+bypass|privilege\s+escalation|rce|ssrf|directory\s+traversal)\b/i;

router.post('/', softAuth, async (req, res) => {
  const {
    type, title, description, skills,
    target_user, priority, due_date,
    requester_name, requester_email,
    is_security,
  } = req.body || {};

  if (!ALLOWED_TYPE.has(type)) {
    return res.status(400).json({ error: `type must be one of: ${[...ALLOWED_TYPE].join(', ')}` });
  }
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
    return res.status(400).json({ error: 'description too long' });
  }
  const prio = priority && ALLOWED_PRIORITY.has(priority) ? priority : 'medium';
  // Coerce truthy values (true, 1, "1", "true", "on") to 1; everything else to 0.
  const explicitSec = (is_security === true || is_security === 1
    || is_security === '1' || is_security === 'true' || is_security === 'on') ? 1 : 0;
  const finalSec = explicitSec || (SECURITY_KEYWORD_RE.test(`${title} ${description}`) ? 1 : 0);

  // Logged-in user takes precedence over form-supplied identity.
  const reqEmail = (req.admin && req.admin.email)
    || (requester_email ? String(requester_email).slice(0, 200) : null);
  const reqName = (req.admin && req.admin.name)
    || (requester_name ? String(requester_name).slice(0, 100) : null);
  const actor = reqEmail || reqName || 'anonymous';

  try {
    const r = await db.run(
      `INSERT INTO collab_requests
       (type, title, description, skills, requester_email, requester_name, target_user, priority, due_date, is_security)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        type,
        String(title).trim(),
        String(description).trim(),
        skills ? String(skills).slice(0, 300) : null,
        reqEmail,
        reqName,
        target_user ? String(target_user).slice(0, 200) : null,
        prio,
        due_date || null,
        finalSec,
      ],
    );

    await logActivity(actor, 'collab_requested', {
      collab_id: r.lastInsertRowid,
      title: String(title).trim(),
      type,
      priority: prio,
      target_user: target_user || null,
      is_security: finalSec,
    });

    res.status(201).json({ ok: true, id: r.lastInsertRowid, is_security: finalSec });
  } catch (e) {
    console.error('[collab] create failed:', e);
    res.status(500).json({ error: 'Failed to create request' });
  }
});

// ── GET / — List ─────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const { status, include_archived } = req.query;
  const where = [];
  const args = [];
  if (status && ALLOWED_STATUS.has(status)) { where.push('status = ?'); args.push(status); }
  // Hide archived rows by default — they're noise on the daily board.
  // Pass ?include_archived=1 (or status=archived) to see them.
  if (status !== 'archived' && include_archived !== '1' && include_archived !== 'true') {
    where.push("status != 'archived'");
  }
  try {
    const rows = await db.all(
      `SELECT * FROM collab_requests
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY
         is_security DESC,
         CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
         created_at DESC
       LIMIT 200`,
      args,
    );
    res.json(rows);
  } catch (e) {
    console.error('[collab] list failed:', e);
    res.status(500).json({ error: 'Failed to load requests' });
  }
});

// ── PATCH /:id — Claim, change status, or update fields ─────
router.patch('/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });

  const existing = await db.one('SELECT * FROM collab_requests WHERE id = ?', [id]);
  if (!existing) return res.status(404).json({ error: 'not found' });

  const { status, claim, priority, is_security } = req.body || {};
  const sets = [];
  const args = [];

  // "claim": shorthand for current user claiming the request
  if (claim === true) {
    sets.push('claimed_by = ?', 'claimed_at = datetime(\'now\')', 'status = ?');
    args.push(req.admin.email, 'claimed');
  }
  if (status && ALLOWED_STATUS.has(status)) {
    sets.push('status = ?');
    args.push(status);
    if (status === 'done' || status === 'archived') {
      sets.push('resolved_at = datetime(\'now\')');
    }
    if (status === 'archived') {
      sets.push('archived_at = datetime(\'now\')');
    }
  }
  if (priority && ALLOWED_PRIORITY.has(priority)) {
    sets.push('priority = ?');
    args.push(priority);
  }
  // Allow toggling the security flag from any value to 0/1
  if (typeof is_security !== 'undefined') {
    sets.push('is_security = ?');
    args.push(is_security ? 1 : 0);
  }

  if (sets.length === 0) return res.status(400).json({ error: 'no valid fields' });
  // Always bump updated_at on any patch so the auto-archive sweep stays accurate
  sets.push('updated_at = datetime(\'now\')');

  args.push(id);
  try {
    await db.run(`UPDATE collab_requests SET ${sets.join(', ')} WHERE id = ?`, args);

    if (claim === true) {
      await logActivity(req.admin.email, 'collab_claimed', {
        collab_id: id,
        title: existing.title,
      });
    } else if (status === 'done') {
      await logActivity(req.admin.email, 'collab_completed', {
        collab_id: id,
        title: existing.title,
      });
    }

    const updated = await db.one('SELECT * FROM collab_requests WHERE id = ?', [id]);
    res.json(updated);
  } catch (e) {
    console.error('[collab] update failed:', e);
    res.status(500).json({ error: 'Failed to update request' });
  }
});

// ── GET /team — list of admin users (for "tag a person" dropdown) ──
router.get('/team', requireAuth, async (_req, res) => {
  try {
    const rows = await db.all(
      `SELECT email, name FROM admin_users
       WHERE status = 'active'
       ORDER BY name COLLATE NOCASE, email`,
    );
    res.json(rows);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load team' });
  }
});

module.exports = router;
