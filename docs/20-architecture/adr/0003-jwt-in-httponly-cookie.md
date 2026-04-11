# ADR 0003 — JWT in an httpOnly cookie for admin auth

- **Status:** Accepted
- **Date:** 2025-12-21
- **Deciders:** Eric

## Context

We need admin auth for the `/admin` dashboard. Requirements:

- Survive page reloads
- Not readable by JavaScript (XSS-resistant)
- Not vulnerable to CSRF in normal web-app flows
- Simple enough to implement and maintain with one developer

## Options considered

### Option A: JWT in httpOnly cookie

- **Pros:**
  - Not readable by JS → immune to token theft via XSS
  - `sameSite: 'strict'` → CSRF protection without tokens
  - `secure: true` in production → only sent over HTTPS
  - Server-side verification is stateless (no session store)
  - Cookie is automatically sent with every request to our domain
- **Cons:**
  - Token invalidation requires either short expiry or a blocklist (we chose short expiry — 24h)
  - Subtle to debug if flags are misconfigured
  - Single-domain — won't work cross-origin without CORS work

### Option B: JWT in localStorage

- **Pros:**
  - Easy to attach as `Authorization: Bearer ...`
  - Works cross-origin trivially
- **Cons:**
  - **Readable by any JavaScript**, including XSS payloads and compromised dependencies → token theft is trivial
  - Disqualifying on its own

### Option C: Server-side session in Postgres/SQLite

- **Pros:**
  - Easy invalidation (delete the row)
  - Can store arbitrary session data
- **Cons:**
  - Requires a session table, a session store, a cleanup job
  - More moving parts than we need for a 1-admin system
  - Stateful, complicates scaling (not an issue today)

### Option D: OAuth / SSO (Google, GitHub)

- **Pros:**
  - No password management
  - Better user experience
- **Cons:**
  - Overkill for one admin user
  - External dependency on identity provider
  - More setup than the whole rest of the auth system

## Decision

**JWT in an httpOnly cookie** with these flags:

```js
res.cookie('token', token, {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict',
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
});
```

Signed with `JWT_SECRET`, verified on every admin request by `requireAuth` middleware.

## Consequences

- **Positive:**
  - XSS can't steal the token
  - CSRF protection is free via `sameSite: 'strict'`
  - No session store, no cleanup job
  - Stateless — horizontal scaling trivial (when we get there)
- **Negative:**
  - No mid-session invalidation — if a token is compromised, it's valid for up to 24h (mitigated by the cookie being unreachable from JS)
  - Cross-origin admin (e.g., a separate admin SPA on a different domain) would need CORS + credentials work
- **Neutral:**
  - `JWT_SECRET` rotation invalidates all existing sessions — fine for our use

## Follow-ups

- Consider adding a server-side blocklist for stolen tokens if we ever have more than one admin
- Consider 2FA for admin login (see open questions)
- Rotate `JWT_SECRET` on any suspected compromise — see [`../../50-operations/runbooks/rotate-secrets.md`](../../50-operations/runbooks/rotate-secrets.md)

## References

- `src/middleware/auth.js`
- `src/routes/auth.js`
- [`../security-model.md`](../security-model.md)
- [`../../.claude/rules/security.md`](../../.claude/rules/security.md)
