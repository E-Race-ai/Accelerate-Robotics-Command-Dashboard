import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

// WhatsApp Hub schema-level tests. Mirrors the markets / forgot-password
// approach: spin up an in-memory DB with just the schema we need and
// exercise the SQL semantics the route module relies on.

function freshDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS whatsapp_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'team'
        CHECK(category IN ('team', 'project', 'customer', 'community', 'other')),
      invite_url TEXT,
      member_count INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_category ON whatsapp_groups(category);
    CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_pinned_updated ON whatsapp_groups(pinned DESC, updated_at DESC);
  `);
  return db;
}

describe('whatsapp_groups schema', () => {
  let db;
  beforeEach(() => { db = freshDb(); });
  afterEach(() => db.close());

  it('inserts a row with sensible defaults', () => {
    db.prepare('INSERT INTO whatsapp_groups (name) VALUES (?)').run('Robotics Eng');
    const row = db.prepare('SELECT * FROM whatsapp_groups WHERE name = ?').get('Robotics Eng');
    expect(row.category).toBe('team');
    expect(row.member_count).toBe(0);
    expect(row.pinned).toBe(0);
    expect(row.created_at).toBeTruthy();
    expect(row.updated_at).toBeTruthy();
  });

  it('rejects an invalid category via CHECK constraint', () => {
    expect(() => {
      db.prepare('INSERT INTO whatsapp_groups (name, category) VALUES (?, ?)').run('Bad', 'spam');
    }).toThrow(/CHECK constraint/i);
  });

  it('accepts every allowed category', () => {
    const cats = ['team', 'project', 'customer', 'community', 'other'];
    for (const c of cats) {
      db.prepare('INSERT INTO whatsapp_groups (name, category) VALUES (?, ?)').run(`G-${c}`, c);
    }
    const count = db.prepare('SELECT COUNT(*) AS n FROM whatsapp_groups').get().n;
    expect(count).toBe(cats.length);
  });

  it('NOT NULL on name is enforced', () => {
    expect(() => {
      db.prepare('INSERT INTO whatsapp_groups (name) VALUES (NULL)').run();
    }).toThrow(/NOT NULL/i);
  });
});

describe('whatsapp_groups ordering', () => {
  let db;
  beforeEach(() => { db = freshDb(); });
  afterEach(() => db.close());

  it('lists pinned groups before unpinned, then by updated_at DESC', () => {
    // Insert with deterministic timestamps so the ORDER BY is testable.
    const insert = db.prepare(
      'INSERT INTO whatsapp_groups (name, pinned, updated_at) VALUES (?, ?, ?)',
    );
    insert.run('Alpha (unpinned, oldest)',  0, '2026-01-01 10:00:00');
    insert.run('Beta (unpinned, newest)',   0, '2026-05-01 10:00:00');
    insert.run('Gamma (pinned, oldest)',    1, '2026-01-15 10:00:00');
    insert.run('Delta (pinned, newest)',    1, '2026-04-15 10:00:00');

    const rows = db.prepare(
      `SELECT name FROM whatsapp_groups
       ORDER BY pinned DESC, updated_at DESC, name ASC`,
    ).all();

    expect(rows.map(r => r.name)).toEqual([
      'Delta (pinned, newest)',
      'Gamma (pinned, oldest)',
      'Beta (unpinned, newest)',
      'Alpha (unpinned, oldest)',
    ]);
  });
});

describe('whatsapp_groups update semantics', () => {
  let db;
  beforeEach(() => {
    db = freshDb();
    db.prepare(
      'INSERT INTO whatsapp_groups (name, description, member_count) VALUES (?, ?, ?)',
    ).run('Original', 'first description', 5);
  });
  afterEach(() => db.close());

  it('partial update preserves untouched columns', () => {
    db.prepare(
      `UPDATE whatsapp_groups
       SET name = COALESCE(?, name),
           description = COALESCE(?, description),
           member_count = COALESCE(?, member_count),
           updated_at = datetime('now')
       WHERE id = 1`,
    ).run('Renamed', undefined, undefined);

    const row = db.prepare('SELECT * FROM whatsapp_groups WHERE id = 1').get();
    expect(row.name).toBe('Renamed');
    expect(row.description).toBe('first description');
    expect(row.member_count).toBe(5);
  });

  it('delete removes the row cleanly', () => {
    const r = db.prepare('DELETE FROM whatsapp_groups WHERE id = ?').run(1);
    expect(r.changes).toBe(1);
    const remaining = db.prepare('SELECT COUNT(*) AS n FROM whatsapp_groups').get().n;
    expect(remaining).toBe(0);
  });

  it('delete of a non-existent row reports zero changes', () => {
    const r = db.prepare('DELETE FROM whatsapp_groups WHERE id = ?').run(999);
    expect(r.changes).toBe(0);
  });
});

// ── Invite-URL host whitelist (route-level logic, lifted for unit testing) ──
// WHY: The route validates that invite_url lives on chat.whatsapp.com or
// wa.me. Lift just the validator into a self-contained function so a test
// can exercise the host whitelist without spinning up the full Express stack.
function sanitizeInviteUrl(raw) {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  let url;
  try { url = new URL(trimmed); } catch { return { error: 'invalid' }; }
  if (url.protocol !== 'https:') return { error: 'protocol' };
  if (!new Set(['chat.whatsapp.com', 'wa.me']).has(url.hostname)) return { error: 'host' };
  return { value: trimmed };
}

describe('whatsapp invite URL sanitizer', () => {
  it('accepts chat.whatsapp.com invite URLs', () => {
    expect(sanitizeInviteUrl('https://chat.whatsapp.com/AbCdEfGhIj')).toEqual({
      value: 'https://chat.whatsapp.com/AbCdEfGhIj',
    });
  });

  it('accepts wa.me URLs', () => {
    expect(sanitizeInviteUrl('https://wa.me/14155551234')).toEqual({
      value: 'https://wa.me/14155551234',
    });
  });

  it('rejects http:// (must be https)', () => {
    expect(sanitizeInviteUrl('http://chat.whatsapp.com/AbCdEf')).toEqual({ error: 'protocol' });
  });

  it('rejects unrelated hosts', () => {
    expect(sanitizeInviteUrl('https://example.com/foo')).toEqual({ error: 'host' });
  });

  it('rejects non-URL strings', () => {
    expect(sanitizeInviteUrl('not a url')).toEqual({ error: 'invalid' });
  });

  it('returns null for empty/whitespace input', () => {
    expect(sanitizeInviteUrl('')).toBeNull();
    expect(sanitizeInviteUrl('   ')).toBeNull();
    expect(sanitizeInviteUrl(undefined)).toBeNull();
    expect(sanitizeInviteUrl(null)).toBeNull();
  });
});
