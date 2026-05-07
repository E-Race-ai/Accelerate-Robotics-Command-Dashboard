// NOTE: Use ESM imports for vitest, use createRequire for CJS modules
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createTestDb, wrapAsLibsqlHelper } = require('../helpers/setup');

describe('Permission Resolution', () => {
  let raw, db, cleanup;

  beforeEach(() => {
    ({ db: raw, cleanup } = createTestDb());
    raw.prepare('INSERT INTO role_permissions (role, module, permission) VALUES (?, ?, ?)').run('admin', 'deals', 'edit');
    raw.prepare('INSERT INTO role_permissions (role, module, permission) VALUES (?, ?, ?)').run('viewer', 'deals', 'view');
    raw.prepare('INSERT INTO role_permissions (role, module, permission) VALUES (?, ?, ?)').run('module_owner', 'deals', 'view');
    raw.prepare('INSERT INTO role_permissions (role, module, permission) VALUES (?, ?, ?)').run('viewer', 'settings', 'none');
    db = wrapAsLibsqlHelper(raw);
  });

  afterEach(() => cleanup());

  it('super_admin always gets edit', async () => {
    const { getEffectivePermission } = require('../../src/services/permissions.js');
    expect(await getEffectivePermission(db, { role: 'super_admin', id: 1 }, 'deals')).toBe('edit');
    expect(await getEffectivePermission(db, { role: 'super_admin', id: 1 }, 'settings')).toBe('edit');
  });

  it('returns role default when no user override', async () => {
    const { getEffectivePermission } = require('../../src/services/permissions.js');
    expect(await getEffectivePermission(db, { role: 'viewer', id: 99 }, 'deals')).toBe('view');
  });

  it('user override takes precedence over role default', async () => {
    const { getEffectivePermission } = require('../../src/services/permissions.js');
    // WHY: Foreign key on user_permissions.user_id requires a matching admin_users row
    raw.prepare("INSERT INTO admin_users (id, email, password_hash) VALUES (99, 'user99@test.com', 'hash')").run();
    raw.prepare('INSERT INTO user_permissions (user_id, module, permission) VALUES (?, ?, ?)').run(99, 'deals', 'edit');
    expect(await getEffectivePermission(db, { role: 'viewer', id: 99 }, 'deals')).toBe('edit');
  });

  it('returns none when no role default and no user override', async () => {
    const { getEffectivePermission } = require('../../src/services/permissions.js');
    expect(await getEffectivePermission(db, { role: 'viewer', id: 99 }, 'settings')).toBe('none');
  });

  it('edit satisfies view check', async () => {
    const { hasPermission } = require('../../src/services/permissions.js');
    expect(await hasPermission(db, { role: 'admin', id: 1 }, 'deals', 'view')).toBe(true);
  });

  it('view does not satisfy edit check', async () => {
    const { hasPermission } = require('../../src/services/permissions.js');
    expect(await hasPermission(db, { role: 'viewer', id: 99 }, 'deals', 'edit')).toBe(false);
  });

  it('getAllPermissions returns map for all 15 modules', async () => {
    const { getAllPermissions } = require('../../src/services/permissions.js');
    raw.prepare('INSERT INTO role_permissions (role, module, permission) VALUES (?, ?, ?)').run('viewer', 'prospects', 'view');
    const perms = await getAllPermissions(db, { role: 'viewer', id: 99 });
    expect(perms.deals).toBe('view');
    expect(perms.settings).toBe('none');
    expect(Object.keys(perms)).toHaveLength(15);
  });
});
