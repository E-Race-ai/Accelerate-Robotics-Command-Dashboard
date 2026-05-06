# Vision & Skeleton Toolkits — Decision-Grade Research

**Audience:** Eric Race (Atlas Mobility / Accelerate Robotics)
**Purpose:** Adopt 1-3 production-ready open-source pipelines for room cameras (RGB / depth / IR / thermal) on Jetson-class hardware. NOT training from scratch.
**Date:** 2026-04-27
**Hardware target:** Jetson Orin Nano / Orin NX (preferred), occasional desktop GPU for batch
**Privacy constraint:** Skeleton-only pipelines preferred; raw RGB must be discardable
**Licensing constraint:** Apache 2.0 / MIT / BSD ideal; AGPL/non-commercial flagged

---

## TL;DR — The Three to Adopt

1. **RTMPose (via rtmlib)** — Apache-2.0, actively maintained Feb 2026, ONNX/TensorRT-ready, ships in a 4-dependency Python package. Top of stack for general pose.
2. **MediaPipe Pose Landmarker** — Apache-2.0, Google-maintained (release v0.10.33 Mar 2026), 33-landmark output with z-depth, fastest path to a JS/Node.js prototype that matches Eric's command-center stack.
3. **PySKL + PoseC3D** — Apache-2.0, the right downstream classifier on top of any pose stream for fall / sit-to-stand / repositioning detection. Caveat: repo "currently not maintained" — use the architecture/configs but vendor the inference code into our own repo.

**Anti-recommendation:** Avoid YOLOv8/v11-Pose, OpenPose, AlphaPose, and the GajuuzZ Human-Falling-Detect-Tracks repo for any commercial Atlas/Accelerate product without legal review (AGPL-3.0 or non-commercial).

---

## Section 1 — Pose Estimation

### 1.1 RTMPose (OpenMMLab) + rtmlib

| Field | Value |
|---|---|
| Repo | https://github.com/open-mmlab/mmpose (project: `projects/rtmpose`) |
| Lightweight wrapper | https://github.com/Tau-J/rtmlib (recommended entry point) |
| License | **Apache-2.0** (green) |
| Stars | MMPose 7.6k / rtmlib 572 |
| Maintenance | MMPose v1.3.2 Jul 2024; rtmlib commit Feb 10, 2026 — **actively maintained** |

**What it does:** Real-time multi-person 2D pose estimation. Top-down (detector + pose) or single-stage RTMO. Available in 4 sizes (t/s/m/l), 17/21/26/133 keypoint variants, plus 3D wholebody (RTMW3D) and animal (RTMW).

**Input:** RGB frames, typical 256×192 or 384×288 crops after person detection. Sample rate: easily 30 FPS at typical hospital camera resolutions.

**Output:** COCO-17, COCO-WholeBody-133, Halpe-26 — all available. `(N_persons, K_keypoints, 3)` array of (x, y, score).

**Performance:**
- RTMPose-t: 68.5 AP on COCO, ~940 FPS on GTX 1660 Ti TRT-FP16
- RTMPose-s: 72.2 AP, ~710 FPS
- RTMPose-m: 75.8 AP, ~430 FPS  ← **recommended default**
- RTMPose-l: 76.5 AP, ~280 FPS
- Jetson Orin Nano (extrapolated, no official RTMPose number found): expect 30-60 FPS for RTMPose-m at FP16; RTMPose-t comfortably 100+ FPS.

**Validation:** Trained on COCO + AIC. Validated against COCO val/test-dev. Open-source paper "RTMPose: Real-Time Multi-Person Pose Estimation based on MMPose."

**Install (the easy path — rtmlib):**
```bash
pip install rtmlib
pip install onnxruntime-gpu  # or onnxruntime for CPU
```

**Minimal code:**
```python
import cv2
from rtmlib import Body, draw_skeleton

img = cv2.imread('frame.jpg')
body = Body(mode='balanced', backend='onnxruntime', device='cuda')  # 'lightweight'/'balanced'/'performance'
keypoints, scores = body(img)
img = draw_skeleton(img, keypoints, scores, kpt_thr=0.5)
```

**Privacy story:** Skeleton-only pipeline trivial — the output is just (x,y,score) arrays; you never need to persist RGB. Matches our preferred "raw frame stays in RAM, skeleton goes to log" pattern.

