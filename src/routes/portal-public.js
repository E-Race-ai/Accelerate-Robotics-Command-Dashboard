/**
 * Customer Portals — public-facing API
 *
 * Routes hit by the customer's browser. Mounted at /api/portal-public.
 *
 * URL pattern:    /api/portal-public/:slug/...
 * Auth:           magic-link → JWT cookie (see services/portals/auth.js)
 * Isolation:      every authenticated route uses requirePortalSession which
 *                 verifies the cookie's portal_id matches the slug's portal.
 *
 * Endpoints that DON'T require a session:
 *   POST /:slug/sign-in           — issue a magic link
 *   GET  /:slug/auth              — consume a magic link, set cookie
 *   GET  /:slug/logo              — branded customer logo (public)
 *
 * Endpoints that DO require a session:
 *   GET  /:slug                   — portal metadata (welcome message, theme, perms)
 *   GET  /:slug/content
 *   POST /:slug/content           — file upload (if allow_external_uploads)
 *   GET  /:slug/content/:id/file  — download a file
 *   GET  /:slug/content/:id/comments
 *   POST /:slug/content/:id/comments
 *   GET  /:slug/participants      — for the "Team" tab
 *   POST /:slug/participants      — invite (if allow_external_invites)
 *   GET  /:slug/activity
 *   POST /:slug/sign-out
 */

const express = require('express');
const rateLimit = require('express-rate-limit');
const fs = require('node:fs');
const {
  getPortalBySlug, listParticipants, getParticipantByEmail, inviteParticipant,
  listContent, addContent, getContentItem,
  listComments, addComment,
  listActivity, logEvent, EVENT_TYPES,
  setParticipantName, touchParticipant,
} = require('../services/portals/db');
const {
  issueMagicLink, authenticateMagicToken, clearSessionCookie,
} = require('../services/portals/auth');
const { fileUpload, resolveStoredPath, relativeFromAbsolute } = require('../services/portals/uploads');
const { requirePortalSession } = require('../middleware/portal-auth');

const router = express.Router();

// Magic-link issuance is rate-limited to prevent enumeration / spam.
// Tighter limits than admin endpoints.
const magicLinkLimit = rateLimit({
  windowMs: 60 * 60 * 1000,   // 1 hour
  max: 20,                     // 20 attempts per IP per hour
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many sign-in attempts. Try again later.' },
});

// WHY: same MIME whitelist as the uploader accepts — a corrupted DB row
// can't trick the public logo endpoint into serving an unexpected Content-Type.
const LOGO_CONTENT_TYPES = new Set([
  'image/png', 'image/jpeg', 'image/svg+xml', 'image/webp',
]);

function logoTypeFromExt(p) {
  const ext = (p.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.svg') return 'image/svg+xml';
  if (ext === '.webp') return 'image/webp';
  return null;
}

// ============================================================================
// Sign in — magic link issuance & verification (NO session required)
// ============================================================================

router.post('/:slug/sign-in', magicLinkLimit, async (req, res, next) => {
  try {
    const portal = await getPortalBySlug(req.params.slug);
    if (!portal || portal.status === 'archived') {
      return res.json({ sent: true });
    }

    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }

    const participant = await getParticipantByEmail(portal.id, email);
    if (!participant || participant.status === 'removed') {
      return res.json({ sent: true });
    }

    await issueMagicLink({
      participant,
      portal,
      ip: req.ip,
    });

    res.json({ sent: true });
  } catch (err) { next(err); }
});

