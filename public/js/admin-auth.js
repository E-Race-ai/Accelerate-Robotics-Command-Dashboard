/**
 * Admin authentication helpers.
 * Used by both admin-login.html and admin.html.
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
