---
name: smoke-test
description: Run a quick smoke test against the running dev server
---

# /smoke-test

Hits the running dev server and verifies the essential paths work.

## What it does

```bash
# 1. Server is up
curl -sf http://localhost:3000/ > /dev/null && echo "[OK] Home page loads" || echo "[FAIL] Home page"

# 2. Admin login exists
curl -sf http://localhost:3000/admin-login > /dev/null && echo "[OK] Admin login page loads" || echo "[FAIL] Admin login page"

# 3. Stocks API responds
curl -sf http://localhost:3000/api/stocks | jq '.updatedAt' && echo "[OK] Stocks API" || echo "[FAIL] Stocks API"

# 4. Unauthenticated admin call is rejected
curl -sf -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/inquiries | grep -q 401 && echo "[OK] Auth enforced" || echo "[FAIL] Auth NOT enforced"

# 5. Public inquiry POST works
curl -sf -X POST http://localhost:3000/api/inquiries \
  -H "Content-Type: application/json" \
  -d '{"name":"Smoke Test","email":"smoke@test.local","message":"ping"}' \
  && echo "[OK] Inquiry POST" || echo "[FAIL] Inquiry POST"
```

## When to use

- After `npm run dev` starts up
- Before opening a PR
- After pulling changes on a teammate's branch

## Prerequisites

- Dev server running (`npm run dev`)
- `jq` installed for the stocks check
