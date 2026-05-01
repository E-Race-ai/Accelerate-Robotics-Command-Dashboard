# Contactless Sensing Toolkits — Decision-Grade Survey

**Date:** 2026-04-27
**Audience:** Eric Race (Atlas Mobility / Accelerate Robotics)
**Scope:** Open-source pipelines for contactless sleep, mobility, fall, vital-signs, and bed-based patient monitoring. Emphasis on permissive license, active maintenance, edge inference, and hospital-room deployability. Direct line-of-sight to (a) Atlas's HAPI/repositioning thesis and (b) the B10 wearable as complementary contactless modalities.

---

## TL;DR

Three "buy-it-now" picks for hospital-room contactless monitoring:

1. **Acconeer A121 (XM125)** + acconeer-python-exploration — the only mature, MIT-style pure-Python radar SDK with shipping reference apps for breathing, presence, and distance. $50 sensor, Apache-licensed example apps. **Pair with B10** as the room-side breathing/presence companion.
2. **TI mmWave Industrial Toolbox + IWR6843AOPEVM** ($186) — production-grade reference apps for People Counting, 3D People Tracking + Fall Detection (>90% @ 6.5 m), and Vital Signs with People Tracking. Free toolbox under TI's TSPA license. The default for room-scale fall + occupancy + repositioning.
3. **rPPG-Toolbox (ubicomplab, NeurIPS 2023)** — the gold-standard contactless HR/respiration-from-camera toolbox; 17 algorithms, 7 datasets, actively maintained April 2026.

For **Atlas's pressure-injury repositioning moonshot**, the recommended stack is:
**TI IWR6843 (3D point-cloud body tracking)** for posture/turn detection above the bed + **PmatData / SLP-Dataset-and-Code (Ostadabbas)** as the ML head, fed by a **commodity pressure mat (Vista BodiTrak / FSA)** — not a wearable. This becomes "Atlas BMM Contactless" — the room-side complement to the B10 patch.

---

## Section 1 — mmWave Radar Toolkits

### 1.1 TI mmWave Industrial Toolbox (Radar Toolbox)

| Field | Value |
|---|---|
| URL | https://dev.ti.com/tirex/explore/node?node=A__radar_toolbox |
| License | TI TSPA (permissive, royalty-free, redistributable in binaries; demo source under BSD-style for most reference apps) |
| Maintenance | TI ships quarterly updates; reference apps refreshed through 2025 (Vital Signs With People Tracking, 3D People Tracking + Fall Detection are current) |
| What it does | Vendor-supplied reference firmware + host-side parsers for People Counting, 3D People Tracking, Out-of-Bed / Fall Detection, Vital Signs (HR/RR), Vital Signs With People Tracking, gesture, occupancy. Each ships as a `.cfg` config + `.bin` firmware + Python visualizer. |
| Hardware | **IWR6843AOPEVM** ($186, antenna-on-package, ±60° azimuth/elevation, ideal for ceiling) or **IWR6843ISK** ($219, long-range narrow-beam) or **IWR6843ISK-ODS** (overhead, wide-FOV). 60–64 GHz. Add **DCA1000EVM** (~$500) only if you need raw ADC. |
| Output | 3D point cloud (range/azimuth/elevation/Doppler), tracked targets (ID/centroid/velocity), posture class (stand/sit/lie/fall), HR (±5 bpm), RR (±2 bpm) up to ~1.5 m for vitals, up to 6.5 m for fall. |
| Validation | TI app notes claim >90% fall detection accuracy at 6.5 m; HR ±5 bpm and RR ±2 bpm verified internally. Multiple peer-reviewed reproductions (e.g., MDPI Sensors 2024, Applied Sciences 2025 for LSTM-on-FMCW seniors-living). |
| Install | Install **mmWave SDK 03.06+** + **Code Composer Studio** (Windows/Linux). Flash `.bin` via UniFlash. Use TI's Python visualizer or pair with `ibaiGorordo/AWR1843-Read-Data-Python-MMWAVE-SDK-3-` (BSD) or `kirkster96/IWR6843-Read-Data-Python-MMWAVE-SDK`. |
| Min code | ```python
# kirkster96/IWR6843-Read-Data-Python-MMWAVE-SDK
from parser_mmw_demo import parser_one_mmw_demo_output_packet
import serial
data_port = serial.Serial('/dev/ttyACM1', 921600)
buf = data_port.read(4096)
ok, hdr, n_pts, pc = parser_one_mmw_demo_output_packet(buf, len(buf))
``` |
| Edge | All inference runs **on-chip** (Cortex-R4F + DSP C674x). USB / UART / CAN out. No host PC needed for production; ESP32 / Pi 4 sufficient as host for logging. |
| Hospital fit | No camera = privacy story is excellent. 60 GHz penetrates blankets/clothing but not walls. Mount overhead. EVMs are bare PCB → need IP54+ enclosure. No CE/FCC class-medical certification on the EVM itself; chip is ISM-band approved. |
| Atlas / B10 fit | **Highest fit.** Vital Signs With People Tracking is essentially a room-scale BMM. 3D People Tracking + Fall Detection becomes the SmartFloor analog. Pair with B10 patch for ground-truth on the patient + radar for room-context (visitors, ambulation). |
| Pick if | You want one sensor that does presence + posture + fall + breathing in one ceiling tile, and you're willing to invest in TI tooling. |
| Avoid if | You want pure-Python with no embedded toolchain. |

