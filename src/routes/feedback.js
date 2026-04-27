const express = require('express');
const multer = require('multer');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { generateId } = require('../services/id-generator');

const router = express.Router();

// WHY: 8MB per screenshot — enough for a high-DPI desktop capture, low enough
// that a casual paste-from-clipboard won't blow out memory or hit Render's
// request body limit.
const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_SCREENSHOTS = 6;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES, files: MAX_SCREENSHOTS },
});

const ALLOWED_TYPES = new Set(['bug', 'feature']);
const ALLOWED_SEVERITY = new Set(['low', 'medium', 'high', 'critical']);
const ALLOWED_STATUS = new Set(['new', 'triaged', 'in_progress', 'resolved', 'wontfix']);
const ALLOWED_MIME = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

// ── POST / — Public submit (no auth) ─────────────────────────
router.post('/', upload.array('screenshots', MAX_SCREENSHOTS), async (req, res) => {
  const {
    type,
    title,
    description,
    severity,
    page_url,
    user_email,
    user_name,
  } = req.body || {};

  // Validate required fields hard, optional fields softly
  if (!ALLOWED_TYPES.has(type)) {
    return res.status(400).json({ error: `type must be one of: ${[...ALLOWED_TYPES].join(', ')}` });
  }
  if (!title || String(title).trim().length === 0) {
    return res.status(400).json({ error: 'title is required' });
  }
  if (!description || String(description).trim().length === 0) {
    return res.status(400).json({ error: 'description is required' });
  }
  // WHY: Cap text fields to keep DB rows bounded and prevent abuse via paste bombs.
  if (String(title).length > 200) {
    return res.status(400).json({ error: 'title too long (max 200 chars)' });
  }
  if (String(description).length > 10000) {
    return res.status(400).json({ error: 'description too long (max 10000 chars)' });
  }
  const sev = severity && ALLOWED_SEVERITY.has(severity) ? severity : null;

  // Reject any screenshot that isn't a real image MIME
  const files = (req.files || []).filter(f => ALLOWED_MIME.has(f.mimetype));
  if ((req.files || []).length !== files.length) {
    return res.status(400).json({ error: 'screenshots must be PNG / JPEG / GIF / WebP' });
  }

  try {
    const result = await db.run(
      `INSERT INTO feedback (type, title, description, severity, page_url, user_email, user_name)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        type,
        String(title).trim(),
        String(description).trim(),
        sev,
        page_url ? String(page_url).slice(0, 500) : null,
        user_email ? String(user_email).slice(0, 200) : null,
        user_name ? String(user_name).slice(0, 100) : null,
      ],
    );

    const feedbackId = result.lastInsertRowid;

    // Insert screenshots one at a time — keeps memory pressure linear with file count
    for (const f of files) {
      await db.run(
        `INSERT INTO feedback_screenshots (feedback_id, filename, mime, bytes, data)
         VALUES (?, ?, ?, ?, ?)`,
        [feedbackId, f.originalname || null, f.mimetype, f.size, f.buffer],
      );
    }

    // Log to the activities feed so submissions show up in the Command
    // Center's air-traffic-control view. Best-effort — failure to log should
    // not fail the user-facing submit.
    // WHY: actor falls back to user_name/email/'anonymous' since the feedback
    // endpoint is public — the JWT may not be present.
    try {
      const actor = (user_name && String(user_name).trim())
        || (user_email && String(user_email).trim())
        || 'anonymous';
      const action = type === 'bug' ? 'bug_reported' : 'feature_requested';
      await db.run(
        `INSERT INTO activities (id, deal_id, actor, action, detail)
         VALUES (?, NULL, ?, ?, ?)`,
        [
          generateId(),
          actor,
          action,
          JSON.stringify({
            feedback_id: feedbackId,
            title: String(title).trim(),
            severity: sev,
            screenshots: files.length,
          }),
        ],
      );
    } catch (logErr) {
      console.warn('[feedback] activity log failed (non-fatal):', logErr.message);
    }

    res.status(201).json({
      ok: true,
      id: feedbackId,
      screenshots: files.length,
    });
  } catch (e) {
    console.error('[feedback] submit failed:', e);
    res.status(500).json({ error: 'Failed to save feedback' });
  }
});

// ── GET / — Admin list ────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const { status, type } = req.query;
  const where = [];
  const args = [];
  if (status && ALLOWED_STATUS.has(status)) { where.push('f.status = ?'); args.push(status); }
  if (type && ALLOWED_TYPES.has(type)) { where.push('f.type = ?'); args.push(type); }

  const sql = `
    SELECT f.id, f.type, f.title, f.description, f.severity, f.page_url,
           f.user_email, f.user_name, f.status, f.created_at, f.resolved_at,
           (SELECT COUNT(*) FROM feedback_screenshots s WHERE s.feedback_id = f.id) AS screenshot_count
    FROM feedback f
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY f.created_at DESC
    LIMIT 500
  `;
  try {
    const rows = await db.all(sql, args);
    res.json(rows);
  } catch (e) {
    console.error('[feedback] list failed:', e);
    res.status(500).json({ error: 'Failed to load feedback' });
  }
});

// ── GET /:id — Admin detail ───────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });

  try {
    const row = await db.one('SELECT * FROM feedback WHERE id = ?', [id]);
    if (!row) return res.status(404).json({ error: 'not found' });
    const shots = await db.all(
      'SELECT id, filename, mime, bytes, created_at FROM feedback_screenshots WHERE feedback_id = ? ORDER BY id',
      [id],
    );
    res.json({ ...row, screenshots: shots });
  } catch (e) {
    res.status(500).json({ error: 'Failed to load feedback item' });
  }
});

// ── PATCH /:id — Update status (admin) ────────────────────────
router.patch('/:id', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const { status } = req.body || {};
  if (!ALLOWED_STATUS.has(status)) {
    return res.status(400).json({ error: `status must be one of: ${[...ALLOWED_STATUS].join(', ')}` });
  }
  const resolvedAt = (status === 'resolved' || status === 'wontfix')
    ? "datetime('now')"
    : 'NULL';
  try {
    const r = await db.run(
      `UPDATE feedback SET status = ?, resolved_at = ${resolvedAt} WHERE id = ?`,
      [status, id],
    );
    if (!r.changes) return res.status(404).json({ error: 'not found' });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update feedback' });
  }
});

// ── GET /:id/screenshots/:shotId — Serve image bytes (admin) ──
router.get('/:id/screenshots/:shotId', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  const shotId = parseInt(req.params.shotId, 10);
  if (!Number.isFinite(id) || !Number.isFinite(shotId)) {
    return res.status(400).json({ error: 'invalid id' });
  }
  try {
    const row = await db.one(
      'SELECT mime, data FROM feedback_screenshots WHERE id = ? AND feedback_id = ?',
      [shotId, id],
    );
    if (!row) return res.status(404).json({ error: 'not found' });
    res.setHeader('Content-Type', row.mime);
    // libsql may return BLOBs as Uint8Array — normalize to Buffer for res.end
    const buf = Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
    res.end(buf);
  } catch (e) {
    res.status(500).json({ error: 'Failed to load screenshot' });
  }
});

module.exports = router;
