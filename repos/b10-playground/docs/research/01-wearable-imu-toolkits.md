# Wearable IMU / Accelerometer Toolkits — Decision-Grade Reference

**Audience:** Eric Race (Atlas Mobility), B10 Sensor Lab
**Hardware target:** Minew B10 wearable button — Nordic nRF52832, 3-axis accel ~25 Hz, BLE, IP66, 60-day battery
**Goal:** Adopt 1–3 well-maintained open-source pipelines as Python sidecars that ingest the B10 BLE stream (single-page Web Bluetooth HTML lab) and expose results over WebSocket. **Commercial use must be permitted.**
**Date compiled:** 2026-04-27

---

## TL;DR

| Rank | Toolkit | License | Why |
|---|---|---|---|
| #1 | **scikit-digital-health (SKDH)** | MIT | Production-grade Pfizer pipeline; gait + sleep + sit-to-stand + activity in one library; commercial-friendly; great docs; actively maintained. |
| #2 | **mobgap** (Mobilise-D) | Apache-2.0 | Best-validated gait pipeline on the planet (EU IMI consortium, n>2300 subjects across 5 cohorts); just hit 1.0; revalidated. |
| #3 | **YASA** | BSD-3 | Best-in-class sleep staging; 554 stars; active; works with raw signals; commercial-OK. |

**Avoid for commercial use:** all `OxWearables/*` repos (biobankAccelerometerAnalysis, ssl-wearables, stepcount, actipy, asleep) — Oxford Academic-Use-Only Licence explicitly prohibits commercial use. `gaitmap_mad` subpackage (AGPL-3.0) — viral copyleft.

---

## Critical License Findings

Before reading further, note two licensing gotchas that disqualify several otherwise-attractive projects for Atlas Mobility's commercial use case:

1. **Oxford Wearables ecosystem (`github.com/OxWearables/*`) is academic-use-only.** Every repo (`biobankAccelerometerAnalysis`, `ssl-wearables`, `stepcount`, `actipy`, `asleep`) ships under the Oxford "Academic Use Licence" which states:
   > *"THE SOFTWARE IS INTENDED FOR USE BY ACADEMICS CARRYING OUT RESEARCH AND NOT FOR USE BY CONSUMERS OR COMMERCIAL BUSINESSES."*
   This makes them **off-limits** for Atlas Mobility / Accelerate Robotics product use without a separate commercial license from Oxford University Innovation. They are scientifically excellent — use them for internal research/benchmarking only, not for shipping products.

2. **gaitmap is dual-licensed.** `gaitmap` (the main package) is MIT. `gaitmap_mad` (the subpackage with the best stride-segmentation HMM and Barth-DTW algorithms) is **AGPL-3.0**. AGPL infects networked-service products. Avoid `gaitmap_mad` unless you're prepared to open-source any service that uses it.

3. **GGIR is Apache-2.0 (commercial-OK).** Even though it's R, it's the de-facto standard in epidemiology — the `read.gt3x` reader and sleep/PA classifiers are battle-tested. Worth flagging as a Python interop target.

---

# GAIT / STEP / MOBILITY TOOLKITS

## 1. mobgap (Mobilise-D)

- **Repo:** https://github.com/mobilise-d/mobgap
- **Docs:** https://mobgap.readthedocs.io
- **License:** Apache-2.0 (green)
- **Maintainers:** EU IMI consortium (Mobilise-D) — Sheffield, FAU Erlangen, Newcastle, Pfizer, Novartis, others. Funded through ~2026.
- **Maintenance health (April 2026):** 47 stars, 11 forks, 19 open issues, **100+ commits in the past year**, 9 contributors. Just hit **v1.0** (re-validated). Last push: 2026-04-01. **Very active.**

**What it does**
The reference Python implementation of the entire Mobilise-D gait analysis pipeline for IMUs worn on the lower back. Detects gait sequences, initial contacts, cadence, stride length, walking speed, turning, walking-bout aggregation, and per-day/week summaries. Two preconfigured pipelines: `MobilisedPipelineHealthy` (controls, COPD, CHF) and `MobilisedPipelineImpaired` (PD, MS, post-hip-fracture).

**Input format**
- 3-axis accel **+ 3-axis gyro** (gyro is heavily used — pure-accel B10 may need substitution algorithms)
- Sample rate: typically 100 Hz (algorithms designed and validated at this rate; some can downsample)
- Body location: **lower back/lumbar** (this matters)
- Data format: pandas DataFrame with `acc_x/y/z`, `gyr_x/y/z` columns and a `time` index. Has loaders for `.mat`, custom CSV.

**Output**
Per-walking-bout: stride length, cadence, walking speed, stride time, asymmetry, turning angle, plus aggregated stats (per day, per recording).

