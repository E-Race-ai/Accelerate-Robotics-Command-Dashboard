# Accelerate Robotics — Business Plan

**Working draft · Q2 2026**

A single document that pulls together what Accelerate Robotics is, why it exists, how it makes money, and how it gets from where we are today (one signed pilot) to where we're going (the operating system for hospital and hospitality robotics).

This is the master plan. It's meant to be read front-to-back by a new team member, an investor, or a partner. Individual sections link out to the deeper docs in `docs/` where the details live.

---

## 1. Executive summary

**Accelerate Robotics is the orchestration platform for multi-vendor robot fleets in hospitality and healthcare.** One brain, many bots.

Hospitals and hotels are deploying robots from dozens of vendors — Keenon, Pudu, Bear Robotics, Diligent, Aethon, Savioke, and soon humanoids from Figure, 1X, Agility, Apptronik. Left alone, each deployment is a siloed vendor relationship with its own app, its own training, its own service contract. **The winner is whoever provides the software layer that makes all of those robots behave as one coordinated workforce.**

We're starting in hospitality — because it has lower regulatory risk, clearer ROI, and a customer who already understands labor costs — and earning our way into healthcare. Our first deployment is **The Thesis Hotel in Miami**: a 10-story mixed-use hotel and residence property rolling out a **7-robot fleet** across cleaning, delivery, and logistics. See [`../40-deployments/thesis-hotel/proposal.md`](../40-deployments/thesis-hotel/proposal.md).

### Why now

- **Labor crisis is structural.** Hospitals spent $24B+ on travel nurses in 2022. Hotels lose 73–75% of housekeeping staff annually. The labor market isn't returning.
- **Hardware is ready.** Keenon, Pudu, Bear, and others ship capable commercial robots today. Customers don't need new robots — they need someone to run them.
- **Platform capital is flowing.** Bedrock Robotics raised $270M Series B (Capital G, NVIDIA Ventures) to coordinate **construction** robot fleets. The exact same thesis, in an adjacent vertical. Hospitals are bigger, harder, and more valuable. See [`market-landscape.md`](market-landscape.md).
- **Elevator integration is unsolved.** Every robot vendor solves it one-off. Our **universal button emulator** at ~$23/floor BOM undercuts $5K–$15K OEM API integrations by two orders of magnitude. This is the wedge that gets us inside buildings. See [`../30-integrations/elevator/button-emulator.md`](../30-integrations/elevator/button-emulator.md).
- **We already have healthcare distribution.** Eric's Atlas Mobility operates inside hospitals today — a relationship moat most robotics startups don't have.

### What we sell

1. **Robot-as-a-Service (RaaS).** All-inclusive monthly fee per robot — hardware, deployment, training, software, maintenance, consumables, support.
2. **Implementation services.** Site survey, SLAM mapping, commissioning, elevator integration, workflow design, operator training.
3. **Orchestration software.** Per-robot SaaS layer for multi-vendor fleet management, task routing, and analytics. Platform value grows with fleet size.
4. **Hardware products.** The **Universal Button Emulator** (our first own-IP product). Future hardware as the platform discovers gaps.

### Where we're going

- **2026 Q2–Q3:** Thesis Hotel 7-robot deployment. First revenue. First reference customer.
- **2026 Q4–2027 Q1:** Two more hospitality reference sites in Miami. Begin first hospital pilot.
- **2027:** Ten sites under management. Open architecture proven across at least two robot vendors.
- **2028:** Multi-hospital healthcare system contract. Humanoid partnership pilot begins.

See [`phased-approach.md`](phased-approach.md) for the full phasing logic and [`../60-roadmap/current-quarter.md`](../60-roadmap/current-quarter.md) for the active quarter.

---

## 2. Problem

### Hospitals

1. **Workforce shortages.** Persistent labor gaps in nursing, environmental services, logistics, and support. U.S. hospitals spent over $24B on travel nurses alone in 2022.
2. **Worker injuries.** Healthcare workers have one of the highest occupational injury rates in the country. Most of it is lifting, transferring, and repetitive movement. Worker's compensation claims and nurse turnover compound the labor crunch.
3. **Clinical time leak.** Manual logistics — linens, meals, supplies, pharmacy transport, equipment returns — consume clinical time that should be at the bedside. Every hour a nurse spends pushing a cart is an hour not spent on patient care.
4. **Preventable patient harm.** Hospital-Acquired Pressure Injuries ($26.8B/yr, 95% preventable), falls ($34B/yr), ventilator-associated pneumonia, and immobility complications kill tens of thousands annually.

