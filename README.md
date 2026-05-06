# Accelerate Robotics

> **One brain, many bots.** A hospital robotics orchestration platform — the software layer that coordinates robot fleets across vendors for cleaning, logistics, delivery, and sensing workflows.

Anchored in Miami. First deployment: The Thesis Hotel (10-story property).

## What this repo is

The Accelerate Robotics web app — marketing site, admin dashboard, REST API for inquiry management, and the living knowledge base for the platform. Node.js + Express + SQLite. No frontend build step.

## Quick start

```bash
cp .env.example .env            # fill in JWT_SECRET, ADMIN creds, RESEND_API_KEY
npm install
npm run dev                      # http://localhost:3000
```

Then open <http://localhost:3000>. Admin login is at `/admin-login`.

## Repo layout

| Path | What lives there |
|---|---|
| [`src/`](src/) | Express backend (server, routes, middleware, services) |
| [`public/`](public/) | Static frontend pages (served as-is, no build step) |
| [`docs/`](docs/README.md) | **Project knowledge** — strategy, architecture, integrations, deployments, ops |
| [`.claude/`](.claude/README.md) | Claude Code configuration (rules, skills, agents) |
| [`tests/`](tests/) | Unit, integration, and end-to-end tests |
| [`scripts/`](scripts/) | Dev and ops helper scripts |
| [`data/`](data/) | SQLite database (gitignored) |

## Where to go next

- **New to the project?** → [`docs/00-overview/project-snapshot.md`](docs/00-overview/project-snapshot.md)
- **Getting set up locally?** → [`docs/00-overview/getting-started.md`](docs/00-overview/getting-started.md)
- **Understand the architecture?** → [`docs/20-architecture/README.md`](docs/20-architecture/README.md)
- **Ship a change?** → [`CONTRIBUTING.md`](CONTRIBUTING.md)
- **Working with Claude Code?** → [`CLAUDE.md`](CLAUDE.md)

## Status

In active development. See [`docs/00-overview/project-snapshot.md`](docs/00-overview/project-snapshot.md) for the current state-of-project snapshot and [`docs/60-roadmap/current-quarter.md`](docs/60-roadmap/current-quarter.md) for priorities.

## License

Proprietary. See [`LICENSE`](LICENSE).