**B10/Accelerate fit:** Excellent. Run on Jetson at the edge, ship JSON keypoints over websocket to the Node.js command center. rtmlib is 4 deps total — easy to vendor into a Docker image alongside the Keenon E-Box gateway.

**Pick this if:** You want one canonical pose model that handles 17 / 26 / 133 keypoint outputs, deploys to Jetson via TensorRT, and has a maintained Python wrapper (rtmlib) you can pip-install today.

**Avoid if:** You need pure TFLite/JS (then use MediaPipe).

---

### 1.2 MediaPipe Pose Landmarker (Google)

| Field | Value |
|---|---|
| Repo | https://github.com/google-ai-edge/mediapipe |
| License | **Apache-2.0** |
| Stars | 35k |
| Maintenance | v0.10.33 (Mar 23, 2026) — Google-maintained, **very active** |

**What it does:** BlazePose-based on-device pose tracker with detection→tracking pipeline. Exists as Python, Web (JS/WASM), iOS, Android, C++. Three model variants: Lite, Full, Heavy.

**Input:** RGB frames, typically 256×256.

**Output:** **33 landmarks** with both normalized image coords and 3D world coords (x,y,z meters with hip midpoint as origin) plus visibility scores. NOTE: 33-landmark schema is *not* COCO-17 — translation needed for downstream models trained on COCO.

**Performance:**
- Web/desktop: 30+ FPS easily
- Jetson Orin Nano: community reports ~20 FPS on older Jetson Nano with GPU build; Orin Nano expected significantly higher (~60+) but officially **MediaPipe doesn't ship a Jetson build** — must build from source or use the Python wheel via conda. NVIDIA forum confirms it works but isn't a first-class platform.
- Coral Edge TPU: 7.1 ms (MoveNet Lightning) / 13.8 ms (Thunder)

**Validation:** Google's BlazePose paper. Internal benchmarks; not as strong on COCO as RTMPose-m (~67 AP equivalent on Heavy).

**Install:**
```bash
pip install mediapipe
# Or for Node.js:
npm install @mediapipe/tasks-vision
```

**Minimal code (Python):**
```python
import mediapipe as mp
opts = mp.tasks.vision.PoseLandmarkerOptions(
    base_options=mp.tasks.BaseOptions(model_asset_path='pose_landmarker_full.task'),
    running_mode=mp.tasks.vision.RunningMode.VIDEO)
with mp.tasks.vision.PoseLandmarker.create_from_options(opts) as lm:
    img = mp.Image.create_from_file('frame.jpg')
    result = lm.detect(img)  # result.pose_landmarks, result.pose_world_landmarks
```

**Privacy story:** Skeleton-only. Z-coordinate gives pseudo-3D without depth camera.

**B10/Accelerate fit:** **Best for the Node.js command center prototype** — drop-in `@mediapipe/tasks-vision` runs in browser or Node, no Python required. Trade-off: not as accurate as RTMPose-m, and the 33-landmark schema is unique (need a translator if you pipe into PySKL/PoseC3D which expect COCO-17).

**Pick this if:** You want browser/Node-native pose with zero ML toolchain on the dashboard side, OR you need pseudo-3D world coords without a depth camera.

**Avoid if:** You need top-tier COCO accuracy (use RTMPose), or you're feeding a downstream skeleton-action model that expects COCO-17.

---

### 1.3 YOLOv8-Pose / YOLOv11-Pose (Ultralytics) — **AGPL FLAG**

| Field | Value |
|---|---|
| Repo | https://github.com/ultralytics/ultralytics |
| License | **AGPL-3.0** (red flag for commercial product) |
| Commercial alt | Ultralytics Enterprise License (paid, undisclosed price) |
| Stars | 35k+ |
| Maintenance | Very active, weekly releases |

**Performance on Jetson Orin Nano (TensorRT):**
- YOLOv8n (detection, INT8): ~43 FPS
- YOLOv8n-pose: ~30-40 FPS expected
- Energy: 7.4-8.7 W

**B10/Accelerate fit / WHY: avoid:** AGPL-3.0 is a copyleft license that contaminates any service that "interacts with users over a network" — meaning if our command center hits a YOLO endpoint, the entire stack arguably becomes AGPL. For a commercial hospital robotics OS this is poison. Either pay Ultralytics for the Enterprise License or stay away. **Recommend: stay away.** RTMPose covers the same use case under Apache-2.0.

