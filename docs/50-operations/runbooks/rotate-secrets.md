# Runbook: Rotate Secrets

How to rotate `JWT_SECRET`, `ADMIN_PASSWORD`, `RESEND_API_KEY`, and other sensitive env vars.

## When to use this runbook

- Suspected or confirmed secret compromise
- Quarterly scheduled rotation (recommended)
- Departing team member who had access
- Any time a secret has been written somewhere unexpected

## General flow

1. Generate the new value
2. Set it in Railway (and your local `.env` if applicable)
3. Restart the service
4. Verify the new value is in effect
5. Invalidate the old value (if the provider supports it)
6. Document the rotation

## `JWT_SECRET`

Rotating `JWT_SECRET` invalidates every active admin session — every admin will be logged out.

1. Generate a new secret:
   ```bash
   openssl rand -hex 32
   ```
2. Railway dashboard → service → Variables → update `JWT_SECRET`
3. Restart the service (Railway does this automatically on var change)
4. Log in at `/admin-login` — you should be forced through a fresh login
5. Smoke test
6. Update your local `.env` if you want matching behavior

## `ADMIN_PASSWORD`

Two ways, depending on whether the seeded admin is still in the DB:

### If the admin row is untouched

The seed only runs if no admin exists — changing `ADMIN_PASSWORD` in Railway does **not** update the stored bcrypt hash. You must either:

**A) Use the admin UI to change the password** (preferred, once that UI exists — see roadmap)

**B) Run a one-shot update via a Node REPL** (until UI exists):

```bash
railway run node -e "
  const bcrypt = require('bcrypt');
  const db = require('./src/db/database');
  const newHash = bcrypt.hashSync(process.env.NEW_PASSWORD, 12);
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE email = ?').run(newHash, process.env.ADMIN_EMAIL);
  console.log('admin password rotated');
"
```

Set `NEW_PASSWORD` as a temporary env var, run the command, then remove the env var.

### If you want to re-seed from scratch

1. Back up the DB first (`backup-database.md`)
2. `DELETE FROM admin_users WHERE email = '<email>'`
3. Update `ADMIN_PASSWORD` in Railway
4. Restart — seed will recreate the admin

## `RESEND_API_KEY`

1. Resend dashboard → API Keys → create a new key
2. Railway → Variables → update `RESEND_API_KEY`
3. Restart the service
4. Submit a test inquiry from `/` and verify email arrives
5. Resend dashboard → revoke the old key

## Other secrets

Same pattern for any future secret: generate, set, restart, verify, revoke, document.

## Never

- **Never commit a secret to git.** If you accidentally do, rotate immediately and scrub history (or accept it's now leaked)
- **Never share secrets over Slack, email, or chat.** Use the Railway dashboard or a secure sharing tool
- **Never reuse secrets across environments.** Local and production must use different values

## Document every rotation

Append to `docs/50-operations/incidents/secret-rotations.md` (create the file on first rotation):

```markdown
## YYYY-MM-DD — JWT_SECRET rotation

- Reason: suspected compromise / scheduled / offboarding
- Rotated by: <name>
- Downtime: <duration or "none">
- Followup: <anything to watch>
```

## Related

- [`../../../.claude/rules/security.md`](../../../.claude/rules/security.md)
- [`../../20-architecture/security-model.md`](../../20-architecture/security-model.md)
- [`backup-database.md`](backup-database.md)