### Hotels and resorts

1. **Housekeeping labor is the largest controllable operating expense** and has the highest turnover of any hotel role. Midscale and upscale hotels see 73–75% annual housekeeping turnover.
2. **Service quality slips with understaffing.** Guest-satisfaction scores, online reviews, and RevPAR all correlate with housekeeping reliability.
3. **Worker's compensation claims** from repetitive lifting, pushing linen carts, and cleaning chemical exposure are significant and underreported.
4. **Late-night amenities are a gap.** Front desk can't leave the lobby to run a hair dryer to room 812 at midnight — but the robot can.

### The common thread

Both industries suffer from the same pattern: **work that can't be automated by a single robot gets stranded in "we still need a human."** The limiting factor isn't the robot — it's the orchestration. Who tells the robot to go? Who handles the exception? Who manages a mixed fleet? Who integrates with the elevator, the room management system, the PMS, the EMR?

That gap is the business.

---

## 3. Thesis

**"One brain, many bots"** — the long-term value in healthcare and hospitality robotics sits in the software layer that coordinates fleets of robots across vendors, not in manufacturing any single robot.

A hospital or hotel signing up for Accelerate Robotics gets:

- **One portal** to manage every robot, regardless of manufacturer
- **One set of workflows** that route tasks to whichever robot can do the job
- **One integration** with the facility (elevators, EMR, PMS, facilities, access control)
- **One source** of analytics, compliance, and ROI measurement

The individual robot becomes a commodity. The orchestration layer is the moat. See [`thesis.md`](thesis.md) for the full strategic argument.

### Why this is the right shape of company

1. **Vendor neutrality compounds.** Every point-solution competitor is betting on one robot; we're betting on the platform that runs all of them. As new hardware ships (especially humanoids), we integrate them — competitors have to rebuild from scratch.
2. **Elevator wedge is unique.** Our $23/floor button emulator undercuts OEM cloud APIs by 100x and works with any robot vendor. No competitor has this.
3. **Healthcare domain depth.** Atlas Mobility gives us working relationships and clinical credibility in healthcare that pure-play robotics startups don't have.
4. **Software moat is real.** Task routing, compliance logs, multi-tenant fleet management, ROI reporting — these are the hospital's operational system of record. Once installed, switching cost is measured in months.

---

## 4. Market

### Total addressable market

| Segment | Size | Notes |
|---|---|---|
| U.S. hospitals | 6,120 hospitals, ~924K beds | Primary long-term target |
| U.S. hotels | 54,000 hotels, ~5.3M rooms | Beachhead vertical |
| U.S. senior living | 30,000+ facilities | Fast-follow after hospitals |
| Clinical labs, imaging centers | 260,000+ | Adjacent |
| Mixed-use residential | Large, fragmented | New use case discovered at Thesis Hotel |

Global is 3–5x U.S. by facility count. LatAm (where Eric already has distribution) and Europe are both strong secondary markets.

### Funding signals

The Bedrock Robotics $270M Series B (Capital G + NVIDIA Ventures) validates that the platform-orchestration thesis is well-funded in **construction**. Hospitals are a larger, stickier vertical with more regulatory friction — meaning a deeper moat once established.

Adjacent funding:

| Company | Round | Amount | What it tells us |
|---|---|---|---|
| Figure AI | Series B | $675M at $2.6B | Humanoid hardware is fundable |
| 1X Technologies | Series C | $100M | Second humanoid mover |
| Bedrock Robotics | Series B | $270M | Platform thesis is the winning shape |
| Keenon | Series D+ | $200M | Our hardware supplier is well-capitalized |
| Pudu | Series C | $150M | Direct Keenon competitor — gives us pricing leverage |

See [`market-landscape.md`](market-landscape.md) for the full competitive map.

### Competition

**Direct competitors (hospital robotics orchestration):**
- Diligent Robotics — Moxi; closed ecosystem (one robot, one vendor). We differentiate on vendor neutrality.
- Aethon — TUG robot; acquired by ST Engineering. Closed hardware.
- Pudu / Keenon — hardware-first, no meaningful multi-vendor orchestration.

