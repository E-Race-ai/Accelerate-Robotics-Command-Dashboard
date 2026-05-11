/**
 * Customer Portals — file upload service
 *
 * Files are stored on local disk under data/portal-uploads/ which mirrors the
 * existing data/ directory pattern. Each file gets a generated filename so
 * filenames are not user-controlled (prevents path traversal).
 *
 * For production scale (>100GB), swap the disk storage for S3/R2 — see
 * the note in services/portals/db.js. The interface (filePath strings stored
 * in DB) doesn't change.
 */

const multer = require('multer');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');

const UPLOADS_ROOT = process.env.PORTAL_UPLOADS_DIR
  || path.join(process.cwd(), 'data', 'portal-uploads');

const FILES_DIR = path.join(UPLOADS_ROOT, 'files');
const LOGOS_DIR = path.join(UPLOADS_ROOT, 'logos');

[UPLOADS_ROOT, FILES_DIR, LOGOS_DIR].forEach(dir => {
  fs.mkdirSync(dir, { recursive: true });
});

const MAX_FILE_BYTES = 100 * 1024 * 1024;        // 100 MB per file
const MAX_LOGO_BYTES = 5 * 1024 * 1024;          // 5 MB

const ALLOWED_FILE_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/zip',
  'text/plain',
  'text/csv',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/svg+xml',
  'video/mp4', 'video/quicktime', 'video/webm',
]);

const ALLOWED_LOGO_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/svg+xml', 'image/webp',
]);

// ------- File uploads (per-portal) -------

const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const portalId = req.portal?.id;
    if (!portalId) return cb(new Error('No portal in request'));
    const dir = path.join(FILES_DIR, portalId);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase().slice(0, 16);
    const safeExt = /^\.[a-z0-9]{1,16}$/.test(ext) ? ext : '';
    const id = crypto.randomBytes(12).toString('hex');
    cb(null, `${id}${safeExt}`);
  },
});

const fileUpload = multer({
  storage: fileStorage,
  limits: { fileSize: MAX_FILE_BYTES },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_FILE_TYPES.has(file.mimetype)) return cb(null, true);
    cb(new Error(`File type not allowed: ${file.mimetype}`));
  },
});

// ------- Logo uploads (per-portal, separate dir) -------

const logoStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.mkdirSync(LOGOS_DIR, { recursive: true });
    cb(null, LOGOS_DIR);
  },
  filename: (req, file, cb) => {
    const portalId = req.portal?.id;
    if (!portalId) return cb(new Error('No portal in request'));
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = /^\.[a-z]{1,5}$/.test(ext) ? ext : '.png';
    cb(null, `${portalId}${safeExt}`);
  },
});

const logoUpload = multer({
  storage: logoStorage,
  limits: { fileSize: MAX_LOGO_BYTES },
  fileFilter: (req, file, cb) => {
    if (ALLOWED_LOGO_TYPES.has(file.mimetype)) return cb(null, true);
    cb(new Error('Logo must be PNG, JPG, SVG, or WebP'));
  },
});

// ------- Resolving stored paths back to absolute paths -------

/**
 * Given a relative path stored in DB, resolve to an absolute disk path.
 * Throws if the path tries to escape the uploads root (path-traversal guard).
 */
function resolveStoredPath(relativePath) {
  if (!relativePath || typeof relativePath !== 'string') {
    throw new Error('Invalid path');
  }
  const absolute = path.resolve(UPLOADS_ROOT, relativePath);
  if (!absolute.startsWith(UPLOADS_ROOT + path.sep) && absolute !== UPLOADS_ROOT) {
    throw new Error('Path traversal blocked');
  }
  return absolute;
}

/**
 * Convert an absolute disk path to a relative path for DB storage.
 */
function relativeFromAbsolute(absolutePath) {
  return path.relative(UPLOADS_ROOT, absolutePath);
}

/**
 * Delete a file from disk by its stored relative path. Best-effort.
 */
function deleteStoredFile(relativePath) {
  try {
    const absolute = resolveStoredPath(relativePath);
    if (fs.existsSync(absolute)) fs.unlinkSync(absolute);
  } catch (err) {
    console.warn('[portal-uploads] failed to delete', relativePath, err.message);
  }
}

module.exports = {
  fileUpload,
  logoUpload,
  resolveStoredPath,
  relativeFromAbsolute,
  deleteStoredFile,
  UPLOADS_ROOT_DIR: UPLOADS_ROOT,
};
