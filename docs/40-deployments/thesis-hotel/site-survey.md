# Thesis Hotel — Site Survey

Our first deployment site. A 10-story independent hotel in Miami. Phase 1 is a 30-day C30 cleaning pilot on guest-floor carpeted paths.

## Quick facts

| Item | Value |
|---|---|
| **Location** | Miami, FL |
| **Stories** | 10 |
| **Guest floors** | 4–10 (lobby + amenity on 1–3) |
| **First meeting** | 2026-03-23 (Head of Engineering + Facility Ops) |
| **Phase 1** | 30-day C30 pilot on carpeted guest-floor paths |
| **Phase 2** | Elevator integration (Phase 2 rollout, see [`phase-2-elevator.md`](phase-2-elevator.md)) |
| **Future** | W3 room service, luggage, lobby hardwood/tile |
| **Reference floor plan** | `/Users/ericrace/Downloads/Hotel - Level 4 - 10 reference plan.docx` (move into `assets/site-plans/` when ready) |

## Building layout

The guest floors (levels 4–10) are a repeating typology:

- Elevator lobby in the center of the floor
- Corridors running left and right
- Rooms arranged along both sides of each corridor
- Each floor has between 18 and 24 rooms
- Carpeted corridors throughout the guest levels

Lobby (L1) and amenity floors (L2, L3) have hard floors — not part of Phase 1.

## Room types on guest floors

From the reference floor plan:

| Code | Type |
|---|---|
| **QB** | Queen Bed |
| **QE** | Queen Bed — Executive |
| **KB** | King Bed |
| **KD** | King Deluxe |
| **KS** | King Suite |
| **QQ** | Two Queen Beds |
| **AC** | Accessible |

Room type matters for future W3 deliveries (door width, threshold type, clearance inside the room) — not for the C30 Phase 1 since the C30 operates only in corridors.

## Corridor measurements (to capture at the site walk)

These are the datapoints the site survey must collect. Blank values will be filled during the 2026-03-23 meeting or the follow-up walk.

| Measurement | Why it matters | Threshold | Value (TBD) |
|---|---|---|---|
| Carpet pile height | C30 stalls on pile > 10 mm | ≤ 10 mm | _TBD_ |
| Corridor width | Clearance for pass-by | ≥ 120 cm | _TBD_ |
| Door threshold gap (corridor ↔ room) | W3 future — needs ≤ 15 mm | _(future)_ | _TBD_ |
| Transition strip (carpet ↔ tile) | C30 obstacle limit 20 mm | ≤ 20 mm | _TBD_ |
| Elevator sill gap | Delivery future — cabin to floor | ≤ 15 mm | _TBD_ |
| Fire door sill | Corridor-to-corridor transitions | ≤ 20 mm | _TBD_ |
| Floor unevenness / slope | Lobby transitions, old buildings | ≤ 7° (C30), ≤ 5° (W3) | _TBD_ |

## WiFi survey

Because 2.4 GHz-only is a hard constraint for all Keenon robots, we must verify this ahead of deployment:

- [ ] SSID broadcasts a 2.4 GHz radio (or dedicated IoT SSID)
- [ ] No captive portal on robot VLAN
- [ ] RSSI ≥ -70 dBm at every planned route dwell point
- [ ] No sleep/save features disabling 2.4 GHz off-hours
- [ ] Guest/IoT network segmentation understood (see [`../../30-integrations/facilities/network-topology.md`](../../30-integrations/facilities/network-topology.md))

The back-of-house network is expected to be a different broadcast domain from guest WiFi. The robot must be on a network where it can reach the internet (DynaSky Cloud needs egress) but not on the guest SSID.

## Elevator inventory

- **OEM:** ThyssenKrupp
- **Controller:** TAC32T (confirmed via site photo of CPUA service card)
- **Number of cabs:** TBD (walk-in count required)
- **Car call panel layout:** standard vertical strip, buttons for 1–10 + open-door + close-door + alarm + call
- **Shaft access:** via building machine room, location TBD
- **Service contract holder:** TBD (needed for any panel-behind work)

See [`phase-2-elevator.md`](phase-2-elevator.md) for the integration plan and [`../../30-integrations/elevator/thyssenkrupp-tac32t.md`](../../30-integrations/elevator/thyssenkrupp-tac32t.md) for TAC32T specifics.

## Power and staging

- **Charging dock location (Phase 1):** TBD — needs 15A outlet, 1.5 m wall clearance, not in guest sightlines
- **Staging area:** TBD — probably back-of-house on guest floor or in housekeeping closet
- **Tool storage for field service visits:** TBD

## Stakeholders

| Role | Name | Contact |
|---|---|---|
| Head of Engineering | TBD | _captured 2026-03-23_ |
| Facility Ops Manager | TBD | _captured 2026-03-23_ |
| Housekeeping Manager | TBD | _Phase 1 primary_ |
| IT / Network Admin | TBD | _WiFi access + VLAN_ |
| Elevator Service Vendor | TBD | _Phase 2 only_ |
| GM | TBD | _escalation_ |

## Photo walk checklist

- [ ] Every corridor on guest floors 4–10
- [ ] Every carpet ↔ hard-floor transition
- [ ] Every fire door sill
- [ ] Elevator sills with a ruler in frame
- [ ] Elevator lobby + call panel
- [ ] Car call panel inside each cab
- [ ] Housekeeping closet (Phase 1 charging candidate)
- [ ] Machine room door (not inside — just the access)
- [ ] Any stairs, ramps, or raised thresholds on the robot's route

Drop the photos into `assets/site-plans/thesis-hotel/` alongside the floor plan PDF.

## Related

- [`phase-1-c30.md`](phase-1-c30.md) — Phase 1 C30 pilot plan
- [`phase-2-elevator.md`](phase-2-elevator.md) — Phase 2 elevator integration plan
- [`risk-register.md`](risk-register.md) — known risks
- [`checklist.md`](checklist.md) — full deployment checklist
- [`../playbook.md`](../playbook.md) — reusable deployment playbook
