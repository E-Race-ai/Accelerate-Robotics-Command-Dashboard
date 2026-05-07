# Thesis Hotel — Fleet Composition

The 7-robot deployment plan. This doc is the operational core of the [Thesis Hotel proposal](proposal.md) — which robot does what, when, where, and how the shifts interlock so the fleet behaves as a single coordinated workforce.

**One sentence:** One C40 runs downstairs hard floors, two C30s run carpets (guest floors plus residences), one W3 runs room delivery, one S100 runs luggage, and two S300s run linens and pool-deck food — all coordinated through Accelerate Robotics.

---

## Fleet at a glance

| # | Robot | Role | Primary environment | Shift pattern |
|---|---|---|---|---|
| 1 | **Keenon C40** | Hard-floor cleaner (sweep + scrub + mop) | Lobby, Restaurant 1, Restaurant 2, Kitchen | Overnight + pre-service mornings |
| 2 | **Keenon C30 #1** | Carpet cleaner | Guest floors 2–10 (hotel) | Daily mornings, mid-afternoon touch-up |
| 3 | **Keenon C30 #2** | Carpet cleaner + hallway monitor | Residences (separate wing/tower) | Scheduled sweeps + continuous passive monitoring |
| 4 | **Keenon W3** | Enclosed room delivery | Hotel guest floors 4–10, lobby to rooms | On-demand, 24/7 |
| 5 | **Keenon S100** | Bellhop luggage transport | Lobby to guest rooms | On-demand during check-in/out windows |
| 6 | **Keenon S300 #1** | Dirty linens transport | Guest floors → basement laundry | Peak turnover hours + hourly off-peak |
| 7 | **Keenon S300 #2** | Food transport | Kitchen → upstairs pool deck | Pool service hours (10 AM – 8 PM) |

**Total: 7 robots across 4 Keenon product families (C-series, W-series, S-series).**

See [`../../30-integrations/robots/`](../../30-integrations/robots/) for individual spec sheets.

---

## Robot #1 — Keenon C40 (Downstairs Hard-Floor Workhorse)

The single robot responsible for every hard floor in the property below the guest floors. Route is deliberately sequenced around food service windows.

### Daily route

| Time | Environment | Mode | Duration |
|---|---|---|---|
| 04:00 – 05:30 | **Restaurant 1** — pre-breakfast sweep + wet scrub | Full cycle | 90 min |
| 05:30 – 07:30 | **Lobby** — sweep + dust-push, quiet mode | Fast cycle | 120 min |
| 07:30 – 09:00 | **Restaurant 2** — pre-lunch sweep + wet scrub | Full cycle | 90 min |
| 09:00 – 11:00 | **Charging + tank refresh** | — | 120 min |
| 11:00 – 13:00 | **Lobby touch-up** (high-traffic window) | Dust-push only | 120 min |
| 13:00 – 22:30 | **Idle at dock** (restaurants in service, guest-facing) | — | — |
| 22:30 – 00:30 | **Kitchen deep sweep + mop** (after kitchen close) | Full cycle | 120 min |
| 00:30 – 04:00 | **Charging + overnight standby** | — | — |

**Total active cleaning time:** ~8 hours/day
**Billable hours (at 75% utilization):** ~270 hours/month

### Why this sequence

- **Restaurants before service** — kitchen and front-of-house floors are cleanest right before opening; no guests in the room during the noisy wet scrub
- **Lobby in quiet mode during high-traffic** — dust-push is near-silent; perfect for the 11 AM – 1 PM guest flow
- **Kitchen at end of shift** — the only time of day the kitchen floor is accessible for a deep scrub; also the highest-contamination environment, so it gets its own dedicated cleaning cycle at the end
- **8-hour active window with a midday break** — fits the C40's 3–4 hour battery life and gives staff time to refill clean-water / dump dirty-water tanks

### Handoffs and constraints

- **Restaurant access keys** — Accelerate Robotics needs after-hours access to Restaurant 1, Restaurant 2, and the kitchen. GM assigns this to the Facility Ops lead during commissioning.
- **Water supply** — clean-water tank top-up location must be identified (kitchen mop sink is the most likely candidate). Dirty-water dump must route to a floor drain. Both locations go in the commissioning plan.
- **Noise curfew** — wet scrub mode is loud; no wet cycles within 50 feet of any guest room after 10 PM. Lobby late-night cycles are dust-push only.

