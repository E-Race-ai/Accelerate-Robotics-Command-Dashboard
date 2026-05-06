# Phased Approach

Sequence matters. We start where ROI is obvious and regulation is light, then progressively move toward higher-stakes patient-adjacent work as the platform earns trust.

## Phase 1 — Logistics & Environmental (NOW)

**Scope:** Low-risk operational tasks with clear ROI and minimal regulatory complexity.

- Cleaning robots (C30 — carpet and hard floor)
- Linen transport (dirty and clean)
- Meal delivery
- Supply and pharmacy transport
- Equipment returns

**Why this first:** Labor-intensive, injury-prone, already being done by underpaid workers who are hard to retain. No clinical decision-making. No patient contact.

**First deployment:** Thesis Hotel (C30 cleaning robot pilot). See [`../40-deployments/thesis-hotel/README.md`](../40-deployments/thesis-hotel/README.md).

**Exit criterion for Phase 1 → 1.5:** Three reference deployments with documented ROI and at least one elevator-integrated multi-floor workflow.

## Phase 1.5 — Patient Sensing

**Scope:** Passive monitoring that keeps patients safer without any robot touching them.

- Atlas Mobility turn tracking (SPHM)
- Wearables for vitals and movement
- Bed exit and fall prevention sensors
- Environmental monitoring (patient room conditions)

**Why this is a half-phase:** Sensors aren't robots, but they plug into the same fleet management + workflow orchestration platform. Atlas Mobility is already doing this — it becomes a first-class category in the fleet view.

## Phase 2 — Patient Transport

**Scope:** Autonomous movement of patients within the facility.

- Guided wheelchair transport (discharge, transfer between departments)
- Lab-to-radiology patient movement
- Gurney transport under staff supervision

**Why later:** Higher liability. Requires robust elevator integration, robust safety systems, robust handoff workflows with staff. Builds on the Phase 1 elevator and mapping infrastructure.

**Gates:** Demonstrated Phase 1 safety record. Clinical sign-off on transport protocols. Legal review on liability.

## Phase 3 — Patient-Touching (Humanoids)

**Scope:** Physical-contact assistance.

- Lift/transfer assistance (reducing caregiver injury)
- Mobilization and gait training
- Patient positioning
- Hygiene assistance

**Why much later:** Substantial regulatory burden. FDA will likely class these as Class II or Class III devices. Long trials, long approvals, long sales cycles. But also — this is where the platform's moat matures, because by Phase 3 we are *the hospital's robotics operating system*, not one vendor among many.

**Partners at this stage:** Figure, 1X, Agility Robotics, Apptronik, Tesla — whoever ships credible humanoid hardware with a safe-contact story.

## Phasing in parallel with Atlas Mobility

Atlas Mobility is already in Phase 1.5 today. Accelerate Robotics is Phase 1 today. The platform eventually unifies them — Atlas sensors become one fleet category, Keenon cleaning robots become another, future humanoids become another.

## Why the sequence matters

- **Trust compounds.** Each successful phase earns the permission to attempt the next.
- **Technical debt compounds the other way.** Skipping Phase 1 to start at Phase 2 means we're solving "patient on a moving platform" before we've solved "robot in an elevator."
- **Regulatory leverage compounds.** Every audit, every ROI case study, every safety record is ammunition for the Phase 3 FDA path.

## Related

- [`thesis.md`](thesis.md) — core strategic thesis
- [`../40-deployments/README.md`](../40-deployments/README.md) — current deployments
- [`../60-roadmap/open-questions.md`](../60-roadmap/open-questions.md) — unresolved decisions about phasing