### 1.2 OpenRadar (PreSenseRadar)

| Field | Value |
|---|---|
| URL | https://github.com/PreSenseRadar/OpenRadar |
| License | Apache 2.0 |
| Maintenance | Stars 875. Last push **April 2024** — slowing but not dead. Maintained by Presense Technologies. |
| What it does | Pure-Python signal-processing library for MIMO mmWave radars. Range-FFT, Doppler-FFT, CFAR, MUSIC angle-of-arrival, micro-Doppler, beamforming. Aimed at researchers processing **raw ADC samples** captured via DCA1000EVM. |
| Hardware | TI AWR/IWR series + DCA1000EVM capture card (~$500). |
| Output | Range-Doppler heatmaps, point clouds, angle estimates — you build the application on top. |
| Validation | Used as the reference processing chain in dozens of papers; not an end-to-end claim itself. |
| Install | `pip install openradar` |
| Min code | ```python
import mmwave.dsp as dsp
range_cube = dsp.range_processing(adc_data)
doppler_cube = dsp.doppler_processing(range_cube, num_tx_antennas=2)
peaks = dsp.ca_cfar(doppler_cube, ...)
``` |
| Edge | Library is NumPy-heavy → runs on Pi 4 / Jetson Nano fine for low-frame applications. Not for MCU. |
| Hospital fit | Same as TI EVM-based approach — needs enclosure. |
| Atlas fit | Foundation library if you build a custom Atlas radar pipeline (e.g., turn-detection fingerprint). Not turnkey. |
| Pick if | You need to process **raw I/Q** for a custom algorithm (e.g., bed-side micro-Doppler for sleep-stage). |
| Avoid if | You want a finished demo. |

### 1.3 pymmw (m6c7l)

| Field | Value |
|---|---|
| URL | https://github.com/m6c7l/pymmw |
| License | Custom permissive (GPL-style "Other") |
| Maintenance | 336 stars. Last commit **November 2021** — stale. |
| What it does | Lightweight host-side parser/visualizer for TI IWR1443/1642/1843 SDK 1.x/2.x output. |
| Hardware | TI IWR/AWR EVM. |
| Output | Live range/Doppler plots, point cloud. |
| Edge | Pi 4 OK. |
| Pick if | You're stuck on legacy SDK 2.x. |
| Avoid if | You're on SDK 3.x+ or 6843/6843AOP — use `kirkster96/IWR6843-Read-Data-Python-MMWAVE-SDK` instead. |

### 1.4 RadHAR (NESL UCLA)

| Field | Value |
|---|---|
| URL | https://github.com/nesl/RadHAR |
| License | BSD-3-Clause |
| Maintenance | 230 stars. Last push **August 2024**. |
| What it does | Reference dataset + CNN/LSTM models for 5-class human activity recognition (boxing, jumping, jacks, squats, walking) from IWR1443 point clouds. The canonical "HAR from mmWave" baseline. |
| Hardware | TI IWR1443BOOST (~$400) + DCA1000EVM, or any IWR generating point clouds. |
| Output | 90% activity-classification accuracy on their dataset. |
| Edge | Models are small enough for Jetson Nano / Pi 5. |
| Hospital fit | Activity classes are gym-oriented; would need re-training on bedside actions (sit-up, side-turn, transfer). Dataset format and pipeline are the value. |
| Atlas fit | **Direct relevance.** Re-train on Atlas-collected "patient turn left / turn right / sit edge / stand / fall" classes and you have the contactless arm of BMM. |
| Pick if | You need a working mmWave-HAR baseline to fork. |
| Avoid if | You want something pre-trained on patient behaviors. |

### 1.5 mmFall (radar-lab UT-Arlington)

| Field | Value |
|---|---|
| URL | https://github.com/radar-lab/mmfall |
| License | None declared (effectively all-rights-reserved — contact authors). **Risk.** |
| Maintenance | 145 stars. Last push **July 2022.** |
| What it does | Variational Recurrent Autoencoder (HVRAE) for unsupervised fall detection from 4D mmWave point clouds. Anomaly score + centroid drop → fall. 98% TPR claimed. |
| Hardware | TI IWR1443 + DCA1000. |
| Edge | TF1 / Keras model — needs porting to TF2 or PyTorch. Inference is light. |
| Atlas fit | The **algorithmic blueprint** for "patient is in bed but moved abnormally" — re-purpose anomaly-detection framing for unsafe-transfer detection. |
| Pick if | You want unsupervised fall detection (no labels needed). |
| Avoid if | You need a permissive license today — clear with authors first. |

### 1.6 RadarSimPy (radarsimx)

| Field | Value |
|---|---|
| URL | https://github.com/radarsimx/radarsimpy |
| License | GPL-3.0 (free non-commercial); commercial license available. **Hospital-deployment caution.** |
| Maintenance | 524 stars. Last push **April 2026** — actively maintained. |
| What it does | Physics-accurate radar simulator (Python wrapper, C++ core). Generate synthetic FMCW returns for a digital twin of any scene — useful for training ML models without real captures. |
| Hospital fit | Not a deployment tool — a **synthetic data generator**. Use it to generate a million synthetic "patient turn" radar returns to bootstrap a model before collecting clinical data. |
| Atlas fit | Strategic value for ML data augmentation. |

