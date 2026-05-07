const { ALL_MODULES } = require('./permissions');

const VALID_LEVELS = ['edit', 'view', 'none'];

// Sentinel returned by normalizePermissionInput when the caller sent something
// we won't silently coerce — the route should reject with 400.
const INVALID_PERMS = Symbol('invalid-permissions');

/**
 * Accepts either `modulePermissions: { deals: 'edit', ... }` (preferred) or
 * the legacy `modules: ['deals', 'prospects']` shape (treated as edit-on-those).
 * Returns a filtered map of valid (module, level) pairs. Unknown modules and
 * unknown levels are dropped. Returns INVALID_PERMS if the top-level
 * modulePermissions value is present but malformed (string, array, null).
 */
function normalizePermissionInput(body) {
  const out = {};
  const mp = body?.modulePermissions;
  if (mp !== undefined) {
    if (typeof mp !== 'object' || mp === null || Array.isArray(mp)) return INVALID_PERMS;
    for (const [mod, perm] of Object.entries(mp)) {
      if (!ALL_MODULES.includes(mod)) continue;
      if (!VALID_LEVELS.includes(perm)) continue;
      out[mod] = perm;
    }
    return out;
  }
  if (Array.isArray(body?.modules)) {
    for (const mod of body.modules) {
      if (ALL_MODULES.includes(mod)) out[mod] = 'edit';
    }
  }
  return out;
}

module.exports = { normalizePermissionInput, INVALID_PERMS, VALID_LEVELS };
