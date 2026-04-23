const jwt = require('jsonwebtoken');

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
      req.admin = { id: 1, email: 'dev@accelerate.com', role: 'admin' };
      return next();
    }
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.admin = { id: payload.id, email: payload.email, role: payload.role || 'admin' };
    next();
  } catch (err) {
    if (isDev) {
      req.admin = { id: 1, email: 'dev@accelerate.com', role: 'admin' };
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

module.exports = { requireAuth, requireRole, JWT_SECRET };
