# Accelerate Robotics — Full Software Stack

The complete technology stack required to build the universal elevator integration platform. Organized by system layer, from hardware firmware to cloud dashboard.

---

## 1. Edge Firmware (E-Box Master & Slave)

| Component | Technology | Why |
|-----------|-----------|-----|
| **MCU Platform** | ESP32-S3 or STM32H7 | WiFi + BLE + LoRa support, real-time GPIO, low power, industrial temp range |
| **RTOS** | FreeRTOS or Zephyr RTOS | Deterministic timing for relay activation (<10ms jitter); Zephyr has native LoRa/BLE stacks |
| **LoRa Radio** | Semtech SX1262 + LoRaWAN stack | Sub-GHz penetrates elevator shafts; SX1262 is current-gen with low power |
| **RFID Reader Driver** | MFRC522 / PN532 (ISO 14443A) | Standard passive RFID; cheap readers, passive tags need no power |
| **GPIO / Relay Control** | Native HAL (GPIO bit-bang or shift register) | 32-channel relay board via SPI shift registers (74HC595 chain) |
| **OTA Firmware Updates** | MCUboot + SUIT manifest | Field-updatable firmware without physical access to shaft |
| **Serial Debug** | RS-485 / UART | Wired diagnostics when LoRa/WiFi unavailable |
| **Watchdog** | Hardware WDT on MCU | Auto-reboot on firmware hang — critical for unattended shaft hardware |
| **Config Storage** | LittleFS on flash | Persists floor mapping, relay assignments, LoRa pairing across reboots |

### Firmware Languages
- **C** — FreeRTOS tasks, HAL drivers, relay timing
- **Rust** (optional) — Zephyr bindings for memory-safe embedded; good for safety-critical relay logic

---

## 2. Edge Controller / Gateway (Raspberry Pi or Industrial PLC)

| Component | Technology | Why |
|-----------|-----------|-----|
| **OS** | Raspberry Pi OS Lite or Yocto Linux | Headless, minimal attack surface; Yocto for production hardening |
| **Runtime** | Python 3.12 + asyncio | Fast prototyping, excellent MQTT/HTTP libraries, async for concurrent I/O |
| **Alt Runtime** | Go | Single binary deployment, great concurrency, lower memory than Python |
| **MQTT Broker (local)** | Mosquitto | Lightweight local pub/sub for sensor → state machine events |
| **LoRa Interface** | chirpstack-gateway-bridge | Translates LoRa packets to MQTT; standard LoRaWAN gateway stack |
| **GPIO Library** | libgpiod (Linux) or pigpio | Direct relay control from gateway if not using dedicated MCU |
| **Container Runtime** | Docker + docker-compose | Isolate services, easy updates, rollback capability |
| **VPN / Remote Access** | WireGuard or Tailscale | Secure remote management of shaft-mounted hardware |

---

## 3. Middleware State Machine

| Component | Technology | Why |
|-----------|-----------|-----|
| **Language** | TypeScript (Node.js) or Go | TS: XState library for formal state machines. Go: built-in concurrency |
| **State Machine Library** | XState v5 | Formal statecharts with guards, actions, parallel states; visual inspector for debugging |
| **Event Bus** | Redis Streams or NATS | Low-latency pub/sub for state transitions; Redis for simplicity, NATS for scale |
| **Timeout / Retry Engine** | Temporal.io or Bull (Redis) | Durable timers for "elevator didn't arrive in 60s → retry" workflows |
| **State Persistence** | PostgreSQL + Redis | PG for audit log of all state transitions; Redis for hot state |

### State Machine States (11)
```
IDLE → CALL_REQUESTED → WAITING_FOR_ELEVATOR → DOOR_OPEN →
ENTERING → INSIDE → SELECTING_FLOOR → MOVING →
ARRIVED → EXITING → COMPLETE
```

### Key State Machine Rules
- Every transition triggered by **sensor event**, not timer (sensors > timers)
- Every state has a **timeout guard** that escalates to error recovery
- **ENTERING** and **EXITING** states monitor LIDAR for door-closing abort
- **COMPLETE** logs full ride analytics before returning to IDLE

---

## 4. Backend API & Core Services

