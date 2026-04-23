const express = require('express');
const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');
const { sendPasswordResetEmail } = require('../services/email');

const router = express.Router();

const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours — long enough to avoid mid-session logouts
const TOKEN_MAX_AGE_S = TOKEN_MAX_AGE_MS / 1000;
const RESET_TTL_MS = 60 * 60 * 1000; // 1 hour — short window since user is already onboarded

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

  // Auto-login: sign JWT so the user lands in the dashboard without a second
  // login step. Renamed from `token` to avoid colliding with the invite token
  // destructured at the top of the handler.
  const sessionToken = jwt.sign(
    { id: row.id, email: row.email, role: row.role || 'viewer' },
    JWT_SECRET,
    { expiresIn: '24h' },
  );
  res.cookie('token', sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: TOKEN_MAX_AGE_MS,
  });
  res.json({ email: row.email, role: row.role });
});

// ── Forgot password — public, issues reset token + emails link ──
// WHY: Always returns 200 regardless of whether the email exists, so an
// attacker can't enumerate valid accounts by watching the response. Actual
// token generation + email send only happens for active users.
router.post('/forgot-password', async (req, res) => {
  const { email } = req.body || {};
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    // Still 200 so a bad-format email can't be distinguished from a missing one
    return res.json({ ok: true });
  }

  try {
    const user = await db.one(
      'SELECT id, email, name, status FROM admin_users WHERE email = ?',
      [email],
    );
    // Only active users get a reset — invited users should accept the invite
    // instead, and disabled users shouldn't be able to recover remotely.
    if (user && user.status === 'active') {
      const token = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + RESET_TTL_MS).toISOString();

      await db.run(
        'UPDATE admin_users SET reset_token = ?, reset_expires_at = ? WHERE id = ?',
        [token, expiresAt, user.id],
      );

      const origin = `${req.protocol}://${req.get('host')}`;
      const resetUrl = `${origin}/reset-password?token=${token}`;
      sendPasswordResetEmail({ to: user.email, name: user.name, resetUrl })
        .catch((err) => console.error('[auth] password reset email failed:', err.message));
    }
  } catch (err) {
    // Don't surface the failure to the caller — email-not-found and DB-error
    // both look identical, so a real user just retries or contacts an admin.
    console.error('[auth] forgot-password error:', err);
  }

  res.json({ ok: true });
});

// ── Validate reset token — public, backs the reset-password page ──
router.get('/validate-reset', async (req, res) => {
  const token = req.query.token;
  if (!token) return res.status(400).json({ error: 'token query param required' });
  const row = await db.one(
    "SELECT email, name, reset_expires_at FROM admin_users WHERE reset_token = ? AND status = 'active'",
    [token],
  );
  if (!row) return res.status(404).json({ error: 'Invalid or already-used reset link' });
  if (new Date(row.reset_expires_at) < new Date()) {
    return res.status(410).json({ error: 'This reset link has expired. Request a new one.' });
  }
  res.json({ email: row.email, name: row.name });
});

// ── Reset password — public, single-use token ──────────────────
// Does NOT auto-login. Cleaner security story: successful reset clears the
// token and the user logs in normally with the new password.
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body || {};
  if (!token) return res.status(400).json({ error: 'token required' });
  if (!password || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  const row = await db.one(
    "SELECT id, reset_expires_at FROM admin_users WHERE reset_token = ? AND status = 'active'",
    [token],
  );
  if (!row) return res.status(404).json({ error: 'Invalid or already-used reset link' });
  if (new Date(row.reset_expires_at) < new Date()) {
    return res.status(410).json({ error: 'This reset link has expired. Request a new one.' });
  }

  const BCRYPT_ROUNDS = 12;
  const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  await db.run(
    `UPDATE admin_users
     SET password_hash = ?, reset_token = NULL, reset_expires_at = NULL
     WHERE id = ?`,
    [hash, row.id],
  );
  // Invalidate any existing session so other devices need to re-login with
  // the new password — a user who just reset probably wants that.
  res.clearCookie('token', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
  });
  res.json({ ok: true });
});

module.exports = router;
