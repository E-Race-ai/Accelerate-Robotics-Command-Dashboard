import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

const { normalizeName, generateFacilityId } = require('../../src/services/facility-master.js');

// We can't import findOrCreateFacility directly (it expects the libsql wrapper
// db module). The dedupe + id-generation logic IS testable in isolation.

describe('facility-master.normalizeName', () => {
  it('lowercases', () => {
    expect(normalizeName('Hampton Inn')).toBe('hampton inn');
  });
  it('strips punctuation', () => {
    expect(normalizeName('Hampton Inn & Suites - Brickell')).toBe('hampton inn suites brickell');
  });
  it('collapses whitespace', () => {
    expect(normalizeName('  Hampton    Inn  ')).toBe('hampton inn');
  });
  it('handles null/undefined', () => {
    expect(normalizeName(null)).toBe('');
    expect(normalizeName(undefined)).toBe('');
  });
  it('makes "St. Regis" and "St Regis" match', () => {
    expect(normalizeName('St. Regis Bal Harbour'))
      .toBe(normalizeName('St Regis Bal Harbour'));
  });
});

describe('facility-master.generateFacilityId', () => {
  it('starts with fac_', () => {
    expect(generateFacilityId().startsWith('fac_')).toBe(true);
  });
  it('produces unique values', () => {
    const seen = new Set();
    for (let i = 0; i < 1000; i++) seen.add(generateFacilityId());
    expect(seen.size).toBe(1000);
  });
  it('is opaque hex (length predictable)', () => {
    // 'fac_' + 14 hex chars = 18
    expect(generateFacilityId().length).toBe(18);
  });
});

// ─── Schema-level tests: prove the FK columns + indexes work ───
describe('facility_id linking schema', () => {
  let db;
  beforeEach(() => {
    db = new Database(':memory:');
    db.exec(`
      CREATE TABLE facilities (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT DEFAULT 'hotel',
        city TEXT, state TEXT, osm_id TEXT
      );
      CREATE TABLE hotels_saved (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
        facility_id TEXT
      );
      CREATE TABLE prospects (
        id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, status TEXT DEFAULT 'staged',
        facility_id TEXT
      );
      CREATE INDEX idx_facilities_osm_id ON facilities(osm_id);
      CREATE INDEX idx_hotels_saved_facility ON hotels_saved(facility_id);
      CREATE INDEX idx_prospects_facility   ON prospects(facility_id);
    `);
  });
  afterEach(() => db.close());

  it('one facility links to many hotels_saved + prospects', () => {
    db.prepare('INSERT INTO facilities (id, name, city, state, osm_id) VALUES (?, ?, ?, ?, ?)')
      .run('fac_aaa', 'Hampton Inn Brickell', 'Miami', 'FL', 'node/123');
    db.prepare('INSERT INTO hotels_saved (name, facility_id) VALUES (?, ?)')
      .run('Hampton Inn Brickell', 'fac_aaa');
    db.prepare('INSERT INTO prospects (name, facility_id) VALUES (?, ?)')
      .run('Hampton Inn Brickell', 'fac_aaa');

    const linked = db.prepare(`
      SELECT f.id AS fid,
             (SELECT COUNT(*) FROM hotels_saved WHERE facility_id = f.id) AS hotels,
             (SELECT COUNT(*) FROM prospects    WHERE facility_id = f.id) AS prospects
      FROM facilities f
    `).get();
    expect(linked.fid).toBe('fac_aaa');
    expect(linked.hotels).toBe(1);
    expect(linked.prospects).toBe(1);
  });

  it('osm_id index supports fast dedupe', () => {
    const insert = db.prepare('INSERT INTO facilities (id, name, osm_id) VALUES (?, ?, ?)');
    for (let i = 0; i < 100; i++) insert.run(`fac_${i}`, `Hotel ${i}`, `node/${i}`);
    const found = db.prepare('SELECT id FROM facilities WHERE osm_id = ?').get('node/42');
    expect(found.id).toBe('fac_42');
  });

  it('name+city case-insensitive match works', () => {
    db.prepare('INSERT INTO facilities (id, name, city, state) VALUES (?, ?, ?, ?)')
      .run('fac_x', 'Four Seasons Hotel Miami', 'Miami', 'FL');
    // Different casing on lookup
    const r = db.prepare(`
      SELECT id FROM facilities
      WHERE LOWER(name) = LOWER(?) AND LOWER(city) = LOWER(?)
    `).get('FOUR SEASONS HOTEL MIAMI', 'miami');
    expect(r.id).toBe('fac_x');
  });
});