### 1.7 Acconeer Python Exploration Tool + A121 / XM125

| Field | Value |
|---|---|
| URL | https://github.com/acconeer/acconeer-python-exploration |
| License | BSD-3-Clause-Clear (permissive, with patent-non-aggression) |
| Maintenance | 208 stars, **3,459 commits**, last push **April 2026** — extremely active. |
| What it does | Pure-Python SDK + GUI for Acconeer's 60 GHz pulsed-coherent radar. Ships **production reference apps** for: distance, presence detection (room-scale), motion/speed, breathing rate, parking sensor, tank level. The closest open-source analog to a turnkey radar product. |
| Hardware | **XM125 module** (A121 chip) — $49.95 at SparkFun (Qwiic). Or eval board XE125 + XC120 (~$200). Native A121 support on Raspberry Pi via the XE121 shield. |
| Output | Distance (mm-precision, 0–20 m), presence yes/no + intra/inter scores, breathing rate (BPM), speed. |
| Validation | Acconeer publishes reference algorithms with documented accuracy; presence detector validated for HVAC/lighting use cases up to 7 m. |
| Install | `python -m pip install --upgrade acconeer-exptool[app]` then `acconeer-exptool --new` |
| Min code | ```python
import acconeer.exptool as et
from acconeer.exptool.a121.algo.breathing import Detector, DetectorConfig
client = et.a121.Client.open(serial_port="/dev/ttyUSB0")
detector = Detector(client=client, sensor_id=1, config=DetectorConfig())
detector.start()
result = detector.get_next()
print(result.breathing_rate)
``` |
| Edge | Reference firmware runs **on-module** (Cortex-M33 STM32L431). I²C / UART out. Pi/ESP32 host optional. |
| Hospital fit | Tiny (~24×30 mm), low-power (<1 mW typical). Easy to embed in headwall, lampshade, bed frame. 60 GHz penetrates clothes/blanket. No camera. **Best privacy story of any radar option.** |
| Atlas / B10 fit | **Top contactless companion for B10.** XM125 mounted in the patient's headwall would give continuous breathing rate and presence — a contactless "is the patient still in bed and breathing?" cross-check for the wearable, at sub-$50 BoM. |
| Pick if | You want the most pip-install-friendly radar in the world, with shipping breathing/presence apps. |
| Avoid if | You need 3D point clouds for posture (use TI IWR6843 instead). |

### 1.8 Infineon BGT60TR13C (XENSIV)

| Field | Value |
|---|---|
| URL | https://github.com/Infineon/sensor-xensiv-bgt60trxx + https://github.com/Infineon/micropython-radar-bgt60 |
| License | MIT (host SDK); BSD-3 (RDK examples) |
| Maintenance | Active 2025. RDK ships C, C++, Python, MATLAB bindings. |
| What it does | 60 GHz FMCW with 3 RX / 1 TX. Reference apps for presence detection, segmentation (zones), gesture, vital signs (HR/RR). |
| Hardware | DEMO-BGT60TR13C eval board (~$170) or KIT_CSK_BGT60TR13C connected-sensor kit. |
| Output | Range-Doppler maps, presence zones, HR/RR. |
| Edge | RDK targets PSoC6 directly; Python via Radar Fusion GUI on host. |
| Atlas fit | Strong commercial-grade alternative to TI 6843 if Infineon's BCM (Bluetooth-co-packaged) ecosystem matters. |
| Pick if | You're already in the Infineon PSoC stack. |
| Avoid if | You want the largest open-source community — TI wins on community size. |

### 1.9 Walabot / Vayyar

| Field | Value |
|---|---|
| URL | https://api.walabot.com (Python wrapper); Vayyar Care SDK is **not public** |
| License | Closed binary SDK; Python wrapper free for personal/research |
| Maintenance | Walabot Developer Pack (Maker version) appears **end-of-life** (no new sensors since 2021); Vayyar pivoted entirely to commercial Vayyar Care (TekTone, Austco, Essex County partnerships). |
| Atlas fit | Vayyar Care is the closest commercial equivalent to what Atlas would build — but it's a closed product, not a toolkit. **Watch as competitor**, do not adopt as toolkit. |
| Pick if | You want to evaluate for procurement, not for building. |

### 1.10 SleepRF / RF-Sleep / RF-Pose (MIT CSAIL)

| Field | Value |
|---|---|
| URL | https://sleep.csail.mit.edu, https://rfpose.csail.mit.edu |
| Status | **Code "coming soon" since 2017.** Datasets available with research agreement; deployable code is not open. Emerald Innovations commercialized this stack (and was acquired interest noted). |
| Atlas fit | Strategic reference only — proves contactless sleep-stage classification is feasible from RF, but you cannot ship on this code. |

---

## Section 2 — WiFi CSI Sensing

### 2.1 SenseFi (xyanchen) — WiFi CSI Sensing Benchmark

