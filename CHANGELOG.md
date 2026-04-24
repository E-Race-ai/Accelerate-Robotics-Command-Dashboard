# Changelog

Notable changes to Accelerate Robotics. Keep entries short and user-facing — link to PRs/commits for detail.

Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Structured `docs/` knowledge base covering strategy, architecture, integrations, deployments, and operations.
- `.claude/` configuration: rules, skill stubs, agent definitions, commands.
- Initial ADRs documenting SQLite, no-frontend-build-step, JWT-in-httponly-cookie, Miami anchor, button-emulator vs OEM API.
- `CONTRIBUTING.md`, `CHANGELOG.md`, top-level `README.md`.
- Settings page: Super Admin can now set per-module permissions (Edit/View/None on each of the 15 toolkit modules) when inviting a user, with the role's defaults pre-seeded. Per-user overrides can be edited later from a new Edit User modal.
- `POST /api/users/:id/resend-invite` regenerates the invite token and re-sends the email. The Resend button on the Team list no longer 404s.
- `PATCH /api/roles/permissions` — point-edit a single cell of the role × module matrix (frontend uses this from the Permissions tab).
- Command Center toolkit tiles are gated by the logged-in user's permissions: tiles with `permission=none` are hidden on load.
- Forgot-password flow: `/forgot-password` page emails a single-use, 1-hour reset link via `POST /api/auth/forgot-password`. `/reset-password?token=...` validates the token and lets the user set a new password (`POST /api/auth/reset-password`). "Forgot password?" link added to the login page. No enumeration — endpoint returns `{ok:true}` whether the email exists or not. Rate-limited to 5 requests per IP per hour.

### Changed
- `CLAUDE.md` restructured to reference `.claude/rules/` and `docs/` instead of duplicating guidance.
- Invite API (`POST /api/users/invite`) now accepts `modulePermissions: { module: 'edit'|'view'|'none' }` for any role, not just `module_owner`. The legacy `modules: []` (edit-only) shape is still accepted for back-compat.
- Test helper `admin_users` schema now matches production (role CHECK includes `super_admin`, `module_owner`; status/invite columns present) so invite flows can be integration-tested.

### Fixed
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
