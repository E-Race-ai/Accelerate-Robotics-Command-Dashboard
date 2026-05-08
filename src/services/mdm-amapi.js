// Node port of the Android Management API (AMAPI) client originally written
// in Python for the standalone MDM tool at ~/Code/accelerate-robotics-mdm/.
//
// WHY: The standalone tool used FastAPI/Python; bringing the same surface
// into the Command Dashboard required a Node port so we have one process,
// one auth, one deployment story.
//
// Authentication: prefers a service-account JSON key when
// `GOOGLE_APPLICATION_CREDENTIALS` is set; otherwise falls back to
// Application Default Credentials (gcloud auth application-default login).
// See docs/30-integrations/mdm-android.md.

const { google } = require('googleapis');

// The androidmanagement scope is dedicated and NOT covered by cloud-platform.
// WHY: Common gotcha — using only cloud-platform scope returns
// ACCESS_TOKEN_SCOPE_INSUFFICIENT.
const SCOPE = 'https://www.googleapis.com/auth/androidmanagement';

// Default policy applied at first boot. Intentionally minimal — proves the
// PATCH path without committing to the full eventual policy shape.
const DEFAULT_POLICY_BODY = {
  applications: [
    { packageName: 'com.google.android.apps.maps', installType: 'AVAILABLE' },
  ],
  passwordRequirements: {
    passwordMinimumLength: 6,
    passwordQuality: 'ALPHABETIC',
  },
  debuggingFeaturesAllowed: false,
  playStoreMode: 'WHITELIST',
};

// One-shot enrollment token duration. AMAPI defaults to 1 hour; we make
// it explicit so tokens generated from the UI are predictable.
const TOKEN_DURATION_SECONDS = 3600;

class AmapiClient {
  constructor({ enterpriseName, policyId = 'default', credentialsPath = null }) {
    if (!enterpriseName || !/^enterprises\/[A-Za-z0-9]+$/.test(enterpriseName)) {
      throw new Error('AmapiClient: invalid enterpriseName, expected "enterprises/LC######"');
    }
    this.enterpriseName = enterpriseName;
    this.policyId = policyId;
    this._credentialsPath = credentialsPath;
    this._client = null;
  }

  // Lazy auth + discovery — first call pays the network cost; subsequent
  // calls reuse the same authed client.
  async _service() {
    if (this._client) return this._client;
    const auth = new google.auth.GoogleAuth({
      keyFile: this._credentialsPath || undefined,
      scopes: [SCOPE],
    });
    this._client = google.androidmanagement({ version: 'v1', auth });
    return this._client;
  }

  policyName() {
    return `${this.enterpriseName}/policies/${this.policyId}`;
  }

  deviceName(deviceId) {
    return `${this.enterpriseName}/devices/${deviceId}`;
  }

  // ----- Enrollment tokens -----

  async createEnrollmentToken({ durationSeconds = TOKEN_DURATION_SECONDS } = {}) {
    const svc = await this._service();
    const { data } = await svc.enterprises.enrollmentTokens.create({
      parent: this.enterpriseName,
      requestBody: {
        policyName: this.policyName(),
        duration: `${durationSeconds}s`,
        // WHY: PERSONAL_USAGE_DISALLOWED forces fully-managed mode (vs.
        // work-profile-on-personal-device). Required for Keenon-style robot
        // tablets where the device is the asset, not a personal phone.
        allowPersonalUsage: 'PERSONAL_USAGE_DISALLOWED',
      },
    });
    return data;
  }

  async listEnrollmentTokens() {
    const svc = await this._service();
    const { data } = await svc.enterprises.enrollmentTokens.list({
      parent: this.enterpriseName,
    });
    return data.enrollmentTokens || [];
  }

  async deleteEnrollmentToken(tokenId) {
    const svc = await this._service();
    const name = `${this.enterpriseName}/enrollmentTokens/${tokenId}`;
    await svc.enterprises.enrollmentTokens.delete({ name });
  }

  // ----- Devices -----

  async listDevices() {
    const svc = await this._service();
    const { data } = await svc.enterprises.devices.list({
      parent: this.enterpriseName,
    });
    return data.devices || [];
  }

  async getDevice(deviceId) {
    const svc = await this._service();
    const { data } = await svc.enterprises.devices.get({ name: this.deviceName(deviceId) });
    return data;
  }

  // Issues a command (LOCK / REBOOT). Returns an Operation; execution is
  // async on the device side. Without Pub/Sub we can't observe completion;
  // the operation name is useful for audit trails only.
  async issueCommand(deviceId, commandType) {
    const svc = await this._service();
    const { data } = await svc.enterprises.devices.issueCommand({
      name: this.deviceName(deviceId),
      requestBody: { type: commandType },
    });
    return data;
  }

  // ----- Policy -----

  async getPolicy() {
    const svc = await this._service();
    const { data } = await svc.enterprises.policies.get({ name: this.policyName() });
    return data;
  }

  async patchPolicy(body) {
    const svc = await this._service();
    const { data } = await svc.enterprises.policies.patch({
      name: this.policyName(),
      requestBody: body,
    });
    return data;
  }

  // Idempotent — called on first request from the route layer to ensure
  // the default policy exists. Re-runs are cheap (PATCH overwrites).
  async ensureDefaultPolicy() {
    return this.patchPolicy(DEFAULT_POLICY_BODY);
  }
}

// Singleton accessor — first call constructs from env, subsequent calls
// reuse. Throws if config is missing so the caller fails fast at the
// route boundary.
let _cached = null;

function getAmapiClient() {
  if (_cached) return _cached;
  const enterpriseName = process.env.AMAPI_ENTERPRISE_NAME;
  if (!enterpriseName) {
    throw new Error('AMAPI not configured: AMAPI_ENTERPRISE_NAME missing in env');
  }
  _cached = new AmapiClient({
    enterpriseName,
    policyId: process.env.AMAPI_POLICY_ID || 'default',
    credentialsPath: process.env.GOOGLE_APPLICATION_CREDENTIALS || null,
  });
  return _cached;
}

// Test seam — let integration tests inject a fake without a real Google
// auth round-trip. WHY: googleapis pulls in OAuth2 + token refresh which
// hits the network at construction time; mocking at this level avoids
// that without us having to mock the entire google.auth stack.
function _setAmapiClientForTests(client) {
  _cached = client;
}

module.exports = {
  AmapiClient,
  getAmapiClient,
  _setAmapiClientForTests,
  DEFAULT_POLICY_BODY,
  TOKEN_DURATION_SECONDS,
};
