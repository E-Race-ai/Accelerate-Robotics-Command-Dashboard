# Architecture Decision Records

Immutable records of non-trivial technical choices. Once accepted, ADRs don't get edited — if we change our mind, we write a new ADR that supersedes the old one.

## Why ADRs

Team decisions die in Slack. ADRs preserve the *why* so new engineers don't re-litigate settled questions and can see the constraints that drove a choice.

## Index

| # | Title | Status |
|---|---|---|
| [0001](0001-sqlite-over-postgres.md) | SQLite over Postgres for the web app | Accepted |
| [0002](0002-no-frontend-build-step.md) | No frontend build step | Accepted |
| [0003](0003-jwt-in-httponly-cookie.md) | JWT stored in httpOnly cookie | Accepted |
| [0004](0004-anchor-in-miami.md) | Anchor the company in Miami, not SF | Accepted |
| [0005](0005-button-emulator-vs-oem-api.md) | Universal button emulator as primary elevator integration | Proposed |

## Writing a new ADR

1. Copy [`TEMPLATE.md`](TEMPLATE.md) to the next number: `NNNN-short-title.md`.
2. Fill in Context, Decision, Consequences, Alternatives.
3. Status starts as `Proposed`. Move to `Accepted` when the team agrees. Move to `Superseded by ADR-XXXX` if overturned — never delete.
4. Add the entry to this index.
