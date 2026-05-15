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
const RENDER_TIMEOUT_MS = 18_000;
const PRINT_TIMEOUT_MS = 30_000;
// WHY: a thermal label printer feeds a single 4×6 card in 1–3 seconds. If
// the job is still pending after 12s, the printer almost certainly has
// something wrong (paper jam, out of media, paused mid-print). Surfacing
// that as an error to the UI is more useful than a fake "✓ Sent" — the
// rep can investigate while the queued job will still print once cleared.
const JOB_COMPLETION_TIMEOUT_MS = 12_000;
const JOB_POLL_INTERVAL_MS = 500;

// Quote a value for safe embedding in a URL query string.
function q(v) { return encodeURIComponent(String(v == null ? '' : v)); }

// Build the URL the headless browser hits. Profile values land as query
// params; the page's boot block reads them and applies before render.
function buildRenderUrl({ origin, prospect_id, manual_hotel_name, size, profile, photoToken }) {
  const p = profile || {};
  const params = new URLSearchParams();
  if (prospect_id) params.set('prospect', String(prospect_id));
  if (manual_hotel_name) params.set('manualHotel', manual_hotel_name);
  if (size) params.set('size', String(size));
  if (p.name)  params.set('name', p.name);
  if (p.role)  params.set('role', p.role);
  if (p.phone) params.set('phone', p.phone);
  if (p.email) params.set('email', p.email);
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
        // Budget bumped to 9s — the photo fetch + decode pipeline needs
        // time to complete before Chrome captures the PDF, otherwise the
        // image renders as a placeholder block ("solid square" reported
        // by the field).
        '--virtual-time-budget=9000',
        '--run-all-compositor-stages-before-draw',
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

// Pure parser for `lpstat -p <printer> -l` output. Split out so it's unit-
// testable without shelling out to CUPS. Returns the first problem found
// (caller only needs one reason to refuse the print). Order matters:
// "disabled" wins over "offline" because a disabled queue won't auto-recover
// even if the device comes back.
//
// Returns one of:
//   { ok: true }
//   { ok: false, recoverable: bool, reason: string, error: string }
//
// `recoverable` is true when a `cupsdisable && cupsenable` cycle is likely
// to clear the state (e.g. CUPS marked the printer offline after a USB
// blip but the device is still physically present). False for states that
// need operator action (disabled queue, rejecting jobs).
//
// WHY this parser exists: previous version only checked "disabled" and
// "Rejecting Jobs", which meant a printer marked **offline** (USB unplugged,
// network unreachable, power off) silently passed the readiness check. The
// queue was still "enabled," so `lp` happily accepted jobs that piled up
// behind a stuck "active" job, and the UI reported "✓ Sent" while no paper
// ever came out. We now also detect offline / waiting / unable-to-connect.
function parsePrinterState(out, printer) {
  if (/disabled/i.test(out)) {
    return {
      ok: false,
      recoverable: false,
      reason: 'disabled',
      error: `printer ${printer} is disabled — run \`cupsenable ${printer}\``,
    };
  }
  if (/Rejecting Jobs/i.test(out)) {
    return {
      ok: false,
      recoverable: false,
      reason: 'rejecting',
      error: `printer ${printer} is rejecting jobs — run \`cupsaccept ${printer}\``,
    };
  }
  // CUPS surfaces device-unreachable state on the indented detail line as
  // one of these phrases. Any of them means new jobs will queue but never
  // deliver until the link is restored.
  if (/(the printer is offline|waiting for printer|unable to connect to)/i.test(out)) {
    return {
      ok: false,
      recoverable: true,
      reason: 'offline',
      error: `printer ${printer} is offline — check the cable/power, then run \`cupsdisable ${printer} && cupsenable ${printer}\` to re-probe`,
    };
  }
  return { ok: true };
}

// Run lpstat once and parse the result. Wraps errors from execFileSync so
// the caller gets a uniform result object instead of having to try/catch.
function checkPrinterStateOnce(printer) {
  let out;
  try {
    out = execFileSync('lpstat', ['-p', printer, '-l'], { encoding: 'utf-8', timeout: 4000 });
  } catch (err) {
    if (err.code === 'ENOENT' || /no destination/i.test(String(err.message))) {
      return {
        ok: false,
        recoverable: false,
        reason: 'unconfigured',
        error: `printer ${printer} is not configured on this machine`,
      };
    }
    return {
      ok: false,
      recoverable: false,
      reason: 'lpstat-failed',
      error: `lpstat failed: ${err.message}`,
    };
  }
  return parsePrinterState(out, printer);
}

// Best-effort CUPS recovery: cycle the queue's delivery state to force a
// device re-probe. This is the same fix an operator would run by hand
// (`cupsdisable && cupsenable`) when a printer is stuck in "offline" after
// a USB cable wiggle. Idempotent — safe to call on an already-healthy
// printer (the cycle just no-ops back to enabled). Returns whether both
// commands succeeded.
function recoverPrinter(printer) {
  try {
    execFileSync('cupsdisable', [printer], { timeout: 4000 });
    execFileSync('cupsenable', [printer], { timeout: 4000 });
    return true;
  } catch (err) {
    console.warn(`[print-label] recovery cycle failed for ${printer}:`, err.message);
    return false;
  }
}

function ensurePrinterReady(printer) {
  const first = checkPrinterStateOnce(printer);
  if (first.ok) return;
  // For recoverable states (offline / waiting / unreachable), kick CUPS once
  // before failing — the same recovery a human would do. Most "offline"
  // states clear on the first cycle.
  if (first.recoverable) {
    console.log(`[print-label] ${first.reason} detected for ${printer}; attempting auto-recovery`);
    if (recoverPrinter(printer)) {
      const second = checkPrinterStateOnce(printer);
      if (second.ok) {
        console.log(`[print-label] auto-recovered ${printer}`);
        return;
      }
      throw new Error(second.error);
    }
  }
  throw new Error(first.error);
}

// Poll `lpstat -o <printer>` until the given job ID no longer appears (job
// left the queue) or the timeout elapses. Returns { done: true } on real
// completion, { done: false } if the job is still queued after timeout.
//
// WHY: `lp` returns success as soon as the job is enqueued — it can't tell
// us whether the printer actually rendered the page. A jammed printer,
// out-of-media, or held-for-auth job sits "active" forever. Polling the
// queue is the only way to distinguish "accepted and printed" from
// "accepted and stuck."
function waitForJobCompletion(printer, jobId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const tick = () => {
      execFile('lpstat', ['-o', printer], { timeout: 2000 }, (err, stdout) => {
        // lpstat exits non-zero when there are no jobs — that's our success
        // signal, not an error.
        const out = String(stdout || '');
        if (!out.includes(jobId)) return resolve({ done: true });
        if (Date.now() >= deadline) return resolve({ done: false });
        setTimeout(tick, JOB_POLL_INTERVAL_MS);
      });
    };
    tick();
  });
}