| Field | Value |
|---|---|
| URL | https://github.com/xyanchen/WiFi-CSI-Sensing-Benchmark |
| License | MIT |
| Maintenance | 569 stars. Last push **November 2023** — stable, not active. |
| What it does | First open benchmark for WiFi CSI human sensing. PyTorch implementations of MLP, CNN, RNN, Transformer baselines on four public datasets (NTU-Fi-HAR, NTU-Fi-HumanID, UT-HAR, Widar). |
| Hardware | None directly — it works on **collected CSI data**. To collect CSI you need nexmon-CSI-compatible router (e.g., Asus RT-AC86U, ~$200) or Atheros CSI Tool. |
| Output | Activity / identity / gesture classifications. |
| Edge | Inference is light; data collection is the hard part. |
| Hospital fit | **Hard.** WiFi CSI is highly sensitive to multipath, requires careful AP placement, and falls apart when furniture moves. Hospitals are RF-noisy. Treat as research, not deployment. |
| Atlas fit | Low. Compelling story ("monitor with the WiFi you already have") but not production-grade in a hospital room. |
| Pick if | Research only. |
| Avoid if | You need clinical deployment in 2026. |

### 2.2 nexmon_csi (seemoo-lab)

| Field | Value |
|---|---|
| URL | https://github.com/seemoo-lab/nexmon_csi |
| License | None explicit — TU Darmstadt research code. |
| Maintenance | 437 stars. Last push **December 2025** — surprisingly active. |
| What it does | Firmware patch for Broadcom WiFi chips (Pi 3/4 onboard, Asus RT-AC86U, Nexus 5/6P) to extract per-frame CSI. The de-facto standard for cheap WiFi-CSI capture. |
| Atlas fit | Pair with SenseFi for prototyping; not a production path. |
| Pick if | Building a research demo. |
| Avoid if | Going to production. |

### 2.3 ESPARGOS

ESPARGOS is a research project from University of Stuttgart for ESP32-based WiFi CSI arrays. Repos exist on GitLab (gitlab.com/espargos) but are not GitHub-prominent. Worth tracking but premature for adoption.

---

## Section 3 — Acoustic

### 3.1 YAMNet (TensorFlow / Google)

| Field | Value |
|---|---|
| URL | https://github.com/tensorflow/models/tree/master/research/audioset/yamnet |
| License | Apache 2.0 |
| Maintenance | Part of `tensorflow/models` (77.6k stars, active April 2026). |
| What it does | MobileNetV1-based audio event classifier covering all 521 AudioSet classes — including **Cough**, **Throat clearing**, **Snoring**, **Breathing**, **Speech**, **Crying**, **Door**, **Glass shatter**, **Gunshot**. Returns embedding (1024-d) usable for transfer learning. |
| Hardware | Any mic. ReSpeaker 4-mic array (~$70), commodity USB mic, or Pi onboard. |
| Output | Per-frame (960 ms) class probabilities + 1024-d embedding. |
| Validation | mAP 0.314 on AudioSet eval (the standard benchmark). |
| Install | `pip install tensorflow-hub`; load via `hub.load('https://tfhub.dev/google/yamnet/1')`. |
| Min code | ```python
import tensorflow_hub as hub, soundfile as sf
yamnet = hub.load('https://tfhub.dev/google/yamnet/1')
wav, sr = sf.read('clip.wav')  # 16 kHz mono
scores, embeddings, spectrogram = yamnet(wav)
top_class = scores.numpy().mean(axis=0).argmax()
``` |
| Edge | **Excellent.** Official TFLite export → runs on Coral Edge TPU, Pi 4 in real time, ESP32-S3 with quantization. ~3.7M params. |
| Hospital fit | Mics raise privacy questions but **on-device + embedding-only** is defensible. Cough/snore/fall-sound detection is high-value and well-tolerated. |
| Atlas fit | **Top non-radar pick for room sensing.** Snore/breathing irregularity → sleep quality proxy. Cough → respiratory deterioration. Fall sound → confirmation cross-check with radar. Combine with a small classifier head on the embedding for "patient called out" / "fall thud." |
| Pick if | You want one model that catches a dozen meaningful room events with negligible compute. |
| Avoid if | Privacy team forbids any acoustic capture (rare). |

### 3.2 PANNs (Pre-trained Audio Neural Networks)

| Field | Value |
|---|---|
| URL | https://github.com/qiuqiangkong/audioset_tagging_cnn |
| License | MIT |
| Maintenance | 1,724 stars. Last push **July 2024.** |
| What it does | Larger and more accurate AudioSet tagging models (Wavegram-Logmel-CNN, ResNet-38, etc). mAP 0.439 — the SOTA before AST. |
| Edge | Heavier than YAMNet. Use Cnn14 (~80 MB) on Pi 4/Jetson; not for MCU. |
| Pick if | You can spend the compute and want better accuracy than YAMNet. |
| Avoid if | Edge-MCU deployment is required. |

### 3.3 COUGHVID (EPFL ESL)

| Field | Value |
|---|---|
| URL | https://github.com/esl-epfl/Cough-E + https://github.com/esl-epfl/edge-ai-cough-count |
| License | MIT (code); CC-BY-4.0 (dataset) |
| Maintenance | Active 2024-2025; ESL group still publishing. |
| What it does | XGBoost cough classifier + edge-AI cough-count pipeline targeting wearables. 25k+ crowd-sourced cough recordings. |
| Atlas fit | Direct relevance for respiratory deterioration on med-surg floors. Pair with B10 acoustic channel if applicable. |
| Pick if | You want a tested cough classifier. |

