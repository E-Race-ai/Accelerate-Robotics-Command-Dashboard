# Elevator Integration

Getting robots into elevators is the single hardest problem in hospital and hotel robotics. This section covers the stack — from the physical elevator controller, to the bridge hardware, to our own planned universal button emulator.

## Why this matters

Most hospital robots are confined to a single floor because elevator integration is expensive ($5K–$15K per cab through OEM APIs) and slow. Accelerate Robotics' wedge is a 50–100x cost reduction using signal-fixture-level button emulation (~$23/floor).

## Contents

| File | What it covers |
|---|---|
| [`thyssenkrupp-tac32t.md`](thyssenkrupp-tac32t.md) | ThyssenKrupp TAC32T traction elevator — inspector guide summary, UIT menu, safety strings |
| [`keenon-ebox.md`](keenon-ebox.md) | Keenon's commercial E-Box bridge — LoRa/cloud paths, IO port mapping, wiring solutions |
| [`button-emulator.md`](button-emulator.md) | Our universal button emulator concept — ESP32C3 BOM, BLE GATT, safety analysis |
| [`patent-analysis.md`](patent-analysis.md) | Key patents and prior art (Otis US8253548B2 expired Oct 2020) |

## The integration stack

```
Robot (Keenon W3, etc.)
   │ LoRa (or WiFi → cloud → LoRa)
   ▼
Accelerate / Keenon E-Box
   │ Dry-contact relays (NO)
   ▼
Elevator signal fixture or controller I/O
   │
   ▼
Elevator controller (ThyssenKrupp TAC32T, KONE, Otis, etc.)
```

**Layers we target:**
1. **Signal fixture level** — parallel dry-contact into the button's own relay — vendor-agnostic, cheap, this is our wedge.
2. **Controller level** — OEM API (KONE, Otis, Schindler destination dispatch) — expensive, vendor-specific, fallback for new builds.
3. **OEM cloud adapter** — WebSocket/REST to the OEM's cloud — requires partner agreement, used when available.
