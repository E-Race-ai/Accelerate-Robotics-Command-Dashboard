# Getting Started

How to go from nothing to a running dev server for Accelerate Robotics.

## Prerequisites

- **Node.js** 18+ (LTS or newer)
- **npm** (ships with Node)
- **git**
- A Unix-like shell (macOS, Linux, or WSL)
- **Resend account** (optional for local dev, required for prod email)

## Clone and install

```bash
git clone <repo-url> accelerate-robotics
cd accelerate-robotics
npm install
```

## Configure environment variables

Copy the example file and fill it in:

```bash
cp .env.example .env
```

Required variables:

| Variable | Purpose | How to choose |
|---|---|---|
| `JWT_SECRET` | Signs admin auth JWTs | Cryptographically random 64-char hex (`openssl rand -hex 32`) |
| `ADMIN_EMAIL` | Seeded admin email | Use your email |
| `ADMIN_PASSWORD` | Seeded admin password | Use a real password for local; rotate before prod |
| `DB_PATH` | SQLite file path | Leave as `./data/accelerate.db` for local |
| `RESEND_API_KEY` | Resend API key for email notifications | Create at [resend.com](https://resend.com) — optional for local |
| `EMAIL_FROM` | From-address for notifications | e.g. `Accelerate Robotics <hello@example.com>` |
| `PORT` | HTTP port | Default 3000 |
| `NODE_ENV` | `development` or `production` | Default `development` |

## Run

```bash
npm run dev
```

That runs `node --watch src/server.js`. It:

1. Creates `data/` if needed
2. Opens `data/accelerate.db` (creating it if missing)
3. Runs `CREATE TABLE IF NOT EXISTS` for all three tables
4. Seeds the admin user from `ADMIN_EMAIL` + `ADMIN_PASSWORD` if both are set and no admin exists
5. Starts Express on `http://localhost:3000`

Visit:
- `http://localhost:3000/` — marketing site
- `http://localhost:3000/admin-login` — admin login
- `http://localhost:3000/admin` — admin dashboard (after login)

## Verify it works

### Public inquiry form

- Open `http://localhost:3000/`
- Scroll to the contact form, fill it in, submit
- Check for a success toast
- If Resend is configured, check your inbox for the notification email

### Admin dashboard

- Log in at `/admin-login` with `ADMIN_EMAIL` + `ADMIN_PASSWORD`
- You should see the inquiry you just submitted
- Click to change its status — it should persist after refresh

### Smoke tests

See [`../../.claude/commands/smoke-test.md`](../../.claude/commands/smoke-test.md) for a quick API-level check.

## Common issues

### `[server] Error: EADDRINUSE`

Port 3000 is already in use. Either stop the other process or set `PORT=3001` in `.env`.

### Admin login returns `401 Invalid credentials`

- Confirm `.env` has `ADMIN_EMAIL` and `ADMIN_PASSWORD`
- Delete `data/accelerate.db` and restart to re-seed (only safe in dev)

### `JWT_SECRET` defaults to `dev-secret-change-me`

That's fine locally but a fatal mistake in production. Railway config must set a real secret.

### SQLite file not created

Check directory permissions in `./data/`. The server auto-creates the dir, but filesystem ACLs can block it.

## Next steps

- Read [`project-snapshot.md`](project-snapshot.md) for project context
- Read the [ADRs](../20-architecture/adr/) before touching architecture
- Read [`../../.claude/rules/`](../../.claude/rules/) before writing code
- Read [`../20-architecture/api-reference.md`](../20-architecture/api-reference.md) for the HTTP surface

## Related

- [`../20-architecture/`](../20-architecture/) — architecture docs
- [`../50-operations/environments.md`](../50-operations/environments.md) — environment matrix
- [`../../CONTRIBUTING.md`](../../CONTRIBUTING.md) — branching + commit workflow