router.post('/send', async (req, res) => {
  const body = req.body || {};
  const prospect_id = Number(body.prospect_id);
  const manual_hotel_name = (body.manual_hotel_name || '').trim().slice(0, 120);
  // WHY: Accept either prospect_id (full pipeline data) or manual_hotel_name
  // (typed-in name for hotels not yet in the pipeline — cold drop-ins).
  if ((!Number.isInteger(prospect_id) || prospect_id <= 0) && !manual_hotel_name) {
    return res.status(400).json({ error: 'prospect_id or manual_hotel_name required' });
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
  const url = buildRenderUrl({ origin, prospect_id, manual_hotel_name, size, profile: body.profile, photoToken });

  const fileTag = prospect_id > 0 ? prospect_id : 'manual';
  const tmpFile = path.join(os.tmpdir(), `accelerate-label-${Date.now()}-${fileTag}.pdf`);

  try {
    await renderToPdf(url, tmpFile);
    // Diagnostic: keep a copy of the most recent render so we can inspect
    // what was actually sent to the printer (pdfimages, pdftotext, etc).
    try { fs.copyFileSync(tmpFile, '/tmp/accelerate-label-last.pdf'); } catch {}
    console.log('[print-label] rendered →', url);
    const jobId = await lpSend(printer, tmpFile);
    // Post-submit verification: `lp` returns as soon as the job is enqueued,
    // which says nothing about whether the printer actually rendered it.
    // Wait until the job leaves the queue (completed) or the timeout fires
    // (jammed / out of media / paused mid-print). Surfacing the difference
    // is what makes the "✓ Sent" indicator trustworthy.
    const verdict = await waitForJobCompletion(printer, jobId, JOB_COMPLETION_TIMEOUT_MS);
    if (!verdict.done) {
      console.warn(`[print-label] job ${jobId} did not complete within ${JOB_COMPLETION_TIMEOUT_MS}ms`);
      return res.status(500).json({
        error: `job ${jobId} accepted but did not complete within ${JOB_COMPLETION_TIMEOUT_MS / 1000}s — check the printer for jams, low media, or a paused state. The job will print once the issue is cleared.`,
        job_id: jobId,
        verified: false,
      });
    }
    res.json({ ok: true, job_id: jobId, printer, size, verified: true, debug_pdf: '/tmp/accelerate-label-last.pdf' });
  } catch (err) {
    console.error('[print-label] send failed:', err.message);
    res.status(500).json({ error: err.message });
  } finally {
    // Clean up the temp PDF asynchronously — no need to await.
    fs.unlink(tmpFile, () => {});
  }
});

// Quick health endpoint so the page can show "printer ready / offline".
// Does NOT auto-recover — this is a passive probe. Recovery is reserved
// for actual print attempts (POST /send) and explicit operator action
// (POST /reset).
router.get('/health', (_req, res) => {
  const printer = DEFAULT_PRINTER;
  const state = checkPrinterStateOnce(printer);
  if (state.ok) {
    return res.json({ ok: true, printer, status: 'ready' });
  }
  res.json({
    ok: false,
    printer,
    status: 'unavailable',
    reason: state.reason,
    recoverable: !!state.recoverable,
    error: state.error,
  });
});

// Manual one-click reset, surfaced as a button in the UI when health goes
// red. Runs the full recovery dance — cancel pending jobs, cycle the queue
// state, re-accept jobs — then returns the post-recovery state.
//
// WHY this exists despite auto-recovery: auto-recovery only kicks in on a
// print attempt and only cycles disable/enable. If the queue has a stuck
// job that auto-recovery can't clear (e.g. a job stuck "active" mid-render
// because the printer was unplugged), the operator needs a way to flush it
// without dropping to a terminal. This is that escape hatch.
router.post('/reset', (_req, res) => {
  const printer = DEFAULT_PRINTER;
  const steps = [];
  // Each step is best-effort — we collect outcomes and let the operator
  // see what worked. A failure on one step doesn't stop the next.
  const runStep = (cmd, args) => {
    const label = `${cmd} ${args.join(' ')}`;
    try {
      execFileSync(cmd, args, { timeout: 4000, encoding: 'utf-8' });
      steps.push({ cmd: label, ok: true });
    } catch (err) {
      steps.push({ cmd: label, ok: false, error: String(err.message).split('\n')[0] });
    }
  };
  runStep('cancel', ['-a', printer]);
  runStep('cupsdisable', [printer]);
  runStep('cupsenable', [printer]);
  runStep('cupsaccept', [printer]);
  const state = checkPrinterStateOnce(printer);
  res.json({
    ok: state.ok,
    printer,
    steps,
    state,
  });
});

module.exports = router;
// Exported for unit tests. The route handler itself is the Express router
// above; this side-export keeps the pure parser reachable without spinning
// up the server.
module.exports.parsePrinterState = parsePrinterState;
