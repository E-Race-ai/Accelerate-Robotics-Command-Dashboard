require('dotenv/config');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

// WHY: Import db first so schema + seed run before routes try to query.
// The libsql-based db module exports a `ready` promise that server.js awaits before listen().
const db = require('./db/database');

const { requireAuthPage } = require('./middleware/auth');
const authRoutes = require('./routes/auth');
const inquiryRoutes = require('./routes/inquiries');
const recipientRoutes = require('./routes/recipients');
const stockRoutes = require('./routes/stocks');
const dealRoutes = require('./routes/deals');
const facilityRoutes = require('./routes/facilities');
const assessmentRoutes = require('./routes/assessments');
const assessmentPhotoRoutes = require('./routes/assessment-photos');
const assessmentPdfRoutes = require('./routes/assessment-pdf');
const narrateRoutes = require('./routes/narrate');
const marketRoutes = require('./routes/markets');
const prospectRoutes = require('./routes/prospects');
const userRoutes = require('./routes/users');
const roleRoutes = require('./routes/roles');
const trackerRoutes = require('./routes/tracker');
const toolkitRoutes = require('./routes/toolkit');
const feedbackRoutes = require('./routes/feedback');
const activityRoutes = require('./routes/activities');
const collabRoutes = require('./routes/collab');
const improvementRoutes = require('./routes/improvement-requests');
const whatsappRoutes = require('./routes/whatsapp');
const hotelResearchRoutes = require('./routes/hotel-research');
const glossaryGameRoutes = require('./routes/glossary-game');
const systemSettingsRoutes = require('./routes/system-settings');
const { creativeLabsProxy } = require('./routes/creative-labs-proxy');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security ────────────────────────────────────────────────────
app.use(helmet({
  // WHY: Helmet defaults to 'no-referrer' which strips the Referer header entirely.
  // OpenStreetMap tile servers require a Referer to serve tiles (anti-abuse policy).
  // 'strict-origin-when-cross-origin' sends origin on cross-origin requests — enough for OSM.
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      // WHY: Proposal pages use GSAP, Lenis, Tailwind, and inline scripts for interactivity
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com", "https://unpkg.com"],
      // WHY: unpkg.com added for Leaflet CSS (deal map view)
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://unpkg.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      // WHY: Proposal pages embed robot product images from manufacturer CDNs and Google favicons
      // WHY: https: already covers OSM tiles, but explicit entry documents the dependency
      imgSrc: ["'self'", "data:", "https://img.youtube.com", "https:", "http:", "https://tile.openstreetmap.org"],
      // WHY: localhost:3100 + *.trycloudflare.com for the Creative Labs embed pages.
      // The cloudflared quick tunnel (rotates URL when it restarts) lives on
      // *.trycloudflare.com; localhost:3100 is the fallback for when an admin
      // is on Eric's MacBook directly.
      connectSrc: ["'self'", "http://localhost:3100", "https://*.trycloudflare.com"],
      // WHY: YouTube embeds + same-origin iframes (elevator-embed.html) + Creative Labs robot command embed
      frameSrc: ["'self'", "https://www.youtube.com", "https://www.youtube-nocookie.com", "http://localhost:3100", "https://*.trycloudflare.com"],
      // WHY: Helmet defaults script-src-attr to 'none', which blocks ALL inline event
      // handlers (onclick, onchange, etc.) even when script-src allows 'unsafe-inline'.
      // Our admin pages use onclick handlers extensively — allow them.
      scriptSrcAttr: ["'unsafe-inline'"],
    },
  },
}));

// ── Middleware ───────────────────────────────────────────────────
app.use(express.json());
app.use(cookieParser());

// WHY: Trust Railway's reverse proxy so rate-limit sees real client IPs, not the proxy's
app.set('trust proxy', 1);

