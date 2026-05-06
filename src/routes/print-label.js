// Server-side direct printing for the concierge leave-behind label.
//
// WHY: window.print() in the browser opens the OS print dialog which the
// rep then has to confirm. For a "leave-behind every site visit" workflow
// that's one click too many. This route renders the label page via Chrome
// headless and pipes the PDF straight to lpr/lp — same path as the CLI
// test prints. Click button → label feeds. No dialog.
//
// Bound to POST /api/print-label/send. Body shape:
//   { prospect_id: number,
//     size: '4x6'|'4x3'|'2x4'|'letter',
//     profile: { name, role, phone, note },
//     printer: 'JADENS_Label' (optional override) }
//
// The rep's photo is intentionally NOT passed across the wire — the
// page uses localStorage for that, and the server-side render reads
// from URL params only (which can't carry a 100KB+ data URL anyway).
// Tradeoff: server-side prints render without a photo. The on-screen
// preview still shows it. Future iteration: persist the photo per user
// in a `/api/me/photo` endpoint and have the server fetch it.

const express = require('express');
const { execFile, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const router = express.Router();

// In-memory photo cache for server-side renders. The page POSTs a base64
// data URL; we stash it under a UUID and pass ?photoToken=<uuid> to the
// headless browser. The browser fetches /api/print-label/photo/:token to
// get the actual image. Entries auto-expire after 2 minutes — long enough
// for the render → print pipeline, short enough that a user closing the
// tab doesn't leave images sitting in memory forever.
const PHOTO_CACHE = new Map(); // token → { dataUrl, expiresAt }
const PHOTO_TTL_MS = 2 * 60 * 1000;
function stashPhoto(dataUrl) {
  if (!dataUrl || typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) return null;
  // Sanity cap — refuse anything bigger than 4 MB to keep RAM bounded.
  if (dataUrl.length > 4 * 1024 * 1024) return null;
  const token = require('crypto').randomBytes(8).toString('hex');
  PHOTO_CACHE.set(token, { dataUrl, expiresAt: Date.now() + PHOTO_TTL_MS });
  // Lazy garbage collection — wipe expired entries on every set.
  for (const [t, v] of PHOTO_CACHE) {
    if (v.expiresAt < Date.now()) PHOTO_CACHE.delete(t);
  }
  return token;
}
router.get('/photo/:token', (req, res) => {
  const entry = PHOTO_CACHE.get(req.params.token);
  if (!entry || entry.expiresAt < Date.now()) {
    PHOTO_CACHE.delete(req.params.token);
    return res.status(404).send('photo not found');
  }
  // Decode the data URL into raw bytes + content type.
  const m = /^data:(image\/[\w+.-]+);base64,(.+)$/.exec(entry.dataUrl);
  if (!m) return res.status(400).send('bad photo data');
  res.set('Content-Type', m[1]);
  res.send(Buffer.from(m[2], 'base64'));
});

const CHROME_PATH = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEFAULT_PRINTER = 'JADENS_Label';
const RENDER_TIMEOUT_MS = 12_000;
const PRINT_TIMEOUT_MS = 30_000;

// Quote a value for safe embedding in a URL query string.
function q(v) { return encodeURIComponent(String(v == null ? '' : v)); }

// Build the URL the headless browser hits. Profile values land as query
// params; the page's boot block reads them and applies before render.
function buildRenderUrl({ origin, prospect_id, size, profile, photoToken }) {
  const p = profile || {};
  const params = new URLSearchParams();
  if (prospect_id) params.set('prospect', String(prospect_id));
  if (size) params.set('size', String(size));
  if (p.name)  params.set('name', p.name);
  if (p.role)  params.set('role', p.role);
  if (p.phone) params.set('phone', p.phone);
  if (p.note)  params.set('note', p.note);
  if (photoToken) params.set('photoToken', photoToken);
  // Disable the page's own auto-print — we're printing server-side.
  params.set('autoprint', '0');
  return `${origin}/pages/print-label.html?${params.toString()}`;
}

function renderToPdf(url, outPath) {
  return new Promise((resolve, reject) => {
    execFile(
      CHROME_PATH,
      [
        '--headless=new', '--disable-gpu',
        '--no-pdf-header-footer', '--no-margins',
        `--print-to-pdf=${outPath}`,
        '--virtual-time-budget=4500',
        url,
      ],
      { timeout: RENDER_TIMEOUT_MS },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(`chrome render failed: ${err.message} ${stderr}`));
        if (!fs.existsSync(outPath) || fs.statSync(outPath).size < 1000) {
          return reject(new Error('rendered PDF is empty or missing'));
        }
        resolve(outPath);
      },
    );
  });
}