| Service | Technology | Why |
|---------|-----------|-----|
| **API Gateway** | FastAPI (Python) or Hono (TypeScript on Bun) | FastAPI: auto OpenAPI docs, async, typing. Hono: edge-deployable, fast |
| **Primary Language** | TypeScript or Go | TS: shared types with frontend/state machine. Go: performance for fleet coordination |
| **API Protocol** | REST + WebSocket | REST for commands (POST /elevator/call); WebSocket for real-time status streaming |
| **gRPC** | protobuf + gRPC | Internal service-to-service communication (fleet coordinator ↔ state machine) |
| **Auth** | JWT + API keys per robot vendor | Vendor-scoped keys; JWT for session tokens; robot identity via robotId claim |
| **Rate Limiting** | Redis sliding window | Prevent runaway robots from flooding elevator calls |
| **Request Validation** | Zod (TS) or Pydantic (Python) | Runtime type validation on all API inputs |

### Core API Endpoints
```
POST   /elevator/call          — Request elevator ride
GET    /elevator/status/:id    — Poll ride status
POST   /elevator/hold-doors    — Hold doors open (with max duration)
POST   /elevator/release       — Release elevator, end session
GET    /fleet/queue             — Current priority queue state
POST   /fleet/priority-override — Emergency priority escalation
GET    /analytics/rides         — Ride history and metrics
WS     /elevator/stream/:id    — Real-time ride state stream
```

---

## 5. OEM Cloud Adapters

| Elevator OEM | Protocol | Adapter Tech |
|-------------|----------|-------------|
| **KONE** | WebSocket API (KONE API Portal) | TypeScript WebSocket client with reconnect logic |
| **Otis** | Azure IoT Hub (OID platform) | Azure SDK + MQTT; Otis Integrated Dispatch protocol |
| **ThyssenKrupp** | REST API (touchless/destination dispatch) | HTTP client; TAC32T SCCB/SCCT command translation |
| **Schindler** | PORT Technology API | REST + mTLS certificates; destination dispatch model |
| **Mitsubishi** | Proprietary serial (MELIPnet) | RS-485 serial adapter; requires NDA and partner agreement |
| **Hyundai** | REST API (newer buildings) | Standard HTTP adapter |
| **Generic/Legacy** | Relay hardware (Layer 3) | No cloud adapter — direct LoRa → relay → button press |

### Adapter Pattern
```typescript
interface ElevatorAdapter {
  callElevator(floor: number, direction: 'up' | 'down'): Promise<Session>
  getStatus(sessionId: string): Promise<ElevatorStatus>
  selectFloor(sessionId: string, floor: number): Promise<void>
  holdDoors(sessionId: string, durationMs: number): Promise<void>
  release(sessionId: string): Promise<void>
  onSafetyEvent(callback: (event: SafetyEvent) => void): void
}
```
Each OEM gets an implementation of this interface. Robot vendors never see OEM-specific details.

---

## 6. Fleet Coordination Engine

| Component | Technology | Why |
|-----------|-----------|-----|
| **Priority Queue** | Custom weighted priority queue (Redis Sorted Sets) | Priority levels (emergency → routine) with FIFO within each level |
| **Elevator Selection** | Nearest-car algorithm + look-ahead | Minimize wait time; consider current direction and load |
| **Deadlock Prevention** | Banker's algorithm variant | Prevent opposing-direction robots from blocking each other |
| **Batching Engine** | Time-window grouping | Multiple robots going same direction → share one car |
| **Concurrency** | Go goroutines or Node.js worker threads | One coordinator per elevator bank; parallel bank processing |
| **Robot SDK** | Published npm/pip/ROS package | Client library robot vendors integrate; handles retry, auth, status polling |

---

## 7. Database & Storage

| Store | Technology | Purpose |
|-------|-----------|---------|
| **Primary DB** | PostgreSQL 16 | Ride logs, robot registry, elevator configs, audit trail |
| **Cache / Hot State** | Redis 7 (with Streams) | Current ride state, priority queues, session data, pub/sub |
| **Time-Series** | TimescaleDB (PG extension) or InfluxDB | Sensor telemetry, ride duration trends, elevator utilization over time |
| **Object Storage** | S3 / R2 (Cloudflare) | Firmware binaries for OTA, config snapshots, diagnostic logs |
| **Schema Migrations** | Drizzle ORM (TS) or golang-migrate | Version-controlled, reversible database migrations |

### Key Database Tables
```
robots           — id, vendor, model, building_id, capabilities
elevators        — id, building_id, oem, adapter_type, floor_count, relay_map
buildings        — id, name, address, floor_count, elevator_bank_config
rides            — id, robot_id, elevator_id, from_floor, to_floor, states[], duration_ms, safety_events
state_transitions — ride_id, from_state, to_state, trigger, timestamp, sensor_data
safety_events    — id, ride_id, elevator_id, event_type, severity, resolved_at
```

---

## 8. Real-Time Communication

