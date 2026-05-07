/**
 * Admin authentication helpers.
 * Used by admin pages. Returns { email, role } or null.
 */

async function checkAuth() {
  try {
    const res = await fetch('/api/auth/me');
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

async function logout() {
  await fetch('/api/auth/logout', { method: 'POST' });
  window.location.href = '/admin-login';
}
