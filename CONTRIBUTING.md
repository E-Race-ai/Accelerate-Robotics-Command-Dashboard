# Contributing

Thanks for working on Accelerate Robotics. This guide covers the mechanics — branching, committing, reviewing, and shipping.

For non-negotiable rules (code quality, security, testing), see [`.claude/rules/`](.claude/rules/). For domain knowledge, see [`docs/`](docs/README.md).

---

## Local setup

```bash
cp .env.example .env
# Generate a JWT secret:
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
# Paste into .env as JWT_SECRET

npm install
npm run dev
```

Server runs at <http://localhost:3000>. Changes to `src/` auto-restart via `node --watch`.

First run creates `data/accelerate.db` and seeds an admin user from `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

---

## Branching

Every change happens on a branch. Never commit to `main`.

```bash
git fetch origin
git checkout main && git pull --ff-only
git checkout -b <type>/<short-description>
```

**Branch types:** `feat/`, `fix/`, `refactor/`, `docs/`, `test/`, `chore/`

Examples: `feat/admin-filter-by-date`, `fix/email-xss-escape`, `docs/elevator-button-emulator`.

See [`.claude/rules/git-safety.md`](.claude/rules/git-safety.md) for the full git workflow, including squash-merge safety when two PRs touch the same files.

---

## Commit messages

Follow the template from `.claude/rules/git-safety.md`:

```
type(scope): Brief summary (under 72 chars)

Problem: What issue or need prompted this change
Solution: How this commit addresses it
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

Good:
```
feat(inquiries): Allow filtering by date range

Problem: Admin dashboard shows all inquiries with no way to scope by time.
Solution: Add optional ?from=&to= params to GET /api/inquiries with ISO date validation.
```

Bad:
```
Updated stuff
```

---

## Pull requests

1. **Rebase onto latest main** before opening:
   ```bash
   git fetch origin && git rebase origin/main
   ```
2. **Self-review** your diff (`gh pr diff --stat`). Unexpected files mean stale branch — rebase again.
3. **Fill in the PR template** (summary, test plan, screenshots if UI).
4. **Merge with `--auto --squash`** — this waits for CI before landing.
   ```bash
   gh pr merge --auto --squash
   ```
5. **Never force-push to main.** Force-push is only ever `--force-with-lease` on your own branch.

---

## Tests

Before every commit:

1. Run the relevant test suite for the code you touched.
2. Verify all tests pass.
3. Update tests if the change invalidates them — don't delete and re-add.

See [`.claude/rules/testing.md`](.claude/rules/testing.md) for what to test and the definition of done.

---

## Adding knowledge to the repo

If you learn something worth persisting — a gotcha, a vendor quirk, a decision — write it down:

- **Rule for everyone?** → new file in `.claude/rules/` and reference from `CLAUDE.md`
- **Long-form doc?** → new file in the appropriate `docs/` subfolder
- **Architectural decision?** → new ADR in `docs/20-architecture/adr/` (copy `TEMPLATE.md`)
- **Runbook?** → new file in `docs/50-operations/runbooks/`

Never store project knowledge in Claude's persistent memory — see the memory policy in [`CLAUDE.md`](CLAUDE.md).

---

## Asking questions

- Architectural questions → read `docs/20-architecture/` first, then open a discussion
- "How do I run X?" → check `docs/00-overview/getting-started.md` and `docs/50-operations/runbooks/`
- "Why did we choose Y?" → search `docs/20-architecture/adr/` before asking

---

## Code of conduct

Be kind. Review code, not people. Leave the codebase better than you found it — including this `CONTRIBUTING.md`.
