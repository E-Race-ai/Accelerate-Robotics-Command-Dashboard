# Thesis Hotel — Commercial Proposal

**Prepared for:** The Thesis Hotel, Miami — GM, Head of Engineering, Facility Ops
**Prepared by:** Accelerate Robotics — Eric Race, Founder & CEO
**Date:** April 2026 (working draft)
**Status:** Internal reference document for the client-facing HTML proposal at [`../../../public/thesis-hotel-proposal.html`](../../../public/thesis-hotel-proposal.html)

---

## 1. Executive summary

The Thesis Hotel is Accelerate Robotics' first deployment site — a 10-story mixed-use hotel and residences property in Miami. This proposal covers a **7-robot coordinated fleet** rolled out across three phases over approximately six months, operated under a **Robot-as-a-Service (RaaS)** agreement with no capital outlay from the hotel.

### The fleet

| # | Robot | Role |
|---|---|---|
| 1 | Keenon C40 | Hard-floor cleaner — lobby, Restaurant 1, Restaurant 2, kitchen |
| 2 | Keenon C30 #1 | Carpet cleaner — guest floors 2–10 |
| 3 | Keenon C30 #2 | Carpet cleaner + corridor monitor — residences |
| 4 | Keenon W3 | Enclosed room delivery — amenities, room service |
| 5 | Keenon S100 | Bellhop luggage transport — lobby to rooms |
| 6 | Keenon S300 #1 | Dirty linens transport — guest floors to basement laundry |
| 7 | Keenon S300 #2 | Food transport — kitchen to upstairs pool deck |

See [`fleet-composition.md`](fleet-composition.md) for the detailed per-robot operational plan.

### The commercial structure

**Robot-as-a-Service, flat monthly rate.** The hotel pays one predictable number per robot per month; Accelerate Robotics provides hardware, deployment, training, software, maintenance, consumables, and support. No capital purchase, no multi-year lock-in, no variable billing.

### The phasing

