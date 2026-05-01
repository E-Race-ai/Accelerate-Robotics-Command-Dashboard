// System Settings — runtime-editable key/value config that lives in SQLite.
// Today's only key is `creative_labs_url`: the cloudflared quick-tunnel URL
// pointing at Eric's home-dashboard on his MacBook (`localhost:3100`). The
// Robot Command and Beam Bot Playground tiles iframe whatever URL is stored
// here. When the tunnel rotates, an admin pastes a new URL via /admin/settings.

const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// WHY: 200 chars is plenty for a tunnel URL; rejecting anything longer keeps
// the admin form honest and the DB row small.
const MAX_VALUE_LEN = 200;

// WHY: Whitelisted keys only. Adding a new setting means adding it here on
// purpose — no implicit "any key is fine."
const ALLOWED_KEYS = new Set(['creative_labs_url']);

function isHttpsUrl(value) {
  try {
    const u = new URL(value);
    return u.protocol === 'https:' || u.protocol === 'http:';
  } catch {
    return false;
  }
}

// ── PUT /api/system-settings/:key — admin only ──────────────
router.put('/:key', requireAuth, async (req, res) => {
  const { key } = req.params;
  const { value } = req.body || {};

  if (!ALLOWED_KEYS.has(key)) {
    return res.status(400).json({ error: `unknown setting key: ${key}` });
  }
  if (typeof value !== 'string' || !value.trim()) {
    return res.status(400).json({ error: 'value is required' });
  }
  if (value.length > MAX_VALUE_LEN) {
    return res.status(400).json({ error: `value exceeds ${MAX_VALUE_LEN} chars` });
  }
  if (key === 'creative_labs_url' && !isHttpsUrl(value)) {
    return res.status(400).json({ error: 'creative_labs_url must be a valid http/https URL' });
  }

  const actorEmail = req.admin?.email || 'unknown';
  await db.run(
    `INSERT INTO system_settings (key, value, updated_at, updated_by)
     VALUES (?, ?, datetime('now'), ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
    [key, value.trim(), actorEmail],
  );

  const row = await db.one(`SELECT key, value, updated_at, updated_by FROM system_settings WHERE key = ?`, [key]);
  res.json(row);
});

// ── GET /api/system-settings/:key — admin only (full record) ──
router.get('/:key', requireAuth, async (req, res) => {
  const { key } = req.params;
  if (!ALLOWED_KEYS.has(key)) {
    return res.status(400).json({ error: `unknown setting key: ${key}` });
  }
  const row = await db.one(`SELECT key, value, updated_at, updated_by FROM system_settings WHERE key = ?`, [key]);
  if (!row) return res.status(404).json({ error: 'not set' });
  res.json(row);
});

module.exports = router;
