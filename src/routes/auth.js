const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');

const router = express.Router();

const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours — long enough to avoid mid-session logouts
const TOKEN_MAX_AGE_S = TOKEN_MAX_AGE_MS / 1000;

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = await db.one('SELECT * FROM admin_users WHERE email = ?', [email]);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // WHY: Invited users haven't set a password yet; disabled users are soft-deleted.
  if (user.status === 'invited') {
    return res.status(401).json({ error: 'Accept your invite email before logging in' });
  }
  if (user.status === 'disabled') {
    return res.status(401).json({ error: 'Account disabled — contact your admin' });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // WHY: Track last login for the Users admin UI (and future inactivity pruning)
  await db.run('UPDATE admin_users SET last_login_at = datetime(\'now\') WHERE id = ?', [user.id]);

  const token = jwt.sign(
    { id: user.id, email: user.email, role: user.role || 'admin' },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: TOKEN_MAX_AGE_MS,
  });

  res.json({ email: user.email });
});

router.post('/logout', (req, res) => {
  // WHY: clearCookie must pass the same flags used when setting the cookie.
  // Without matching httpOnly/secure/sameSite, Chrome (with strict SameSite) silently ignores the clear.
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  res.json({ ok: true });
});

router.get('/me', requireAuth, async (req, res) => {
  // WHY: Frontend uses permission map to show/hide toolkit cards + gate UI actions.
  try {
    const { getAllPermissions } = require('../services/permissions');
    const permissions = await getAllPermissions(db, req.admin);
    res.json({ email: req.admin.email, role: req.admin.role, permissions });
  } catch {
    // Fail open on read: return basic identity if permission service errors
    res.json({ email: req.admin.email, role: req.admin.role, permissions: {} });
  }
});

// ── Validate invite token (public — HTML pre-fills accept form) ──
router.get('/validate-invite', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ error: 'token query param required' });
  const row = await db.one(
    'SELECT email, name, role, invite_expires_at FROM admin_users WHERE invite_token = ? AND status = \'invited\'',
    [token],
  );
  if (!row) return res.status(404).json({ error: 'Invalid or expired invite' });
  if (new Date(row.invite_expires_at) < new Date()) {
    return res.status(410).json({ error: 'Invite has expired. Ask your admin to re-invite.' });
  }
  res.json({ email: row.email, name: row.name, role: row.role });
});

// ── Accept invite — set password + name, activate account (public) ──
router.post('/accept-invite', async (req, res) => {
  const { token, password, name } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token required' });
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const row = await db.one(
    'SELECT id, email, role, invite_expires_at FROM admin_users WHERE invite_token = ? AND status = \'invited\'',
    [token],
  );
  if (!row) return res.status(404).json({ error: 'Invalid or expired invite' });
  if (new Date(row.invite_expires_at) < new Date()) {
    return res.status(410).json({ error: 'Invite has expired. Ask your admin to re-invite.' });
  }

  const BCRYPT_ROUNDS = 12;
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await db.run(
    `UPDATE admin_users
     SET password_hash = ?, name = COALESCE(?, name), status = 'active',
         invite_token = NULL, invite_expires_at = NULL, last_login_at = datetime('now')
     WHERE id = ?`,
    [hash, name || null, row.id],
  );

  // Auto-login: sign JWT so the user lands in the dashboard without a second login step.
  const token = jwt.sign(
    { id: row.id, email: row.email, role: row.role || 'viewer' },
    JWT_SECRET,
    { expiresIn: '24h' },
  );
  res.cookie('token', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: TOKEN_MAX_AGE_MS,
  });
  res.json({ email: row.email, role: row.role });
});

module.exports = router;