function lpSend(printer, pdfPath) {
  return new Promise((resolve, reject) => {
    execFile(
      'lp',
      ['-d', printer, pdfPath],
      { timeout: PRINT_TIMEOUT_MS },
      (err, stdout, stderr) => {
        if (err) return reject(new Error(`lp failed: ${err.message} ${stderr}`));
        // stdout shape: "request id is JADENS_Label-69 (1 file(s))\n"
        const match = String(stdout).match(/request id is (\S+)/);
        resolve(match ? match[1] : (stdout || '').trim());
      },
    );
  });
}

function ensurePrinterReady(printer) {
  try {
    const out = execFileSync('lpstat', ['-p', printer, '-l'], { encoding: 'utf-8', timeout: 4000 });
    if (/disabled/i.test(out)) {
      throw new Error(`printer ${printer} is disabled — run \`cupsenable ${printer}\``);
    }
    if (/Rejecting Jobs/i.test(out)) {
      throw new Error(`printer ${printer} is rejecting jobs — run \`cupsaccept ${printer}\``);
    }
  } catch (err) {
    if (err.code === 'ENOENT' || /no destination/i.test(String(err.message))) {
      throw new Error(`printer ${printer} is not configured on this machine`);
    }
    throw err;
  }
}

router.post('/send', async (req, res) => {
  const body = req.body || {};
  const prospect_id = Number(body.prospect_id);
  if (!Number.isInteger(prospect_id) || prospect_id <= 0) {
    return res.status(400).json({ error: 'prospect_id required' });
  }
  const size = ['4x6', '4x3', '2x4', 'letter'].includes(body.size) ? body.size : '4x6';
  const printer = String(body.printer || DEFAULT_PRINTER).slice(0, 40);

  try {
    ensurePrinterReady(printer);
  } catch (err) {
    return res.status(503).json({ error: err.message });
  }

  // Origin: localhost. We assume the page is served by the same Express
  // instance handling this request. The headless browser fetches the
  // print-label.html page with the rep's profile baked into the URL.
  const port = req.app.get('port') || process.env.PORT || 3000;
  const origin = `http://127.0.0.1:${port}`;

  // Photo: stashed in an in-memory cache keyed by a short-lived token.
  // We pass the token (not the data URL — it's too big for a URL) and
  // the page fetches the image via /api/print-label/photo/:token.
  const photoToken = body.profile?.photo ? stashPhoto(body.profile.photo) : null;
  const url = buildRenderUrl({ origin, prospect_id, size, profile: body.profile, photoToken });

  const tmpFile = path.join(os.tmpdir(), `accelerate-label-${Date.now()}-${prospect_id}.pdf`);

  try {
    await renderToPdf(url, tmpFile);
    const jobId = await lpSend(printer, tmpFile);
    res.json({ ok: true, job_id: jobId, printer, size });
  } catch (err) {
    console.error('[print-label] send failed:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    // Clean up the temp PDF asynchronously — no need to await.
    fs.unlink(tmpFile, () => {});
  }
});

// Quick health endpoint so the page can show "printer ready / offline".
router.get('/health', (_req, res) => {
  const printer = DEFAULT_PRINTER;
  try {
    ensurePrinterReady(printer);
    res.json({ ok: true, printer, status: 'ready' });
  } catch (err) {
    res.json({ ok: false, printer, status: 'unavailable', reason: err.message });
  }
});

module.exports = router;