- **Phase 1 (Month 1–2):** Thesis Hotel Phase 1 C30 pilot — one robot, guest-floor carpets, 30-day proof
- **Phase 2 (Month 2–4):** Elevator integration + full hotel-side fleet (C40, W3, S100, S300 #1)
- **Phase 3 (Month 4–6):** Residences C30 + food S300 + HOA monitoring capability (if approved)

### The value

**Flat RaaS cost (full fleet, steady state):** $19,950 / month ≈ $239,400 / year
**Equivalent hospitality labor displaced:** ~$29,800 / month (conservative) up to ~$45,800 / month (with overtime, weekends, turnover)
**Net operational savings:** ~$10,000–$26,000 per month
**Payback:** Immediate — no upfront investment, savings start Month 1 of full fleet

---

## 2. Context

### The site

The Thesis Hotel is a 10-story property in Miami. The building has three distinct environments sharing the same elevator infrastructure:

1. **Hotel — floors 4–10** — guest rooms and carpeted corridors
2. **Amenity and lobby levels — floors 1–3** — restaurants, lobby, bar, pool deck (upper level), back-of-house
3. **Residences wing** — separate corridors with longer-term occupants

The full deployment covers all three environments with a coordinated fleet. See [`site-survey.md`](site-survey.md) for floor plans and measurements.

### Why Accelerate Robotics

Three things:

1. **We integrate robots from any vendor, not just one.** Today's fleet is all Keenon, but the orchestration platform can add Pudu, Bear Robotics, Savioke, or future humanoids without rebuilding. You are buying a platform, not a hardware brand.
2. **We solve the elevator problem for a tenth of what the OEMs charge.** Our universal button emulator lets any robot operate the elevator without modifying the elevator firmware or signing a ThyssenKrupp API contract. This is what makes a 7-robot deployment across 10 floors economically viable. See [`phase-2-elevator.md`](phase-2-elevator.md).
3. **We're anchored in Miami and committed to getting this right.** This is our first site, which means it gets founder-level attention. You are not deal #47 — you are deal #1.

### What the robots do and don't do

**They do:**
- Clean floors
- Carry bags, linens, food, and amenities through the building
- Ride elevators autonomously
- Monitor corridors for anomalies (residences only, with consent)

**They don't:**
- Replace housekeeping, bell staff, front desk, or restaurant staff
- Enter guest rooms without a human
- Handle interpersonal guest service
- Make discretionary operational decisions

The robots handle the repetitive, injury-prone, transit-heavy tasks. Your staff handles everything else, with more time and energy for what actually matters to guests.

---

## 3. The 7-robot fleet

The fleet is designed around the natural rhythm of the property — meal service windows, housekeeping turnover, check-in peaks, pool service hours, overnight quiet time. Each robot has a dedicated role and a clear handoff with the human staff it works alongside.

### Quick reference

| # | Robot | Environment | Peak hours | Value proposition |
|---|---|---|---|---|
| 1 | **C40** | Lobby, Restaurant 1, Restaurant 2, Kitchen | 04:00–13:00 + 22:30–00:30 | Consistent, hotel-wide hard-floor cleaning without a labor shift |
| 2 | **C30 #1** | Hotel guest floors 2–10 | 06:00–21:00 | Carpets cleaned to standard every day, on a repeatable schedule |
| 3 | **C30 #2** | Residences wing | 05:00–07:00, 15:00–17:00 + passive monitor | Corridor cleanliness + anomaly detection for long-term occupants |
| 4 | **W3** | Hotel floors 4–10 | 24/7 on-demand | Privacy-respecting room delivery of amenities and room service |
| 5 | **S100** | Lobby ↔ guest rooms | Check-in peaks | Robotic bellhop — guest luggage from front desk to room |
| 6 | **S300 #1** | Guest floors ↔ basement | Turnover peaks | Replaces the longest physical-carry task housekeeping does |
| 7 | **S300 #2** | Kitchen ↔ pool deck | 10:00–21:00 | Frees the pool-deck attendant from elevator-running |

See [`fleet-composition.md`](fleet-composition.md) for the full day-by-day operational plan.

### The novel use case — residences monitoring

The residences C30 does double duty: it cleans the corridors daily, and between sweeps it sits at a mid-corridor observation dock and runs **passive anomaly detection**:

- Package or trash left in a hallway
- Water or liquid on the floor
- Noise exceeding a threshold from a unit
- Visual smoke or fire
- Resident down or prolonged stationary

**No new hardware is required** — the C30's existing sensors handle everything. The intelligence lives in the Accelerate Robotics orchestration platform.

This capability is **optional and requires HOA approval**. If the HOA declines, the residences C30 runs as a pure cleaning deployment at the standard RaaS rate. See [`residences-use-case.md`](residences-use-case.md) for the full treatment including privacy, liability, and the detection-class catalog.

---

## 4. Phased deployment plan

### Phase 1 — Cleaning Proof (Month 1–2)

**Goal:** Prove the platform can operate at Thesis Hotel without incident. Build trust with staff. Generate the first real ROI data.

**Scope:**
- Robot #2 — Keenon C30 #1 on hotel guest-floor carpets
- 30-day monitored pilot
- Daily operation with housekeeping as primary operator
- Pre- and post-deployment labor audit

**Success criteria:**
- ≥ 90% uptime across scheduled sessions
- Zero safety incidents
- ≥ 2 hours/day of housekeeping labor reclaimed
- Positive housekeeping sentiment — the team wants to keep it
- ≤ 1 guest complaint related to the robot over 30 days

Details: [`phase-1-c30.md`](phase-1-c30.md).

### Phase 2 — Elevator Integration + Hotel-Side Fleet (Month 2–4)

**Goal:** Unlock multi-floor operation. Add the full hotel-side fleet.

**Scope:**
- Elevator integration via universal button emulator ([`phase-2-elevator.md`](phase-2-elevator.md))
- Add Robot #1 — Keenon C40 (downstairs hard floors)
- Add Robot #4 — Keenon W3 (room delivery)
- Add Robot #5 — Keenon S100 (luggage bellhop)
- Add Robot #6 — Keenon S300 #1 (dirty linens)

**Success criteria:**
- 20 consecutive successful elevator rides by the W3, supervised
- C40 completes the full restaurant-lobby-restaurant-kitchen route without incident
- S100 completes 20 supervised bellhop trips
- S300 #1 completes 20 supervised linens runs to the basement
- No guest complaints related to any new robot
- No safety incidents

### Phase 3 — Residences + Food + Monitoring (Month 4–6)

**Goal:** Complete the 7-robot fleet. Launch the monitoring capability (subject to HOA approval).

**Scope:**
- Add Robot #3 — Keenon C30 #2 (residences cleaning + monitoring)
- Add Robot #7 — Keenon S300 #2 (kitchen to pool-deck food transport)
- HOA review and sign-off on monitoring scope
- Resident disclosure and consent protocol
- Alert routing and on-call integration for critical events

**Success criteria:**
- Residences corridor cleaning operational with HOA and resident support
- Food delivery to pool deck operational without missed orders
- Monitoring capability running with appropriate privacy and alert scope (if approved)
- First month of residences alert data reviewed with HOA

---

## 5. Investment summary

### Pricing structure

**Robot-as-a-Service — $2,850 per robot per month**, all-inclusive, flat rate.

One predictable line item per robot per month. No hourly meters, no utilization-based true-ups, no surprise variable bills — the hotel knows exactly what next month looks like.

"All-inclusive" means:

- Robot hardware (on our balance sheet, not yours)
- Deployment and commissioning (site survey, SLAM mapping, training)
- Elevator integration (button emulator install + operation)
- Ongoing fleet management software
- 24/7 remote monitoring and on-call response
- Scheduled preventive maintenance
- Consumables (brushes, filters, squeegee, mop pads, etc.)
- Break-fix repair
- Loaner robot if a primary is out for repair
- Extended warranty beyond the Keenon manufacturer coverage
- Annual safety inspection and reporting
- Monthly business review and performance reporting

### Pilot discount (Phase 1 only)

**$2,300 per robot per month** for the 30-day Phase 1 pilot — a 19% discount against the standard rate, intended to lower the barrier to getting started. Pricing returns to $2,850/mo at the start of Phase 2.

### Monthly cost by phase

| Phase | Months | Robots added | Fleet size | Monthly cost | Rate |
|---|---|---|---|---|---|
| **Phase 1 — pilot** | Month 1 | 1 × C30 | 1 | **$2,300** | Pilot |
| **Phase 2 — ramp** | Month 2–3 | +C40, W3, S100, S300 #1 | 5 | **$14,250** | $2,850/robot/mo |
| **Phase 3 — full fleet** | Month 4+ | +C30 #2, S300 #2 | 7 | **$19,950** | $2,850/robot/mo |

**Steady-state (Phase 3 onward):** $19,950 / month
**Annualized full-fleet cost:** ~$239,400 / year

Year 1 ramped total lands around $210,000 — the hotel only pays for 5 robots in Phase 2 and one robot in the Phase 1 pilot month. Once the fleet is fully deployed in Month 4, the steady-state monthly cost is $19,950, and the hotel can plan around that number indefinitely.

*(Flat monthly rates. Robots added or removed at phase boundaries prorate to the day. No variable billing.)*

### Comparison to current labor cost

Target labor displaced by the 7-robot fleet (conservative estimates):

| Robot | Current equivalent labor | Hours/day | Loaded cost/hr | Monthly cost |
|---|---|---|---|---|
| C40 | Overnight floor cleaner | 8 | $22 | $5,280 |
| C30 #1 | Daytime carpet cleaning rotation | 10 | $22 | $6,600 |
| C30 #2 | Residences cleaning + monitor | 4 active + on-call | $24 | $4,000 |
| W3 | After-hours amenity runs | 6 | $22 | $3,960 |
| S100 | Bellhop transfers | 5 | $18 | $2,700 |
| S300 #1 | Linens transit | 6 | $22 | $3,960 |
| S300 #2 | Pool kitchen runner | 5 | $22 | $3,300 |
| **Total human-labor equivalent** | | | | **~$29,800 / month** |

**Current equivalent labor:** ~$29,800 / month ≈ $357,600 / year (conservative, single-shift)
**Upper estimate with overtime, no-shows, benefits, comp claims, turnover, weekends:** ~$41,600–$45,800 / month ≈ $500,000–$550,000 / year

**Accelerate Robotics full fleet:** $19,950 / month ≈ $239,400 / year

**Net savings:** ~$10,000–$26,000 / month, or $118,000–$310,000 / year — with the higher end tied to the reality of how much premium hotels pay to cover nights, weekends, and last-minute staffing gaps.

### What the hotel does NOT pay for

- No robot purchase
- No software license purchase
- No elevator integration capital
- No deployment professional services fee (bundled into RaaS)
- No SLA fee (bundled into RaaS)
- No maintenance fee (bundled into RaaS)
- No consumables fee (bundled into RaaS)

The only extra costs are:

- **Basic site prep** — charging dock 110V outlets (if not already available), minor housekeeping closet adjustments for S300 bin access, signage for the residences monitoring
- **Network setup** — dedicated 2.4 GHz IoT SSID and VLAN (standard IT work; not a new purchase in most cases)

### Commitment terms

- **90-day minimum term** — covers Phase 1 pilot + start of Phase 2
- **30-day cancellation notice** after the 90-day minimum
- **No penalty** for cancellation after Month 3 — just return the robots
- **No long-term lock-in** — this is a service agreement, not a finance lease
- **Right-sizing** — the hotel can add or remove robots at phase boundaries with 30-day notice

---

## 6. What's included — Service Level Agreement

Every robot in the fleet is covered by the same SLA:

### Response times

| Event | Response | Resolution target |
|---|---|---|
| Robot offline or unresponsive | Acknowledgment within 15 min during business hours, 30 min off-hours | Remote restart within 1 hour; on-site visit within 4 hours if needed |
| Safety-related incident | Immediate acknowledgment 24/7 | On-site within 2 hours regardless of time |
| Cleaning or delivery quality issue | Next business hour | Root-cause within 1 business day |
| Scheduled maintenance | 7 days advance notice | Zero disruption to operation |
| Firmware update | 24 hours advance notice | Deployed outside service hours |

### Included services

- **24/7 remote monitoring** via the Accelerate Robotics operations console
- **On-call technical support** through a dedicated support line
- **Unlimited remote diagnostics** — we can debug most issues without sending anyone on site
- **Scheduled preventive maintenance** — every 6 months per manufacturer spec, executed on our schedule
- **Break-fix repair** — covered under the RaaS fee; no separate charges for repairs
- **Loaner robot availability** — when a robot needs service requiring removal, we supply a loaner of the same or compatible model so the hotel's coverage doesn't lapse
- **Extended warranty coverage beyond Keenon manufacturer warranty** — Accelerate Robotics covers the gap between the 12-month manufacturer warranty and the robot's service life
- **Consumables delivery** — brushes, filters, squeegee blades, mop pads, cleaning solution shipped on a scheduled replenishment cycle; no PO process needed
- **Annual safety inspection** — conducted by Keenon-certified technicians (Accelerate Robotics or Keenon after-sales), with written report delivered to the hotel GM

### Training (included)

Three-day on-site training as part of commissioning:

- **Day 1 — Site setup and mapping:** Facility walk-through, route planning, Wi-Fi verification, charging dock setup, workflow integration planning
- **Day 2 — Staff training and operations:** Hands-on use for housekeeping, front desk, facility ops; loading/unloading procedures for delivery robots; troubleshooting basics; live testing in real operating conditions
- **Day 3 — Optimization and launch:** Fine-tuning routes and schedules, operational best practices, performance testing during real service hours, final sign-off and readiness check

Ongoing training included: **one refresher session per quarter** or on staff turnover.

### Performance reporting

**Monthly business review** with the GM and/or Head of Engineering:

- Uptime by robot
- Task completion statistics
- Labor hours reclaimed (estimated)
- Guest complaints or incidents (hopefully zero)
- Maintenance events
- Billing summary for the month
- Upcoming schedule and capacity changes

**Quarterly optimization review:**
- Route efficiency analysis
- Utilization trends
- Recommendations for schedule changes
- Expansion opportunities (new robots, new use cases)

---

## 7. What the hotel provides

**Site infrastructure:**
- 110V / 15A outlets at each charging dock location (7 docks total, full fleet)
- 2.4 GHz Wi-Fi coverage at ≥ -65 dBm across all robot routes
- Dedicated IoT SSID or VLAN for the robot fleet (no guest network)
- DHCP reservations for robot MAC addresses
- Back-of-house access for service visits

**Elevator access:**
- Permission for the Accelerate Robotics team plus the ThyssenKrupp authorized mechanic to install the button emulator in the elevator cab
- Temporary elevator out-of-service window (typically 2 hours per cab) during Phase 2 install
- Elevator service vendor contact and coordination

**Staffing:**
- Designated Head of Engineering and/or Facility Ops point of contact
- Housekeeping team willingness to work alongside the robots
- Front desk willingness to dispatch the S100 and W3
- Kitchen expediter coordination for the S300 food transport

**Access and security:**
- After-hours access to the kitchen for the C40 overnight cleaning window
- Back-of-house access to the basement laundry for the S300 #1
- Pool-deck access to the S300 #2 food carrier
- Residences HOA coordination for Robot #3 (required for monitoring capability)

**Insurance:**
- Hotel's general property insurance remains primary
- Accelerate Robotics carries commercial general liability and robot-specific equipment coverage

---

## 8. Risks and mitigations

The full risk register is in [`risk-register.md`](risk-register.md). Top risks for this proposal:

| Risk | Mitigation |
|---|---|
| **Phase 1 pilot fails publicly** | Conservative scope (one robot, one use case). Rollback plan — robot parked, housekeeping goes back to manual workflow. No public launch until Day 30 review. |
| **Elevator integration fails** | Button emulator is pre-bench-tested before install day. Keenon E-Box is the fallback. Worst case, install is reverted and we redesign. |
| **2.4 GHz Wi-Fi gotcha** | Mandatory pre-deployment Wi-Fi survey. IT runs the survey with us during site prep. If 2.4 GHz is absent, we install a dedicated IoT SSID before robots arrive. |
| **Housekeeping or staff pushback** | Framed as capacity expansion, not replacement. Staff included in pilot planning. Baseline labor data collected with the team, not done *to* them. |
| **HOA declines residences monitoring** | Residences C30 runs as cleaning-only at the standard rate. No penalty. Monitoring can be added later if HOA changes position. |
| **Guest interacts with a robot unsafely** | Signage, staff briefing, escalation SOP. All robots have emergency stops. Incident log maintained and reviewed. |
| **Elevator service contract blocks panel work** | Coordinated install with authorized ThyssenKrupp mechanic paid for the install window. Insurance coverage confirmed in advance. |
| **Robot damaged by staff or guest** | Accelerate Robotics carries coverage; incident response protocol; replacement plan. |

---

## 9. The ask

Three things from Thesis Hotel leadership:

1. **Sign the 90-day Phase 1 pilot agreement.** This is the low-commitment, high-evidence start. One robot, one use case, measurable outcomes.
2. **Commit to the 7-robot fleet if Phase 1 hits its success criteria.** We want to plan Phase 2 in parallel with running Phase 1. If Phase 1 fails the targets, we all walk away with no penalty.
3. **Introduce us to the HOA board.** The residences monitoring use case is unique to Thesis Hotel's mixed-use structure. An early HOA conversation lets us design the consent and privacy flow in parallel with Phase 1 and Phase 2, so Phase 3 is ready to go live when we're ready to commission it.

---

## 10. What happens next

**Week 1 — Signed pilot agreement**
- Pilot contract signed
- Kickoff meeting scheduled
- Site survey date confirmed

**Week 2 — Site survey and commissioning prep**
- Full property walk with Head of Engineering and Facility Ops
- Corridor measurements, threshold audit, Wi-Fi survey
- Elevator panel inspection with ThyssenKrupp service
- Network topology review with hotel IT
- Charging dock locations confirmed
- HOA introductory meeting scheduled (for Phase 3 planning)

**Week 3 — Phase 1 commissioning**
- First C30 robot delivered and installed
- SLAM mapping on target guest floors
- Housekeeping training session (1 hour)
- Pre-deployment baseline capture (labor hours, current state)
- Day 1 go-live

**Week 4–6 — Phase 1 pilot operation**
- Robot operates under supervision
- Daily check-ins for Week 1, weekly thereafter
- Incident log maintained
- Data captured against success criteria

**Week 7 — Day 30 review**
- Retrospective meeting with GM, Head of Engineering, Facility Ops
- Decision on Phase 2 go/no-go
- If go: Phase 2 contract amendment signed, fleet expansion begins

---

## 11. Contact

**Eric Race** — Founder & CEO, Accelerate Robotics
eric@acceleraterobotics.ai *(placeholder — confirm before sharing)*
Miami, Florida

Deployment coordination, field service, and on-call escalation all flow through Eric during Phase 1 and Phase 2 of Thesis Hotel. As the fleet expands beyond this site, named roles will be assigned for field service and customer success, but for the first 90 days you have direct founder access.

---

## Appendices

| Appendix | Location |
|---|---|
| A. Robot spec sheets | [`../../30-integrations/robots/`](../../30-integrations/robots/) |
| B. Fleet composition and routing | [`fleet-composition.md`](fleet-composition.md) |
| C. Site survey | [`site-survey.md`](site-survey.md) |
| D. Phase 1 pilot plan | [`phase-1-c30.md`](phase-1-c30.md) |
| E. Phase 2 elevator integration plan | [`phase-2-elevator.md`](phase-2-elevator.md) |
| F. Residences monitoring use case | [`residences-use-case.md`](residences-use-case.md) |
| G. Risk register | [`risk-register.md`](risk-register.md) |
| H. Pre-deployment checklist | [`checklist.md`](checklist.md) |
| I. Pricing model (detailed unit economics) | [`../../../public/pricing-model.html`](../../../public/pricing-model.html) |
| J. Client-facing proposal (print) | [`../../../public/thesis-hotel-proposal.html`](../../../public/thesis-hotel-proposal.html) |