### 3.4 VGGish

Older Google audio embedding (128-d). Now mostly superseded by YAMNet's 1024-d embedding. Use only for backwards compatibility with existing classifiers.

---

## Section 4 — Contactless Vital Signs (Camera / Thermal)

### 4.1 rPPG-Toolbox (ubicomplab, Univ. Washington)

| Field | Value |
|---|---|
| URL | https://github.com/ubicomplab/rPPG-Toolbox |
| License | Responsible AI License (RAIL — close to permissive but with use-case clauses; review for hospital deployment) |
| Maintenance | 1,027 stars, **last push April 2026**, NeurIPS 2023 paper. The most active rPPG project. |
| What it does | 7 unsupervised + 10 deep rPPG models (DeepPhys, TS-CAN, EfficientPhys, PhysNet, PhysFormer, PhysMamba, RhythmFormer, FactorizePhys, etc.) on 7 public datasets. Heart rate from face video. Some models also estimate respiration. |
| Hardware | Any RGB webcam (Logitech C920 ~$70). For best results: 30 fps, even lighting, face visible. |
| Output | BVP waveform → HR (BPM), HRV, RR. |
| Validation | Bland-Altman validated on PURE, UBFC-rPPG, MMPD, iBVP. TS-CAN typically <2 BPM MAE under good conditions. |
| Install | `git clone … && bash setup.sh conda` |
| Min code | ```python
python main.py --config_file ./configs/infer_configs/PURE_UBFC-rPPG_TSCAN_BASIC.yaml
``` |
| Edge | TS-CAN runs ~real-time on Jetson Orin Nano; CPU-only Pi 5 possible at reduced fps. |
| Hospital fit | Camera in patient room is **the** privacy hurdle. Mitigations: edge-only inference, never store frames, IR-only mode. License (RAIL) needs legal review. |
| Atlas fit | Where Atlas already has a tablet at bedside (BMM kiosk?), enabling rPPG would add HR cross-check at zero hardware cost. Useful as **clinic-side ROI demonstrator**, less so as in-room continuous monitoring. |
| Pick if | You already have a camera at bedside and want HR for free. |
| Avoid if | Privacy legal review will reject any camera in patient rooms. |

### 4.2 open-rppg (KegangWangCCNU)

Smaller, simpler inference-only fork. 54 stars. Use rPPG-Toolbox unless you need a stripped-down alternative.

### 4.3 Thermal respiration

No dominant open-source toolkit. FLIR Lepton 3.5 (~$200) + custom temporal-band-pass on the nostril ROI. Roll your own — there is no SenseFi-equivalent here.

---

## Section 5 — In-Bed Pressure / Load Cell / BCG (Atlas-Critical)

### 5.1 PmatData (PhysioNet)

| Field | Value |
|---|---|
| URL | https://physionet.org/content/pmd/1.0.0/ |
| License | Open Data Commons Attribution v1.0 (permissive) |
| What it does | The canonical open dataset for in-bed posture from pressure mats. 13 subjects, 8 standard postures + 9 transitional states (Experiment I); 8 subjects, 29 fine-grained variants (Experiment II). Captured on **Vista Medical FSA SoftFlex 2048** and **BodiTrak BT3510**. 32×64 pressure grid at 1 Hz, values 0–1000. |
| Atlas fit | **The training set for an Atlas in-bed-turn-detection model.** Plug into any 2D-CNN; >97% LOSO accuracy reported in 2023-2024 literature. |

### 5.2 SLP-Dataset-and-Code (Ostadabbas, Northeastern)

| Field | Value |
|---|---|
| URL | https://github.com/ostadabbas/SLP-Dataset-and-Code |
| License | MIT (code); custom academic for dataset (request access) |
| Maintenance | TPAMI 2022 paper; repo updated through 2024. |
| What it does | Multimodal in-bed pose dataset: **RGB + LWIR thermal + Depth + Pressure Map**, 109 participants, 3 cover conditions (no cover / sheet / blanket), 14 joints labeled. Plus baseline pose-estimation models. **The most important academic asset for Atlas's in-bed problem.** |
| Atlas fit | **Highest fit of any single resource in this document.** Pre-trained pose estimators on bed-occluded patients — exactly Atlas's repositioning problem. |
| Pick if | You want a head start on in-bed pose with cover occlusion. |

### 5.3 BodyPressure (Healthcare-Robotics, Georgia Tech)

| Field | Value |
|---|---|
| URL | https://github.com/Healthcare-Robotics/BodyPressure |
| License | MIT |
| What it does | Infers full 3D body pose **and** contact-pressure map from a single depth image. Trained on 200k synthetic + real samples. SMPL-based body model. |
| Hardware | Kinect Azure / Intel RealSense D435/D455. |
| Atlas fit | **Game-changing for repositioning.** Estimate pressure distribution from **a depth camera alone** — no mat needed. The "no-mat HAPI moonshot" path. |
| Pick if | You want to see if depth-only pressure estimation is good enough for clinical use. |

### 5.4 BCG-Open / Bed-Based Ballistocardiography Dataset (IEEE DataPort + Nature 2024-2025)

