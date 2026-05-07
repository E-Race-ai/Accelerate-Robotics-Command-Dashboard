/**
 * Customer Portals — admin API routes
 *
 * Mounted at /api/portals (see src/server.js for the wire-up).
 * All routes require an authenticated admin (existing JWT middleware must run
 * before this router is mounted, OR add `requireAdminOnly` to each route).
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const path = require('node:path');
const fs = require('node:fs');
const {
  listPortals, getPortalBySlug, createPortal, updatePortal, archivePortal,
  listParticipants, inviteParticipant, removeParticipant, getParticipantById,
  listContent, addContent, deleteContent, togglePin, getContentItem,
  listComments, addComment, listActivity,
  engagementSummary, engagementByParticipant, engagementByContent,
  logEvent, EVENT_TYPES,
} = require('../services/portals/db');
const { issueMagicLink } = require('../services/portals/auth');
const { fileUpload, logoUpload, deleteStoredFile, relativeFromAbsolute, resolveStoredPath } = require('../services/portals/uploads');
const { requireAdmin, requireAdminOnly } = require('../middleware/portal-auth');

// WHY: Logos are restricted to a small whitelist (multer fileFilter enforces
// this on upload). Mapping ext → MIME explicitly avoids relying on a sniff.
const LOGO_CONTENT_TYPES = {
  '.png':  'image/png',
  '.jpg':  'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg':  'image/svg+xml',
  '.webp': 'image/webp',
};

const router = express.Router();

// Rate-limit admin actions modestly. Admins are trusted but this caps runaway scripts.
const adminWriteLimit = rateLimit({
  windowMs: 60_000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

// ============================================================================
// Portals collection
// ============================================================================

router.get('/', requireAdminOnly, async (req, res, next) => {
  try {
    const includeArchived = req.query.archived === 'true';
    const portals = await listPortals({ includeArchived });
    // Augment each portal with summary stats for the dashboard
    const summaries = await Promise.all(portals.map(async p => ({
      ...p,
      summary: await engagementSummary(p.id),
    })));
    res.json({ portals: summaries });
  } catch (err) { next(err); }
});

router.post('/', requireAdminOnly, adminWriteLimit, async (req, res, next) => {
  try {
    const { slug, name, customer_name, deal_id, welcome_message } = req.body || {};
    if (!slug || !name || !customer_name) {
      return res.status(400).json({ error: 'slug, name, and customer_name are required' });
    }
    if (!/^[a-z0-9][a-z0-9-]{1,80}$/.test(String(slug).toLowerCase())) {
      return res.status(400).json({ error: 'slug must be lowercase alphanumerics + hyphens' });
    }
    const existing = await getPortalBySlug(slug);
    if (existing) return res.status(409).json({ error: 'Slug already in use' });

    const portal = await createPortal({
      slug: String(slug).toLowerCase(),
      name,
      customer_name,
      deal_id: deal_id || null,
      owner_user_id: req.adminUser.id || req.adminUser.email,
      welcome_message: welcome_message || '',
    });
    await logEvent({
      portalId: portal.id,
      participantEmail: req.adminUser.email,
      eventType: EVENT_TYPES.PORTAL_CREATED,
    });
    res.status(201).json({ portal });
  } catch (err) { next(err); }
});

// ============================================================================
// Single portal
// ============================================================================

router.get('/:portalId', requireAdmin, async (req, res, next) => {
  try {
    const summary = await engagementSummary(req.portal.id);
    res.json({ portal: req.portal, summary });
  } catch (err) { next(err); }
});

router.patch('/:portalId', requireAdmin, adminWriteLimit, async (req, res, next) => {
  try {
    const before = req.portal;
    const portal = await updatePortal(req.portal.id, req.body || {});
    // If activating for the first time, log it.
    if (before.status !== 'active' && portal.status === 'active') {
      await logEvent({
        portalId: portal.id,
        participantEmail: req.adminUser.email,
        eventType: EVENT_TYPES.PORTAL_ACTIVATED,
      });
    }
    res.json({ portal });
  } catch (err) { next(err); }
});

router.post('/:portalId/archive', requireAdmin, adminWriteLimit, async (req, res, next) => {
  try {
    const portal = await archivePortal(req.portal.id);
    res.json({ portal });
  } catch (err) { next(err); }
});

// ----- Customer logo upload -----
router.post('/:portalId/logo', requireAdmin, adminWriteLimit, logoUpload.single('logo'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const relativePath = relativeFromAbsolute(req.file.path);
      const portal = await updatePortal(req.portal.id, { customer_logo_path: relativePath });
      res.json({ portal });
    } catch (err) { next(err); }
  }
);

// Serve the uploaded logo. requireAdmin loads req.portal from :portalId and
// 404s if the portal is missing — same pattern as the other admin endpoints.
router.get('/:portalId/logo-image', requireAdmin, async (req, res, next) => {
  try {
    if (!req.portal.customer_logo_path) {
      return res.status(404).json({ error: 'No logo set' });
    }
    const absolutePath = resolveStoredPath(req.portal.customer_logo_path);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'Logo missing on disk' });
    }
    const ext = path.extname(absolutePath).toLowerCase();
    res.setHeader('Content-Type', LOGO_CONTENT_TYPES[ext] || 'application/octet-stream');
    res.sendFile(absolutePath);
  } catch (err) { next(err); }
});

// ============================================================================
// Participants
// ============================================================================

router.get('/:portalId/participants', requireAdmin, async (req, res, next) => {
  try {
    const participants = await listParticipants(req.portal.id);
    res.json({ participants });
  } catch (err) { next(err); }
});

router.post('/:portalId/participants', requireAdmin, adminWriteLimit, async (req, res, next) => {
  try {
    const { email, role = 'external', send_invite = true } = req.body || {};
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    const participant = await inviteParticipant({
      portalId: req.portal.id,
      email,
      role,
      invitedBy: req.adminUser.email || req.adminUser.id,
    });
    await logEvent({
      portalId: req.portal.id,
      participantEmail: req.adminUser.email,
      eventType: EVENT_TYPES.PARTICIPANT_INVITED,
      targetId: participant.id,
      metadata: { role, target_email: email },
    });
    if (send_invite && role === 'external') {
      try {
        await issueMagicLink({
          participant,
          portal: req.portal,
          ip: req.ip,
        });
      } catch (err) {
        console.error('[portals] magic link send failed:', err);
        // Non-fatal — admin can resend.
      }
    }
    res.status(201).json({ participant });
  } catch (err) { next(err); }
});

router.post('/:portalId/participants/:participantId/resend-invite',
  requireAdmin, adminWriteLimit,
  async (req, res, next) => {
    try {
      const participant = await getParticipantById(req.params.participantId);
      if (!participant || participant.portal_id !== req.portal.id) {
        return res.status(404).json({ error: 'Participant not found' });
      }
      if (participant.role !== 'external') {
        return res.status(400).json({ error: 'Magic links only for external participants' });
      }
      await issueMagicLink({ participant, portal: req.portal, ip: req.ip });
      res.json({ sent: true });
    } catch (err) { next(err); }
  }
);

router.delete('/:portalId/participants/:participantId', requireAdmin, adminWriteLimit,
  async (req, res, next) => {
    try {
      const participant = await getParticipantById(req.params.participantId);
      if (!participant || participant.portal_id !== req.portal.id) {
        return res.status(404).json({ error: 'Participant not found' });
      }
      await removeParticipant(req.params.participantId);
      await logEvent({
        portalId: req.portal.id,
        participantEmail: req.adminUser.email,
        eventType: EVENT_TYPES.PARTICIPANT_REMOVED,
        targetId: req.params.participantId,
        metadata: { target_email: participant.email },
      });
      res.json({ removed: true });
    } catch (err) { next(err); }
  }
);

// ============================================================================
// Content
// ============================================================================

router.get('/:portalId/content', requireAdmin, async (req, res, next) => {
  try {
    const content = await listContent(req.portal.id);
    res.json({ content });
  } catch (err) { next(err); }
});

// Folder creation (no file upload).
router.post('/:portalId/folders', requireAdmin, adminWriteLimit, async (req, res, next) => {
  try {
    const { title, parent_folder_id = null } = req.body || {};
    if (!title) return res.status(400).json({ error: 'Title required' });
    const item = await addContent({
      portalId: req.portal.id,
      parentFolderId: parent_folder_id,
      kind: 'folder',
      title,
      uploadedByEmail: req.adminUser.email,
    });
    await logEvent({
      portalId: req.portal.id,
      participantEmail: req.adminUser.email,
      eventType: EVENT_TYPES.FOLDER_CREATED,
      targetId: item.id,
    });
    res.status(201).json({ item });
  } catch (err) { next(err); }
});

// File upload — uses multer. Note the order: requireAdmin sets req.portal,
// THEN multer uses req.portal.id to write to the right directory.
router.post('/:portalId/content', requireAdmin, adminWriteLimit, fileUpload.single('file'),
  async (req, res, next) => {
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const relativePath = relativeFromAbsolute(req.file.path);
      const item = await addContent({
        portalId: req.portal.id,
        parentFolderId: req.body.parent_folder_id || null,
        kind: req.body.kind === 'published_snapshot' ? 'published_snapshot' : 'file',
        title: req.body.title || req.file.originalname,
        description: req.body.description || '',
        filePath: relativePath,
        fileType: req.file.mimetype,
        fileSizeBytes: req.file.size,
        sourceTool: req.body.source_tool || null,
        sourceRecordId: req.body.source_record_id || null,
        uploadedByEmail: req.adminUser.email,
      });
      await logEvent({
        portalId: req.portal.id,
        participantEmail: req.adminUser.email,
        eventType: EVENT_TYPES.CONTENT_UPLOADED,
        targetType: 'content_item',
        targetId: item.id,
        metadata: { file_size: req.file.size, file_type: req.file.mimetype },
      });
      res.status(201).json({ item });
    } catch (err) { next(err); }
  }
);

router.delete('/:portalId/content/:itemId', requireAdmin, adminWriteLimit, async (req, res, next) => {
  try {
    const item = await getContentItem(req.params.itemId);
    if (!item || item.portal_id !== req.portal.id) {
      return res.status(404).json({ error: 'Item not found' });
    }
    if (item.file_path) deleteStoredFile(item.file_path);
    await deleteContent(item.id);
    await logEvent({
      portalId: req.portal.id,
      participantEmail: req.adminUser.email,
      eventType: EVENT_TYPES.CONTENT_DELETED,
      targetType: 'content_item',
      targetId: item.id,
      metadata: { title: item.title },
    });
    res.json({ deleted: true });
  } catch (err) { next(err); }
});

router.post('/:portalId/content/:itemId/pin', requireAdmin, adminWriteLimit, async (req, res, next) => {
  try {
    const item = await getContentItem(req.params.itemId);
    if (!item || item.portal_id !== req.portal.id) {
      return res.status(404).json({ error: 'Item not found' });
    }
    const updated = await togglePin(item.id);
    res.json({ item: updated });
  } catch (err) { next(err); }
});

// ============================================================================
// Comments (admin can view & post)
// ============================================================================

router.get('/:portalId/content/:itemId/comments', requireAdmin, async (req, res, next) => {
  try {
    const item = await getContentItem(req.params.itemId);
    if (!item || item.portal_id !== req.portal.id) {
      return res.status(404).json({ error: 'Item not found' });
    }
    const comments = await listComments(item.id);
    res.json({ comments });
  } catch (err) { next(err); }
});

router.post('/:portalId/content/:itemId/comments', requireAdmin, adminWriteLimit, async (req, res, next) => {
  try {
    const item = await getContentItem(req.params.itemId);
    if (!item || item.portal_id !== req.portal.id) {
      return res.status(404).json({ error: 'Item not found' });
    }
    const body = (req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Comment body required' });
    const comment = await addComment({
      portalId: req.portal.id,
      contentItemId: item.id,
      authorEmail: req.adminUser.email,
      body,
      parentCommentId: req.body.parent_comment_id || null,
    });
    await logEvent({
      portalId: req.portal.id,
      participantEmail: req.adminUser.email,
      eventType: req.body.parent_comment_id ? EVENT_TYPES.COMMENT_REPLIED : EVENT_TYPES.COMMENT_POSTED,
      targetType: 'content_item',
      targetId: item.id,
    });
    res.status(201).json({ comment });
  } catch (err) { next(err); }
});

// ============================================================================
// Activity & engagement
// ============================================================================

router.get('/:portalId/activity', requireAdmin, async (req, res, next) => {
  try {
    const events = await listActivity(req.portal.id, { limit: 200 });
    res.json({ events });
  } catch (err) { next(err); }
});

router.get('/:portalId/engagement', requireAdmin, async (req, res, next) => {
  try {
    const [summary, byParticipant, byContent] = await Promise.all([
      engagementSummary(req.portal.id),
      engagementByParticipant(req.portal.id),
      engagementByContent(req.portal.id),
    ]);
    res.json({ summary, by_participant: byParticipant, by_content: byContent });
  } catch (err) { next(err); }
});

module.exports = router;
