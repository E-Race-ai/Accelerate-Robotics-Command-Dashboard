const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../db/database');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { sendInviteEmail } = require('../services/email');

const router = express.Router();

const BCRYPT_ROUNDS = 12; // Industry-standard cost factor — balances security vs. login latency
const INVITE_EXPIRY_HOURS = 24; // Long enough for timezone differences, short enough to limit exposure

// WHY: All user management requires settings:edit — only admins should manage team members
router.use(requireAuth, requirePermission('settings', 'edit'));

// ── List all users ─────────────────────────────────────────────
router.get('/', (req, res) => {
  const users = db.prepare(
    'SELECT id, email, name, role, status, last_login_at, created_at FROM admin_users ORDER BY created_at DESC'
  ).all();
  res.json(users);
});

// ── Invite a new user ──────────────────────────────────────────
router.post('/invite', async (req, res) => {
  const { email, name, role, modules } = req.body;

  if (!email || !role) {
    return res.status(400).json({ error: 'Email and role are required' });
  }

  const validRoles = ['admin', 'module_owner', 'viewer'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  const existing = db.prepare('SELECT id FROM admin_users WHERE email = ?').get(email);
  if (existing) {
    return res.status(409).json({ error: 'A user with this email already exists' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
  // WHY: Placeholder hash so the row has a valid password_hash — replaced when invite is accepted
  const placeholderHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), BCRYPT_ROUNDS);

  const result = db.prepare(
    "INSERT INTO admin_users (email, name, role, password_hash, status, invite_token, invite_expires_at, invited_by) VALUES (?, ?, ?, ?, 'invited', ?, ?, ?)"
  ).run(email, name || '', role, placeholderHash, token, expiresAt, req.admin.id);

  // WHY: Module owners get per-module edit permissions — set them at invite time
  if (role === 'module_owner' && Array.isArray(modules) && modules.length > 0) {
    const insert = db.prepare('INSERT INTO user_permissions (user_id, module, permission) VALUES (?, ?, ?)');
    for (const mod of modules) {
      insert.run(result.lastInsertRowid, mod, 'edit');
    }
  }

  const inviter = db.prepare('SELECT name, email FROM admin_users WHERE id = ?').get(req.admin.id);
  sendInviteEmail({
    to: email,
    name: name || email,
    inviterName: inviter?.name || inviter?.email || 'Accelerate Robotics',
    role,
    token,
  });

  res.status(201).json({ id: result.lastInsertRowid, email, role, status: 'invited' });
});

// ── Update a user ──────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  // WHY: Super admin can only be modified by the super admin themselves (for email/password changes)
  if (user.role === 'super_admin' && req.admin.role !== 'super_admin') {
    return res.status(403).json({ error: 'Cannot modify the Super Admin account' });
  }

  const { name, role, status, email, password } = req.body;
  const updates = [];
  const params = [];

  if (name !== undefined) {
    updates.push('name = ?');
    params.push(name);
  }
  if (email !== undefined) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    // WHY: Prevent duplicate emails — each admin account must have a unique email
    const emailTaken = db.prepare('SELECT id FROM admin_users WHERE email = ? AND id != ?').get(email, req.params.id);
    if (emailTaken) {
      return res.status(409).json({ error: 'A user with this email already exists' });
    }
    updates.push('email = ?');
    params.push(email);
  }
  if (password !== undefined) {
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    const hash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    updates.push('password_hash = ?');
    params.push(hash);
  }
  // WHY: Don't allow role changes on super_admin — role is set by the system, not editable
  if (role !== undefined && user.role !== 'super_admin') {
    if (!['admin', 'module_owner', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    updates.push('role = ?');
    params.push(role);
  }
  if (status !== undefined && user.role !== 'super_admin') {
    if (!['active', 'disabled'].includes(status)) {
      return res.status(400).json({ error: 'Status must be active or disabled' });
    }
    updates.push('status = ?');
    params.push(status);
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  params.push(req.params.id);
  db.prepare(`UPDATE admin_users SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  res.json(db.prepare('SELECT id, email, name, role, status FROM admin_users WHERE id = ?').get(req.params.id));
});

// ── Resend invite ──────────────────────────────────────────────
router.post('/:id/resend-invite', async (req, res) => {
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.status !== 'invited') return res.status(400).json({ error: 'User has already accepted their invite' });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_EXPIRY_HOURS * 60 * 60 * 1000).toISOString();
  db.prepare('UPDATE admin_users SET invite_token = ?, invite_expires_at = ? WHERE id = ?').run(token, expiresAt, user.id);

  const inviter = db.prepare('SELECT name, email FROM admin_users WHERE id = ?').get(req.admin.id);
  sendInviteEmail({
    to: user.email,
    name: user.name || user.email,
    inviterName: inviter?.name || inviter?.email || 'Accelerate Robotics',
    role: user.role,
    token,
  });

  res.json({ ok: true, message: 'Invite resent' });
});

// ── Delete a user ──────────────────────────────────────────────
router.delete('/:id', (req, res) => {
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'super_admin') return res.status(403).json({ error: 'Cannot delete the Super Admin account' });

  db.prepare('DELETE FROM admin_users WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

module.exports = router;
