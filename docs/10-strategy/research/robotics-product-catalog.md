# Accelerate Robotics — Ecosystem Product Catalog

**Date:** 2026-04-20
**Scope:** Every commercially available or marketed robot from companies listed on the Accelerate Robotics website
**Companies researched:** 19 robot manufacturers + 2 distributors
**Total models cataloged:** 95+
**Sources:** Official manufacturer websites, spec sheets, press releases, distributor pages

---

## Executive Summary

### By the Numbers

| Metric | Count |
|---|---|
| Companies on Accelerate website | 24 (including software/chip partners) |
| Qualifying robot manufacturers | 19 |
| Distributors (reselling other manufacturers) | 2 (Sebotics, Navia) |
| Total unique robot models cataloged | 95+ |
| Commercially available today | ~65 |
| Announced / early commercial | ~15 |
| Research-only / not for sale | ~8 |
| Discontinued | ~3 |

### Category Breakdown

| Category | Models | Key Players |
|---|---|---|
| **Delivery / Service** | 25+ | Keenon (T3/T8/T9/T10/T11), Pudu (BellaBot/HolaBot/PuduBot 2), LG (CLOi ServeBot) |
| **Cleaning** | 25+ | Keenon (C20/C30/C40/C55), Pudu (CC1/CC1 Pro/MT1/BG1), Avidbots (Neo/Kas), Navia (Phantas/Scrubber series) |
| **Hotel / Building Delivery** | 5 | Keenon W3, Pudu FlashBot Max, LG CLOi ServeBot Door-type |
| **Hospital Logistics** | 4 | Aethon TUG T3 (+ variants), Diligent Moxi |
| **Industrial AMR** | 15+ | Pudu (T150/T300/T600), KUKA (KMP series), Toyota (AGV fleet) |
| **Humanoid** | 10 | Keenon (XMAN-R1/F1), Pudu (D7/D9), Tesla Optimus, Figure 02/03, BD Atlas, 1X NEO |
| **Disinfection** | 3 | Blue Ocean UVD, Pudu Puductor 2, LG CLOi UV-C |
| **Autonomous Mobility** | 5 | WHILL (C2/F/R/Autonomous), DAAV (DAAV-air) |
| **Outdoor Delivery** | 2 | Serve Robotics, Coco |
| **Quadruped** | 2 | Boston Dynamics Spot, Pudu D5 |
| **Warehouse** | 2 | Boston Dynamics Stretch, Pudu T600 Underride |
| **Medical Robot Arm** | 1 | KUKA LBR Med |
| **Telepresence** | 1 | Blue Ocean GoBe |
| **Patient Transfer** | 1 | Blue Ocean PTR |
| **Consumer (Lawn)** | 1 | Keenon KEENMOW K1 |

### Key Market Observations

**Navigation:** LiDAR SLAM + Visual SLAM fusion is now the standard. Nearly every major manufacturer (Keenon, Pudu, Avidbots, Aethon, KUKA) uses some variant of dual SLAM. Pure marker-based navigation is relegated to budget/legacy models (Toyota Key Cart AGV).

**Payload ranges:**
- Delivery robots: 20–60 kg (restaurant/hotel)
- Heavy-load AMR: 100–600 kg (Keenon S100/S300, Pudu T150/T300/T600)
- Industrial AMR: 250–3,000 kg (KUKA KMP series)
- Humanoids: 20–50 kg lift capacity

**Deployment sectors:** Hospitality (restaurants, hotels) is the most saturated — Keenon, Pudu, LG, and Sebotics all compete here. Healthcare is under-penetrated — only Aethon (TUG) and Diligent (Moxi) have meaningful hospital deployments. This validates Accelerate's thesis.

**Pricing transparency:** Extremely low. Only ~15% of models have public pricing. Keenon is the most transparent (6 models priced via distributors: $899–$29,600). Pudu has some pricing via RobotLAB ($2,430/mo BellaBot lease, $31,250 CC1 purchase). Most industrial and hospital robots are quote-only.

**Elevator integration:** Available on Keenon W3/C30/S100 (E-Box IoT kit), Pudu FlashBot Max (KONE/OTIS cloud integration), Aethon TUG (mature serial/relay), LG CLOi ServeBot, and Diligent Moxi. Avidbots has NO elevator integration. This is a critical differentiator for multi-floor deployments.

