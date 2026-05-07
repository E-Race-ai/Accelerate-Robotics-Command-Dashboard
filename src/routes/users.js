const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const db = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ALL_MODULES } = require('../services/permissions');
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
const { normalizePermissionInput, INVALID_PERMS, VALID_LEVELS } = require('../services/permissions-input');

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
  const { email, name, role } = req.body || {};
  const overrides = normalizePermissionInput(req.body);

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
  if (overrides === INVALID_PERMS) {
    return res.status(400).json({ error: 'Invalid modulePermissions payload' });
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

    // Replace per-user overrides wholesale — a re-invite should start from the matrix
    // the super admin picked in the modal, not whatever was saved on a previous invite.
    await db.run('DELETE FROM user_permissions WHERE user_id = ?', [userRow.id]);
    for (const [mod, perm] of Object.entries(overrides)) {
      await db.run(
        'INSERT INTO user_permissions (user_id, module, permission) VALUES (?, ?, ?)',
        [userRow.id, mod, perm],
      );
    }

    const origin = `${req.protocol}://${req.get('host')}`;
    const inviteUrl = `${origin}/accept-invite?token=${token}`;

    // WHY: Await the email send so we can tell the frontend if it failed.
    // The invite record is already saved, so a retry via resend-invite works
    // even if this first send fails.
    try {
      await sendInviteEmail({ to: email, name, inviterEmail: req.admin.email, role, inviteUrl });
    } catch (emailErr) {
      console.error('[users] invite email failed:', emailErr.message);
      return res.status(502).json({
        error: `Invite created but email failed to send: ${emailErr.message}`,
        inviteUrl,
      });
    }

    res.status(201).json({ id: userRow.id, email, status: 'invited', inviteUrl });
  } catch (err) {
    console.error('[users] invite error:', err);
    // WHY: Surface the actual error message so the admin can report it — the generic
    // "Failed to create invite" gives zero debugging info from the browser.
    res.status(500).json({ error: `Failed to create invite: ${err.message}` });
  }
});

// ── Resend invite (regenerate token + email) ───────────────────
router.post('/:id/resend-invite', async (req, res) => {
  const userId = parseInt(req.params.id, 10);
  const target = await db.one(
    'SELECT id, email, name, role, status FROM admin_users WHERE id = ?',
    [userId],
  );
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.status === 'active') {
    return res.status(409).json({ error: 'User is already active' });
  }
  if (target.role === 'super_admin') {
    return res.status(403).json({ error: 'Cannot re-invite a super_admin' });
  }

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + INVITE_TTL_MS).toISOString();

  try {
    await db.run(
      `UPDATE admin_users SET invite_token = ?, invite_expires_at = ?, status = 'invited', invited_by = ?
       WHERE id = ?`,
      [token, expiresAt, req.admin.id, userId],
    );

    const origin = `${req.protocol}://${req.get('host')}`;
    const inviteUrl = `${origin}/accept-invite?token=${token}`;

    try {
      await sendInviteEmail({ to: target.email, name: target.name, inviterEmail: req.admin.email, role: target.role, inviteUrl });
    } catch (emailErr) {
      console.error('[users] resend-invite email failed:', emailErr.message);
      return res.status(502).json({
        error: `Token refreshed but email failed to send: ${emailErr.message}`,
        inviteUrl,
      });
    }

    res.json({ ok: true, inviteUrl });
  } catch (err) {
    console.error('[users] resend-invite error:', err);
    res.status(500).json({ error: `Failed to resend invite: ${err.message}` });
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
  const raw = req.body?.overrides;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return res.status(400).json({ error: 'overrides object required' });
  }
  // Filter down to valid pairs — same rules as the invite path.
  const overrides = {};
  for (const [mod, perm] of Object.entries(raw)) {
    if (!ALL_MODULES.includes(mod)) continue;
    if (!VALID_LEVELS.includes(perm)) continue;
    overrides[mod] = perm;
  }

  const target = await db.one('SELECT id, role FROM admin_users WHERE id = ?', [userId]);
  if (!target) return res.status(404).json({ error: 'User not found' });
  if (target.role === 'super_admin') {
    return res.status(403).json({ error: 'Cannot override super_admin permissions' });
  }

  await db.transaction(async (tx) => {
    await tx.run('DELETE FROM user_permissions WHERE user_id = ?', [userId]);
    for (const [mod, perm] of Object.entries(overrides)) {
      await tx.run(
        'INSERT INTO user_permissions (user_id, module, permission) VALUES (?, ?, ?)',
        [userId, mod, perm],
      );
    }
  });
  res.json({ ok: true });
});

module.exports = router;
