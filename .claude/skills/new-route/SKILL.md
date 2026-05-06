---
name: new-route
description: Scaffold a new Express API route with validation, auth middleware, test, and server.js registration
---

# /new-route — Scaffold an API route

## When to use

User says something like "add a `/api/<thing>` endpoint" or "I need a new route for X."

## Inputs to gather

- **Route path** — e.g., `/api/reports`
- **HTTP methods** — GET, POST, PATCH, DELETE
- **Auth** — public, admin-required, or rate-limited public
- **Data shape** — what the request/response looks like
- **Database involvement** — does this read/write tables?

If the user hasn't specified, ask before scaffolding.

## Steps

1. **Read existing routes** — `src/routes/inquiries.js` is the canonical example for a route that handles both public and admin methods with validation and rate limiting.

2. **Create the route file** at `src/routes/<name>.js`:
   - `const express = require('express')` + router
   - Import `db` from `../db/database` if needed
   - Import `requireAuth` from `../middleware/auth` for admin routes
   - Each handler validates inputs, returns 400 for bad input, 401 for auth, 404 for missing, 500 for unexpected

3. **Register in `src/server.js`**:
   ```js
   const reportRoutes = require('./routes/reports');
   app.use('/api/reports', reportRoutes);
   ```
   Place near the other `app.use('/api/...')` calls.

4. **If rate-limited**, wrap the public verbs only — see how `inquiries` handles POST-only rate limiting.

5. **If the route writes to the DB** and needs a new table, update `src/db/database.js` and [`docs/20-architecture/database-schema.md`](../../../docs/20-architecture/database-schema.md). Follow `.claude/rules/database-migrations.md`.

6. **Write tests** in `tests/integration/<name>.test.js`:
   - Happy path for each method
   - 400 for missing/invalid input
   - 401 for missing auth (if applicable)
   - 404 for not-found
   - Edge cases specific to the route

7. **Run tests** — they must pass before committing.

8. **Update docs** — add the new endpoint to [`docs/20-architecture/api-reference.md`](../../../docs/20-architecture/api-reference.md).

9. **Wiring verification** — follow `.claude/rules/wiring-verification.md`. Actually hit the endpoint with `curl` or the browser, not just "it compiles."

## Common pitfalls

- Forgetting to mount the route in `server.js` — the file exists but is unreachable
- Adding a route under `/api/...` that's not rate-limited even though it's public-facing
- Returning different response shapes for the same endpoint depending on auth — break the contract
- Adding raw HTML to email bodies without `escapeHtml()`
