# Keenon W3 (ButlerBot) — Enclosed Delivery Robot

The W3 is Keenon's enclosed delivery robot. Closed compartments, privacy features, hotel phone integration, elevator-capable. It's the robot that carries room service, linens, documents, amenities, pharmacy — anything that needs to stay private and arrive intact.

**Phase 2 at Thesis Hotel is likely a W3 rollout** once the elevator integration is live.

## Specs at a glance

| Spec | Value |
|---|---|
| **Use case** | Secure delivery — hotels, offices, pharmacies, labs |
| **Dimensions** | 450 × 550 × 1080 mm |
| **Weight** | 48 kg |
| **Max speed** | 0.8 m/s |
| **Battery** | DC 48 V / 12 Ah |
| **Charge time** | ~6.5 hours |
| **Runtime** | 9–12 hours (3 deliveries/hour, 5 min each) |
| **Compartments** | 2 floors, 39 × 38.5 × 30 cm each, mergeable into one tall compartment |
| **Payload** | 20 kg total (10 kg per floor) |
| **Display** | 11.6" HD touch (1920 × 1080) |
| **Obstacle climb** | **15 mm max** |
| **Slope** | Up to 5° |
| **Min aisle width** | 70 cm for one robot, 1.5 m for two passing |
| **Service life** | 20,000 hours |

## Sensors

- LiDAR
- Depth vision
- Touch sensors
- IMU
- Wheel encoders

## Network and connectivity

- **Wi-Fi 2.4 GHz**
- **Cellular:** 2G / 3G / 4G (extensive band support)
- **LoRa:** 850–930 MHz for elevator and IoT integration
- **Elevator-capable** via E-Box (LoRa + RFID)
- **Phone integration** via T-Box RJ11 (internal hotel phone call on delivery arrival)

## Key features

### Delivery notifications

Multiple channels:
- Voice broadcast at the destination
- Internal hotel phone call (via T-Box RJ11)
- Mobile SMS and voice call

### Privacy & security

- **Room number hiding** — the display doesn't show the destination to bystanders
- **Background music** during delivery for a less jarring experience
- **Auto-return to charging** at 5% battery

### Mergeable compartments

For tall payloads (a bouquet, a cake, a stack of folded towels), the top and bottom compartments merge into one vertical space.

## Deployment constraints

### Obstacle climb ≤ 15 mm

**Tighter than the C30.** Door thresholds matter even more for delivery. Walk the route with a ruler.

### Slope ≤ 5°

**Tighter than the C30.** Lobby transitions, ramp deck in a parking structure, valet ramps — all potentially problematic.

### Min aisle width 70 cm (1 robot) / 1.5 m (2 passing)

Hallways in older hotels and hospitals can be narrower than you'd expect. Measure before you commit.

### 2.4 GHz WiFi only (or cellular fallback)

Same story as the C30. See [`../facilities/wifi-requirements.md`](../facilities/wifi-requirements.md).

## Software

- **On-robot app:** PEANUT APP (Android, auto-launches on boot, ~40 sec startup)
- **Default PIN:** `0000` — **change this before deployment**
- **Managed via:** Keenon Robotics app + DynaSky Cloud
- See [`fleet-software.md`](fleet-software.md)

## Warranty

- 12 months main parts
- 6 months consumables (omni-wheels, power adapter)

## Use cases at Thesis Hotel

- Room service delivery (enclosed, private, phones the room on arrival)
- Luggage transport (short routes, elevator-to-room)
- Amenity delivery (towels, toiletries, welcome gifts)
- Clean linen delivery to linen closets on each floor
- Soiled linen collection (separate robot, separate route)

## Source

- User manual: `/Users/ericrace/Desktop/Butlerbot W3 user manual.pdf`
- In-repo copy: [`../../assets/datasheets/keenon-w3.pdf`](../../assets/datasheets/keenon-w3.pdf) *(move binary when ready)*

## Related

- [`keenon-c30.md`](keenon-c30.md) — cleaning sibling
- [`keenon-t8.md`](keenon-t8.md) — open-tray delivery sibling
- [`fleet-software.md`](fleet-software.md) — management software
- [`../elevator/keenon-ebox.md`](../elevator/keenon-ebox.md) — elevator integration the W3 uses
- [`../../40-deployments/thesis-hotel/phase-2-elevator.md`](../../40-deployments/thesis-hotel/phase-2-elevator.md) — Phase 2 rollout plan