**Fleet management:** Every major player has a cloud platform (Keenon Cloud/DynaSky, Pudu PUDU Link, Avidbots Command Center, Aethon TUG Mission Control, LG CLOi Station, KUKA.AMR Fleet). None coordinate across vendors — this is the gap Accelerate fills.

**VDA 5050:** Only Pudu T600 and KUKA KMP series explicitly support this fleet interoperability standard. Broad adoption would threaten Accelerate's coordination layer; current fragmentation validates it.

**Companies with strongest product transparency:** Keenon (detailed spec pages per model), Pudu (comprehensive with dimensions/weights), Boston Dynamics (Spot specs fully published), KUKA (professional datasheets). Weakest: Avidbots (no public pricing, limited specs), LG (product pages in flux/discontinued), DAAV (minimal specs published).

---

## Master Table

### Delivery & Service Robots

| Company | Model | Payload | Runtime | Speed | Nav | Elevator | Price (USD) | Status |
|---|---|---|---|---|---|---|---|---|
| Keenon | T10 | 40 kg | 8–12.5h | 1.0 m/s | VSLAM + stereo vision | No | $15K–$23K | Available |
| Keenon | T11 | 20 kg | 8–13.5h | 1.0 m/s | VSLAM + 5 stereo sensors | No | $19,700 | Available |
| Keenon | T9/Pro | 40 kg | 15–18h | 0.8–1.0 m/s | VSLAM | No | N/A | Available |
| Keenon | T8 | 20 kg | 13–16h | 1.0–1.2 m/s | SLAM (LiDAR+IMU+UWB) | No | $5.5K–$16.4K | Available |
| Keenon | T3 | 40 kg | 12h | 1.0 m/s | Positioning maps | No | N/A | Available |
| Keenon | W3 | 20 kg | 9–12h | 0.8 m/s | LiDAR + 3D cameras | **Yes (E-Box)** | $29,600 | Available |
| Keenon | S100 | 100+ kg | 8h | 1.0 m/s | LiDAR + stereo vision | **Yes (E-Box)** | N/A | Available |
| Keenon | S300 | 300 kg | 6–12h | 1.2 m/s | LiDAR SLAM + VSLAM | No | N/A | Available |
| Pudu | BellaBot | 40 kg | 13h | 1.2 m/s | Dual SLAM | Yes (IoT) | ~$15,900 / $2,430/mo | Available |
| Pudu | BellaBot Pro | 40 kg | 11h | 1.2 m/s | VSLAM+Marker+LiDAR | Yes | N/A | Available |
| Pudu | KettyBot Pro | 30 kg | 9h | 1.2 m/s | Laser+Visual dual | N/A | N/A | Available |
| Pudu | PuduBot 2 | 40 kg | 12–15h | 1.2 m/s | PUDU VSLAM+ | Yes (IoT) | N/A | Available |
| Pudu | HolaBot | 60 kg | 10–24h | 1.2 m/s | Dual SLAM | Yes (IoT) | N/A | Available |
| Pudu | FlashBot Max | 10 kg/comp | 9–12h | 1.2 m/s | VSLAM+LiDAR | **Yes (KONE/OTIS)** | N/A | Available |
| Aethon | TUG T3 | 450–600 lbs | 8–10h | 2 mph | LiDAR SLAM | **Yes (mature)** | ~$100K–$150K | Available |
| Diligent | Moxi | <10 lbs/grasp | 8–12h | 1.5–2 mph | LiDAR+depth cameras | **Yes** | ~$6K–$10K/mo | RaaS only |
| LG | CLOi ServeBot 3.0 | 40 kg | 11h | 1.2 m/s | AI + LiDAR+RGBD+ToF | **Yes** | N/A | **Discontinued** |
| LG | CLOi ServeBot Door | 30 kg/comp | N/A | N/A | AI navigation | **Yes** | N/A | Limited |
| Serve | Serve Gen 3 | 50 lbs | 6–8h | 7 mph | L4 autonomy, multi-camera+LiDAR | N/A | Per-delivery | Deployed (outdoor) |
| Coco | Coco 2 | 4x 18" pizzas | 20 mi range | 13 mph | Neural nets+LiDAR+GPS | N/A | Per-delivery | Deployed (outdoor) |

### Cleaning Robots

