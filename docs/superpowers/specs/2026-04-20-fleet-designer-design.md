# Fleet Designer — Design Spec

> **For agentic workers:** This spec defines the Fleet Designer — a client-side HTML page in `accelerate-robotics/pages/` that reads from a shared robot catalog JSON, recommends optimal robot fleets based on property inputs and goals, and exports `fleet.yml` for the proposal generator.

**Goal:** Give Eric a tool to design custom robot fleets for hotel deals by browsing the full 222-robot catalog, getting AI-scored recommendations, comparing alternatives per slot, and exporting a proposal-ready fleet configuration — replacing the current manual process of remembering model names and hand-writing `fleet.yml`.

**Architecture:** A single self-contained HTML page (`fleet-designer.html`) with embedded JavaScript. Reads robot data from a shared `robots.json` file (extracted from the catalog). All logic runs client-side — no backend required. Outputs `fleet.yml` content via clipboard or download. Designed so a "Why These Robots" client-facing proposal section can be added later without rearchitecting.

**Tech Stack:** Vanilla HTML/CSS/JS (no build step, matching existing pages). Shared `robots.json` consumed via `fetch()`. No external dependencies.

---

## 1. Shared Data Layer: `robots.json`

### Problem

The 222-robot database currently lives as a `const R=[...]` JavaScript array embedded inside `robot-catalog.html`. The Fleet Designer needs to read the same data. Duplicating it creates a sync problem.

### Solution

Extract the robot array into a standalone file at `pages/data/robots.json`. Both `robot-catalog.html` and `fleet-designer.html` load it via `fetch('./data/robots.json')`.

### Migration

1. Create `pages/data/robots.json` containing the current R array
2. Modify `robot-catalog.html` to load via `fetch('./data/robots.json')` instead of inline `const R=...`
3. The catalog page's existing filter/sort/render logic stays the same — only the data source changes
4. Both pages share the single source of truth

### Schema

Each robot object in `robots.json` retains the existing 36+ fields. No schema changes needed. The fields relevant to Fleet Designer scoring are:

| Field | Used For |
|---|---|
| `primary_category` | Category matching (goal → robot type) |
| `primary_use_cases` | Secondary matching for nuanced goals |
| `elevator_integration` | Property requirement filtering |
| `public_price` | Budget scoring + display |
| `import_risk_score` | Risk ranking (prefer low-risk) |
| `import_risk_level` | Display in comparison cards |
| `status` | Filter to `commercially_available` by default |
| `payload_kg` | Spec comparison |
| `runtime_hours` | Spec comparison |
| `max_speed_mps` | Spec comparison |
| `weight_kg` | Spec comparison |
| `fleet_management` | Display in comparison |
| `outdoor_capable` | Property requirement filtering |
| `purchase_available` / `lease_or_raas` | Pricing model display |
| `country` | Import risk context |
| `key_differentiators` | Why-this-robot rationale |
| `notes` | Additional context in comparisons |

---

## 2. Fleet Designer Page: `fleet-designer.html`

### Layout

Two-column layout matching the dark theme of existing pages (`--bg: #0a0a0f`, `--accent: #00d4ff`, `--green: #00e676`).

**Left Panel (340px, fixed)** — Input form:
- Property section: name, rooms, floors, guest floor range, elevator count, floor surfaces
- Goals & Pain Points: checkbox grid of service categories
- Budget: range slider (min/max monthly RaaS spend)
- "Design My Fleet" button

**Right Panel (flex)** — Results:
- Summary strip: robot count, monthly cost, estimated savings, ROI multiple
- Fleet slot list: one row per recommended robot with role, model, key specs, price
- Each slot expandable to show top-3 comparison cards
- Export bar at bottom

### Input: Property Profile

| Field | Type | Purpose |
|---|---|---|
| Property Name | text | Label for exports |
| Room Count | number | Drives fleet sizing (more rooms = more delivery/cleaning capacity) |
| Floor Count | number | Drives elevator need + cleaning scope |
| Guest Floors | text | Identifies service zones (e.g., "4-16") |
| Elevator Count | number | Constrains multi-floor robots |
| Floor Surfaces | checkboxes: carpet, hardwood, tile, terrazzo, outdoor | Drives cleaning robot type matching |

