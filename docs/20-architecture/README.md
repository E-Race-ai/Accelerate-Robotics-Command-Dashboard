# 20 — Architecture

How the system is built, why it's built that way, and where to look to change it.

## Contents

| File | What it covers |
|---|---|
| [`software-stack.md`](software-stack.md) | Full platform tech choices from edge firmware to cloud dashboard (14 sections) |
| [`api-reference.md`](api-reference.md) | REST endpoints, auth, request/response shapes |
| [`database-schema.md`](database-schema.md) | Tables, relationships, migration policy |
| [`security-model.md`](security-model.md) | JWT, CSP, rate limiting, threat model |
| [`frontend-architecture.md`](frontend-architecture.md) | Static pages, no build step, why |
| [`adr/`](adr/) | Architecture Decision Records — immutable "we decided X because Y" |

## Current runtime architecture (web app)

```
Browser
   │
   ├── Static HTML/JS/CSS    ← public/ (served as-is, no build)
   └── JSON REST             ← /api/auth, /api/inquiries, /api/recipients, /api/stocks
        │
        ▼
   Express app              ← src/server.js
        │
        ├── Helmet CSP, rate limit, cookie-parser
        ├── JWT auth middleware (src/middleware/auth.js)
        ├── Route handlers (src/routes/*.js)
        └── Services
             ├── better-sqlite3 → data/accelerate.db
             ├── Resend API     → email notifications
             └── yahoo-finance2 → public stock quotes
```

The *product vision* — the full robotics platform with LoRa/E-Box/fleet coordination — lives in [`software-stack.md`](software-stack.md). The web app in `src/` is the marketing site + inquiry backend + admin dashboard, not the robotics runtime.

## Architecture Decision Records

Every non-trivial technical choice gets an ADR. They're numbered, immutable once accepted, and explain *why* — so we don't re-argue settled questions.

See [`adr/README.md`](adr/README.md) for the index and [`adr/TEMPLATE.md`](adr/TEMPLATE.md) to write a new one.
