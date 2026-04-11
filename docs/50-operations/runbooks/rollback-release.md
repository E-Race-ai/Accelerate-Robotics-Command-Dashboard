# Runbook: Roll Back a Release

What to do when a deploy breaks production.

## When to use this runbook

- The smoke test after a deploy failed
- You deployed and users are reporting issues you can reproduce
- A monitoring alert (when we have them) fires right after a deploy

Pre-condition: **the problem correlates to a recent deploy**. If it's unrelated, this is a general incident — see [`incident-response.md`](incident-response.md).

## Option A: Revert via Railway (fastest)

Railway keeps prior deployments and can redeploy any of them:

1. Open the Railway dashboard → the service → Deployments
2. Find the last known good deployment (usually the one immediately before the broken one)
3. Click **Redeploy**
4. Wait for it to come up (< 1 min)
5. Smoke test — see [`../../../.claude/commands/smoke-test.md`](../../../.claude/commands/smoke-test.md)

This is the **preferred** rollback path because it bypasses git entirely.

## Option B: Revert via git (if you need the broken code off main)

If the broken commit is still on `main` and you want it removed from history:

```bash
git fetch origin
git checkout main
git pull
git revert <broken-sha> --no-edit
git push origin main
```

Railway will pick up the revert and auto-deploy. This is slower than Option A (full build cycle) but cleaner if you want the broken change out of `main`.

**Never use `git reset --hard` or `git push --force` on `main`.** See [`../../../.claude/rules/git-safety.md`](../../../.claude/rules/git-safety.md).

## After rollback

1. **Verify production is healthy** — run the smoke test again
2. **Tell affected customers** — if a customer noticed, tell them the rollback is done
3. **Understand what broke** — don't just redeploy the same change hoping for different results
4. **Fix the actual bug on a new branch** — merge again with the fix and tests
5. **Write a short incident note** — in `docs/50-operations/incidents/YYYY-MM-DD-short-title.md` (create the folder if missing)

## If the DB is involved

If the broken deploy wrote bad data or ran a bad migration:

1. **Stop writes** — put a maintenance banner if possible, or take the service down briefly
2. **Restore from the most recent backup** — see [`backup-database.md`](backup-database.md)
3. **Investigate** — figure out what data is lost and whether you can recover from Resend emails, logs, or customer reports
4. **Deploy a fix** — separate PR, tested locally first
5. **Validate** — check a sample of records before declaring normal

## Never

- Force-push to `main`
- Skip the smoke test
- Leave a rollback undocumented

## Related

- [`deploy-production.md`](deploy-production.md)
- [`incident-response.md`](incident-response.md)
- [`backup-database.md`](backup-database.md)
