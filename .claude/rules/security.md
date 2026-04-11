# Security Rules

Accelerate Robotics-specific security standards. For general code security, see [`code-quality.md`](code-quality.md).

## Authentication

- Admin auth is JWT-in-httpOnly-cookie (see [`docs/20-architecture/adr/0003-jwt-in-httponly-cookie.md`](../../docs/20-architecture/adr/0003-jwt-in-httponly-cookie.md))
- Token lifetime: **24 hours** (`TOKEN_MAX_AGE_MS` in `src/routes/auth.js`)
- Cookie flags: `httpOnly: true`, `sameSite: 'strict'`, `secure: true` in production
- Passwords: bcrypt with 12 rounds (`BCRYPT_ROUNDS` in `src/db/database.js`)
- All admin-only routes must call `requireAuth` middleware from `src/middleware/auth.js`

## Secrets

- **Never commit `.env`** — it's gitignored, keep it that way
- `JWT_SECRET` must be a cryptographically random 64-char hex string (not "dev-secret-change-me" in prod)
- `RESEND_API_KEY`, `ADMIN_PASSWORD`, `JWT_SECRET` live only in `.env` locally and in the production secret manager
- Rotating any of these follows [`docs/50-operations/runbooks/rotate-secrets.md`](../../docs/50-operations/runbooks/rotate-secrets.md)

## Input validation

Every route handler validates its inputs:

- **Required fields** → 400 with a clear error message
- **Email format** → regex check (see `src/routes/inquiries.js`)
- **Length limits** → explicit max (see `MAX_MESSAGE_LENGTH = 5000`)
- **Enums** → whitelist check (see inquiry `status`)

When in doubt, return 400 with a message. Never silently coerce bad input.

## Rate limiting

The public `POST /api/inquiries` is rate-limited to **5 submissions per IP per hour** (see `src/server.js`). Add the same treatment to any new public endpoint that creates or modifies state.

## Content Security Policy

CSP is configured in `src/server.js` via Helmet. Before adding any new external script, font, image, or iframe source:

1. Decide if it's actually necessary (can we self-host it?)
2. Add the origin to the appropriate CSP directive with a `// WHY:` comment
3. Test in the browser dev console for CSP violations

## Cross-site scripting

Any HTML built from user input must be escaped. See `escapeHtml()` in `src/services/email.js`. Use a library if this gets more complex.

## Trust boundaries

The code trusts:
- Environment variables
- Its own SQLite database
- Resend API responses (with defensive error handling)

The code does NOT trust:
- Inbound HTTP request bodies (always validate)
- Inbound cookies (always verify via `jwt.verify`)
- User-supplied email content (always escape before rendering)
- `process.env.NODE_ENV` without defaults (all env reads have fallbacks)

## Audit logging

Admin state changes (inquiry status updates, recipient changes) should leave a trail. Today we rely on SQLite `created_at` / `reviewed_at` columns — expand this if audit requirements grow.