**Avoid for B10/Accelerate.** Use only if you've negotiated an Enterprise License, or for internal R&D that never ships.

---

### 1.4 ViTPose / easy_ViTPose

| Field | Value |
|---|---|
| Repo | https://github.com/ViTAE-Transformer/ViTPose |
| Easy wrapper | https://github.com/JunkyByte/easy_ViTPose |
| License | **Apache-2.0** |
| Stars | 2k (official) |
| Maintenance | Updates through Dec 2025 |

**Performance (COCO val):** S 73.8 / B 75.8 / L 78.3 / H 79.1 AP — best-in-class on accuracy at the H tier.

**B10/Accelerate fit:** Good as a **research/calibration model** — when you need ground truth on a labeled clip, run ViTPose-Huge offline on the desktop GPU. Too heavy for Jetson Orin Nano real-time. easy_ViTPose ships ONNX/TensorRT export, claims 30+ FPS on modern Nvidia GPUs.

**Pick this if:** You need high-AP human + animal pose for an offline analysis pipeline (e.g., labeling sleep videos for in-bed pose model training).

---

### 1.5 MoveNet (Google) + Coral Edge TPU

| Field | Value |
|---|---|
| Repo | https://github.com/tensorflow/tfjs-models (pose-detection/movenet) |
| License | **Apache-2.0** |
| Maintenance | Stable but slow — Google has shifted attention to MediaPipe Tasks |

**Performance:**
- Coral Edge TPU: 7.1 ms (Lightning, 192×192) / 13.8 ms (Thunder, 256×256)
- 30+ FPS on most modern desktops
- Jetson: GPU delegate doesn't help — community recommends ONNX→TensorRT conversion via PINTO model zoo

**Output:** COCO-17 keypoints. Single-pose and multi-pose variants.

**B10/Accelerate fit:** Only consider if you're shipping a Coral USB Accelerator instead of a Jetson — at $60 for a Coral USB Accelerator vs ~$500 for an Orin Nano kit, this could be cost-effective for non-pose-heavy rooms (door cams, hall sensors). For pose+action pipelines on Jetson, RTMPose wins.

---

### 1.6 trt_pose (NVIDIA-AI-IOT)

| Field | Value |
|---|---|
| Repo | https://github.com/NVIDIA-AI-IOT/trt_pose |
| License | **MIT** |
| Stars | 1.1k |
| Maintenance | Slow — ResNet18/DenseNet121 baselines, no Orin-specific update |

**Performance:**
- Jetson Nano: 22 FPS (ResNet18) / 12 FPS (DenseNet121)
- Jetson Xavier: 251 FPS (ResNet18) / 101 FPS (DenseNet121)

**B10/Accelerate fit:** NVIDIA reference implementation, but RTMPose-t via rtmlib already beats it on accuracy at similar speed and is more actively maintained. Use only if you need a ROS2 wrapper out of the box (`ros2_trt_pose`).

---

### 1.7 OpenPose / AlphaPose — **NON-COMMERCIAL FLAG**

| Project | License | Note |
|---|---|---|
| OpenPose (CMU) | Free for non-commercial; **$25k/year commercial** (excludes Sports) | DO NOT use commercially without paying CMU |
| AlphaPose (SJTU) | Free non-commercial; mixed component licenses | DO NOT use commercially |

**B10/Accelerate fit:** Both are historically influential but commercially toxic. RTMPose has matched or exceeded their accuracy and is Apache-2.0. **Avoid.**

---

### 1.8 DeepLabCut

| Field | Value |
|---|---|
| Repo | https://github.com/DeepLabCut/DeepLabCut |
| License | **LGPL-3.0** (mostly OK for commercial — dynamic linking allowed); SuperAnimal models are non-commercial |
| Stars | 5.6k |
| Maintenance | v3.0.0rc10 (Jul 2025) — **very active** |

**B10/Accelerate fit:** Designed for animal pose with custom-trainable skeletons. Has a `full_human` model. Unique strength: trivial to train on a custom skeleton (e.g., "patient + bedrail + IV pole" landmarks). LGPL has fewer copyleft headaches than AGPL but watch the SuperAnimal model license.

**Pick this if:** You need a *custom* skeleton (e.g., tracking patient + caregiver hand placement during a transfer) and want a labeling+training GUI. Otherwise overkill.

