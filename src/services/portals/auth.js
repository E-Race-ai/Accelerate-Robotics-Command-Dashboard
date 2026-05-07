/**
 * Customer Portals — external (customer) authentication
 *
 * Flow:
 *   1. Customer enters email at /portal/<slug>/sign-in
 *   2. POST /api/portal-public/<slug>/sign-in        → server creates magic token, emails link
 *   3. Customer clicks link → GET /portal/<slug>/auth?token=xyz
 *   4. Server consumes token, mints a portal-scoped JWT, sets it as a cookie
 *   5. Subsequent requests from the customer carry the cookie; middleware verifies
 *
 * The JWT is SEPARATE from the admin JWT — different secret, different cookie
 * name, different audience claim. Admin tokens cannot impersonate portal users
 * and vice versa.
 */

const jwt = require('jsonwebtoken');
const {
  createMagicToken, consumeMagicToken, getParticipantById,
  markParticipantActive, touchParticipant, logEvent, EVENT_TYPES,
} = require('./db');
const { sendMagicLinkEmail } = require('./email');

const JWT_AUDIENCE = 'portal-public';
const COOKIE_NAME = 'portal_session';
const SESSION_TTL_DAYS = 30;

function getSecret() {
  const secret = process.env.PORTAL_SESSION_SECRET || process.env.JWT_SECRET;
  if (!secret) throw new Error('PORTAL_SESSION_SECRET (or JWT_SECRET) must be set');
  return secret;
}

/**
 * Issue a magic link to a participant. Idempotent — multiple calls invalidate
 * older tokens implicitly because tokens are single-use.
 */
async function issueMagicLink({ participant, portal, ip = null }) {
  const rawToken = await createMagicToken({
    participantId: participant.id,
    ttlMinutes: 15,
    ip,
  });

  const baseUrl = process.env.PORTAL_BASE_URL || 'https://acceleraterobotics.ai';
  const link = `${baseUrl}/portal/${encodeURIComponent(portal.slug)}/auth?token=${encodeURIComponent(rawToken)}`;

  await sendMagicLinkEmail({
    toEmail: participant.email,
    toName: participant.full_name,
    portal,
    link,
  });

  return { sent: true };
}

/**
 * Consume a magic-link token and create a session cookie.
 * Returns { participant, portalId } on success, null on failure.
 */
async function authenticateMagicToken({ token, res, ip = null, userAgent = null }) {
  const consumed = await consumeMagicToken(token);
  if (!consumed) return null;
  if (consumed.status === 'removed') return null;

  // Mark active on first successful login.
  if (consumed.status === 'invited') {
    await markParticipantActive(consumed.participant_id);
    await logEvent({
      portalId: consumed.portal_id,
      participantEmail: consumed.email,
      eventType: EVENT_TYPES.PARTICIPANT_ACCEPTED,
      ipAddress: ip,
      userAgent,
    });
  } else {
    await touchParticipant(consumed.participant_id);
  }

  await logEvent({
    portalId: consumed.portal_id,
    participantEmail: consumed.email,
    eventType: EVENT_TYPES.PARTICIPANT_SIGNED_IN,
    ipAddress: ip,
    userAgent,
  });

  setSessionCookie(res, {
    pid: consumed.participant_id,
    portal: consumed.portal_id,
    email: consumed.email,
    role: consumed.role,
  });

  const participant = await getParticipantById(consumed.participant_id);
  return { participant, portalId: consumed.portal_id };
}

function setSessionCookie(res, payload) {
  const token = jwt.sign(payload, getSecret(), {
    audience: JWT_AUDIENCE,
    expiresIn: `${SESSION_TTL_DAYS}d`,
  });
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

function clearSessionCookie(res) {
  res.clearCookie(COOKIE_NAME, { path: '/' });
}

/**
 * Verify the session cookie. Returns { pid, portal, email, role } or null.
 *
 * NOTE: The cookie includes the portal_id. Callers MUST verify this matches
 * the portal being accessed (see middleware/portal-auth.js). Don't trust the
 * URL slug alone.
 */
function readSession(req) {
  const token = req.cookies?.[COOKIE_NAME];
  if (!token) return null;
  try {
    return jwt.verify(token, getSecret(), { audience: JWT_AUDIENCE });
  } catch (_) {
    return null;
  }
}

const PORTAL_COOKIE_NAME = COOKIE_NAME;

module.exports = {
  issueMagicLink,
  authenticateMagicToken,
  clearSessionCookie,
  readSession,
  PORTAL_COOKIE_NAME,
};