| Component | Technology | Why |
|-----------|-----------|-----|
| **MQTT Broker (cloud)** | EMQX or HiveMQ Cloud | Robot ↔ platform real-time; handles 10K+ concurrent connections |
| **WebSocket Server** | Socket.io or native WS (ws library) | Dashboard real-time updates; ride status streaming |
| **LoRa Network Server** | ChirpStack (self-hosted) or TTN | LoRaWAN device management, uplink/downlink scheduling |
| **Message Queue** | NATS JetStream or Redis Streams | Internal async event processing; guaranteed delivery for state transitions |

### Protocol Hierarchy (Failover Chain)
```
1. OEM Cloud API (WebSocket/REST)     — Preferred for modern elevators
2. MQTT over WiFi/4G                  — Robot ↔ Platform communication
3. LoRa direct (Master → Slave)       — Shaft communication, no internet required
4. RS-485 serial                      — Last-resort wired fallback
```

---

## 9. Monitoring, Observability & Alerting

| Component | Technology | Why |
|-----------|-----------|-----|
| **Metrics** | Prometheus + Grafana | Ride latency, queue depth, relay response time, LoRa signal strength |
| **Logging** | Loki or Datadog Logs | Structured JSON logs from all services; searchable by ride_id |
| **Tracing** | OpenTelemetry + Jaeger | Distributed traces: API call → state machine → relay activation → sensor confirm |
| **Alerting** | Grafana Alerting or PagerDuty | Robot stuck in ENTERING >30s, LoRa signal lost, relay not responding |
| **Uptime** | Healthchecks.io or BetterStack | Edge device heartbeat monitoring; alert if E-Box goes offline |
| **Error Tracking** | Sentry | Catch firmware crashes, API errors, state machine exceptions |

### Key Metrics to Track
```
ride_duration_seconds         — Histogram by building, elevator, priority
queue_wait_seconds            — Time from CALL_REQUESTED to DOOR_OPEN
relay_response_ms             — Time from command to relay confirmation
lora_rssi_dbm                 — LoRa signal strength (alerts if degraded)
rfid_read_success_rate        — Percentage of successful floor detections
safety_events_total           — Counter by type (door_close_abort, wrong_car, etc.)
rides_per_hour                — Throughput by elevator
```

---

## 10. Dashboard & Admin UI

| Component | Technology | Why |
|-----------|-----------|-----|
| **Framework** | Next.js 15 (App Router) | SSR for fast loads, React Server Components, API routes |
| **UI Library** | Tailwind CSS + shadcn/ui | Consistent with existing Accelerate website design system |
| **Real-Time Viz** | React + WebSocket + D3.js or Recharts | Live elevator position, queue visualization, ride animations |
| **State Management** | Zustand or TanStack Query | Zustand for WebSocket state; TanStack for REST data fetching |
| **Building Floorplan** | SVG + React (like existing shaft diagram) | Interactive building cross-section showing live elevator positions |
| **Auth** | Clerk or Auth.js (NextAuth) | Multi-tenant: building managers, robot vendors, Accelerate admins |

### Dashboard Views
- **Live Map** — Building cross-section with animated elevator positions (like install guide SVG)
- **Queue Monitor** — Priority queue with robot IDs, wait times, assigned elevators
- **Ride History** — Filterable table of all rides with state timeline
- **Fleet Status** — Robot locations, active rides, idle/charging
- **Safety Log** — All safety events with severity, resolution, root cause
- **Analytics** — Rides/hour, avg wait time, peak demand, utilization heatmaps
- **Config** — Relay mapping, floor names, elevator bank assignments, RFID calibration

---

## 11. DevOps & Infrastructure

| Component | Technology | Why |
|-----------|-----------|-----|
| **Cloud Provider** | AWS or Railway (current) | Railway for MVP; AWS for production (IoT Core, Lambda@Edge) |
| **Container Orchestration** | Docker Compose (MVP) → Kubernetes (scale) | Start simple, migrate to K8s when managing multiple buildings |
| **CI/CD** | GitHub Actions | Auto-test, build firmware, deploy API, update dashboard |
| **IaC** | Pulumi (TypeScript) or Terraform | Infrastructure as code; same language as backend |
| **CDN** | Cloudflare | Static assets, DDoS protection, edge caching |
| **DNS** | Cloudflare DNS | Fast resolution, easy management |
| **Secrets** | AWS Secrets Manager or Doppler | OEM API keys, mTLS certs, database credentials |
| **Firmware CI** | PlatformIO + GitHub Actions | Automated firmware builds and test for ESP32/STM32 |

