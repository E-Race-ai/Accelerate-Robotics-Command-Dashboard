# Testing Standards

## Before Every Commit

1. Run the relevant test suite for changed code
2. Verify ALL tests pass — never commit with failing tests
3. Fix any test failures caused by your changes
4. If UI changes break tests (e.g., changed selectors), update the tests first

## What to Test

- Component tests for complex UI logic and states
- Form validation, loading states, empty states, error states
- Critical paths and high-risk flows (signup/login, payments, core CRUD, permissions)
- Edge cases: empty inputs, missing data, unauthorized access, boundary values

## Current test layout

```
tests/
├── unit/          ← Pure functions, services, small helpers
├── integration/   ← Routes + real SQLite, no network mocks
└── e2e/           ← Full browser journeys (Playwright)
```

## End-to-End Tests

- Focus on critical paths and high-risk flows
- Use stable selectors and resilient waiting (avoid brittle timing-based checks)
- Tests should be independent (clean state per test, no order dependence)
- Tests should be reproducible (seeded data, deterministic environment)

## Integration tests use a real database

Hit a real SQLite file, not a mock. The whole point of integration tests is to catch schema drift and migration bugs that mocks hide.

## Definition of Done

A change is "done" only when:

- Functionality works as described, including edge cases
- All new functionality is wired up and reachable (routes exist, navigation links exist, API calls work) — see [`wiring-verification.md`](wiring-verification.md)
- Appropriate tests exist and pass
- No new lint, type, or static analysis issues
- Documentation updated if behavior, API, or setup changed
