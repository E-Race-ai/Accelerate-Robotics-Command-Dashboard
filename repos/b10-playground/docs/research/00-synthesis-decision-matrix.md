# Open-Source Mobility, Sleep, Fall, and Vision Toolkits — Decision Matrix

**Audience:** Accelerate Robotics + Atlas Mobility engineering team.
**Goal:** Adopt existing well-maintained open-source pipelines instead of training from scratch. This page is the master synthesis; full per-track research lives in the four sibling docs.

**Atlas context that shaped these picks:**
- Atlas already has a clinically-sound 6-class in-bed turn detector running in Swift on Apple Watch SE (`AtlasTurnMonitor`, 10 Hz CoreMotion → low-pass gravity → roll angle → Q2h thresholds). **Don't replace it.** Augment with toolkits that fill what it doesn't cover (gait when patient ambulates, sleep at night, fall detection during transfer, sit-to-stand quality, sedentary time).
- Atlas's P.I.P Data Fusion Engine already ingests HL-7 → FHIR is a natural step, **Open mHealth** as the upstream envelope is the strategic emit format.
- Apple-native pivot is documented → favor toolkits with CoreML / Swift ports (MediaPipe, YAMNet, anything TFLite-convertible).
- BMM, UMM, Patch, Mobility Cloud are existing products — open-source toolkit outputs should populate their UIs, not replace them.

---

## TL;DR — adopt this stack first

