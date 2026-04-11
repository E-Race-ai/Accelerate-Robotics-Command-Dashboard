# Keenon S100 — Autonomous Service Cart (Light Payload)

The S100 is Keenon's smaller **open-platform service cart** — a flat-bed AMR that accepts swappable payload attachments: luggage cage, linen bin, food tray, supply rack, or a custom fixture. Where the [W3](keenon-w3.md) is an enclosed box robot, the S100 is a chassis you build on top of.

At Thesis Hotel the S100 plays one role: **autonomous luggage transport from lobby check-in to guest rooms**.

## Specs at a glance

| Spec | Value |
|---|---|
| **Use case** | Luggage transport, light cart delivery, internal logistics |
| **Dimensions** | ~550 × 700 × 400 mm (base platform, without attachment) |
| **Weight** | ~40 kg |
| **Payload** | 100 kg (~220 lb) total |
| **Max speed** | 1.2 m/s |
| **Battery** | DC 25.2 V, lithium |
| **Charge time** | ~4 hours |
| **Runtime** | 8–10 hours depending on load and route length |
| **Obstacle climb** | ≤ 20 mm |
| **Slope** | ≤ 5° |
| **Working conditions** | 0–40 °C, 5–85% humidity |
| **Network** | Wi-Fi 2.4 GHz / 4G |

**All specs above are approximate and subject to verification against the current Keenon datasheet.** Capacity and attachment compatibility vary by firmware version.

## Sensors

- LiDAR
- Stereo vision (2× cameras)
- IMU
- Anti-collision bumper
- Proximity sensors (front + rear + sides)

## How the payload attachments work

The S100 base is a flat platform with mechanical mounting points and a power/data connector. Attachments bolt on top and draw low-voltage power from the base. Common attachments include:

- **Luggage cage** — tall wire cage with a lockable gate (our Thesis Hotel use case)
- **Linen bin** — tall bin on the platform (Thesis Hotel uses the larger [S300](keenon-s300.md) for linens)
- **Food tray stack** — insulated or open multi-tray (Thesis Hotel uses the S300 for food, too)
- **Supply rack** — adjustable shelves for pharmacy, amenities, etc.

Each attachment is inventoried separately and can be swapped by a single staff member in under 2 minutes. **One base robot, multiple roles** — but routing and scheduling assume one role per shift in practice.

## Deployment constraints

### Payload stability

- Center the load on the platform — off-center loads affect turning radius and can trigger stability limits
- Secure every payload with the attachment's straps or locking mechanism — the robot cannot detect a shifted load mid-route
- Max 100 kg is a hard limit; the drive motors struggle past that

### Obstacle ≤ 20 mm, slope ≤ 5°

Same as other Keenon AMRs. Lobby ramps, loading-dock transitions, and elevator sills all need measurement before committing a luggage route.

### Guest-facing interaction

Unlike the enclosed W3, the S100 carries visible payload. **Guests will want to interact with it** — touch the luggage, ride along with it, take photos. This is generally fine but requires:
- Friendly signage
- Front-desk staff briefing
- "Please walk alongside, not in front of" guest cue card

### Elevator use

The S100 uses the same elevator integration path as the W3 — our [universal button emulator](../elevator/button-emulator.md) or Keenon's [E-Box](../elevator/keenon-ebox.md) at the hall-call panel. No additional hardware per robot.

## Software

- **On-robot app:** PEANUT APP (Android)
- **Default PIN:** `0000` — change at deployment
- **Managed via:** Keenon Robotics app + DynaSky Cloud
- **Delivery confirmation:** Touchscreen prompts at pickup and drop-off

## Use case at Thesis Hotel — Bellhop

**Scenario:** Guest arrives at check-in. Front desk loads guest's luggage into the S100's luggage-cage attachment, selects the room number on the touchscreen, and releases the robot. The S100:

1. Navigates from the lobby to the elevator
2. Calls the elevator via our button emulator
3. Boards the cab and selects the guest's floor
4. Exits and navigates to the guest's room
5. Stops outside the room, phones the room (via T-Box RJ11) or texts the guest
6. Guest opens the door, unloads their luggage, taps "Done" on the screen
7. S100 returns to the lobby dock

The guest can either walk alongside the robot or receive the luggage later. Premium hotels use the alongside-walk as a guided tour opportunity: "the bar is to your left, pool on the right, your room is on the 8th floor."

See [`../../40-deployments/thesis-hotel/fleet-composition.md`](../../40-deployments/thesis-hotel/fleet-composition.md) for routing and handoff details.

## Maintenance schedule

- **Daily:** Wipe sensors; verify attachment mounting bolts are tight
- **After each shift:** Wipe the platform and attachment
- **Weekly:** Check tire wear and attachment strap condition
- **Every 6 months:** Keenon manufacturer safety inspection

## Related

- [`keenon-s300.md`](keenon-s300.md) — larger sibling for heavier loads
- [`keenon-w3.md`](keenon-w3.md) — enclosed delivery alternative
- [`fleet-software.md`](fleet-software.md) — management software
- [`../../40-deployments/thesis-hotel/fleet-composition.md`](../../40-deployments/thesis-hotel/fleet-composition.md) — Thesis Hotel fleet plan
