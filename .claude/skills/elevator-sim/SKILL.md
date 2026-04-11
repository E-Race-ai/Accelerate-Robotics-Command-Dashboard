---
name: elevator-sim
description: Run the universal button emulator simulator with preset scenarios for testing elevator integration logic
---

# /elevator-sim — Run elevator button emulator scenarios

## When to use

User wants to test elevator integration logic — state machine transitions, relay timing, multi-robot contention — without needing real hardware.

## Prerequisites

- The button emulator simulator must exist. As of now, the interactive UI is [`public/elevator-button-emulator.html`](../../../public/elevator-button-emulator.html). A headless test runner is a TODO — see the roadmap.
- For live-hardware tests, the E-Box wiring reference is [`docs/30-integrations/elevator/keenon-ebox.md`](../../../docs/30-integrations/elevator/keenon-ebox.md).

## Scenarios

Ask the user which scenario to run. Common presets:

1. **Single robot, single call** — baseline happy path (1 robot, 1 floor request, success)
2. **Two robots, same floor** — contention (should batch into one ride)
3. **Two robots, opposite directions** — deadlock test (should serialize)
4. **Elevator stuck 30s in WAITING** — timeout escalation
5. **RFID read failure mid-ride** — floor detection fallback
6. **LoRa signal loss between E-Box master and slave** — degraded mode

## Steps

1. **Gather inputs** — scenario number + any overrides (robot count, building floor count, elevator bank size).
2. **Open the emulator page** — `open public/elevator-button-emulator.html` (or navigate to the running dev server).
3. **Configure the scenario** via the UI controls.
4. **Run** and observe. Watch for:
   - State transitions in the expected order
   - Relay pulse timing within spec
   - Timeouts firing at the documented durations
   - Error recovery paths taken when expected
5. **Record observations** in a scratch note or GitHub comment.
6. **If the emulator is insufficient**, flag that we need a headless test harness and add it to [`docs/60-roadmap/backlog.md`](../../../docs/60-roadmap/backlog.md).

## Notes

- This skill is currently interactive. Once a headless runner exists, update this file to automate the scenarios.
- State machine reference lives in [`docs/20-architecture/software-stack.md`](../../../docs/20-architecture/software-stack.md) section 3.
