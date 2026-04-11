# Robots

Vendor robot specs and software. Today the fleet is Keenon. As the platform grows, this will expand to other vendors (Pudu, Bear Robotics, Savioke, etc.).

| File | What it covers |
|---|---|
| [`keenon-c30.md`](keenon-c30.md) | C30 cleaning robot — carpet vacuum, dust push, guest-floor workhorse |
| [`keenon-c40.md`](keenon-c40.md) | C40 four-in-one hard-floor cleaner — sweep + vacuum + scrub + mop |
| [`keenon-w3.md`](keenon-w3.md) | W3 (ButlerBot) — enclosed delivery, hotel/office |
| [`keenon-t8.md`](keenon-t8.md) | T8 (Keenbot/Dinnerbot) — open-tray delivery |
| [`keenon-s100.md`](keenon-s100.md) | S100 open service cart — light payload (luggage, small bins) |
| [`keenon-s300.md`](keenon-s300.md) | S300 heavy service cart — bulk linens, food, supplies |
| [`fleet-software.md`](fleet-software.md) | Keenon mobile app, PEANUT on-robot, DynaSky Cloud, no public API |

## Why Keenon first

- Proven commercial product in hospitality and restaurants
- Arjo partnership gives Atlas Mobility existing channel to Keenon
- Full product line covers cleaning, delivery (open + enclosed), hospital variants
- E-Box is Keenon's own robot-elevator bridge — existing wiring reference for our button emulator

## Why not Keenon forever

- No public API or SDK — integration requires hardware or direct partnership
- 2.4GHz WiFi only (no 5GHz support) — hotel/hospital WiFi gotcha
- Cleaning robots have 10mm carpet pile limit and 20mm obstacle climb — physical constraints that bite at real sites
- T8 manual explicitly prohibits medical equipment proximity → unsuitable for patient-care areas
