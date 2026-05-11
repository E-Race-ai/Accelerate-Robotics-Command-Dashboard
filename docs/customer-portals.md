# Customer Portals

Branded deal rooms for sharing files with customers, tracking engagement, and collaborating on deals. Replaces ShowPad Shared Spaces.

## What it does

- **Branded space per customer.** Customer logo + Accelerate logo, custom theme colors, custom welcome message.
- **Two-way file sharing.** Internal team uploads via admin UI; customers upload via portal UI (when permitted).
- **Comments.** Threaded conversation on each file.
- **Engagement tracking.** Every visit, view, download, and comment is logged. Admin sees a per-portal dashboard.
- **Magic-link auth.** External (customer) users sign in by email — no passwords.
- **Permission toggles.** Per-portal: allow downloads, allow uploads, allow customer-side invites.

## Architecture

### URL structure

- **Admin (internal):** `/admin/portals.html` (list), `/admin/portal-detail.html?id=xxx` (single)
- **Customer-facing:** `/portal/<slug>/` (signed-in home), `/portal/<slug>/sign-in.html` (magic-link request)
- **APIs:** `/api/portals/*` (admin), `/api/portal-public/*` (customer)

### Auth model

Two separate auth systems, deliberately:

1. **Admin auth** — uses the existing JWT/session system in the Command Center. Set up before the `/api/portals` router runs.
2. **Customer auth** — separate JWT cookie (`portal_session`), separate secret (`PORTAL_SESSION_SECRET`), separate audience claim. Established via magic link.

The two cannot impersonate each other. An admin token cannot read a portal as a customer; a customer cookie cannot access admin endpoints.

### Tenant isolation

Every customer-facing endpoint goes through `requirePortalSession` middleware which:
1. Reads the session cookie
2. Verifies it's valid and not expired
3. **Verifies the cookie's `portal_id` matches the slug in the URL** ← critical
4. Loads the participant from DB and verifies they're not removed

Result: a participant from Customer A cannot read Customer B data even with crafted URLs.

### File storage

Files live on disk under `data/portal-uploads/files/<portal_id>/<random_id>.<ext>`. Originals are renamed to random IDs so filenames are not user-controlled (prevents path traversal). All paths are resolved through `resolveStoredPath()` which guards against `../` escape.

For scale, swap disk storage for S3 — only `services/portals/uploads.js` needs to change. The DB stores relative paths, not URLs.

### Magic links

- 32 random bytes, base64url-encoded
- Stored as SHA-256 hash (raw token only ever lives in the email)
- 15-minute TTL
- Single-use (consumed_at set on first verify)
- Rate-limited: 20 attempts per IP per hour

## Developing locally

```bash
npm install                                    # already done
cp .env.example .env                           # ensure new vars are set (PORTAL_BASE_URL, etc.)
npm run dev                                     # starts server on :3000
```

Open `http://localhost:3000/admin/portals.html` (after admin login). Create a portal, invite yourself with `send_invite=false` so no real email is sent, then manually request a magic link from the sign-in page — in dev (no `RESEND_API_KEY`) the link is logged to console.

### Migration

`src/migrations/003_portals.sql` creates 6 new tables. Run via the existing migration runner, or:

```js
import fs from 'node:fs';
import { db } from './src/db.js';
const sql = fs.readFileSync('./src/migrations/003_portals.sql', 'utf8');
// libsql executes statements one at a time — split on `;` is naive but works for this file.
for (const stmt of sql.split(/;\s*$/m).filter(s => s.trim())) {
  await db.execute(stmt);
}
```

## What's NOT included (deferred)

- **Mutual Action Plan** (next steps tracking) — was originally a ShowPad feature; left out of v1 per scope discussion.
- **"Publish to portal" buttons** in Proposal Builder, Fleet Designer, ROI Model — the data model supports them (`source_tool`, `source_record_id` fields on `portal_content`), the UI buttons need to be added to those tools' admin pages.
- **Office viewer integration** — files download to the customer's machine. PDF viewer in browser would need a separate library (PDF.js).
- **Notifications digest** for portal owners. Activity events are logged; the digest runner is not built.
- **CRM integration.** Per scope discussion, intentionally not in v1.

## Operational notes

### Email deliverability

The "From" address (`PORTAL_EMAIL_FROM`) must be on a domain verified in Resend. Customer-facing emails are critical — bounced or junked sign-in links break the entire feature for that customer.

### Cookies & subdomains

The portal session cookie is set with `path=/` and is host-only (no domain attribute). It will work for `acceleraterobotics.ai/portal/...` but NOT for `customer.acceleraterobotics.ai/...`. If we ever add per-customer subdomains, update `setSessionCookie()` in `services/portals/auth.js`.

### Backups

The `data/portal-uploads/` directory holds customer files and is NOT in the regular DB backup. It needs its own backup plan — rsync to S3, or move storage to S3 entirely.

### Privacy

Customer email addresses, names, and uploaded files are stored. If/when we need GDPR data export or deletion, the entry points are:
- `portal_participants` (PII)
- `portal_content` (uploaded files — also disk)
- `portal_activity` (IP addresses, user agents)
- `portal_comments` (free text)

A "delete portal" admin action would cascade through all of these. Not built but the schema's foreign keys with `ON DELETE CASCADE` make it a one-line query.
