# Runbook: Deploy to Production

How to push a change from `main` to the live site.

## When to use this runbook

- A PR has merged to `main`
- You need to ship a hotfix
- You're doing a scheduled release

## Prerequisites

- Railway CLI installed (`npm i -g @railway/cli`) OR access to the Railway dashboard
- You're authorized on the Accelerate Robotics Railway project
- Local `main` is up to date: `git fetch origin && git checkout main && git pull`

## Standard deploy (via git)

If Railway's GitHub integration is enabled (recommended):

1. Merge the PR to `main` (squash merge, `--auto` — see [`../../../.claude/rules/git-safety.md`](../../../.claude/rules/git-safety.md))
2. Railway detects the push and starts a build automatically
3. Watch the build in the Railway dashboard
4. After ~1–2 minutes, the new version is live
5. Smoke test (see below)

## Manual deploy (CLI)

If GitHub integration is unavailable:

```bash
cd /Users/ericrace/Code/accelerate-robotics
git checkout main && git pull
railway up
```

Wait for `deployment succeeded`. Smoke test.

## Smoke test after deploy

Run the checks in [`../../../.claude/commands/smoke-test.md`](../../../.claude/commands/smoke-test.md) against production:

1. `curl https://<prod-url>/` — 200 with HTML
2. `curl https://<prod-url>/api/stocks` — 200 with JSON
3. Navigate to `/admin-login`, log in, see the dashboard
4. Submit a test inquiry from `/`, check admin sees it, check email arrived

If any step fails, **roll back immediately** — see [`rollback-release.md`](rollback-release.md).

## Environment variables

Never deploy a change that requires new env vars without first setting them in Railway:

1. Railway dashboard → the service → Variables
2. Add each new var with its production value
3. Update `.env.example` in the repo
4. Update [`../../00-overview/getting-started.md`](../../00-overview/getting-started.md) and [`../environments.md`](../environments.md)
5. Then deploy

## Database changes

If the change includes a schema update:

- Confirm the `CREATE TABLE IF NOT EXISTS` block covers new tables (they're created on boot)
- For column additions, manually run the `ALTER TABLE` on the production DB **before** deploy — see [`../../../.claude/rules/database-migrations.md`](../../../.claude/rules/database-migrations.md)
- **Always back up the DB before a schema change** — see [`backup-database.md`](backup-database.md)

## After a successful deploy

1. Update `CHANGELOG.md` if a user-visible change shipped
2. Close the PR link in the commit message
3. Update [`../../60-roadmap/current-quarter.md`](../../60-roadmap/current-quarter.md) if this was a tracked item

## Related

- [`rollback-release.md`](rollback-release.md)
- [`backup-database.md`](backup-database.md)
- [`rotate-secrets.md`](rotate-secrets.md)
- [`../environments.md`](../environments.md)
