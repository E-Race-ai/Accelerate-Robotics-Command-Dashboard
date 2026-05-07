import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createTestDb } = require('../helpers/setup');

// WHY: Test route handler logic directly against the DB to avoid spinning up Express,
// while still exercising real SQL including INSERT OR REPLACE and cascade behavior.

describe('assessment photos', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());

    // Seed an assessment for all photo tests
    db.prepare(`
      INSERT INTO assessments (id, property_name, assigned_to, facility_type)
      VALUES ('asm-1', 'Thesis Hotel', 'Tyler', 'hotel')
    `).run();

    // Seed a zone for zone_id linkage tests
    db.prepare(`
      INSERT INTO assessment_zones (id, assessment_id, zone_type, zone_name)
      VALUES ('zone-1', 'asm-1', 'lobby', 'Main Lobby')
    `).run();
  });

  afterEach(() => cleanup());

  describe('INSERT OR REPLACE upsert', () => {
    it('inserts a new photo row', () => {
      db.prepare(`
        INSERT OR REPLACE INTO assessment_photos
          (id, assessment_id, zone_id, checklist_item, photo_data, caption, taken_at)
        VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run('photo-1', 'asm-1', 'zone-1', 'wide_lobby_shot', Buffer.from('fake-jpeg'), 'Main lobby');

      const row = db.prepare("SELECT * FROM assessment_photos WHERE id = 'photo-1'").get();
      expect(row.id).toBe('photo-1');
      expect(row.assessment_id).toBe('asm-1');
      expect(row.checklist_item).toBe('wide_lobby_shot');
      expect(row.caption).toBe('Main lobby');
    });

    it('replaces an existing photo when the same id is re-uploaded', () => {
      db.prepare(`
        INSERT INTO assessment_photos (id, assessment_id, caption, taken_at)
        VALUES ('photo-1', 'asm-1', 'original caption', datetime('now'))
      `).run();

      db.prepare(`
        INSERT OR REPLACE INTO assessment_photos (id, assessment_id, caption, taken_at)
        VALUES ('photo-1', 'asm-1', 'updated caption', datetime('now'))
      `).run();

      const rows = db.prepare("SELECT * FROM assessment_photos WHERE id = 'photo-1'").all();
      expect(rows).toHaveLength(1);
      expect(rows[0].caption).toBe('updated caption');
    });
  });

  describe('list query (no blobs)', () => {
    it('returns metadata columns without photo_data', () => {
      db.prepare(`
        INSERT INTO assessment_photos (id, assessment_id, photo_data, caption, taken_at)
        VALUES ('photo-1', 'asm-1', X'deadbeef', 'test caption', datetime('now'))
      `).run();

      const photos = db.prepare(`
        SELECT id, assessment_id, zone_id, checklist_item, thumbnail, annotations, caption, taken_at
        FROM assessment_photos
        WHERE assessment_id = ?
        ORDER BY taken_at
      `).all('asm-1');

      expect(photos).toHaveLength(1);
      expect(photos[0].caption).toBe('test caption');
      // WHY: Confirm photo_data is NOT included in the projected columns
      expect(photos[0].photo_data).toBeUndefined();
    });
  });

  describe('get single photo', () => {
    it('returns photo_data as a Buffer from the DB', () => {
      const photoData = Buffer.from('fake-image-bytes');
      db.prepare(`
        INSERT INTO assessment_photos (id, assessment_id, photo_data, taken_at)
        VALUES ('photo-1', 'asm-1', ?, datetime('now'))
      `).run(photoData);

      const photo = db.prepare(`
        SELECT * FROM assessment_photos WHERE id = ? AND assessment_id = ?
      `).get('photo-1', 'asm-1');

      expect(photo).toBeTruthy();
      // WHY: better-sqlite3 returns BLOBs as Buffers — toString('base64') is the route handler's job
      expect(Buffer.isBuffer(photo.photo_data)).toBe(true);
      expect(photo.photo_data.toString('base64')).toBe(photoData.toString('base64'));
    });

    it('returns null when photo id and assessment id do not match', () => {
      db.prepare(`
        INSERT INTO assessment_photos (id, assessment_id, taken_at)
        VALUES ('photo-1', 'asm-1', datetime('now'))
      `).run();

      // WHY: Security check — wrong assessment_id should find nothing
      const photo = db.prepare(`
        SELECT * FROM assessment_photos WHERE id = ? AND assessment_id = ?
      `).get('photo-1', 'wrong-assessment');

      expect(photo).toBeUndefined();
    });
  });

  describe('delete', () => {
    it('deletes a photo when both ids match', () => {
      db.prepare(`
        INSERT INTO assessment_photos (id, assessment_id, taken_at)
        VALUES ('photo-1', 'asm-1', datetime('now'))
      `).run();

      const found = db.prepare(`
        SELECT id FROM assessment_photos WHERE id = ? AND assessment_id = ?
      `).get('photo-1', 'asm-1');
      expect(found).toBeTruthy();

      db.prepare('DELETE FROM assessment_photos WHERE id = ?').run('photo-1');

      const gone = db.prepare("SELECT id FROM assessment_photos WHERE id = 'photo-1'").get();
      expect(gone).toBeUndefined();
    });

    it('cascades deletion when parent assessment is deleted', () => {
      db.prepare(`
        INSERT INTO assessment_photos (id, assessment_id, taken_at)
        VALUES ('photo-1', 'asm-1', datetime('now'))
      `).run();

      db.prepare('DELETE FROM assessments WHERE id = ?').run('asm-1');

      const gone = db.prepare("SELECT id FROM assessment_photos WHERE id = 'photo-1'").get();
      expect(gone).toBeUndefined();
    });
  });

  describe('zone_id reference', () => {
    it('nullifies zone_id when the zone is deleted (ON DELETE SET NULL)', () => {
      db.prepare(`
        INSERT INTO assessment_photos (id, assessment_id, zone_id, taken_at)
        VALUES ('photo-1', 'asm-1', 'zone-1', datetime('now'))
      `).run();

      db.prepare('DELETE FROM assessment_zones WHERE id = ?').run('zone-1');

      const photo = db.prepare("SELECT * FROM assessment_photos WHERE id = 'photo-1'").get();
      expect(photo.zone_id).toBeNull();
    });
  });
});