| Field | Value |
|---|---|
| URL | https://ieee-dataport.org/open-access/bed-based-ballistocardiography-dataset; https://www.nature.com/articles/s41597-024-03950-5; https://www.nature.com/articles/s41597-025-05936-3; https://www.nature.com/articles/s41597-025-05287-z |
| License | CC-BY-4.0 (datasets); reference Python code in supplements (varies). |
| What it does | Three brand-new (2024-2025) **clinical-grade BCG datasets** with reference ECG: 32-subject piezoelectric film overnight, 46-subject arrhythmia BCG, plus multi-pathology (HF + AF + PVC + PAC). Replaces the previously-thin BCG open-source story. |
| Hardware | Off-the-shelf load cells (Bashar et al. installed under hospital bed legs ~$200 BoM) **or** piezo film under bedsheet (Emfit-style, ~$100 BoM). |
| Atlas fit | **Direct path to a contactless HR/RR/sleep-stage signal under the mattress.** No skin contact, no consumable. Pair with a ~50-line Python pipeline (band-pass + peak detect or 1D CNN trained on these new datasets). |
| Pick if | You want under-mattress vitals at <$200 BoM and full algorithmic openness. |
| Avoid if | You need a clinically-cleared device today (Withings Sleep Analyzer is the only FDA-cleared comparable). |

### 5.5 Withings Sleep Analyzer (closed, but worth noting)

Under-mattress pad, FDA-cleared (K231667, Sept 2024) for sleep apnea screening. Pneumatic-BCG. **Cloud-only API**. Use for a turnkey commercial reference / consumer-grade procurement option, not as a toolkit.

### 5.6 Murata SCA10H, Emfit, Earlysense, Movewise

All proprietary. Earlysense → Hillrom (Baxter) for hospital. No public open-source analog directly — but **Section 5.4 BCG datasets + load cells** is now a credible open-source path to ~80% of Earlysense's value.

---

## Section 6 — LiDAR / Depth

### 6.1 Intel RealSense SDK (librealsense)

| Field | Value |
|---|---|
| URL | https://github.com/IntelRealSense/librealsense |
| License | Apache 2.0 |
| Maintenance | 8.7k stars, last push **April 2026** — actively maintained even after Intel's spinoff to RealSenseAI. |
| What it does | C++/Python SDK for D400-series (D435/D455), L515 LiDAR, T265 tracking. Aligned color+depth, IMU, point clouds. |
| Hardware | D435 (~$330) or D455 (~$420) for indoor 3D + RGB; L515 LiDAR ($350, EOL but still around). |
| Output | RGB + depth + IR + IMU streams. |
| Atlas fit | Pair with **BodyPressure (5.3)** for "depth-only pressure estimation" or **MediaPipe / OpenPose** for in-bed pose. The most flexible "give me a clean 3D feed of the patient" sensor. |

### 6.2 Open3D (isl-org)

| Field | Value |
|---|---|
| URL | https://github.com/isl-org/Open3D |
| License | MIT |
| Maintenance | 13.5k stars, push **April 2026.** |
| What it does | The standard 3D processing library: ICP, RANSAC, voxel grids, surface reconstruction, point-cloud ML. |
| Atlas fit | Foundation for any depth-based pipeline (floor mapping, ceiling-mounted body tracking, room digital twin for the Accelerate hospital robot OS). |

### 6.3 MediaPipe Pose

Google's lightweight 33-joint full-body pose. Runs on Pi 5 in real time, browser, mobile. Combined with a top-down camera mounted above the bed, it gives a basic in-bed pose at ~$50 BoM. Limited under blankets — that's where SLP-Dataset / BodyPressure win.

---

## Section 7 — DECISION MATRIX (top contactless picks)

Scoring 1–5; weighted by Atlas/Accelerate hospital deployment fit.

| Toolkit | Sleep | Fall | Presence | Vitals | Repositioning | Maintenance | License | Edge | Hospital fit | TOTAL |
|---|---|---|---|---|---|---|---|---|---|---|
| **TI mmWave Toolbox + IWR6843AOP** | 3 | 5 | 5 | 4 | 4 | 5 | 5 | 5 | 4 | **40** |
| **Acconeer A121 / XM125 + exptool** | 4 | 2 | 5 | 4 | 1 | 5 | 5 | 5 | 5 | **36** |
| **YAMNet (acoustic)** | 4 | 3 | 3 | 1 | 1 | 5 | 5 | 5 | 4 | **31** |
| **rPPG-Toolbox** | 2 | 1 | 2 | 5 | 1 | 5 | 3 | 4 | 2 | **25** |
| **SLP-Dataset + BodyPressure (depth+pressure)** | 4 | 2 | 3 | 1 | **5** | 4 | 5 | 4 | 4 | **32** |
| **PmatData + commodity pressure mat** | 3 | 1 | 2 | 1 | **5** | 3 | 5 | 5 | 5 | **30** |
| **BCG dataset + load cell + 1D CNN** | 5 | 1 | 3 | 5 | 2 | 4 | 5 | 4 | 4 | **33** |
| **Infineon BGT60TR13C + RDK** | 3 | 4 | 5 | 4 | 3 | 4 | 5 | 5 | 4 | **37** |
| **SenseFi + nexmon CSI** | 2 | 2 | 3 | 1 | 1 | 3 | 5 | 4 | 2 | **23** |
| **RealSense + MediaPipe / BodyPressure** | 2 | 4 | 4 | 1 | **5** | 5 | 5 | 4 | 3 | **33** |

