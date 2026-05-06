# Universal Button Emulator

**Our wedge.** A tiny ESP32-C3 board that sits inside each floor's elevator signal fixture and closes a dry contact across the existing button. No OEM API. No shaft hardware. No cloud dependency. ~$23 in parts per floor.

This is the product that lets Accelerate Robotics offer multi-floor robotics to any building with push-button elevators, regardless of OEM.

## Why this matters

**Controller-level integration costs $5K–$15K per elevator** when OEMs are willing to sell it at all. Most aren't, or require a partner agreement that takes months. Meanwhile our emulator:

- **$23 BOM per floor** — 100x cheaper
- **No OEM relationship required** — we don't talk to the controller, just to its own button's relay
- **Vendor-agnostic** — ThyssenKrupp, KONE, Otis, Schindler, Mitsubishi, Hyundai, anything with a push-button panel
- **Zero impact on the controller** — no firmware changes, no safety string interference, no fire-recall interference
- **Galvanic isolation** — 1500V rated — our circuit cannot induce a fault in the elevator's circuit

## The core insight

Inside a typical signal fixture, a push-button is wired to a controller I/O line through a relay. Pressing the button closes the relay, which closes the circuit, which tells the controller "someone requested this floor."

**Our board closes the same circuit from a second path**, in parallel with the existing relay. The controller sees a button press. The passenger never touches anything. The fire-recall, maintenance lockouts, safety gear — all unchanged.

## Reference teardown — ThyssenKrupp signal fixture

We've physically opened a ThyssenKrupp signal fixture and documented the internals. 25 teardown photos live at [`../../../public/assets/elevator-photos/`](../../../public/assets/elevator-photos/) (`IMG_1574`–`IMG_1598`).

**Key findings:**

| Item | Detail |
|---|---|
| Main PCB | 6300WG1 REV.H, © 2004, Made in Mexico |
| 4-terminal screw block | `I/O#2 (DN)` \| `I/O#1 (UP)` \| `G24 (ground)` \| `P24 (+24V)` |
| Button press = | Shorting `I/O#1` or `I/O#2` to `G24` |
| Riser cable to controller | RJ-style modular jack |
| JST connectors | 3× — UP, DN, CHIME |
| Relays | 2× SMC relay modules, 24V, max 50 mA |
| Label | DC 250VDC 2.5A MAX, ASME A17.5, Intertek ETL |

## Bill of Materials (per floor)

| Part | Qty | Unit cost | Subtotal | Purpose |
|---|---|---|---|---|
| Seeed XIAO ESP32-C3 | 1 | $4.99 | $4.99 | MCU with WiFi + BLE |
| OMRON G3VM-61GR2 SSR | 2 | $4.90 | $9.80 | Solid-state relays for UP and DN |
| Pololu D24V5F3 buck converter | 1 | $8.95 | $8.95 | Step down from 24V to 3.3V |
| Passives (resistors, caps, connectors) | — | ~$1.00 | $1.00 | Supporting components |
| **Total** | — | — | **~$23.74** | |

## Communication

- **Primary:** BLE GATT. No building WiFi required. The robot (or nearby E-Box-equivalent hub) pairs with each floor's emulator when it needs to call the elevator.
- **Secondary:** WiFi + MQTT. Used for telemetry, firmware updates, and remote diagnostics.
- **No internet required for operation.** BLE is self-contained.

## Why BLE over LoRa

- **LoRa** is great for long-range shaft comms (E-Box), but each LoRa radio is expensive and the regulatory overhead is higher.
- **BLE** is built into every ESP32-C3 for free, has meter-scale range which is perfect for a per-floor device within reach of the arriving robot or a cabin-mounted hub, and is universally supported.
- If we need shaft-spanning comms later, add LoRa. Start with what's cheap.

## Safety analysis

| Concern | Mitigation |
|---|---|
| Could our circuit cause an unwanted floor call? | SSRs are normally open; firmware has software watchdog; power-on state is open |
| Could we interfere with fire recall? | No. Fire recall operates at the controller level; our parallel dry contact doesn't exist in that code path |
| Could we interfere with service mode? | No. Same reason — we're at the fixture, not the controller |
| Could a short in our board damage the controller? | 1500V galvanic isolation via optoisolated SSR |
| Could our board draw too much current from the fixture's 24V rail? | We power from a separate source or strictly bounded parasitic draw (<10 mA) |
| Could a firmware bug leave a contact closed? | Watchdog timer, mandatory pulse-width limits in firmware, SSR releases on power loss |

## Regulatory status

- **ASME A17.1** — the elevator safety code. Our integration sits outside the scope because it doesn't alter controller logic, safety circuits, or fire recall. Consultation with a QEI (Qualified Elevator Inspector) is still required per building.
- **UL / ETL listing** — our board will need its own listing for commercial install. Target: UL 508A control panel listing for the enclosure plus component-level listings for the ESP32-C3 and SSRs.
- **Permit requirements** — state-by-state. Some jurisdictions treat anything touching an elevator as requiring a licensed elevator mechanic to install; others don't.

## Patent landscape

See [`patent-analysis.md`](patent-analysis.md). Summary: Otis's key patent US8253548B2 expired October 2020, clearing the fundamental approach. No active patents found on the relay-parallel-to-buttons technique as we've designed it.

## Competitive landscape

| Product | Approach | Pros | Cons |
|---|---|---|---|
| **Keenon E-Box** | Shaft-mounted master/slave + LoRa + RFID | Proven, complete kit | $$, Keenon ecosystem, requires cabin-top install |
| **Golerobotics EVW-1** | (CES 2026 winner, closest analog) | Commercial, shipping | Watch closely — read teardown when available |
| **Savioke Relay+** | Mechanical button pushing | Works anywhere | Brittle, slow, weird UX |
| **OEM cloud API** (KONE, Otis, Schindler) | Controller-level | Native, high reliability | $$$$, requires partner agreement |
| **Accelerate universal emulator** | Per-floor fixture-level dry contact | $, vendor-agnostic, no cloud | Install requires fixture access |

## What we still need to decide / build

- Enclosure design that fits in an existing signal fixture backbox
- Install tooling (fixture opener, safe power-off procedure)
- BLE pairing and key rotation model
- Firmware OTA path
- UL listing strategy
- Reference customer (Thesis Hotel Phase 2+)

## Interactive demo

[`public/elevator-button-emulator.html`](../../../public/elevator-button-emulator.html) — browser-based demo of the emulator control flow. Good for pitches.

## Related

- [`keenon-ebox.md`](keenon-ebox.md) — Keenon's existing commercial equivalent
- [`thyssenkrupp-tac32t.md`](thyssenkrupp-tac32t.md) — the elevator we're first integrating against
- [`patent-analysis.md`](patent-analysis.md) — IP landscape
- [`../../20-architecture/adr/0005-button-emulator-vs-oem-api.md`](../../20-architecture/adr/0005-button-emulator-vs-oem-api.md) — decision record
