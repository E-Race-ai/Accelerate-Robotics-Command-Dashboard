import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const Database = require('better-sqlite3');

// Hotel Research tests cover:
//   1. Schema CHECK + defaults
//   2. ORDER BY semantics for the saved-hotels list
//   3. Pure helpers: estimateAdr (brand + star fallback), distanceMiles
//      (haversine), and shapeHotel (OSM element → API row)
//
// We do NOT hit Nominatim/Overpass in tests — the helpers are isolated
// in module.exports._test for direct unit testing, and live API tests
// would be flaky + impolite to free OSM operators.

function freshDb() {
  const db = new Database(':memory:');
  db.exec(`
    CREATE TABLE IF NOT EXISTS hotels_saved (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT, city TEXT, state TEXT, zip TEXT, country TEXT,
      lat REAL, lng REAL,
      brand TEXT, stars INTEGER, rooms INTEGER,
      phone TEXT, website TEXT, osm_id TEXT,
      est_adr_dollars INTEGER,
      status TEXT NOT NULL DEFAULT 'lead'
        CHECK(status IN ('lead', 'contacted', 'qualified', 'proposed', 'won', 'lost', 'archived')),
      notes TEXT, saved_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_hotels_saved_status ON hotels_saved(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_hotels_saved_city ON hotels_saved(city);
  `);
  return db;
}

describe('hotels_saved schema', () => {
  let db;
  beforeEach(() => { db = freshDb(); });
  afterEach(() => db.close());

  it('inserts with defaults — status=lead, created_at populated', () => {
    db.prepare('INSERT INTO hotels_saved (name) VALUES (?)').run('Hampton Inn Boston');
    const row = db.prepare('SELECT * FROM hotels_saved').get();
    expect(row.status).toBe('lead');
    expect(row.created_at).toBeTruthy();
    expect(row.updated_at).toBeTruthy();
  });

  it('rejects unknown status via CHECK constraint', () => {
    expect(() =>
      db.prepare('INSERT INTO hotels_saved (name, status) VALUES (?, ?)').run('X', 'maybe')
    ).toThrow(/CHECK constraint/i);
  });

  it('accepts every allowed status', () => {
    const statuses = ['lead', 'contacted', 'qualified', 'proposed', 'won', 'lost', 'archived'];
    for (const s of statuses) {
      db.prepare('INSERT INTO hotels_saved (name, status) VALUES (?, ?)').run(`H-${s}`, s);
    }
    expect(db.prepare('SELECT COUNT(*) AS n FROM hotels_saved').get().n).toBe(statuses.length);
  });

  it('NOT NULL on name is enforced', () => {
    expect(() =>
      db.prepare('INSERT INTO hotels_saved (name) VALUES (NULL)').run()
    ).toThrow(/NOT NULL/i);
  });

  it('orders saved hotels by updated_at DESC, then id DESC', () => {
    const insert = db.prepare('INSERT INTO hotels_saved (name, updated_at) VALUES (?, ?)');
    insert.run('Alpha (oldest)',  '2026-01-01 10:00:00');
    insert.run('Beta (newest)',   '2026-05-01 10:00:00');
    insert.run('Gamma (middle)',  '2026-03-01 10:00:00');
    const rows = db.prepare('SELECT name FROM hotels_saved ORDER BY updated_at DESC, id DESC').all();
    expect(rows.map(r => r.name)).toEqual(['Beta (newest)', 'Gamma (middle)', 'Alpha (oldest)']);
  });
});

// ── Pure helpers ──────────────────────────────────────────────────
// Imported directly from the utils module — no DB bootstrap needed.
const { estimateAdr, distanceMiles, normLocation, shapeHotel, BRAND_ADR_USD, STAR_ADR_USD } =
  require('../../src/services/hotel-research-utils');

