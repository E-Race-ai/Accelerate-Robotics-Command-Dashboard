# Environments

Where the app runs, how they differ, and what's configured where.

## Overview

| Environment | Purpose | Host | Domain |
|---|---|---|---|
| **Local dev** | Day-to-day development | Your laptop | `http://localhost:3000` |
| **Production** | The live site | Railway | TBD (Railway-generated or custom domain) |

No staging environment yet. Every change that lands on `main` is deployed to production — see [`runbooks/deploy-production.md`](runbooks/deploy-production.md).

## Local dev

- Node.js 18+
- SQLite file lives at `./data/accelerate.db` (gitignored)
- `NODE_ENV=development`
- `JWT_SECRET` falls back to `'dev-secret-change-me'` if missing from `.env`
- Cookies are **not** `secure` (works over `http://`)
- Email can be disabled by leaving `RESEND_API_KEY` empty — `notifyNewInquiry` will log and swallow the error

See [`../00-overview/getting-started.md`](../00-overview/getting-started.md) for the full local setup.

## Production

- Railway-managed Node service
- Persistent volume mounted at `/app/data` for the SQLite file
- `NODE_ENV=production`
- `JWT_SECRET` set via Railway secrets — **never** the dev fallback
- `secure: true` cookies, HTTPS enforced by Railway edge
- `trust proxy = 1` so rate limiter sees real client IPs
- Auto-deploy on merge to `main` (when the Railway integration is enabled)
- Logs visible in Railway dashboard; no structured logging yet

### Required production secrets

| Secret | Source | Rotation |
|---|---|---|
| `JWT_SECRET` | `openssl rand -hex 32` | On suspected compromise, see [`runbooks/rotate-secrets.md`](runbooks/rotate-secrets.md) |
| `ADMIN_EMAIL` | Chosen once | Rarely — requires DB update |
| `ADMIN_PASSWORD` | Chosen once | Rotate via admin UI once live |
| `RESEND_API_KEY` | Resend dashboard | Quarterly or on compromise |
| `EMAIL_FROM` | Owned domain | Change when domain changes |
| `DB_PATH` | `/app/data/accelerate.db` | Never change without migration plan |
| `PORT` | Railway-injected | Never set manually |

## Differences that matter

| Thing | Local | Production |
|---|---|---|
| `NODE_ENV` | `development` | `production` |
| Cookie `secure` | `false` | `true` |
| JWT secret | Dev fallback OK | Must be real random |
| DB file | `./data/accelerate.db` | `/app/data/accelerate.db` on persistent volume |
| Email | Optional | Required (Resend) |
| Proxy | None | Railway edge (`trust proxy = 1`) |
| Logs | stdout to terminal | Railway log stream |

## Deploy target

Railway. One service, no multi-region. See [`runbooks/deploy-production.md`](runbooks/deploy-production.md).

When we outgrow single-region, things to consider:
- LiteFS or Turso for SQLite replication
- CDN in front of `public/`
- Per-region Railway services

## Backups

- SQLite file is the only stateful thing
- Backup via Railway volume snapshot + manual `cp` into an off-Railway location
- See [`runbooks/backup-database.md`](runbooks/backup-database.md)

## Related

- [`runbooks/deploy-production.md`](runbooks/deploy-production.md)
- [`runbooks/rollback-release.md`](runbooks/rollback-release.md)
- [`runbooks/rotate-secrets.md`](runbooks/rotate-secrets.md)
- [`runbooks/backup-database.md`](runbooks/backup-database.md)
