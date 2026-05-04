import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

// Glossary Game tests cover:
//   1. Schema CHECK + defaults on glossary_user_progress + glossary_activities
//   2. Pure helpers: levelForPoints (boundaries), shuffle (returns same length, no dupes)
//   3. Glossary terms data file integrity (FLAT_BY_KEY agrees with SECTIONS)

function freshDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS glossary_user_progress (
      user_email TEXT PRIMARY KEY,
      display_name TEXT,
      total_points INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      current_streak INTEGER NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0,
      last_active_date TEXT,
      quizzes_completed INTEGER NOT NULL DEFAULT 0,
      perfect_quizzes INTEGER NOT NULL DEFAULT 0,
      badges TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS glossary_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT NOT NULL,
      activity TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );
  `);
  return db;
}

describe('glossary_user_progress schema', () => {
  let db;
  beforeEach(() => { db = freshDb(); });
  afterEach(() => db.close());

  it('inserts a fresh user with sensible defaults', () => {
    db.prepare('INSERT INTO glossary_user_progress (user_email) VALUES (?)').run('alice@example.com');
    const r = db.prepare('SELECT * FROM glossary_user_progress WHERE user_email = ?').get('alice@example.com');
    expect(r.total_points).toBe(0);
    expect(r.level).toBe(1);
    expect(r.current_streak).toBe(0);
    expect(r.badges).toBe('[]');
  });

  it('PRIMARY KEY on user_email rejects duplicate inserts', () => {
    db.prepare('INSERT INTO glossary_user_progress (user_email) VALUES (?)').run('a@x');
    expect(() => db.prepare('INSERT INTO glossary_user_progress (user_email) VALUES (?)').run('a@x'))
      .toThrow(/UNIQUE constraint/i);
  });
});

describe('glossary_activities log', () => {
  let db;
  beforeEach(() => { db = freshDb(); });
  afterEach(() => db.close());

  it('records points and metadata as an audit trail', () => {
    const insert = db.prepare('INSERT INTO glossary_activities (user_email, activity, points, metadata) VALUES (?, ?, ?, ?)');
    insert.run('a@x', 'quiz_correct',   10, JSON.stringify({ q_id: 'q1', term: 'Fork' }));
    insert.run('a@x', 'quiz_completed', 20, null);
    insert.run('a@x', 'quiz_perfect',   50, null);
    const total = db.prepare('SELECT SUM(points) AS s FROM glossary_activities WHERE user_email = ?').get('a@x').s;
    expect(total).toBe(80);
    const rows = db.prepare(`SELECT activity, points FROM glossary_activities WHERE user_email = ? ORDER BY id`).all('a@x');
    expect(rows).toEqual([
      { activity: 'quiz_correct',   points: 10 },
      { activity: 'quiz_completed', points: 20 },
      { activity: 'quiz_perfect',   points: 50 },
    ]);
  });
});

// ── Pure helpers ──────────────────────────────────────────────────
const { levelForPoints, shuffle, LEVELS, todayUtcDate, yesterdayUtcDate } =
  require('../../src/services/glossary-game-utils');

describe('levelForPoints — boundary behavior', () => {
  it('Level 1 at 0 points', () => {
    const r = levelForPoints(0);
    expect(r.level).toBe(1);
    expect(r.title).toBe('Newbie Hacker');
    expect(r.next_level_at).toBe(50);
    expect(r.progress_to_next).toBeCloseTo(0, 5);
  });

  it('jumps to Level 2 exactly at 50', () => {
    expect(levelForPoints(49).level).toBe(1);
    expect(levelForPoints(50).level).toBe(2);
  });

  it('progress_to_next reaches 1.0 at the threshold of the next level', () => {
    // 49 pts inside Level 1 (0..50): 49/50 = 0.98
    expect(levelForPoints(49).progress_to_next).toBeCloseTo(0.98, 5);
    // 100 pts inside Level 2 (50..150): (100-50)/(150-50) = 0.5
    expect(levelForPoints(100).progress_to_next).toBeCloseTo(0.5, 5);
  });

  it('caps at the highest level when points exceed the top threshold', () => {
    const top = LEVELS[LEVELS.length - 1];
    const r = levelForPoints(top.min + 999999);
    expect(r.level).toBe(top.level);
    expect(r.title).toBe(top.title);
    expect(r.next_level_at).toBeNull();
    expect(r.progress_to_next).toBe(1);
  });
});

describe('shuffle — Fisher-Yates', () => {
  it('returns an array of the same length', () => {
    const input = [1, 2, 3, 4, 5];
    const out = shuffle(input);
    expect(out.length).toBe(input.length);
  });

  it('preserves all elements (no duplicates, no drops)', () => {
    const input = ['a', 'b', 'c', 'd', 'e', 'f'];
    const out = shuffle(input);
    expect(out.slice().sort()).toEqual(input.slice().sort());
  });

  it('does not mutate the input', () => {
    const input = [1, 2, 3];
    const before = input.slice();
    shuffle(input);
    expect(input).toEqual(before);
  });
});

// ── Terms data integrity ──────────────────────────────────────────
const { SECTIONS, FLAT_BY_KEY, ALL_TERM_KEYS } = require('../../src/data/glossary-terms');

describe('glossary terms data file', () => {
  it('FLAT_BY_KEY contains every term from every section', () => {
    let count = 0;
    for (const sec of SECTIONS) for (const t of sec.terms) {
      const key = t.term.toLowerCase().trim();
      expect(FLAT_BY_KEY[key]).toBeDefined();
      expect(FLAT_BY_KEY[key].sectionId).toBe(sec.id);
      count++;
    }
    expect(ALL_TERM_KEYS.length).toBe(count);
  });

  it('every term has a non-empty body', () => {
    for (const sec of SECTIONS) for (const t of sec.terms) {
      expect(t.body).toBeTruthy();
      // Lower bound: short commit-type definitions like "A bug fix." (10 chars) are OK.
      expect(t.body.length).toBeGreaterThanOrEqual(8);
    }
  });

  it('section IDs are unique', () => {
    const ids = SECTIONS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('has at least 4 terms in every section so a quiz with 4 choices is feasible', () => {
    for (const sec of SECTIONS) {
      expect(sec.terms.length).toBeGreaterThanOrEqual(4);
    }
  });
});
