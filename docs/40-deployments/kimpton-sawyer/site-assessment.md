# Kimpton Sawyer — Site Assessment

First-hand reconnaissance by Eric Race, 2026-04-20. Photos and voice notes captured on-site.

## Quick Facts

| Item | Value |
|---|---|
| **Property** | Kimpton Sawyer Hotel (IHG) |
| **Address** | 500 J Street, Sacramento, CA 95814 |
| **Opportunity ID** | OPP-007 (Sacramento Expansion) |
| **Visit date** | 2026-04-20 |
| **Floors** | 5 stops: P2, P1, 1★ (lobby), 2, 3 (low-rise service elevator observed) |
| **Elevator type** | Overhead traction |
| **Elevator capacity** | 3,500 lbs / 21 persons |
| **Elevator permit** | CA Conveyance #776086, expires 04/22/2026 |
| **GM location** | Offsite — no office in building |
| **Key amenity** | Rooftop pool + bar ("Revival") — downtown Sacramento hot spot |
| **Operator** | HHM Hotels (management company) |

## Lobby Observations

- **Floor surfaces:** Tile and hardwood mix in lobby
- **Staffing at time of visit:** 1 valet, 2 bellhops (idle), 4 front desk staff
- **Luggage situation:** Very large luggage carts filled to capacity with guest luggage waiting to be taken to rooms — "biggest I've seen" per Eric. Clear bottleneck in luggage delivery flow.
- **Restaurants:** All closed at time of visit
- **Guest floor corridors:** Majority carpeted, very clean condition

## Cleaning Operations

- **Current model:** Outsourced nightly cleaning service — comes during overnight sleeping hours
- **In-house cleaning staff:** Zero visible during daytime visit
- **Floor condition:** Carpets appeared very clean
- **Lobby floors:** Tile + hardwood (would need hard-floor cleaning capability, not just carpet)

## Rooftop Pool — Primary Robot Use Case

The rooftop pool and bar ("Revival") is the property's main selling point and the highest-impact robot deployment zone:

- **Food service pain point:** Food ordered at poolside must be hand-carried by staff from hotel restaurants to the pool deck. No dedicated kitchen on the pool level.
- **Towel service pain point:** Clean towels must be transported from lower-level laundry/storage up to the pool via staff. Continuous demand during peak hours.
- **Current state:** Pool was closed for maintenance starting 2026-04-20 (per posted sign). Seasonal reopening TBD.

### Robot opportunity at the pool
1. **W3 or FlashBot Max** for food delivery from kitchen to poolside — enclosed compartments for food safety
2. **Towel delivery** from housekeeping storage to pool deck — high-volume repetitive task
3. Both use cases require **elevator integration** (kitchen/laundry on lower floors, pool on rooftop)

## Elevator Intel

### Hall Station (IMG_0290)
- Brushed stainless steel fire service panel
- Red fire service keyswitch (mushroom-head, key-operated)
- Blue/white LED indicator
- Standard fire safety placard: "IN CASE OF FIRE USE STAIRWAYS DO NOT USE ELEVATORS"
- Separate dark indicator panel to the left

### Car Operating Panel / COP (IMG_0291)
- **Stops:** P2, P1, 1★ (lobby), 2, 3
- **Button style:** Circular metal push buttons with blue LED backlighting (floors), black oval buttons (door open/close, alarm, phone)
- **Card reader:** Present — black rectangular fob/card reader below floor buttons
- **Door controls:** Standard open/close arrows, alarm bell, phone
- **Label visible:** "3 REVIVAL" — indicates floor 3 is the Revival restaurant/bar level, and "MONITOR ROOM" partially visible
- **Surround:** Green marble panel

### Inspection Permit (IMG_0292)
- **State of California**, Dept of Industrial Relations, Div of Occupational Safety & Health
- **Conveyance Number:** 776086
- **Location:** 500 J ST, Sacramento
- **Load:** 3,500 pounds
- **Persons:** 21
- **Description:** Passenger
- **Type of Machine:** Overhead Traction
- **Owner's I.D.:** 14-[partial]
- **Inspector:** SN709
- **Date of Inspection:** 04/22/2025
- **Expires:** 04/22/2026

### Elevator Integration Notes
- **Overhead traction** — likely modern controller, good candidate for integration
- **Card reader present** — may need access credential for robot to use elevator (security consideration)
- **5-stop low-rise** — simple floor mapping for robot navigation
- **Fire service keyswitch** — standard; robot must yield during fire service mode
- **Button emulator compatibility:** Circular metal push buttons with ~15-20mm diameter — standard size for Accelerate universal emulator. Need to confirm button spacing and panel depth during detailed site walk.

## Bellhop Q&A Summary

Eric engaged bellmen in informal conversation:

1. **Who cleans the floors?** — Outsourced nightly service, not in-house EVS
2. **How does pool food service work?** — Ordered from hotel restaurants, hand-carried to poolside by staff
3. **How does towel service work?** — Brought from lower levels to pool via staff
4. **GM presence?** — GM is offsite, no office in the building

## Proposed Robot Use Cases (Priority Order)

| Priority | Use Case | Robot Type | Floor Surface | Elevator Needed | Impact |
|---|---|---|---|---|---|
| 1 | Pool food delivery | W3 / FlashBot Max | Hard floor (pool deck) | Yes — kitchen to rooftop | High — eliminates staff trips, faster service |
| 2 | Pool towel service | W3 | Hard floor (pool deck) | Yes — laundry to rooftop | High — continuous demand, repetitive |
| 3 | Luggage assistance | S100 / heavy-load AMR | Tile/hardwood (lobby) | Yes — lobby to guest floors | High — visible bottleneck observed |
| 4 | Guest floor cleaning | C30 | Carpet | Yes — multi-floor | Medium — currently outsourced nightly |
| 5 | Lobby floor cleaning | C40 / CC1 | Tile + hardwood | No — single level | Lower — already clean, outsourced |

## Next Steps

- [ ] Identify GM and HHM regional contact for formal introduction
- [ ] Determine elevator OEM/controller model (overhead traction — need specific make)
- [ ] Get full floor count (guest room floors not surveyed — only saw service elevator with 5 stops)
- [ ] Confirm card reader requirement for elevator access
- [ ] Pool reopening date — timing for pilot pitch
- [ ] Request floor plans
- [ ] Formal proposal after site details confirmed

## Photos

| File | Description |
|---|---|
| `IMG_0290.HEIC` | Elevator hall station — fire service keyswitch panel |
| `IMG_0291.HEIC` | Elevator COP — floor buttons, card reader, door controls |
| `IMG_0292.HEIC` | CA elevator inspection permit (Conveyance #776086) |
| `IMG_0293.HEIC` | Hotel entrance — Revival mat, pool closure sign |
| `New Recording.m4a` | Eric's voice notes — full site walkthrough narration |