See [`../../30-integrations/robots/keenon-c40.md`](../../30-integrations/robots/keenon-c40.md).

---

## Robot #2 — Keenon C30 #1 (Hotel Guest Floors, Carpet)

This is the original Phase 1 pilot robot. 30 days of proof, then full production. See [`phase-1-c30.md`](phase-1-c30.md) for the pilot scope.

### Daily route

| Time | Floor | Duration | Notes |
|---|---|---|---|
| 06:00 – 07:30 | Floor 10 | 90 min | Highest floor first, works downward |
| 07:30 – 09:00 | Floor 9 | 90 min | |
| 09:00 – 10:30 | Floor 8 | 90 min | |
| 10:30 – 12:00 | **Charging + sensor wipe** | 90 min | Midday break |
| 12:00 – 13:30 | Floor 7 | 90 min | |
| 13:30 – 15:00 | Floor 6 | 90 min | |
| 15:00 – 16:30 | Floor 5 | 90 min | |
| 16:30 – 18:00 | Floor 4 | 90 min | |
| 18:00 – 19:30 | Floor 3 amenity level | 90 min | Carpeted portions only |
| 19:30 – 21:00 | Floor 2 amenity level | 90 min | Carpeted portions only |
| 21:00 – 06:00 | **Overnight charging** | — | |

**Coverage:** 9 floors per day, carpet corridors only. No guest room entry.
**Active cleaning:** ~10.5 hours
**Move between floors:** Via elevator integration ([Phase 2](phase-2-elevator.md)) once commissioned; until then, manually carried between floors

### Pre-elevator-integration workaround

Until the [elevator button emulator](../../30-integrations/elevator/button-emulator.md) is installed in Phase 2, the C30 is floor-locked — one floor per charge — and Facility Ops moves it between floors in the service elevator by hand.

This is a deliberate Phase 1 simplification: **do not couple cleaning robot deployment to elevator integration**. Prove the cleaning value first, then add the elevator in Phase 2.

### Handoffs and constraints

- **Carpet pile ≤ 10 mm** — verified at site survey
- **Obstacle ≤ 20 mm** — verified at site survey
- **Housekeeping coordination** — cleaning schedule shifts during guest room turnover peak (usually 10 AM – 2 PM); the C30 does guest-floor work outside the busiest turnover window
- **Daily sensor wipe** — housekeeping does this each morning at the charging dock

See [`../../30-integrations/robots/keenon-c30.md`](../../30-integrations/robots/keenon-c30.md).

---

## Robot #3 — Keenon C30 #2 (Residences — Sweep + Monitor + Alert)

**This is the most novel use case in the fleet.** The residences wing at Thesis Hotel is a separate, quieter environment than the hotel — longer-term occupants, fewer room turnovers, but ongoing demand for corridor cleanliness, hallway monitoring, and incident detection.

This C30 has two modes running in parallel: **active cleaning** (scheduled) and **passive monitoring** (continuous).

### Active mode — corridor sweep

| Time | Activity | Duration |
|---|---|---|
| 05:00 – 07:00 | Sweep all residence corridors | 120 min |
| 07:00 – 08:00 | Charging + sensor wipe | 60 min |
| 15:00 – 17:00 | Afternoon touch-up sweep | 120 min |
| 17:00 – 19:00 | Charging | 120 min |

**Active cleaning:** ~4 hours/day (residence corridors see lighter traffic than hotel floors)

### Passive mode — hallway monitor (continuous background duty)

Between active cleaning shifts, the C30 parks at a **mid-corridor observation dock** and runs passive monitoring:

| Signal | What it detects | How the C30 detects it | Alert path |
|---|---|---|---|
| **Foreign objects in hallway** | Packages left outside doors, trash, misplaced items | LiDAR + vision compared against baseline map | Mobile app notification to security + housekeeping |
| **Excessive noise from a unit** | Loud music, arguments, alarms | On-board microphone (decibel threshold) | Mobile app notification to security + building ops |
| **Water / liquid on the floor** | Leaks from a unit, spills | Cliff sensor anomaly + vision | Mobile app notification to maintenance (urgent) |
| **Fire or smoke (visual)** | Smoke in the corridor, active flame | Vision + thermal (if enabled) | Mobile app notification (critical) + fire marshal protocol |
| **Person down / prolonged stationary** | Resident fall, medical event | Vision + motion analysis | Mobile app notification to building ops (critical) |

