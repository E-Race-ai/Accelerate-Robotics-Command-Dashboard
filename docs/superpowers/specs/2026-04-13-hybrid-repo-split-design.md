# Hybrid Repo Split — Design Spec

**Date:** 2026-04-13
**Status:** Approved
**Author:** Eric Race + Claude Code

## Problem

The `accelerate-robotics/` repo contains 244 files spanning software, hardware, physical deployments, research, and strategy. This makes it hard to:

- Navigate to a specific sub-project quickly
- Delegate a workstream (e.g., hand Celia the elevator BOM without her wading through strategy docs)
- Get focused Claude Code context per session (all 85 docs load every time)
- Distinguish long-lived company knowledge from time-boxed field projects

## Decision

Split into **three repos** using a hybrid approach:

| Repo | Type | Contents | Lifecycle |
|------|------|----------|-----------|
| `accelerate-robotics/` | Company brain | Platform software, strategy, architecture, operations, fleet specs, robot evaluations | Long-lived, continuous |
| `accelerate-elevator/` | Hardware product | Button emulator design, BOM, firmware, install guides, patent analysis | Build → iterate → ship to buildings |
| `accelerate-thesis-hotel/` | Deployment project | Site profile, proposals, phases, checklists, agendas | Time-boxed: starts at kickoff, ends at pilot complete |

## Why Hybrid Over Full Split

- **Strategy docs reference fleet, architecture, and business model together** — splitting those into separate repos would create broken cross-references and forced duplication.
- **The Express app + strategy + fleet knowledge share a lifecycle** — they evolve together and are tightly coupled.
- **The elevator emulator is a hardware product** with its own BOM, firmware roadmap, bench testing, and UL listing path. Different lifecycle than the software platform.
- **Thesis Hotel is a time-boxed deployment** with defined phases and an end date. Future buildings will each get their own repo, using Thesis Hotel as the template.
- **Can always merge back** — Going from separate repos into a monorepo (`git subtree add`) is straightforward. Going the other direction is painful.

## Repo 1: `accelerate-elevator/`

Universal button emulator — $23/floor, vendor-agnostic elevator integration.

### Structure

```
accelerate-elevator/
├── CLAUDE.md
├── README.md
├── docs/
│   ├── design/
│   │   ├── button-emulator.md
│   │   └── adr-button-emulator-vs-oem-api.md
│   ├── reference/
│   │   ├── keenon-ebox.md
│   │   ├── thyssenkrupp-tac32t.md
│   │   └── patent-analysis.md
│   ├── bom/
│   │   └── order-list.md
│   └── install/
│       └── thesis-hotel-install.md
├── firmware/                    (future ESP32-C3 code)
├── pages/
│   ├── button-emulator-sim.html
│   ├── bom-order-guide.html
│   ├── integration-overview.html
│   ├── install-guide.html
│   └── shaft-diagram.html
├── assets/
│   └── elevator-photos/
└── .claude/
    ├── agents/
    │   └── elevator-expert.md
    └── skills/
        └── elevator-sim/SKILL.md
```

### CLAUDE.md Content

- Project description: Universal button emulator for multi-floor robotics
- Domain vocabulary: Elevator-specific terms (hall call, car call, signal fixture, TAC32T, relay-parallel, etc.)
- Safety rules: ASME A17.1 compliance, galvanic isolation requirements, parallel dry contacts only
- Link to `accelerate-robotics/` for platform context
- Link to `accelerate-thesis-hotel/` for first deployment site

### Files Moving From `accelerate-robotics/`

