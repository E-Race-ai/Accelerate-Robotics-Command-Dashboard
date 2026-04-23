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
// WHY: Each toolkit card in the command center dashboard is a separate module.
// API-backed modules (deals, prospects, assessments, inquiries) are enforced both
// frontend (card visibility) and backend (requirePermission middleware).
// Static page modules (robot_catalog, elevator_sim, etc.) are frontend-only visibility.
const ALL_MODULES = [
  'deals', 'prospects', 'assessments', 'robot_command', 'robot_catalog',
  'investors', 'national_rollout', 'financial_analysis', 'robots_dossier',
  'service_van', 'elevator_sim', 'elevator_install', 'elevator_bom',
  'inquiries', 'settings',
];

function getAllPermissions(db, user) {
  const result = {};
  for (const mod of ALL_MODULES) {
    result[mod] = getEffectivePermission(db, user, mod);
  }
  return result;
}

module.exports = { getEffectivePermission, hasPermission, getAllPermissions, ALL_MODULES, PERMISSION_LEVELS };
