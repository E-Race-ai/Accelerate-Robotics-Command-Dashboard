const PERMISSION_LEVELS = { none: 0, view: 1, edit: 2 };

/**
 * Resolves effective permission for a user on a module.
 * Resolution order: super_admin → user override → role default → none.
 */
function getEffectivePermission(db, user, module) {
  // WHY: Super Admin always has full access — hardcoded, not editable
  if (user.role === 'super_admin') return 'edit';

  // WHY: Check per-user override first — allows Module Owners to have edit on specific modules
  const userOverride = db.prepare(
    'SELECT permission FROM user_permissions WHERE user_id = ? AND module = ?'
  ).get(user.id, module);
  if (userOverride) return userOverride.permission;

  // WHY: Fall back to role-level default
  const roleDefault = db.prepare(
    'SELECT permission FROM role_permissions WHERE role = ? AND module = ?'
  ).get(user.role, module);
  if (roleDefault) return roleDefault.permission;

  return 'none';
}

/**
 * Checks if user has at least the required permission level on a module.
 * edit (2) satisfies a view (1) check. none (0) fails everything.
 */
function hasPermission(db, user, module, requiredLevel) {
  const effective = getEffectivePermission(db, user, module);
  return PERMISSION_LEVELS[effective] >= PERMISSION_LEVELS[requiredLevel];
}

/**
 * Returns all effective permissions for a user across all modules.
 * Used by /api/auth/me to send permission map to the frontend.
 */
function getAllPermissions(db, user) {
  const modules = ['deals', 'prospects', 'assessments', 'fleet', 'investors', 'inquiries', 'settings'];
  const result = {};
  for (const mod of modules) {
    result[mod] = getEffectivePermission(db, user, mod);
  }
  return result;
}

module.exports = { getEffectivePermission, hasPermission, getAllPermissions, PERMISSION_LEVELS };
