# Market Landscape

## Market signal — the "Bedrock Moment"

**Bedrock Robotics raised $270M Series B** from Capital G and NVIDIA Ventures to coordinate construction robot fleets. Investors are funding **the platform layer that coordinates fleets**, not the individual robots themselves. This is the exact analog of the Accelerate Robotics thesis in an adjacent vertical.

If the platform thesis is the right shape for construction, it is the right shape for hospitals — which have harder constraints (regulatory, patient safety, elevator integration) and a bigger labor crunch.

## Adjacent funding signals

| Company | Round | Amount | Valuation | Why it matters |
|---|---|---|---|---|
| Figure AI | Series B | $675M | $2.6B | Humanoids for commercial settings |
| 1X Technologies | Series C | $100M | — | Humanoid assistants |
| Bedrock Robotics | Series B | $270M | — | **Platform layer for construction fleets** |
| Keenon Robotics | Series D+ | $200M | — | Our primary hardware supplier |
| Pudu Robotics | Series C | $150M | — | Direct Keenon competitor |

Combined public market cap of listed robotics players (Tesla, NVIDIA, Alphabet, Toyota, Serve, Intuitive) is in the trillions. The private-round data is live on the landing page via the `/api/stocks` endpoint.

## Competitive landscape

### Direct competitors (robotics orchestration platform)

- **Diligent Robotics** — Moxi robot, hospital-focused, closed ecosystem (one robot, one vendor). We differentiate by being vendor-neutral.
- **Aethon** — TUG robot, hospital logistics, acquired by ST Engineering. Closed hardware.
- **Pudu / Keenon** — hardware-first, no meaningful multi-vendor orchestration layer.
- **Cobionix / various** — early-stage startups in sensing and pharmacy.

### Indirect competitors (elevator integration)

- **Keenon E-Box** — commercial robot-elevator bridge. Works great *if you only have Keenon robots*. Our universal button emulator works for any vendor.
- **Golerobotics EVW-1** — CES 2026 winner, closest commercial analog to the button emulator. Watch closely.
- **Savioke Relay+** — legacy mechanical button pressing. Clever but brittle.
- **KONE / Otis / Schindler cloud APIs** — work if the building has modern elevators and the OEM agrees. Most hospitals don't and most OEMs won't.

### Adjacent partners (not competitors)

- **Atlas Mobility** — our own Phase 1.5 category
- **Figure / 1X / Agility / Apptronik / Tesla Optimus** — Phase 3 humanoid suppliers
- **Boston Dynamics** — Spot already in some hospitals for inspection; could be a fleet category later

## Why Accelerate wins

1. **Vendor neutrality.** Every point-solution competitor is betting on one robot; we're betting on the platform that runs *all* of them.
2. **Elevator wedge.** The universal button emulator at $23/floor undercuts $5K–$15K OEM API integration by 100x. No competitor has this.
3. **Hospital domain depth.** Atlas Mobility gives us working relationships in Phase 1.5 territory that pure-play robotics startups don't have.
4. **Software moat.** The value compounds in the orchestration layer — task routing, compliance, analytics, multi-tenant fleet management.
5. **Miami geography.** Outside the SF robotics bubble, closer to the Southeast health systems and Latin American markets. See ADR-0004.

## Narrative

See [`narrative.md`](narrative.md) for the "support, not replacement" positioning we use with hospital customers and healthcare workers.

## Related

- [`thesis.md`](thesis.md) — strategic thesis
- [`business-model.md`](business-model.md) — revenue streams
- [`../20-architecture/adr/0005-button-emulator-vs-oem-api.md`](../20-architecture/adr/0005-button-emulator-vs-oem-api.md) — elevator integration decision