### Input: Goals & Pain Points

Checkbox grid. Each goal maps to one or more robot categories in the scoring engine:

| Goal | Maps To Categories |
|---|---|
| Room Service Delivery | `delivery_robot`, `hotel_delivery_robot` |
| Corridor Cleaning | `cleaning_robot` (carpet-capable subset) |
| Lobby / Public Floor | `cleaning_robot` (hard-floor subset) |
| Guest Wow Factor | `service_robot`, `social_robot`, `telepresence_robot` |
| Linen / Supply Logistics | `hospital_logistics_robot`, `delivery_robot` (high-payload) |
| Security / Patrol | `security_robot` |
| Disinfection | `disinfection_robot` |
| Outdoor Service | Any with `outdoor_capable: true` |
| Pool / Amenity Area | `outdoor_cleaning_robot`, `pool_cleaning_robot` |

Multiple goals can be checked. Each checked goal creates one "slot" in the fleet.

### Input: Budget

A dual-handle range slider setting min and max monthly RaaS budget. Default range: $5,000–$50,000/month. The recommendation engine optimizes within this range.

---

## 3. Recommendation Engine

### Overview

When the user clicks "Design My Fleet," the engine runs three passes:

1. **Filter** — narrow the 222 robots to candidates per goal/slot
2. **Score** — rank candidates within each slot
3. **Select** — pick the top candidate per slot, respecting budget

### Pass 1: Filter

For each checked goal, filter the catalog to robots that:
- Match at least one mapped category (see table above)
- Have `status === 'commercially_available'` (announced/prototype robots shown as footnotes only)
- Meet property requirements:
  - If property has multiple floors and limited elevators: require `elevator_integration: true` for indoor multi-floor roles
  - If goal involves carpet: filter cleaning robots to those with vacuum/carpet capability (checked via `primary_use_cases` containing "carpet" or "vacuum")
  - If goal involves hard floor: filter to scrubber/mop types
  - If goal is outdoor: require `outdoor_capable: true`

### Pass 2: Score

Each candidate gets a composite score (0–100) based on weighted factors:

| Factor | Weight | Logic |
|---|---|---|
| **Category relevance** | 30% | Exact primary_category match = 100. Use-case keyword match = 70. Adjacent category = 40. |
| **Import risk** | 25% | Score = `(10 - import_risk_score) * 10`. Low risk scores highest. |
| **Price fit** | 20% | Parse `public_price` to extract a monthly cost estimate. Score = how well it fits within per-slot budget allocation (total budget / number of slots). Robots with `not_publicly_listed` get a neutral score of 50. |
| **Spec match** | 15% | Elevator integration when needed (+20). Payload adequate for role (+10). Runtime > 6hr (+10). Known fleet management system (+10). |
| **Market validation** | 10% | Commercially deployed (not just announced) = 100. Notes mentioning deployment count or named customers = bonus. |

### Pass 3: Select

1. Sort candidates per slot by composite score (descending)
2. Pick the top candidate for each slot
3. Sum total monthly cost across all slots
4. If total exceeds max budget: drop the lowest-priority slot (last checked goal) and recompute
5. If total is under min budget and unused goals exist: suggest adding a slot

The engine stores the top 3 candidates per slot (not just the winner) for the comparison view.

### Savings Estimation

Each slot gets an estimated monthly savings based on the role type:

| Role Type | Default Monthly Savings Estimate | Basis |
|---|---|---|
| Room Service Delivery | $3,800 | Replaces 0.5 FTE runner + eliminates tip-out |
| Corridor Cleaning | $4,200 | Replaces overnight cleaning shift |
| Lobby/Public Floor | $3,500 | Replaces portion of EVS schedule |
| Guest Wow / Concierge | $1,500 | Incremental revenue from guest satisfaction + PR value |
| Linen/Supply Logistics | $4,500 | Replaces back-of-house porter runs |
| Security/Patrol | $5,000 | Replaces overnight guard shift |
| Disinfection | $3,000 | Reduces chemical costs + EVS time |
| Outdoor Service | $2,500 | Reduces groundskeeping labor |