// ── Rate limiting on public inquiry endpoint ────────────────────
const inquiryLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // 5 submissions per IP per hour — generous for legitimate use, blocks spam
  message: { error: 'Too many submissions. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// WHY: 10 proposals per IP per hour — generous for iteration, prevents abuse
const narrateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many narration requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// WHY: 5 forgot-password attempts per IP per hour. Tight enough to stop
// enumeration attempts and email-spam, generous enough for a user who
// mistypes their email once or twice.
const forgotPasswordLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { error: 'Too many reset requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Auth-gated pages in public/ that must not be publicly accessible ──
// WHY: These toolkit pages live in public/ but should require login.
// Explicit routes registered BEFORE express.static so the auth gate wins.
const PROTECTED_PUBLIC_PAGES = [
  'financial-analysis.html',
  'elevator-button-emulator.html',
  'elevator-install-guide.html',
];
for (const page of PROTECTED_PUBLIC_PAGES) {
  app.get(`/${page}`, requireAuthPage, (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', page));
  });
}

// ── Static files ────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));
// WHY: Serve the pages/ directory for standalone HTML pages (robot catalog, etc.)
// WHY: requireAuthPage ensures these toolkit pages are only accessible to logged-in users
// WHY: no-store on .html so the browser never serves a cached page —
// dev changes (and prod deploys) are immediately picked up. Other static
// assets keep no-cache (revalidate on each request) since they rarely
// change during a session and revalidation is fast.
app.use('/pages', requireAuthPage, express.static(path.join(__dirname, '..', 'pages'), {
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else {
      res.setHeader('Cache-Control', 'no-cache');
    }
  }
}));

// WHY: Serve only .json files from data/ — the directory also contains the SQLite
// database, which must NEVER be exposed via HTTP. Reject non-JSON requests.
app.use('/data', (req, res, next) => {
  if (!req.path.endsWith('.json')) return res.status(404).send('Not found');
  next();
}, express.static(path.join(__dirname, '..', 'data')));

// WHY: Serve each hotel repo so proposal pages (with relative asset paths) work correctly from the deals dashboard
// WHY: Local dev: serve from sibling directories (../../{repo}) for live edits.
// Production: fall back to bundled repos/ directory committed to this repo.
// This solves the 404 problem where proposal pages only existed on Eric's machine.
const HOTEL_REPOS_SIBLING = path.join(__dirname, '..', '..');
const HOTEL_REPOS_BUNDLED = path.join(__dirname, '..', 'repos');
// WHY: array name is historical ("hotelRepos") but this is really the list of
// sibling repos mounted under /repos/. Toolkit items like b10-playground live here too.
const hotelRepos = [
  'accelerate-thesis-hotel',
  'accelerate-moore-miami',
  'accelerate-art-ovation',
  'accelerate-san-ramon-marriott',
  'accelerate-lafayette-park',
  'accelerate-claremont-resort',
  'accelerate-kimpton-sawyer',
  'accelerate-citizen-hotel',
  'accelerate-westin-sacramento',
  'accelerate-westin-sarasota',
  'accelerate-hotel-template',
  'accelerate-carts',
  'accelerate-elevator',
  'b10-playground',
];
const fs = require('fs');
for (const repo of hotelRepos) {
  const siblingPath = path.join(HOTEL_REPOS_SIBLING, repo);
  const bundledPath = path.join(HOTEL_REPOS_BUNDLED, repo);
  // WHY: Prefer sibling (local dev with live edits) over bundled (production fallback)
  // WHY: requireAuthPage ensures repo pages are only accessible to logged-in users
  const repoPath = fs.existsSync(siblingPath) ? siblingPath : bundledPath;
  app.use(`/repos/${repo}`, requireAuthPage, express.static(repoPath));
}

// ── API routes ──────────────────────────────────────────────────
// WHY: Rate-limit the public forgot-password endpoint before mounting the
// broader auth routes, so it's impossible to route around the limiter.
app.use('/api/auth/forgot-password', forgotPasswordLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/inquiries', (req, res, next) => {
  // WHY: Only rate-limit the public POST, not admin GET/PATCH
  if (req.method === 'POST') return inquiryLimiter(req, res, next);
  next();
}, inquiryRoutes);
app.use('/api/recipients', recipientRoutes);
app.use('/api/stocks', stockRoutes);
app.use('/api/deals', dealRoutes);
app.use('/api/facilities', facilityRoutes);
app.use('/api/assessments', assessmentRoutes);
// WHY: Must be mounted AFTER assessmentRoutes so /meta/team and /:id routes in assessmentRoutes
// are registered first. mergeParams on the photo router gives it access to :id.
app.use('/api/assessments/:id/photos', assessmentPhotoRoutes);
// WHY: Mounted separately from assessmentRoutes so PDFKit streaming doesn't block
// the main assessment router. mergeParams gives it access to :id.
app.use('/api/assessments/:id/pdf', assessmentPdfRoutes);
app.use('/api/narrate', narrateLimiter, narrateRoutes);
app.use('/api/markets', marketRoutes);
app.use('/api/prospects', prospectRoutes);
app.use('/api/users', userRoutes);
app.use('/api/roles', roleRoutes);
app.use('/api/tracker', trackerRoutes);
app.use('/api/toolkit', toolkitRoutes);
// WHY: POST is public so end users can file bug reports without an account;
// GET/PATCH require admin auth (gated inside the route module itself).
// Rate-limit submissions to prevent screenshot-spam.
app.use('/api/feedback', (req, res, next) => {
  if (req.method === 'POST') return inquiryLimiter(req, res, next);
  next();
}, feedbackRoutes);
// WHY: POST /api/activities is public via softAuth so any team member can post
// a Project Hub update without needing a JWT (matches feedback/collab pattern).
// Rate-limit POSTs to keep a runaway script from flooding the feed.
app.use('/api/activities', (req, res, next) => {
  if (req.method === 'POST' && req.path === '/') return inquiryLimiter(req, res, next);
  next();
}, activityRoutes);
// WHY: POST is public so toolkit users can file collab requests without
// being logged in (the route uses softAuth — logged-in users still get
// attribution). Rate-limit submissions to prevent spam.
app.use('/api/collab', (req, res, next) => {
  if (req.method === 'POST' && req.path === '/') return inquiryLimiter(req, res, next);
  next();
}, collabRoutes);
// WHY: POST is public so any user can submit improvement requests without an account;
// GET is also public so all users can track request status.
// PATCH requires admin auth (gated inside the route module).
// Rate-limit submissions to prevent spam.
app.use('/api/improvement-requests', (req, res, next) => {
  if (req.method === 'POST') return inquiryLimiter(req, res, next);
  next();
}, improvementRoutes);