| Company | Model | Type | Efficiency | Runtime | Nav | Elevator | Price (USD) | Status |
|---|---|---|---|---|---|---|---|---|
| Keenon | C20 | 4-in-1 | 400 m²/h | 5h scrub | Autonomous | No | N/A | Available |
| Keenon | C30 | 3-in-1 dry | 600 m²/h | 6h sweep, 10h mop | Autonomous | **Yes (E-Box)** | $12,000 | Available |
| Keenon | C40 | 4-in-1 | 1,100 m²/h | 5h scrub, 12h sweep | LiDAR+stereo+ultrasonic | No | ~$8K–$12K | Available |
| Keenon | C55 | 3-in-1 | 2,376 m²/h | 5h/battery | 360° LiDAR+4 stereo cameras | No | N/A | Available |
| Pudu | CC1 | 4-in-1 | 700–1,000 m²/h | 5–9h | PUDU SLAM | Yes | ~$31,250 / $479–$917/mo | Available |
| Pudu | CC1 Pro | 4-in-1 AI | 700–3,000 m²/h | 5–9h | LiDAR+VSLAM+ | Yes | N/A | Available |
| Pudu | MT1 | Sweeper | 1,800–6,000 m²/h | 4–8h | VSLAM+Marker+LiDAR | Yes | N/A | Available |
| Pudu | MT1 Vac | Sweep+Vac | 1,400 m²/h | 3–6.5h | VSLAM+Marker+LiDAR | Yes | N/A | Available |
| Pudu | MT1 Max | Sweeper (outdoor) | 2,200–7,000 m²/h | 5–10h | VSLAM+3D LiDAR | Yes | N/A | Available (IP54) |
| Pudu | BG1/Pro | Large scrubber | 2,000–6,000 m²/h | 7.5h | 3D LiDAR+VSLAM | Optional | N/A | Available |
| Avidbots | Neo | Scrubber | 42,000 ft²/h | 4–6h | LiDAR+3D | No | N/A | Available |
| Avidbots | Neo 2W | Scrubber (warehouse) | 42,000 ft²/h | 4–6h | LiDAR+3D+ML | No | N/A | Available |
| Avidbots | Kas | Scrubber (compact) | N/A | 3h | LiDAR+3D | No | N/A | Available |
| Navia | Phantas | 4-in-1 compact | 7,500 ft²/h | 5–18h | LiDAR+3D depth | No | N/A | Available |
| Navia | Scrubber 50 | Scrubber | 16K–27K ft²/h | 3–8h | LiDAR | No | N/A | Available |
| Navia | Scrubber 75 | Scrubber (large) | 32,000 ft²/h | 4–6h | LiDAR | No | N/A | Available |

### Humanoid & Advanced Robots

| Company | Model | Type | DOF | Payload | Runtime | Price | Status |
|---|---|---|---|---|---|---|---|
| Keenon | XMAN-R1 | Wheeled humanoid | 30+ | ~20 kg | N/A | N/A | Early commercial |
| Keenon | XMAN-F1 | Bipedal humanoid | N/A | 10 kg/arm | N/A | N/A | Announced |
| Pudu | FlashBot Arm | Dual-arm mobile | 14 (2x7) | 15 kg | 8h | N/A | Early/Limited |
| Pudu | D5/D5-W | Quadruped | N/A | 20–30 kg | 2–3h | N/A | Available (IP67) |
| Pudu | D7 | Semi-humanoid | 30–50 | 10 kg/arm | 8+ h | N/A | Announced |
| Pudu | D9 | Bipedal humanoid | 42 | 20 kg | N/A | N/A | Research |
| Tesla | Optimus | Bipedal humanoid | N/A | 20 kg | N/A | ~$30K target | Internal only |
| Figure AI | Figure 02 | Bipedal humanoid | 35 | 25 kg | N/A | N/A | Partner deploy (BMW) |
| Figure AI | Figure 03 | Bipedal humanoid | N/A | N/A | N/A | N/A | Announced |
| Boston Dynamics | Spot | Quadruped | N/A | 14 kg | 90 min | $74,500 | **Available** |
| Boston Dynamics | Stretch | Warehouse | 7 (arm) | 23 kg/case | Multi-shift | ~$100K–$150K | **Available** |
| Boston Dynamics | Atlas Electric | Bipedal humanoid | 56 | 50 kg | 4h | N/A | Early adopter |
| 1X | NEO | Bipedal humanoid | 22/hand | 70 kg lift | 4h | $20,000 / $499/mo | Pre-order (2026) |
| 1X | EVE | Wheeled humanoid | N/A | N/A | N/A | N/A | Enterprise charter |

