# Runbooks

Step-by-step procedures for things that happen rarely but urgently. Written so a sleepy on-call engineer at 3am can follow them without thinking.

## Index

| Runbook | When to use it |
|---|---|
| [`deploy-production.md`](deploy-production.md) | Shipping a release to prod |
| [`rollback-release.md`](rollback-release.md) | Production release is broken, need to revert |
| [`rotate-secrets.md`](rotate-secrets.md) | JWT secret, admin password, Resend API key rotation |
| [`backup-database.md`](backup-database.md) | Scheduled and ad-hoc SQLite backups |
| [`incident-response.md`](incident-response.md) | Site down, data loss, security incident |

## Writing a new runbook

- **Verb-first filename** — `deploy-production.md`, not `production-deployment.md`
- **Prerequisites upfront** — what access, tools, and state you need before starting
- **Numbered steps** — skippable, resumable, testable
- **Verify after each step** — how do you know it worked?
- **Rollback** — if step N fails, how do you get back?
- **When NOT to use this runbook** — boundary conditions