**Indirect competitors (elevator integration):**
- Keenon E-Box — works only with Keenon robots.
- Golerobotics EVW-1 — CES 2026 winner, closest commercial analog to our button emulator. Watch closely.
- KONE / Otis / Schindler cloud APIs — expensive, building-specific, OEM-gated.

**Adjacent partners (not competitors):**
- Atlas Mobility — our Phase 1.5 patient-sensing category
- Figure / 1X / Agility / Apptronik / Tesla Optimus — future humanoid suppliers

---

## 5. Product

### Three layers

**1. Hardware (initially, other people's hardware)**

We resell and lease commercial robots from **Keenon** (Phase 1 primary), with expansion to Pudu, Bear Robotics, and humanoid suppliers as the platform matures. Our value-add is not the robot — it's everything around it.

**Our own hardware:**
- **Universal Button Emulator** (shipping Q2 2026) — $23/floor BOM, BLE + LoRa, enables any robot to operate any elevator without OEM API. See [`../30-integrations/elevator/button-emulator.md`](../30-integrations/elevator/button-emulator.md) and ADR-0005.
- Future hardware as the platform discovers gaps.

**2. Services**

- **Site survey and design** — corridor measurement, threshold audit, Wi-Fi survey, elevator assessment, charging location planning
- **Implementation** — SLAM mapping, route creation, commissioning, staff training, handover
- **Elevator integration** — button emulator install, BLE pairing, end-to-end ride testing
- **Ongoing managed fleet operations** — remote monitoring, exception handling, fleet optimization, on-call escalation
- **Outsourced robotics department** — full turnkey for customers who want zero internal robotics headcount

**3. Software**

- **Fleet management** — real-time position, health, battery, task state for every robot
- **Workflow orchestration** — task routing by robot capability, priority, location, utilization
- **Elevator integration SaaS** — per-elevator/month subscription layered on top of the button emulator
- **Analytics and ROI reporting** — labor hours reclaimed, task completion, uptime, cost-per-task
- **Multi-tenant visibility** — for hospital systems and hotel brands running 10+ properties
- **Compliance and safety** — auditable logs, incident tracking, regulatory reporting (HIPAA-adjacent, ASME)

### Technical architecture

- **Monolith today** — Node.js/Express + SQLite — because we're pre-scale and simple wins
- **Vendor-agnostic adapter layer** — the core platform doesn't care who made the robot; adapters map fleet calls to each vendor's SDK (or lack thereof — Keenon has no public API, so we integrate through the mobile app, DynaSky Cloud, and E-Box)
- **Button emulator** — standalone embedded device (ESP32-C3 + OMRON SSRs + Pololu buck), communicates over BLE primary / LoRa fallback, no cloud dependency
- **Landing page + admin** — marketing site, inquiry capture, admin console (JWT in httpOnly cookie, bcrypt passwords, rate-limited public endpoints)

See [`../20-architecture/`](../20-architecture/) for the technical details and ADRs.

---

## 6. Business model

### Revenue streams

| Stream | What | Why it matters |
|---|---|---|
| **Robot-as-a-Service (RaaS)** | All-inclusive monthly fee per robot | Primary revenue; predictable, sticky |
| **Implementation services** | One-time fees for site survey, mapping, training, elevator install | Gross margin on services plus customer commitment |
| **Orchestration software** | Per-robot/month SaaS fee | Highest-margin revenue; compounds with fleet size |
| **Hardware products** | Button emulator (~$500–$1,500 installed per floor) | Own-IP, high margin, wedge product |
| **Managed operations** | Remote fleet supervision + exception handling | Ongoing services revenue |
| **Advertising on robots** | Pharma, amenity, hotel brand messages on robot displays | Future high-margin revenue; not a Phase 1 priority |
| **Data insights** | De-identified operational data to insurers, researchers, vendors | Future revenue; needs scale |

Detailed streams in [`business-model.md`](business-model.md).

### Pricing philosophy

**Price below the cost of the labor we displace**, with enough margin to scale the business. Today's target: **50% gross margin** at 75% utilization, yielding approximately **$10.50/hour per robot** in RaaS pricing. That's ~50% below the loaded labor cost of the cheapest hourly hospitality worker.

See the detailed pricing model in [`../../public/pricing-model.html`](../../public/pricing-model.html) — per-robot cost buildup ($1,422/month all-in), three pricing structures (hourly, daily, monthly fleet), sensitivity analysis, and breakeven.

### Unit economics (per robot, today)

| Line item | Monthly cost |
|---|---|
| Hardware depreciation (36-month lease basis) | $403 |
| Consumables (brushes, filters, detergent) | $135 |
| Maintenance and repair reserve | $121 |
| Software and connectivity | $50 |
| Electricity | $25 |
| Allocated management labor | $625 |
| Insurance allocation | $63 |
| **Total cost per robot per month** | **$1,422** |
| **Revenue at $10.50/hour × 270 billable hours** | **$2,835** |
| **Gross profit per robot per month** | **$1,413** |
| **Gross margin** | **49.8%** |

At scale, management labor per robot compresses (one ops person covers more robots), hardware drops (direct Keenon wholesale), and margins climb toward 60%+.

### Customer economics

What the customer sees at Thesis Hotel (7 robots, Year 1):

- **Annual cost:** ~$238K at $10.50/hr blended rate
- **Labor displaced:** Equivalent of 7–10 full-time hospitality roles at $22–28 loaded/hr
- **Labor cost avoided:** ~$400K–$550K/year
- **Net savings:** ~$160K–$310K/year
- **Payback:** The ROI is immediate in Year 1; no upfront capital

See the full Thesis Hotel proposal in [`../40-deployments/thesis-hotel/proposal.md`](../40-deployments/thesis-hotel/proposal.md) for the deployment-specific economics.

---

## 7. Go-to-market

### Phase 1 — Beachhead (NOW)

**Target:** Independently owned boutique and full-service hotels in Miami and South Florida. Friendly, fast-moving, high-touch. Owner or GM makes the decision.

**Sales motion:** Direct, founder-led. Site walk → custom proposal → pilot contract. No channel partners yet.

**Playbook:**
1. Warm intro through Eric's network (Atlas Mobility, Arjo, hospitality contacts)
2. Site walk + one-pager share ([`../../public/thesis-hotel-onepager.html`](../../public/thesis-hotel-onepager.html))
3. Proposal meeting with GM + Head of Engineering + Facility Ops
4. 30-day Phase 1 pilot with clear success metrics
5. Expansion into full fleet on Phase 1 success

**Current state:** Thesis Hotel is the first. Two more Miami conversations are warm.

### Phase 2 — Reference Expansion (Q4 2026 – Q1 2027)

Three to five reference sites across Miami hospitality. Cases studies, press, investor readiness.

**Beginning healthcare:** First hospital pilot through an Atlas Mobility relationship.

### Phase 3 — Healthcare System Entry (2027)

Signed multi-property contract with one regional health system. This is where the orchestration thesis gets its real test — one software layer, multiple hospitals, multiple robot vendors.

### Phase 4 — Humanoids (2028+)

Partnership with one of Figure / 1X / Agility / Apptronik / Tesla for a pilot of patient-assistive humanoid tasks — lifting, positioning, mobilization. FDA Class II or III pathway. Long horizon, high moat.

See [`phased-approach.md`](phased-approach.md) for the full progression logic.

### Narrative — "Support, not replacement"

We never pitch robots as labor replacement. The positioning is:

> "Robots handle the repetitive, injury-prone work so staff can spend more time with guests and patients."

This is both strategically correct (healthcare workers are our users, not our adversaries) and ethically correct (the labor shortage is structural — capacity expansion, not headcount cuts). See [`narrative.md`](narrative.md) for the full positioning.

---

## 8. Operations

### Today's team

- **Eric Race** — Founder/CEO. Runs sales, partnerships, domain strategy. Parallel: Founder/CEO of Atlas Mobility.
- **Engineering / product** — contractor and advisor network; first full-time hire is a platform engineer expected late 2026.
- **Field service** — Eric today; will formalize as the fleet passes 10 robots under management.
- **Advisors** — domain experts from healthcare, hospitality, robotics, and business (see [`../00-overview/team.md`](../00-overview/team.md)).

### How we deliver

1. **Site survey and design** — 1-day on-site walk, photos, measurements, proposal
2. **Implementation** — 1–3 weeks per site depending on robot count and elevator scope
3. **Managed operations** — remote monitoring with on-call escalation; on-site visits only for exceptions and scheduled maintenance
4. **Customer success** — monthly business review with GM or Head of Engineering, quarterly fleet optimization

### Infrastructure

- **Monolith web application** — landing page, inquiry capture, admin console, stocks dashboard
- **Development environment** — local Node.js/Express + SQLite; one production server; one staging (future)
- **Source of truth** — this repository. Everything is committed, reviewed, and version-controlled. See [`CLAUDE.md`](../../CLAUDE.md).

See [`../50-operations/`](../50-operations/) for environments, runbooks, and on-call.

---

## 9. Financial plan

**For the full financial analysis** — unit economics, three-year forecast, P&L, cash-flow projections, capital use, financing strategy, sensitivity analysis — see [`financial-analysis.md`](financial-analysis.md). This section is the summary.

### Current quarter (Q2 2026)

- **Must ship:** Thesis Hotel Phase 1 (C30 pilot). First signed pilot agreement. First revenue.
- **Should ship:** Thesis Hotel Phase 2 elevator install. Site survey for customer #2.
- **Can defer:** Humanoid partnership conversations; multi-tenant dashboard.

See [`../60-roadmap/current-quarter.md`](../60-roadmap/current-quarter.md).

### Capital requirements (first 18 months)

| Milestone | Fleet capex | Implementation | Other | Total |
|---|---|---|---|---|
| Thesis Hotel Phase 1 (2 bots pilot) | $27K | $10K | — | $37K |
| Thesis Hotel full 7-bot fleet | ~$115K | ~$20K | ~$15K | ~$150K |
| Three additional reference hotels | ~$350K | ~$50K | ~$25K | ~$425K |
| First hospital pilot | ~$80K | ~$30K | ~$15K | ~$125K |
| G&A, engineering, ops reserve (18 mo) | — | — | ~$500K | ~$500K |
| **Total 18-month capital need** | **~$572K** | **~$110K** | **~$555K** | **~$1.2M** |

*(These are planning numbers. Hardware costs are at expected distributor pricing; direct Keenon wholesale could reduce hardware by 20–40%.)*

### Revenue projections

| Milestone | Bots under management | Annual revenue | Gross margin |
|---|---|---|---|
| **End Q2 2026** — Thesis Hotel pilot | 2 | ~$50K ARR | 38% (pilot discount) |
| **End Q4 2026** — Thesis Hotel full | 7 | ~$240K ARR | 50% |
| **End Q2 2027** — 4 reference sites | ~24 | ~$820K ARR | 50%+ |
| **End Q4 2027** — first hospital added | ~35 | ~$1.2M ARR | 50%+ |
| **End 2028** — 10 sites, 1 hospital system | ~80 | ~$2.7M ARR | 55%+ |

See the sensitivity analysis in [`../../public/pricing-model.html`](../../public/pricing-model.html) — the model holds up across bear, base, and bull utilization scenarios.

### Path to profitability

Gross-margin profitability is immediate (Year 1, even at pilot discount). **Net profitability crosses at ~20 robots under management** — that's when management labor ($2,500/month allocated across the fleet) and fixed overhead are covered by RaaS margin. At Thesis Hotel alone we're at 7 bots; two more reference hotels puts us comfortably net-positive.

---

## 10. Risks and mitigations

### Strategic risks

| Risk | Impact | Mitigation |
|---|---|---|
| Bedrock or a well-funded competitor pivots into hospital robotics before we can establish | High | Move fast on healthcare reference; Atlas Mobility gives us a 12-month head start on distribution |
| Keenon withdraws from U.S. distribution or changes pricing | High | Multi-vendor adapter from day one; Pudu, Bear, Savioke are all viable Plan B |
| FDA or state regulator classifies orchestration software as a medical device | Medium | Start in hospitality (no FDA exposure); healthcare deployment limited to non-clinical logistics until we have a regulatory path |

### Operational risks

| Risk | Impact | Mitigation |
|---|---|---|
| Thesis Hotel Phase 1 fails publicly | High | Conservative scope (one C30, one use case); rollback plan; no big launch until day-30 review |
| Elevator integration fails at install | High | Bench-test every board before install day; Keenon E-Box as fallback; mechanical pass-through as last resort |
| 2.4 GHz Wi-Fi gotcha at a deployment site | High | Pre-deployment WiFi survey mandatory; 2.4 GHz IoT SSID as standard requirement in contract |
| Customer concentration in first year | High | Aggressive pipeline development; no more than 60% of revenue from any one customer |

### Financial risks

| Risk | Impact | Mitigation |
|---|---|---|
| Fleet capex exceeds budget as we scale | High | Keep RaaS financed (hardware on our balance sheet only as needed); pursue direct Keenon wholesale relationship for margin |
| Payback period extends past 24 months | Medium | Tight utilization management; pilot-pricing-only for first 90 days; full pricing after proof |

See [`../60-roadmap/open-questions.md`](../60-roadmap/open-questions.md) for unresolved strategic questions.

---

## 11. Milestones

**2026 Q2**
- [ ] Thesis Hotel Phase 1 pilot signed
- [ ] Phase 1 go-live (C30 deployment)
- [ ] Phase 1 day-30 review

**2026 Q3**
- [ ] Thesis Hotel Phase 2 elevator install
- [ ] Full 7-robot Thesis Hotel deployment complete
- [ ] Second hospitality customer under letter of intent

**2026 Q4**
- [ ] Three hospitality sites under management
- [ ] First hospital pilot signed (Atlas Mobility channel)
- [ ] First full-time engineering hire

**2027**
- [ ] Ten sites under management
- [ ] Healthcare system pilot contract signed
- [ ] Orchestration platform V2 shipped (multi-tenant, multi-vendor)
- [ ] Press and investor readiness

**2028**
- [ ] 20+ sites under management
- [ ] First humanoid partnership pilot
- [ ] Series A raised

---

## 12. Why we win

1. **Vendor neutrality** — we're the platform, not the product. Every new robot category adds value to us; most competitors lose with new categories.
2. **Elevator wedge** — $23/floor undercuts the industry by 100x. First customers pay for button emulator; platform sells itself.
3. **Healthcare channel** — Atlas Mobility gives us inside-the-hospital relationships pure-play robotics startups can't buy.
4. **Clinical credibility** — Eric's background (firefighter → lift technician → Atlas founder) plus Atlas KOL relationships make the "robots for patient safety" pitch credible.
5. **Miami geography** — outside the SF robotics bubble, closer to Southeast U.S. health systems, LatAm markets, and direct Keenon air-freight. See ADR-0004.
6. **Speed and capital discipline** — monolith architecture, lean ops, direct sales. We don't need to raise $100M to prove the thesis — Thesis Hotel proves it on $1M.

---

## Related documents

### Strategy
- [`thesis.md`](thesis.md) — core strategic thesis
- [`market-landscape.md`](market-landscape.md) — competitors, funding signals, positioning
- [`business-model.md`](business-model.md) — detailed revenue streams
- [`phased-approach.md`](phased-approach.md) — Phase 1 → Phase 3 rollout
- [`narrative.md`](narrative.md) — "support, not replacement" positioning

### Deployments
- [`../40-deployments/thesis-hotel/proposal.md`](../40-deployments/thesis-hotel/proposal.md) — full Thesis Hotel proposal
- [`../40-deployments/thesis-hotel/fleet-composition.md`](../40-deployments/thesis-hotel/fleet-composition.md) — 7-robot fleet operational plan
- [`../40-deployments/playbook.md`](../40-deployments/playbook.md) — reusable deployment playbook

### Pricing and unit economics
- [`../../public/pricing-model.html`](../../public/pricing-model.html) — print-ready pricing model
- [`../../public/thesis-hotel-proposal.html`](../../public/thesis-hotel-proposal.html) — print-ready Thesis Hotel proposal

### Roadmap
- [`../60-roadmap/current-quarter.md`](../60-roadmap/current-quarter.md)
- [`../60-roadmap/backlog.md`](../60-roadmap/backlog.md)
- [`../60-roadmap/open-questions.md`](../60-roadmap/open-questions.md)

### Architecture
- [`../20-architecture/`](../20-architecture/) — platform architecture
- [`../20-architecture/adr/`](../20-architecture/adr/) — decision records