### Industrial / AMR

| Company | Model | Payload | Speed | Nav | VDA 5050 | Status |
|---|---|---|---|---|---|---|
| Pudu | T150 | 150 kg | 1.2 m/s | VSLAM+LiDAR | No | Available (ISO 3691-4) |
| Pudu | T300 | 300 kg | 1.2 m/s | VSLAM+LiDAR | No | Available (CE-MD) |
| Pudu | T600 | 600 kg | 1.2 m/s | VSLAM+LiDAR | **Yes** | Available |
| Pudu | T600 Underride | 600 kg | 1.2 m/s | LiDAR | **Yes** | Available |
| KUKA | KMR iisy | 200 kg + 11–15 kg arm | 1.5 m/s | SLAM+QR | Yes | Available |
| KUKA | KMR iiwa | 200 kg + 7–14 kg arm | 3 km/h | Laser scanners | Yes | Available |
| KUKA | KMR QUANTEC | 7,000 kg + 150 kg arm | N/A | Laser scanners | Yes | Available |
| KUKA | KMP 250P | 250 kg | N/A | SLAM+QR | Yes | Available (Dec 2025) |
| KUKA | KMP 600P | 600 kg | 2.0 m/s | SLAM+QR | **Yes** | Available |
| KUKA | KMP 1500P | 1,500 kg | 1.8 m/s | SLAM+QR | **Yes** | Available |
| KUKA | KMP 3000P | 3,000 kg | 1.2 m/s | SLAM+QR | **Yes** | Available |
| Toyota | CB18 | 1,814 kg | 6.7 mph | LiDAR natural features | No | Available |
| Toyota | M10 Tug | 998 kg | 1.9 mph | LiDAR natural features | No | Available |
| Toyota | ML2 | 200 kg | N/A | LiDAR | No | Available |
| Toyota | Key Cart | 499 kg | 1.6 mph | Magnetic tape | No | Available |

### Mobility / Transport

| Company | Model | Type | Speed | Range | Autonomous | Price | Status |
|---|---|---|---|---|---|---|---|
| WHILL | Model C2 | Power wheelchair | 5 mph | 12.4 mi | No (app remote) | $3,999–$4,499 | Available |
| WHILL | Model F | Foldable wheelchair | 3.7 mph | 12.4 mi | No | $2,499 | Available |
| WHILL | Model R | Mobility scooter | 5 mph | 10.7 mi | No | ~$2,999–$3,499 | Available |
| WHILL | Autonomous Model A | Self-driving wheelchair | N/A | N/A | **Yes (L4)** | B2B service | Deployed (15+ airports) |
| DAAV | DAAV-air | Autonomous wheelchair | N/A | N/A | **Yes** | B2B subscription | Early commercial |

### Disinfection / Specialty

| Company | Model | Type | Coverage | Runtime | Status |
|---|---|---|---|---|---|
| Blue Ocean | UVD Model C | UV-C disinfection | N/A | N/A | Available (75+ countries) |
| Blue Ocean | UVD Pharma | UV-C (pharma-grade) | N/A | N/A | Available |
| Blue Ocean | GoBe | Telepresence | N/A | 8h | Available |
| Blue Ocean | PTR | Patient transfer | N/A | N/A | Available (ISO 13485) |
| KUKA | LBR Med | Medical robot arm | 7–14 kg | N/A | Available (IEC 60601-1) |
| LG | CLOi GuideBot | Guide/escort | N/A | N/A | Limited |
| LG | CLOi UV-C Bot | UV-C disinfection | 15–30 min/room | N/A | Unclear |

---

## Company-by-Company Appendix

### Keenon Robotics (keenon.com) — Shanghai, China
- **Models found:** 15 (T3, T8, T9/Pro, T10, T11, W3, C20, C30, C40, C55, S100, S300, XMAN-R1, XMAN-F1, KEENMOW K1)
- **Product line active:** Yes, aggressively expanding (new models at CES 2026, Interclean 2026)
- **Public data quality:** Good — detailed spec pages, distributor pricing available
- **Elevator integration:** W3, C30, S100 via E-Box IoT kit (4G, LoRa, Ethernet, RS-485)
- **Fleet management:** Keenon Cloud / DynaSky platform
- **Relevance:** Hotels ★★★★★ | Hospitals ★★★★ | Restaurants ★★★★★ | Commercial ★★★★

