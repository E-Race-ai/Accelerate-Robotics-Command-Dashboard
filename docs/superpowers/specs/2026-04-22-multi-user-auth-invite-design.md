# Multi-User Auth & Invite System — Design Spec

## Goal

Transform the single-admin Accelerate Robotics command dashboard into a multi-user platform where the Super Admin invites team members by email, assigns roles, and controls module-level permissions. Deploy to Railway so the team can collaborate at https://acceleraterobotics.ai.

## Roles

| Role | Purpose |
|------|---------|
| **Super Admin** | Eric. Full access to everything including Settings/Users. Cannot be removed or demoted. Hardcoded protection. |
| **Admin** | Trusted team. Full edit access to all modules including Settings/Users. Can invite/manage users. Only difference from Super Admin: can be removed. |
| **Module Owner** | Owns specific modules. Edit+commit on assigned modules, view-only on the rest. Cannot access Settings/Users. |
| **Viewer** | Read-only access to assigned modules. Cannot access Settings/Users. |

## Modules

Each module maps to a section of the dashboard and its backing API routes:

| Module Key | Label | API Routes |
|------------|-------|------------|
| `deals` | Deals | `/api/deals`, `/api/facilities` |
| `prospects` | Prospects | `/api/prospects`, `/api/markets` |
| `assessments` | Assessments | `/api/assessments`, `/api/assessments/:id/photos`, `/api/assessments/:id/pdf` |
| `fleet` | Fleet | (frontend-only: robot catalog, fleet designer) |
| `investors` | Investors | (frontend-only: investor CRM page) |
| `inquiries` | Inquiries | `/api/inquiries`, `/api/recipients` |
| `settings` | Settings/Users | `/api/users`, `/api/users/invite`, `/api/roles` |

## Permission Levels

Each module has three permission levels per role:

- **edit** — full CRUD (create, read, update, delete)
- **view** — read-only access
- **none** — module hidden, API returns 403

## Default Permission Matrix

| Module | Super Admin | Admin | Module Owner | Viewer |
|--------|:-:|:-:|:-:|:-:|
| Deals | edit | edit | *per assignment* | view |
| Prospects | edit | edit | *per assignment* | view |
| Assessments | edit | edit | *per assignment* | view |
| Fleet | edit | edit | *per assignment* | view |
| Investors | edit | edit | *per assignment* | view |
| Inquiries | edit | edit | *per assignment* | view |
| Settings | edit | edit | none | none |

Super Admin and Admin can edit default role permissions from Settings. Module Owner permissions are set per-user when inviting or editing the user.

## Database Schema

### `admin_users` table (modify existing)

```sql
-- Existing columns: id, email, password_hash, created_at, role
-- Add:
ALTER TABLE admin_users ADD COLUMN name TEXT DEFAULT '';
ALTER TABLE admin_users ADD COLUMN invited_by INTEGER REFERENCES admin_users(id);
ALTER TABLE admin_users ADD COLUMN invite_token TEXT;
ALTER TABLE admin_users ADD COLUMN invite_expires_at TEXT;
ALTER TABLE admin_users ADD COLUMN status TEXT DEFAULT 'active' CHECK(status IN ('invited', 'active', 'disabled'));
ALTER TABLE admin_users ADD COLUMN last_login_at TEXT;
```

Update role CHECK constraint:
```sql
-- role CHECK(role IN ('super_admin', 'admin', 'module_owner', 'viewer'))
```

### `role_permissions` table (new)

Stores the default permission matrix per role. Editable by Super Admin and Admin.

```sql
CREATE TABLE IF NOT EXISTS role_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL,
  module TEXT NOT NULL,
  permission TEXT NOT NULL DEFAULT 'none' CHECK(permission IN ('edit', 'view', 'none')),
  UNIQUE(role, module)
);
```

### `user_permissions` table (new)

Per-user overrides — used for Module Owner module assignments and any custom overrides.

```sql
CREATE TABLE IF NOT EXISTS user_permissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
  module TEXT NOT NULL,
  permission TEXT NOT NULL CHECK(permission IN ('edit', 'view', 'none')),
  UNIQUE(user_id, module)
);
```

### Permission Resolution Order

1. If user role is `super_admin` → always `edit` (hardcoded, no table lookup)
2. Check `user_permissions` for a per-user override → use if found
3. Fall back to `role_permissions` for the user's role → use if found
4. Default to `none`

## Invite Flow

### Super Admin / Admin invites a user

1. Go to **Settings > Team** in the dashboard
2. Click **Invite User**
3. Enter: email, name, role
4. If role is `module_owner`: select which modules they own (checkboxes)
5. System creates a row in `admin_users` with `status = 'invited'`, a secure `invite_token` (crypto.randomBytes 32 hex), and `invite_expires_at` (24 hours from now)
6. System sends invite email via Resend with a link: `https://acceleraterobotics.ai/accept-invite?token=<token>`

### Invited user accepts

