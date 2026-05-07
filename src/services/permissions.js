const PERMISSION_LEVELS = { none: 0, view: 1, edit: 2 };

// WHY: 15 toolkit modules map 1:1 to the admin Command Center cards.
// API-backed modules enforce permissions server-side via requirePermission middleware.
// Static page modules are frontend-only visibility toggles.
const ALL_MODULES = [
  'deals', 'prospects', 'assessments', 'robot_command', 'robot_catalog',
  'investors', 'national_rollout', 'financial_analysis', 'robots_dossier',
  'service_van', 'elevator_sim', 'elevator_install', 'elevator_bom',
  'inquiries', 'settings',
];

/**
 * Resolves effective permission for a user on a module.
 * Resolution order: super_admin → user override → role default → none.
 * db is the { one, all, run } helper bag from database.js — async.
 */
async function getEffectivePermission(db, user, module) {
  if (user.role === 'super_admin') return 'edit';

  const userOverride = await db.one(
    'SELECT permission FROM user_permissions WHERE user_id = ? AND module = ?',
    [user.id, module],
  );
  if (userOverride) return userOverride.permission;

  const roleDefault = await db.one(
    'SELECT permission FROM role_permissions WHERE role = ? AND module = ?',
    [user.role, module],
  );
  if (roleDefault) return roleDefault.permission;

  return 'none';
}

async function hasPermission(db, user, module, requiredLevel) {
  const effective = await getEffectivePermission(db, user, module);
  return PERMISSION_LEVELS[effective] >= PERMISSION_LEVELS[requiredLevel];
}

async function getAllPermissions(db, user) {
  const result = {};
  for (const mod of ALL_MODULES) {
    result[mod] = await getEffectivePermission(db, user, mod);
  }
  return result;
}

module.exports = { getEffectivePermission, hasPermission, getAllPermissions, ALL_MODULES, PERMISSION_LEVELS };