// WhatsApp Hub — admin-only directory of company WhatsApp groups.
// All methods require auth; gated inside the route module via requireAuth.
app.use('/api/whatsapp', whatsappRoutes);

// Hotel Research Tool — sales-rep prospecting helper.
// Searches OpenStreetMap (Nominatim + Overpass) by city/zip, returns
// hotels with rough ADR estimates, and lets reps save candidates.
// All methods require auth; gated inside the route module via requireAuth.
app.use('/api/hotel-research', hotelResearchRoutes);

// Glossary Game — gamification of /pages/team-glossary.html. Quiz sessions,
// points, levels, streaks, badges. All points are server-awarded based on
// validated activities, so clients can't fake totals.
app.use('/api/glossary-game', glossaryGameRoutes);

app.use('/api/system-settings', systemSettingsRoutes);

// Direct-to-printer label rendering (Chrome headless → PDF → lp).
// WHY a server route instead of window.print(): the OS print dialog adds
// a click the rep doesn't need every time. Same machine = the server
// can lp the PDF straight at the JADENS without the dialog.
// Body limit bumped to 5mb so the rep's photo data URL (typically
// 100–500kb base64) fits in the POST body.
app.use('/api/print-label', express.json({ limit: '5mb' }), require('./routes/print-label'));

// WHY: Proxy /cl/* to the tunnel URL stored in system_settings.creative_labs_url.
// This serves home-dashboard (running on Eric's MacBook on localhost:3100) to
// the team via acceleraterobotics.ai, bypassing Eric's local DNS filter that
// blocks *.trycloudflare.com. requireAuthPage gates browser access so the
// proxy isn't a public window into home-dashboard.
app.use('/cl', requireAuthPage, creativeLabsProxy);

