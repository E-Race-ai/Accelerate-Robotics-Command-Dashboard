# Domain Vocabulary

Terms the team uses. When in doubt, check here before making up a new name.

See also: [`docs/00-overview/glossary.md`](../../docs/00-overview/glossary.md) for the full glossary.

## Robotics

| Term | Meaning |
|---|---|
| **AMR** | Autonomous Mobile Robot — any floor-going wheeled robot |
| **BOM** | Bill of Materials — parts list with costs |
| **E-Box** | Keenon's robot-elevator bridge hardware (master + slave + RFID) |
| **LiDAR** | Light Detection and Ranging — laser scanner used for localization and obstacle detection |
| **LoRa** | Long Range low-power radio, 850–930 MHz — penetrates elevator shafts |
| **PEANUT** | Keenon's on-robot Android app (default PIN 0000) |
| **PEANUT APP** | Same as above — capitalization varies in Keenon docs |
| **Platform layer** | Our play — software that coordinates robots across vendors |
| **RaaS** | Robot-as-a-Service — leasing + management, not hardware sales |
| **RFID tag** | Passive floor marker on the shaft wall that tells the cabin which floor it's at |
| **SLAM** | Simultaneous Localization and Mapping — how robots build internal floor plans |

## Hospital

| Term | Meaning |
|---|---|
| **EVS** | Environmental Services — hospital cleaning crew |
| **HAPI** | Hospital-Acquired Pressure Injury — bedsore, preventable skin injury from immobility |
| **HAPU** | Hospital-Acquired Pressure Ulcer — same thing, older term |
| **SPHM** | Safe Patient Handling and Mobility — reducing caregiver injury from lifting patients |
| **VAP** | Ventilator-Associated Pneumonia |
| **KOL** | Key Opinion Leader — domain expert whose endorsement drives adoption |

## Elevator

| Term | Meaning |
|---|---|
| **Cab / Cabin** | The box you ride in |
| **Car call** | A request from inside the cab to go to a specific floor |
| **Destination dispatch** | Modern elevator UX where you enter your floor outside; the system tells you which cab |
| **Hall call** | A request at the elevator lobby (up or down button) |
| **Relay-parallel integration** | Wiring a dry contact across an existing button so the robot can "press" it |
| **Signal fixture** | The physical button panel at each floor |
| **TAC32T** | ThyssenKrupp traction elevator control system (what Thesis Hotel has) |
| **UIT** | User Interface Tool — service menu on the TAC32T CPUA card |

## Business

| Term | Meaning |
|---|---|
| **KOL** | Key Opinion Leader (see Hospital) |
| **RaaS** | Robot-as-a-Service |
| **SaaS** | Software-as-a-Service |
| **TAM** | Total Addressable Market |
| **Thesis Hotel** | Our first deployment site — 10-story hotel, Miami |

## Internal project terms

| Term | Meaning |
|---|---|
| **The wedge** | The universal button emulator — our $23/floor product that gets us into buildings |
| **One brain, many bots** | The strategic thesis — software orchestration over vendor lock-in |
