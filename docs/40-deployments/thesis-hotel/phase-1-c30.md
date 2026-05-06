# Thesis Hotel — Phase 1: C30 Cleaning Pilot

First deployment. First revenue. First proof that the platform works outside a lab.

## Objective

Deploy **one C30 cleaning robot** on **carpeted guest-floor corridors** (levels 4–10) of Thesis Hotel for a **30-day pilot**. Show that:

1. The robot cleans the corridors without intervention
2. Housekeeping workflow is *improved*, not complicated
3. Zero safety incidents
4. Baseline data for ROI (labor hours, rooms serviced, complaints)

## Why the C30 first

- **Lowest risk.** Cleaning doesn't touch the guest — no room entry, no payload handoff, no elevator.
- **Fast feedback.** Housekeeping sees the benefit on day one if it works.
- **Validates the site.** The C30's constraints (10 mm carpet, 20 mm obstacle, 2.4 GHz WiFi) are also constraints for every other robot we'd deploy. Passing Phase 1 de-risks Phase 2.

See [`../../30-integrations/robots/keenon-c30.md`](../../30-integrations/robots/keenon-c30.md) for full specs.

## Scope

**In scope:**
- Corridors on guest floors 4–10
- Carpeted surfaces only
- Daytime cleaning windows (TBD with Housekeeping)
- Data capture via DynaSky Cloud + manual logs

**Out of scope for Phase 1:**
- Guest rooms (no room entry)
- Lobby and amenity floors (hard floor — future phase)
- Elevator use (robot stays on one floor per shift — moved manually between floors)
- Any interaction with a hotel guest or staff member other than "please walk around me"
- Food prep areas, wet floors, cabling runs

## Pre-deployment verification

Cannot start until all boxes checked:

### Physical site

- [ ] Carpet pile height measured at every corridor — **all ≤ 10 mm**
- [ ] Every transition strip and fire door sill measured — **all ≤ 20 mm**
- [ ] Slope at every floor transition — **all ≤ 7°**
- [ ] Clear path identified for each guest floor (mapped ahead of commissioning)

### Network

- [ ] 2.4 GHz SSID confirmed and tested on robot
- [ ] DHCP reservation for the robot MAC
- [ ] Robot can reach DynaSky Cloud (egress verified)
- [ ] Captive portal bypass confirmed
- [ ] RSSI ≥ -70 dBm at every dwell point

### Power

- [ ] Charging dock installed in approved location
- [ ] 15A outlet verified, tested under load
- [ ] Cable management — no trip hazards
- [ ] Floor protection if required by facilities

### Robot

- [ ] Keenon PEANUT APP PIN changed from `0000`
- [ ] Robot firmware up to date
- [ ] Mapping completed by Keenon technician for each floor in scope
- [ ] Cleaning routes created and tested end-to-end with no payload
- [ ] Emergency stop function tested
- [ ] Safety strip and cliff sensors tested

### People

- [ ] Housekeeping team briefed (15-minute session, who to call, how to pause)
- [ ] GM and Head of Engineering signed off on deployment start
- [ ] On-call escalation path documented
- [ ] Photos before any of our work (for the retrospective and insurance)

## Operating model

- **One shift per day** during the pilot, covering a subset of guest floors per shift
- **Primary operator:** Housekeeping — they cue the robot via the Keenon Robotics app, supervise, and wipe down sensors at end of shift
- **Primary escalation:** Accelerate Robotics on-call (see [`../../50-operations/on-call.md`](../../50-operations/on-call.md))
- **Rollback plan:** If anything goes sideways, the robot gets parked at its charging dock and tagged out until we're on site. Housekeeping goes back to its previous workflow.

## Baseline metrics (captured before day one)

| Metric | Baseline | Source |
|---|---|---|
| Labor hours per floor, per clean | TBD | Housekeeping timesheet audit |
| Rooms serviced per housekeeping shift | TBD | PMS report |
| Guest complaints about corridor cleanliness (30-day lookback) | TBD | GM |
| Cleaning-related staff near-miss or injury reports (12-month lookback) | TBD | HR / safety officer |

Without baselines, any success claim is unfalsifiable. Capture these **before** the robot arrives.

## Daily checklist during pilot

- [ ] Wipe LiDAR, RGB-D camera, image module with microfiber cloth
- [ ] Check the dust bin — empty and rinse the filter
- [ ] Check battery health in PEANUT APP
- [ ] Log any incidents (collisions, get-stuck, emergency stops)
- [ ] Take a photo of the routes on day 1, 7, 15, 30 for visual progress tracking
- [ ] Capture labor hours reclaimed

## Success criteria (review at day 30)

| Criterion | Target |
|---|---|
| Uptime | ≥ 90% of scheduled sessions completed without intervention |
| Safety incidents | Zero |
| Housekeeping sentiment | Positive — team wants to keep it |
| Labor hours reclaimed | ≥ 2 hours/day on covered floors |
| Guest complaints related to the robot | ≤ 1 over 30 days |

Hitting all five = go on Phase 2. Missing any = retrospective + fix before expanding.

## Risks (live in [`risk-register.md`](risk-register.md))

Top five for Phase 1:

1. **WiFi weirdness** — 5 GHz-only AP somewhere on a guest floor, captive portal re-auth, roaming issues
2. **Thresholds over 20 mm** — any surprise sill or elevator gap kills that floor's route
3. **Carpet pile over 10 mm** — especially at fancy-looking area rugs or event spaces
4. **Housekeeping pushback** — "a robot is taking my job" — mitigated by framing as a helper
5. **Guest confusion** — someone tries to ride it, or a kid kicks it — signage + staff presence

## Related

- [`site-survey.md`](site-survey.md) — pre-work
- [`phase-2-elevator.md`](phase-2-elevator.md) — the next phase
- [`risk-register.md`](risk-register.md) — risk tracking
- [`checklist.md`](checklist.md) — full deployment checklist
- [`../../30-integrations/robots/keenon-c30.md`](../../30-integrations/robots/keenon-c30.md) — C30 specs
