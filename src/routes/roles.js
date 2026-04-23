const express = require('express');
const db = require('../db/database');
const { requireAuth, requirePermission } = require('../middleware/auth');
const { getAllPermissions } = require('../services/permissions');

const router = express.Router();

// WHY: All role/permission management requires settings:edit — sensitive admin-only operation
router.use(requireAuth, requirePermission('settings', 'edit'));

// ── List all role permissions ──────────────────────────────────
router.get('/permissions', (req, res) => {
  res.json(
    db.prepare('SELECT role, module, permission FROM role_permissions ORDER BY role, module').all()
  );
});

// ── Update a role permission ───────────────────────────────────
router.patch('/permissions', (req, res) => {
  const { role, module, permission } = req.body;

  if (!role || !module || !permission) {
    return res.status(400).json({ error: 'role, module, and permission are required' });
  }
  if (role === 'super_admin') {
    return res.status(403).json({ error: 'Super Admin permissions cannot be modified' });
  }
  if (!['edit', 'view', 'none'].includes(permission)) {
    return res.status(400).json({ error: 'Invalid permission' });
  }

  db.prepare(
    'INSERT INTO role_permissions (role, module, permission) VALUES (?, ?, ?) ON CONFLICT(role, module) DO UPDATE SET permission = ?'
  ).run(role, module, permission, permission);

  res.json({ ok: true });
});

// ── Get effective permissions for a specific user ──────────────
router.get('/users/:id/permissions', (req, res) => {
  const user = db.prepare('SELECT id, role FROM admin_users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json(getAllPermissions(db, user));
});

// ── Override a user's permission on a module ───────────────────
router.patch('/users/:id/permissions', (req, res) => {
  const { module, permission } = req.body;

  const user = db.prepare('SELECT id, role FROM admin_users WHERE id = ?').get(req.params.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'super_admin') {
    return res.status(403).json({ error: 'Super Admin permissions cannot be modified' });
  }
  if (!module || !permission) {
    return res.status(400).json({ error: 'module and permission are required' });
  }

  db.prepare(
    'INSERT INTO user_permissions (user_id, module, permission) VALUES (?, ?, ?) ON CONFLICT(user_id, module) DO UPDATE SET permission = ?'
  ).run(user.id, module, permission, permission);

  res.json({ ok: true });
});

module.exports = router;
