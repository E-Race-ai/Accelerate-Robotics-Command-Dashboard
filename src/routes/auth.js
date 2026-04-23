const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { requireAuth, JWT_SECRET } = require('../middleware/auth');
const { getAllPermissions } = require('../services/permissions');
const { sendPasswordResetEmail } = require('../services/email');

const router = express.Router();

const TOKEN_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours — long enough to avoid mid-session logouts
const TOKEN_MAX_AGE_S = TOKEN_MAX_AGE_MS / 1000;

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.prepare('SELECT * FROM admin_users WHERE email = ?').get(email);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  // WHY: Track last login for user management dashboard — shows stale accounts
  db.prepare('UPDATE admin_users SET last_login_at = datetime(?) WHERE id = ?').run(new Date().toISOString(), user.id);

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
  res.clearCookie('token');
  res.json({ ok: true });
});

router.get('/me', requireAuth, (req, res) => {
  const permissions = getAllPermissions(db, req.admin);
  res.json({ id: req.admin.id, email: req.admin.email, role: req.admin.role, permissions });
});

// ── Invite validation & acceptance ─────────────────────────────

router.get('/validate-invite', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  const user = db.prepare(
    'SELECT id, email, name, role, invite_expires_at FROM admin_users WHERE invite_token = ?'
  ).get(token);
  if (!user) return res.status(404).json({ error: 'Invalid or expired invite link' });
  if (new Date(user.invite_expires_at) < new Date()) {
    return res.status(410).json({ error: 'This invite has expired. Contact your admin for a new one.' });
  }

  res.json({ email: user.email, name: user.name, role: user.role });
});

router.post('/accept-invite', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const user = db.prepare('SELECT * FROM admin_users WHERE invite_token = ?').get(token);
  if (!user) return res.status(404).json({ error: 'Invalid or expired invite link' });
  if (new Date(user.invite_expires_at) < new Date()) {
    return res.status(410).json({ error: 'This invite has expired.' });
  }

  const hash = await bcrypt.hash(password, 12);
  db.prepare(
    "UPDATE admin_users SET password_hash = ?, status = 'active', invite_token = NULL, invite_expires_at = NULL WHERE id = ?"
  ).run(hash, user.id);

  const jwtToken = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.cookie('token', jwtToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: TOKEN_MAX_AGE_MS,
  });
  res.json({ email: user.email, role: user.role });
});

// ── Forgot / Reset password ────────────────────────────────────

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  const user = db.prepare('SELECT id, email, name, status FROM admin_users WHERE email = ?').get(email);
  // WHY: Always return success to prevent email enumeration attacks
  if (!user || user.status !== 'active') return res.json({ ok: true });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour — short window limits exposure
  db.prepare('UPDATE admin_users SET invite_token = ?, invite_expires_at = ? WHERE id = ?').run(token, expiresAt, user.id);

  sendPasswordResetEmail({ to: user.email, name: user.name, token });
  res.json({ ok: true });
});

router.get('/validate-reset', (req, res) => {
  const { token } = req.query;
  if (!token) return res.status(400).json({ error: 'Token is required' });

  const user = db.prepare(
    'SELECT id, email, invite_expires_at FROM admin_users WHERE invite_token = ? AND status = ?'
  ).get(token, 'active');
  if (!user) return res.status(404).json({ error: 'Invalid or expired reset link' });
  if (new Date(user.invite_expires_at) < new Date()) {
    return res.status(410).json({ error: 'This reset link has expired.' });
  }

  res.json({ email: user.email });
});

router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  if (!token || !password) return res.status(400).json({ error: 'Token and password are required' });
  if (password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });

  const user = db.prepare(
    'SELECT * FROM admin_users WHERE invite_token = ? AND status = ?'
  ).get(token, 'active');
  if (!user) return res.status(404).json({ error: 'Invalid or expired reset link' });
  if (new Date(user.invite_expires_at) < new Date()) {
    return res.status(410).json({ error: 'This reset link has expired.' });
  }

  const hash = await bcrypt.hash(password, 12);
  db.prepare(
    'UPDATE admin_users SET password_hash = ?, invite_token = NULL, invite_expires_at = NULL WHERE id = ?'
  ).run(hash, user.id);

  const jwtToken = jwt.sign({ id: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '24h' });
  res.cookie('token', jwtToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: TOKEN_MAX_AGE_MS,
  });
  res.json({ email: user.email, role: user.role });
});

module.exports = router;
