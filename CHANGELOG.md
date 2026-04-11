# Changelog

Notable changes to Accelerate Robotics. Keep entries short and user-facing — link to PRs/commits for detail.

Follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Structured `docs/` knowledge base covering strategy, architecture, integrations, deployments, and operations.
- `.claude/` configuration: rules, skill stubs, agent definitions, commands.
- Initial ADRs documenting SQLite, no-frontend-build-step, JWT-in-httponly-cookie, Miami anchor, button-emulator vs OEM API.
- `CONTRIBUTING.md`, `CHANGELOG.md`, top-level `README.md`.
- Thesis Hotel site profile: `docs/40-deployments/thesis-hotel/site-profile.md` and print-ready `public/thesis-hotel-site-profile.html` — comprehensive public-information profile of the Phase 1 deployment site.

### Changed
- `CLAUDE.md` restructured to reference `.claude/rules/` and `docs/` instead of duplicating guidance.
- `public/pool-deck-robot-evaluation.html` corrected to reflect confirmed site facts: 3rd-floor rooftop pool (not ground level), surface material unconfirmed, rooftop parapet fall-risk gate added.
- `public/outdoor-robot-evaluation.html` corrected to reflect confirmed Paseo Courtyard dimensions (25 × 202 ft, ~5,050 sq ft), padel court (not pickleball or tennis), and "Urban Living Room" programming constraints.

---

## Template for new entries

```
## [x.y.z] — YYYY-MM-DD

### Added
- New feature or capability.

### Changed
- Modified behavior.

### Fixed
- Bug fixes.

### Removed
- Deprecated features.

### Security
- Security-sensitive changes.
```