### Deployment Topology
```
Per Building:
  ├── E-Box Master (shaft top) ──── LoRa ────── E-Box Slave (cabin)
  ├── Edge Gateway (Raspberry Pi, optional)      ├── RFID Reader
  │     ├── Mosquitto (local MQTT)               ├── 32-ch Relay Board
  │     ├── State Machine (containerized)        └── Sensors
  │     └── WireGuard tunnel to cloud
  └── Building WiFi / 4G backhaul

Cloud (centralized):
  ├── API Gateway (FastAPI / Hono)
  ├── Fleet Coordinator
  ├── OEM Adapters (per elevator brand)
  ├── PostgreSQL + Redis + TimescaleDB
  ├── EMQX MQTT Broker
  ├── ChirpStack LoRa Network Server
  ├── Grafana + Prometheus + Loki
  └── Next.js Dashboard
```

---

## 12. Security

| Layer | Technology | Why |
|-------|-----------|-----|
| **Transport** | TLS 1.3 everywhere | All API, MQTT, WebSocket connections encrypted |
| **mTLS** | Client certificates for OEM APIs | Schindler PORT and others require mutual TLS |
| **API Auth** | OAuth 2.0 + API keys | Robot vendors get scoped API keys; dashboard uses OAuth |
| **Device Auth** | X.509 certificates per E-Box | Each E-Box has unique identity; prevents spoofing |
| **Network Isolation** | VLANs + WireGuard | Elevator control network isolated from building guest WiFi |
| **Audit Logging** | Immutable append-only log (PG + WAL) | Compliance requirement for ASME A17.1 traceability |
| **Firmware Signing** | Ed25519 code signing | OTA updates verified before flashing; prevents tampered firmware |

---

## 13. Testing

| Type | Technology | Why |
|------|-----------|-----|
| **Unit Tests** | Vitest (TS) or pytest (Python) | State machine logic, adapter protocol parsing, queue algorithms |
| **Integration Tests** | Testcontainers + Docker | Spin up PG + Redis + MQTT for realistic service tests |
| **Hardware-in-the-Loop** | Custom relay test rig + logic analyzer | Verify relay timing, LoRa packet delivery, RFID read accuracy |
| **Load Testing** | k6 or Artillery | Simulate 30 robots × 6 elevator banks concurrent requests |
| **E2E / Simulation** | Custom elevator simulator | Software-simulated elevator that responds to relay commands with realistic timing |
| **Safety Testing** | Formal verification (TLA+ or Alloy) | Prove state machine cannot reach unsafe states (robot in shaft with doors closed, etc.) |

---

## 14. Robot Vendor SDK

Published packages that robot vendors integrate into their fleet software:

| Package | Language | Distribution |
|---------|----------|-------------|
| `@accelerate/elevator-sdk` | TypeScript/Node.js | npm |
| `accelerate-elevator` | Python | PyPI |
| `accelerate_elevator` | ROS 2 (C++) | ROS package / apt |
| `elevator-grpc-proto` | Protobuf definitions | GitHub |

### SDK Interface
```typescript
const ride = await accelerate.requestRide({
  fromFloor: 1,
  toFloor: 7,
  robotId: 'keenon-w3-042',
  priority: 'supply'
})

ride.onStateChange((state) => {
  // WAITING_FOR_ELEVATOR, DOOR_OPEN, etc.
  if (state === 'DOOR_OPEN') robot.enterElevator()
  if (state === 'ARRIVED')   robot.exitElevator()
})

await ride.waitForComplete()
```

---

## Summary: Build Order (MVP → Production)

### Phase 1 — Proof of Concept (Thesis Hotel)
- ESP32 firmware with LoRa + relay control (C/FreeRTOS)
- Python state machine on Raspberry Pi
- REST API (FastAPI) on Railway
- PostgreSQL + Redis on Railway
- Basic Next.js dashboard

### Phase 2 — Production Single-Building
- Harden firmware (OTA, watchdog, signed updates)
- TypeScript state machine with XState
- MQTT broker (EMQX)
- Monitoring stack (Prometheus + Grafana)
- Robot vendor SDK (npm + PyPI)

### Phase 3 — Multi-Building Scale
- Kubernetes deployment
- OEM cloud adapters (KONE, Otis)
- Fleet coordination engine
- Multi-tenant dashboard
- Formal safety verification (TLA+)
- SOC 2 / ASME compliance audit

### Phase 4 — Platform
- Marketplace for OEM adapter plugins
- Self-service building onboarding
- Analytics-as-a-service for hospital ops
- ROS 2 native SDK
- Humanoid robot support extensions
