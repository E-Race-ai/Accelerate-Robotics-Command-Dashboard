# Wiring Verification

After implementing any functionality, verify that a user can actually reach and use it. Code that exists but cannot be accessed is dead code.

## Checklist

### Backend
- [ ] New endpoints are registered in the router
- [ ] Route is mounted in `src/server.js` under the correct prefix
- [ ] Auth middleware applies where it should (`requireAuth`)
- [ ] Rate limiting applies where it should (public POSTs especially)
- [ ] New database tables/columns are in `src/db/database.js` schema
- [ ] CSP in `src/server.js` allows any new external origins

### Frontend
- [ ] New pages have a route mapping or static file in `public/`
- [ ] New pages are reachable from navigation or explicit links
- [ ] New components are imported and rendered
- [ ] New backend endpoints have corresponding client-side fetch calls
- [ ] Loading and error states are handled
- [ ] Admin-only pages call `checkAuth()` (`js/admin-auth.js`) on load

### Cross-Cutting
- [ ] New functions/components are exported AND imported by consumers
- [ ] Frontend field names match backend JSON shapes
- [ ] New environment variables added to `.env.example`
- [ ] New environment variables documented in `docs/00-overview/getting-started.md`

## Quick Verification

1. **Trace the user path**: Start from the UI entry point and follow the chain to the backend and back
2. **Check imports**: Search for imports of your new file/function/component — if nothing imports it, it's unwired
3. **Test it live**: Actually navigate to the feature in a browser. Can you reach it? Does it do the thing?
