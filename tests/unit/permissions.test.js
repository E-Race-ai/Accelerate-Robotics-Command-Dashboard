// NOTE: Use ESM imports for vitest, use createRequire for CJS modules
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createTestDb } = require('../helpers/setup');

describe('Permission Resolution', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    db.prepare('INSERT INTO role_permissions (role, module, permission) VALUES (?, ?, ?)').run('admin', 'deals', 'edit');
    db.prepare('INSERT INTO role_permissions (role, module, permission) VALUES (?, ?, ?)').run('viewer', 'deals', 'view');
    db.prepare('INSERT INTO role_permissions (role, module, permission) VALUES (?, ?, ?)').run('module_owner', 'deals', 'view');
    db.prepare('INSERT INTO role_permissions (role, module, permission) VALUES (?, ?, ?)').run('viewer', 'settings', 'none');
  });

  afterEach(() => cleanup());

  it('super_admin always gets edit', () => {
    const { getEffectivePermission } = require('../../src/services/permissions.js');
    expect(getEffectivePermission(db, { role: 'super_admin', id: 1 }, 'deals')).toBe('edit');
    expect(getEffectivePermission(db, { role: 'super_admin', id: 1 }, 'settings')).toBe('edit');
  });

  it('returns role default when no user override', () => {
    const { getEffectivePermission } = require('../../src/services/permissions.js');
    expect(getEffectivePermission(db, { role: 'viewer', id: 99 }, 'deals')).toBe('view');
  });

  it('user override takes precedence over role default', () => {
    const { getEffectivePermission } = require('../../src/services/permissions.js');
    // WHY: Foreign key on user_permissions.user_id requires a matching admin_users row
    db.prepare("INSERT INTO admin_users (id, email, password_hash) VALUES (99, 'user99@test.com', 'hash')").run();
    db.prepare('INSERT INTO user_permissions (user_id, module, permission) VALUES (?, ?, ?)').run(99, 'deals', 'edit');
    expect(getEffectivePermission(db, { role: 'viewer', id: 99 }, 'deals')).toBe('edit');
  });

  it('returns none when no role default and no user override', () => {
    const { getEffectivePermission } = require('../../src/services/permissions.js');
    expect(getEffectivePermission(db, { role: 'viewer', id: 99 }, 'settings')).toBe('none');
  });

  it('edit satisfies view check', () => {
    const { hasPermission } = require('../../src/services/permissions.js');
    expect(hasPermission(db, { role: 'admin', id: 1 }, 'deals', 'view')).toBe(true);
  });

  it('view does not satisfy edit check', () => {
    const { hasPermission } = require('../../src/services/permissions.js');
    expect(hasPermission(db, { role: 'viewer', id: 99 }, 'deals', 'edit')).toBe(false);
  });

  it('getAllPermissions returns map for all modules', () => {
    const { getAllPermissions } = require('../../src/services/permissions.js');
    db.prepare('INSERT INTO role_permissions (role, module, permission) VALUES (?, ?, ?)').run('viewer', 'prospects', 'view');
    const perms = getAllPermissions(db, { role: 'viewer', id: 99 });
    expect(perms.deals).toBe('view');
    expect(perms.settings).toBe('none');
    expect(Object.keys(perms)).toHaveLength(15);
  });
});