### Pudu Robotics (pudurobotics.com) — Shenzhen, China
- **Models found:** 23 (BellaBot, BellaBot Pro, KettyBot Pro, PuduBot 2, HolaBot, FlashBot Max, T150, T300, T600, T600 Underride, CC1, CC1 Pro, MT1, MT1 Vac, MT1 Max, BG1/Pro, SH1, FlashBot Arm, D5/D5-W, D7, D9)
- **Product line active:** Yes, largest commercial robot portfolio of any company studied
- **Public data quality:** Good — comprehensive specs, some pricing via distributors
- **Elevator integration:** FlashBot Max (KONE/OTIS cloud), IoT integration on delivery line
- **Fleet management:** PUDU Link, PUDU Scheduler, VDA 5050 on T600
- **Note:** Sebotics (EU) and Navia (US) are authorized Pudu distributors
- **Relevance:** Hotels ★★★★★ | Hospitals ★★★ | Restaurants ★★★★★ | Commercial ★★★★★ | Industrial ★★★★

### Avidbots (avidbots.com) — Waterloo, Canada
- **Models found:** 3 (Neo, Neo 2W, Kas)
- **Product line active:** Yes, focused on cleaning only
- **Public data quality:** Low — no public pricing, limited published specs
- **Elevator integration:** None
- **Fleet management:** Avidbots Command Center (strong analytics, remote assistance)
- **Key gap:** Heavy machines (581–688 kg), no elevator capability, cleaning only
- **Relevance:** Hotels ★★★ | Hospitals ★★★ | Commercial ★★★★ | Airports ★★★★★

### Aethon / ST Engineering (aethon.com) — Pittsburgh, PA
- **Models found:** 3+ variants (TUG T3 base, Pharmacy, Linen/Waste, Manufacturing)
- **Product line active:** Yes, 500+ hospital deployments
- **Public data quality:** Medium — specs estimated from multiple sources
- **Elevator integration:** Yes — mature, serial/relay interface to elevator controllers
- **Fleet management:** TUG Mission Control (cloud dispatch, priority queuing, hospital system integration)
- **Key strength:** 20+ year hospital track record, FDA Class I for pharmacy, DEA chain-of-custody
- **Relevance:** Hotels ★★ | Hospitals ★★★★★ | Commercial ★★ | Manufacturing ★★★

### Diligent Robotics (diligentrobots.com) — Austin, TX
- **Models found:** 1 (Moxi)
- **Product line active:** Yes, RaaS-only model
- **Public data quality:** Medium — many specs estimated
- **Elevator integration:** Yes
- **Fleet management:** Cloud platform with nurse call/supply system integration
- **Key strength:** Only hospital robot with manipulation (7-DOF arm), social intelligence
- **Relevance:** Hotels ★ | Hospitals ★★★★★ | Senior living ★★★★

### LG Electronics CLOi (solutions.lg.com) — Seoul, South Korea
- **Models found:** 4 (ServeBot 3.0, ServeBot Door-type, GuideBot, UV-C Bot)
- **Product line active:** In transition — ServeBot 3.0 discontinued in US, shifting to Bear Robotics partnership
- **Public data quality:** Low — product pages disappearing, specs incomplete
- **Elevator integration:** Yes (ServeBot confirmed)
- **Fleet management:** CLOi Station (up to 20 robot coordination)
- **Key insight:** LG's retreat validates that hardware-only players need a platform layer
- **Relevance:** Hotels ★★★ | Hospitals ★★★ | Commercial ★★★

### Serve Robotics (serverobotics.com) — Los Angeles, CA
- **Models found:** 1 (Serve Gen 3)
- **Product line active:** Yes, scaling fleet
- **Public data quality:** Good (public company, NASDAQ: SERV)
- **Key partnership:** Uber Eats exclusive US robot delivery partner
- **Relevance:** Hotels ★ | Restaurants ★★★★ | Last-mile ★★★★★

### Coco Robotics (cocodelivery.com) — Los Angeles, CA
- **Models found:** 1 (Coco 2)
- **Product line active:** Yes, 1,000 robots deployed
- **Key partnerships:** Uber Eats, DoorDash, Wolt
- **Relevance:** Hotels ★ | Restaurants ★★★★ | Last-mile ★★★★★