These are editable defaults. The user can override per slot after the recommendation is generated.

---

## 4. Comparison View

When the user clicks a fleet slot's "compare" button, the slot expands to show a comparison card grid (3 cards side by side).

Each comparison card shows:
- Robot name and company
- Monthly cost (parsed from `public_price`)
- Key specs: payload, runtime, elevator support, coverage area
- Import risk level (color-coded: green/yellow/red)
- Key differentiators (from `key_differentiators` array, first 2-3 items)
- "Select" / "Swap to this" button

Clicking "Swap" replaces the slot's current pick and recalculates the summary strip totals.

---

## 5. Summary Strip

Four live-updating chips across the top of the results panel:

| Chip | Calculation |
|---|---|
| **Robots** | Count of active fleet slots |
| **Monthly RaaS** | Sum of per-slot costs (parsed from `public_price` or the configured `raas_rate_usd` from pricing config) |
| **Est. Savings** | Sum of per-slot savings estimates |
| **ROI Multiple** | Est. Savings / Monthly RaaS |

---

## 6. Export: `fleet.yml`

The export button generates a `fleet.yml` string compatible with the proposal generator's expected format (as defined in the `2026-04-17-proposal-generator-design.md` spec).

### Format

```yaml
# Generated by Fleet Designer — 2026-04-20
# Property: Kimpton Sawyer Hotel (OPP-007)
# Total: 6 robots, $17,100/mo RaaS, $22,800/mo est. savings

robots:
  - code: W3
    label: "Room service delivery"
    role: "F&B delivery from Revival/Echo & Rig to guest floors 4-16"
    photo: "../assets/robots/photos/keenon-w3.png"
    type: delivery
    captures: "Room-service runner shifts + bellhop OT"
    savings: 3800
    service_line: "Room Service"
    unlock_text: "A craft cocktail from Revival arrives at their door while the arena still glows."
    tier: 1
    # Source: robots.json — Keenon W3 (score: 87/100)
    # Alternatives: BellaBot Pro (72), Relay Hotel (68)

  - code: C40
    label: "Corridor carpet vacuum"
    role: "Overnight carpet vacuum on guest floors 4-16"
    photo: "../assets/robots/photos/keenon-c40.png"
    type: cleaning
    captures: "Overnight cleaning shift"
    savings: 4200
    service_line: "Corridor Cleaning"
    unlock_text: "Guests wake to freshly vacuumed corridors — every morning, every floor."
    tier: 1
    # Source: robots.json — Keenon C40 (score: 82/100)
    # Alternatives: Pudu CC1 Pro (75), Avidbots Kas (61)

presets:
  - name: "Pilot"
    count: 1
  - name: "Signature"
    count: 3
  - name: "Full-Property"
    count: 6

default_preset: 2
```

### Fields auto-populated from robots.json

- `code`: derived from `model_name` (abbreviated)
- `type`: mapped from `primary_category` → `delivery` | `cleaning` | `logistics` | `security` | `service`
- `photo`: constructed from company + model name pattern (user can override)
- `savings`: from the role-based defaults table (user can override)

### Fields requiring manual input

- `label`: auto-generated from role but editable
- `role`: auto-generated from goal + property context but editable
- `captures`: auto-generated but editable (what labor this replaces)
- `unlock_text`: auto-generated but editable (the guest-facing narrative)
- `service_line`: auto-generated from goal name
- `tier`: auto-assigned based on slot priority order

### Export methods

1. **Download fleet.yml** — saves a `.yml` file
2. **Copy to clipboard** — copies the YAML string
3. **Save to deal** — (future) writes directly to the deal's hotel repo via the deals API

---

## 7. Preset / Tier Generation

