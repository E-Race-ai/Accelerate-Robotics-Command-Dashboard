# Glossary

Full list of terms you'll see across this repo. When you invent a new term, add it here. When you rename one, update every reference.

For the short version used by Claude Code day-to-day, see [`../../.claude/rules/domain-vocabulary.md`](../../.claude/rules/domain-vocabulary.md).

## Robotics and platform

| Term | Definition |
|---|---|
| **AMR** | Autonomous Mobile Robot — any wheeled floor-going robot that localizes and navigates on its own |
| **BLE** | Bluetooth Low Energy — used by the button emulator for primary control |
| **BOM** | Bill of Materials — itemized parts list with cost per unit |
| **Button emulator** | Our universal elevator integration product — a small board that wires parallel to existing push-buttons and lets a robot "press" them over BLE/LoRa |
| **Destination dispatch** | Modern elevator UX where you enter your floor at the lobby and the system tells you which cab to take — bypasses traditional hall/car call |
| **E-Box** | Keenon's proprietary robot-elevator bridge hardware (master + slave + RFID tags) |
| **FTO** | Freedom To Operate — a legal opinion that a product doesn't infringe existing patents |
| **LiDAR** | Light Detection and Ranging — laser scanner used for localization and obstacle detection |
| **LoRa** | Long Range low-power radio, 850–930 MHz — penetrates elevator shafts where BLE can't |
| **One brain, many bots** | Our strategic thesis — platform software that coordinates robots across vendors, instead of selling locked-in fleets |
| **PEANUT / PEANUT APP** | Keenon's on-robot Android app (default PIN `0000`, capitalization varies in their docs) |
| **Platform layer** | Our product — software that sits above robot OEMs and below the hospital/hotel operator |
| **RaaS** | Robot-as-a-Service — leasing robots bundled with management, instead of selling hardware outright |
| **RFID tag** | Passive floor marker on the shaft wall that tells the cabin which floor it's at (used by E-Box) |
| **SLAM** | Simultaneous Localization and Mapping — how robots build and update internal floor plans |
| **SSR** | Solid-State Relay — transistor-based switch with no mechanical contacts; used in the button emulator for switching elevator button circuits |
| **T-Box** | Keenon accessory that bridges RJ11 telephone systems for room-phone call-on-delivery |
| **The wedge** | Internal shorthand for the button emulator — the low-cost product that gets us into buildings |
| **TTFR** | Time To First Robot — our internal metric for how long it takes to go from contract to first live deployment |

## Elevator

| Term | Definition |
|---|---|
| **Cab / Cabin** | The box passengers ride in |
| **Car call** | A button press inside the cab to go to a specific floor |
| **CPUA** | Central Processing Unit card in the TAC32T controller — hosts the UIT service menu |
| **Hall call** | A button press at the elevator lobby (up or down button) |
| **Machine room** | The room housing the elevator controller and motor (may be at top, bottom, or beside the shaft) |
| **Relay-parallel integration** | Wiring a dry contact across an existing button so the robot can "press" it electrically, without touching firmware or the safety string |
| **Safety string** | The series of interlocks the controller monitors to decide whether motion is safe — door locks, limits, governors, e-stops |
| **SCCB / SCC2 / SCCT** | Service modes in the TAC32T UIT menu |
| **Signal fixture** | The physical button panel at each floor |
| **TAC32T** | ThyssenKrupp traction elevator control system — what Thesis Hotel has |
| **UIT** | User Interface Tool — service menu on the TAC32T CPUA card, used by mechanics for configuration |

## Hospital / healthcare

| Term | Definition |
|---|---|
| **EVS** | Environmental Services — hospital cleaning crew |
| **HAPI** | Hospital-Acquired Pressure Injury — bedsore / pressure ulcer acquired in hospital (preventable) |
| **HAPU** | Hospital-Acquired Pressure Ulcer — older term for HAPI |
| **SPHM** | Safe Patient Handling and Mobility — clinical program to reduce caregiver injury from lifting patients |
| **VAP** | Ventilator-Associated Pneumonia |
| **KOL** | Key Opinion Leader — a domain expert whose endorsement drives adoption |
| **PMS** | Property Management System — the hotel industry equivalent of an EHR |

## Business and operational

| Term | Definition |
|---|---|
| **ARR** | Annual Recurring Revenue |
| **Capex** | Capital expenditure — hardware buys, building fit-out |
| **FTO** | See robotics section |
| **GL** | General Liability (insurance) |
| **LOI** | Letter of Intent |
| **MRR** | Monthly Recurring Revenue |
| **Opex** | Operational expenditure — ongoing service and maintenance costs |
| **POC** | Proof of Concept |
| **RaaS** | Robot-as-a-Service (see robotics section) |
| **SLA** | Service Level Agreement |
| **TAM** | Total Addressable Market |
| **Thesis Hotel** | Our first deployment site — a 10-story hotel in Miami |

## Technical / platform

| Term | Definition |
|---|---|
| **ADR** | Architecture Decision Record — a short markdown file capturing a technical decision, its context, and its consequences |
| **CSP** | Content Security Policy — HTTP header that controls which origins the browser may load resources from |
| **JWT** | JSON Web Token — signed token used for admin auth |
| **Monolith** | Single Node.js process serving API + static files (what Accelerate Robotics runs today) |
| **SQLite / WAL** | The backing store (SQLite) with write-ahead logging (WAL) enabled for concurrency and crash resilience |

## Related

- [`../../.claude/rules/domain-vocabulary.md`](../../.claude/rules/domain-vocabulary.md) — shorter domain-only version
- [`project-snapshot.md`](project-snapshot.md) — current state
