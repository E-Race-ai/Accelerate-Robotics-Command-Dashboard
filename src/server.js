require('dotenv/config');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

// WHY: Import db first so schema + seed run before routes try to query.
// The libsql-based db module exports a `ready` promise that server.js awaits before listen().
const db = require('./db/database');

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
      connectSrc: ["'self'"],
      // WHY: YouTube embeds + same-origin iframes (elevator-embed.html) + Creative Labs robot command embed
      frameSrc: ["'self'", "https://www.youtube.com", "https://www.youtube-nocookie.com", "http://localhost:3100"],
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

// ── Static files ───────────────��────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));
// WHY: Serve the pages/ directory for standalone HTML pages (robot catalog, etc.)
// WHY: no-cache ensures dev changes are always picked up — browser still validates with the server
app.use('/pages', express.static(path.join(__dirname, '..', 'pages'), {
  setHeaders: (res) => { res.setHeader('Cache-Control', 'no-cache'); }
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
];
const fs = require('fs');
for (const repo of hotelRepos) {
  const siblingPath = path.join(HOTEL_REPOS_SIBLING, repo);
  const bundledPath = path.join(HOTEL_REPOS_BUNDLED, repo);
  // WHY: Prefer sibling (local dev with live edits) over bundled (production fallback)
  const repoPath = fs.existsSync(siblingPath) ? siblingPath : bundledPath;
  app.use(`/repos/${repo}`, express.static(repoPath));
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

// ── SPA fallback for admin routes ───────────────────────────────
// WHY: /admin is the master command center — unified dashboard for all tools
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin-command-center.html'));
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
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[server] Accelerate Robotics running at http://localhost:${PORT}`);
    });
  })
  .catch((err) => {
    console.error('[server] Failed to initialize database:', err);
    process.exit(1);
  });