| Source | Destination |
|--------|-------------|
| `docs/30-integrations/elevator/button-emulator.md` | `docs/design/button-emulator.md` |
| `docs/30-integrations/elevator/keenon-ebox.md` | `docs/reference/keenon-ebox.md` |
| `docs/30-integrations/elevator/thyssenkrupp-tac32t.md` | `docs/reference/thyssenkrupp-tac32t.md` |
| `docs/30-integrations/elevator/patent-analysis.md` | `docs/reference/patent-analysis.md` |
| `docs/30-integrations/elevator/bom-order-list.md` | `docs/bom/order-list.md` |
| `docs/20-architecture/adr/0005-button-emulator-vs-oem-api.md` | `docs/design/adr-button-emulator-vs-oem-api.md` |
| `public/elevator-button-emulator.html` | `pages/button-emulator-sim.html` |
| `public/elevator-bom-order-guide.html` | `pages/bom-order-guide.html` |
| `public/elevator-integration.html` | `pages/integration-overview.html` |
| `public/elevator-install-guide.html` | `pages/install-guide.html` |
| `public/elevator-embed.html` | `pages/shaft-diagram.html` |
| `public/assets/elevator-photos/*` | `assets/elevator-photos/*` |
| `.claude/agents/elevator-expert.md` | `.claude/agents/elevator-expert.md` |
| `.claude/skills/elevator-sim/SKILL.md` | `.claude/skills/elevator-sim/SKILL.md` |

## Repo 2: `accelerate-thesis-hotel/`

First customer deployment — 10-story Miami hotel, 7-robot fleet, 3 phases.

### Structure

```
accelerate-thesis-hotel/
├── CLAUDE.md
├── README.md
├── docs/
│   ├── proposal/
│   │   ├── proposal.md
│   │   └── fleet-composition.md
│   ├── site/
│   │   ├── site-profile.md
│   │   ├── site-survey.md
│   │   └── residences-use-case.md
│   ├── phases/
│   │   ├── phase-1-c30.md
│   │   └── phase-2-elevator.md
│   ├── operations/
│   │   ├── checklist.md
│   │   ├── risk-register.md
│   │   └── kickoff-agenda.md
│   └── playbook/
│       └── deployment-playbook.md
├── pages/
│   ├── proposal.html
│   ├── site-profile.html
│   ├── robot-solutions.html
│   ├── onepager.html
│   ├── agenda.html
│   ├── playbook.html
│   └── playbook-print.html
├── assets/
│   ├── floor-plans/
│   ├── site-photos/
│   └── robots/photos/
└── .claude/
    └── rules/
        └── deployment-context.md
```

### CLAUDE.md Content

- Project description: Thesis Hotel robot deployment — Phase 1 (C30 cleaning pilot) through Phase 3 (full fleet)
- Key people: Brent Reynolds (building owner), Anthony (building engineer)
- Property: 10 stories, guest floors 4-10, 2x ThyssenKrupp TAC32T elevators
- Link to `accelerate-elevator/` for Phase 2 elevator integration
- Link to `accelerate-robotics/` for fleet specs and platform context

### Files Moving From `accelerate-robotics/`

| Source | Destination |
|--------|-------------|
| `docs/40-deployments/thesis-hotel/proposal.md` | `docs/proposal/proposal.md` |
| `docs/40-deployments/thesis-hotel/fleet-composition.md` | `docs/proposal/fleet-composition.md` |
| `docs/40-deployments/thesis-hotel/site-profile.md` | `docs/site/site-profile.md` |
| `docs/40-deployments/thesis-hotel/site-survey.md` | `docs/site/site-survey.md` |
| `docs/40-deployments/thesis-hotel/residences-use-case.md` | `docs/site/residences-use-case.md` |
| `docs/40-deployments/thesis-hotel/phase-1-c30.md` | `docs/phases/phase-1-c30.md` |
| `docs/40-deployments/thesis-hotel/phase-2-elevator.md` | `docs/phases/phase-2-elevator.md` |
| `docs/40-deployments/thesis-hotel/checklist.md` | `docs/operations/checklist.md` |
| `docs/40-deployments/thesis-hotel/risk-register.md` | `docs/operations/risk-register.md` |
| `docs/40-deployments/thesis-hotel/kickoff-agenda.md` | `docs/operations/kickoff-agenda.md` |
| `docs/40-deployments/playbook.md` | `docs/playbook/deployment-playbook.md` |
| `public/thesis-hotel-proposal.html` | `pages/proposal.html` |
| `public/thesis-hotel-site-profile.html` | `pages/site-profile.html` |
| `public/thesis-hotel-robot-solutions.html` | `pages/robot-solutions.html` |
| `public/thesis-hotel-onepager.html` | `pages/onepager.html` |
| `public/thesis-hotel-agenda.html` | `pages/agenda.html` |
| `public/deployment-playbook.html` | `pages/playbook.html` |
| `public/deployment-playbook-print.html` | `pages/playbook-print.html` |
| `public/assets/thesis-hotel/*` | `assets/` |
| `public/assets/robots/photos/*` | `assets/robots/photos/` |

