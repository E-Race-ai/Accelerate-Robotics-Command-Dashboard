import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const bcrypt = require('bcrypt');
const { createTestDb } = require('../helpers/setup');

// These tests exercise the forgot-password state machine directly at the DB
// level — the shape of what the route handler does (issue token, validate,
// consume on success) — without spinning up Express. That keeps the tests
// focused on the SQL semantics the security model depends on.
describe('forgot-password flow (DB semantics)', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    const hash = bcrypt.hashSync('original-password', 4);
    db.prepare(`
      INSERT INTO admin_users (id, email, password_hash, name, role, status)
      VALUES
        (1, 'active@example.com',   ?, 'Active User',   'admin',  'active'),
        (2, 'invited@example.com',  ?, 'Invited User',  'viewer', 'invited'),
        (3, 'disabled@example.com', ?, 'Disabled User', 'viewer', 'disabled')
    `).run(hash, hash, hash);
  });

  afterEach(() => cleanup());

  it('stores a reset token with expiry for an active user', () => {
    const token = 'a'.repeat(64);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.prepare(
      'UPDATE admin_users SET reset_token = ?, reset_expires_at = ? WHERE email = ?',
    ).run(token, expiresAt, 'active@example.com');

    const row = db.prepare(
      'SELECT reset_token, reset_expires_at FROM admin_users WHERE email = ?',
    ).get('active@example.com');
    expect(row.reset_token).toBe(token);
    expect(new Date(row.reset_expires_at).getTime()).toBeGreaterThan(Date.now());
  });

  it('validate-reset query rejects invited users even with a valid token', () => {
    // Simulate a bug where an invited user somehow got a reset token written.
    // The validate query must still reject them because status != 'active'.
    const token = 'b'.repeat(64);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.prepare(
      'UPDATE admin_users SET reset_token = ?, reset_expires_at = ? WHERE email = ?',
    ).run(token, expiresAt, 'invited@example.com');

    const row = db.prepare(
      "SELECT email FROM admin_users WHERE reset_token = ? AND status = 'active'",
    ).get(token);
    expect(row).toBeUndefined();
  });

  it('validate-reset query rejects disabled users', () => {
    const token = 'c'.repeat(64);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.prepare(
      'UPDATE admin_users SET reset_token = ?, reset_expires_at = ? WHERE email = ?',
    ).run(token, expiresAt, 'disabled@example.com');

    const row = db.prepare(
      "SELECT email FROM admin_users WHERE reset_token = ? AND status = 'active'",
    ).get(token);
    expect(row).toBeUndefined();
  });

  it('successful reset updates the hash and clears the token (single-use)', async () => {
    const token = 'd'.repeat(64);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    db.prepare(
      'UPDATE admin_users SET reset_token = ?, reset_expires_at = ? WHERE email = ?',
    ).run(token, expiresAt, 'active@example.com');

    const newHash = await bcrypt.hash('brand-new-pw', 4);
    db.prepare(`
      UPDATE admin_users
      SET password_hash = ?, reset_token = NULL, reset_expires_at = NULL
      WHERE reset_token = ? AND reset_expires_at > datetime('now')
    `).run(newHash, token);

    const row = db.prepare(
      'SELECT password_hash, reset_token, reset_expires_at FROM admin_users WHERE email = ?',
    ).get('active@example.com');
    expect(await bcrypt.compare('brand-new-pw', row.password_hash)).toBe(true);
    expect(row.reset_token).toBeNull();
    expect(row.reset_expires_at).toBeNull();

    // Attempt to reuse the same token — should find no rows.
    const reuseCheck = db.prepare(
      "SELECT email FROM admin_users WHERE reset_token = ? AND status = 'active'",
    ).get(token);
    expect(reuseCheck).toBeUndefined();
  });

  it('expired tokens are rejected by the time-window check', () => {
    const token = 'e'.repeat(64);
    // Expired 1 minute ago
    const expiredAt = new Date(Date.now() - 60 * 1000).toISOString();
    db.prepare(
      'UPDATE admin_users SET reset_token = ?, reset_expires_at = ? WHERE email = ?',
    ).run(token, expiredAt, 'active@example.com');

    // The query the route runs: find-by-token + status='active'. The row exists,
    // but the route layer compares reset_expires_at against now() and returns 410.
    const row = db.prepare(
      "SELECT reset_expires_at FROM admin_users WHERE reset_token = ? AND status = 'active'",
    ).get(token);
    expect(row).toBeDefined();
    expect(new Date(row.reset_expires_at).getTime()).toBeLessThan(Date.now());
  });

  it('issuing a new token for the same user overwrites the old one', () => {
    const oldToken = 'f'.repeat(64);
    const newToken = '0'.repeat(64);
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    db.prepare(
      'UPDATE admin_users SET reset_token = ?, reset_expires_at = ? WHERE email = ?',
    ).run(oldToken, expiresAt, 'active@example.com');

    db.prepare(
      'UPDATE admin_users SET reset_token = ?, reset_expires_at = ? WHERE email = ?',
    ).run(newToken, expiresAt, 'active@example.com');

    const oldLookup = db.prepare(
      "SELECT id FROM admin_users WHERE reset_token = ?",
    ).get(oldToken);
    const newLookup = db.prepare(
      "SELECT id FROM admin_users WHERE reset_token = ?",
    ).get(newToken);

    expect(oldLookup).toBeUndefined();
    expect(newLookup).toBeDefined();
  });
});
