# Keenon E-Box

Keenon's commercial robot-elevator bridge. It's the reference design for how a robot fleet can ride elevators today without bespoke OEM integration. We use it at Thesis Hotel because it's proven, and we study it because our own universal button emulator is the next-generation version of the same idea.

## Source

- **Source file:** `Ebox Workflow - Logic explanation.pptx` (Keenon internal)
- **Copy in repo:** [`../../assets/elevator/ebox-workflow.pptx`](../../assets/elevator/ebox-workflow.pptx) *(move binary here when ready)*

## System overview

The E-Box system controls the elevator by simulating button presses at the cabin panel. Two communication paths:

### Path A — Direct LoRa (Green line)

```
Robot → E-Box slave (on cab) → IO cable → cabin panel buttons
```

Short-range, low-latency, no internet dependency. Best for in-building reliability.

### Path B — Internet + LoRa (Blue line)

```
Robot → WiFi → Cloud → Internet → E-Box master (shaft top)
                                      │
                                      ▼
                                   LoRa → E-Box slave (cab) → IO cable → cabin panel
```

Used when the robot and the E-Box are on different networks or when cloud coordination is required.

## Floor detection

RFID is the truth:

- **RFID tags** — fixed on the shaft wall at each floor, passive (no power)
- **RFID reader** — mounted on top of the cabin, reads the tag when the cab arrives at a floor

When the cabin is moving, the reader does nothing. When it stops at a floor, the reader sees the tag and reports the floor number. This is how E-Box knows where the cab is without talking to the elevator controller.

## Hardware kit

- E-Box master (shaft top)
- E-Box slave (cab top)
- T-Box (phone call to room for delivery notifications)
- RFID readers
- 3× 12V 2A power adaptors
- Tools for install: Win10 computer, USB flash drive, RJ45 cable (1m), RJ11 cable (1m), power cable, micro USB cable, frosted film (if required)

## Physical installation

1. **E-Box Master** — fixed on top of elevator shaft
   - Requires 220V AC power
   - Requires internet via RJ45
2. **E-Box Slave** — fixed on top of elevator cabin
   - Requires 220V AC power
3. **RFID Tags** — fixed on shaft wall at each floor level
4. **RFID Reader** — fixed on top of cabin, reads tags as cabin passes
5. **LoRa Antennas** — Master and Slave antennas must be **placed parallel** for reliable signal in the shaft. Mis-alignment is a common failure mode.

## IO cable wiring — E-Box Slave to cabin panel

**Logic:** Normally Open (NO) dry contacts. Closing the contact is equivalent to pressing the corresponding button.

**E-Box ports:** Labeled in groups of 4 (1–4, 5–8, 9–12, 13–16) across 8 cables. Total 32 IO channels.

### Port map

| IO port | Function |
|---|---|
| IO 1 | Open door (开门) |
| IO 2 | 0 (reserved) |
| IO 3 | Normally Open (ground reference) |
| IO 4 | Normally Closed (ground reference) |
| IO 5 | Floor 1 |
| IO 6 | Floor 2 |
| IO 7 | Floor 3 |
| IO 8 | Floor 4 |
| IO 9 | Floor 5 |
| IO 10 | Floor 6 |
| IO 11 | Floor 7 |
| IO 12 | Floor 8 |
| IO 13 | Floor 9 |
| IO 14 | Floor 10 |
| IO 15 | Floor 11 |
| IO 16 | Floor 12 |
| IO 17 | Floor 13 |
| IO 18 | Floor 14 |
| IO 19 | Floor 15 |
| IO 20 | Floor 16 |
| IO 21 | Floor 17 |
| IO 22 | Floor 18 |
| IO 23 | Floor 19 |
| IO 24 | Floor 20 |
| IO 25 | Floor 21 |
| IO 26 | Floor 22 |
| IO 27 | Floor 23 |
| IO 28 | Floor 24 |
| IO 29 | Floor 25 |
| IO 30 | Floor 26 |
| IO 31 | Floor 27 |
| IO 32 | Floor 28 |

**Maximum floors supported:** 28, plus door-open.

### E-Box physical ports

- RJ45 (Ethernet)
- RS-485 (wired diagnostics / serial fallback)
- FLOOR (RFID reader input)
- Indicator light
- USB
- DC power input

## Two wiring solutions

**Solution 1 — Parallel to existing buttons**
Connect the IO cable directly to the cabin panel's button terminals. Closing the E-Box contact is electrically equivalent to a passenger pressing the button.

**Solution 2 — Direct to lift control board**
Bypass the physical button and wire directly to the controller PCB. Used when the cabin panel is sealed, inaccessible, or button interference is a problem.

Both solutions share: 100–240V power adapter, E-Box slave, LoRa antenna, RFID reader, floor labels on the shaft wall, data cables in groups of 8 to lift control board or buttons.

## Terminal strip G (ThyssenKrupp-side)

The Connection Drawing of Terminal Strip G shows:

- TRUE-DESCENT circuit
- Level 0 / 1 / 2
- Car calls

Terminal strip connections `C1`, `C2`, `C3` correspond to specific floor levels — field-dependent. Verify against the site's as-built drawings before wiring.

## Warranty and service

- Keenon technician is required for initial site mapping and commissioning
- Re-mapping is required if the environment significantly changes (furniture, renovation, new floor)
- 6-month mandatory safety inspection (applies broadly to the Keenon fleet — robot auto-reminds 1 week before)

## How it fits into the Accelerate platform

The E-Box is the reference design. Our [`button-emulator.md`](button-emulator.md) universal product is:

- **Smaller** — ~$23/floor vs. full E-Box kit
- **Simpler** — no RFID, no LoRa repeater, no master/slave — just per-floor ESP32 modules
- **Vendor-agnostic** — works on any elevator with a signal fixture, not just Keenon-compatible cabs

We'll use E-Box at Thesis Hotel for Phase 2 because it's shipping today. Our emulator product is the Phase 2+ direction.

## Related

- [`thyssenkrupp-tac32t.md`](thyssenkrupp-tac32t.md) — the elevator controller we're integrating with at Thesis Hotel
- [`button-emulator.md`](button-emulator.md) — our universal button emulator design
- [`../../40-deployments/thesis-hotel/phase-2-elevator.md`](../../40-deployments/thesis-hotel/phase-2-elevator.md) — Thesis Hotel deployment plan
