# Render deployment — one-time setup

This repo ships with `render.yaml` at the root — a Render Blueprint that declares the web service, persistent disk, and env-var contract. Apply it once and Render auto-deploys on every push to `main`.

## Prerequisites

- Render account linked to the `E-Race-ai` GitHub org
- Secret values ready for the env vars listed below

## Steps

### 1. Create the service from the blueprint

1. Render dashboard → **New** → **Blueprint**
2. Connect GitHub → select `E-Race-ai/accelerate-robotics`
3. Render detects `render.yaml` → review the plan: one Web Service (`accelerate-robotics`), no persistent disk (Turso hosts the database externally)
4. Click **Apply**

### 2. Set the secret env vars

The blueprint declares these as `sync: false` so Render prompts for them on first apply. Paste values from 1Password / Railway's Variables tab:

| Key | Source |
|---|---|
| `DATABASE_URL` | Turso database URL, e.g. `libsql://<db>-<org>.aws-us-west-2.turso.io` |
| `DATABASE_AUTH_TOKEN` | From `turso db tokens create <db>` or Turso dashboard → database → Create Token |
| `JWT_SECRET` | `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` — generate fresh, don't reuse Railway's |
| `ADMIN_EMAIL` | Initial admin login email |
| `ADMIN_PASSWORD` | Initial admin login password (set once, change via UI later) |
| `BOOTSTRAP_ADMIN_EMAILS` | Comma-separated emails to promote to `role='admin'` every boot (e.g. `claude.e.race@atlasmobility.com`) |
| `RESEND_API_KEY` | From Resend dashboard |
| `EMAIL_FROM` | Verified sender (e.g. `notifications@acceleraterobotics.ai`) |
| `ANTHROPIC_API_KEY` | From Anthropic console |

Non-secret env var (`NODE_ENV=production`) is hard-coded in `render.yaml`.

### 3. Wait for first deploy

- Render runs `npm install`, starts the service, seeds the DB into the mounted disk
- Service gets a URL like `https://accelerate-robotics.onrender.com`
- Health check on `/` must return 2xx before the deploy is marked live

### 4. Verify

- Visit `https://<service>.onrender.com/admin` — login page loads
- Log in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- Create a test deal; trigger a manual redeploy from Render → confirm the test deal survives (proves the disk works)

### 5. Custom domain (when ready for cutover)

1. Render service → **Settings** → **Custom Domains** → **+ Add Custom Domain**
2. Enter `acceleraterobotics.ai`
3. Render provides either an A record or a CNAME target
4. Update DNS at your registrar — point `acceleraterobotics.ai` at Render's target
5. Propagation: usually <1 hr, max 48
6. Once the domain shows green in Render, the SSL cert is auto-issued

### 6. Keep Railway as fallback

Keep the Railway service running for 48–72 hours after the DNS swap. If Render has issues, swap DNS back. Once stable, tear down Railway (delete service + volume).

## Rollback

If a deploy breaks prod:
- Render dashboard → **Deploys** tab → hover any previous green deploy → **Rollback**
- Or revert the offending commit on `main`; Render auto-redeploys

## Ongoing maintenance

- **Env var changes:** Render dashboard → service → **Environment** tab → edit. Triggers a redeploy.
- **Blueprint changes:** edit `render.yaml` on `main`; Render applies changes on next deploy.
- **Disk resizing:** Render supports grow-only resize from the Disk panel. Size up if DB > 700 MB.
- **Backups:** see [backup runbook](../runbooks/backup-database.md) (ships in Stage 1).
