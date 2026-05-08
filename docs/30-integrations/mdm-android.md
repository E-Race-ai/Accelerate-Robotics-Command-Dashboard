# MDM (Mobile Device Management) — Android via AMAPI

The MDM module provisions and manages Android devices through Google's
[Android Management API](https://developers.google.com/android/management).
It targets two device fleets:

1. **Robot tablets** — embedded Android 10+ tablets inside Keenon-style
   service robots. Run in fully-managed kiosk mode, locked to the
   robot's UI app.
2. **Atlas-owned staff devices** — off-the-shelf Android tablets and
   phones used by technicians to diagnose / configure robots in the
   field. Fully-managed but not kiosked.

The console is at `/pages/mdm.html` (toolkit tile under **I.T.**).
API surface is `/api/mdm/*` (see `src/routes/mdm.js`). The AMAPI client
wrapper is `src/services/mdm-amapi.js`.

## Architecture

```
┌──────────────────┐       JWT cookie       ┌──────────────────────┐
│  /pages/mdm.html │ ─────────────────────► │  /api/mdm/* routes   │
│  (Alpine + HTML) │ ◄───────────────────── │  (requireAuth)       │
└──────────────────┘                        └──────────┬───────────┘
                                                       │  ADC or service-account JSON
                                                       │  (scope: androidmanagement)
                                                       ▼
                                            ┌──────────────────────┐
                                            │  Google AMAPI        │
                                            │  enterprises/LC...   │
                                            └──────────────────────┘
```

The dashboard's existing JWT-cookie auth gates access — no separate
bearer token. AMAPI itself is authenticated via Application Default
Credentials in dev (`gcloud auth application-default login`) and by a
service-account JSON key in prod (path in `GOOGLE_APPLICATION_CREDENTIALS`).

## Setup (one-time, ~45 min)

### 1. GCP project + AMAPI

1. Create a GCP project at <https://console.cloud.google.com/> (or reuse
   one). Enable **Android Management API** under APIs & Services → Library.
2. Set up billing on the project. AMAPI itself is free to call, but GCP
   requires a billing account on file.

### 2. Choose an EMM-identity Google account

> ⚠️ **Workspace gotcha** — read this before picking an account.
>
> Google's AMAPI signup wizard at `enterprise.google.com/signup/android/email`
> rejects any Google Workspace email with "Can't enable Android Enterprise
> with this account / G Suite is not currently supported by managed Google
> Play Accounts."
>
> The reason: Workspace customers wanting AMAPI must go through one of
> Google's pre-registered EMM partners (Microsoft Intune, VMware Workspace
> ONE, etc.). For a custom in-house EMM like ours, there is **no
> self-serve path** — you'd have to apply for Google EMM partnership
> (multi-week+ business agreement).
>
> Workaround: use a **non-Workspace Google account** (a free Gmail or a
> Cloud Identity Free account on a separate domain) for the EMM-identity
> signup. The actual enterprise data — devices, policies, telemetry —
> binds to the GCP project (which is owned by your real corporate
> account). The EMM-identity Gmail is just a registration formality.
>
> Today's Accelerate Robotics setup uses `mdm.acceleraterobotics@gmail.com`
> as the EMM identity. Treat that account like any other production
> credential: 2FA, recovery email pointing at corporate@, password in
> the team password manager.

### 3. Authenticate locally (dev)

We use Application Default Credentials in dev. Service-account JSON keys
are blocked by default on new GCP orgs (the
`iam.disableServiceAccountKeyCreation` org policy). Don't fight that —
ADC is what Google recommends now, and our code supports both.

```bash
brew install --cask google-cloud-sdk    # if not already installed
gcloud auth application-default login \
  --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/androidmanagement
gcloud auth application-default set-quota-project <your-project-id>
gcloud config set project <your-project-id>
```

> ⚠️ **Don't forget the `--scopes` flag.** AMAPI needs the dedicated
> `androidmanagement` scope; the default `cloud-platform` scope alone
> will return `ACCESS_TOKEN_SCOPE_INSUFFICIENT`.

