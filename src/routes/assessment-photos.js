const express = require('express');
const multer = require('multer');
const sharp = require('sharp');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { generateId } = require('../services/id-generator');

const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// WHY: PDFKit only supports JPEG and PNG. iPhones upload HEIC by default.
// Converting at upload time means every downstream consumer (PDF export, thumbnail
// display, future gallery) gets a universally compatible format without re-converting.
async function ensureJpeg(buffer) {
  // Check magic bytes — skip conversion if already JPEG or PNG
  if (buffer[0] === 0xFF && buffer[1] === 0xD8) return buffer; // JPEG
  if (buffer[0] === 0x89 && buffer[1] === 0x50) return buffer; // PNG

  // WHY: Try sharp first (works for WebP, TIFF, AVIF). Falls back to macOS sips
  // for HEIC since sharp's HEIC support is unreliable with some iPhone encodings.
  try {
    return await sharp(buffer).jpeg({ quality: 85 }).toBuffer();
  } catch {
    // Sharp failed — try macOS sips (handles HEIC natively)
    return await sipsConvert(buffer);
  }
}

// WHY: macOS sips handles HEIC from iPhones reliably. It's a system tool that
// uses CoreImage under the hood. Not available on Linux, but our dev/deploy is Mac.
function sipsConvert(buffer) {
  return new Promise((resolve) => {
    const tmpDir = os.tmpdir();
    const inputPath = path.join(tmpDir, `photo-convert-${Date.now()}.heic`);
    const outputPath = path.join(tmpDir, `photo-convert-${Date.now()}.jpg`);

    fs.writeFileSync(inputPath, buffer);

    execFile('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85', inputPath, '--out', outputPath], (err) => {
      try {
        if (!err && fs.existsSync(outputPath)) {
          const jpeg = fs.readFileSync(outputPath);
          fs.unlinkSync(inputPath);
          fs.unlinkSync(outputPath);
          resolve(jpeg);
        } else {
          // WHY: If sips also fails, store original — better than losing the photo
          console.error('sips conversion failed:', err?.message);
          fs.unlinkSync(inputPath);
          resolve(buffer);
        }
      } catch (cleanupErr) {
        console.error('Cleanup error:', cleanupErr.message);
        resolve(buffer);
      }
    });
  });
}

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

    // WHY: Convert HEIC/WebP/etc. to JPEG so PDFs and all consumers get a compatible format
    const photoBuffer = await ensureJpeg(file.buffer);

    await db.run(upsertPhotoSql, [
      photoId,
      assessmentId,
      meta.zone_id || null,
      meta.checklist_item || null,
      photoBuffer,
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