**All of this runs on the C30's existing sensors** — no additional hardware. The intelligence layer sits in the Accelerate Robotics orchestration platform.

### Why this is compelling for residences

- **Residences have fewer staff passes** than a full-service hotel. Issues linger.
- **Insurance writes smaller checks** when damage is caught early — a 15-minute-old water leak is very different from an 8-hour-old one.
- **HOA compliance** — noise complaints from one unit can lead to fines or lease action. An objective, timestamped log is gold.
- **Elder safety** — if residences have aging-in-place occupants, a detection-in-hallway capability becomes a safety value, not just a facilities feature.

### Privacy and tenant relations

This is the **most sensitive** robot in the deployment. Before go-live:

- [ ] HOA board review and sign-off on monitoring scope
- [ ] Written disclosure to residents (explicit, not buried in a lease)
- [ ] No recording, only event detection — no audio or video is stored, only alert metadata (time, location, event type)
- [ ] Cameras visible and labeled; "monitoring robot" signage posted
- [ ] Opt-out path for residents who don't want alerts from their unit included
- [ ] Compliance with Florida privacy statutes (common-area monitoring permitted; unit-interior prohibited)

**If the HOA is not on board, this robot becomes a cleaning-only deployment** — the monitoring capability is removed or disabled until consent is in place.

### Alert protocol (draft)

| Severity | Event | Response time | Notification target |
|---|---|---|---|
| Critical | Fire/smoke, person-down | Immediate (< 30 sec) | Security, building ops, Accelerate on-call, 911 if confirmed |
| Urgent | Water leak, extended unit alarm | < 5 min | Maintenance, building ops |
| Routine | Foreign object in corridor, noise above threshold | Next business hour | Housekeeping, HOA compliance lead |

### Handoffs and constraints

- **Separate dedicated charging dock** in the residences wing — not shared with the hotel C30
- **HOA / residences ops liaison** must be identified before commissioning
- **Carpet pile and threshold constraints** — same as the hotel C30
- **Liability review** — building's insurer must approve the monitoring capability and its alert protocol before go-live

See [`../../30-integrations/robots/keenon-c30.md`](../../30-integrations/robots/keenon-c30.md) for base robot specs and [`residences-use-case.md`](residences-use-case.md) for the full residences concept.

---

## Robot #4 — Keenon W3 (Enclosed Room Delivery)

The room service robot. Enclosed compartments for privacy, dual modes (amenity drop + late-night room service), elevator-integrated.

### On-demand dispatch model

Unlike the cleaning robots, the W3 has no fixed schedule. It sits at a lobby-level dock and dispatches on demand:

| Trigger | Action |
|---|---|
| Front desk receives a request ("can you send up a hair dryer to 712?") | Staff loads the item into a W3 compartment, selects room 712, dispatches |
| PMS integration (Phase 3 of the rollout) | Guest orders from in-room tablet or app; W3 dispatched automatically |
| Scheduled amenity drop | Late-evening welcome gift to arriving guests flagged in the PMS |
| Room service order | Kitchen loads covered entrée, W3 delivers to room |

### Use cases

| Use case | Typical items | Frequency |
|---|---|---|
| Amenity delivery | Hair dryer, iron, ironing board, extra towels, toiletries, phone charger | 5–20 per day |
| Welcome gifts | Wine, fruit plate, welcome card | 10–30 per day |
| Late-night room service | Covered meal, soft drinks, snacks | 2–10 per day |
| Lost & found returns | Guest's forgotten item brought back to their room | Variable |

### Why the W3 (not the T8)

- **Privacy** — enclosed compartments hide the payload from other guests in the hallway
- **Room number hiding** — the W3's display doesn't show destination to bystanders
- **Phone integration** — via T-Box RJ11, the W3 can phone the guest's room on arrival (no voice-knock required)
- **Late-night discretion** — background music mode, no birthday-song surprises

### Handoffs and constraints

- **Elevator integration required** — see [Phase 2](phase-2-elevator.md)
- **Lobby-level dispatch dock** — location to be confirmed at site survey; needs 15A outlet, 1.5 m wall clearance, discreet placement
- **Front-desk training** — 1-hour session on dispatch, loading, troubleshooting
- **T-Box phone integration** — per-floor setup during commissioning
- **Privacy protocol** — staff confirmation before dispatching any in-room delivery to avoid unwanted disturbance

See [`../../30-integrations/robots/keenon-w3.md`](../../30-integrations/robots/keenon-w3.md).