### 4. Sign up for AMAPI

Run the standalone signup script (lives in the original MDM tool repo
at `~/Code/accelerate-robotics-mdm/backend/scripts/signup_enterprise.py`).
Sign in to **the non-Workspace Gmail** when the wizard opens. It creates
a Managed Google Play organization and binds it to your GCP project.

The script returns an enterprise resource name like `enterprises/LC00sj3op5`.
**Save this** — you can't re-derive it.

### 5. Configure the dashboard

In `.env`:

```bash
AMAPI_ENTERPRISE_NAME=enterprises/LC00sj3op5
AMAPI_POLICY_ID=default
# GOOGLE_APPLICATION_CREDENTIALS=  # leave blank in dev (uses ADC)
```

Restart the dashboard. First request to `/api/mdm/policy` will
auto-create the default policy (PATCH overwrites; idempotent).

### 6. Production (when we deploy)

In production, ADC won't work — there's no `gcloud` user session on a
deployed Render instance. Two options:

- **Service account JSON** — generate a key (requires overriding the
  `iam.disableServiceAccountKeyCreation` org policy as a one-time
  exception), upload to Render as a secret file, point
  `GOOGLE_APPLICATION_CREDENTIALS` at it.
- **Workload Identity Federation** — better long-term answer; lets
  Render-issued OIDC tokens stand in for service-account credentials.
  Not yet wired.

## Enrolling a device

> User-facing walkthrough lives inside the console at the **Onboarding**
> view. This section is the engineer-facing "what's actually happening."

1. Operator clicks **+ Enroll device** → backend calls
   `enrollmentTokens.create` with the default policy reference and
   `allowPersonalUsage: PERSONAL_USAGE_DISALLOWED` (forces fully-managed
   mode, required for kiosk-style robot tablets).
2. AMAPI returns a token with a `qrCode` field — a Google-formatted JSON
   string the Android setup wizard expects verbatim. We base64url-encode
   it and return a `qr_png_url` to the UI.
3. UI fetches the QR PNG (cookies travel automatically — same-origin),
   displays it.
4. Tablet: factory reset → Welcome screen → tap 6× → camera → scan QR.
5. Tablet downloads Android Device Policy (Google's DPC), provisions
   itself, applies the policy, and reports back to AMAPI.
6. Tablet shows up in `enterprises.devices.list` within ~3-5 minutes.
   The console polls `/api/mdm/devices` every 15 seconds when the
   Devices view is open.

## What's NOT yet built (deferred)

- **Pub/Sub for live device telemetry.** Currently we poll on a 15s timer.
  Real-time updates need an enterprise-level `pubsubTopic` configured via
  `enterprises.patch` and a webhook receiver in Express. Adds ~2 hours.
- **Multi-policy / device tagging.** `AMAPI_POLICY_ID=default` is hard-
  coded for now. Tagging robots vs. staff devices and applying different
  policies (kiosk-mode for robots, standard for staff) is the v0.2 scope.
- **Wipe.** Different AMAPI verb (`enterprises.devices.delete` with
  `wipeDataFlags`), not `issueCommand`. Disabled in the UI with a
  TODO.
- **Operation status polling.** `issueCommand` returns an `Operation`
  resource that completes asynchronously. Today we surface the operation
  name and stop. Real UX needs polling `enterprises.operations.get` or
  Pub/Sub callbacks (see above).
- **Activity log persistence.** No SQLite table yet for command history
  / audit trail. AMAPI itself doesn't track operator-side history.
- **Onboarding for non-GMS devices.** Some Chinese-OEM Android devices
  ship without Google Play Services. AMAPI cannot manage those. The
  Keenon tablets we plan to deploy on need a GMS check before
  attempting enrollment — see the in-app Onboarding view's
  troubleshooting section.

## Standalone tool (legacy)

Before the Command Dashboard integration, this functionality lived as
a separate FastAPI/Python service at `~/Code/accelerate-robotics-mdm/`.
That tool is now superseded by this native module. The Python source
is preserved as a reference but is not deployed alongside the dashboard.
