# `.claude/` — Claude Code configuration

This folder is how **[Claude Code](https://claude.com/claude-code)** — Anthropic's terminal-based coding agent — collaborates on this repo. It's checked into git so every engineer on the team gets the same rules, skills, and agents.

If you're not using Claude Code, you can still read these files as plain markdown — they're useful as team standards and reference material.

---

## Layout

```
.claude/
├── README.md              ← this file
├── settings.json          ← harness settings (hooks, permissions)
├── rules/                 ← passive guidance loaded into every session
├── skills/                ← active multi-step workflows invoked via slash commands
├── agents/                ← specialized sub-agents for focused work
└── commands/              ← ad-hoc shortcuts (simpler than skills)
```

---

## Rules vs Skills vs Agents vs Commands

| Type | Purpose | When it runs | Example |
|---|---|---|---|
| **Rule** (`rules/*.md`) | Passive "always do X, never do Y" guidance | Loaded into every Claude Code session via `CLAUDE.md` | "Never commit to main directly" |
| **Skill** (`skills/<name>/SKILL.md`) | Active multi-step workflow | When the user types `/skill-name` | `/new-route` scaffolds a route + test + registration |
| **Agent** (`agents/*.md`) | Specialized role Claude can delegate to | When Claude decides the task matches | `security-reviewer` for auth-touching PRs |
| **Command** (`commands/*.md`) | Lightweight shortcut for a single recurring action | When the user types `/command-name` | `/smoke-test` runs a preset shell command |

**Rule of thumb:**
- If it's a *rule you always want followed*, put it in `rules/`.
- If it's a *task you want performed on demand*, put it in `skills/` or `commands/`.
- If it's a *role you want Claude to play*, put it in `agents/`.

---

## Rules index

Every file in `rules/` is referenced from the top-level `CLAUDE.md` so it's auto-loaded.

| Rule | What it covers |
|---|---|
| [`code-quality.md`](rules/code-quality.md) | Clarity, error handling, performance, security basics |
| [`git-safety.md`](rules/git-safety.md) | Branch isolation, PR workflow, squash-merge safety |
| [`testing.md`](rules/testing.md) | Test coverage expectations, definition of done |
| [`wiring-verification.md`](rules/wiring-verification.md) | Verify user-reachability before calling a feature done |
| [`security.md`](rules/security.md) | Auth, secrets, CSP, rate limiting specific to this app |
| [`database-migrations.md`](rules/database-migrations.md) | SQLite schema change policy |
| [`domain-vocabulary.md`](rules/domain-vocabulary.md) | Hospital + robotics + elevator terminology |

---

## Skills index

| Skill | Invoked as | Purpose |
|---|---|---|
| `new-route` | `/new-route` | Scaffold a new API route with test and registration |
| `deploy-check` | `/deploy-check` | Pre-flight validation before a production deploy |
| `schema-diff` | `/schema-diff` | Preview a DB schema change and its migration impact |
| `elevator-sim` | `/elevator-sim` | Run the button emulator simulator with preset scenarios |

See `skills/<name>/SKILL.md` for each skill's details.

---

## Agents index

| Agent | When Claude picks it |
|---|---|
| `architect.md` | Multi-file design and planning work |
| `security-reviewer.md` | Auth, CSP, input-validation, or secrets changes |
| `elevator-expert.md` | E-Box, OEM API, LoRa, RFID, or button emulator work |

---

## Commands index

| Command | What it does |
|---|---|
| `/smoke-test` | Run a preset smoke test script |
| `/start-dev` | Start the dev server and tail logs |

---

## Adding to `.claude/`

- **New rule?** Add `rules/<name>.md` and reference it from `CLAUDE.md`.
- **New skill?** Create `skills/<name>/SKILL.md` with YAML frontmatter (`name`, `description`).
- **New agent?** Create `agents/<name>.md` following the existing format.
- **New command?** Create `commands/<name>.md` with a one-line description.

Every addition should come with a PR that updates the index in this file.
