# Thesis Hotel — Residences C30 Monitoring Use Case

The most novel — and most sensitive — use case in the Thesis Hotel deployment. A Keenon C30 operating in the residences wing as both a cleaning robot and a **passive corridor monitor**.

This doc exists separately from [`fleet-composition.md`](fleet-composition.md) because the monitoring angle raises privacy, liability, and HOA questions that deserve their own focused treatment.

---

## The idea in one paragraph

The residences wing of Thesis Hotel has a different rhythm than the hotel — longer-term occupants, fewer room turnovers, quieter corridors. One C30 robot sweeps the residential corridors daily. **Between sweeps**, it parks at a mid-corridor observation dock and uses its existing sensors (LiDAR, vision, microphone) to watch for anomalies: foreign objects left in hallways, excessive noise from units, water on the floor, or unusual events. When it detects something, it sends an alert to the building's operations team through the Accelerate Robotics platform.

**No new hardware is required.** The C30 already has every sensor needed to do this. The intelligence lives in the orchestration software.

---

## Why residences and not hotel floors

Hotel guest floors see constant staff traffic — housekeeping, front desk runs, room service, maintenance. Problems get caught within an hour by a human who's physically there.

Residences don't. A water leak at 11 PM on a Sunday can sit until Tuesday morning housekeeping notices a wet carpet by the elevator. A package theft from a doorway on Thursday can be invisible until the resident files a complaint on Saturday. **The value of automated monitoring scales inversely with staff presence.**

---

## What it detects

The C30's existing sensors can reliably distinguish between normal corridor state and anomalies. The platform compares live readings to a learned baseline and flags deltas.

### Signal sources

| Sensor | What it can see | Used for |
|---|---|---|
| **LiDAR (228° FOV, 25 m range)** | Objects in the corridor, dimensional changes, person detection | Foreign objects, person-down, blocked paths |
| **Stereo vision (3× cameras, 120° FOV)** | Color, shape, motion, wet floor reflection | Package identification, water/liquid, smoke/fire visual |
| **On-board microphone** | Sound levels, frequency profile | Excessive noise, alarms, glass breaking |
| **Cliff / anti-fall sensors** | Floor continuity at each wheel | Water or liquid on the floor (triggers cliff-like anomaly) |

### Detection classes (with example triggers)

| Class | Example | Confidence signal |
|---|---|---|
| **Foreign object** | Package left outside a unit door | New shape matched to "small box" or "bag" class; location outside door |
| **Foreign object — trash** | Leftover food container, drink cup | Vision + low-to-floor shape |
| **Water / liquid on floor** | Leak from under a door | Cliff sensor anomaly + vision reflection |
| **Excessive noise** | Loud music from a unit | Microphone decibel threshold crossed and sustained > 30 sec |
| **Alarm going off** | Smoke alarm, CO alarm | Microphone frequency match + sustained |
| **Visual smoke/fire** | Visible smoke in the corridor | Vision color/texture match |
| **Person down** | Resident fallen in the hallway | Vision — horizontal human shape, no motion > 60 sec |
| **Unfamiliar person** (future capability) | Someone who doesn't appear in the resident facial set | Vision + learned resident face set — **requires explicit consent** |

The first six classes are straightforward pattern-matching. The last two (person down, unfamiliar person) are more sensitive and require additional design review before going live.

---

## What it does NOT do

To keep the privacy story tight, the system is deliberately limited:

- ❌ **No audio recording.** Only decibel thresholds are monitored; no voice or content capture.
- ❌ **No video recording.** Only event detection; no video is stored by default. Optional 10-second pre-alert buffer retained in volatile memory only, not written to disk unless an event fires, and even then only with HOA approval.
- ❌ **No inside-unit surveillance.** The C30 physically cannot enter units and its sensors do not point through doors.
- ❌ **No facial recognition of residents** unless the HOA and each resident explicitly opt in. Default is off.
- ❌ **No license plate or vehicle tracking** — this is a corridor robot, not a parking lot camera.
- ❌ **No data sharing** with the hotel side of the property; residences alerts go only to the residences ops team.

---

## Alert protocol

### Severity classes

| Severity | Example events | Response target | Notification |
|---|---|---|---|
| **Critical** | Visual smoke/fire, person down (no movement > 60 sec), sustained alarm | Immediate (< 30 sec) | Security + building ops + Accelerate on-call + 911 trigger on confirmation |
| **Urgent** | Water/liquid on floor, prolonged unit alarm, broken glass sound | < 5 min | Maintenance + building ops |
| **Routine** | Package in hallway > 4 hours, noise above threshold > 15 min | Next business hour | HOA compliance lead + housekeeping |

### Notification channels

- **Mobile app** — primary, via the Accelerate Robotics operations app
- **SMS** — for critical severity, to on-call building ops
- **Email** — for daily/weekly summary rollups to building management
- **Dashboard** — a residences operations tab in the platform showing live corridor state and recent events

### Escalation decision tree

Any **critical** event follows this path:

1. Robot fires alert — timestamped, classified, geotagged to corridor segment
2. Alert lands with on-call operations lead (SMS + mobile notification)
3. On-call has 60 seconds to acknowledge and review live sensor state
4. If confirmed, on-call dispatches a physical response (security guard, maintenance, 911)
5. Incident logged with full timeline, response times, and resolution

