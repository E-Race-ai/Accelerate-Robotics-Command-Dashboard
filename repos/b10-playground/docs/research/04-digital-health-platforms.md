# Digital Health Platforms, Standards & Pipelines — Decision-Grade Comparison

**Audience:** Eric Race (Atlas Mobility, Accelerate Robotics)
**Goal:** Adopt — not build — an open-source platform layer for ingesting wearable + sensor data (B10 lab, BMM, UMM, Patch, Mobility Cloud) and running mobility/sleep/activity analysis at scale.
**Date:** 2026-04-27

---

## TL;DR — The Three Picks

1. **Data schema (emit first):** **Open mHealth (OmH) + IEEE 1752.1-2021** as the primary JSON envelope, with **HL7 FHIR R4 Observation** as the hospital-facing wrapper. Both are now first-class standards; emitting both is a one-time mapping job and eliminates the "proprietary blob" objection in every Atlas sales conversation.
2. **Self-hosted platform (data lake + ingestion):** **RADAR-base** — Apache Kafka backbone, Kotlin/Java, Helm chart for Kubernetes, Apache-2.0, actively shipped through April 2026, plug-in connectors for Fitbit/Garmin/Empatica/Oura/Polar already exist. This is the only OSS platform that is both production-ready AND under active engineering today.
3. **Analysis layer (wrap, don't write):** **GGIR (R)** for nightly sleep/activity reports + **DBDP `wearablecompute` (Python)** for feature engineering + **pyActigraphy** for circadian/rest-activity. All three are validated, peer-reviewed, and trivially containerizable.

Recommended schema headline for sales decks: **"Atlas emits Open mHealth + FHIR. Plug us into your EHR."**

---

## 1. Digital Health Data Platforms (full ingestion + analytics + dashboard)

### 1.1 RADAR-base — TOP PICK
- **Repo:** https://github.com/RADAR-base · **License:** Apache-2.0
- **Maintenance:** Healthy. Multiple repos with commits in **April 2026** (RADAR-Kubernetes, RADAR-Schemas, RADAR-PushEndpoint, RADAR-Questionnaire all updated in last 30 days). Funded originally by IMI / EU H2020 RADAR-CNS consortium, now King's College London + The Hyve + Janssen + UCB.
- **What it is:** **Full platform.** Apache Kafka core for streaming, Cassandra/MongoDB for hot/cold storage, Confluent Schema Registry, REST source connectors (Fitbit, Garmin, Oura, Polar, Empatica, FitBit Web API, Withings), Active mobile app (questionnaires) + Passive app (phone sensors), Management Portal, ManagementPortal-Auth via Keycloak, Grafana for dashboards. Helm chart packages it for Kubernetes.
- **Adoption:** RADAR-CNS (depression, epilepsy, MS — 1,000+ patient EU studies), RADAR-AD (Alzheimer's, $$$), Janssen, UCB, Biogen, King's College Hospital, Boehringer Ingelheim. The HDR UK case study cites it as a flagship UK mHealth platform.
- **Integration friction:** Medium. Helm chart on a 3-node K8s cluster gets you running in a day. Requires comfort with Kafka ops. The Hyve sells managed hosting if you don't want to run it.
- **Atlas/B10 fit:** Excellent. RADAR-Schemas is Avro-based — you'd add an `atlas-bmm` and `atlas-patch` schema, build a small REST PushEndpoint client in the Patch firmware, and data lands next to Fitbit/Garmin streams in the same lake. B10 lab can drop accelerometer + IMU streams in via the same path.
- **Regulatory:** No FDA clearance (it's research infra). HIPAA: needs hardening (BAA-eligible cloud, encryption at rest/in transit — defaults are TLS + Kafka SSL + Keycloak OIDC). Used in GDPR studies in EU.
- **Pick this if:** You want one platform that handles ingestion + storage + dashboards + multi-vendor wearable connectors, AND you have a K8s-comfortable engineer. **Avoid if:** You need a no-ops SaaS or you have <10 patients (overkill).

### 1.2 LAMP Platform (Beth Israel / Harvard)
- **Repo:** https://github.com/BIDMCDigitalPsychiatry/LAMP-platform · **License:** Apache-2.0 (mostly; see per-repo)
- **Maintenance:** Active through 2025+. Issues opened January 2026. Funded by BIDMC Division of Digital Psychiatry (Dr. John Torous).
- **What it is:** **Full platform** focused on digital phenotyping in psychiatry. mindLAMP iOS/Android app, LAMP server, dashboard, plus **LAMP-cortex** Python pipeline for features. Strong in EMA + sensor passive data + clinician dashboard.
- **Adoption:** Used in 50+ academic studies; deployed at Beth Israel Deaconess, McLean, multiple international sites; basis for several published RCTs.
- **Friction:** Docker-compose available; some assembly required. Smaller community than RADAR-base.
- **Atlas/B10 fit:** Good if Atlas wanted to add a clinician-facing dashboard quickly, but more psychiatry-flavored than mobility-flavored.
- **Regulatory:** Used in IRB-approved studies; HIPAA-ready with config; no FDA clearance.
- **Pick this if:** Mental health / EMA is part of the use case. **Avoid if:** Pure mobility/SPHM use case (RADAR-base is broader).

### 1.3 Sage Bionetworks Bridge / Synapse / Mobile Toolbox
- **Repos:** https://github.com/Sage-Bionetworks (BridgeServer2, Bridge-Exporter, Mobile Toolbox apps) · **License:** Apache-2.0
- **Maintenance:** Active. Synapse repos updated April 27, 2026. **Bridge is now operated by GRIP (501c3 spinout)** — important signal: it survived the org transition and is funded for the long haul. mPower 1.0 / 2.0 are study apps, not platform infra.
- **What it is:** **Full platform**, but study-centric. Bridge = backend for IRB studies. Synapse = data sharing/collaboration. Mobile Toolbox = standardized cognitive assessments. ResearchKit/ResearchStack-friendly.
- **Adoption:** mPower (Parkinson's, 50K+ participants), Asthma Mobile Health Study, MyHeart Counts (Stanford), Mole Mapper. Sage is the "trusted research broker" in academic mHealth.
- **Friction:** High if self-hosting Bridge. The intended model is **use Sage's hosted Bridge** (free for researchers).
- **Atlas/B10 fit:** Limited. Bridge is for prospective consented studies, not operational hospital data. But for a B10 research arm running an IRB-approved validation study, hosted Bridge is the path of least resistance.
- **Regulatory:** Bridge is HIPAA-conformant and IRB-friendly out of the box (huge if you publish).
- **Pick this if:** You want to run a multi-site IRB study with cognitive assessments. **Avoid if:** You want operational/clinical data flow, not consented-research data.

### 1.4 MD2K Cerebral Cortex / mCerebrum
- **Repo:** https://github.com/MD2Korg/CerebralCortex · **License:** BSD 2-clause
- **Maintenance:** **Stale.** Most repos have not seen meaningful commits since 2020-2022. NIH MD2K Center funding ended.
- **What it is:** Big-data backend for mobile sensor data (Spark, Cassandra, Kafka). mCerebrum is the Android collection app. Was a flagship NIH platform 2014-2020.
- **Adoption:** Used in MD2K studies (smoking cessation, congestive heart failure). Several published validation papers.
- **Atlas/B10 fit:** Don't adopt. Use the published algorithms (puffMarker, smokeBeat) standalone if relevant.
- **Pick this if:** Don't. **Avoid if:** Production use — it's a maintained museum.

### 1.5 Beiwe (Onnela Lab, Harvard)
- **Repo:** https://github.com/onnela-lab/beiwe-backend · **License:** BSD 3-clause
- **Maintenance:** Active. Beiwe2 apps in App/Play stores. Issues active in 2025.
- **What it is:** **Full platform** for digital phenotyping — passive smartphone data (GPS, accelerometer, calls/texts, mic). Backend on AWS. Strong scientific lineage (Onnela lab is the originator of "digital phenotyping").
- **Adoption:** 100+ studies (depression, schizophrenia, surgical recovery, oncology). Stanford, Penn, Dana-Farber.
- **Friction:** Designed for AWS deploy. Not as wearable-connector-rich as RADAR-base (focused on phone sensors).
- **Atlas/B10 fit:** Good for phone-based passive sensing; not the fit for BMM/Patch (which are external devices).
- **Pick this if:** Smartphone-only digital phenotyping is the use case. **Avoid if:** Multi-vendor wearable connectors are needed.

### 1.6 ResearchKit / ResearchStack
- **Repos:** https://github.com/ResearchKit (iOS, Swift), https://github.com/ResearchStack (Android, Java) · **License:** BSD-3
- **Maintenance:** ResearchKit: Apple-sponsored, current. ResearchStack: less active.
- **What it is:** **Mobile SDKs** for consented research apps — informed consent, surveys, active tasks (gait, tap, speech). **Not a backend.** Pair with Bridge or RADAR-base.
- **Atlas/B10 fit:** Use if Atlas builds a patient-facing iPhone app for a clinical study. Otherwise skip.

### 1.7 Spezi (Stanford Biodesign Digital Health Group)
- **Repo:** https://github.com/StanfordSpezi (SpeziFHIR, SpeziHealthKit, SpeziFirebase) · **License:** MIT
- **Maintenance:** **Very active 2024-2026.** Stanford BDHG is shipping weekly.
- **What it is:** **Modern Swift framework** + Python data pipeline. FHIR-native, HealthKit-native. Has Pediatric Apple Watch Study deployment proof. The Spezi Data Pipeline (Python) standardizes FHIR Observation handling.
- **Adoption:** Stanford Pediatric Apple Watch Study, SAMI heart study, PAWS, several Stanford trials.
- **Atlas/B10 fit:** **Strong** if Atlas builds an iOS-first patient app and wants modern FHIR plumbing. Use SpeziFHIR + SpeziHealthKit for the Apple Watch / iPhone side; pair with RADAR-base server.
- **Pick this if:** Building an iOS patient app. **Note:** This is the under-rated gem — see "Non-Obvious Finds."

### 1.8 ProjectAware
- Minimal current OSS footprint; not a viable adoption candidate.

---

## 2. Wearable Data Formats / Standards

### 2.1 Open mHealth + IEEE 1752 — TOP SCHEMA PICK
- **Repo:** https://github.com/openmhealth/schemas (76 stars, Apache-2.0, Kotlin SDK current; Java SDK deprecated)
- **Standard:** IEEE 1752.1-2021 (metadata, sleep, physical activity); IEEE P1752.2 (cardiovascular, respiratory, metabolic — in development).
- **Maintenance:** Schemas repo is mature/dormant; **the action moved to IEEE 1752 working group**, which is active and ratifying new modules. The standard is the asset, not the GitHub repo.
- **What it is:** **JSON schemas** for representing health measures — `physical-activity`, `step-count`, `sleep-duration`, `heart-rate`, `blood-pressure`, etc. Each measure has a typed JSON envelope with units, time interval, and provenance.
- **Adoption:** Validic, Apple HealthKit (mappings exist), Fitbit Web API mappings published, Garmin mappings via OmH-on-FHIR, used by Sage Bionetworks Bridge.
- **Atlas/B10 fit:** **Perfect for emit format.** Atlas BMM/Patch should emit OmH JSON — it's small, typed, versioned, and there's a clean mapping to FHIR Observation.
- **Pick this if:** You need a typed, pre-defined JSON envelope for a finite set of health measures. **Avoid if:** Custom novel measure (define as FHIR Observation with custom code instead).

### 2.2 HL7 FHIR R4 Observation — HOSPITAL-FACING WRAPPER
- **Standard URL:** https://hl7.org/fhir/R4/observation.html
- **Maintenance:** HL7 FHIR R5 published; R4 is the current production standard. Mandated by ONC for US healthcare interop.
- **What it is:** **The lingua franca** for clinical data exchange. `Observation` resource is the wrapper used for vital signs, device measurements, lab results, and increasingly wearable PGHD (patient-generated health data).
- **Adoption:** Universal. Epic, Cerner/Oracle, Athena, Allscripts, Apple Health Records, Google Health Connect (March 2025), all major EHRs. The Mayo Clinic Apple Watch ECG ingestion (2025-2026) uses FHIR Observation.
- **Atlas/B10 fit:** **Mandatory for hospital sales.** Every Atlas customer (Tenet, Henry Ford, Grady, NorthBay) has an Epic or Cerner. Saying "we emit FHIR Observation" is what unlocks IT-security review.
- **Pick this if:** Always. It's the table-stakes interop standard for selling into US hospitals.

### 2.3 IEEE 11073 Personal Health Devices
- **Standard URL:** https://standards.ieee.org/standard/11073-10101-2020.html
- **What it is:** Bluetooth/USB device-level protocol for medical devices. Lower-level than FHIR/OmH.
- **Atlas/B10 fit:** Relevant only if Atlas Patch becomes a Class II medical device. For now, skip.

### 2.4 BIDS (Brain Imaging Data Structure) — extension to wearables
- **Standard:** https://bids.neuroimaging.io/ ; "BIDS-mhealth" extension proposal exists.
- **Maintenance:** Core BIDS very active; wearable extension early.
- **Atlas/B10 fit:** Possibly relevant for B10 *research* dataset organization (folder layout). Not a transport standard.

### 2.5 ActiGraph .gt3x format
- **Spec:** https://github.com/actigraph/GT3X-File-Format (open documentation, Apache-2.0)
- **Parsers:** `pygt3x` (official, https://github.com/actigraph/pygt3x), `read.gt3x` (R)
- **Atlas/B10 fit:** If B10 lab uses ActiGraph wGT3X-BT for ground-truth comparison, use `pygt3x` to parse, then transform to OmH `step-count` / `physical-activity` measures.

### 2.6 W3C WebBluetooth / WebUSB
- Browser-side; relevant for browser-based device pairing demos. Niche.

---

## 3. Edge-to-Cloud Streaming for Sensors

### 3.1 InfluxDB + Telegraf — TOP PICK for raw time-series
- **Repo:** https://github.com/influxdata/influxdb (MIT for InfluxDB Core 3 OSS; commercial for Enterprise/Cloud) · Telegraf MIT
- **Maintenance:** Very active. Industry standard for IoT time-series.
- **What it is:** Time-series DB + ingest agent. The "TIG stack" (Telegraf + InfluxDB + Grafana) is the gold-standard sensor pipeline.
- **Atlas/B10 fit:** **Excellent for raw 30 Hz accelerometer streams** that you don't want polluting the FHIR/OmH layer. Pattern: raw → InfluxDB; aggregated/feature-extracted → OmH JSON → FHIR.
- **Pick this if:** You need raw sensor time-series at sub-second resolution. **Avoid if:** Only aggregated daily summaries (overkill).

### 3.2 Apache IoTDB
- **Repo:** https://github.com/apache/iotdb · **License:** Apache-2.0
- **Maintenance:** Apache top-level, actively shipped.
- **What it is:** Columnar time-series DB for IoT, 30M points/sec single node. Edge + cloud editions.
- **Atlas/B10 fit:** Strong technical fit; smaller ecosystem than InfluxDB outside China. Pick InfluxDB unless you have specific compression/scale needs.

### 3.3 Eclipse Hono + Eclipse Kura
- **Repos:** https://github.com/eclipse-hono/hono, https://eclipse.dev/kura · **License:** EPL-2.0
- **Maintenance:** Active Eclipse Foundation projects.
- **What it is:** Hono = device-cloud connector (MQTT/HTTP/AMQP gateway). Kura = OSGi edge gateway.
- **Atlas/B10 fit:** Useful if Atlas Patch fleet phones home over MQTT and you want a real device gateway. Otherwise overkill — RADAR-base PushEndpoint or direct InfluxDB write is simpler.

### 3.4 Node-RED
- **Repo:** https://github.com/node-red/node-red · **License:** Apache-2.0
- **Maintenance:** Very active.
- **What it is:** Low-code flow-based programming for IoT. Drag-and-drop sensor wiring.
- **Atlas/B10 fit:** Use it for **B10 lab prototyping** (rapid sensor → MQTT → InfluxDB flows). Not for production hospital deploy.

### 3.5 AWS IoT Greengrass
- Proprietary. Mature SDK. Skip in favor of OSS unless already AWS-locked.

---

## 4. Open-Source Sleep / Activity Analysis Libraries

### 4.1 GGIR (R) — TOP PICK for batch sleep+activity
- **Repo:** https://github.com/wadpac/GGIR · **License:** Apache-2.0 (CRAN: GPL-2 in some refs — verify per release)
- **Maintenance:** Very active. v3.3-4 on CRAN January 2026; v3.2-6 in April 2025.
- **What it is:** **The de facto standard** for raw accelerometer analysis in academic mobility/sleep research. Takes GENEActiv/.gt3x/.cwa/CSV in, gives sleep onset, wake, MVPA, sedentary time, fragmentation metrics out. Companion `ggirReport` produces participant PDFs.
- **Adoption:** UK Biobank (100K+ participants), Whitehall II, NHANES wear-time analyses, hundreds of published papers.
- **Atlas/B10 fit:** **Adopt directly.** Wrap in a Docker container, feed it accelerometer data from BMM/Patch (export to CSV or .cwa), get nightly per-patient sleep reports. This is the single highest-leverage analysis library to wrap.
- **Pick this if:** You have raw triaxial accelerometer at >25 Hz. **Avoid if:** You only have step counts/aggregated summaries.

### 4.2 pyActigraphy
- **Repo:** https://github.com/ghammad/pyActigraphy · **License:** GPL-3
- **Maintenance:** Active. PLOS Computational Biology paper 2021; ongoing development.
- **What it is:** Python alternative to GGIR. Reads 7 actigraphy file formats, supports cosinor analysis, IS/IV/RA circadian metrics, multiple sleep detection algorithms (Cole-Kripke, Sadeh, Oakley, van Hees).
- **Atlas/B10 fit:** **Adopt for circadian analysis** (cosinor, IS/IV) which GGIR doesn't emphasize. Use for B10 mobility/circadian rhythm analyses.

### 4.3 SleepPy
- **Repo:** https://github.com/elyiorgos/sleeppy · **License:** GPL-3
- **What it is:** Python pipeline for raw triaxial accelerometer → sleep reports. Smaller than GGIR but Pythonic.
- **Atlas/B10 fit:** Backup/complement to GGIR for Python-only stacks.

### 4.4 DBDP `wearablecompute` (Duke)
- **Repo:** https://github.com/DigitalBiomarkerDiscoveryPipeline/wearablecompute · **License:** Apache-2.0
- **Maintenance:** Active. BIG IDEAS Lab at Duke (Dr. Jessilyn Dunn).
- **What it is:** Python library, **50+ wearable-derived features** (heart rate variability, step features, EDA features). Plus sister repos: Resting-Heart-Rate, Human-Activity-Recognition, Data-Compression-Toolbox.
- **Atlas/B10 fit:** **Adopt for feature engineering layer.** Combine with GGIR (sleep/activity) and pyActigraphy (circadian) for a complete analysis stack.

### 4.5 Habitiq, Cosinor analysis
- Niche. `CosinorPy` (PyPI) covers cosinor; pyActigraphy covers it too.

---

## 5. Pose + Sensor Fusion

### 5.1 OpenSim + OpenSense (Stanford Mobilize Center)
- **Repo:** https://github.com/opensim-org/opensim-core · **License:** Apache-2.0
- **Maintenance:** Active; Stanford NIH-funded.
- **What it is:** **Biomechanics simulation.** OpenSense subsystem turns IMU orientations into joint kinematics on a musculoskeletal model.
- **Adoption:** Hundreds of biomech labs worldwide.
- **Atlas/B10 fit:** **Strong for B10 lab.** If B10 wants to compute joint angles from IMUs (gait/lift biomechanics for SPHM research), OpenSense is the canonical tool. The OpenSenseRT real-time variant runs on Raspberry Pi for $120 of hardware.
- **Pick this if:** Biomechanics research is part of B10. **Avoid if:** Just need step counts.

### 5.2 OpenSimRT, OpenSimLive (real-time IK)
- Real-time variants — relevant if Atlas builds a "live posture coach" feature.

### 5.3 BiomechZoo / BioMime — niche, less momentum than OpenSim.

---

## 6. Hospital Integration Pipelines

### 6.1 SMART on FHIR
- **Standard URL:** https://docs.smarthealthit.org/ · **License:** standards body
- **What it is:** Auth + launch standard for FHIR apps embedded in EHRs. SMART App Launch v2.2 is current.
- **Atlas/B10 fit:** **Required** to build an "Atlas tile" inside Epic / Cerner that shows mobility data alongside the patient chart. Pair with FHIR Observation emit.

### 6.2 Apple Health Records (FHIR)
- iOS surfaces patient EHR data as FHIR resources. Atlas patient-facing iOS app could read Health Records via this API.

### 6.3 OpenMRS / OpenEMR
- **Repos:** https://github.com/openmrs, https://github.com/openemr/openemr · **License:** MPL-2.0 / GPL-3
- **Maintenance:** Both very active in 2025-2026. OpenEMR adding low-cost device connectivity in 2025; OpenMRS FHIR-friendly.
- **Atlas/B10 fit:** Useful as a **demo target** — "here's Atlas mobility data in an open EHR" — but US hospital customers run Epic/Cerner, not these.

### 6.4 Google Open Health Stack — Android FHIR SDK
- **Repo:** https://github.com/google/android-fhir · **License:** Apache-2.0
- **Maintenance:** Very active. WHO collaboration. Used by 75M+ patients in Africa/Asia.
- **What it is:** Kotlin libraries for offline-capable FHIR Android apps. Companion: **Kotlin FHIR Multiplatform** (alpha 2025) for iOS/Android/Web.
- **Atlas/B10 fit:** **Strong** for an Atlas Android tablet app at the bedside. Pair with SpeziFHIR on iOS.

### 6.5 CommonHealth (Cornell/UCSF/Sage/OmH/Commons Project)
- Android counterpart to Apple Health. FHIR-native. Pilots at UCSF.

---

## 7. Open-Source Clinical Assessment Toolkits

### 7.1 DigitalBiomarkerDiscoveryPipeline (Duke) — covered above (4.4)

### 7.2 AccelerometerSleepDetection (Stanford) — see SleepPy / GGIR / pyActigraphy

### 7.3 MotionSense, SmokeBeat — MD2K-era; algorithm code only, not platforms.

---

## 8. DECISION MATRIX

### Top picks by layer

| Layer | #1 Pick | Backup | Why |
|---|---|---|---|
| **Emit schema (device → wire)** | Open mHealth JSON | FHIR Observation | OmH is typed and small; map to FHIR for hospital exit |
| **Hospital interop wrapper** | FHIR R4 Observation | SMART on FHIR (for embedded apps) | Universal in US EHRs; ONC-mandated |
| **Self-host platform** | RADAR-base | LAMP Platform | Active maint, K8s ready, broad connector library |
| **Hosted research backend** | Sage Bridge (GRIP) | — | Free for researchers; HIPAA + IRB ready |
| **Time-series DB (raw sensor)** | InfluxDB + Telegraf | Apache IoTDB | TIG stack is industry standard |
| **Edge gateway (Patch fleet)** | Eclipse Hono (MQTT) | Direct REST PushEndpoint | Only if you need true device mgmt |
| **iOS patient app** | Spezi (SpeziFHIR + SpeziHealthKit) | ResearchKit | Modern Swift, FHIR-native, Stanford-shipped |
| **Android patient app** | Google Android FHIR SDK | ResearchStack | WHO-backed, offline-first |
| **Sleep+activity analysis** | GGIR (R) | pyActigraphy / SleepPy | UK Biobank standard |
| **Feature engineering** | DBDP wearablecompute | tsfresh | 50+ validated wearable features |
| **Biomechanics (B10 lab)** | OpenSim + OpenSense | OpenSimRT | Canonical IMU → joint kinematics |
| **Dashboard** | Grafana (over InfluxDB) | RADAR-base built-in | Industry standard |
| **Low-code prototyping** | Node-RED | — | Lab-grade only |

---

## 9. RECOMMENDED STACK

### (a) What schema Atlas BMM / Patch / UMM should EMIT

**Primary:** **Open mHealth JSON** (IEEE 1752.1-2021 envelope) for every measure Atlas captures:
- `step-count` (existing OmH measure)
- `physical-activity` (with `effective-time-frame`, `activity-name`)
- `sleep-duration`, `sleep-episode` (IEEE 1752.1)
- `heart-rate` (if Patch has PPG)
- Custom `atlas.turn-event` schema for SPHM patient turns (define under your own namespace, follow OmH conventions)

**Secondary (hospital exit):** Auto-translate to **FHIR R4 Observation** with LOINC codes:
- LOINC 41950-7 (steps in 24h)
- LOINC 93832-4 (sleep duration)
- LOINC 8867-4 (heart rate)
- For turn events: define an Atlas-namespaced code in a CodeSystem.

**Why:** OmH gives Atlas a tight, typed JSON envelope for its own pipeline; FHIR is what gets handed to Epic. The mapping layer is ~200 lines of Kotlin/TypeScript.

### (b) What PLATFORM to self-host for the B10 lab + Atlas data lake

**Stack:**
1. **Edge:** Atlas Patch / BMM streams raw accelerometer → Telegraf agent on a hospital-side gateway → **InfluxDB OSS** (raw time-series).
2. **Aggregation:** Nightly job derives OmH measures from raw data → publishes to **RADAR-base PushEndpoint** (Kafka topic per measure).
3. **Storage:** RADAR-base lands data in HDFS / S3 + Cassandra. Confluent Schema Registry validates Avro.
4. **Hospital export:** A small FHIR adapter service consumes from Kafka, writes FHIR Observation to the hospital's FHIR endpoint (Epic FHIR API, etc.). Optional: stand up **HAPI FHIR server** as Atlas's own FHIR endpoint for hospitals that don't expose theirs.
5. **B10 lab data:** Same path — raw sensors → InfluxDB → OmH → RADAR-base. Layer GGIR / pyActigraphy / OpenSense on top.
6. **Auth:** Keycloak (ships with RADAR-base).
7. **Deployment:** Helm chart on a managed K8s (EKS or AKS in HIPAA-eligible region, BAA in place).

### (c) Analysis libraries to wrap

- **GGIR (R)** — nightly sleep/activity reports (containerized).
- **pyActigraphy** — circadian rhythm metrics (cosinor, IS/IV/RA).
- **DBDP wearablecompute (Python)** — feature engineering for any ML downstream.
- **OpenSim/OpenSense** — only if B10 does biomechanics.
- **SleepPy** — Python alternative if R is undesirable.

Wrap all of these as RADAR-base "consumer" services that subscribe to Kafka topics, run analysis, and write derived measures back to a `derived/` topic.

---

## 10. NON-OBVIOUS FINDS

1. **Stanford Spezi** is the sleeper hit. MIT-licensed, FHIR-native from day one, Stanford BDHG ships weekly, Pediatric Apple Watch Study is real production proof. If Atlas builds an iOS-first patient companion, this is the framework — far better DX than ResearchKit alone.
2. **Sage Bridge survived its transition to GRIP.** This matters. The HIPAA-conformant hosted research backend is now stewarded by a 501c3 designed to keep it alive — lower risk than it looked 18 months ago.
3. **Google's Kotlin FHIR Multiplatform (Sept 2025)** lets you write FHIR code once for Android + iOS + Web. Combined with SpeziFHIR on iOS, this is the new dual-platform play.
4. **OpenSenseRT** runs full-body IMU inverse kinematics on a $120 Raspberry Pi rig. For B10 lab demos this is jaw-dropping cheap.
5. **The Hyve sells managed RADAR-base hosting.** If Eric doesn't want to run K8s, this exists. Reduces RADAR-base from "infra project" to "vendor decision."
6. **Mayo Clinic Apple Watch ECG → FHIR Observation pipeline (2025-2026)** is the citable proof point that "wearable PGHD via FHIR" is no longer aspirational. Use it in Atlas sales decks.
7. **Spezi Data Pipeline (Python, arxiv 2509.14296)** is a brand-new (Sept 2025) FHIR-based analysis pipeline from Stanford. Watch it.

---

## 11. STRATEGIC NOTE — Momentum & Sales Story

**Standards with momentum (lean into):**
- HL7 FHIR R4 — universal, ONC-mandated, every hospital IT person knows it
- IEEE 1752 (Open mHealth) — IEEE-ratified, growing module set, name-droppable
- SMART on FHIR — required for in-EHR app embed
- Apple HealthKit / Google Health Connect (FHIR) — consumer-side reach

**Standards losing momentum (don't anchor on):**
- Original Open mHealth Java SDK (deprecated)
- IEEE 11073 PHD (clinical device tier; overkill unless going Class II)
- MD2K Cerebral Cortex (stalled)

**The sales narrative for Atlas:**
> "Atlas BMM and Patch emit Open mHealth JSON natively (IEEE 1752.1) and translate to FHIR R4 Observation for direct ingestion into your Epic or Cerner. We use the same schemas as the UK Biobank, Mayo Clinic, and Stanford. Our data lake runs on RADAR-base (used by Janssen, UCB, King's College Hospital). No proprietary blobs, no vendor lock-in."

That sentence — credible, name-droppable, Sales-ready — is what this research is for.

---

## 12. Sources

- RADAR-base: https://radar-base.org/ · https://github.com/RADAR-base · JMIR mHealth 2019: https://mhealth.jmir.org/2019/8/e11734/ · HDR UK case study: https://www.hdruk.ac.uk/case-studies/radar-base-mhealth-platform/
- Open mHealth / IEEE 1752: https://github.com/openmhealth/schemas · https://sagroups.ieee.org/1752/ · https://pubmed.ncbi.nlm.nih.gov/37387034/
- Sage Bionetworks Bridge: https://github.com/Sage-Bionetworks · https://developer.sagebridge.org/
- LAMP Platform: https://github.com/BIDMCDigitalPsychiatry/LAMP-platform · https://docs.lamp.digital/
- MD2K Cerebral Cortex: https://github.com/MD2Korg/CerebralCortex
- Beiwe: https://github.com/onnela-lab/beiwe-backend · https://hsph.harvard.edu/research/onnela-lab/digital-phenotyping-and-beiwe-research-platform/
- Spezi (Stanford): https://github.com/StanfordSpezi · https://spezi.stanford.edu/ · Spezi Data Pipeline: https://arxiv.org/html/2509.14296v1
- GGIR: https://wadpac.github.io/GGIR/ · https://cran.r-project.org/package=GGIR
- DBDP: https://github.com/DigitalBiomarkerDiscoveryPipeline · https://pmc.ncbi.nlm.nih.gov/articles/PMC8057397/
- pyActigraphy: https://journals.plos.org/ploscompbiol/article?id=10.1371/journal.pcbi.1009514
- SleepPy: https://github.com/elyiorgos/sleeppy
- ActiGraph .gt3x: https://github.com/actigraph/GT3X-File-Format · https://github.com/actigraph/pygt3x
- OpenSim/OpenSense: https://github.com/opensim-org/opensim-core · https://link.springer.com/article/10.1186/s12984-022-01001-x
- Apache IoTDB: https://iotdb.apache.org/ · https://github.com/apache/iotdb
- InfluxDB / Telegraf: https://docs.influxdata.com/telegraf/v1/
- Eclipse Hono / Kura: https://eclipse.dev/kura/ · https://github.com/eclipse-hono/hono
- Node-RED: https://nodered.org/
- SMART on FHIR: https://docs.smarthealthit.org/
- Garmin → FHIR EHDS case: https://www.frontiersin.org/journals/digital-health/articles/10.3389/fdgth.2025.1636775/full
- Google Open Health Stack: https://developers.google.com/open-health-stack · Kotlin FHIR: https://opensource.googleblog.com/2025/09/introducing-kotlin-fhir-a-new-library-to-bring-fhir-to-multiplatform.html
- CommonHealth: https://www.commonhealth.org/developers
- OpenEMR / OpenMRS: https://www.capminds.com/blog/fhir-openemr-enabling-modern-interoperability-in-2025/