### Boston Dynamics (bostondynamics.com) — Waltham, MA
- **Models found:** 3 (Spot, Stretch, Atlas Electric)
- **Product line active:** Yes
- **Commercially available:** Spot ($74,500) and Stretch — Atlas in early adopter program only
- **Fleet management:** Orbit platform
- **Relevance:** Hotels ★ | Hospitals ★ | Manufacturing ★★★★ | Inspection ★★★★★

### Figure AI (figure.ai) — Sunnyvale, CA
- **Models found:** 2 (Figure 02, Figure 03)
- **Status:** Not commercially available — BMW deployment only
- **Funding:** $1B+ Series C at $39B valuation
- **Relevance:** Future ★★★★★ | Current ★

### Tesla (tesla.com) — Austin, TX
- **Models found:** 1 (Optimus)
- **Status:** Internal factory use only, not commercially available
- **Relevance:** Future ★★★★ | Current ★

### 1X Technologies (1x.tech) — Moss, Norway
- **Models found:** 2 (NEO, EVE)
- **NEO:** Pre-order $20,000 / $499/mo — first consumer humanoid with real pricing, ships 2026
- **Caveat:** Most tasks still teleoperated as of late 2025
- **Relevance:** Future ★★★★ | Current ★★

### KUKA (kuka.com) — Augsburg, Germany
- **Models found:** 9 (KMR iisy, KMR iiwa, KMR QUANTEC, KMP 250P/600P/1500P/3000P, LBR Med, LBR iiwa)
- **Product line active:** Yes, comprehensive industrial lineup
- **Key for Accelerate:** LBR Med — only IEC 60601-1 certified robot arm for medical device integration
- **VDA 5050:** All KMP platforms support the fleet interoperability standard
- **Relevance:** Hotels ★ | Hospitals ★★★ (LBR Med) | Manufacturing ★★★★★

### Toyota (global.toyota/en/) — Toyota City, Japan
- **Models found:** 9 (6 commercial AGVs, 3 research-only: HSR, T-HR3, Punyo)
- **Commercial robots:** Material handling AGVs only (CB18, M10 Tug, ML2, Key Cart, Core Tow, Mouse & Mole)
- **Service/care robots:** Research only — HSR, T-HR3, Punyo not for sale
- **Relevance:** Hotels ★ | Hospitals ★ | Manufacturing ★★★★

### WHILL (whill.inc) — Tokyo, Japan
- **Models found:** 4 (Model C2, F, R, Autonomous Model A)
- **Key product:** Autonomous Model A — 1M+ rides, 15+ airports, zero injuries
- **Healthcare deployments:** 3+ hospitals in Japan
- **Relevance:** Hotels ★★★ | Hospitals ★★★★ | Airports ★★★★★ | Senior living ★★★★

### DAAV (daav.ch) — Biel/Bienne, Switzerland
- **Models found:** 1 (DAAV-air)
- **Status:** Early commercial — Zurich/Schiphol airport pilots
- **Funding:** CHF 1M seed
- **Key differentiator:** True omni-directional movement vs WHILL's differential drive
- **Relevance:** Airports ★★★★ | Hospitals ★★ (future)

### Blue Ocean Robotics (blue-ocean-robotics.com) — Odense, Denmark
- **Models found:** 4 (UVD Model C, UVD Pharma, GoBe, PTR)
- **Business model:** "Robot Venture Factory" — develops and spins off robot ventures
- **Certifications:** ISO 14001, ISO 9001, ISO 13485, ISO 27001
- **Key for Accelerate:** PTR Robot (patient transfer/rehab) — directly relevant to SPHM/Atlas Mobility crossover
- **Relevance:** Hotels ★★ | Hospitals ★★★★★ | Pharma ★★★★

### Sebotics (sebotics.com) — Switzerland
- **Role:** European distributor for Pudu Robotics + Juno AMR + Dobot
- **Unique products:** Juno Base, JunoBot Lift (200 kg), Callisto (lockable compartments), Dobot Atom Max (humanoid)
- **Not a manufacturer** — skip for product cards (Pudu products already cataloged)
- **Relevance:** EU distribution channel for Accelerate's cleaning fleet

