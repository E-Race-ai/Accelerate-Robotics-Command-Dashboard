# Thesis Hotel — Phase 2: Elevator Integration

Phase 2 is where the platform thesis gets real: a robot that can move between floors, on its own, without touching the elevator OEM's API. This is also where our universal button emulator gets its first field test.

## Objective

Enable a **W3 delivery robot** to call and board Thesis Hotel's ThyssenKrupp TAC32T elevator, select a destination floor, exit, and return — without human intervention — using our relay-parallel button emulator.

## Why this matters

- **No public Keenon API, no public OTIS/TK API** — without elevator integration, the robot is marooned on whatever floor it starts on. This phase unlocks the hotel as a whole, not just corridors.
- **Every phase after this is elevator-dependent** — W3 room service, luggage, linens, pharmacy, food. Getting the elevator right is the keystone for the rest of the deployment.
- **First real-world test of the button emulator** — see [`../../30-integrations/elevator/button-emulator.md`](../../30-integrations/elevator/button-emulator.md). Thesis Hotel is the wedge that proves the wedge.

## Integration options considered

| Option | Cost | Risk | Status |
|---|---|---|---|
| **OEM destination dispatch API** | $$$$ | High — TK proprietary, 6-month cycle | Not available |
| **Keenon E-Box** | $$$ | Medium — vendor lock-in, only works with Keenon bots | Viable but rejected |
| **Our button emulator (relay-parallel)** | $ | Low — OEM-agnostic, no firmware touch | **Chosen** |
| **Mechanical finger actuator** | $$ | Medium — maintenance headache, ugly | Rejected |

See [`../../20-architecture/adr/0005-button-emulator-vs-oem-api.md`](../../20-architecture/adr/0005-button-emulator-vs-oem-api.md) for the decision record.

## Floors and I/O budget

Thesis Hotel is 10 stories. The robot needs to reach guest floors 4–10, plus return to staging on floor 2 or 3.

**I/O count:**
- 10 floor buttons (1–10, even if we only hit 2–10 functionally)
- 1 door-open button (for loading handoff)
- **11 total output channels needed**

Our button emulator uses **2 output channels per board**, so **6 boards** covers the 11 I/O. Alternatively, one 32-channel central hub covers everything with room to spare.

For Thesis Hotel we favor **6 small boards** — distributed deployment is easier to reason about when things go wrong, and individual boards are cheaper to replace.

| Button | Target SSR | Board |
|---|---|---|
| Floor 1 | SSR-A | Board 1 |
| Floor 2 | SSR-B | Board 1 |
| Floor 3 | SSR-A | Board 2 |
| Floor 4 | SSR-B | Board 2 |
| Floor 5 | SSR-A | Board 3 |
| Floor 6 | SSR-B | Board 3 |
| Floor 7 | SSR-A | Board 4 |
| Floor 8 | SSR-B | Board 4 |
| Floor 9 | SSR-A | Board 5 |
| Floor 10 | SSR-B | Board 5 |
| Door-open | SSR-A | Board 6 |

## Physical integration points

### Car call panel (inside each cab)

- Open the panel faceplate during an inspection window with the elevator mechanic present
- Identify the backplane terminal for each button — typically a screw terminal or IDC header
- Wire our SSR across the button's two terminals (parallel, not in series with the safety string)
- Zip-tie the board to the panel frame, leaving a service loop
- Close the faceplate — no visible change to the rider

See [`../../30-integrations/elevator/thyssenkrupp-tac32t.md`](../../30-integrations/elevator/thyssenkrupp-tac32t.md) for the TAC32T-specific panel wiring.

### Hall call panels (each floor lobby)

For Phase 2 we only need **one** hall call panel fitted with the board — the ground-floor panel where the robot starts its day. The robot always calls "up" from there and selects floors from inside the cab.

This keeps board count down and simplifies inspection.

### Power

Each board needs 5V DC at ~200 mA. The elevator panel has 24V DC available — our Pololu D24V5F3 buck regulator steps it down. No separate power run, no extra breaker.

### RF

BLE primary, LoRa fallback. The cab itself is a Faraday cage, so LoRa may be needed at the hall call panel. Test both paths during commissioning.

## The safety string — untouchable

**Nothing we install can sit on the safety string.** The safety string is the series of interlocks (door locks, limit switches, emergency stops, overspeed governor) that the elevator controller monitors to decide whether it's safe to move. A broken safety string = elevator refuses to run.

Our button emulator is **parallel** to existing push-button contacts — which sit *after* the safety string logic — so we physically cannot interfere with it. But we verify this with the elevator mechanic before the first wire goes in.

## Regulatory and contractual

- **Elevator service contract:** Any modification to the panel likely falls under the service contract. We need ThyssenKrupp's authorized mechanic present (and paid) for the install
- **Local elevator code:** Miami-Dade County requires an inspector sign-off on "modifications" to a passenger elevator. "No modification to the safety circuit" is our argument — confirm with the inspector before install day
- **Insurance:** Hotel's elevator insurance must be on file with us, and our general liability must cover elevator work
- **Permits:** TBD — check with Miami-Dade permitting

## Install day plan

### T-2 weeks
- Order the 6 boards (BOM in [`../../30-integrations/elevator/button-emulator.md`](../../30-integrations/elevator/button-emulator.md))
- Confirm date with ThyssenKrupp service, hotel ops, and our lead installer
- Pull the elevator out of service for 2 hours (pre-announced to guests)
- Print and post hotel signage ("Elevator Car #1 out of service 10–12, use Car #2")

### T-1 day
- Pre-test every board on the bench — power, SSR, BLE pairing, end-to-end relay closure
- Charge tools, pack service kit (crimps, heat shrink, ferrules, zip ties, clamp meter, DMM)
- Drive the path from shop to hotel and back so we know we have everything

### Day-of
- Meet ThyssenKrupp mechanic at the loading dock
- Put the elevator in service mode
- Work through each board 1–6 in order, testing after each
- Close panels, return to normal service
- Final end-to-end test: W3 robot calls, boards, rides, exits, returns to dock
- Photos of every installed board for the install log

### T+1 day
- Retrospective: what went well, what broke, what changes to the BOM or install procedure
- Update [`../../30-integrations/elevator/button-emulator.md`](../../30-integrations/elevator/button-emulator.md) with lessons learned

## Success criteria

- W3 completes 20 consecutive successful elevator rides with zero intervention
- No false button actuations from other BLE devices in the building
- Mechanical elevator experience for regular guests is unchanged
- No impact on elevator service metrics (no additional breakdowns or error codes)

## Fallback plan

If the button emulator doesn't work on install day:

1. Remove the boards, restore the panel to original state
2. Keenon E-Box is the fallback — already Keenon-compatible, commercially available
3. Use the fallback window to gather more data on why our board didn't work
4. Come back with a fix before phase 3

## Related

- [`site-survey.md`](site-survey.md)
- [`phase-1-c30.md`](phase-1-c30.md)
- [`risk-register.md`](risk-register.md)
- [`checklist.md`](checklist.md)
- [`../../30-integrations/elevator/thyssenkrupp-tac32t.md`](../../30-integrations/elevator/thyssenkrupp-tac32t.md)
- [`../../30-integrations/elevator/button-emulator.md`](../../30-integrations/elevator/button-emulator.md)
- [`../../30-integrations/elevator/patent-analysis.md`](../../30-integrations/elevator/patent-analysis.md)
- [`../../20-architecture/adr/0005-button-emulator-vs-oem-api.md`](../../20-architecture/adr/0005-button-emulator-vs-oem-api.md)