---

## Robot #5 — Keenon S100 (Bellhop Luggage)

Lobby-to-room luggage transport. Dispatched at check-in, returns autonomously.

### Dispatch model

| Trigger | Action |
|---|---|
| Guest arrives at check-in | Front desk loads luggage into S100 cage, selects room, dispatches |
| Guest checkout | Optional reverse: luggage picked up from room, delivered to lobby |
| VIP transport | Airport/limo arrival handled through PMS pre-arrival |

### Daily usage pattern

- **Check-in peak:** 3 PM – 6 PM — most active window
- **Check-out peak:** 10 AM – noon — less active (most guests carry their own out)
- **Off-peak:** parked at lobby dock, available

Typical day: **20–40 trips** depending on occupancy and event bookings.

### Handoffs and constraints

- **Elevator integration required** — shares the same integration path as the W3
- **Luggage cage attachment** — lockable, sized for typical 2-suitcase + carry-on loads
- **Signage and guest education** — "Please walk alongside, not in front"
- **Front desk training** — brief; the app flow is simple
- **Lobby dock location** — highly visible is fine here; the S100 is a brand moment for a boutique hotel

See [`../../30-integrations/robots/keenon-s100.md`](../../30-integrations/robots/keenon-s100.md).

---

## Robot #6 — Keenon S300 #1 (Dirty Linens Transport)

The heavy logistics robot. Removes the longest physical-carry task from housekeeping's day.

### Daily route

| Time | Activity | Notes |
|---|---|---|
| 09:00 – 12:00 | **Turnover peak — hourly sweep** of guest floors 4–10 | Each floor's housekeeping closet has a linen bin on a rolling base; S300 docks and accepts the bin |
| 12:00 – 13:00 | **Basement laundry run** | Drops bin at laundry intake, returns |
| 13:00 – 15:00 | **Afternoon sweep** | Second pass; catches late-turnover floors |
| 15:00 – 19:00 | **On-demand mode** | Housekeeping can dispatch from any floor as needed |
| 19:00 – 09:00 | **Overnight charging + standby** | Available for emergency dispatch |

### Labor impact

Replaces **the single most injury-prone housekeeping task**: pushing a loaded linen hamper from the 8th floor to the basement laundry. That's 8 elevator rides, two long corridor walks, and ~100 lb of soiled linen per trip — done by a worker who may do this 6–10 times a day.

Typical projection: **2–4 hours of staff time reclaimed per day**, primarily by eliminating elevator transit and long-hauls from housekeeping closets.

### Handoffs and constraints

- **Elevator integration required** — service elevator path mapped; needs to accommodate the S300's larger footprint
- **Housekeeping closet redesign** — each guest-floor closet needs a dock position and a rolling-base linen bin (sourced separately)
- **Service elevator access** — back-of-house key or relay-trigger; confirmed with GM
- **Laundry intake protocol** — who receives the bin at the basement, how it gets moved to the washers

See [`../../30-integrations/robots/keenon-s300.md`](../../30-integrations/robots/keenon-s300.md).

---

## Robot #7 — Keenon S300 #2 (Food — Kitchen to Pool Deck)

Dedicated food-delivery robot for the upstairs pool service.

### Daily route

| Time | Activity | Notes |
|---|---|---|
| 10:00 – 11:00 | **Pool bar opens** — initial setup supply run | Ice, garnishes, napkins, etc. |
| 11:00 – 20:00 | **Continuous food service** | Dispatched from the kitchen per order batch |
| 20:00 – 21:00 | **Pool close — reverse run** | Returns empty bins, takes any waste down |
| 21:00 – 10:00 | **Overnight charging + sanitize cycle** | Food attachment gets a deep clean daily |

### Use case

Pool-deck service orders happen in batches — a guest orders a burger + drinks + a second round 15 minutes later. Instead of a runner physically carrying each batch up the service elevator, the kitchen loads the S300's insulated cabinet and dispatches it.

The pool-deck attendant unloads on arrival, completes the handoff, and the S300 returns for the next batch.

### Labor impact

**One runner role becomes optional** — about 4–6 hours of staff time per day reclaimed for actual guest interaction at the pool instead of elevator transit.

### Handoffs and constraints