## Repo 3: `accelerate-robotics/` — What Stays

The company brain: platform software, strategy, architecture, operations, fleet knowledge.

### What Gets Removed

| Removed | Moved To |
|---------|----------|
| `docs/30-integrations/elevator/` (entire dir) | `accelerate-elevator/` |
| `docs/40-deployments/` (entire dir) | `accelerate-thesis-hotel/` |
| `docs/20-architecture/adr/0005-*` | `accelerate-elevator/` |
| `public/elevator-*.html` (5 files) | `accelerate-elevator/` |
| `public/thesis-hotel-*.html` (5 files) | `accelerate-thesis-hotel/` |
| `public/deployment-playbook*.html` (2 files) | `accelerate-thesis-hotel/` |
| `public/assets/elevator-photos/` | `accelerate-elevator/` |
| `public/assets/thesis-hotel/` | `accelerate-thesis-hotel/` |
| `.claude/agents/elevator-expert.md` | `accelerate-elevator/` |
| `.claude/skills/elevator-sim/` | `accelerate-elevator/` |

### What Gets Updated

- **CLAUDE.md** — Add "Related Repos" section with paths + descriptions
- **domain-vocabulary.md** — Remove elevator-specific terms (they move with the elevator repo)
- **projects.html** — Update links to point to file:// paths for the new repos' pages
- **docs/30-integrations/README.md** — Remove elevator section, note it moved
- **docs/README.md** — Remove 40-deployments references

### Final Structure (11 HTML pages, ~60 docs)

```
accelerate-robotics/
├── CLAUDE.md                    (updated)
├── src/                         (unchanged — 8 files)
├── public/                      (11 pages, down from 21)
│   ├── index.html
│   ├── admin.html
│   ├── admin-login.html
│   ├── projects.html            (updated links)
│   ├── architecture.html
│   ├── financial-analysis.html
│   ├── pricing-model.html
│   ├── outdoor-robot-evaluation.html
│   ├── pool-deck-robot-evaluation.html
│   ├── robot-preview.html
│   ├── js/
│   └── logos/
├── docs/
│   ├── 00-overview/
│   ├── 10-strategy/
│   ├── 20-architecture/         (minus ADR-0005)
│   ├── 30-integrations/
│   │   ├── robots/              (7 Keenon specs + fleet software)
│   │   └── facilities/          (network + WiFi)
│   ├── 50-operations/           (runbooks, monitoring, on-call)
│   └── 60-roadmap/
├── .claude/
│   ├── rules/                   (7 files, domain-vocabulary trimmed)
│   ├── skills/                  (3 remaining: deploy-check, new-route, schema-diff)
│   └── agents/                  (2 remaining: architect, security-reviewer)
├── data/
├── tests/
└── package.json
```

## Execution Plan

1. Create `accelerate-elevator/` with git init, CLAUDE.md, README.md
2. Copy elevator files from `accelerate-robotics/` into new structure
3. Create `accelerate-thesis-hotel/` with git init, CLAUDE.md, README.md
4. Copy hotel files from `accelerate-robotics/` into new structure
5. Remove moved files from `accelerate-robotics/`
6. Update `accelerate-robotics/` CLAUDE.md, domain-vocabulary.md, projects.html, READMEs
7. Verify no broken internal references in any repo
8. Commit all three repos
9. Update master project table (memory) with new repo paths

## Open Questions

None — design approved by Eric.
