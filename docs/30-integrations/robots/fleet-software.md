# Keenon Fleet Software

How you talk to Keenon robots today. Short version: mobile app or physical touchscreen. No public API.

## The four layers

### 1. Keenon Robotics app — mobile

This is what operators and customers install. It's how you call robots, assign tasks, check status.

- **iOS:** App Store — search "Keenon Robotics" (Bundle ID `6453023647`)
- **Android:** Google Play — package `com.keenon.mobile`
- **Version (as of late 2025):** 2.5.1

**Features:**
- Remote Call — summon a robot from your phone
- Task Progress — real-time status
- Robot Management — per-robot settings
- Multi-point Call — summon to multiple locations
- DynaSky Cloud — multi-location fleet management
- Data reporting and analytics
- Ad screen configuration (for the robot's display)
- Real-time position map (C30 cleaning robots specifically)

**Developer contact:** `developer@keenon.com` / `global@keenon.com`

### 2. PEANUT APP — on-robot Android app

Not downloadable. Built into the touchscreen of every W3 and T8. Auto-launches on boot (~40 seconds).

- **Default PIN:** `0000` — **change this at every deployment**
- Controls: task creation, mode selection, compartment door unlock, charging commands, notification settings, volume, password

This is also what you use when something goes wrong with the robot and you need to get behind the consumer-facing UI.

### 3. KEENON Cloud Platform / DynaSky Cloud

- No standalone web URL — accessed via the mobile app
- Real-time fleet monitoring, route and trajectory history, IoT telemetry
- **DynaSky Cloud** for multi-store / multi-location management
- **GDPR certified** (2023)

### 4. No public API / SDK

**Keenon does not offer a public developer API or SDK.** Integration happens through:

- **E-Box hardware** for elevator/IoT glue
- **Direct partnership** for deeper integration
- **Known carve-outs:** KONE elevator API partnership exists (deployed at Galen Science Park, Singapore)
- **Internal SDK** exists per Keenon job listings — but not publicly available

## Implications for Accelerate Robotics

1. **We can't build a software-only orchestration layer for Keenon robots today.** Anything we coordinate has to go through the mobile app, E-Box hardware, or a partnership relationship.
2. **Button emulator is our independence play.** Even if Keenon never gives us API access, the universal button emulator lets us coordinate *elevators* independent of Keenon's software stack.
3. **Our platform's adapter model must assume "no public API"** as a baseline. KONE, Otis, and others have APIs — great, use them. Keenon doesn't — work around it.

## Connectivity summary

| Layer | Protocol | Purpose |
|---|---|---|
| Primary | 2.4 GHz WiFi (802.11 b/g/n) | Robot ↔ cloud, robot ↔ app |
| Cellular | 4G LTE (W3 only) | Fallback connectivity |
| Elevator | LoRa 850–930 MHz via E-Box | Robot ↔ elevator control |
| Building | RS-485 / Ethernet via E-Box | Elevator machine room |
| Phone | RJ11 via T-Box | Auto room-call on delivery arrival |

**Critical: All Keenon robots are 2.4 GHz WiFi only. No 5 GHz support.**

See [`../facilities/wifi-requirements.md`](../facilities/wifi-requirements.md) for the network gotchas this creates.

## Related

- [`keenon-c30.md`](keenon-c30.md) — C30 specs
- [`keenon-w3.md`](keenon-w3.md) — W3 specs
- [`keenon-t8.md`](keenon-t8.md) — T8 specs
- [`../elevator/keenon-ebox.md`](../elevator/keenon-ebox.md) — E-Box hardware
- [`../../60-roadmap/open-questions.md`](../../60-roadmap/open-questions.md) — partnership strategy with Keenon is an open question