- **Elevator integration required** — kitchen-level to pool-deck-level path mapped; the service elevator must handle the S300's footprint
- **Food safety** — daily sanitize of the insulated cabinet, food-contact-surface protocol, no-touch handoff design
- **Order batching protocol** — kitchen expediter decides when to load and dispatch (not the robot)
- **Pool-deck attendant training** — unload and confirmation flow
- **Weather** — pool deck exposure; the robot is fine under a shaded service station but should not sit in full direct sun or rain

See [`../../30-integrations/robots/keenon-s300.md`](../../30-integrations/robots/keenon-s300.md).

---

## Fleet interactions and elevator sharing

With 7 robots and two elevator paths (guest service elevator + kitchen/pool service elevator), coordination matters. The orchestration layer handles this, but the general rules:

| Robot | Primary elevator | Priority |
|---|---|---|
| C30 #1 (hotel guest floors) | Service elevator | Low (can wait) |
| W3 (room delivery) | Service elevator | High (guest-facing) |
| S100 (luggage) | Guest elevator | Highest (guest is waiting) |
| S300 #1 (linens) | Service elevator | Medium (staff-facing) |
| S300 #2 (food to pool) | Kitchen/pool service elevator | High (food temperature) |

The C40 and residences C30 don't use elevators at all — C40 is downstairs-only, residences C30 is its own corridor environment.

### Congestion strategy

- The service elevator is the most contested resource. Accelerate Robotics scheduling layer enforces **one robot per cab at a time**.
- Guest-facing dispatches (W3, S100) always preempt facility-facing dispatches (C30 #1, S300 #1) — a guest-carried luggage pickup beats a scheduled linen run.
- The residences C30 #2 is isolated — it never touches the hotel's elevator system.

See [`phase-2-elevator.md`](phase-2-elevator.md) for the button emulator install plan.

---

## Charging and staging

Each robot needs a dedicated charging location. Proposed layout:

| Robot | Dock location | Power | Notes |
|---|---|---|---|
| C40 | Kitchen back-of-house | 110V / 15A | Near mop sink for water access |
| C30 #1 | Housekeeping closet, a designated floor | 110V / 15A | Moves with floor rotation |
| C30 #2 | Residences back-of-house corridor | 110V / 15A | Mid-corridor observation dock |
| W3 | Lobby-level service alcove | 110V / 15A | Discreet, near front desk |
| S100 | Lobby main area | 110V / 15A | Visible — brand moment |
| S300 #1 | Basement laundry staging | 110V / 15A | Near laundry intake |
| S300 #2 | Kitchen back-of-house | 110V / 15A | Near food-expedite line |

Total electrical load: **7 × 15A = 105A nominal** (though not simultaneous — typical peak is 3–4 robots charging at once).

All dock locations to be **confirmed at site survey** ([site-survey.md](site-survey.md)).

---

## Wi-Fi and connectivity

All seven robots are **2.4 GHz only** (no 5 GHz support). This is a hard constraint.

- Minimum RSSI: **-65 dBm** at every dwell point
- Dedicated IoT SSID preferred over guest Wi-Fi
- Captive portal bypass required
- DHCP reservations for all 7 robot MAC addresses
- DynaSky Cloud egress must be allowed through the hotel firewall

See [`../../30-integrations/facilities/wifi-requirements.md`](../../30-integrations/facilities/wifi-requirements.md).

---

## Summary

This fleet isn't just seven robots — it's a **coordinated workforce** that covers cleaning, delivery, and logistics across a 10-story mixed-use property. Each robot has a clear role, a clear schedule, and a clear handoff with the human staff around it. None of them replaces a person; every one of them takes the most repetitive, injury-prone, or transit-heavy task off a staff member's plate so that person can do higher-value work.

**Total active robot-hours per day:** ~60 hours across the 7 robots
**Estimated staff time reclaimed:** 10–14 hours per day (conservative)
**Phases to get here:** 3 phases over ~6 months (see [`proposal.md`](proposal.md))

## Related

- [`proposal.md`](proposal.md) — full commercial proposal
- [`site-survey.md`](site-survey.md) — measurements and walk-through checklist
- [`phase-1-c30.md`](phase-1-c30.md) — 30-day C30 pilot (first deployment)
- [`phase-2-elevator.md`](phase-2-elevator.md) — elevator integration plan
- [`residences-use-case.md`](residences-use-case.md) — residences C30 monitoring detail
- [`risk-register.md`](risk-register.md) — known risks
- [`../../30-integrations/robots/`](../../30-integrations/robots/) — per-robot spec sheets
