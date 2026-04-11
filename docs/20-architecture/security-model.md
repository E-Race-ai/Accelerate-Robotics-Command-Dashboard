# Security Model

How Accelerate Robotics handles authentication, authorization, input validation, and attack surface. For rules that bind day-to-day code changes, see [`../../.claude/rules/security.md`](../../.claude/rules/security.md).

## Threat model (what we're defending against)

1. **Spam + abuse of the public inquiry form** — bots flooding `/api/inquiries` to burn our email quota or fill the DB
2. **Credential theft on admin accounts** — stolen JWTs, phished passwords
3. **XSS in email notifications** — someone submits `<script>` in the message, and we email it to admins
4. **CSP / mixed content issues** — third-party scripts loaded without vetting
5. **Secret leakage** — `.env` file committed, JWT secret reused across environments
6. **Unauthorized data access** — reading or modifying inquiries without being an admin

We are **not** currently defending against:
- Nation-state attackers
- Sophisticated supply-chain compromise of npm packages (beyond `npm audit`)
- Denial-of-service floods (Railway edge handles some; we haven't tuned)
- Insider threats (we're a 1-person team)

Revisit these exclusions as the team and surface grow.

## Authentication

### Admin login

- User POSTs `email` + `password` to `/api/auth/login`
- Server looks up `admin_users` by email
- Password compared with `bcrypt.compare()` — 12 rounds, ~250ms latency on modern hardware
- On success, server issues a JWT signed with `JWT_SECRET`, 24-hour expiry, and sets it as an `httpOnly` cookie
- Cookie flags: `httpOnly: true`, `sameSite: 'strict'`, `secure: true` in production

### JWT verification

Every admin route calls `requireAuth` middleware (`src/middleware/auth.js`):

1. Read `token` cookie
2. Verify signature + expiry with `jwt.verify`
3. Attach `{ id, email }` to `req.admin`
4. On any failure, return `401 { error: "..." }`

### Why not localStorage / Authorization headers?

- httpOnly cookies can't be read by JavaScript → no XSS token theft
- `sameSite: strict` → no CSRF needed for our use case
- See [`adr/0003-jwt-in-httponly-cookie.md`](adr/0003-jwt-in-httponly-cookie.md)

## Authorization

Two levels:

- **Public:** no auth required. Only `POST /api/inquiries` (rate-limited) and `GET /api/stocks` (cached).
- **Admin:** any authenticated admin user. We do not have roles within admin — every admin can read/write every inquiry and every recipient.

Adding roles would require an `admin_users.role` column and updated middleware. Not needed today.

## Input validation

Every route handler validates its inputs before touching the database. Patterns in use:

| Input type | Check |
|---|---|
| Required fields | Missing → 400 with a clear message |
| Email format | Regex `/^[^\s@]+@[^\s@]+\.[^\s@]+$/` |
| Length limits | Explicit max (e.g., `MAX_MESSAGE_LENGTH = 5000`) |
| Enum values | Whitelist (e.g., `VALID_STATUSES` in `inquiries.js`) |
| Numeric flags | Coerced to `0`/`1` (e.g., `active` in `recipients.js`) |

Never silently coerce bad input. Bad input → 400.

## Output sanitization

- **Email HTML bodies** pass every user-supplied value through `escapeHtml()` in `src/services/email.js`. If you add a new template variable, escape it there.
- **JSON API responses** are safe by default — `res.json()` serializes everything as data, not HTML.
- **Admin dashboard** renders inquiry content in the DOM. Today the admin UI uses `textContent`, not `innerHTML`, so it's safe. If this changes, review carefully.

## Rate limiting

- `POST /api/inquiries` is limited to **5 submissions per IP per hour** (`src/server.js`)
- Other public endpoints are unthrottled
- `trust proxy = 1` is set so Railway's reverse-proxy passes real client IPs through — otherwise we'd rate-limit the proxy instead of callers

## Content Security Policy

Helmet's CSP is configured in `src/server.js`:

| Directive | Sources | Why |
|---|---|---|
| `default-src` | `'self'` | Lock down by default |
| `script-src` | `'self'`, `'unsafe-inline'`, `cdn.tailwindcss.com` | Tailwind CDN (see ADR 0002) |
| `style-src` | `'self'`, `'unsafe-inline'`, `fonts.googleapis.com` | Google Fonts |
| `font-src` | `'self'`, `fonts.gstatic.com` | Google Fonts |
| `img-src` | `'self'`, `data:`, `img.youtube.com` | YouTube thumbnails |
| `connect-src` | `'self'` | XHR only back to ourselves |
| `frame-src` | `'self'`, `youtube.com`, `youtube-nocookie.com` | YouTube embeds + same-origin iframes |

Before adding any new external script, font, image, or iframe:

1. Decide if self-hosting is feasible
2. Add the origin with a `// WHY:` comment in the CSP
3. Test in devtools for violations

## Secrets management

- `.env` is in `.gitignore` — never committed
- Required env vars: `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `DB_PATH`, `RESEND_API_KEY`, `EMAIL_FROM`
- `JWT_SECRET` falls back to `'dev-secret-change-me'` — **fine for dev, catastrophic in prod**. Railway config must set the real value.
- Rotation procedure: [`../50-operations/runbooks/rotate-secrets.md`](../50-operations/runbooks/rotate-secrets.md)

## Dependency supply chain

- `npm ci` in production (not `npm install`) — locks to package-lock
- `npm audit` run periodically (add to CI when CI exists)
- Dependabot or equivalent: not yet enabled — track in [`../60-roadmap/open-questions.md`](../60-roadmap/open-questions.md)

## Known gaps

Track these in the roadmap:

- No CI-enforced lint, type-check, or audit
- No automated secret scanning on commits
- No structured audit log beyond `created_at` / `reviewed_at`
- No 2FA on admin login
- No per-route request logging beyond what Railway captures

## Related

- [`../../.claude/rules/security.md`](../../.claude/rules/security.md) — binding security rules
- [`api-reference.md`](api-reference.md) — endpoint inventory
- [`adr/0003-jwt-in-httponly-cookie.md`](adr/0003-jwt-in-httponly-cookie.md) — auth decision record
- [`../50-operations/runbooks/rotate-secrets.md`](../50-operations/runbooks/rotate-secrets.md) — secret rotation
