// MDM (Mobile Device Management) — Android Management API integration.
//
// Manages two device fleets via Google's AMAPI:
//   1. Robot tablets (Keenon and similar) — dedicated/kiosk mode
//   2. Atlas-owned staff devices — fully managed mode
//
// All routes require admin auth via JWT cookie. Singleton AMAPI client
// is constructed lazily from env (AMAPI_ENTERPRISE_NAME, etc.).
//
// See docs/30-integrations/mdm-android.md for the full integration story
// including the Workspace gotcha (why the EMM identity is on a Gmail and
// not corporate@acceleraterobotics.ai).

const express = require('express');
const QRCode = require('qrcode');
const { requireAuth } = require('../middleware/auth');
const { getAmapiClient } = require('../services/mdm-amapi');

const router = express.Router();

// Allow-list of supported device commands. AMAPI accepts more (e.g.
// CLEAR_APP_DATA, START_LOST_MODE) but we keep a tight surface for now —
// expand this list when those flows are wired in the UI.
// WHY: WIPE is intentionally NOT here — it uses a different AMAPI verb
// (enterprises.devices.delete with wipeDataFlags), not issueCommand.
const ALLOWED_COMMAND_TYPES = new Set(['LOCK', 'REBOOT']);

// Translates googleapis errors into HTTP responses. AMAPI wraps its
// errors in a googleapis exception with a `.code` (HTTP status) and
// `.errors` (Google-shape error array). Surface the inner message so
// the UI can show "AMAPI returned 403: invalid signup URL name" instead
// of "Internal Server Error."
function amapiErrorToHttp(err) {
  const status = err && (err.code || err.status) ? Number(err.code || err.status) : 502;
  const inner = err?.errors?.[0]?.message || err?.message || 'Unknown AMAPI error';
  return { status, body: { error: 'amapi_error', detail: inner } };
}

// Idempotent first-request guard — ensures the default policy exists.
// WHY: AMAPI policies don't auto-create. Without this, the first
// enrollment-token request fails because the policy it references
// doesn't exist yet. Running on every request is wasteful, so we
// gate it with an in-memory flag that resets on server restart.
let _defaultPolicyEnsured = false;
async function ensureDefaultPolicyOnce(client) {
  if (_defaultPolicyEnsured) return;
  await client.ensureDefaultPolicy();
  _defaultPolicyEnsured = true;
}

// All MDM API routes require auth.
router.use(requireAuth);

// ── Health (auth-required for parity with the rest; non-AMAPI) ──
router.get('/health', (req, res) => {
  res.json({ status: 'ok', enterprise: process.env.AMAPI_ENTERPRISE_NAME || null });
});

// ── Policy ─────────────────────────────────────────────────────

router.get('/policy', async (req, res) => {
  try {
    const client = getAmapiClient();
    await ensureDefaultPolicyOnce(client);
    const policy = await client.getPolicy();
    res.json(policy);
  } catch (err) {
    const { status, body } = amapiErrorToHttp(err);
    res.status(status).json(body);
  }
});

router.patch('/policy', async (req, res) => {
  if (!req.body || typeof req.body !== 'object') {
    return res.status(400).json({ error: 'request body must be a JSON object' });
  }
  try {
    const client = getAmapiClient();
    const policy = await client.patchPolicy(req.body);
    res.json(policy);
  } catch (err) {
    const { status, body } = amapiErrorToHttp(err);
    res.status(status).json(body);
  }
});

// ── Enrollment tokens ──────────────────────────────────────────

// Creates a new token and returns metadata + a relative URL the UI can
// use to render the QR PNG. We don't pre-render the PNG into the JSON
// because Google's qrCode payload is large (~600 bytes) and the UI
// already needs to authenticate the PNG fetch anyway.
router.post('/enrollment-tokens', async (req, res) => {
  try {
    const client = getAmapiClient();
    await ensureDefaultPolicyOnce(client);
    const tok = await client.createEnrollmentToken();
    const payload = Buffer.from(tok.qrCode, 'utf-8').toString('base64url');
    res.json({
      name: tok.name,
      value: tok.value,
      qr_code: tok.qrCode,
      expiration_timestamp: tok.expirationTimestamp,
      qr_png_url: `/api/mdm/enrollment-tokens/qr?payload=${payload}`,
    });
  } catch (err) {
    const { status, body } = amapiErrorToHttp(err);
    res.status(status).json(body);
  }
});

