const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ALL_MODULES } = require('../services/permissions');
const { sendInviteEmail } = require('../services/email');

const router = express.Router();

const INVITE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — generous but bounded so stale tokens can't accumulate
const BCRYPT_ROUNDS = 12;

// All routes require admin or super_admin. Frontend enforces this too.
router.use(requireAuth, requireRole('super_admin', 'admin'));

// ── List users ─────────────────────────────────────────────────
router.get('/', async (req, res) => {
  const users = await db.all(`
    SELECT id, email, name, role, status, last_login_at, created_at
    FROM admin_users
    ORDER BY created_at DESC
  `);
  res.json(users);
});

// ── Invite user ────────────────────────────────────────────────
router.post('/invite', async (req, res) => {
  const { email, name, role, modulePermissions } = req.body || {};

  if (!email || !role) {
    return res.status(400).json({ error: 'email and role are required' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  const VALID_ROLES = ['admin', 'module_owner', 'viewer'];
  if (!VALID_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${VALID_ROLES.join(', ')}` });
  }

  // WHY: Super admin is protected — cannot be invited, only bootstrapped via env var
  const existing = await db.one('SELECT id, status FROM admin_users WHERE email = ?', [email]);
  if (existing && existing.status === 'active') {
    return res.status(409).json({ error: 'A user with this email is already active' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  try {
    if (existing) {
      // Re-invite: reset token + expiry, keep same id
      await db.run(
        `UPDATE admin_users SET role = ?, name = ?, invite_token = ?, invite_expires_at = ?, status = 'invited', invited_by = ?
         WHERE id = ?`,
        [role, name || '', token, expiresAt, req.admin.id, existing.id],
      );
    } else {
      // WHY: password_hash is set to empty for invited users — they set their real password on accept
      await db.run(
        `INSERT INTO admin_users (email, password_hash, name, role, invited_by, invite_token, invite_expires_at, status)
         VALUES (?, '', ?, ?, ?, ?, ?, 'invited')`,
        [email, name || '', role, req.admin.id, token, expiresAt],
      );
    }

    const userRow = await db.one('SELECT id FROM admin_users WHERE email = ?', [email]);

    // Apply module permission overrides if provided (for module_owner roles)
    if (modulePermissions && typeof modulePermissions === 'object') {
      await db.run('DELETE FROM user_permissions WHERE user_id = ?', [userRow.id]);
      for (const [mod, perm] of Object.entries(modulePermissions)) {
        if (!ALL_MODULES.includes(mod)) continue;
        if (!['edit', 'view', 'none'].includes(perm)) continue;
        await db.run(
          'INSERT INTO user_permissions (user_id, module, permission) VALUES (?, ?, ?)',
          [userRow.id, mod, perm],
        );
      }
    }

    const origin = `${req.protocol}://${req.get('host')}`;
    const inviteUrl = `${origin}/accept-invite?token=${token}`;
    sendInviteEmail({ to: email, name, inviterEmail: req.admin.email, role, inviteUrl })
      .catch((err) => console.error('[users] invite email failed:', err.message));

    res.status(201).json({ id: userRow.id, email, status: 'invited', inviteUrl });
  } catch (err) {
    console.error('[users] invite error:', err);
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

// ── Update user (role, name, status) ───────────────────────────
router.patch('/:id', async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { name, role, status } = req.body || {};

  const target = await db.one('SELECT id, role, email FROM admin_users WHERE id = ?', [userId]);
  if (!target) return res.status(404).json({ error: 'User not found' });
  // WHY: Super admin is protected against modification
  if (target.role === 'super_admin') {
    return res.status(403).json({ error: 'Cannot modify a super_admin' });
  }

  const sets = [];
  const args = [];
  if (name !== undefined) { sets.push('name = ?'); args.push(name); }
  if (role !== undefined) {
    if (!['admin', 'module_owner', 'viewer'].includes(role)) {
      return res.status(400).json({ error: 'Invalid role' });
    }
    sets.push('role = ?'); args.push(role);
  }
  if (status !== undefined) {
    if (!['active', 'disabled', 'invited'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    sets.push('status = ?'); args.push(status);
  }
  if (sets.length === 0) return res.status(400).json({ error: 'No fields to update' });

  args.push(userId);
  const result = await db.run(`UPDATE admin_users SET ${sets.join(', ')} WHERE id = ?`, args);
  if (result.changes === 0) return res.status(404).json({ error: 'User not found' });
  res.json({ ok: true });
});

// ── Delete user ────────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const target = await db.one('SELECT role FROM admin_users WHERE id = ?', [userId]);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'super_admin') {
    return res.status(403).json({ error: 'Cannot delete a super_admin' });
  }
  await db.run('DELETE FROM admin_users WHERE id = ?', [userId]);
  res.json({ ok: true });
});

// ── Get user's module permissions ──────────────────────────────
router.get('/:id/permissions', async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const user = await db.one('SELECT id, role FROM admin_users WHERE id = ?', [userId]);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const overrides = await db.all('SELECT module, permission FROM user_permissions WHERE user_id = ?', [userId]);
  res.json({ role: user.role, overrides });
});

// ── Update user's module permission overrides ──────────────────
router.put('/:id/permissions', async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const { overrides } = req.body || {};
  if (!overrides || typeof overrides !== 'object') {
    return res.status(400).json({ error: 'overrides object required' });
  }
  const target = await db.one('SELECT id, role FROM admin_users WHERE id = ?', [userId]);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'super_admin') {
    return res.status(403).json({ error: 'Cannot override super_admin permissions' });
  }

  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM user_permissions WHERE user_id = ?', [userId]);
    for (const [mod, perm] of Object.entries(overrides)) {
      if (!ALL_MODULES.includes(mod)) continue;
      if (!['edit', 'view', 'none'].includes(perm)) continue;
      await tx.run(
        'INSERT INTO user_permissions (user_id, module, permission) VALUES (?, ?, ?)',
        [userId, mod, perm],
      );
    }
  });
  res.json({ ok: true });
});

module.exports = router;