describe('estimateAdr — brand match', () => {
  it('matches a known brand exactly', () => {
    expect(estimateAdr({ brand: 'Hampton Inn', stars: null })).toBe(BRAND_ADR_USD['hampton inn']);
  });

  it('is case-insensitive', () => {
    expect(estimateAdr({ brand: 'HAMPTON INN' })).toBe(BRAND_ADR_USD['hampton inn']);
  });

  it('partial-matches longer brand strings', () => {
    // "Hampton Inn & Suites Boston" should still infer the Hampton Inn rate.
    expect(estimateAdr({ brand: 'Hampton Inn & Suites Boston' })).toBe(BRAND_ADR_USD['hampton inn']);
  });

  it('returns null when brand is unknown and no stars', () => {
    expect(estimateAdr({ brand: 'Some Boutique Inn', stars: null })).toBeNull();
  });

  it('falls back to star rating when brand is unknown', () => {
    expect(estimateAdr({ brand: 'Unknown Brand', stars: 4 })).toBe(STAR_ADR_USD[4]);
  });

  it('returns null when neither brand nor stars resolve', () => {
    expect(estimateAdr({})).toBeNull();
    expect(estimateAdr({ brand: null, stars: 99 })).toBeNull();
  });
});

describe('distanceMiles — haversine sanity', () => {
  it('returns 0 for the same point', () => {
    expect(distanceMiles(40.7128, -74.0060, 40.7128, -74.0060)).toBeCloseTo(0, 3);
  });

  it('NYC → LA is ~2450 miles', () => {
    const d = distanceMiles(40.7128, -74.0060, 34.0522, -118.2437);
    expect(d).toBeGreaterThan(2400);
    expect(d).toBeLessThan(2500);
  });

  it('one degree of latitude ≈ 69 miles', () => {
    const d = distanceMiles(40, -74, 41, -74);
    expect(d).toBeGreaterThan(68);
    expect(d).toBeLessThan(70);
  });
});

describe('shapeHotel — OSM element → API row', () => {
  const center = { lat: 42.3601, lng: -71.0589 };

  it('shapes a node element with all common tags', () => {
    const el = {
      type: 'node', id: 12345,
      lat: 42.3503, lon: -71.0810,
      tags: {
        name: 'Hampton Inn Boston',
        tourism: 'hotel',
        brand: 'Hampton Inn',
        stars: '3',
        rooms: '170',
        phone: '+1-617-555-0100',
        website: 'https://hampton.example',
        'addr:housenumber': '811',
        'addr:street': 'Massachusetts Ave',
        'addr:city': 'Boston',
        'addr:state': 'MA',
        'addr:postcode': '02118',
      },
    };
    const out = shapeHotel(el, center.lat, center.lng);
    expect(out.osm_id).toBe('node/12345');
    expect(out.name).toBe('Hampton Inn Boston');
    expect(out.address).toBe('811 Massachusetts Ave, Boston, MA, 02118');
    expect(out.brand).toBe('Hampton Inn');
    expect(out.stars).toBe(3);
    expect(out.rooms).toBe(170);
    expect(out.estimated_adr_dollars).toBe(BRAND_ADR_USD['hampton inn']);
    expect(out.distance_miles).toBeGreaterThan(0);
    expect(out.distance_miles).toBeLessThan(20);
  });

  it('handles a way element with center coords', () => {
    const el = {
      type: 'way', id: 999,
      center: { lat: 42.3, lon: -71.05 },
      tags: { name: 'Some Hotel', tourism: 'hotel' },
    };
    const out = shapeHotel(el, center.lat, center.lng);
    expect(out.osm_id).toBe('way/999');
    expect(out.lat).toBe(42.3);
    expect(out.lng).toBe(-71.05);
  });

  it('returns null when the element has no usable coords', () => {
    const out = shapeHotel({ type: 'way', id: 1, tags: { name: 'X' } }, center.lat, center.lng);
    expect(out).toBeNull();
  });

  it('falls back to "(unnamed property)" when name is missing', () => {
    const el = { type: 'node', id: 1, lat: 42.3, lon: -71.05, tags: { tourism: 'motel' } };
    const out = shapeHotel(el, center.lat, center.lng);
    expect(out.name).toBe('(unnamed property)');
  });

  it('drops invalid star ratings (non-integer)', () => {
    const el = {
      type: 'node', id: 1, lat: 42.3, lon: -71.05,
      tags: { name: 'X', stars: 'four' },
    };
    expect(shapeHotel(el, center.lat, center.lng).stars).toBeNull();
  });
});

describe('normLocation — cache-key normalization', () => {
  it('lowercases and collapses whitespace', () => {
    expect(normLocation('  Boston, MA  ')).toBe('boston, ma');
    expect(normLocation('boston,    ma')).toBe('boston, ma');
  });

  it('returns empty string for null/undefined/empty', () => {
    expect(normLocation(null)).toBe('');
    expect(normLocation(undefined)).toBe('');
    expect(normLocation('')).toBe('');
  });
});
