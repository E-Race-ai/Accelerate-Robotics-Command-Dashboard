const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { hasPermission } = require('../services/permissions');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

/**
 * Verifies JWT from httpOnly cookie. Attaches req.admin with { id, email, role }.
 */
function requireAuth(req, res, next) {
  const token = req.cookies?.token;
  const isDev = process.env.NODE_ENV !== 'production';

  if (!token) {
    // WHY: In dev, skip login wall so local iteration is frictionless.
    // In production, require real authentication.
    if (isDev) {
      // WHY: Use the first real admin user from DB so FK references (e.g. invited_by) work.
      // Falls back to synthetic user if DB is empty.
      const firstAdmin = db.prepare("SELECT id, email, role FROM admin_users ORDER BY id LIMIT 1").get();
      req.admin = firstAdmin
        ? { id: firstAdmin.id, email: firstAdmin.email, role: firstAdmin.role || 'super_admin' }
        : { id: 0, email: 'dev@accelerate.com', role: 'super_admin' };
      return next();
    }
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);

    // WHY: In production, verify user still exists and is active — tokens outlive account changes
    if (!isDev) {
      const user = db.prepare('SELECT id, email, role, status FROM admin_users WHERE id = ?').get(payload.id);
      if (!user || user.status !== 'active') {
        return res.status(401).json({ error: 'Account is disabled or does not exist' });
      }
      req.admin = { id: user.id, email: user.email, role: user.role || 'admin' };
    } else {
      req.admin = { id: payload.id, email: payload.email, role: payload.role || 'admin' };
    }

    next();
  } catch (err) {
    if (isDev) {
      const firstAdmin = db.prepare("SELECT id, email, role FROM admin_users ORDER BY id LIMIT 1").get();
      req.admin = firstAdmin
        ? { id: firstAdmin.id, email: firstAdmin.email, role: firstAdmin.role || 'super_admin' }
        : { id: 0, email: 'dev@accelerate.com', role: 'super_admin' };
      return next();
    }
    return res.status(401).json({ error: 'Session expired. Please log in again.' });
  }
}

/**
 * Returns middleware that checks if the authenticated user has one of the allowed roles.
 * Must be used AFTER requireAuth.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!allowedRoles.includes(req.admin.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

/**
 * Returns middleware that checks if the authenticated user has the required
 * permission level on a given module. Must be used AFTER requireAuth.
 */
function requirePermission(module, level) {
  return (req, res, next) => {
    if (!req.admin) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    if (!hasPermission(db, req.admin, module, level)) {
      return res.status(403).json({ error: 'You do not have permission to access this resource' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole, requirePermission, JWT_SECRET };