---

## Section 8 — RECOMMENDED STACKS

### Stack A: Overnight Contactless Sleep Monitoring in a Patient Room (B10-complementary)

**Goal:** Continuous breathing rate, sleep stages, snore/cough detection, presence — without anything touching the patient.

| Layer | Component | BoM | Why |
|---|---|---|---|
| Headwall radar | **Acconeer XM125** (breathing + presence apps) | $50 | Tiny, Pi-friendly, instant breathing rate |
| Under-mattress | **Load-cell BCG** (4× HX711 cells under bed legs) + Python (band-pass + 2024 BCG-dataset-trained 1D CNN) | $200 | HR, HRV, sleep stages |
| Ambient mic | **ReSpeaker 4-mic** + **YAMNet TFLite** | $70 | Snore, cough, distress speech, fall-sound |
| Edge compute | **Raspberry Pi 5** | $80 | Fuses all three; pushes to Atlas Mobility Cloud |
| **Total per room** | | **~$400** | vs. EarlySense at $2k+ per bed |

This stack delivers ~80% of EarlySense + Withings combined for ~$400 BoM, with the entire algorithmic chain in Atlas's control. **B10** continues to provide ground-truth motion + skin-contact vitals on patients flagged for high risk; the contactless stack covers the long tail of patients who refuse or remove wearables.

### Stack B: Atlas HAPI / Repositioning Moonshot

**Goal:** Detect every patient turn, time-since-last-turn, and pressure-redistribution event automatically — no nurse documentation needed.

| Layer | Component | BoM | Why |
|---|---|---|---|
| Above-bed | **TI IWR6843AOPEVM** (3D People Tracking + Vital Signs With People Tracking) | $186 | Tracks centroid + posture, can distinguish patient from nurse-during-turn |
| Under-sheet (Phase 2) | **Vista BodiTrak BT3510** pressure mat OR custom Velostat-Arduino mat (~$150) | $150–$1500 | Ground-truth pressure map; trains 2D CNN per **PmatData / SLP-Dataset** |
| Optional depth | **Intel RealSense D455** + **BodyPressure** | $420 | Inferred-pressure from depth — the "no-mat" play |
| Edge compute | **Jetson Orin Nano 8GB** | $250 | Runs the 3D tracker + pose model + fusion |
| Cloud | Atlas Mobility Cloud — fuse with B10 patch, BMM, UMM | — | One unified turn timeline per patient |

**Algorithmic core:**
1. Fine-tune **SLP-Dataset** pose estimator on the bed-mounted RealSense view → in-bed joint angles.
2. Re-train **RadHAR**'s LSTM on Atlas-collected radar point clouds for "turn left / turn right / sit-edge / out-of-bed."
3. Train a **2D CNN** on **PmatData** + Atlas's own pressure-mat captures for posture classification on commodity mats.
4. Fuse: an event counts as a "turn" when ≥2 of (pose change >30°, radar centroid pivot, pressure-distribution shift) agree within 5 s.

This is the contactless complement to the B10 patch: B10 confirms patient identity + skin-contact verifying signals; the room sensors cover the patient-not-wearing-it case and provide a continuous environmental record (visitor in room, nurse turning event, etc.) that B10 cannot provide.

---

## Section 9 — NON-OBVIOUS FINDS

1. **BodyPressure (Healthcare-Robotics, Georgia Tech)** — under-known. Inferring full body pressure from a single depth image is exactly the Atlas dream. MIT-licensed. The single most strategically valuable repo I found for the HAPI moonshot.

2. **The new 2024–2025 BCG datasets (Nature Scientific Data x3)** — These changed the game in the last 18 months. BCG used to be "you need to collect your own dataset." Now there are 110+ subjects of overnight clinical-grade BCG with reference ECG, free for download. Pair with cheap load cells = a credible open EarlySense in a weekend.

3. **Acconeer XM125 at $49.95** — most engineers don't realize you can get a production-grade 60 GHz coherent radar with a maintained Python SDK and pip-installable breathing detector for the price of a textbook. This is the most under-rated radar in the open ecosystem.

4. **TI's "Vital Signs With People Tracking" reference app** — solves the killer problem with mmWave vitals (the algorithm assumes one stationary person). The 2024 update tracks multiple people and applies vitals to the patient track only. Critical for hospital rooms that have visitors.

5. **mmFall's anomaly-detection framing (HVRAE)** — The license is unfortunate (no declared license) but the **idea** of unsupervised anomaly detection on radar point clouds is the right framing for Atlas: you don't need to label every "bad transfer" — you just need to know what a normal in-bed signature looks like.

6. **SLP Dataset's cover-conditions** — 109 participants × 3 cover conditions (no cover / sheet / blanket) is uniquely realistic for hospital beds. Almost every other in-bed dataset assumes you can see the patient, which is wrong.

7. **Synthetic-data generation via RadarSimPy** — under-used. Generate 100k synthetic "patient turn" radar returns to bootstrap before clinical data collection. This compresses Atlas's data-collection timeline by months.

