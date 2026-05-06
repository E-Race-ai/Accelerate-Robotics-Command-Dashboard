# PUDU T300 — Published Specifications

**Official product page:** https://www.pudurobotics.com/en/products/pudut300
**Positioning:** "PUDU T300 AMR — Intelligent Autonomous Mobile Robot for Industrial Material Delivery"
**Model codes:** WTID01 (standard), WTIDL1 (with lift)
**Captured:** 2026-04-15

## Specifications (verbatim from pudurobotics.com)

| Spec | Value |
|---|---|
| Machine Dimensions (W x D x H) | 835 x 500 x 1350 mm (32.87 x 19.69 x 53.15 in) |
| Machine Weight | 65 kg standard mode (143.30 lbs) |
| Maximum Payload | 300 kg (661.39 lbs) |
| Max Operating Speed | 1.2 m/s (3.94 ft/s) |
| Battery Capacity | 30 Ah |
| Charging Time | 2 h (from 0% to 90%) |
| Runtime | 12 h (no load) / 6 h (fully loaded) |
| Navigation Methods | VSLAM + Lidar SLAM |
| Min Path Clearance | 60 cm (23.62 in) |
| Max Threshold Crossing | 20 mm (0.79 in) |
| Max Groove Crossing | 35 mm (1.38 in) |
| Operating Temperature | 0°C to 40°C |
| Site Requirements | Indoor, flat ground |
| Compliance | ISO 3691-4 |
| Sensors | LiDAR, depth cameras, collision protection, e-stops |

## Operating modes (four modes on single platform)

1. Standard Mode — top-surface payload
2. Shelf Mode — fixed top-mounted shelving
3. Lifting Mode (WTIDL1 variant) — active scissor/platform lift for drive-under pickup
4. Towing Mode — pulls trailed carts

## Integration signals (from pudurobotics.com page)

- E-gates integration (img_e-gates)
- Elevator integration (img_elevator)
- Pager / call button integration (img_pager)
- App-based dispatch (img_app)
- Automatic recharging
- Easy-changeable (swappable) battery

## Notable gaps (not published)

- Specific bolt-hole pattern / mounting interface dimensions for top-plate fixtures
- Lifting-variant (WTIDL1) lift stroke, lift speed, and lift payload (distinct from chassis payload)
- Towing pin height / trailer hitch mechanical detail
- Public SDK / API for fleet dispatch — Pudu has "PUDU Open Platform" but no open docs URL found
- IP rating / outdoor rating (page states indoor-only)

## Source URLs

- https://www.pudurobotics.com/en/products/pudut300 (official)
- https://cdn.robotshop.com/media/P/Pud/RB-Pud-04/pdf/pudu-t300-20240828-operational-guide.pdf (official Pudu operation guide, v1.0.2, aug 2024 — saved as `manual.pdf`)
- https://log-robot.com/files/dateien/Downloads/PUDU_T300_Brochure.pdf (official Pudu brochure — saved as `brochure.pdf`)
- https://static.generation-robots.com/media/presentation-pudu-t300-en-2.pdf (Pudu presentation/datasheet via EU distributor — saved as `datasheet.pdf`)
- https://ca.robotshop.com/products/pudu-t300-industrial-delivery-robot-with-lift (WTIDL1 with-lift SKU)
- https://www.robotlab.com/pudu-t300 (US distributor)
