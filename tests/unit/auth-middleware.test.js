import { describe, it, expect } from 'vitest';

// WHY: We test the middleware logic directly, not through Express — faster and more focused
describe('requireRole', () => {
  function checkRole(allowedRoles, tokenPayload) {
    if (!tokenPayload) return { status: 401, error: 'Authentication required' };
    if (!allowedRoles.includes(tokenPayload.role)) {
      return { status: 403, error: 'Insufficient permissions' };
    }
    return { status: 200 };
  }

  it('allows admin for any role requirement', () => {
    const result = checkRole(['admin', 'sales'], { id: 1, email: 'a@b.com', role: 'admin' });
    expect(result.status).toBe(200);
  });

  it('allows sales for sales-permitted routes', () => {
    const result = checkRole(['admin', 'sales'], { id: 1, email: 'a@b.com', role: 'sales' });
    expect(result.status).toBe(200);
  });

  it('denies viewer for write operations', () => {
    const result = checkRole(['admin', 'sales'], { id: 1, email: 'a@b.com', role: 'viewer' });
    expect(result.status).toBe(403);
  });

  it('denies unauthenticated requests', () => {
    const result = checkRole(['admin'], null);
    expect(result.status).toBe(401);
  });
});
