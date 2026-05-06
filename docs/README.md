# Docs — Accelerate Robotics Knowledge Base

This is the project's single source of truth. Everything we know about strategy, architecture, integrations, deployments, and operations lives here as committed markdown.

## How it's organized

Sections are numbered so file listings sort in reading order. Gaps (00, 10, 20…) leave room to insert new sections without renumbering.

| Section | What lives here |
|---|---|
| [`00-overview/`](00-overview/) | Start here — snapshot, glossary, team, getting started |
| [`10-strategy/`](10-strategy/) | Thesis, business model, phased approach, market landscape, narrative |
| [`20-architecture/`](20-architecture/) | Software stack, API, database, security, frontend, ADRs |
| [`30-integrations/`](30-integrations/) | Elevators, robots, facilities — external systems we talk to |
| [`40-deployments/`](40-deployments/) | Real-world rollouts (Thesis Hotel pilot) + reusable playbook |
| [`50-operations/`](50-operations/) | Runbooks, monitoring, on-call, environments |
| [`60-roadmap/`](60-roadmap/) | Current quarter, backlog, open questions |
| [`assets/`](assets/) | Binary reference material (datasheets, PDFs, photos) |

## Reading paths

**New engineer onboarding:**
1. [`00-overview/project-snapshot.md`](00-overview/project-snapshot.md)
2. [`00-overview/getting-started.md`](00-overview/getting-started.md)
3. [`10-strategy/thesis.md`](10-strategy/thesis.md)
4. [`20-architecture/README.md`](20-architecture/README.md)
5. [`../CONTRIBUTING.md`](../CONTRIBUTING.md)

**Pitching the company (investors, partners):**
1. [`10-strategy/thesis.md`](10-strategy/thesis.md)
2. [`10-strategy/business-model.md`](10-strategy/business-model.md)
3. [`10-strategy/market-landscape.md`](10-strategy/market-landscape.md)
4. [`40-deployments/thesis-hotel/README.md`](40-deployments/thesis-hotel/README.md)

**Planning a robot deployment:**
1. [`40-deployments/playbook.md`](40-deployments/playbook.md)
2. [`30-integrations/robots/`](30-integrations/robots/) (specs)
3. [`30-integrations/facilities/wifi-requirements.md`](30-integrations/facilities/wifi-requirements.md)
4. [`40-deployments/thesis-hotel/checklist.md`](40-deployments/thesis-hotel/checklist.md)

**Integrating with elevators:**
1. [`30-integrations/elevator/README.md`](30-integrations/elevator/README.md)
2. [`30-integrations/elevator/thyssenkrupp-tac32t.md`](30-integrations/elevator/thyssenkrupp-tac32t.md)
3. [`30-integrations/elevator/keenon-ebox.md`](30-integrations/elevator/keenon-ebox.md)
4. [`30-integrations/elevator/button-emulator.md`](30-integrations/elevator/button-emulator.md)

## Contributing to the docs

- Keep filenames in `kebab-case.md`.
- Use the section numbering.
- Link liberally between docs — this is a wiki, not a linear book.
- When decisions are made, write an ADR in [`20-architecture/adr/`](20-architecture/adr/).
- When procedures are established, write a runbook in [`50-operations/runbooks/`](50-operations/runbooks/).

See [`../CONTRIBUTING.md`](../CONTRIBUTING.md) for general contribution mechanics.