1. User clicks link in email
2. Accept-invite page validates the token (not expired, not already used)
3. User sets their password
4. System hashes password, clears `invite_token`, sets `status = 'active'`
5. System issues JWT cookie, redirects to `/admin`

### Token expiration

If the invite expires (24 hours), the Super Admin or Admin can resend the invite from the Team page. This generates a new token and resets the timer.

## API Routes

### User Management — `/api/users`

All routes require `requireAuth` + permission check on `settings` module.

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/users` | List all users (id, email, name, role, status, last_login_at) |
| `POST` | `/api/users/invite` | Invite new user (email, name, role, modules[]) |
| `PATCH` | `/api/users/:id` | Update user (role, name, status) |
| `DELETE` | `/api/users/:id` | Remove user (hard delete). Cannot delete super_admin. |
| `POST` | `/api/users/:id/resend-invite` | Resend invite email with fresh token |
| `POST` | `/api/users/:id/disable` | Disable user (revoke access without deleting) |

### Permission Management — `/api/roles`

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/roles/permissions` | Get full permission matrix (all roles x modules) |
| `PATCH` | `/api/roles/permissions` | Update role permissions (body: `{ role, module, permission }`) |
| `GET` | `/api/users/:id/permissions` | Get effective permissions for a user (merged role + overrides) |
| `PATCH` | `/api/users/:id/permissions` | Set per-user module permission overrides |

### Invite Acceptance — `/api/auth` (extend existing)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/auth/validate-invite?token=` | Check if invite token is valid |
| `POST` | `/api/auth/accept-invite` | Accept invite (token, password) → set password, activate, issue JWT |

## Middleware Changes

### `requireAuth` (modify existing)

- Check `status === 'active'` in addition to valid JWT. Disabled users get 401.
- Update `last_login_at` on successful auth (throttled — once per hour to avoid write spam).

### `requirePermission(module, level)` (new)

New middleware factory. Used on API routes:

```js
// Example: only users with 'edit' on 'deals' can create a deal
router.post('/', requireAuth, requirePermission('deals', 'edit'), (req, res) => { ... });

// Example: users with 'view' or 'edit' on 'deals' can list deals
router.get('/', requireAuth, requirePermission('deals', 'view'), (req, res) => { ... });
```

Resolution: looks up effective permission (user override → role default → none). `edit` satisfies a `view` check. `none` returns 403.

### Replace `requireRole`

The existing `requireRole('admin', 'sales')` calls throughout the codebase get replaced with `requirePermission(module, level)`. This is a 1:1 replacement — no behavior changes except it's now module-aware.

## Frontend Changes

### New Pages

| Page | Path | Purpose |
|------|------|---------|
| Accept Invite | `/accept-invite` | Set password after clicking invite link |
| Team Settings | Section in `/admin` Settings tab | Manage users, roles, permissions |

### Accept Invite Page (`public/accept-invite.html`)

- Validates token via `GET /api/auth/validate-invite?token=`
- Shows: "Welcome to Accelerate Robotics" + email (read-only) + password + confirm password
- On submit: `POST /api/auth/accept-invite` → redirect to `/admin`
- On expired token: "This invite has expired. Contact your admin for a new one."

### Team Settings (in admin-command-center.html)

- **User list table**: name, email, role, status, last login, actions (edit, resend, disable, delete)
- **Invite button**: opens modal with email, name, role picker, module checkboxes (shown for module_owner)
- **Role permissions editor**: matrix grid (roles as columns, modules as rows) with dropdown per cell (edit/view/none). Super Admin column is locked.

### Navigation Gating

On dashboard load, fetch the user's effective permissions via `GET /api/auth/me` (extend to return permissions). Hide nav items and toolkit cards for modules the user has `none` permission on.

## Invite Email Template

Subject: **You've been invited to Accelerate Robotics**

```
Hi {name},

{inviter_name} has invited you to join the Accelerate Robotics command dashboard as a {role}.

Click below to set your password and get started:

[Accept Invite] → https://acceleraterobotics.ai/accept-invite?token={token}

This link expires in 24 hours.

— Accelerate Robotics
```

## Security

- Invite tokens are 32-byte crypto random hex strings
- Tokens expire after 24 hours
- Tokens are single-use (cleared on accept)
- Passwords hashed with bcrypt (12 rounds, existing pattern)
- Super Admin account cannot be deleted or demoted via API (hardcoded check)
- Disabled users are rejected at the middleware level even with a valid JWT
- Rate limit on `POST /api/auth/accept-invite`: 5 attempts per IP per hour (reuse existing rate limiter pattern)
- All user management actions require `settings` module `edit` permission

## Seed Data

On first boot, the existing admin seed logic creates Eric as `super_admin` (changed from `admin`). The `role_permissions` table is seeded with the default matrix from this spec.

## Cloud Deployment

Already deployed to Railway at https://acceleraterobotics.ai with:
- Persistent SQLite volume at `/data/accelerate.db`
- Environment variables: JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD, RESEND_API_KEY, NODE_ENV=production
- Production auth enforced (dev bypass only in NODE_ENV !== 'production')