---

## Section 2 — Skeleton-Based Action Recognition

### 2.1 PySKL

| Field | Value |
|---|---|
| Repo | https://github.com/kennymckormick/pyskl |
| License | **Apache-2.0** |
| Stars | 1.2k |
| Maintenance | **"Not currently maintained by the developer"** — caveat |

**Algorithms supported:** ST-GCN, ST-GCN++ (the recommended GCN), PoseConv3D, DG-STGCN, CTR-GCN, MS-G3D, AAGCN.

**B10/Accelerate fit:** PoseConv3D is the right choice for fall / sit-to-stand / lying-still / repositioning detection — it's robust to noisy poses and outperforms GCNs. **WHY: vendor the architecture and config files into our repo, retrain on our hospital action set; don't depend on PySKL as an installed library since it's unmaintained.**

**Pick this if:** You want best-in-class skeleton-action performance and are willing to absorb the inference code.

---

### 2.2 MMAction2

| Field | Value |
|---|---|
| Repo | https://github.com/open-mmlab/mmaction2 |
| License | **Apache-2.0** |
| Stars | 5k |
| Latest | v1.2.0 (Oct 2023) — **maintained but slow** |

**Algorithms:** ST-GCN, 2s-AGCN, PoseC3D, STGCN++, CTRGCN, MSG3D — same set as PySKL plus video-only models (SlowFast, X3D, VindLU).

**B10/Accelerate fit:** Maintained alternative to PySKL. If you can stomach the OpenMMLab toolchain (mmcv, mmengine, registries), MMAction2 + RTMPose is the canonical full-stack and is officially supported. Recommend: **MMAction2 as the trainer, but at inference time vendor just the model + checkpoint into a thin runtime.**

---

### 2.3 CTR-GCN (reference implementation)

| Field | Value |
|---|---|
| Repo | https://github.com/Uason-Chen/CTR-GCN |
| License | (LICENSE file present, type unspecified — assume permissive) |
| Stars | 356 |
| Performance | 83.7% NTU120 X-Sub joint-only; ensemble ~88-89% |

**B10/Accelerate fit:** Useful as a reference for comparison; PySKL bundles CTR-GCN with better engineering.

---

### 2.4 SlowFast / X3D (PyTorchVideo / FAIR)

| Repo | https://github.com/facebookresearch/pytorchvideo, https://github.com/facebookresearch/SlowFast |
| License | **Apache-2.0** |
| Maintenance | Slowing down — most active 2021-2022 |

**Performance:** SlowFast R101 16×8 → 78.7% top-1 Kinetics-400. X3D-S/M/L/XL trade-offs for edge.

**B10/Accelerate fit:** RGB video classifier — runs *on raw frames*, not skeletons. Violates our privacy preference. Use only if pose stream isn't reliable enough (e.g., very cluttered pediatric room with stuffed animals confusing the pose detector). X3D-XS could fit Jetson Orin NX.

---

## Section 3 — Fall Detection (Vision/Skeleton)

### 3.1 Human-Falling-Detect-Tracks (GajuuzZ)

| Field | Value |
|---|---|
| Repo | https://github.com/GajuuzZ/Human-Falling-Detect-Tracks |
| License | **Not specified** in repo — **legal red flag** |
| Stars | 847 |
| Maintenance | 21 commits, last activity stale; uses AlphaPose (non-commercial) under the hood |
| Pipeline | Tiny-YOLO-oneclass → AlphaPose → ST-GCN → SORT |
| Classes | 7 actions: Standing, Walking, Sitting, Lying Down, Stand up, Sit down, Fall Down |

**B10/Accelerate fit:** **Avoid for production.** The architecture is a useful reference (this exact 4-stage pipeline is the canonical pattern), but the upstream AlphaPose dependency is non-commercial and the repo has no explicit license. Re-implement the same pattern with: RTMPose (Apache-2.0) + ByteTrack (MIT) + ST-GCN++/PoseC3D from PySKL configs (Apache-2.0).

**Pick this only if:** You're prototyping internally and not shipping. As a *blueprint*, it's gold.

---

### 3.2 YOLOv8-based fall detectors (various)

Examples:
- https://github.com/habib1402/Fall-Detection-DiverseFall10500 (10,500-sample DiverseFall dataset)
- https://github.com/FallSafe/FallSafe-yolov8 (CCTV + caregiver alerts)
- https://github.com/arhammxo/Caladrius (elderly care / hospital ward focus)

