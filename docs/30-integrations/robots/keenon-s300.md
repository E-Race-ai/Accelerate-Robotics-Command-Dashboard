# Keenon S300 — Heavy-Duty Service Cart

The S300 is Keenon's **larger open-platform service cart** — same chassis concept as the [S100](keenon-s100.md), but with roughly 3× the payload capacity and a taller working envelope. It's designed for the loads that would pin an S100 to the floor: bulk laundry, stacked food trays, room service carts, bulk supplies.

At Thesis Hotel the S300 shows up in **two distinct roles**, each with its own attachment:

1. **Dirty linens transport** — soiled laundry from every guest floor down to the basement laundry staging area
2. **Food delivery from kitchen to pool deck** — insulated food carrier from the downstairs kitchen up to the upstairs pool deck service station

One base chassis per role (so two S300 units total at Thesis Hotel), each dedicated to its use case.

## Specs at a glance

| Spec | Value |
|---|---|
| **Use case** | Heavy logistics — linens, bulk food, pharmacy, supply carts |
| **Dimensions** | ~700 × 900 × 500 mm (base platform, without attachment) |
| **Weight** | ~75 kg |
| **Payload** | 300 kg (~660 lb) total |
| **Max speed** | 1.2 m/s |
| **Battery** | DC 48 V, lithium |
| **Charge time** | ~5 hours |
| **Runtime** | 10–14 hours depending on load and route |
| **Obstacle climb** | ≤ 20 mm |
| **Slope** | ≤ 5° |
| **Working conditions** | 0–40 °C, 5–85% humidity |
| **Network** | Wi-Fi 2.4 GHz / 4G |
| **Min aisle width** | ~85 cm single-robot; 180 cm for two passing |

**All specs above are approximate and subject to verification against the current Keenon datasheet.** Different attachment configurations can adjust the footprint.

## Sensors

- LiDAR (360° perception)
- Stereo vision (3× cameras)
- IMU
- Anti-collision bumper
- Side proximity sensors for tight-corridor pass-by
- Weight-on-platform detection

## Attachments used at Thesis Hotel

### Dirty linens bin

- Tall, wheeled, vinyl-lined hamper bolted to the platform
- Sized to handle a full housekeeping floor's soiled linen (sheets, towels, robes)
- Capacity ~250–300 kg when full — within S300 envelope with margin
- Lid closes during transport to contain odor and lint

### Insulated food carrier

- Stainless-steel insulated cabinet mounted on the platform
- Multiple shelves, approximately 8–12 half-size hotel pans each
- Passive insulation (no active heating) — the kitchen-to-pool run is short enough that food stays in holding temperature
- Gasketed door with a secure latch
- Sanitizable interior (food-contact surfaces)

Both attachments are available off-the-shelf for Keenon's S-platform. The Accelerate Robotics scope-of-work includes specifying, sourcing, and installing the attachments at commissioning.

## Deployment constraints

### Minimum corridor width

The S300 is wider than the S100 — **~85 cm single-robot pass**. Back-of-house service corridors at Thesis Hotel need to be verified at site survey, especially:
- Linen-room-to-service-elevator path
- Kitchen loading path to the service elevator
- Pool deck approach from the elevator lobby

A 70 cm corridor that worked for a W3 may **not** work for the S300.

### Elevator cab size

The S300 plus a full linen bin is larger than most lobby-standard elevator cabs. Confirm:
- Cab interior width ≥ 105 cm (S300 + clearance)
- Cab weight rating accommodates robot + max payload (75 + 300 = 375 kg)
- Door opening width ≥ 90 cm

Most service elevators handle this easily — **passenger elevators in older buildings may not.**

### Slope ≤ 5°

Pool-deck approaches in Miami are often on the second floor with a short ramp transition. Measure the ramp before committing the food-to-pool route.

### Refrigeration / hot holding

The S300 food attachment is **passive insulated**, not actively temperature-controlled. Acceptable for short runs where food arrives within 15 minutes of leaving the holding line. **Not acceptable for long-hold scenarios** — cold or hot food must be served within the FDA two-hour window.

### 2.4 GHz Wi-Fi only

Same as every other Keenon robot. See [`../facilities/wifi-requirements.md`](../facilities/wifi-requirements.md).

### Elevator integration

Both S300 units need elevator access. The **linens unit** rides back-of-house from every guest floor to the basement; the **food unit** rides from the kitchen level to the pool-deck level. That's two distinct elevator paths — confirm both are covered by the button-emulator install in Phase 2. See [`../../40-deployments/thesis-hotel/phase-2-elevator.md`](../../40-deployments/thesis-hotel/phase-2-elevator.md).

## Software

- **On-robot app:** PEANUT APP (Android)
- **Default PIN:** `0000` — change at deployment
- **Managed via:** Keenon Robotics app + DynaSky Cloud
- **Task dispatch:** From the mobile app, via touchscreen, or programmatically through the Accelerate Robotics orchestration layer (Phase 3 and beyond)

## Use cases at Thesis Hotel

### S300 #1 — Dirty linens transport

**Scenario:** Housekeeping on floor 7 finishes a guest-room turnover. The soiled linens go into a rolling hamper in the floor's housekeeping closet. At a scheduled interval (every 2 hours during turnover peak, hourly in off-hours), the S300 is dispatched to each floor in sequence:

1. Pulls into the housekeeping closet
2. Housekeeping loads the linen bin (or the bin is already loaded on a rolling hamper that slides onto the platform)
3. Taps "Dispatched" on the touchscreen
4. Robot descends via the service elevator to the basement laundry staging area
5. Drops the bin at the laundry intake; alerts laundry staff via mobile app
6. Returns to dock to recharge or moves to the next floor

**Labor impact:** Replaces the longest physical-carry task housekeeping does. No more rolling 100 lb hampers through hallways and into elevators. Housekeeping stays on the floor, finishing more rooms per shift.

### S300 #2 — Food kitchen-to-pool

**Scenario:** The pool-deck service station runs food orders through the downstairs kitchen. Today, a runner physically carries trays up the service elevator to the deck. With the S300:

1. Kitchen expeditor loads the insulated cabinet with the next batch of orders
2. Taps "Pool Deck" on the touchscreen
3. Robot navigates to the service elevator, rides up, exits on the pool-deck level
4. Pool-deck attendant unloads, taps "Received"
5. Robot returns to the kitchen staging area

**Labor impact:** One staff role (kitchen runner) becomes optional; the runner's time redeploys to the pool deck for actual guest service instead of elevator transit.

## Maintenance schedule

- **Daily:** Wipe sensors; verify attachment mounting; inspect platform for food spills (food unit) or lint buildup (linen unit)
- **After each shift:** Full attachment wipe; food unit requires sanitizing wipe-down per food safety protocol
- **Weekly:** Check tire wear; inspect battery health in PEANUT APP
- **Every 6 months:** Keenon manufacturer safety inspection

## Related

- [`keenon-s100.md`](keenon-s100.md) — smaller sibling for lighter loads (luggage)
- [`keenon-w3.md`](keenon-w3.md) — enclosed alternative for delivery
- [`fleet-software.md`](fleet-software.md) — management software
- [`../../40-deployments/thesis-hotel/fleet-composition.md`](../../40-deployments/thesis-hotel/fleet-composition.md) — Thesis Hotel fleet plan
