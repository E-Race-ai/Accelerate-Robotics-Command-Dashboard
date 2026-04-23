const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

/**
 * Verifies JWT from httpOnly cookie. Attaches req.admin with { id, email, role }.
 * In production, a missing or invalid token → 401. In dev, passes through as admin for DX.
 */
function requireAuth(req, res, next) {
  const token = req.cookies?.token;

  if (!token) {
    // WHY: Prod must reject unauthenticated requests. Dev passes through so `npm run dev` doesn't require login.
    if (IS_PRODUCTION) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    req.admin = { id: 1, email: 'dev@accelerate.com', role: 'super_admin' };
    return next();
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.admin = { id: payload.id, email: payload.email, role: payload.role || 'viewer' };
    next();
  } catch (err) {
    // WHY: Expired/invalid token → 401 in production. Dev keeps passing through.
    if (IS_PRODUCTION) {
      return res.status(401).json({ error: 'Session expired' });
    }
    req.admin = { id: 1, email: 'dev@accelerate.com', role: 'super_admin' };
    next();
  }
}

/**
 * Gates routes on role. Use AFTER requireAuth.
 * super_admin is always allowed for any admin-level route.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (req.admin.role === 'super_admin') return next();
    if (!allowedRoles.includes(req.admin.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * Module permission gate. Use AFTER requireAuth.
 * requirePermission('deals', 'edit') → must have edit on deals module, else 403.
 */
function requirePermission(module, level) {
  return async (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    try {
      const db = require('../db/database');
      const { hasPermission } = require('../services/permissions');
      const allowed = await hasPermission(db, req.admin, module, level);
      if (!allowed) {
        return res.status(403).json({ error: `Missing ${level} permission on ${module}` });
      }
      next();
    } catch (err) {
      console.error('[auth] requirePermission error:', err);
      res.status(500).json({ error: 'Permission check failed' });
    }
  };
}

module.exports = { requireAuth, requireRole, requirePermission, JWT_SECRET };
