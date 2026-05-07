import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { normalizePermissionInput, INVALID_PERMS } = require('../../src/services/permissions-input.js');

// WHY: The invite route used to accept a `modules: []` array (edit-only), but
// the frontend now sends a structured `modulePermissions: { module: level }`
// map so super admins can pick view/edit/none per module when inviting. These
// tests lock down both shapes + the rejection behavior on malformed payloads.
describe('normalizePermissionInput', () => {
  it('returns empty object when nothing is provided', () => {
    expect(normalizePermissionInput({})).toEqual({});
    expect(normalizePermissionInput(undefined)).toEqual({});
  });

  it('accepts modulePermissions object and filters to valid pairs', () => {
    const result = normalizePermissionInput({
      modulePermissions: {
        deals: 'edit',
        prospects: 'view',
        inquiries: 'none',
      },
    });
    expect(result).toEqual({
      deals: 'edit',
      prospects: 'view',
      inquiries: 'none',
    });
  });

  it('drops unknown modules silently', () => {
    const result = normalizePermissionInput({
      modulePermissions: {
        deals: 'edit',
        not_a_real_module: 'edit',
      },
    });
    expect(result).toEqual({ deals: 'edit' });
  });

  it('drops invalid permission levels silently', () => {
    const result = normalizePermissionInput({
      modulePermissions: {
        deals: 'admin',
        prospects: 'edit',
      },
    });
    expect(result).toEqual({ prospects: 'edit' });
  });

  it('returns INVALID_PERMS when modulePermissions is a non-object', () => {
    expect(normalizePermissionInput({ modulePermissions: 'edit' })).toBe(INVALID_PERMS);
    expect(normalizePermissionInput({ modulePermissions: ['deals'] })).toBe(INVALID_PERMS);
    expect(normalizePermissionInput({ modulePermissions: null })).toBe(INVALID_PERMS);
  });

  it('accepts legacy modules array as edit-only shortcut', () => {
    const result = normalizePermissionInput({ modules: ['deals', 'prospects'] });
    expect(result).toEqual({ deals: 'edit', prospects: 'edit' });
  });

  it('prefers modulePermissions when both shapes are present', () => {
    const result = normalizePermissionInput({
      modulePermissions: { deals: 'view' },
      modules: ['deals', 'prospects'],
    });
    expect(result).toEqual({ deals: 'view' });
  });

  it('handles all 15 modules without dropping any valid one', () => {
    const allModules = [
      'deals', 'prospects', 'assessments', 'robot_command', 'robot_catalog',
      'investors', 'national_rollout', 'financial_analysis', 'robots_dossier',
      'service_van', 'elevator_sim', 'elevator_install', 'elevator_bom',
      'inquiries', 'settings',
    ];
    const input = {};
    allModules.forEach(m => { input[m] = 'view'; });
    const result = normalizePermissionInput({ modulePermissions: input });
    expect(Object.keys(result)).toHaveLength(15);
    allModules.forEach(m => expect(result[m]).toBe('view'));
  });
});