// ── Deploy version endpoint (no auth — used by client banner) ──
// Tells the dashboard exactly which commit is running. Falls back through:
//   1. RENDER_GIT_COMMIT — set by Render on every deploy
//   2. .git/HEAD lookup — works in any git checkout (dev, manual hosts)
//   3. unknown — last resort if neither is available
let _versionCache = null;
app.get('/api/version', (_req, res) => {
  if (_versionCache) return res.json(_versionCache);
  let commit = process.env.RENDER_GIT_COMMIT || null;
  let branch = process.env.RENDER_GIT_BRANCH || null;
  if (!commit) {
    try {
      const { execFileSync } = require('child_process');
      const repoRoot = path.resolve(__dirname, '..');
      commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf-8' }).trim();
      branch = branch || execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: repoRoot, encoding: 'utf-8' }).trim();
    } catch { /* not a git checkout — leave commit null */ }
  }
  // Cache for the lifetime of the process — version doesn't change after boot.
  _versionCache = {
    commit: commit ? commit.slice(0, 40) : null,
    short: commit ? commit.slice(0, 7) : null,
    branch: branch || null,
    started_at: new Date(Date.now() - process.uptime() * 1000).toISOString(),
    uptime_s: Math.round(process.uptime()),
  };
  res.json(_versionCache);
});

// ── Diagnostic: check Resend config (temporary, no auth, no email sent) ──
// WHY: Removed auth requirement temporarily so we can diagnose the API key issue.
// Does NOT send an email — only reports what key and EMAIL_FROM the server sees.
app.get('/api/debug/resend-check', async (req, res) => {
  const key = (process.env.RESEND_API_KEY || '').trim();
  const from = process.env.EMAIL_FROM || 'notifications@acceleraterobotics.ai';
  if (!key) return res.json({ ok: false, key: '(not set)', from });
  const masked = key.slice(0, 8) + '...' + key.slice(-4);
  // WHY: Test the key by calling Resend's domain list endpoint — no email sent
  try {
    const { Resend } = require('resend');
    const resend = new Resend(key);
    const result = await resend.domains.list();
    if (result?.error) {
      return res.json({ ok: false, key: masked, from, error: result.error });
    }
    const domains = (result?.data?.data || []).map(d => ({ name: d.name, status: d.status }));
    res.json({ ok: true, key: masked, from, domains });
  } catch (err) {
    res.json({ ok: false, key: masked, from, error: err.message });
  }
});

// ── SPA fallback for admin routes ───────────────────────────────
// WHY: /admin is the master command center — unified dashboard for all tools
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin-command-center.html'));
});

// WHY: Friendly URL for the standalone Hotel Triage mobile app. Eric and
// Ben/Celia can navigate to /triage directly on a phone, or it's iframed
// inside the iPhone bezel on the desktop /hotel-research page.
app.get('/triage', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'pages', 'triage.html'));
});
// WHY: Old admin dashboard (inquiries + recipients) moved to /admin/inquiries
app.get('/admin/inquiries', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});
app.get('/admin-login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin-login.html'));
});
app.get('/admin/deals', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin-deals.html'));
});
// WHY: Placeholder for deal detail page — route registered so links work even before the page file exists
app.get('/admin/deals/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin-deal-detail.html'));
});
app.get('/admin/project-tracker', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin-project-tracker.html'));
});
app.get('/admin/settings', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin-settings.html'));
});
app.get('/accept-invite', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'accept-invite.html'));
});
app.get('/forgot-password', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'forgot-password.html'));
});
app.get('/reset-password', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'reset-password.html'));
});

// ── Start ───────────────────────────────────────────────────────
// WHY: Await schema init + seeds before binding the port so routes never race against an unready DB.
db.ready
  .then(async () => {
    // Sweep stale collab tickets on boot — anything open + idle for 30+ days
    // is auto-archived so the daily board doesn't accumulate dead weight.
    // Failure is logged, not fatal — board still works without the sweep.
    try {
      const { archived } = await collabRoutes.sweepStaleTickets();
      if (archived > 0) console.log(`[collab] auto-archived ${archived} stale ticket(s) on boot`);
    } catch (e) {
      console.warn('[collab] stale-ticket sweep failed on boot:', e.message);
    }
    app.listen(PORT, () => {
      console.log(`[server] Accelerate Robotics running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[server] Failed to initialize database:', err);
    process.exit(1);
  });
