const express = require('express');
const multer = require('multer');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { generateId } = require('../services/id-generator');

const router = express.Router({ mergeParams: true });
// WHY: mergeParams gives access to :id from parent mount at /api/assessments/:id/photos

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // WHY: 10MB — iPad photos are typically 3-5MB as JPEG
});

const MAX_BATCH = 5; // WHY: Avoid request timeout on slow connections; also keeps memory pressure bounded

// ── POST / — Upload photos in batch ──────────────────────────
router.post('/', requireAuth, upload.array('photos', MAX_BATCH), async (req, res) => {
  const assessmentId = req.params.id;

  const assessment = await db.one('SELECT id FROM assessments WHERE id = ?', [assessmentId]);
  if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

  const files = req.files || [];
  if (files.length === 0) return res.status(400).json({ error: 'No photos provided' });

  // WHY: Parse metadata from multipart string field — JSON array indexed parallel to files array
  let metadata = [];
  try {
    if (req.body.metadata) {
      metadata = JSON.parse(req.body.metadata);
    }
  } catch {
    // WHY: Treat unparseable metadata as empty — photos still upload with defaults
    metadata = [];
  }

  // WHY: INSERT OR REPLACE so re-syncing the same photo ID updates it without duplicates.
  // This supports offline-first: client generates the ID and may re-upload on reconnect.
  const upsertPhotoSql = `
    INSERT OR REPLACE INTO assessment_photos (
      id, assessment_id, zone_id, checklist_item, photo_data, thumbnail, annotations, caption, taken_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, datetime('now')))
  `;

  const uploaded = [];

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const meta = metadata[i] || {};
    const photoId = meta.id || generateId();

    await db.run(upsertPhotoSql, [
      photoId,
      assessmentId,
      meta.zone_id || null,
      meta.checklist_item || null,
      file.buffer,
      meta.thumbnail || null,
      meta.annotations != null ? JSON.stringify(meta.annotations) : null,
      meta.caption || null,
      meta.taken_at || null,
    ]);

    uploaded.push({ id: photoId, status: 'uploaded' });
  }

  res.status(201).json({ uploaded: uploaded.length, photos: uploaded });
});

// ── GET / — List photo metadata for an assessment (no blobs) ──
router.get('/', requireAuth, async (req, res) => {
  const assessmentId = req.params.id;

  const assessment = await db.one('SELECT id FROM assessments WHERE id = ?', [assessmentId]);
  if (!assessment) return res.status(404).json({ error: 'Assessment not found' });

  // WHY: Exclude photo_data BLOB from list response — blobs are large and only needed
  // when downloading a specific photo. Thumbnail column is kept for preview use.
  const photos = await db.all(`
    SELECT id, assessment_id, zone_id, checklist_item, thumbnail, annotations, caption, taken_at
    FROM assessment_photos
    WHERE assessment_id = ?
    ORDER BY taken_at
  `, [assessmentId]);

  res.json(photos);
});

// ── GET /:photoId — Get single photo with full data ───────────
router.get('/:photoId', requireAuth, async (req, res) => {
  const { id: assessmentId, photoId } = req.params;

  // WHY: Verify both photoId AND assessmentId match to prevent cross-assessment data leaks
  const photo = await db.one(`
    SELECT * FROM assessment_photos
    WHERE id = ? AND assessment_id = ?
  `, [photoId, assessmentId]);

  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  // WHY: Convert BLOB Buffer to base64 string so the binary data survives JSON serialization
  if (photo.photo_data) {
    photo.photo_data = photo.photo_data.toString('base64');
  }

  res.json(photo);
});

// ── DELETE /:photoId — Delete a photo ─────────────────────────
router.delete('/:photoId', requireAuth, async (req, res) => {
  const { id: assessmentId, photoId } = req.params;

  // WHY: Verify both photoId AND assessmentId match before deleting to prevent cross-assessment mutations
  const photo = await db.one(`
    SELECT id FROM assessment_photos
    WHERE id = ? AND assessment_id = ?
  `, [photoId, assessmentId]);

  if (!photo) return res.status(404).json({ error: 'Photo not found' });

  await db.run('DELETE FROM assessment_photos WHERE id = ?', [photoId]);

  res.json({ message: 'Photo deleted' });
});

module.exports = router;