router.get('/enrollment-tokens', async (req, res) => {
  try {
    const client = getAmapiClient();
    const tokens = await client.listEnrollmentTokens();
    res.json(tokens);
  } catch (err) {
    const { status, body } = amapiErrorToHttp(err);
    res.status(status).json(body);
  }
});

// Stateless QR PNG renderer. Takes any base64url-encoded payload and
// returns the rendered QR. Auth-gated so the URL can't be used as a
// generic image utility, but the payload itself is what carries the
// enrollment secret — anyone with the payload has the same access as
// scanning the QR.
router.get('/enrollment-tokens/qr', async (req, res) => {
  const payload = req.query.payload;
  if (!payload || typeof payload !== 'string') {
    return res.status(400).json({ error: 'payload query param required' });
  }
  let decoded;
  try {
    decoded = Buffer.from(payload, 'base64url').toString('utf-8');
  } catch {
    return res.status(400).json({ error: 'invalid base64url payload' });
  }
  if (!decoded || decoded.length === 0) {
    return res.status(400).json({ error: 'empty payload after decode' });
  }
  try {
    const buf = await QRCode.toBuffer(decoded, { type: 'png', errorCorrectionLevel: 'M', margin: 2, width: 512 });
    res.set('Content-Type', 'image/png');
    res.set('Cache-Control', 'no-store');
    res.send(buf);
  } catch (err) {
    res.status(500).json({ error: 'qr render failed', detail: err.message });
  }
});

router.delete('/enrollment-tokens/:tokenId', async (req, res) => {
  const { tokenId } = req.params;
  if (!/^[A-Za-z0-9_-]+$/.test(tokenId)) {
    return res.status(400).json({ error: 'invalid token id' });
  }
  try {
    const client = getAmapiClient();
    await client.deleteEnrollmentToken(tokenId);
    res.status(204).send();
  } catch (err) {
    const { status, body } = amapiErrorToHttp(err);
    res.status(status).json(body);
  }
});

// ── Devices ────────────────────────────────────────────────────

router.get('/devices', async (req, res) => {
  try {
    const client = getAmapiClient();
    const devices = await client.listDevices();
    // Surface a stable trailing-segment device_id alongside the full name
    // so the UI doesn't have to re-derive it.
    res.json(devices.map((d) => ({ ...d, device_id: (d.name || '').split('/').pop() })));
  } catch (err) {
    const { status, body } = amapiErrorToHttp(err);
    res.status(status).json(body);
  }
});

router.get('/devices/:deviceId', async (req, res) => {
  const { deviceId } = req.params;
  if (!/^[A-Za-z0-9_-]+$/.test(deviceId)) {
    return res.status(400).json({ error: 'invalid device id' });
  }
  try {
    const client = getAmapiClient();
    const device = await client.getDevice(deviceId);
    res.json({ ...device, device_id: deviceId });
  } catch (err) {
    const { status, body } = amapiErrorToHttp(err);
    res.status(status).json(body);
  }
});

router.post('/devices/:deviceId/commands', async (req, res) => {
  const { deviceId } = req.params;
  const { type } = req.body || {};
  if (!/^[A-Za-z0-9_-]+$/.test(deviceId)) {
    return res.status(400).json({ error: 'invalid device id' });
  }
  if (!type || !ALLOWED_COMMAND_TYPES.has(type)) {
    return res.status(400).json({
      error: 'invalid command type',
      allowed: Array.from(ALLOWED_COMMAND_TYPES),
    });
  }
  try {
    const client = getAmapiClient();
    const op = await client.issueCommand(deviceId, type);
    res.json({
      operation_name: op.name,
      device_name: client.deviceName(deviceId),
      type,
    });
  } catch (err) {
    const { status, body } = amapiErrorToHttp(err);
    res.status(status).json(body);
  }
});

module.exports = router;