Any **urgent** event drops the 911 step but otherwise follows the same flow.

Any **routine** event is simply logged and batched for the next-business-day review.

---

## Privacy, liability, and HOA requirements

This is the section that kills or green-lights the monitoring use case. **Cleaning-only is always the fallback**: if any of the following cannot be resolved, the C30 #2 robot runs as a cleaning-only deployment and the monitoring capability is disabled in software.

### HOA board review

- [ ] Formal presentation to the HOA board or residence committee
- [ ] Written monitoring scope document (this doc) approved
- [ ] HOA legal review of the alert protocol
- [ ] HOA insurance carrier review of the monitoring capability
- [ ] Board vote, majority approval
- [ ] Written sign-off from the HOA president or committee chair

### Resident disclosure and consent

- [ ] Explicit written disclosure to every resident (not buried in a lease addendum)
- [ ] Information session (in person or virtual) where residents can ask questions
- [ ] Opt-out mechanism — a resident can exclude their unit door area from monitoring by request
- [ ] Clear, visible signage: "This corridor is monitored by an autonomous robot for safety and building operations purposes"
- [ ] Label on the robot itself identifying it as a monitoring robot
- [ ] A public document residents can request showing exactly what the robot detects and what it does not

### Legal

- [ ] Florida state privacy statute review (common-area monitoring is permitted; unit-interior prohibited — this system stays corridor-side)
- [ ] Local Miami-Dade review of multi-family monitoring standards
- [ ] Counsel opinion on liability exposure in the event of a missed detection
- [ ] Counsel opinion on data retention, breach exposure, and subpoena handling
- [ ] Review with Accelerate Robotics' general liability carrier

### Insurance

- [ ] Hotel/residences property insurer notified and approves
- [ ] Accelerate Robotics general liability covers monitoring service
- [ ] Specific exclusions documented (e.g., system is not a fire-suppression or medical-alert replacement)

### Operational

- [ ] Named operations lead on the residences side (primary contact for alerts)
- [ ] On-call rotation for critical alerts outside business hours
- [ ] Incident log, auditable and versioned
- [ ] Monthly review meeting with HOA representative
- [ ] Annual privacy audit

---

## What the resident actually sees

If the full monitoring capability is approved and deployed, a resident's experience looks like:

1. A wheeled robot — ~49 × 61 × 75 cm, white and gray — sweeps the corridor every morning
2. Between sweeps, the robot sits at a mid-corridor dock (like a vacuum parked in a hallway alcove)
3. A small sign on the robot reads: *"Accelerate Robotics — Residences Monitor & Cleaner"*
4. Hallway signage describes the monitoring scope and how to reach building ops
5. The resident's HOA newsletter has a standing "Robot Report" section showing cleanliness stats and alert summary for the month
6. If something goes wrong — package in the hall, water on the floor, unit alarm going off — the resident finds out from building ops the same day instead of a week later

The robot is **visible, labeled, and explainable**. The value proposition is direct: the corridor is cleaner, issues are caught faster, and the building runs smoother.

---

## Commercial treatment

The residences monitoring capability is **priced separately** from cleaning:

- **Base price** — same RaaS rate as any C30 ($10.50/hour per robot) for cleaning
- **Monitoring add-on** — flat monthly fee per residences corridor, covering:
  - Alert routing and orchestration
  - Dashboard access for residences ops
  - Monthly and quarterly incident review reports
  - On-call response for critical alerts
- **Implementation fee** — one-time for the HOA review process, resident disclosure materials, and legal review support

Exact add-on pricing is a proposal-level discussion. See [`proposal.md`](proposal.md).

### If the HOA declines monitoring

The C30 #2 robot still runs as a pure cleaning deployment at the standard RaaS rate. The deployment loses the monitoring add-on revenue but the hardware stays in place and the cleaning value is delivered. **The HOA should view monitoring as a separate service, not a mandatory add-on.**

---

## Why Accelerate Robotics should push this even though it's harder

1. **Differentiation.** No competitor is selling corridor monitoring as part of a cleaning robot deployment. This is our category definition moment.
2. **Reference-able use case.** A residences monitoring deployment is a story other mixed-use properties will want to hear about. Every hotel with attached condos is a potential customer.
3. **Platform value proof.** Monitoring is exactly the kind of capability that lives in the **orchestration layer**, not the robot. It's our business model in action — one brain, many signals.
4. **Safety positioning.** This ties directly to Atlas Mobility's "patient sensing" narrative. Passive monitoring for early detection is our home turf.
5. **Operational data.** The alerts become training data for future deployments. Every package-in-hallway, every water leak, every noise complaint teaches the platform what "normal" looks like in a residences environment.

---

## Related

- [`fleet-composition.md`](fleet-composition.md) — full 7-robot fleet plan
- [`proposal.md`](proposal.md) — commercial proposal
- [`../../30-integrations/robots/keenon-c30.md`](../../30-integrations/robots/keenon-c30.md) — C30 base specs
- [`../../10-strategy/narrative.md`](../../10-strategy/narrative.md) — "support, not replacement" positioning
- [`../../60-roadmap/open-questions.md`](../../60-roadmap/open-questions.md) — platform monitoring is an open capability question
