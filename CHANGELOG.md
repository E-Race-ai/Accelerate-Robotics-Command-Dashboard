# Changelog

Notable changes to Accelerate Robotics. Keep entries short and user-facing — link to PRs/commits for detail.

Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- **B10 Patient Position Monitor** (2026-05-05): the working Python BLE scanner + live web dashboard from the Atlas LTC Monitor R&D project is now bundled inside Sensor Lab at `repos/b10-playground/app/`. New "B10 Patient Position Monitor" card on the Sensor Lab home links to `app/index.html`, which documents the application, lists every Python source file (`b10_web.py`, `scan_b10.py`, `parse_b10.py`, `find_b10.py`, `b10_live.py`, GATT helpers), the BLE-frame map, and the body-position classification model. Excluded from the bundle: `.venv/`, `data/` (recorded sessions), and `__pycache__`.
- Structured `docs/` knowledge base covering strategy, architecture, integrations, deployments, and operations.
- `.claude/` configuration: rules, skill stubs, agent definitions, commands.
- Initial ADRs documenting SQLite, no-frontend-build-step, JWT-in-httponly-cookie, Miami anchor, button-emulator vs OEM API.
- `CONTRIBUTING.md`, `CHANGELOG.md`, top-level `README.md`.
- Settings page: Super Admin can now set per-module permissions (Edit/View/None on each of the 15 toolkit modules) when inviting a user, with the role's defaults pre-seeded. Per-user overrides can be edited later from a new Edit User modal.
- `POST /api/users/:id/resend-invite` regenerates the invite token and re-sends the email. The Resend button on the Team list no longer 404s.
- `PATCH /api/roles/permissions` — point-edit a single cell of the role × module matrix (frontend uses this from the Permissions tab).
- Command Center toolkit tiles are gated by the logged-in user's permissions: tiles with `permission=none` are hidden on load.
- Forgot-password flow: `/forgot-password` page emails a single-use, 1-hour reset link via `POST /api/auth/forgot-password`. `/reset-password?token=...` validates the token and lets the user set a new password (`POST /api/auth/reset-password`). "Forgot password?" link added to the login page. No enumeration — endpoint returns `{ok:true}` whether the email exists or not. Rate-limited to 5 requests per IP per hour.
- **Project Tracker** (2026-04-23): New admin page at `/admin/project-tracker` — sprint-based planner with projects/tasks/subtasks, Gantt view with collapsible rows and same-parent drag-to-reorder (SortableJS), inline status/owner edits, side-panel drawer for full edits, Manage People modal. 14 REST endpoints under `/api/tracker` behind `requireAuth`. 4 new tables (`tracker_sprints`, `tracker_items` unified for 3 levels, `tracker_people`, `tracker_item_support`). Seeded idempotently with "Hotel Bots - Sprint 1" (10 projects, 2 tasks, 2 milestones) on first boot. Tile added to the Command Center grid.
- `scripts/sync-b10-playground.sh` — one-command sync of the upstream b10-playground (`index.html` + `docs/research/*.md`) into `repos/b10-playground/`. Run from repo root after pulling new b10 changes, then commit on a `chore/sync-b10-playground` branch. Skips the 520 MB `sidecar/` directory; sidecar deploys separately when needed.
- **System settings table + Settings → System tab** (2026-05-01): admins can paste the current Creative Labs cloudflared tunnel URL via `/admin/settings`. Backed by a new `system_settings` SQLite table (key/value with `updated_at` and `updated_by`), exposed via `GET/PUT /api/system-settings/:key` (auth required, key whitelisted).
- **Creative Labs server-side proxy at `/cl/*`** (2026-05-01): forwards requests to the URL stored in `system_settings.creative_labs_url`, so Robot Command and Beam Bot Playground tiles can iframe `/cl/?zone=command` and `/cl/beam-feed.html` (same origin). Reasons for proxying instead of iframing the tunnel URL directly: (1) Eric's network blocks `*.trycloudflare.com` at the router DNS, which would also affect any teammate visiting the office; (2) the tunnel URL stays server-side, never exposed to browsers; (3) auth piggybacks on the existing JWT cookie. WebSocket upgrades pass through. Upstream `X-Frame-Options` and `Content-Security-Policy` headers are stripped so the existing helmet CSP governs the proxied response. URL is cached for 30s; cache invalidates immediately when an admin updates Settings → System.

### Changed
- `CLAUDE.md` restructured to reference `.claude/rules/` and `docs/` instead of duplicating guidance.
- Invite API (`POST /api/users/invite`) now accepts `modulePermissions: { module: 'edit'|'view'|'none' }` for any role, not just `module_owner`. The legacy `modules: []` (edit-only) shape is still accepted for back-compat.
- Test helper `admin_users` schema now matches production (role CHECK includes `super_admin`, `module_owner`; status/invite columns present) so invite flows can be integration-tested.

### Fixed
- Robot Command and Beam Bot Playground tiles 404'd because they pointed at `/repos/b10-playground/index.html#command` and `/repos/b10-playground/beam-feed.html` — neither file exists in b10-playground (beam-feed lives in home-dashboard; b10-playground has no command UI). Both tiles now route to new `pages/robot-command-embed.html` and `pages/beam-feed-embed.html` wrappers that iframe the corresponding home-dashboard view at `localhost:3100`. When home-dashboard isn't running, a fallback panel explains how to start it. CSP `connect-src` now allows `http://localhost:3100` so the reachability probe isn't blocked.
- Resend SDK returns `{ data, error }` instead of throwing on API rejections, so unverified-domain / invalid-from errors were being logged as "sent". All three email helpers (`notifyNewInquiry`, `sendInviteEmail`, `sendPasswordResetEmail`) now inspect the response and surface the real error, including the error name, message, and `from` address used. Forgot-password route also logs which branch it took (no account, wrong status, dispatched) so prod failures are diagnosable from Render logs.
- Invite flow silently dropped per-user module overrides: frontend sent `modules: []` while backend expected `modulePermissions: {}`, so overrides were never written. Invites now write to `user_permissions` as intended.
- Permissions tab was rendering empty: frontend read `/api/roles/permissions` as a flat array but the endpoint returned `{ matrix, modules, roles }`. Frontend now reads the `matrix` key.
- Accept-invite route crashed the server on boot — `const token = ...` clashed with the destructured `token` from the request body. Renamed the session token.
- Resend SDK now initialises lazily — missing `RESEND_API_KEY` no longer crashes the server on boot; email sends become a no-op with a warning instead.

---

## Template for new entries

```
## [x.y.z] — YYYY-MM-DD

### Added
- New feature or capability.

### Changed
- Modified behavior.

### Fixed
- Bug fixes.

### Removed
- Deprecated features.

### Security
- Security-sensitive changes.
```
