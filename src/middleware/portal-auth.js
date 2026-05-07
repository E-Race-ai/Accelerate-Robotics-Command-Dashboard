/**
 * Customer Portals — middleware
 *
 * Two middleware functions:
 *
 *   requirePortalSession  — authenticates the customer (external user) via the
 *                           portal session cookie, AND enforces tenant isolation
 *                           by verifying the cookie's portal_id matches the slug
 *                           in the URL.
 *
 *   requireAdmin          — authenticates an internal admin via the existing
 *                           JWT cookie used elsewhere in the app. The exact
 *                           shape of that cookie is read from req.user — set by
 *                           the existing admin middleware that sits earlier in
 *                           the chain. If your admin middleware uses a different
 *                           name, update getAdminUser() below.
 *
 * The isolation rule is THE most important security check in this feature.
 * Every external endpoint MUST go through requirePortalSession.
 */

const { readSession } = require('../services/portals/auth');
const { getPortalBySlug, getPortalById, getParticipantById } = require('../services/portals/db');

/**
 * Authenticate an external (customer) user for a specific portal.
 *
 * Expects the route to have :slug in the URL (e.g. /api/portal-public/:slug/content).
 * Verifies:
 *   1. There's a valid session cookie
 *   2. The cookie's portal_id matches the URL slug's portal
 *   3. The participant still exists and isn't removed
 *
 * On success, attaches req.portal and req.participant.
 */
async function requirePortalSession(req, res, next) {
  try {
    const slug = req.params.slug;
    if (!slug) return res.status(400).json({ error: 'Missing portal slug' });

    const portal = await getPortalBySlug(slug);
    if (!portal) return res.status(404).json({ error: 'Portal not found' });
    if (portal.status === 'archived') {
      return res.status(403).json({ error: 'Portal is archived' });
    }

    const session = readSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Not signed in' });
    }

    // CRITICAL: cookie's portal must match URL's portal.
    if (session.portal !== portal.id) {
      return res.status(403).json({ error: 'Session portal mismatch' });
    }

    const participant = await getParticipantById(session.pid);
    if (!participant || participant.portal_id !== portal.id) {
      return res.status(403).json({ error: 'Participant not found' });
    }
    if (participant.status === 'removed') {
      return res.status(403).json({ error: 'Access revoked' });
    }

    req.portal = portal;
    req.participant = participant;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Authenticate an admin (internal user) and load the requested portal.
 *
 * Assumes existing app-wide admin auth has already run and attached the user
 * to req.user. If it hasn't, returns 401.
 *
 * Expects :portalId in the URL.
 */
async function requireAdmin(req, res, next) {
  try {
    const user = getAdminUser(req);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const portalId = req.params.portalId;
    if (portalId) {
      const portal = await getPortalById(portalId);
      if (!portal) return res.status(404).json({ error: 'Portal not found' });
      req.portal = portal;
    }

    req.adminUser = user;
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Lighter version: just requires an admin user, no portal lookup.
 * Used on routes like POST /api/portals (creating a new portal).
 */
function requireAdminOnly(req, res, next) {
  const user = getAdminUser(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });
  req.adminUser = user;
  next();
}

/**
 * Read the admin user from the request.
 *
 * The Command Center's requireAuth (src/middleware/auth.js) attaches the
 * authenticated admin to req.admin as { id, email, role }. We read that
 * first; the other keys are fallbacks for completeness.
 */
function getAdminUser(req) {
  return req.admin || req.user || req.adminUser || req.session?.user || null;
}

module.exports = {
  requirePortalSession,
  requireAdmin,
  requireAdminOnly,
};