**License flag:** All inherit Ultralytics AGPL-3.0. Same caveat as 1.3.

**B10/Accelerate fit:** Use the *datasets* (DiverseFall10500, FallVision 2025) to train your own RTMPose+PoseC3D classifier. Skip the Ultralytics-dependent code.

---

### 3.3 FallVision (2025 benchmark)

- Paper/dataset: FallVision (ScienceDirect / PMC, 2025) — comprehensive bed/chair/standing fall categories with YOLOv7-pose 17-keypoint annotations.
- **B10/Accelerate fit:** Best contemporary public fall benchmark. Use it to evaluate any candidate fall detector before deploying.

---

## Section 4 — In-Bed Pose / Patient Monitoring (CRITICAL for Atlas HAPI thesis)

### 4.1 SLP Dataset + Code (Ostadabbas Lab, Northeastern)

| Field | Value |
|---|---|
| Repo | https://github.com/ostadabbas/SLP-Dataset-and-Code |
| License | **MIT with non-commercial restriction** — flag for commercial use |
| Modalities | **RGB + LWIR (thermal) + Depth + Pressure mat** — all four simultaneous |
| Subjects | 109 participants, 4,545 SMPL bodies fit |
| Cover conditions | uncover / cover-1 (thin) / cover-2 (thick blanket) |
| Models | StackedHourglass, ChainedPredictions, PoseAttention, PyraNet, HRpose, RESpose |
| Best result | 95% PCKh@0.5 single modality; up to 98.46% with multimodal fusion |
| Citation | Liu et al., TPAMI 2022 |

**B10/Accelerate fit:** **This is the foundation dataset for Atlas's whole HAPI repositioning thesis.** Even if the code is non-commercial, the *dataset* is the most-cited multimodal in-bed dataset and validates that LWIR + depth give 95%+ pose accuracy under blankets. **Use the dataset to fine-tune our own RTMPose checkpoint on bed scenes; skip the inference code (non-commercial + dated MATLAB).**

---

### 4.2 in-bed-pose-estimation (Ostadabbas, JTEHM 2019)

| Field | Value |
|---|---|
| Repo | https://github.com/ostadabbas/in-bed-pose-estimation |
| License | **BSD-3-Clause** (commercial OK) |
| Stars | 11 |
| Code | MATLAB-heavy (96.6%) |
| Modality | IR / grayscale |

**B10/Accelerate fit:** Older, MATLAB-based, low utility for production. Use the *paper* for context only.

---

### 4.3 BodyPressureSD / BodyMAP (Healthcare Robotics @ CMU)

- Repo: https://github.com/Healthcare-Robotics/BodyPressure
- BodyMAP: https://github.com/RCHI-Lab/BodyMAP (CVPR 2024)
- Datasets: **PressurePose** (206K synthetic), **BodyPressureSD**, real-world SLP

**What it does:** Predicts SMPL body mesh + applied pressure map from depth or pressure images of a person in bed. Directly relevant to pressure injury prevention.

**B10/Accelerate fit:** **Highest-signal academic project for Atlas's pressure injury thesis.** If we can show BodyMAP-style 3D contact pressure estimates from a ceiling depth camera (no pressure mat under the patient), that's a defensible product feature. Worth a 1-day prototype on Intel RealSense + BodyMAP weights.

---

### 4.4 Seeing-Under-the-Cover (Ostadabbas, MICCAI 2019)

- Repo: https://github.com/ostadabbas/Seeing-Under-the-Cover
- Physics-guided learning for in-bed pose under blankets. Foundational to the LWIR-under-cover thesis.

---

## Section 5 — Patient Transfer / TUG (Vision)

**Finding:** No mature open-source vision-based Timed Up-and-Go pipeline. Closest hits:
- https://github.com/cjmoeller/tug-app — Android sensor-based, not vision.
- https://github.com/freakingrocky/TUG-Website — telemedicine site, no CV pipeline.
- Reference paper: Saporta et al. "Automation of the TUG Test Using a Conventional Video Camera" (2019) — Mask R-CNN + DMHS pipeline; no public code.