**Validation**
The flagship paper is the gold standard for IMU gait validation:
- Kirk C., Küderle A., Micó-Amigo M.E. et al. (2024). *"Mobilise-D insights to estimate real-world walking speed in multiple conditions with a wearable device."* **Sci Rep 14, 1754.** [doi:10.1038/s41598-024-51766-5](https://doi.org/10.1038/s41598-024-51766-5)
- Multi-cohort validation: n>2,300 subjects across PD, MS, CHF, COPD, PFF, healthy controls, vs. stereo-photogrammetry and INDIP reference systems.
- Walking speed accuracy: ICC > 0.9 in healthy/COPD/CHF, somewhat lower in MS/PD.

**Install**
```bash
pip install mobgap
```

**Minimal code example**
```python
from mobgap.data import LabExampleDataset
from mobgap.pipeline import MobilisedPipelineHealthy

# Provided example dataset (lab-recorded lumbar IMU)
data = LabExampleDataset().get_subset(cohort="HA")
recording = data.get_subset(test="Test11")[0]

pipeline = MobilisedPipelineHealthy().safe_run(recording)

print(pipeline.aggregated_parameters_)   # walking speed, cadence per recording
print(pipeline.per_wb_parameters_)       # per walking bout
print(pipeline.per_stride_parameters_)   # per stride
```

**Edge deployability**
Pure Python + scipy + scikit-learn + lightgbm. Runs anywhere Python runs (RPi 4, Jetson Nano fine). No GPU required. ~50 MB install footprint.

**Integration friction for B10**
- **Big asterisk: requires gyroscope.** B10 is accel-only. Several mobgap algorithms (`GsdLowBackAcc`, `IcdHKLeeImproved`) work on accel-only — but the validated `Healthy`/`Impaired` end-to-end pipelines assume IMU. You can run accel-only sub-algorithms and lose some accuracy.
- **Lumbar-mounted assumption.** B10 is wrist/chest/whatever-clip-on. Algorithms calibrated on L5-area placement. Wrist deployment will need separate validation work.
- 25 Hz vs 100 Hz: mobgap can resample; some algorithms degrade at 25 Hz.
- **Recipe:** Stream B10 to Python sidecar (`bleak` library) → buffer 10–60 s windows → format as DataFrame matching mobgap schema → run `GsdAdaptiveIonescu` (accel-only gait detection) + `IcdShinImproved` (initial contact) → push results to WS.

**Pick this if:** you want a clinically validated, citation-ready gait pipeline for a research/regulatory audience and you're willing to add a 6-axis IMU later (or accept reduced accuracy from accel-only).
**Avoid if:** you need wrist-only step counting today on accel-only data → use SKDH instead.

---

## 2. scikit-digital-health (SKDH)

- **Repo:** https://github.com/PfizerRD/scikit-digital-health
- **Docs:** https://scikit-digital-health.readthedocs.io
- **License:** **MIT (green — best-in-class)**
- **Maintainers:** Pfizer Research & Development (Lukas Adamowicz, Yiorgos Christakis, Matt Czech, Tomasz Adamusiak)
- **Maintenance health (April 2026):** 99 stars, 34 forks, 6 open issues, **52 commits in the past year**, 4 core contributors. Last push: 2026-04-08. **Steady, professional pace.**

**What it does**
A modular Python toolkit that does *almost everything* you'd want from wearable inertial data: gait analysis (classify bouts, compute gait params), sit-to-stand transitions, sleep detection (Cole-Kripke, van Hees), physical activity (Sadeh / cutpoints), context (bathing/swimming detection), feature extraction, signal preprocessing, and binary file readers (Axivity `.cwa`, GeneActiv `.bin`). Designed as composable `Pipeline()` blocks, scikit-learn-style. **Think of it as the "swiss army knife" — and it's the recommended successor to gaitpy.**

**Input format**
- 3-axis accelerometer (gyro optional)
- Time array + accel array + sampling frequency
- File readers for `.cwa` (Axivity), `.bin` (GeneActiv), `.gt3x` (limited), and CSV via `skdh.io.ReadCSV`
- Any sample rate; algorithms specify their requirements

**Output**
Depends on module. Gait module returns DataFrame with bout starts/stops, cadence, stride length, regularity, etc. Sleep module returns onset/offset, total sleep time, WASO. Activity module returns minutes in MVPA/light/sedentary.

**Validation**
- Adamowicz L., Christakis Y., Czech M.D., Adamusiak T. (2022). *"SciKit Digital Health: Python Package for Streamlined Wearable Inertial Sensor Data Processing,"* **JMIR mHealth uHealth, 10(4), e36762.** [doi:10.2196/36762](https://doi.org/10.2196/36762)
- Each algorithm cites its source paper (Cole-Kripke 1992 for sleep, van Hees 2014 for sleep onset, etc.).
- Used in Pfizer clinical trial pipelines.

**Install**
```bash
pip install scikit-digital-health
# or
conda install scikit-digital-health -c conda-forge
```

**Minimal code example**
```python
import skdh

# Build a pipeline: read data → classify gait bouts → compute gait params
pipe = skdh.Pipeline()
pipe.add(skdh.io.ReadCSV(
    time_col_name="timestamp",
    column_names={"accel": ["accel_x", "accel_y", "accel_z"]},
))
pipe.add(skdh.context.PredictGaitLumbarLgbm())   # detect walking bouts
pipe.add(skdh.gait.GaitLumbar(), save_file="{file}_gait.csv")

results = pipe.run(file="b10_session.csv", height=1.75)
# results contains gait bout times + per-stride / per-bout params
```

**Edge deployability**
Pure Python with C extensions (Meson build). Runs on RPi 4, Jetson, x86 Linux, Mac, Windows. No GPU dependency. The LightGBM gait classifier is fast (<10 ms inference per minute of data).

**Integration friction for B10**
**Lowest of any toolkit on this list.** Already designed for accel-only single-sensor workflows; sample rate flexible; CSV ingest is dead simple. Pipeline blocks are stateful and can be re-used in a streaming-window architecture.
- **Recipe:** Python sidecar runs `bleak` BLE listener → fills a rolling 60 s NumPy buffer at 25 Hz → calls `skdh.context.PredictGaitLumbarLgbm().predict(time, accel, fs=25)` every 10 s → pushes detected gait events over WebSocket to the B10 HTML lab → optionally calls `skdh.sleep.SleepClassification()` on overnight buffers.

**Pick this if:** you want one library that covers gait + sleep + activity + sit-to-stand with permissive license, friendly API, and active commercial backing. **This is the strongest default for B10.**
**Avoid if:** you specifically need foot-mounted / wrist-only step-counting deep-learning models — SKDH is more classical-signals-oriented.

---

## 3. gaitmap (FAU Erlangen, MaD-Lab)

- **Repo:** https://github.com/mad-lab-fau/gaitmap
- **Docs:** https://gaitmap.readthedocs.io
- **License:** **DUAL — `gaitmap` = MIT (green); `gaitmap_mad` = AGPL-3.0 (RED for commercial)**
- **Maintainers:** MaD-Lab, FAU Erlangen-Nürnberg (Arne Küderle and team — same Küderle as mobgap)
- **Maintenance health (April 2026):** 85 stars, 12 forks, 12 open issues, **54 commits in the past year**, 13 contributors. Last push: 2026-04-07.

**What it does**
A toolbox of 20+ algorithms from 17+ publications focused on **foot-mounted** IMU gait analysis: stride segmentation (Barth DTW, HMM), event detection (heel strike, toe off), spatial parameters (zero-velocity-update / ZUPT integration), trajectory estimation. Sklearn-like API. Designed to be composable, not a fixed pipeline.

**Input format**
- 6-axis IMU (accel + gyro) — required for most algorithms
- Foot-mounted preferred; some lumbar algorithms exist
- 100 Hz typical
- Standardized DataFrame schema (see gaitmap docs)

**Output**
Stride list (start/end times), per-stride spatial params (length, width, clearance), foot trajectories.

**Validation**
- Küderle et al. publications (multiple, see docs). Validated against motion capture in lab settings.

**Install**
```bash
pip install gaitmap                # MIT, safe for commercial
# pip install gaitmap_mad          # AGPL — DO NOT install for commercial product
```

**Minimal code example**
```python
from gaitmap.stride_segmentation import BarthDtw  # Note: BarthDtw lives in gaitmap_mad (AGPL)!
# MIT-safe alternative:
from gaitmap.event_detection import RamppEventDetection

ed = RamppEventDetection()
ed = ed.detect(data=imu_df, sampling_rate_hz=100.0, stride_list=stride_list)
print(ed.min_vel_event_list_)
```

**Edge deployability**
Pure Python. Some algorithms (HMM / pomegranate) have heavier deps. RPi-friendly.

**Integration friction for B10**
- B10 is accel-only and not foot-mounted → gaitmap is the wrong tool for B10's typical use case.
- Best algorithms (Barth-DTW, HMM segmentation) are AGPL.
- **Pick this if:** you're prototyping with a *different* foot-mounted 6-axis sensor for research only.
- **Avoid for B10:** wrong sensor placement and wrong sensor capability assumption.

---

## 4. gaitpy

- **Repo:** https://github.com/matt002/gaitpy
- **License:** MIT
- **Status (April 2026):** **DEPRECATED.** Author redirects users to scikit-digital-health. 44 stars, 23 forks, last push 2024-06. 0 commits in past year.

**Verdict:** Don't use. The author's own README says: *"This package is not maintained anymore. I would recommend using Scikit Digital Health, a python package that includes a newer version GaitPy."*

---

## 5. pyShoe (UTIAS / U Toronto)

- **Repo:** https://github.com/utiasSTARS/pyshoe
- **License:** **None declared** (legally ambiguous — assume "all rights reserved" by default; treat as RED for commercial)
- **Status:** Last push 2021-12. 0 commits in past year. 107 stars.

**What it does**
Foot-mounted INS (inertial navigation system) with zero-velocity update (ZUPT) detectors, including LSTM-based learned detectors. Comes with three labeled motion-capture datasets.

**Verdict:** Excellent reference implementation for ZUPT-INS algorithms but **wrong sensor placement (foot)**, **stale**, and **no license**. Read the paper, copy ideas, don't depend on the package.

---

## 6. biobankAccelerometerAnalysis (Oxford / OxWearables)

- **Repo:** https://github.com/OxWearables/biobankAccelerometerAnalysis
- **License:** **Oxford Academic-Use-Only — RED for commercial**
- **Maintenance health (April 2026):** 242 stars, 72 forks, 24 open issues, 33 commits past year, 11 contributors. Last push 2025-11-10. **Healthy academically.**

**What it does**
Gold standard for processing UK Biobank-style accelerometer data. Reads `.cwa` (Axivity), `.bin` (GeneActiv), CSV; outputs activity intensity (sedentary/light/MVPA), wear time, sleep, daily summaries.

**Validation**
Peer-reviewed across dozens of papers from the Oxford Activity Group.

**Verdict for B10:** Off-limits for commercial product. Use only for internal benchmarking against UK Biobank methodology, then re-implement in SKDH.

---

## 7. HARNet / ssl-wearables (Oxford)

- **Repo:** https://github.com/OxWearables/ssl-wearables
- **License:** **Oxford Academic-Use-Only — RED for commercial**
- **Status:** 149 stars, 40 forks, last push 2024-10. 0 commits in past year. Pre-trained models on 700K person-days of UK Biobank wrist accel data.

**What it does**
Self-supervised pre-trained ResNet (HARNet5/10/30) for wearable HAR. Provide it 5-/10-/30-second wrist accel windows at 30 Hz, get embeddings to fine-tune for any HAR task.

**Verdict:** Beautiful work, scientifically the best foundation model for accel HAR. **Off-limits commercially.** If Eric wants this kind of capability for a product, the path is: license from Oxford University Innovation OR train an equivalent on a permissively-licensed dataset.

---

## 8. PAMpro

- **Repo (most active fork):** https://github.com/MRC-Epid/pampro
- **License:** GPL-3.0 (yellow — copyleft, viable for internal tools, problematic for shipped products)
- **Status:** 4 stars, last push 2024-11.

**Verdict:** Niche; mostly used by the MRC Epidemiology unit. SKDH covers the same use cases under MIT.

---

## 9. PAAT (Physical Activity Analysis Toolbox)

- **Repo:** https://github.com/Trybnetic/paat
- **License:** MIT (green)
- **Maintenance:** 6 stars, 5 commits past year, last push 2025-07. **Tiny user base but active.**

**What it does**
Hip-mounted ActiGraph `.gt3x` analysis. Features: non-wear detection, sleep, MVPA classification.

**Install:** `pip install paat`

**Verdict:** Solid niche tool if you happen to have ActiGraph data. SKDH is the broader choice.

---

## 10. GGIR (R)

- **Repo:** https://github.com/wadpac/GGIR
- **License:** **Apache-2.0 (green)**
- **Maintainers:** Vincent van Hees + WADPAC consortium
- **Maintenance health:** 137 stars, 72 forks, 25 open issues, **100+ commits past year**, 15 contributors. Last push 2026-04-21. **Very active.**

**What it does**
The de-facto standard in physical activity epidemiology. Reads raw accelerometer files (`.cwa`, `.bin`, `.gt3x`, CSV), applies auto-calibration, non-wear detection, sleep detection (van Hees algorithm), MVPA, daily summary tables. R-only.

**Validation**
Hundreds of citations; van Hees sleep algorithm is published and validated.

**Install (R)**
```r
install.packages("GGIR")
```

**Integration for B10:** Run as a batch process: dump B10 sessions to CSV → call GGIR via `subprocess` from Python. Slow (minutes per day of data) but rigorous. **Best for periodic batch analytics, not realtime.**

**Verdict:** If Eric wants research-grade daily/weekly PA + sleep summaries for *retrospective* analysis, GGIR is the best in the world and Apache-2.0. For realtime, use SKDH.

---

# SLEEP TOOLKITS

## 11. YASA (Yet Another Spindle Algorithm)

- **Repo:** https://github.com/raphaelvallat/yasa
- **Docs:** https://yasa-sleep.org
- **License:** **BSD-3-Clause (green)**
- **Maintainer:** Raphael Vallat (UC Berkeley → Oura). Solo maintainer with strong contributor base.
- **Maintenance health:** 554 stars (#1 in this category), 128 forks, 11 open issues, **48 commits past year**, 12 contributors. Last push 2026-04-11. **Excellent.**

**What it does**
Polysomnography-grade sleep analysis in Python: automatic 5-stage sleep staging from EEG (LightGBM model trained on >3000 nights), spindle/slow-wave detection, hypnogram statistics, spectral analyses. **Note: primarily EEG-based, not accel-based.**

**Validation**
- Vallat R., Walker M.P. (2021). *"An open-source, high-performance tool for automated sleep staging."* **eLife 10:e70092.** Accuracy 87.5% vs human consensus on a held-out test set of 585 nights.

**Install**
```bash
pip install yasa
```

**Minimal code example**
```python
import yasa, mne
raw = mne.io.read_raw_edf("subject.edf", preload=True)
sls = yasa.SleepStaging(raw, eeg_name="C4-M1", eog_name="LOC-M2", emg_name="EMG1")
hypno = sls.predict()           # array of stage labels per 30-s epoch
proba = sls.predict_proba()     # confidence per stage
yasa.plot_hypnogram(hypno)
stats = yasa.sleep_statistics(hypno, sf_hyp=1/30)
print(stats)  # SOL, TST, WASO, SE, % time in N1/N2/N3/REM
```

**Edge deployability**
Pure Python. Inference is fast (LightGBM). RPi-capable.

**Integration friction for B10**
- **YASA is EEG-first.** B10 has no EEG. The accel-based path is via the `Hypnogram` utilities + your own activity-count → sleep estimator.
- Best B10 use: post-process activity counts into sleep statistics structures; or use `yasa.sleep_statistics()` on a hypnogram you produced from another method (e.g., Walch et al. or a simple Cole-Kripke from SKDH).
- **Pick this if:** Eric ever adds an EEG headband to the B10 lab. Excellent reference for sleep-stats math.

---

## 12. SleepECG

- **Repo:** https://github.com/cbrnr/sleepecg
- **License:** **BSD-3-Clause (green)**
- **Maintainer:** Clemens Brunner (Univ. Graz)
- **Maintenance health:** 137 stars, 34 forks, 12 open issues, **41 commits past year**, 8 contributors. Last push 2026-04-13. **Very active.**

**What it does**
Sleep stage classification from **ECG only** (no EEG needed). Provides heartbeat detectors and a pre-trained classifier that maps RR-intervals → wake/REM/NREM.

**Validation**
JOSS paper: [doi:10.21105/joss.05411](https://doi.org/10.21105/joss.05411). Built on SHHS, MESA datasets.

**Install**
```bash
pip install sleepecg
```

**Minimal code example**
```python
import numpy as np
from sleepecg import detect_heartbeats, get_toy_ecg

ecg, fs = get_toy_ecg()
beats = detect_heartbeats(ecg, fs)   # indices in samples
```

**Integration with B10:** B10 has no ECG → SleepECG is **off-target** unless Eric adds a chest strap (Polar H10) to the lab. Worth flagging because it's the cleanest BSD-licensed code path from raw ECG to sleep stages.

---

## 13. Walch et al. — sleep_classifiers (Apple Watch)

- **Repo:** https://github.com/ojwalch/sleep_classifiers
- **License:** MIT (per README; no LICENSE file in repo — small risk)
- **Maintenance:** 214 stars, 98 forks, 8 open issues. Last push 2024-12. 0 commits past year — **stable but stale.**

**What it does**
Reference implementation of the Walch 2019 *Sleep* paper: classify sleep/wake or wake/NREM/REM from Apple Watch acceleration + heart rate. Uses scikit-learn + PhysioNet open dataset (31 subjects).

**Validation**
- Walch O., Huang Y., Forger D., Goldstein C. (2019). *"Sleep stage prediction with raw acceleration and photoplethysmography heart rate data derived from a consumer wearable device,"* **Sleep 42(12), zsz180.** Accuracy ~90% sleep/wake, ~72% three-class.

**Install**
```bash
git clone https://github.com/ojwalch/sleep_classifiers
cd sleep_classifiers
pip install scikit-learn pandas numpy   # no setup.py — manual deps
```

**Integration with B10**
- B10 = accel only, no HR → sleep/wake (motion-only) classifier still works; three-class needs HR.
- This is **research code**, not a library. Treat it as a recipe to re-implement in SKDH or your own pipeline.

**Pick this if:** you want to know exactly how Apple Watch infers sleep stages and re-implement. **Avoid as a dependency** — not packaged.

---

## 14. SleepKit (Ambiq)

- **Repo:** https://github.com/AmbiqAI/sleepkit
- **License:** **BSD-3-Clause (green)**
- **Maintainer:** Ambiq AI (the chip vendor)
- **Maintenance:** 30 stars, 3 forks, **10 commits past year**, 2 contributors. Last push 2026-01.

**What it does**
AI Development Kit for **on-device** sleep monitoring on Ambiq's ultra-low-power SoCs (Apollo MCUs). Ships pre-trained TinyML models for sleep detection, sleep staging (2/3/4/5 stage), and apnea detection. Trained on MESA + CMI-DSS datasets. Outputs deployable to Ambiq EVB or convertible to TFLite Micro.

**Install:** `pip install sleepkit`

**Integration with B10**
- B10 already runs Nordic nRF52832, not Ambiq. SleepKit's deployment story doesn't apply directly — but the **pre-trained models and training pipelines are reusable**. You can convert them to TFLite Micro for the nRF52, or run inference on a Python sidecar.
- Models trained on wrist accel + multi-modal data (HR, respiration, etc.).

**Pick this if:** Eric wants to push sleep inference *onto* the B10 chip itself (TinyML). **Worth flagging** as an underrated gem — most other sleep tooling assumes server-side processing.

---

## 15. Stanford-stages

- **Repo:** https://github.com/Stanford-STAGES/stanford-stages
- **License:** **None declared (RED — assume all rights reserved)**
- **Status:** 91 stars, last push 2024-06, 0 commits past year.

**What it does**
Deep-learning sleep staging + narcolepsy detection. PSG-grade. Requires EEG + EMG + EOG.

**Verdict:** Stale, no license, requires PSG. **Skip for B10.**

---

# ACTIVITY / HAR / FALLS

## 16. DeepConvLSTM

- **Repo:** https://github.com/STRCWearlab/DeepConvLSTM
- **License:** **None (RED for commercial)**
- **Status:** Last push 2018. 290 stars. **Frozen reference implementation.**

**What it does**
The seminal 2016 ConvLSTM HAR architecture (Ordóñez & Roggen). Trained on OPPORTUNITY dataset.

**Verdict:** Important to know for citation/architecture reference. Don't use as a dependency. If Eric wants HAR, train a fresh model in PyTorch using the same architecture (well-documented in many tutorials).

---

## 17. SleepPy

- **Repo:** https://github.com/elyiorgos/sleeppy
- **License:** MIT (green)
- **Status:** 67 stars, 21 forks, last push 2023-07. 0 commits past year. **Stale.**

**What it does**
Pfizer's *original* sleep pipeline — superseded by SKDH. Detects sleep onset/offset from raw wrist accel using Cole-Kripke + van Hees.

**Verdict:** Use SKDH instead — same authors, better-maintained.

---

## 18. NeuroKit2

- **Repo:** https://github.com/neuropsychology/NeuroKit
- **License:** **MIT (green)**
- **Maintenance:** 2,207 stars, 517 forks, 6 open issues, **100+ commits past year**, 94 contributors. Last push 2026-03-19. **Massive, very active.**

**What it does**
General-purpose physiological signal processing in Python. ECG/PPG (heart rate, HRV), EDA, EMG, RSP, EEG basics. Not IMU-focused, but has activity-count utilities and excellent signal processing primitives.

**Install:** `pip install neurokit2`

**Integration with B10**
If Eric adds *any* additional sensor (PPG ring, ECG strap, respiration belt), NeuroKit2 is the swiss army knife for processing those streams. For pure accel: less direct value, but its filters / peak detectors are useful building blocks.

**Pick this if:** any non-IMU vitals enter the B10 lab. **Highly recommended baseline dependency** for a multi-modal lab.

---

## 19. HeartPy

- **Repo:** https://github.com/paulvangentcom/heartrate_analysis_python
- **License:** MIT (green)
- **Maintenance:** 1,114 stars, 343 forks, 20 open issues, last push 2025-12. **Active.**

**What it does**
Lightweight, focused PPG/ECG heart-rate + HRV analysis in Python.

**Verdict:** Smaller alternative to NeuroKit2 for HR-only use. Pick NeuroKit2 unless you need a single-purpose tool.

---

# OTHER TOOLKITS NOTED

| Toolkit | License | Status | Verdict |
|---|---|---|---|
| **OpenSense** (OpenSim IMU) | Apache-2.0 (OpenSim umbrella) | Active | C++/Python — for full musculoskeletal modeling from IMU. **Heavy.** Useful if Eric ever needs joint angles from a multi-IMU setup. |
| **MD2K Cerebral Cortex** | BSD-2 (Kernel) | Stale (2022) | Big-data backend for mHealth at population scale (HBase/Spark). **Overkill** for B10 today. |
| **Beiwe** (onnela-lab) | BSD-3 | **Active (2026-04)** | Smartphone-based digital phenotyping platform from Harvard. Great if Eric ever extends to a smartphone-based deployment. |
| **Sage Mobile Toolbox** | Various (per app) | Active | Sage Bionetworks' iOS/Android assessment toolkit. **App-side, not for raw IMU.** |
| **OxWearables/stepcount** | **Oxford Academic-Only — RED** | Active | SOTA wrist step counting via foundation models. Off-limits commercially. |
| **OxWearables/asleep** | **Oxford Academic-Only — RED** | Active | Sleep classifier on wrist accel. Off-limits commercially. |
| **OxWearables/actipy** | **Oxford Academic-Only — RED** | Active | `.cwa`/`.gt3x` reader. Off-limits commercially. |

---

# DECISION MATRIX (B10 Use Case)

Score: 1 = poor fit, 5 = excellent fit. Weighted toward: commercial license, accel-only support, single-sensor wrist/chest, low-power deploy.

| Toolkit | Gait | Steps | Sleep | Falls | HAR | License | Active? | Accel-only OK | Total |
|---|---|---|---|---|---|---|---|---|---|
| **scikit-digital-health** | 5 | 5 | 5 | 3 | 4 | MIT | 5 | 5 | **32** |
| **mobgap** | 5 | 4 | 1 | 1 | 1 | Apache-2.0 | 5 | 3 | **20** |
| **YASA** | 1 | 1 | 5 | 1 | 1 | BSD-3 | 5 | 1 | **15** |
| **GGIR** (R) | 4 | 4 | 5 | 2 | 3 | Apache-2.0 | 5 | 5 | **28** |
| **NeuroKit2** | 1 | 1 | 1 | 1 | 1 | MIT | 5 | 1 | **11** (different role) |
| **SleepKit** (Ambiq) | 1 | 1 | 4 | 1 | 1 | BSD-3 | 4 | 4 | **15** |
| **gaitmap** (MIT subset only) | 3 | 2 | 1 | 1 | 1 | MIT/AGPL | 5 | 1 | **13** |
| OxWearables/* | — | — | — | — | — | **Academic-only** | 5 | varies | **DISQUALIFIED** |
| pyShoe | 4 | 3 | 1 | 1 | 1 | None | 1 | 1 | **DISQUALIFIED** |

---

# RECOMMENDED STACK — Pick These First

## Tier 1 (adopt now)

### 1. **scikit-digital-health (SKDH)** — primary engine
- **Why:** MIT license, accel-only friendly, covers gait + sleep + activity + sit-to-stand in one library, built by Pfizer for clinical-trial use, actively maintained, sklearn-style composable Pipeline.
- **B10 integration:** Python sidecar with `bleak` for BLE → buffer accel into a NumPy array → call `skdh.context.PredictGaitLumbarLgbm()` and `skdh.sleep.SleepClassification()` on rolling windows → push results over WebSocket to the B10 HTML lab.

### 2. **mobgap** — gait-credibility add-on
- **Why:** When Eric needs to claim "Mobilise-D-validated gait parameters" in a clinical pitch (Atlas Mobility audience: hospitals, RNs, falls programs), this is the only library with the citation backing. Apache-2.0.
- **B10 integration:** Run as a *batch* analytics layer alongside SKDH. Same data pipeline; just add a second analysis path that calls `MobilisedPipelineHealthy().safe_run()` on saved sessions for periodic clinical reporting.
- **Caveat:** Will work better if the B10 hardware roadmap eventually adds a 6-axis IMU. Track that.

## Tier 2 (adopt when scope expands)

### 3. **YASA** — sleep-stats utility
- Add when the B10 lab gets a sleep workflow. Use `yasa.Hypnogram` and `yasa.sleep_statistics` to standardize the numerics that Atlas Mobility's clinical audience expects (TST, SOL, SE, WASO, % stages). Pair with a hypnogram source from SKDH or Walch-style accel+HR.

### 4. **GGIR** — overnight epidemiology batch
- For periodic research-grade weekly reports. R-only, but call from Python via `subprocess`. Use this when Atlas wants to generate "weekly mobility & sleep" reports for hospital partners with citation-grade methodology.

### 5. **NeuroKit2** — vitals catch-all
- Bring in the moment Eric adds *any* other sensor (PPG, ECG, EDA, RSP). Will save weeks of signal-processing code.

## Don't adopt (but read)

- **OxWearables ecosystem** — academic-only license disqualifies for product use. Read the papers, learn the algorithms, re-implement in SKDH or train fresh on permissively-licensed data.
- **gaitpy** — author redirects to SKDH.
- **DeepConvLSTM** — frozen 2018 reference; no license; copy the architecture if you want HAR.
- **gaitmap_mad** subpackage — AGPL-3.0 will infect any networked product.

---

# NON-OBVIOUS FINDS

1. **The Pfizer line is the strongest commercial path.** Pfizer's `scikit-digital-health` (and its predecessor `gaitpy` and `sleeppy`) form a coherent, MIT-licensed lineage that has been deliberately maintained as a commercial-friendly alternative to the (excellent but academic-only) Oxford ecosystem. This is by far the lowest-risk adoption path for Atlas Mobility / Accelerate Robotics.

2. **mobgap and gaitmap share authors (Arne Küderle).** Mobilise-D's Python team is the same FAU MaD-Lab group that built gaitmap. mobgap is essentially "gaitmap algorithms, productized as a validated end-to-end clinical pipeline." If Eric ever wants to extend mobgap with custom blocks, the gaitmap docs are the implementation reference.

3. **SleepKit (Ambiq) is an underrated TinyML on-ramp.** Ambiq is a chip vendor giving away pre-trained sleep models that can be quantized to run on a microcontroller. This is the *only* library in the survey explicitly designed for the embedded edge. If Eric ever wants the B10 to do on-device sleep inference (massive power win — no BLE streaming), this is the starting point. BSD-3 license. Worth a deep-dive for the Accelerate Robotics roadmap.

4. **Beiwe (Harvard / Onnela Lab) is alive in 2026.** The smartphone-side digital phenotyping platform got a push 3 days before this report (2026-04-24). If the B10 ever pairs with a phone app for richer context (GPS, screen activity), Beiwe is the most credible BSD-3 backbone.

5. **The Oxford academic-only license is a recent, deliberate change.** Older versions of `biobankAccelerometerAnalysis` were under BSD-equivalent terms; Oxford University Innovation moved to the academic-use licence to gate commercial use. There *is* a commercial license available — Eric could approach OUI directly if the Oxford `stepcount` or `ssl-wearables` foundation models become strategically critical (they're genuinely SOTA on wrist accel).

6. **OpenSim's OpenSense IMU pipeline** is the underrated bridge if the B10 ever becomes a multi-IMU body-worn array — it produces actual joint angles (kinematics), not just step counts. Apache-2.0. Heavy install but uniquely powerful for biomechanics-grade output.

---

# Suggested B10 Sidecar Architecture

```
┌──────────────────┐                ┌─────────────────────────────┐
│  B10 (nRF52832)  │  BLE notify    │  Python sidecar              │
│  3-axis accel    ├───────────────▶│  bleak listener              │
│  ~25 Hz          │                │  ├─ rolling NumPy buffers    │
└──────────────────┘                │  ├─ SKDH gait/sleep modules  │
                                    │  ├─ mobgap (batch analytics) │
                                    │  └─ websockets server        │
                                    └────────────┬────────────────┘
                                                 │ JSON events
                                                 ▼
                                    ┌─────────────────────────────┐
                                    │  b10-playground HTML lab    │
                                    │  (Web Bluetooth + WS client)│
                                    └─────────────────────────────┘
```

Recommended bootstrap repo layout:

```
b10-playground/
├── index.html              # existing Web Bluetooth lab
├── sidecar/
│   ├── pyproject.toml      # bleak, scikit-digital-health, websockets
│   ├── stream.py           # BLE → buffer → SKDH → WS
│   └── batch.py            # offline mobgap analytics on saved sessions
└── docs/research/01-wearable-imu-toolkits.md   ← this file
```

---

# Sources

- [mobgap repo](https://github.com/mobilise-d/mobgap) · [docs](https://mobgap.readthedocs.io)
- [scikit-digital-health repo](https://github.com/PfizerRD/scikit-digital-health) · [docs](https://scikit-digital-health.readthedocs.io)
- [gaitmap repo](https://github.com/mad-lab-fau/gaitmap) · [docs](https://gaitmap.readthedocs.io)
- [biobankAccelerometerAnalysis](https://github.com/OxWearables/biobankAccelerometerAnalysis)
- [ssl-wearables](https://github.com/OxWearables/ssl-wearables)
- [stepcount](https://github.com/OxWearables/stepcount)
- [actipy](https://github.com/OxWearables/actipy)
- [yasa](https://github.com/raphaelvallat/yasa) · [yasa-sleep.org](https://yasa-sleep.org)
- [sleepecg](https://github.com/cbrnr/sleepecg)
- [sleep_classifiers](https://github.com/ojwalch/sleep_classifiers)
- [sleepkit](https://github.com/AmbiqAI/sleepkit)
- [GGIR](https://github.com/wadpac/GGIR)
- [NeuroKit2](https://github.com/neuropsychology/NeuroKit)
- [HeartPy](https://github.com/paulvangentcom/heartrate_analysis_python)
- [pyShoe](https://github.com/utiasSTARS/pyshoe)
- [gaitpy](https://github.com/matt002/gaitpy)
- [PAAT](https://github.com/Trybnetic/paat)
- [Beiwe backend](https://github.com/onnela-lab/beiwe-backend)
- Kirk C. et al. (2024) Mobilise-D walking speed validation — [Sci Rep 14:1754](https://doi.org/10.1038/s41598-024-51766-5)
- Adamowicz L. et al. (2022) SciKit Digital Health — [JMIR mHealth uHealth 10(4):e36762](https://doi.org/10.2196/36762)
- Walch O. et al. (2019) Apple Watch sleep staging — [Sleep 42(12):zsz180](https://academic.oup.com/sleep/article/42/12/zsz180/5549536)
- Vallat R., Walker M.P. (2021) YASA validation — [eLife 10:e70092](https://elifesciences.org/articles/70092)

---

*Compiled 2026-04-27 by Claude (Opus 4.7). All metadata pulled from GitHub API on the same date. Verify license terms directly before adopting in production.*