---

## Sources

- [TI Vital Signs With People Tracking User Guide](https://dev.ti.com/tirex/explore/node?node=A__AMK61TkbsnY89Axyqsuxmw__radar_toolbox__1AslXXD__LATEST)
- [TI Vital Signs User Guide](https://dev.ti.com/tirex/explore/node?node=A__AAE8pPm06C-WbgWg.OXCPQ__radar_toolbox__1AslXXD__LATEST)
- [TI IWR6843AOPEVM product page](https://www.ti.com/tool/IWR6843AOPEVM)
- [DigiKey IWR6843AOPEVM listing ($186.25)](https://www.digikey.com/en/products/detail/texas-instruments/IWR6843AOPEVM/12165115)
- [DigiKey IWR6843ISK listing ($218.75)](https://www.digikey.com/en/products/detail/texas-instruments/IWR6843ISK/10434492)
- [OpenRadar (PreSenseRadar) — Apache 2.0](https://github.com/PreSenseRadar/OpenRadar)
- [pymmw (m6c7l)](https://github.com/m6c7l/pymmw)
- [RadHAR (NESL UCLA) — BSD-3](https://github.com/nesl/RadHAR)
- [mmFall (radar-lab UTA)](https://github.com/radar-lab/mmfall)
- [RadarSimPy — GPL-3.0](https://github.com/radarsimx/radarsimpy)
- [Acconeer Python Exploration Tool](https://github.com/acconeer/acconeer-python-exploration)
- [SparkFun XM125 Hookup Guide ($49.95)](https://www.sparkfun.com/sparkfun-pulsed-coherent-radar-sensor-acconeer-xm125-qwiic.html)
- [Infineon sensor-xensiv-bgt60trxx](https://github.com/Infineon/sensor-xensiv-bgt60trxx)
- [Infineon micropython-radar-bgt60](https://github.com/Infineon/micropython-radar-bgt60)
- [Walabot Python API](https://api.walabot.com/_pythonapi.html)
- [Vayyar Care](https://vayyar.com/care/)
- [MIT CSAIL — Learning Sleep Stages from Radio Signals](https://sleep.csail.mit.edu/)
- [SenseFi (xyanchen) — MIT](https://github.com/xyanchen/WiFi-CSI-Sensing-Benchmark)
- [nexmon_csi (seemoo-lab)](https://github.com/seemoo-lab/nexmon_csi)
- [YAMNet TF model card](https://www.tensorflow.org/hub/tutorials/yamnet)
- [PANNs (qiuqiangkong) — MIT](https://github.com/qiuqiangkong/audioset_tagging_cnn)
- [COUGHVID (EPFL) about page](https://coughvid.epfl.ch/about/)
- [esl-epfl/Cough-E](https://github.com/esl-epfl/Cough-E)
- [rPPG-Toolbox (ubicomplab) — RAIL](https://github.com/ubicomplab/rPPG-Toolbox)
- [PhysioNet PmatData v1.0.0](https://physionet.org/content/pmd/1.0.0/)
- [SLP-Dataset-and-Code (Ostadabbas)](https://github.com/ostadabbas/SLP-Dataset-and-Code)
- [BodyPressure (Healthcare-Robotics)](https://github.com/Healthcare-Robotics/BodyPressure)
- [Bed-Based BCG Dataset (IEEE DataPort)](https://ieee-dataport.org/open-access/bed-based-ballistocardiography-dataset)
- [BCG dataset with reference sensors in long-term sleep (Nature SciData 2024)](https://www.nature.com/articles/s41597-024-03950-5)
- [BCG dataset with reference ECG for bed-based heart rhythm (Nature SciData 2025)](https://www.nature.com/articles/s41597-025-05936-3)
- [Multi-Pathology BCG Dataset (Nature SciData 2025)](https://www.nature.com/articles/s41597-025-05287-z)
- [Withings Sleep Analyzer FDA K231667](https://www.accessdata.fda.gov/cdrh_docs/pdf23/K231667.pdf)
- [librealsense (RealSense SDK) — Apache 2.0](https://github.com/IntelRealSense/librealsense)
- [Open3D — MIT](https://github.com/isl-org/Open3D)
- [Sleep Posture Transition (SPT) mmWave dataset](https://www.sciencedirect.com/science/article/pii/S2352340925002033)
- [kirkster96/IWR6843-Read-Data-Python-MMWAVE-SDK](https://github.com/kirkster96/IWR6843-Read-Data-Python-MMWAVE-SDK)
- [ibaiGorordo/AWR1843-Read-Data-Python](https://github.com/ibaiGorordo/AWR1843-Read-Data-Python-MMWAVE-SDK-3-)
- [Infineon RDK presence-detection example](https://github.com/Infineon/mtb-example-ce241611-xensiv-60ghz-radar-presence-detection)
- [Frontiers in Medicine — Non-contact sensors in hospitals (2024)](https://www.frontiersin.org/journals/medicine/articles/10.3389/fmed.2024.1421901/full)
- [Fraunhofer contactless ECG-via-radar (May 2025)](https://www.fraunhofer.de/en/press/research-news/2025/may-2025/contactless-patient-monitoring-ecg-using-radar.html)