**B10/Accelerate fit:** **Whitespace.** A clean automated-TUG pipeline (RTMPose + a 6-state HMM over the 3m walk-turn-sit phases) is a very buildable, very publishable, hospital-ready feature. Pair with Atlas Mobility's clinical credibility. Estimated effort: 2-3 weeks.

---

## Section 6 — Privacy-Preserving / Edge Model Hubs

| Hub | License | Note |
|---|---|---|
| Coral Model Garden | Apache-2.0 | MoveNet, PoseNet — best for $60 USB Accelerator |
| ONNX Model Zoo | Apache-2.0 | **Deprecated July 2025**; mirror at huggingface.co/onnxmodelzoo |
| Edge Impulse | Apache-2.0 (most models) | More for sensor/audio than vision |
| HuggingFace Hub | Varies | Search "fall detection" for community models — most are research-grade |

---

## Decision Matrix

Ranked across pose / action / fall / in-bed for hospital deployment:

| Toolkit | License | Maintained | Jetson | Privacy | Pose | Action | Fall | In-Bed | Overall |
|---|---|---|---|---|---|---|---|---|---|
| **RTMPose / rtmlib** | Apache-2.0 | YES (Feb 2026) | TensorRT | Skel | 9 | — | — | — | **9.5** |
| **MediaPipe Pose** | Apache-2.0 | YES (Mar 2026) | works (build) | Skel + 3D | 7 | — | — | — | **8.5** |
| **PySKL (PoseC3D)** | Apache-2.0 | NO (vendor it) | runs | Skel | — | 9 | 8 | — | **8.0** |
| **MMAction2** | Apache-2.0 | slow | runs | Skel | — | 8 | 7 | — | **7.5** |
| **SLP dataset+code** | MIT-NC | dataset stable | n/a | Skel | — | — | — | 9 | **8.0** (dataset only) |
| **BodyMAP** | research | active | research | Skel + Depth | — | — | — | 9 | **8.0** |
| ViTPose | Apache-2.0 | YES | offline | Skel | 9 (acc) | — | — | — | 7 |
| MoveNet (Coral) | Apache-2.0 | slow | n/a (Coral) | Skel | 7 | — | — | — | 7 |
| trt_pose | MIT | slow | TensorRT | Skel | 6 | — | — | — | 6 |
| YOLOv8/v11-Pose | **AGPL-3.0** | very active | TensorRT | Skel | 8 | — | 8 | — | **AVOID** |
| OpenPose | **non-commercial** | dead | works | Skel | 7 | — | — | — | **AVOID** |
| AlphaPose | **non-commercial** | slow | works | Skel | 8 | — | — | — | **AVOID** |
| Human-Falling-Detect-Tracks | **none specified** | dead | n/a | Skel | — | — | 7 | — | **AVOID (use as blueprint)** |

---

## Recommended Stack

### (a) General mobility / fall detection in patient room

```
[ceiling RGB camera, 640×480 @ 15 FPS]
    └── RTMPose-m (Apache-2.0, COCO-17) on Jetson Orin Nano via TensorRT FP16
        └── ByteTrack (MIT) for person-ID continuity
            └── PoseConv3D action head (vendored from PySKL configs, Apache-2.0)
                ├── Class probabilities for: standing, walking, sitting, lying, fall, sit-to-stand
                └── Atlas/Accelerate event bus (websocket → Node.js command center)
                
[discard RGB frame after pose extraction; persist only (timestamp, person_id, 17 keypoints, action_class, confidence)]
```

**Why this stack:**
- All Apache-2.0 / MIT — clean for a commercial hospital product.
- Skeleton-only persistence by default — meets HIPAA-friendly privacy bar.
- Jetson Orin Nano can comfortably hit 15-30 FPS end-to-end at this resolution.
- Node.js dashboard hits a single websocket — no Python on the dashboard side.

### (b) In-bed turn / repositioning detection (Atlas's whitespace)

```
[ceiling depth camera (Intel RealSense D435/D455) + optional FLIR Lepton 3.5]
    └── Two parallel paths:
        ├── Depth → BodyMAP-style 3D pose + contact pressure estimate
        └── LWIR (under-cover) → fine-tuned RTMPose-l on SLP-thermal subset
    └── Fusion: weighted average of (pose under cover) + (pose+pressure from depth)
        └── State machine over (left-side, right-side, supine, prone, head-of-bed-elevated)
            ├── 2-hour repositioning timer per patient
            └── Alert escalation to Atlas Mobility Cloud + nurse station
```

