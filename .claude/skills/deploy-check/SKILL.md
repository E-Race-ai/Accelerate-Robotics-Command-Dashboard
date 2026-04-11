---
name: deploy-check
description: Pre-flight validation checklist before deploying Accelerate Robotics to production
---

# /deploy-check — Pre-flight before a production deploy

## When to use

User is about to deploy and wants to make sure nothing is broken, missing, or misconfigured.

## Checklist

Run these in order. Stop at the first failure.

### 1. Git state

```bash
git status                        # working tree clean?
git log origin/main..HEAD          # what's being deployed?
git diff origin/main..HEAD --stat  # which files changed?
```

- [ ] Working tree is clean
- [ ] Branch is ahead of `origin/main` only by commits that should deploy
- [ ] No unexpected files in the diff

### 2. Secrets

- [ ] Production `.env` has a real `JWT_SECRET` (not `dev-secret-change-me`)
- [ ] Production `ADMIN_PASSWORD` has been rotated from `.env.example` default
- [ ] `RESEND_API_KEY` is valid and not expired
- [ ] `EMAIL_FROM` domain is verified in Resend

### 3. Tests

```bash
npm test
```

- [ ] All tests pass
- [ ] No new warnings or deprecation notices
- [ ] Integration tests against real SQLite all pass

### 4. Schema

- [ ] If this deploy changes `src/db/database.js`, back up the production DB first (see `docs/50-operations/runbooks/backup-database.md`)
- [ ] New columns/tables follow `.claude/rules/database-migrations.md`
- [ ] `docs/20-architecture/database-schema.md` is updated

### 5. Content Security Policy

- [ ] Any new external origins added are in `src/server.js` CSP config
- [ ] Open the deployed site in a browser with dev tools → no CSP violations in the console

### 6. Docs

- [ ] `CHANGELOG.md` has an `[Unreleased]` entry for this deploy
- [ ] `docs/20-architecture/api-reference.md` reflects any API changes
- [ ] Any new env vars are in `.env.example`

### 7. Smoke test (after deploy)

- [ ] Home page loads
- [ ] Admin login works
- [ ] Submit an inquiry through the public form
- [ ] Check the admin dashboard shows the new inquiry
- [ ] Check the notification email was received
- [ ] Stock quotes are loading on the landing page

### 8. Rollback readiness

- [ ] Know the previous commit SHA
- [ ] Know the rollback procedure (see `docs/50-operations/runbooks/rollback-release.md`)

## If any step fails

Stop the deploy. Fix the issue. Start the checklist over from step 1.
