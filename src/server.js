require('dotenv/config');
const express = require('express');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const path = require('path');

// WHY: Import db first so schema + seed run before routes try to query
require('./db/database');

const authRoutes = require('./routes/auth');
const inquiryRoutes = require('./routes/inquiries');
const recipientRoutes = require('./routes/recipients');
const stockRoutes = require('./routes/stocks');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security ────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      imgSrc: ["'self'", "data:", "https://img.youtube.com"],
      connectSrc: ["'self'"],
      // WHY: YouTube embeds + same-origin iframes (elevator-embed.html) require iframe permission
      frameSrc: ["'self'", "https://www.youtube.com", "https://www.youtube-nocookie.com"],
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

// ── Static files ────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '..', 'public')));

// ── API routes ──────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/inquiries', (req, res, next) => {
  // WHY: Only rate-limit the public POST, not admin GET/PATCH
  if (req.method === 'POST') return inquiryLimiter(req, res, next);
  next();
}, inquiryRoutes);
app.use('/api/recipients', recipientRoutes);
app.use('/api/stocks', stockRoutes);

// ── SPA fallback for admin routes ───────────────────────────────
// WHY: Direct navigation to /admin or /admin-login should serve the HTML files
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin.html'));
});
app.get('/admin-login', (req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'admin-login.html'));
});

// ── Start ───────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[server] Accelerate Robotics running at http://localhost:${PORT}`);
});