**Why this stack:**
- Depth + thermal beats RGB for blanket-covered patients — SLP paper confirms 95%+ PCKh.
- BodyMAP (CVPR 2024) demonstrates pressure inference from depth alone — a real product moat.
- Built on permissive open-source code; SLP dataset license restriction is OK because we're using the dataset for *evaluation/fine-tuning*, not redistributing models for commercial sale.

---

## Non-Obvious Finds

1. **rtmlib** — The 4-dependency `pip install rtmlib` wrapper is a massively under-appreciated way to ship RTMPose without the OpenMMLab toolchain. Updated Feb 2026. **This single library is the biggest "just adopt it" win in this entire research pass.**

2. **BodyMAP (CVPR 2024)** — Predicting applied contact pressure from a ceiling depth camera is a defensible product feature for Atlas. Most "pressure injury AI" startups use mat sensors; doing it from a non-contact camera could be a 10-star product moat.

3. **DiverseFall10500 dataset** — Largest public fall dataset (10,500 annotated samples) with hospital-relevant fall types. Use to train our own AGPL-free fall classifier.

4. **FallVision 2025** — A new benchmark with bed/chair/standing fall categories. Use as the official internal benchmark to validate any fall detector we ship.

5. **The TUG whitespace** — No production-grade open-source automated TUG pipeline exists. Atlas could ship one in 2-3 weeks with clinical credibility.

6. **MediaPipe Pose 33-landmark schema is incompatible with most skeleton-action models.** If you want to feed PoseC3D, use RTMPose. Don't fight the schema mismatch.

7. **Coral Edge TPU at $60 vs Orin Nano at $500** — For "is anyone in this room?" cameras (door, hall, exit), a Coral USB Accelerator + MoveNet hits 100+ FPS at ~3W. Don't put a Jetson everywhere.

8. **Ultralytics AGPL trap** — Half the GitHub fall-detection repos quietly inherit AGPL through YOLOv8. Audit dependencies before adopting any "ready-made" fall detector.

---

## References (chronological by relevance)

- RTMPose / MMPose: https://github.com/open-mmlab/mmpose
- rtmlib (lightweight RTMPose wrapper): https://github.com/Tau-J/rtmlib
- MediaPipe: https://github.com/google-ai-edge/mediapipe; https://ai.google.dev/edge/mediapipe/solutions/vision/pose_landmarker/python
- ViTPose: https://github.com/ViTAE-Transformer/ViTPose; easy: https://github.com/JunkyByte/easy_ViTPose
- MoveNet on Coral: https://www.coral.ai/models/pose-estimation/
- trt_pose: https://github.com/NVIDIA-AI-IOT/trt_pose
- DeepLabCut: https://github.com/DeepLabCut/DeepLabCut
- PySKL: https://github.com/kennymckormick/pyskl
- MMAction2: https://github.com/open-mmlab/mmaction2
- CTR-GCN: https://github.com/Uason-Chen/CTR-GCN
- PyTorchVideo / SlowFast: https://github.com/facebookresearch/pytorchvideo, https://github.com/facebookresearch/SlowFast
- Human-Falling-Detect-Tracks: https://github.com/GajuuzZ/Human-Falling-Detect-Tracks
- DiverseFall10500: https://github.com/habib1402/Fall-Detection-DiverseFall10500
- SLP Dataset (Ostadabbas): https://github.com/ostadabbas/SLP-Dataset-and-Code
- in-bed-pose-estimation (Ostadabbas): https://github.com/ostadabbas/in-bed-pose-estimation
- Seeing Under the Cover: https://github.com/ostadabbas/Seeing-Under-the-Cover
- BodyMAP (CVPR 2024): https://github.com/RCHI-Lab/BodyMAP
- BodyPressure: https://github.com/Healthcare-Robotics/BodyPressure
- FallVision 2025: https://www.sciencedirect.com/science/article/pii/S2352340925001726
- Halpe-FullBody (26/136 keypoint format): https://github.com/Fang-Haoshu/Halpe-FullBody
- Ultralytics license: https://www.ultralytics.com/license
- OpenPose license: https://github.com/CMU-Perceptual-Computing-Lab/openpose/blob/master/LICENSE
- AlphaPose license: https://github.com/MVIG-SJTU/AlphaPose/blob/master/LICENSE