### Navia Robotics (naviarobotics.com) — Los Angeles, CA
- **Role:** US distributor for Pudu Robotics + independent cleaning robots
- **Unique products:** ColliBot ($11,999 MSRP / $700/mo lease), Phantas, Vacuum 40/50, Scrubber 50/60/75
- **Cleaning robots appear to be Gaussian Robotics / third-party platforms**
- **Key data:** ColliBot is the only robot with published MSRP + lease rate on Navia's site
- **Relevance:** US distribution channel; Phantas/Scrubber line competes with Avidbots

---

## Strategic Implications for Accelerate

### 1. The Multi-Vendor Gap is Real
No single manufacturer covers delivery + cleaning + disinfection + transport. Keenon comes closest (delivery + cleaning + heavy-load) but has no disinfection or patient transport. Pudu has the broadest portfolio but still no healthcare-specific robots. **The coordination layer across vendors is the gap Accelerate fills.**

### 2. Elevator Integration is the Moat
Only 6 companies offer elevator integration: Keenon (E-Box), Pudu (KONE/OTIS cloud), Aethon (serial/relay), Diligent (unspecified), LG (confirmed), and the Accelerate universal button emulator. Avidbots — the cleaning market leader — has zero elevator capability. Any multi-floor deployment requires this, and Accelerate's universal approach is vendor-agnostic.

### 3. Hospital Robotics is Under-Penetrated
Only Aethon TUG (500+ hospitals) and Diligent Moxi (~10-20 sites) have meaningful US hospital deployments. Keenon wants a US healthcare partner but has no team. LG is retreating. Blue Ocean PTR serves patient transfer. **The hospital market is wide open for a platform player.**

### 4. Pricing Arbitrage is Viable
Keenon W3 (hotel delivery): $29,600 purchase. At $2,600/mo RaaS, breakeven is ~11 months. Keenon C30 (cleaning): $12,000 purchase → $1,800/mo RaaS → 7-month breakeven. Pudu BellaBot: $15,900 purchase → $2,430/mo lease already available. **The RaaS margin structure works.**

### 5. Fleet Software is Fragmented
Every manufacturer has its own cloud platform. None talk to each other. Keenon Cloud, PUDU Link, Avidbots Command Center, TUG Mission Control — all siloed. VDA 5050 adoption is minimal (only Pudu T600 and KUKA). **Accelerate's unified dashboard is the product.**

---

## Data Quality Notes

- All specs from official manufacturer websites, press releases, and authorized distributor listings
- Pricing from authorized distributors (Useabot, TOD System, RobotLAB, Navia, DentrealStore) — may vary by region
- "N/A" means not publicly listed; "No" means confirmed absent; blank means not researched for that model
- Humanoid availability should be verified monthly — this market moves fast
- LG CLOi status should be re-checked quarterly — product line is in active transition
- All data accessed April 20, 2026

---

## Source Index

### Keenon
- keenon.com/en/product/ (all model pages)
- useabot.com/collections/keenon-robot-shop (USD pricing)
- store.todsystem.com (EUR pricing)
- ca.robotshop.com (IoT elevator kit)

### Pudu
- pudurobotics.com/en/products (all model pages)
- robotlab.com (BellaBot/CC1 pricing)
- prnewswire.com (T300 CE-MD, BG1 Europe launch, D5 iREX)

### Avidbots
- avidbots.com/robots/ (Neo, Neo 2W, Kas)
- avidbots.com/platform/ (Autonomy, Command Center)

### Aethon
- aethon.com/products

### Diligent Robotics
- diligentrobots.com/moxi

### LG
- solutions.lg.com/us/robots
- lg.com/global/newsroom/

### Boston Dynamics
- bostondynamics.com/products/ (Spot, Stretch, Atlas)

### Figure AI
- figure.ai

### 1X Technologies
- 1x.tech/neo

### KUKA
- kuka.com/en-us/products/amr-autonomous-mobile-robotics/

### Toyota
- toyotaforklift.com/lifts/automated-guided-vehicles/

### WHILL
- whill.inc/us/ (all models + autonomous service)

### DAAV
- daav.ch

### Blue Ocean Robotics
- blue-ocean-robotics.com (UVD, GoBe, PTR)

### Navia
- naviarobotics.com (all products)

### Sebotics
- sebotics.com/en/ (all products)

### Serve Robotics
- serverobotics.com

### Coco
- cocodelivery.com
