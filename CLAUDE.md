# Accelerate Robotics — Claude Code Guide

Project-specific guidance for Claude Code working in this repo. Short by design — details live in [`docs/`](docs/README.md) and [`.claude/rules/`](.claude/rules/).

## What this is

**Accelerate Robotics** — Hospital Robotics OS. Node.js/Express web app with SQLite, JWT auth, Resend email. Single-server monolith. No frontend build step.

- Entry: `src/server.js` → `npm run dev` (watch) | `npm start` (prod)
- Overview: [`docs/00-overview/project-snapshot.md`](docs/00-overview/project-snapshot.md)

## Where knowledge lives

All institutional knowledge is committed to this repo. Nothing lives in Claude's persistent memory (see policy below).

| Topic | Location |
|---|---|
| Strategy, thesis, business model | [`docs/10-strategy/`](docs/10-strategy/) |
| Architecture, API, database, ADRs | [`docs/20-architecture/`](docs/20-architecture/) |
| Robots, fleet specs, facilities | [`docs/30-integrations/`](docs/30-integrations/) |
| Runbooks, monitoring, on-call | [`docs/50-operations/`](docs/50-operations/) |
| Roadmap and open questions | [`docs/60-roadmap/`](docs/60-roadmap/) |

## Related Repos (field projects)

These were split out from this repo on 2026-04-13 because they have independent lifecycles:

| Repo | Type | What's in it |
|---|---|---|
| [`accelerate-elevator`](/Users/ericrace/Code/accelerate-elevator/) | Hardware product | Universal button emulator — design, BOM, firmware, install guides, patent analysis |
| [`accelerate-thesis-hotel`](/Users/ericrace/Code/accelerate-thesis-hotel/) | Deployment project | First customer — site profile, proposals, phases, checklists, playbook |

## Rules (auto-loaded, always active)

These define the non-negotiable standards for code and collaboration in this repo.

- [`@.claude/rules/code-quality.md`](.claude/rules/code-quality.md) — clarity, error handling, performance, security basics
- [`@.claude/rules/git-safety.md`](.claude/rules/git-safety.md) — branch isolation, PR workflow, squash-merge safety
- [`@.claude/rules/testing.md`](.claude/rules/testing.md) — test coverage and definition-of-done
- [`@.claude/rules/wiring-verification.md`](.claude/rules/wiring-verification.md) — verify user-reachability before calling a feature done
- [`@.claude/rules/security.md`](.claude/rules/security.md) — auth, secrets, CSP, rate limiting
- [`@.claude/rules/database-migrations.md`](.claude/rules/database-migrations.md) — schema change policy
- [`@.claude/rules/domain-vocabulary.md`](.claude/rules/domain-vocabulary.md) — hospital + robotics terms (elevator terms moved to `accelerate-elevator`)

## Before a non-trivial change

1. Check [`docs/60-roadmap/current-quarter.md`](docs/60-roadmap/current-quarter.md) to ensure the change fits the current direction.
2. Read relevant ADRs in [`docs/20-architecture/adr/`](docs/20-architecture/adr/).
3. Follow `.claude/rules/git-safety.md` — new branch, never commit to main.
4. If the change is architectural, write a new ADR.
5. Update `CHANGELOG.md` if user-visible.

## Knowledge Storage Policy — DO NOT WRITE TO MEMORY

**Never write to Claude's persistent memory system for this project.** The memory directory at `~/.claude/projects/-Users-ericrace-Code-accelerate-robotics/memory/` is not tracked in git, so anything stored there is invisible to teammates and to other machines.

Instead, capture durable knowledge as markdown files inside this repo:

- Project-wide guidance → this `CLAUDE.md`
- Topical rules / gotchas → `.claude/rules/*.md`
- Longer-form docs → `docs/`

If you learn something worth remembering, write it to a markdown file and commit it.
