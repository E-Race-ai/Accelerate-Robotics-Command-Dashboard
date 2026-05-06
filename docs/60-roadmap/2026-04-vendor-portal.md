# Vendor Portal — UPB external collaboration

**Status:** spec — not started
**Size:** L
**Owner:** Eric Race
**Source:** Board item #6, captured 2026-04-28

The seventh and last open item on the Q2 dashboard board after PRs #56–63 land. Held back from the same session because the surface area is wide enough that it deserves a dedicated branch (or several) and a scoping conversation before code is written.

## Why this exists

The Universal Push Button (UPB) — our $23/floor universal elevator emulator, a.k.a. "the wedge" in our internal terminology — is built in collaboration with external vendors who handle:

- Mechanical CAD + .stl files
- Hours estimation and time tracking
- Quotes and per-unit pricing
- Invoice submission

Today this collab happens over email, shared Drive folders, and individual texts. There is no system of record; quotes get lost, the latest .stl is whichever attachment is most recent in someone's inbox, and invoices need to be hand-reconciled against the original quote.

A vendor portal gives our outside collaborators a scoped place to submit, version, and track all of the above — and gives us an internal view of every active vendor's state in one place.

## Scope decisions to make before writing code

These are the calls that gate implementation. None are answered yet.

1. **Auth model for external vendors.** Magic-link tokens to a vendor's email? Per-vendor login with a shared secret? Single-use upload links?
2. **Where files live.** Local disk + multer (already a dep), or S3 / R2 from day one? CAD + .stl files can be large; the answer changes the deployment story.
3. **Single vendor or multi-vendor first?** UPB has one primary mechanical partner today. MVP could hard-code that vendor and skip vendor management UI entirely.
4. **Quotes — structured or freeform?** A line-item table (qty, unit, $) is more useful but more work; a single uploaded PDF + total field is the fastest MVP.
5. **Invoice reconciliation.** Should the portal automatically link an invoice to the quote it fulfills, or is that a manual cross-check Eric does when reviewing?
6. **What lives where.** Is this a new top-level surface (\`/vendor\`) or an admin tab inside Command Center? Both have valid arguments.

## Suggested first PR (when we restart)

A minimum-viable spine that the rest can hang off:

- New \`vendors\` table — id, name, contact_email, magic_link_token, token_expires_at.
- New \`vendor_submissions\` table — id, vendor_id, type (quote/file/hours/invoice), payload JSON, file_path, created_at, status.
- POST /api/vendor/submit — public, rate-limited, takes a magic-link token + submission payload.
- GET /admin/vendors — Eric-side index of all vendors and their recent submissions.
- /vendor/:token — vendor-side single-page app: drag-drop a file, write a note, submit.

That spine is ~M sized and unblocks every other piece.

## Related work that already shipped (PR #58, #62)

The toolkit Stealth Mode and manual assignment features add useful primitives we'll reuse here:

- Stealth Mode pattern (localStorage flag + visual mask) is the model for hiding vendor collab from the team-wide toolkit view if a vendor relationship is sensitive.
- Manual assignments give us a way to mark "Eric owns the UPB vendor relationship" without that needing a new permission system.

## Open prompts for the next session kickoff

- Pick one of the six scope decisions above to settle first.
- Confirm: are we building this for one vendor (UPB mechanical) or designing for many?
- Decide host: \`accelerate-elevator\` repo, or stay in \`accelerate-robotics\`?
