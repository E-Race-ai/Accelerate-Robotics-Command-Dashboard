const express = require('express');
const db = require('../db/database');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ALL_MODULES } = require('../services/permissions');

const router = express.Router();
router.use(requireAuth, requireRole('super_admin', 'admin'));

const EDITABLE_ROLES = ['admin', 'module_owner', 'viewer'];

// ── Get full role × module permission matrix ───────────────────
router.get('/permissions', async (req, res) => {
  const rows = await db.all('SELECT role, module, permission FROM role_permissions');
  // Pivot into { role: { module: permission } }
  const matrix = {};
  for (const r of rows) {
    if (!matrix[r.role]) matrix[r.role] = {};
    matrix[r.role][r.module] = r.permission;
  }
  res.json({ matrix, modules: ALL_MODULES, roles: EDITABLE_ROLES });
});

// ── Update a single cell of the role × module matrix ──────────
// Frontend uses PATCH for point-edits from the permissions grid so one
// dropdown change doesn't have to re-send the whole matrix.
router.patch('/permissions', async (req, res) => {
  const { role, module, permission } = req.body || {};
  if (!EDITABLE_ROLES.includes(role)) {
    return res.status(400).json({ error: `role must be one of: ${EDITABLE_ROLES.join(', ')}` });
  }
  if (!ALL_MODULES.includes(module)) {
    return res.status(400).json({ error: 'Unknown module' });
  }
  if (!['edit', 'view', 'none'].includes(permission)) {
    return res.status(400).json({ error: 'permission must be edit, view, or none' });
  }
  await db.run(
    `INSERT INTO role_permissions (role, module, permission)
     VALUES (?, ?, ?)
     ON CONFLICT(role, module) DO UPDATE SET permission = excluded.permission`,
    [role, module, permission],
  );
  res.json({ ok: true });
});

// ── Update role × module permission matrix (bulk) ──────────────
router.put('/permissions', async (req, res) => {
  const { matrix } = req.body || {};
  if (!matrix || typeof matrix !== 'object') {
    return res.status(400).json({ error: 'matrix object required' });
  }

  await db.transaction(async (tx) => {
    for (const [role, perms] of Object.entries(matrix)) {
      if (!EDITABLE_ROLES.includes(role)) continue;
      for (const [mod, perm] of Object.entries(perms || {})) {
        if (!ALL_MODULES.includes(mod)) continue;
        if (!['edit', 'view', 'none'].includes(perm)) continue;
        // Upsert (INSERT OR REPLACE preserves our UNIQUE constraint)
        await tx.run(
          `INSERT INTO role_permissions (role, module, permission)
           VALUES (?, ?, ?)
           ON CONFLICT(role, module) DO UPDATE SET permission = excluded.permission`,
          [role, mod, perm],
        );
      }
    }
  });
  res.json({ ok: true });
});

module.exports = router;
