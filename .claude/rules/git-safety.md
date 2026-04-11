# Git Safety

## Branch Isolation

Every session should work on its own branch. Never commit directly to `main`.

### Workflow

1. **Sync before branching** — local main can be stale:
   ```bash
   git fetch origin
   git checkout main && git reset --hard origin/main
   git checkout -b <type>/<short-description>
   ```

2. Make all commits on this branch.

3. **Only stage files you intentionally modified** — never use `git add -A` or `git add .` from the repo root without checking what's staged.

4. **Verify the PR diff before merging**:
   ```bash
   gh pr diff --stat
   ```
   If unexpected files appear, your branch is stale. Rebase first:
   ```bash
   git fetch origin && git rebase origin/main
   ```

5. **Always use `--auto`** when merging:
   ```bash
   gh pr merge --auto --squash
   ```
   The `--auto` flag waits for CI checks. Never merge without CI passing.

## Squash Merge Safety

When a PR branch is open and another PR merges changes to the same files on main, the squash merge can silently drop your changes. Always rebase onto latest main before merging:

```bash
git fetch origin && git rebase origin/main
git push --force-with-lease
```

## Commit messages

Follow this template:

```
type(scope): Brief summary (under 72 chars)

Problem: What issue or need prompted this change
Solution: How this commit addresses it
```

**Types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`

## Never

- Force-push to `main`
- Skip hooks with `--no-verify`
- Commit `.env`, database files, or anything under `data/`
- Amend a commit that's already been pushed and shared
