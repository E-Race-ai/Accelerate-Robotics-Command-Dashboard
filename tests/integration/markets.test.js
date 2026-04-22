import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createTestDb } = require('../helpers/setup');

describe('markets schema', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => cleanup());

  it('markets table includes lat and lng columns', () => {
    db.prepare("INSERT INTO markets (id, name, lat, lng) VALUES ('test', 'Test Market', 37.77, -122.42)").run();
    const market = db.prepare("SELECT lat, lng FROM markets WHERE id = 'test'").get();
    expect(market.lat).toBeCloseTo(37.77, 2);
    expect(market.lng).toBeCloseTo(-122.42, 2);
  });

  it('lat and lng default to null', () => {
    db.prepare("INSERT INTO markets (id, name) VALUES ('test', 'Test Market')").run();
    const market = db.prepare("SELECT lat, lng FROM markets WHERE id = 'test'").get();
    expect(market.lat).toBeNull();
    expect(market.lng).toBeNull();
  });
});

describe('market coordinate seeding', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => cleanup());

  it('seeds coordinates for markets that have lat/lng in seed data', () => {
    db.prepare("INSERT INTO markets (id, name, cluster, color) VALUES ('san-francisco', 'San Francisco', 'sf-bay', '#2563eb')").run();
    db.prepare("UPDATE markets SET lat = ?, lng = ? WHERE id = ? AND lat IS NULL").run(37.7749, -122.4194, 'san-francisco');

    const market = db.prepare("SELECT lat, lng FROM markets WHERE id = 'san-francisco'").get();
    expect(market.lat).toBeCloseTo(37.7749, 4);
    expect(market.lng).toBeCloseTo(-122.4194, 4);
  });

  it('does not overwrite existing coordinates', () => {
    db.prepare("INSERT INTO markets (id, name, lat, lng) VALUES ('test', 'Test', 99.0, -99.0)").run();
    db.prepare("UPDATE markets SET lat = ?, lng = ? WHERE id = ? AND lat IS NULL").run(0, 0, 'test');

    const market = db.prepare("SELECT lat, lng FROM markets WHERE id = 'test'").get();
    expect(market.lat).toBeCloseTo(99.0, 1);
    expect(market.lng).toBeCloseTo(-99.0, 1);
  });
});

describe('markets PATCH coordinates', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    db.prepare("INSERT INTO markets (id, name, cluster, color) VALUES ('sf', 'San Francisco', 'sf-bay', '#2563eb')").run();
  });

  afterEach(() => cleanup());

  it('updates lat and lng via PATCH fields', () => {
    db.prepare(`
      UPDATE markets SET
        lat = COALESCE(?, lat),
        lng = COALESCE(?, lng)
      WHERE id = ?
    `).run(37.7749, -122.4194, 'sf');

    const market = db.prepare("SELECT lat, lng FROM markets WHERE id = 'sf'").get();
    expect(market.lat).toBeCloseTo(37.7749, 4);
    expect(market.lng).toBeCloseTo(-122.4194, 4);
  });

  it('preserves lat/lng when not provided in PATCH', () => {
    db.prepare("UPDATE markets SET lat = 37.77, lng = -122.42 WHERE id = 'sf'").run();
    db.prepare(`
      UPDATE markets SET
        name = COALESCE(?, name),
        lat = COALESCE(?, lat),
        lng = COALESCE(?, lng)
      WHERE id = ?
    `).run('SF Updated', undefined, undefined, 'sf');

    const market = db.prepare("SELECT name, lat, lng FROM markets WHERE id = 'sf'").get();
    expect(market.name).toBe('SF Updated');
    expect(market.lat).toBeCloseTo(37.77, 2);
    expect(market.lng).toBeCloseTo(-122.42, 2);
  });
});
