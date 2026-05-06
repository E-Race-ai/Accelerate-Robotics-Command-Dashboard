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

## Branch Scope — One Logical Change Per Branch

If you sit down to add auth and mid-session realize you also want to add a
LiDAR toolkit card, **do not add the LiDAR change to the same branch**.
That branch is about auth.

Mixed-scope branches cause:
- PRs that are hard to review because they blend unrelated concerns
- Reverts that undo something unrelated to the reported problem
- Conflicts when one thread merges and the other lingers
- Git history that can't explain why any single change was made

### When scope creeps mid-session

1. Stash or commit the work-in-progress on the current branch
2. `git checkout main && git fetch origin && git reset --hard origin/main`
3. `git checkout -b <type>/<new-scope>` for the second thing
4. Make the unrelated change, commit, push, PR
5. Return to the original branch: `git checkout <original-branch>`
6. Pop your stash and resume

A 30-second branch switch is much cheaper than the cleanup that mixed
branches produce.

### If you already mixed scopes on one branch

Split after the fact using cherry-pick:

```bash
# You are on feat/mixed-branch with commits A (auth), B (lidar), C (auth)
git checkout main
git checkout -b feat/auth-cleanup
git cherry-pick A C          # pull only the auth commits
git checkout main
git checkout -b feat/lidar-scanner
git cherry-pick B            # pull the lidar commit
# delete or abandon feat/mixed-branch
```

Run the test suite on each new branch to confirm you didn't break wiring
by splitting. Expect conflicts if the commits touched adjacent lines —
resolve each carefully, keeping only the parts that belong to the new
branch's scope.

## Branch Naming

- `feat/<area>-<brief>` — new capability
- `fix/<area>-<brief>` — bug fix
- `chore/<area>-<brief>` — housekeeping, renames, no behavior change
- `docs/<area>-<brief>` — documentation only
- `refactor/<area>-<brief>` — internal structure change, no behavior change

Keep `<brief>` to 3–5 words, kebab-case. If you can't describe the branch
in 5 words, the scope is too big — split it.

### Red flags that mean "branch too big"

- Commit messages span unrelated areas ("fix auth typo" next to "add toolkit card")
- The PR description needs sections or headers
- Reviewers ask "what's this doing in here?"
- You can't explain the whole branch in one sentence

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
