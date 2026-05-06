# Keenon C40 — Hard-Floor Cleaning Robot

The C40 is Keenon's four-in-one hard-floor cleaner. Where the [C30](keenon-c30.md) is purpose-built for carpet, the **C40 is the hard-floor counterpart** — sweeps, vacuums, scrubs, and mops in a single pass. At Thesis Hotel this is the robot that owns the downstairs hard environments: both restaurants, the lobby, and the kitchen deep-clean at end of shift.

## Specs at a glance

| Spec | Value |
|---|---|
| **Use case** | Commercial hard-floor cleaning — sweep + vacuum + scrub + mop |
| **Dimensions** | ~550 × 650 × 1100 mm (slightly larger footprint than the C30) |
| **Weight** | ~65 kg (with water tanks empty) |
| **Cleaning modes** | Sweep, vacuum, wet scrub, mop, dust push |
| **Clean-water tank** | ~15 L |
| **Dirty-water tank** | ~15 L |
| **Battery** | Ternary lithium, 25.9 V nominal |
| **Charge time** | ~3 hours |
| **Runtime (scrub mode)** | 3–4 hours |
| **Cleaning capacity** | ~1,200 m² per charge |
| **Max speed** | 0.9 m/s |
| **Obstacle climb** | ≤ 20 mm |
| **Slope** | ≤ 5° |
| **Working conditions** | 0–40 °C, 5–85% humidity |
| **Network** | Wi-Fi 2.4 GHz / 4G |
| **OS** | Linux (control) + Android (interaction) |

**All specs above are approximate and subject to verification against the current Keenon datasheet at site survey time.** Confirm exact values with the vendor before commercial commitment.

## Sensors

- LiDAR (360° perception)
- Stereo vision (3× cameras for obstacle depth)
- Anti-collision bumper strip
- Cliff / anti-fall sensors at each wheel
- Weight-on-pad detection (so the robot knows if its scrub pad is loaded)

## The four-in-one clean cycle

Unlike the C30, the C40 runs an integrated wet-clean cycle on a single pass:

1. **Pre-sweep** — front roller lifts large debris into the dust bin
2. **Vacuum** — residual fine dust
3. **Scrub** — rotating pad with metered clean-water delivery
4. **Squeegee + vacuum recovery** — picks up dirty water into the rear tank

The robot leaves a wet-dry finish behind it, not a damp slick. This matters for restaurant floors where guests are walking the route immediately after a pass.

## Deployment constraints (the things that bite in real hotels)

### Floor surface compatibility

The C40 is designed for sealed hard surfaces: polished concrete, porcelain tile, sealed hardwood, vinyl plank, epoxy. **Unsealed wood, travertine, or natural stone can be damaged by repeated wet cycles.** Confirm every surface type before scheduling wet cleans.

### Obstacle ≤ 20 mm, slope ≤ 5°

Same physical envelope as the C30. Floor transitions from tile to carpet, restaurant bar-height thresholds, and lobby entry mats all need measurement.

### Water management

- Clean-water tank must be topped up between cycles — **budget staff time for tank fill / dirty-water dump** or install a docking station with auto fill/drain (available aftermarket, ~$2,500–$5,000)
- Detergent dosing is manual on most C40 firmwares — staff must refill the detergent cartridge
- Squeegee blade wears fastest; replace every 4–6 weeks

### Noise during wet scrub

Scrub mode runs a high-RPM pad motor plus vacuum. **Keep the C40 out of restaurant-dining windows** — schedule it before service opens and after close.

### 2.4 GHz Wi-Fi only

Same constraint as every other Keenon robot. See [`../facilities/wifi-requirements.md`](../facilities/wifi-requirements.md).

## Software

- **On-robot app:** PEANUT APP (Android)
- **Default PIN:** `0000` — change at deployment
- **Managed via:** Keenon Robotics app + DynaSky Cloud
- **Route mapping:** Keenon technician builds the initial SLAM map; we maintain and edit routes through the app
- **Cleaning profiles:** Multiple per map — e.g., "restaurant-fast-sweep" vs "kitchen-deep-scrub"

## Use cases at Thesis Hotel

The C40 is the **downstairs hard-environment workhorse**. Single robot, multi-zone route, cycling through four distinct environments in one shift:

1. **Restaurant 1** — pre-service floor clean (sweep + scrub)
2. **Lobby** — dust-push + scrub, quiet mode
3. **Restaurant 2** — pre-service floor clean
4. **Kitchen (end of shift)** — deep sweep + mop after kitchen close

See [`../../40-deployments/thesis-hotel/fleet-composition.md`](../../40-deployments/thesis-hotel/fleet-composition.md) for the detailed routing and time budget.

## Maintenance schedule

- **Daily:** Empty both water tanks; rinse the dirty-water tank; wipe sensors
- **Daily:** Inspect squeegee blade for nicks or wear
- **Weekly:** Deep-clean the scrub pad; replace if worn
- **Monthly:** Inspect and replace main brushes
- **Every 6 months:** Full manufacturer safety inspection (Keenon after-sales)

## Related

- [`keenon-c30.md`](keenon-c30.md) — carpet sibling
- [`keenon-w3.md`](keenon-w3.md) — delivery robot
- [`fleet-software.md`](fleet-software.md) — management software
- [`../../40-deployments/thesis-hotel/fleet-composition.md`](../../40-deployments/thesis-hotel/fleet-composition.md) — Thesis Hotel fleet plan