router.get('/:slug/auth', async (req, res, next) => {
  try {
    const portal = await getPortalBySlug(req.params.slug);
    if (!portal) return res.redirect(`/portal/${encodeURIComponent(req.params.slug)}/sign-in.html?error=not_found`);

    const token = req.query.token;
    if (!token) return res.redirect(`/portal/${encodeURIComponent(req.params.slug)}/sign-in.html?error=missing_token`);

    const result = await authenticateMagicToken({
      token,
      res,
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    if (!result || result.portalId !== portal.id) {
      return res.redirect(`/portal/${encodeURIComponent(portal.slug)}/sign-in.html?error=invalid_or_expired`);
    }

    res.redirect(`/portal/${encodeURIComponent(portal.slug)}/`);
  } catch (err) { next(err); }
});

router.post('/:slug/sign-out', (req, res) => {
  clearSessionCookie(res);
  res.json({ signed_out: true });
});

// WHY: Customer-facing logo endpoint — public by design. The customer portal
// HTML is reachable without an admin session, so the matching admin route at
// /api/portals/:portalId/logo-image would 401 on the customer's browser. We
// expose only the configured logo file (whitelisted MIME types) and nothing
// else from the portal record.
router.get('/:slug/logo', async (req, res, next) => {
  try {
    const portal = await getPortalBySlug(req.params.slug);
    if (!portal || portal.status === 'archived' || !portal.customer_logo_path) {
      return res.status(404).end();
    }
    const contentType = logoTypeFromExt(portal.customer_logo_path);
    if (!contentType || !LOGO_CONTENT_TYPES.has(contentType)) {
      return res.status(415).end();
    }
    let absolute;
    try {
      absolute = resolveStoredPath(portal.customer_logo_path);
    } catch (_) {
      return res.status(400).end();
    }
    if (!fs.existsSync(absolute)) return res.status(404).end();
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=300');
    fs.createReadStream(absolute).pipe(res);
  } catch (err) { next(err); }
});

// ============================================================================
// Authenticated routes (session required, isolation enforced)
// ============================================================================

router.get('/:slug', requirePortalSession, async (req, res) => {
  await touchParticipant(req.participant.id);
  await logEvent({
    portalId: req.portal.id,
    participantEmail: req.participant.email,
    eventType: EVENT_TYPES.PORTAL_VIEWED,
    ipAddress: req.ip,
    userAgent: req.get('user-agent'),
  });
  res.json({
    portal: req.portal,
    me: {
      id: req.participant.id,
      email: req.participant.email,
      full_name: req.participant.full_name,
      role: req.participant.role,
    },
  });
});

router.patch('/:slug/me', requirePortalSession, async (req, res, next) => {
  try {
    const fullName = String(req.body?.full_name || '').trim().slice(0, 120);
    if (!fullName) return res.status(400).json({ error: 'Name required' });
    await setParticipantName(req.participant.id, fullName);
    res.json({ updated: true });
  } catch (err) { next(err); }
});

// ----- Content -----

router.get('/:slug/content', requirePortalSession, async (req, res, next) => {
  try {
    const content = await listContent(req.portal.id);
    res.json({ content });
  } catch (err) { next(err); }
});

router.post('/:slug/content', requirePortalSession, async (req, res, next) => {
  if (!req.portal.allow_external_uploads) {
    return res.status(403).json({ error: 'Uploads not allowed for this portal' });
  }
  fileUpload.single('file')(req, res, async (err) => {
    if (err) return next(err);
    try {
      if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
      const relativePath = relativeFromAbsolute(req.file.path);
      const item = await addContent({
        portalId: req.portal.id,
        kind: 'file',
        title: req.body.title || req.file.originalname,
        description: req.body.description || '',
        filePath: relativePath,
        fileType: req.file.mimetype,
        fileSizeBytes: req.file.size,
        uploadedByEmail: req.participant.email,
      });
      await logEvent({
        portalId: req.portal.id,
        participantEmail: req.participant.email,
        eventType: EVENT_TYPES.CONTENT_UPLOADED,
        targetType: 'content_item',
        targetId: item.id,
        metadata: { file_size: req.file.size, file_type: req.file.mimetype },
      });
      res.status(201).json({ item });
    } catch (e) { next(e); }
  });
});

router.post('/:slug/content/:itemId/view', requirePortalSession, async (req, res, next) => {
  try {
    const item = await getContentItem(req.params.itemId);
    if (!item || item.portal_id !== req.portal.id) {
      return res.status(404).json({ error: 'Item not found' });
    }
    await logEvent({
      portalId: req.portal.id,
      participantEmail: req.participant.email,
      eventType: EVENT_TYPES.CONTENT_VIEWED,
      targetType: 'content_item',
      targetId: item.id,
    });
    res.json({ tracked: true });
  } catch (err) { next(err); }
});

router.get('/:slug/content/:itemId/file', requirePortalSession, async (req, res, next) => {
  try {
    const item = await getContentItem(req.params.itemId);
    if (!item || item.portal_id !== req.portal.id || !item.file_path) {
      return res.status(404).json({ error: 'File not found' });
    }
    if (!req.portal.allow_external_downloads) {
      return res.status(403).json({ error: 'Downloads not allowed for this portal' });
    }

    const absolutePath = resolveStoredPath(item.file_path);
    if (!fs.existsSync(absolutePath)) {
      return res.status(404).json({ error: 'File missing on disk' });
    }

    await logEvent({
      portalId: req.portal.id,
      participantEmail: req.participant.email,
      eventType: EVENT_TYPES.CONTENT_DOWNLOADED,
      targetType: 'content_item',
      targetId: item.id,
    });

    res.setHeader('Content-Type', item.file_type || 'application/octet-stream');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${encodeURIComponent(item.title)}"`
    );
    fs.createReadStream(absolutePath).pipe(res);
  } catch (err) { next(err); }
});

// ----- Comments -----

router.get('/:slug/content/:itemId/comments', requirePortalSession, async (req, res, next) => {
  try {
    const item = await getContentItem(req.params.itemId);
    if (!item || item.portal_id !== req.portal.id) {
      return res.status(404).json({ error: 'Item not found' });
    }
    const comments = await listComments(item.id);
    res.json({ comments });
  } catch (err) { next(err); }
});

router.post('/:slug/content/:itemId/comments', requirePortalSession, async (req, res, next) => {
  try {
    const item = await getContentItem(req.params.itemId);
    if (!item || item.portal_id !== req.portal.id) {
      return res.status(404).json({ error: 'Item not found' });
    }
    const body = (req.body?.body || '').trim();
    if (!body) return res.status(400).json({ error: 'Comment body required' });
    if (body.length > 4000) return res.status(400).json({ error: 'Comment too long' });

    const comment = await addComment({
      portalId: req.portal.id,
      contentItemId: item.id,
      authorEmail: req.participant.email,
      body,
      parentCommentId: req.body.parent_comment_id || null,
    });
    await logEvent({
      portalId: req.portal.id,
      participantEmail: req.participant.email,
      eventType: req.body.parent_comment_id ? EVENT_TYPES.COMMENT_REPLIED : EVENT_TYPES.COMMENT_POSTED,
      targetType: 'content_item',
      targetId: item.id,
    });
    res.status(201).json({ comment });
  } catch (err) { next(err); }
});

// ----- Participants (Team tab) -----

router.get('/:slug/participants', requirePortalSession, async (req, res, next) => {
  try {
    const participants = await listParticipants(req.portal.id);
    const trimmed = participants
      .filter(p => p.status !== 'removed')
      .map(p => ({
        id: p.id,
        email: p.email,
        full_name: p.full_name,
        role: p.role,
        status: p.status,
        last_seen_at: p.last_seen_at,
      }));
    res.json({ participants: trimmed });
  } catch (err) { next(err); }
});

router.post('/:slug/participants', requirePortalSession, async (req, res, next) => {
  if (!req.portal.allow_external_invites) {
    return res.status(403).json({ error: 'Invites not allowed for this portal' });
  }
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    const participant = await inviteParticipant({
      portalId: req.portal.id,
      email,
      role: 'external',
      invitedBy: req.participant.email,
    });
    await logEvent({
      portalId: req.portal.id,
      participantEmail: req.participant.email,
      eventType: EVENT_TYPES.PARTICIPANT_INVITED,
      targetId: participant.id,
      metadata: { target_email: email, by_external: true },
    });
    try {
      await issueMagicLink({ participant, portal: req.portal, ip: req.ip });
    } catch (e) { console.error('[portal-public] magic link send failed:', e); }
    res.status(201).json({ participant });
  } catch (err) { next(err); }
});

// ----- Activity (recent activity tab) -----

router.get('/:slug/activity', requirePortalSession, async (req, res, next) => {
  try {
    const events = await listActivity(req.portal.id, { limit: 50 });
    res.json({ events });
  } catch (err) { next(err); }
});

module.exports = router;
