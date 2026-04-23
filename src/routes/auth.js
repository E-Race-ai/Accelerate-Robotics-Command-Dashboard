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

  const user = await db.one('SELECT * FROM admin_users WHERE email = $1', [email]);
  if (!user) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const match = await bcrypt.compare(password, user.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

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

router.get('/me', requireAuth, (req, res) => {
  res.json({ email: req.admin.email, role: req.admin.role });
});

module.exports = router;
