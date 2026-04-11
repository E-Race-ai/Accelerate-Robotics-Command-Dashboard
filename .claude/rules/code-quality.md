# Code Quality

## General

- Prefer clear code over clever code
- Keep functions small and single-purpose
- Use consistent naming and patterns already present in the codebase
- Remove dead code instead of leaving it "for later"

## Comments

- Only comment where the logic isn't self-evident
- Prefix non-obvious choices with `WHY:` so they're searchable (existing convention in `src/`)
- Every constant, threshold, timeout, or config value must have a comment explaining **why** that value was chosen — not just what it is
  - **Good**: `const MAX_MESSAGE_LENGTH = 5000; // Prevent abuse — 5k chars is generous for an inquiry`
  - **Bad**: `const MAX_MESSAGE_LENGTH = 5000; // max length`

## Error Handling

- Fail loudly and clearly for programmer errors
- Return user-safe, helpful errors for expected failures
- Include enough context in logs for debugging without leaking sensitive data
- Email notifications use fire-and-forget — log errors, don't block the response (see `src/routes/inquiries.js`)

## Performance

For performance-sensitive paths:
- Avoid N+1 patterns and unbounded loops over large datasets
- Put guardrails around expensive operations (timeouts, limits, pagination)
- The stocks endpoint caches 15 minutes — follow that pattern for anything hitting external APIs

## Security Basics

- Treat all inputs as untrusted — validate and sanitize
- Never commit secrets, tokens, or private keys (`.env` is gitignored)
- Use least-privilege for authentication and authorization
- Minimize exposure of PII; avoid logging sensitive fields
- Email bodies must go through `escapeHtml()` — see `src/services/email.js`

See [`security.md`](security.md) for the Accelerate-specific security model.
