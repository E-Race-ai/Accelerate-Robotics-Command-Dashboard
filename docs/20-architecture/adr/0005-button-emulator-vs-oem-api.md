# ADR 0005 — Button emulator for elevator integration, not OEM APIs

- **Status:** Accepted
- **Date:** 2026-02-10
- **Deciders:** Eric

## Context

To move a robot between floors in any building we deploy in, we have to interact with the elevator. Our first site (Thesis Hotel) has a ThyssenKrupp TAC32T controller. Our future sites will have Otis, KONE, Schindler, Mitsubishi, Fujitec, ThyssenKrupp, and no-name Chinese and Turkish controllers. Every one of them is different.

The forces at play:

- **OEM APIs are gated, slow, and partnership-bound.** KONE has a RESTful destination-dispatch API, but it requires a formal partnership and only works on KONE elevators. Otis has Otis Integration Platform — also partnership-gated. ThyssenKrupp has MAX IoT — not an API for third-party robot control.
- **Keenon's E-Box is commercially available and OEM-agnostic,** but it's locked to Keenon robots and costs $$$ per install. We want to sell the platform, not lock customers into Keenon.
- **Modifying elevator firmware is illegal.** Anything that touches the elevator's certified software voids its inspection and its service contract.
- **Mechanical button-pressing (Savioke-style finger actuator) works but is ugly, unreliable, and maintenance-heavy.**
- **Relay-parallel wiring to existing push-buttons is proven, reversible, and OEM-agnostic.** You wire a dry contact across a button's screw terminals so the elevator sees a "button press" when you close the contact. Every elevator button on the planet works this way.

Patent landscape: the key Otis patent on automated elevator calls (US8253548B2) expired in October 2020. We are clear to build a generic relay-parallel product. See [`../../30-integrations/elevator/patent-analysis.md`](../../30-integrations/elevator/patent-analysis.md).

## Options considered

### Option A: Universal button emulator (relay-parallel)

- **Pros:**
  - OEM-agnostic — works on any elevator with push-button car call
  - ~$23/floor BOM (ESP32-C3 + 2× OMRON G3VM-61GR2 SSR + Pololu buck)
  - Reversible — pulling the board leaves the panel exactly as it was
  - Never touches firmware or safety string
  - Defensible — low-level intervention, no OEM cooperation needed
  - Keenon- or any-other-fleet-compatible
- **Cons:**
  - Each install is a physical visit, a panel opening, and a TK (or equivalent) mechanic on the clock
  - Only works with push-button controllers — destination dispatch buildings need a different strategy
  - Regulatory scrutiny varies by jurisdiction
  - Safety SSR selection must be rigorous (we chose OMRON G3VM-61GR2 for 1500V isolation)

### Option B: OEM integration (KONE / Otis / TK / Schindler APIs)

- **Pros:**
  - Officially sanctioned, lower install effort, no panel work
  - Destination-dispatch capable — the future of elevator UX
- **Cons:**
  - Partnership bottleneck — months of procurement for each OEM
  - Only covers one vendor per deal
  - Cost is per-building per-month in some cases
  - We don't control the API surface
  - Thesis Hotel's TK controller is old enough that the relevant API may not apply

### Option C: Keenon E-Box

- **Pros:**
  - Commercial, proven, Keenon-supported
- **Cons:**
  - Locked to Keenon robots — conflicts with our "one brain, many bots" thesis
  - Per-install cost + ongoing Keenon support cost
  - We'd be reselling Keenon hardware, not building a platform

### Option D: Mechanical button finger (Savioke-style)

- **Pros:** No panel modification, purely external
- **Cons:** Ugly, maintenance-heavy, patents (Savioke) crowded the space, reliability worse than electrical

## Decision

**Build the universal button emulator** as our first-party elevator integration. Design it so it:

1. Wires in parallel with existing push-buttons — never in series
2. Uses optically isolated SSRs rated for elevator voltages (OMRON G3VM-61GR2, 1500V isolation)
3. Runs BLE GATT for primary control with LoRa as fallback (elevator cabs are Faraday cages)
4. Costs under $25/floor in BOM
5. Leaves no visible change to the rider

We still support Keenon's E-Box as a fallback for buildings where our emulator doesn't fit or a customer insists on Keenon's solution. OEM APIs we layer on as optional modules if a partnership opens up — not as the base layer.

## Consequences

- **Positive:**
  - We can quote any elevator-integrating customer without waiting for a partnership
  - ~$23/floor BOM means our margin is healthy even at aggressive pricing
  - We own the IP (file defensively before public disclosure)
  - Aligns with the "no public API, work around it" thesis
- **Negative:**
  - Every install is physical and requires a licensed mechanic on site
  - Destination-dispatch elevators need a separate strategy (future ADR)
  - We carry the regulatory risk — FTO opinion and UL listing are our problem
  - If one SSR fails closed, an elevator button sticks — design must include watchdogs + manual override
- **Neutral:**
  - The product becomes our calling card — press, patents, and pitch material all flow from this

## Follow-ups

- File provisional patent before first public disclosure of BOM and technique
- Get a formal FTO opinion from a patent attorney before commercial launch
- Explore UL listing for the board
- Design the destination-dispatch variant as a separate product
- Partner with Keenon anyway — E-Box as a fallback, not the primary

## References

- [`../../30-integrations/elevator/button-emulator.md`](../../30-integrations/elevator/button-emulator.md)
- [`../../30-integrations/elevator/patent-analysis.md`](../../30-integrations/elevator/patent-analysis.md)
- [`../../30-integrations/elevator/thyssenkrupp-tac32t.md`](../../30-integrations/elevator/thyssenkrupp-tac32t.md)
- [`../../40-deployments/thesis-hotel/phase-2-elevator.md`](../../40-deployments/thesis-hotel/phase-2-elevator.md)
