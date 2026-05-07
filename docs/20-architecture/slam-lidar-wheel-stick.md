# SLAM LiDAR Wheel-Stick — Building Scanner Research

**Form factor:** measuring-wheel-style pole — one wheel on the ground, LiDAR mounted on the shaft, walked through a building like a cane.

## Why the wheel matters

Commercial handheld SLAM scanners are almost always held vertically or clipped to a survey pole. In long hotel and hospital corridors — featureless, parallel walls, repeating doors — pure LiDAR-inertial SLAM drifts because there's nothing unique for the solver to lock onto.

A **wheel encoder** adds a ground-truth distance signal. Distance per tick is known, so scale and heading are constrained even when the walls look identical. This is the same trick NavVis M6 uses as a trolley; putting it on a handheld stick is the novel part.

## Commercial products

| Product | Price | Form factor | Notes |
|---|---|---|---|
| **NavVis M6** | ~$80K+ | 4-wheel trolley | Survey-grade, 6D SLAM, wheel-based. Closest in spirit. |
| **Emesent GX1** (2026) | POR | Pole / backpack / vehicle | 5–10 mm accuracy, RTK + 360° imagery. New. |
| **Artec Jet** (2026) | POR | 7 modes incl. pole | 10 mm indoor, 5 mm change detection. |
| **CHCNAV RS7** (2026) | POR | Handheld | Purpose-built for long corridors. |
| **FARO GeoSLAM ZEB Horizon RT** | ~$49K | Handheld / pole | 16 sensors, 100 m range. Proven. |
| **Stonex X40GO** | ~$17K w/ SW | Handheld | Cheapest survey-grade SLAM. |
| **XGrids Lixel K1** | lower tier | Handheld | Budget option. |
| **GreenValley LiGrip O2 Lite** | $7,795 | Handheld | Cheapest survey-grade at scan. |

**None of these use a wheel encoder in stick form.** That gap is the opportunity.

## DIY build — the ideal match

| Part | Cost | Role |
|---|---|---|
| Livox Mid-360 | ~$900 | 360° 3D LiDAR + built-in IMU |
| Rotary encoder (CUI AMT103 or similar) | ~$30 | Wheel odometry |
| Jetson Orin Nano | ~$500 | Onboard compute |
| Battery, pole, wheel, 3D-printed mount | ~$150 | Rig |
| **Total** | **~$1,580** | |

**SLAM stack options (all open source):**
- **FAST-LIO2** — fastest, most tested on Mid-360
- **LIO-Livox** — native Livox support, stable indoors
- **MOLA-SLAM** (ROS2) — GICP/ICP, modular

**Sensor fusion:** the RSS-LIWOM paper shows LiDAR + IMU + wheel encoder reduces corridor drift dramatically vs. LiDAR-IMU alone. Standard iterated Kalman filter formulation.

## Recommended path for Accelerate Robotics

Two-phase approach:

**Phase 1 — rent to validate (this month).** Rent a GeoSLAM ZEB Horizon from Kwipped (~$1,100/mo) or HTS-3D. Scan Thesis Hotel, Moore, and Art Ovation. Prove the workflow, get Keenon the maps they need.

**Phase 2 — build the wheel-stick (next quarter).** Livox Mid-360 + wheel encoder + FAST-LIO on Jetson. ~$1,600 BOM. We own the pipeline, reuse on every new deal, and the corridor-drift advantage is real. Could even become a differentiator we lease to hotel operators.

## Sources

- [Emesent GX1 launch — Geo Week News](https://www.geoweeknews.com/news/emesent-launches-an-all-in-one-slam-lidar-rtk-and-360-imagery-scanner)
- [Emesent GX1 — GPS World](https://www.gpsworld.com/new-emesent-gx1-is-all-in-one-slam-lidar-rtk-and-360-imagery-scanner/)
- [CHCNAV RS7](https://geospatial.chcnav.com/products/chcnav-rs7)
- [Artec Jet launch](https://www.artec3d.com/news/artec-jet-release)
- [NavVis M6 trolley system](https://www.geoweeknews.com/news/navvis-m6-6d-slam-large-scale-indoor-lidar-mapping)
- [FARO GeoSLAM ZEB Horizon RT](https://www.faro.com/en/Products/Hardware/GeoSLAM-ZEB-Horizon-RT)
- [Stonex X40GO](https://stonex.it/product/x40go-slam-laser-scanner/)
- [Handheld scanner price guide — E38](https://e38surveysolutions.com/pages/handheld-3d-scanner-price-guide)
- [2026 SLAM handheld roundup — Geo Week News](https://www.geoweeknews.com/news/lidar-mobile-mapping-scanning-slam-navvis-exyn-emesent-geocue-faro-stonex)
- [Livox Mid-360](https://www.livoxtech.com/mid-360)
- [LIO-Livox — GitHub](https://github.com/Livox-SDK/LIO-Livox)
- [MOLA-SLAM for Mid-360 — GitHub](https://github.com/Whan000/MOLA-SLAM)
- [RSS-LIWOM — LiDAR-inertial-wheel odometry paper](https://www.mdpi.com/2072-4292/15/16/4040)
- [GeoSLAM rental pricing — Kwipped](https://www.kwipped.com/rentals/product/geoslam-zeb-horizon/27875)
