# Keenon C30 — Cleaning Robot

The C30 is our Phase 1 workhorse — it cleans autonomously. First deployment: Thesis Hotel carpeted paths.

## Specs at a glance

| Spec | Value |
|---|---|
| **Use case** | Autonomous sweeping, vacuuming, dust pushing |
| **Dimensions** | 490 × 610 × 750 mm (with dust push attachment) |
| **Weight** | 35 kg (with battery) |
| **Max speed** | 0.7 m/s |
| **Battery** | Ternary lithium, 25.2 V / 30 Ah |
| **Charge time** | 2–3 hours |
| **Runtime (vacuum/sweep)** | 3–4 hours |
| **Runtime (dust push only)** | 10 hours |
| **Cleaning capacity** | 1,500 m² per charge, 540 m²/hour |
| **Vacuum suction** | 11,000 Pa |
| **Carpet** | Low-pile only, **up to 10 mm** |
| **Obstacle climb** | **20 mm max** |
| **Slope** | Up to 7° |
| **Network** | Wi-Fi 2.4 GHz / 4G |
| **Display** | 7" (1920 × 1080) |
| **OS** | Linux (control) + Android (interaction) |
| **Service life** | 5 years |

## Sensors

- **LiDAR** — 228° field, 25 m range
- **Stereo vision** — 3× cameras, 120° FOV, 0.1–1.5 m depth
- **Collision sensors** — perimeter bump strip
- **Anti-fall sensors** — cliff detection at each wheel

## Deployment constraints (the things the datasheet tells you, but the sales sheet doesn't)

### Carpet pile height ≤ 10 mm

Any carpet thicker than 10 mm will stall the drive motors or foul the brushes. **At every new site, physically measure the carpet pile.** A ruler and 30 seconds is enough.

### Obstacle / threshold ≤ 20 mm

Door thresholds, transition strips between carpet and tile, elevator gaps — all of these must be ≤ 20 mm. More is a non-starter; the robot will stop or tip.

### Battery life under vacuum is 3–4 hours

For a full-shift deployment, plan for midday recharge. A 1,500 m² single charge sounds like a lot, but at 540 m²/hour you hit the limit in under 3 hours. Budget charging time into the schedule.

### Slope ≤ 7°

Fine for normal floors. Watch out for lobby transitions, ramped thresholds at delivery entrances, and slight floor unevenness at old buildings.

### 2.4 GHz WiFi only

See [`../facilities/wifi-requirements.md`](../facilities/wifi-requirements.md). 5 GHz-only networks will break the deployment.

## Software

- Managed via the **Keenon Robotics app** (see [`fleet-software.md`](fleet-software.md))
- On-robot app: `com.keenon.peanut.clean`
- Real-time position map available in the mobile app for C30 specifically
- DynaSky Cloud for multi-location fleet management

## Use cases at Thesis Hotel

- **Phase 1:** Carpeted guest-floor paths (levels 4–10)
- **Future:** Lobby hardwood and tile (the C30 supports hard floors, and that's a lot of square footage)
- **Never:** Food prep areas, wet floors, cabling runs, staff-only maintenance zones

## Maintenance

- **Daily:** Clean the LiDAR, RGB-D camera, and image module with a microfiber cloth
- **After each use:** Wipe with a soft damp cloth, then dry
- **Every 6 months:** Full bottom inspection + safety function check
- **Every 6 months:** Mandatory safety inspection by the Keenon after-sales team (the robot auto-reminds 1 week before)
- **Re-mapping required** if the environment significantly changes (furniture, renovation, new location)

## Source

- Datasheet: `/Users/ericrace/Desktop/Datasheet_C30_DVT_20230823.pdf`
- In-repo copy: [`../../assets/datasheets/keenon-c30.pdf`](../../assets/datasheets/keenon-c30.pdf) *(move binary when ready)*

## Related

- [`keenon-w3.md`](keenon-w3.md) — enclosed delivery sibling
- [`keenon-t8.md`](keenon-t8.md) — open-tray delivery sibling
- [`fleet-software.md`](fleet-software.md) — management software
- [`../../40-deployments/thesis-hotel/phase-1-c30.md`](../../40-deployments/thesis-hotel/phase-1-c30.md) — Phase 1 deployment plan
