// Creative Labs proxy — forwards `/cl/*` requests to whatever URL is stored in
// `system_settings.creative_labs_url` (a cloudflared tunnel pointing at Eric's
// home-dashboard). Lives behind the existing admin auth gate.
//
// Why proxy instead of iframing the tunnel URL directly: Eric's network
// (192.168.1.1) blocks `*.trycloudflare.com` at the router DNS, so anyone on
// his Wi-Fi (including team members visiting the office) can't resolve the
// tunnel URL. Render's network has no such filter, so proxying server-side
// bypasses the block. As a bonus, the tunnel URL is no longer exposed to
// browsers — it lives only in the DB and the proxy middleware.
//
// Mount: `app.use('/cl', requireAuthPage, creativeLabsProxy)` in server.js.

const { createProxyMiddleware } = require('http-proxy-middleware');
const db = require('../db/database');

// WHY: The tunnel URL changes when cloudflared restarts on Eric's MacBook.
// Cache for 30s so we're not hitting SQLite on every asset request, but still
// pick up fresh URLs reasonably quickly after an admin updates Settings.
const CACHE_TTL_MS = 30_000;
let cached = { url: null, fetchedAt: 0 };

async function getTunnelUrl() {
  const now = Date.now();
  if (cached.url && (now - cached.fetchedAt) < CACHE_TTL_MS) {
    return cached.url;
  }
  const row = await db.one(
    `SELECT value FROM system_settings WHERE key = ?`,
    ['creative_labs_url'],
  );
  cached = { url: row?.value || null, fetchedAt: now };
  return cached.url;
}

// WHY: Pre-resolve the URL on each request before handing off to the proxy.
// http-proxy-middleware v3 accepts an async `router` function, but mixing it
// with a missing-target case is awkward — easier to short-circuit here.
async function creativeLabsProxy(req, res, next) {
  let target;
  try {
    target = await getTunnelUrl();
  } catch (e) {
    console.error('[creative-labs-proxy] DB lookup failed:', e.message);
    return res.status(503).type('text/plain')
      .send('Creative Labs proxy: database error reading tunnel URL.');
  }

  if (!target) {
    return res.status(503).type('text/plain')
      .send('Creative Labs proxy: tunnel URL not configured. An admin should set it at /admin/settings → System.');
  }

  // Build/cache a proxy instance per target. Reusing the instance keeps the
  // underlying agent + connection pool warm.
  const proxy = ensureProxyFor(target);
  return proxy(req, res, next);
}

const proxyByTarget = new Map();
function ensureProxyFor(target) {
  if (proxyByTarget.has(target)) return proxyByTarget.get(target);

  const mw = createProxyMiddleware({
    target,
    changeOrigin: true,
    // WHY: Browser hits /cl/foo → upstream sees /foo on the home-dashboard.
    pathRewrite: { '^/cl': '' },
    // WHY: home-dashboard pushes live updates over WS. ws:true upgrades them.
    ws: true,
    on: {
      proxyRes: (proxyRes) => {
        // WHY: Strip headers that would break embedding the proxied content
        // in our /admin iframe. The accelerate-robotics CSP (set by helmet)
        // already governs same-origin /cl pages, so we don't need or want
        // home-dashboard's CSP / X-Frame-Options to leak through.
        delete proxyRes.headers['x-frame-options'];
        delete proxyRes.headers['content-security-policy'];
        delete proxyRes.headers['content-security-policy-report-only'];
      },
      error: (err, req, res) => {
        console.error('[creative-labs-proxy] upstream error:', err.message);
        if (res && !res.headersSent) {
          res.status(502).type('text/plain')
            .send(`Creative Labs proxy: upstream error (${err.code || err.message}). The tunnel may be down or the URL stale.`);
        }
      },
    },
  });

  proxyByTarget.set(target, mw);
  return mw;
}

// WHY: Exposed so the PUT /api/system-settings handler can invalidate the
// cache after an admin updates the URL — they should not have to wait 30s.
function invalidateCache() {
  cached = { url: null, fetchedAt: 0 };
  proxyByTarget.clear();
}

module.exports = { creativeLabsProxy, invalidateCache };
