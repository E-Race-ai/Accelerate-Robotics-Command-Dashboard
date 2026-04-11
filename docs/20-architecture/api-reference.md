# API Reference

All HTTP endpoints the server exposes. Extracted from `src/server.js` and the route files under `src/routes/`. When the code changes, update this file.

## Base URL

- Local dev: `http://localhost:3000`
- Production: `https://accelerate-robotics.up.railway.app` (or whatever the Railway public URL currently is)

## Authentication

- Admin auth is a JWT stored in a `token` cookie with `httpOnly=true`, `sameSite=strict`, `secure` in production
- Tokens expire after 24 hours
- Admin-only routes are marked below; they return `401 { error: "Authentication required" }` when the cookie is missing or invalid
- See [`adr/0003-jwt-in-httponly-cookie.md`](adr/0003-jwt-in-httponly-cookie.md)

## Rate limiting

- `POST /api/inquiries` — **5 requests per IP per hour** (see `src/server.js`)
- All other endpoints are currently unthrottled — revisit when public surface grows

---

## `POST /api/auth/login`

Log in an admin user. Sets the `token` cookie on success.

**Request body:**
```json
{ "email": "admin@example.com", "password": "..." }
```

**Responses:**
- `200 { "email": "admin@example.com" }` — login successful, cookie set
- `400 { "error": "Email and password are required" }` — missing field
- `401 { "error": "Invalid credentials" }` — wrong email or password

## `POST /api/auth/logout`

Clear the `token` cookie. No auth required (logging out of an expired session should still work).

- `200 { "ok": true }`

## `GET /api/auth/me` *(admin)*

Returns the currently authenticated admin.

- `200 { "email": "admin@example.com" }`
- `401` — not authenticated

---

## `POST /api/inquiries` *(public, rate-limited)*

Public contact form submission. Triggers an email notification to all active recipients.

**Request body:**
```json
{
  "name": "Jane Doe",
  "email": "jane@example.com",
  "company": "Acme Hotels",       // optional
  "phone": "+1-305-555-0100",      // optional
  "message": "Interested in a pilot…"
}
```

**Validation:**
- `name`, `email`, `message` required
- `email` must match basic regex (`[^\s@]+@[^\s@]+\.[^\s@]+`)
- `message` max length 5000 chars

**Responses:**
- `201 { "id": 42, "message": "Inquiry submitted successfully" }`
- `400` — missing field, invalid email, or message too long
- `429` — rate limit exceeded (5/hour/IP)
- `500` — DB insert error

**Side effects:** fires `notifyNewInquiry()` — fire-and-forget, does not block response.

## `GET /api/inquiries` *(admin)*

List inquiries, newest first.

- Query param `?status=new|reviewed|contacted|archived` filters by status
- `200 [ {...}, {...} ]`

## `GET /api/inquiries/:id` *(admin)*

Get a single inquiry.

- `200 { ... }`
- `404 { "error": "Inquiry not found" }`

## `PATCH /api/inquiries/:id` *(admin)*

Update inquiry status. Sets `reviewed_at` to `datetime('now')`.

**Request body:**
```json
{ "status": "reviewed" }
```

- `status` must be one of: `new`, `reviewed`, `contacted`, `archived`
- `200 { "ok": true }`
- `400` — invalid or missing status
- `404` — not found

---

## `GET /api/recipients` *(admin)*

List notification recipients (people who get emailed on new inquiries).

- `200 [ {...}, {...} ]`

## `POST /api/recipients` *(admin)*

Add a new notification recipient.

```json
{ "email": "ops@example.com", "name": "Ops Team" }
```

- `201 { "id": 7, "email": "...", "name": "...", "active": 1 }`
- `400` — missing or invalid email
- `409` — email already exists (UNIQUE constraint)

## `PATCH /api/recipients/:id` *(admin)*

Update any of `email`, `name`, `active`.

- `200 { "ok": true }`
- `400` — invalid email or no fields to update
- `404` — not found

## `DELETE /api/recipients/:id` *(admin)*

Remove a recipient.

- `200 { "ok": true }`
- `404` — not found

---

## `GET /api/stocks` *(public)*

Cached public-market + private-round data for the homepage finance widget. Cache TTL: 15 minutes.

**Response:**
```json
{
  "public": [
    { "type": "stock", "symbol": "TSLA", "name": "Tesla", "role": "Optimus Humanoid",
      "price": 123.45, "change": 1.23, "changePercent": 1.01, "marketCap": 900000000000, "currency": "USD" }
  ],
  "private": [
    { "type": "private", "name": "Figure AI", "round": "Series B", "amount": 675000000, "valuation": 2600000000 }
  ],
  "totals": {
    "publicMarketCap": 1234567890000,
    "privateFunding": 1395000000,
    "combined": 1235962890000
  },
  "updatedAt": "2026-04-10T15:00:00.000Z"
}
```

**Tickers:** TSLA, NVDA, GOOGL, TM, SERV, ISRG
**Private rounds tracked:** Figure AI, 1X Technologies, Bedrock Robotics, Keenon Robotics, Pudu Robotics

On upstream failure, returns the last cached payload if available; `500` if no cache exists.

---

## Static routes

These serve HTML files directly:

| Path | File |
|---|---|
| `GET /admin` | `public/admin.html` |
| `GET /admin-login` | `public/admin-login.html` |
| `GET /*` (any other path matching a file) | `public/<path>` |

## Related

- [`database-schema.md`](database-schema.md) — tables backing these endpoints
- [`security-model.md`](security-model.md) — auth, CSP, rate limiting
- [`../../.claude/rules/security.md`](../../.claude/rules/security.md) — security rules
