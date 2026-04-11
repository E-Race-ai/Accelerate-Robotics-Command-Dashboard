# Keenon T8 (Keenbot / Dinnerbot / FeiYu) — Open-Tray Delivery Robot

The T8 is Keenon's open-tray delivery robot. It's the one you've seen in restaurants: three trays, a touchscreen face, and the occasional birthday song. Used for food and beverage delivery, lobby/lounge service, snack cruising.

## Specs at a glance

| Spec | Value |
|---|---|
| **Use case** | Restaurant food delivery, lobby/lounge tray service |
| **Dimensions** | 462 × 384 × 1096 mm |
| **Weight** | 35 kg (excluding charging pile) |
| **Trays** | 3 open trays, 383 × 342 mm each |
| **Payload** | 5 kg on top two trays, 10 kg on bottom — 20 kg max total |
| **Battery** | DC 25.9 V / 20.8 Ah |
| **Charge time** | ~5 hours |
| **Runtime** | 13–16 hours |
| **Working conditions** | 0–40 °C, 5–85% humidity, 300–20,000 lux |

## Sensors

- LiDAR
- 2× stereo vision cameras
- Image module
- Anti-collision strip

## Five operating modes

| Mode | What it does |
|---|---|
| **Delivery** | Multi-table, auto-routed, one tray assigned per table |
| **Snack** | Cruises preset routes, pauses when someone approaches (default 30 sec, max 5 min) |
| **Multi-Destination** | Up to 20 tables per run |
| **Direct** | Goes to one table, waits for next task; no auto-return, useful for takeout handoffs |
| **Birthday** | Navigates while playing celebration songs |

## Hard safety constraint — NOT for healthcare

**The T8 manual explicitly states it is NOT for use near electronic medical equipment or in healthcare facilities.**

Reasons are not specified in the user manual but likely include:

- RF interference risk with sensitive monitoring equipment
- No infection control features (open trays, no enclosed compartments)
- Lack of clinical environment testing / certification

**This is a hard rule.** For healthcare deployments, use the W3 (enclosed) or the C30 (cleaning) instead.

## Where T8 shines

- Hotel lobby and lounge service
- Restaurant floor delivery
- Bar snack cruising
- Retail cafe

## Deployment constraints

- Same 2.4 GHz WiFi requirement as other Keenon robots
- Floor surfaces must be compatible with omni-wheels
- Minimum ambient light of 300 lux (dimly lit bars can be a problem)
- Routes need to be pre-mapped by a Keenon technician

## Software

- **On-robot app:** PEANUT APP (Android)
- **Default PIN:** `0000` — change before deployment
- **Managed via:** Keenon Robotics app + DynaSky Cloud

## Maintenance schedule (broadly applicable to all Keenon robots)

- **Daily:** Clean LiDAR, RGB-D camera, image module with a microfiber cloth
- **After each use:** Wipe with a soft damp cloth, then dry
- **Every 6 months:** Full bottom inspection + safety function check
- **Every 6 months:** Mandatory safety inspection by Keenon after-sales (auto-reminder 1 week before)

## Use case at Thesis Hotel

- **Lobby / lounge tray service** — cocktails, small plates, welcome drinks, amenity cart top-off
- **Cafe area** — self-service reset, light cleaning support

**NOT** for any in-room delivery or hospital-adjacent service.

## Source

- User manual (French): `/Users/ericrace/Desktop/Guide-dutilisation-Dinnerbot-T8.pdf`
- In-repo copy: [`../../assets/datasheets/keenon-t8.pdf`](../../assets/datasheets/keenon-t8.pdf) *(move binary when ready)*

## Related

- [`keenon-c30.md`](keenon-c30.md) — cleaning
- [`keenon-w3.md`](keenon-w3.md) — enclosed delivery (use this for healthcare and private hotel delivery)
- [`fleet-software.md`](fleet-software.md) — management software