The Fleet Designer auto-generates tier presets based on the fleet slots. The first slot is always Tier 1 (pilot), and subsequent slots build up:

| Preset | Logic |
|---|---|
| Pilot | Slot 1 only (the highest-priority goal) |
| Signature | Slots 1-3 (or 1-2 if only 2 goals) |
| Full-Property | All slots |
| [Property] Autonomous | All slots + Intelligence Platform (if applicable) |

Preset names and counts are included in the exported `fleet.yml`.

---

## 8. Price Parsing

Many robots in the catalog have complex price strings like `"$11,500-$16,400"`, `"~$50,000 + ~$500/mo service plan"`, `"$599/month lease; ~$18,000-$25,000 purchase"`, or `"RaaS model; pricing on request"`.

The price parser extracts a **monthly RaaS estimate** using these rules:

1. If string contains `/month` or `/mo`: extract that number directly
2. If string contains a range like `$X-$Y`: take midpoint, assume purchase price, divide by 36 months for monthly equivalent
3. If string contains `RaaS` or `lease` with a number: use that number
4. If string is `not_publicly_listed` or `pricing on request`: use the configured `raas_rate_usd` from the deal config (default $2,850)
5. If string contains only a purchase price: divide by 36 for monthly equivalent

This parsed value is used for budget calculations and comparison sorting. The raw `public_price` string is always shown to the user alongside the parsed estimate.

---

## 9. Future: "Why These Robots" Proposal Section

The Fleet Designer is structured so that a client-facing "Why These Robots" section can be added to proposals later. The data needed is already captured:

- **Selected robot** per slot with score and key differentiators
- **Runner-up alternatives** with their scores
- **Scoring rationale** (which factors drove the selection)

When ready to implement, a new renderer in the proposal generator can read the exported `fleet.yml` (which includes the `# Source` and `# Alternatives` comments) and generate a comparison section showing: "We evaluated 40+ delivery robots on the market. Here's why the Keenon W3 is the best fit for [Hotel Name]."

This is explicitly out of scope for v1. Noted here to ensure the data structure supports it.

---

## 10. Integration Points

### With Robot Catalog (`robot-catalog.html`)

- Both pages read from `pages/data/robots.json`
- Fleet Designer links back to the catalog for full robot detail (deep links like `robot-catalog.html?highlight=keenon-w3`)
- Adding robots to the catalog automatically makes them available in the Fleet Designer

### With Deal Pipeline (`admin-deals.html`)

- Fleet Designer accepts an optional `?opp=OPP-007` query parameter to pre-fill property details from the deals API
- The deal detail page (`admin-deal-detail.html`) links to Fleet Designer with the deal's opportunity ID
- (Future) "Save to deal" export writes `fleet.yml` directly to the deal's hotel repo

### With Proposal Generator (`accelerate-hotel-template/`)

- Exported `fleet.yml` follows the exact schema expected by the proposal generator
- No changes needed to the proposal generator to consume Fleet Designer output
- The `presets` and `tier_narratives` sections are auto-generated but hand-editable

---

## 11. Non-Goals (Explicitly Out of Scope)

- **Client-facing catalog view** in proposals — deferred to v2
- **AI/LLM-powered recommendations** — v1 uses deterministic scoring rules, not an LLM
- **Backend/database storage** — everything is client-side; fleet configs are exported as files
- **Multi-user collaboration** — single-user tool for Eric
- **Robot image management** — uses existing image_url from catalog; no image upload
- **Proposal rendering** — Fleet Designer exports data; the proposal generator renders it

---

## 12. File Summary

| File | Action | Purpose |
|---|---|---|
| `pages/data/robots.json` | **Create** | Shared robot catalog data (extracted from robot-catalog.html) |
| `pages/fleet-designer.html` | **Create** | Fleet Designer page (self-contained HTML/CSS/JS) |
| `pages/robot-catalog.html` | **Modify** | Switch from inline `const R=...` to `fetch('./data/robots.json')` |
| `project-dashboard.html` | **Modify** | Add Fleet Designer link to Accelerate Robotics card |