| Layer | Pick | License | Why |
|------|------|---------|-----|
| **Wearable IMU analytics (gait, sleep, activity, sit-to-stand)** | **scikit-digital-health (skdh)** | MIT | Pfizer-maintained; one library covers 4 categories; the official successor to deprecated `gaitpy` and `sleeppy`; 25 Hz works fine; RPi-deployable. **Already wrapped in `sidecar/algorithms/`.** |
| **Clinical-citation-grade gait** | **mobgap (Mobilise-D)** | Apache-2.0 | Just hit v1.0 (April 2026); n>2,300 multi-cohort validation; the only library that lets you tell hospitals "Mobilise-D-validated walking speed." Wrap as second gait module. |
| **Sleep staging — wearable** | **Cole-Kripke (1992)** | public domain | ~88% PSG agreement; pure signal processing; **already wrapped**. Upgrade to **Walch et al.** (HR + accel → wake/NREM/REM, MIT-style open) when a HR strap pairs with B10. |
| **Sleep staging — PSG (future)** | **YASA** | BSD-3 | 87.5% accuracy (eLife paper); industry-standard math for TST/SOL/WASO/SE. Adopt when EEG sensor enters scope. |
| **Vision pose (room cameras)** | **RTMPose via rtmlib** | Apache-2.0 | 4 deps, ONNX/TensorRT-ready; 30-60 FPS on Jetson Orin Nano FP16; 17/26/133-keypoint flavors. Skeleton-only output = privacy-preserving. |
| **Vision skeleton-action / fall classifier** | **PySKL + PoseConv3D** | Apache-2.0 | Vendor (don't pip-install — repo unmaintained) the PoseC3D config and weights. More robust to pose noise than ST-GCN family. |
| **Browser-side / dashboard pose** | **MediaPipe Pose Landmarker** | Apache-2.0 | Google-maintained; ships as `@mediapipe/tasks-vision` for Node/browser — perfect for the Accelerate command center stack. |
| **Contactless room-scale (fall + vital signs)** | **TI mmWave Industrial Toolbox + IWR6843AOPEVM** ($186) | TI BSD | Production reference apps for 3D People Tracking + Fall Detection (>90% @ 6.5m), Vital Signs (HR ±5 bpm, RR ±2 bpm). All inference on-chip. |
| **Contactless embedded (breathing in headwall)** | **Acconeer A121 / XM125 + acconeer-python-exploration** ($50) | BSD | $50 SparkFun Qwiic radar with `pip install acconeer-exptool[app]`. Most under-rated radar in the open ecosystem. |
| **HAPI moonshot (Atlas's whitespace)** | **BodyPressure (Georgia Tech)** | MIT | Depth-only contact-pressure inference. Strategically the highest-value single repo — directly maps to pressure-injury prevention. |
| **Acoustic events (snore, cough, fall sound)** | **YAMNet** | Apache-2.0 | 521-class AudioSet classifier; TFLite version runs on Coral / RPi / Jetson. CoreML port exists. |
| **Vitals from PPG / ECG (when HR added)** | **NeuroKit2** | MIT | HRV, breathing rate, signal cleaning. Most production-ready vitals lib. |
| **Edge-to-cloud platform** | **RADAR-base** | Apache-2.0 | The only OSS mHealth platform that's both production-proven (RADAR-CNS, Janssen, UCB, King's College Hospital) AND actively shipped (April 2026). Helm chart, Kafka, pre-built connectors for Fitbit/Garmin/Oura/Polar/Empatica. |
| **iOS patient-app side** | **Stanford Spezi** | MIT | FHIR-native, HealthKit-native, Stanford BDHG ships weekly. Pediatric Apple Watch Study uses it in production. Pair with Google's Kotlin FHIR Multiplatform for Android parity. |
| **Output envelope (everything)** | **Open mHealth IEEE 1752.1-2021** → **HL7 FHIR R4 Observation** | open standard | **Already wrapped in `sidecar/schemas/omh.py`.** Sales line: "Atlas emits Open mHealth and FHIR — same as UK Biobank, Mayo, Stanford. No proprietary blobs." |

---

## License-safety blocklist — DO NOT ADOPT for commercial Atlas / Accelerate use

| Library | Issue | Use instead |
|---------|-------|-------------|
| **OpenPose** | $25k/yr commercial license | RTMPose |
| **AlphaPose** | non-commercial only | RTMPose |
| **YOLOv8 / v11 -Pose (Ultralytics)** | AGPL-3.0 — contaminates commercial product | RTMPose |
| **OxWearables** suite (biobankAccelerometerAnalysis, ssl-wearables, stepcount, actipy, asleep) | academic-use-only | skdh + mobgap |
| **gaitmap_mad** | AGPL-3.0 | gaitmap (MIT) or skdh |
| **GajuuzZ Human-Falling-Detect-Tracks** | no license declared + AlphaPose dependency | Build skeleton-based detector on PySKL |
| **Stanford-STAGES** | GPL-3.0 (copyleft) | YASA (BSD-3) |
| **SeqSleepNet, SleepEEGNet** | GPL-3.0 | DeepSleepNet, AttnSleep, TinySleepNet (Apache/MIT) |
| **GGIR** | LGPL-2.1 (R-only, weak copyleft) | skdh equivalents in Python |

---

## How this maps to Atlas's existing products

| Atlas product | What's covered today | What open-source augmentation fills the gap |
|---|---|---|
| **AtlasTurnMonitor** (Apple Watch SE) | In-bed roll → 6-class position, Q2h compliance | None needed — clinically sound. Optional: emit Open mHealth datapoint per turn for BMM ingestion. |
| **HAPI Tracker** | Pressure injury tracking | **BodyPressure** for camera-based contact pressure. **TI mmWave** for contactless turn validation. |
| **Falls Tracker** | Fall event capture | **PySKL fall classifier** for vision-based room monitoring. **TI mmWave** for contactless fall (>90% @ 6.5m). **falls_threshold** sidecar wrapper for wearable accel. |
| **Lift / Mobility Tracker** | SPHM activity logging | **skdh sit-to-stand** + **mobgap walking-bouts** for automated mobility event extraction from Atlas Patch. |
| **Atlas Patch** | Disposable wearable accel | All sidecar algorithms apply — Patch is functionally equivalent to B10 for these pipelines. **Same skdh + Cole-Kripke + mobgap stack.** |
| **BMM (iPad bedside)** | Patient monitoring at bedside | Add **MediaPipe Pose Landmarker** (Node-side) for in-bed pose + restlessness. Add **YAMNet** for snore / cough / distress audio. |
| **UMM (nursing station)** | Unit dashboard | No model needed — UMM displays the aggregate of the above. |
| **Mobility Cloud** | HIPAA cloud platform | Adopt **Open mHealth schema** for emit; add **RADAR-base** as the ingestion layer if Atlas wants commodity hospital deployments. |

---

## Recommended adoption sequence

### Phase 1 — wired today
1. **scikit-digital-health (skdh)** — gait, sleep window, sit-to-stand, activity intensity. Wrapped in `sidecar/algorithms/`.
2. **Cole-Kripke (1992)** — sleep/wake from any wearable accel. Wrapped.
3. **Open mHealth IEEE 1752 envelope** — output format. Wrapped in `sidecar/schemas/omh.py`.
4. **Magnitude-threshold fall detector** — reference. Wrapped.

### Phase 2 — next 1-2 weeks (high priority)
5. **mobgap (Mobilise-D)** — clinical-credibility gait. Same wrapper pattern as `gait_skdh.py`. ~2-day adoption.
6. **NeuroKit2** — HRV / respiration. Wraps cleanly when a HR sensor pairs with B10.
7. **MediaPipe Pose Landmarker (Node side)** — bridge into the Accelerate command center for room camera demos.

### Phase 3 — 2-4 weeks (vision/contactless track)
8. **rtmlib + RTMPose** as a Jetson sidecar — `pip install rtmlib`, runs as a separate Python service on a Jetson Orin Nano in patient rooms. Output: COCO-17 keypoints over WebSocket → b10-playground.
9. **PySKL + PoseConv3D** — fall + sit-to-stand classifier on top of RTMPose keypoints.
10. **TI mmWave IWR6843AOPEVM** — order one ($186). Run TI's stock fall + vital signs reference apps. Build a "mmWave Lab" card following the Gait/Sleep pattern.
11. **Acconeer XM125** — order one from SparkFun ($49.95). Build an "Acconeer Breathing" card.

### Phase 4 — research moonshot
12. **BodyPressure (Georgia Tech, MIT)** — depth-only contact-pressure inference. This is the HAPI prevention thesis in code form. Pair with Intel RealSense overhead camera in patient rooms.
13. **YASA** when an EEG sensor enters scope.

### Phase 5 — platform layer (when scaling beyond pilot)
14. **RADAR-base** self-hosted on the Accelerate cluster as the ingestion / Kafka topic backbone.
15. **Stanford Spezi** for the iOS patient app side (the public-facing app component).
16. **HL7 FHIR R4 Observation** translation in `sidecar/schemas/fhir.py` (currently a stub) — required for hospital EHR integrations.

---

## Pointer to full research

Each track has a standalone reference doc with install commands, code snippets, validation papers, maintenance health, and per-toolkit "pick this if / avoid if" judgments:

- [01 · Wearable IMU toolkits](01-wearable-imu-toolkits.md) — 15+ libraries reviewed
- [02 · Vision &amp; skeleton toolkits](02-vision-skeleton-toolkits.md) — RTMPose, MediaPipe, MMPose, MMAction2, PySKL, in-bed pose
- [03 · Contactless · radar · in-bed](03-contactless-radar-inbed-toolkits.md) — TI mmWave, Acconeer, BCG datasets, BodyPressure, YAMNet, WiFi CSI
- [04 · Digital-health platforms &amp; data standards](04-digital-health-platforms.md) — RADAR-base, Stanford Spezi, Open mHealth, FHIR, Sage Bionetworks

---

## How the team uses this

The Sidecar tab in the b10-playground front-end (`http://localhost:8080/`) connects live to a local FastAPI service (`http://localhost:8081`) that hosts every adopted toolkit. The architecture supports adding new toolkits with zero front-end changes: drop a new module in `sidecar/algorithms/`, register it in `algorithms/__init__.py`, restart, done. Full recipe in `sidecar/CONTRIBUTING.md`.
