# Accelerate Operations Platform — Architecture Spec

## Goal

Replace the scattered ecosystem of 8+ hotel repos, duplicated proposal generators, and manual workflows with a single unified platform that takes a facility from first contact to deployed robot fleet. The platform is the backbone of Accelerate Robotics' nationwide sales and deployment operation.

## Architecture: Monolith Extension with Agent Layer

Extend the existing `accelerate-robotics` Node.js/Express/SQLite application. No new repos, no microservices, no frontend framework. Static HTML pages served by Express, interactive behavior in vanilla JS, data persisted in SQLite. Agent automation runs as Claude Code sessions that read/write via the platform's API.

### Why This Architecture

- **Speed** — auth, database, email, deployment pipeline already work
- **Scale** — SQLite handles 10,000 deals and 50 users without issue
- **Simplicity** — one codebase, one deploy (Railway), one mental model
- **Agent-ready** — Express API endpoints are the natural interface for Claude Code agents

### Four Layers

```
┌─────────────────────────────────────────────────────────────┐
│  HUMAN INTERFACE — HTML pages served by Express             │
│  Deal Dashboard │ Fleet Configurator │ Proposal Viewer      │
│  Robot Catalog  │ Team Admin         │ Analytics            │
├─────────────────────────────────────────────────────────────┤
│  BUSINESS LOGIC — Express route handlers + services         │
│  Deal Engine │ Configuration Engine │ Proposal Engine       │
│  Playbook Engine │ ROI Calculator   │ Notification Service  │
├─────────────────────────────────────────────────────────────┤
│  AGENT LAYER — Claude Code sessions via API                 │
│  Research │ Proposal │ Outreach │ Deployment │ Market Intel │
├─────────────────────────────────────────────────────────────┤
│  DATA LAYER — SQLite tables + JSON files                    │
│  deals │ facilities │ configurations │ proposals            │
│  contacts │ activities │ robot_catalog.json                  │
└─────────────────────────────────────────────────────────────┘
```

---

## Data Model

### Core Tables

#### `deals`
The central record. Every opportunity flows through here.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID, e.g. `OPP-010` |
| name | TEXT NOT NULL | Display name, e.g. "Kimpton Sawyer Sacramento" |
| facility_id | TEXT FK | Links to facilities table |
| stage | TEXT NOT NULL | `lead → qualified → site_walk → configured → proposed → negotiation → won → deploying → active → lost`. "configured" = fleet config accepted by user. "proposed" = proposal sent to customer. "lost" can happen from any stage. |
| owner | TEXT | Team member assigned (email or username) |
| source | TEXT | How the lead came in (inbound, referral, outbound, event) |
| value_monthly | REAL | Estimated monthly recurring revenue |
| value_total | REAL | Total contract value |
| close_probability | INTEGER | 0-100 |
| notes | TEXT | Free-form notes |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |
| closed_at | TEXT | ISO timestamp (when won or lost) |

#### `facilities`
Physical property profile. Decoupled from deals because one facility could have multiple deals over time.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| name | TEXT NOT NULL | Property name |
| type | TEXT NOT NULL | `hotel`, `hospital`, `grocery`, `theater`, `office`, `warehouse`, `other` |
| address | TEXT | Street address |
| city | TEXT | City |
| state | TEXT | State/province |
| country | TEXT | Country, default "United States" |
| floors | INTEGER | Total floors |
| rooms_or_units | INTEGER | Guest rooms, patient beds, etc. |
| sqft_total | INTEGER | Total square footage |
| elevator_count | INTEGER | Number of elevators |
| elevator_brand | TEXT | ThyssenKrupp, OTIS, Schindler, KONE, Mitsubishi, other |
| elevator_type | TEXT | traction, hydraulic, destination_dispatch |
| surfaces | TEXT | JSON array: `["carpet", "tile", "hardwood", "concrete", "outdoor"]` |
| wifi_available | BOOLEAN | WiFi coverage in service areas |
| operator | TEXT | Management company (Marriott, Hilton, HHM, Shaner, etc.) |
| brand | TEXT | Hotel brand (Kimpton, Westin, Autograph Collection, etc.) |
| gm_name | TEXT | General manager |
| gm_email | TEXT | GM email |
| gm_phone | TEXT | GM phone |
| eng_name | TEXT | Head of engineering/facilities |
| eng_email | TEXT | Engineering contact email |
| notes | TEXT | Free-form notes, site walk observations |
| photos | TEXT | JSON array of photo paths/URLs |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

#### `operational_challenges`
What problems does this facility have? This is the entry point for the configurator.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| facility_id | TEXT FK | Links to facilities |
| category | TEXT NOT NULL | `cleaning`, `delivery`, `transport`, `security`, `disinfection`, `mobility`, `guidance`, `inventory` |
| description | TEXT NOT NULL | Specific challenge, e.g. "50K sqft carpet cleaned nightly, currently 3 EVS staff" |
| priority | TEXT | `critical`, `high`, `medium`, `low` |
| current_cost_monthly | REAL | What they spend now on this operation |
| current_staff_count | INTEGER | Staff currently assigned |
| area_sqft | INTEGER | Area affected |
| floors_affected | TEXT | JSON array of floor numbers |
| schedule | TEXT | When this work happens, e.g. "nightly 10pm-6am" |
| created_at | TEXT | ISO timestamp |

#### `configurations`
A fleet assembly solving a facility's challenges. A deal can have multiple configurations (versions, alternatives).

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| deal_id | TEXT FK | Links to deals |
| name | TEXT | Version label, e.g. "Option A - Full Fleet" |
| status | TEXT | `draft`, `proposed`, `accepted`, `rejected` |
| robots | TEXT NOT NULL | JSON array of robot selections (see below) |
| monthly_cost | REAL | Total monthly cost to customer |
| setup_cost | REAL | One-time setup/installation cost |
| monthly_savings | REAL | Estimated monthly savings vs current ops |
| payback_months | REAL | Months to ROI |
| import_risk_max | REAL | Highest import risk score in the fleet |
| notes | TEXT | Configuration rationale |
| created_at | TEXT | ISO timestamp |
| updated_at | TEXT | ISO timestamp |

**`robots` JSON structure:**
```json
[
  {
    "catalog_id": "keenon-c30",
    "model_name": "C30",
    "company": "Keenon",
    "quantity": 2,
    "role": "Carpet cleaning - guest floors 4-10",
    "challenge_ids": ["challenge-uuid-1"],
    "unit_cost_monthly": 1200,
    "import_risk_score": 9.5,
    "country": "China"
  }
]
```

#### `contacts`
People associated with deals and facilities.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| facility_id | TEXT FK | Links to facilities |
| name | TEXT NOT NULL | Full name |
| title | TEXT | Job title |
| email | TEXT | Email address |
| phone | TEXT | Phone number |
| role | TEXT | `decision_maker`, `champion`, `influencer`, `end_user`, `blocker` |
| notes | TEXT | Relationship notes |
| created_at | TEXT | ISO timestamp |

#### `proposals`
Generated proposal documents tied to a deal + configuration.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| deal_id | TEXT FK | Links to deals |
| configuration_id | TEXT FK | Links to configurations |
| version | INTEGER | Version number (1, 2, 3...) |
| status | TEXT | `draft`, `review`, `approved`, `sent`, `viewed` |
| html_content | TEXT | Full rendered proposal HTML |
| pdf_path | TEXT | Path to generated PDF |
| share_token | TEXT | Unique token for shareable link |
| sent_to | TEXT | Email address proposal was sent to |
| sent_at | TEXT | ISO timestamp |
| viewed_at | TEXT | ISO timestamp (first view) |
| created_at | TEXT | ISO timestamp |
| approved_by | TEXT | Who approved it |

#### `activities`
Audit trail for everything that happens on a deal.

| Column | Type | Description |
|--------|------|-------------|
| id | TEXT PK | UUID |
| deal_id | TEXT FK | Links to deals |
| actor | TEXT NOT NULL | Who did it (user email or "agent:research", "agent:proposal") |
| action | TEXT NOT NULL | What happened (stage_change, note_added, config_created, proposal_generated, email_drafted, etc.) |
| detail | TEXT | JSON with action-specific data |
| created_at | TEXT NOT NULL | ISO timestamp |

### Existing Tables (Unchanged)

- `admin_users` — platform auth (extend with roles: `admin`, `sales`, `ops`)
- `inquiries` — public website leads (wire new leads into deal creation)
- `notification_recipients` — email notification list

### JSON Files (Not in SQLite)

- `robotics-product-database.json` — the 86+ model robot catalog with specs, images, risk scores. Stays as JSON because it's maintained by the Market Intel agent and version-controlled in git. Read into memory on server start.

---

## Operational Challenges Taxonomy

The configurator's entry point. When a user creates a facility profile, they select which operational challenges apply. The system maps these to robot solutions.

| Category | Example Challenges | Robot Solutions |
|----------|-------------------|-----------------|
| **Cleaning** | Carpet vacuuming, hard floor scrubbing, window cleaning, outdoor sweeping | Keenon C30/C40/C55, Pudu CC1/CC1 Pro, MT1/MT1-Max/MT1-Vac, Avidbots Neo/Neo 2W/Kas, Navia Scrubber 50/75 |
| **Delivery** | Room service, pharmacy delivery, lab specimens, mail/packages, amenities | Keenon W3/T8, Pudu BellaBot/FlashBot/HolaBot, Relay RelayRx/Hotel, Aethon TUG T3 |
| **Transport** | Linen carts, supply carts, waste removal, equipment moves | Toyota AGVs, KUKA KMP platforms, AGILOX ODM/OCF/ONE |
| **Disinfection** | UV room disinfection, pharmacy cleanroom, operating room turnover | Blue Ocean UVD Pharma, Pudu Puductor 2 |
| **Security** | Lobby monitoring, perimeter patrol, after-hours surveillance | Keenon S100/S300 |
| **Guidance** | Visitor wayfinding, guest check-in assistance, information kiosk | Keenon XMAN-R1/F1, LG CLOi GuideBot, Navia Phantas |
| **Mobility** | Patient transport, wheelchair service, autonomous mobility | WHILL Model C2/F/R, DAAV DAAV-air |
| **Outdoor** | Sidewalk delivery, campus transport, lawn maintenance | Serve Gen 3, Coco 2, Keenon KEENMOW K1 |

Each challenge record includes the facility's current cost and staffing for that operation, enabling automatic ROI calculation when robots are assigned.

---

## Configuration Engine Logic

### Flow: Challenge → Solution → Fleet

1. User enters facility profile (floors, sqft, surfaces, elevators)
2. User selects operational challenges with details (area, schedule, current cost)
3. System filters robot catalog by:
   - **Capability match** — which robots solve this challenge category
   - **Surface compatibility** — carpet vs hard floor vs outdoor
   - **Elevator integration** — required if multi-floor operation
   - **Import risk tolerance** — user sets max acceptable risk score (0-10)
   - **Availability** — commercially available vs announced vs discontinued
4. System presents matching robots grouped by challenge, sorted by fit
5. User selects robots, sets quantities, assigns to specific challenges
6. System calculates:
   - Monthly fleet cost (sum of unit costs × quantities)
   - Setup cost (elevator integration, mapping, training)
   - Monthly savings (current cost - fleet cost - Accelerate margin)
   - Payback period
   - Maximum import risk in fleet
   - Country diversity (single-source risk)

### ROI Model

```
Monthly Savings = Current Labor Cost - Robot Fleet Cost - Accelerate Platform Fee
Payback Months = (Setup Cost + First Month Fleet) / Monthly Savings
Annual ROI = (Monthly Savings × 12 - Setup Cost) / Setup Cost × 100
```

The ROI model pulls current labor costs from the operational challenge records. Robot costs come from the catalog (public_price) or from Accelerate's negotiated rates stored in a separate pricing table (future).

---

## Proposal Engine

### Template Architecture

Absorb the patterns from `accelerate-hotel-template` into a server-side template engine. Templates are HTML files with variable injection — no React, no build step.

**Template variables** (injected from deal + facility + configuration):
```
{{FACILITY_NAME}}, {{FACILITY_TYPE}}, {{CITY}}, {{STATE}}
{{FLOORS}}, {{ROOMS}}, {{SQFT}}, {{ELEVATOR_BRAND}}
{{GM_NAME}}, {{GM_TITLE}}, {{OPERATOR}}, {{BRAND}}
{{FLEET_TABLE}}, {{ROI_SUMMARY}}, {{PHASE_TIMELINE}}
{{CHALLENGES_SOLVED}}, {{IMPORT_RISK_SUMMARY}}
{{MONTHLY_COST}}, {{SETUP_COST}}, {{PAYBACK_MONTHS}}
{{PROPOSAL_DATE}}, {{PROPOSAL_VERSION}}, {{DEAL_ID}}
```

**Template types:**
- `proposal-interactive.html` — full interactive proposal with fleet slider (customer-facing)
- `proposal-print.html` — print-friendly PDF version
- `onepager.html` — executive summary one-pager
- `site-profile.html` — facility overview
- `playbook.html` — deployment playbook
- `risk-register.html` — deployment risk register

Templates live in `src/templates/` and are rendered server-side with simple string replacement + conditional sections.

### Generation Flow

1. User clicks "Generate Proposal" on a deal with an accepted configuration
2. Server loads deal + facility + configuration + robot catalog data
3. Server renders template with injected variables
4. Generated HTML stored in `proposals` table
5. PDF generated via headless browser (Puppeteer or similar)
6. Shareable link created with unique token
7. Activity logged on the deal

---

## Agent Layer

### Design Principle

Agents are **Claude Code sessions** that interact with the platform via its REST API. They don't access the database directly — they use the same endpoints as the web UI. This means:

- Agents can be developed and tested independently
- Agent actions are logged through the same activity system
- Human approval is enforced at the API level, not by trusting the agent
- Any agent action that touches external systems (email, etc.) requires status `approved` in the activity queue

### Agent Definitions

Each agent has a `.claude/rules/` file defining its role, tools, and boundaries.

#### Research Agent
- **Trigger:** New deal created with facility name + city
- **Actions:** Web search for property details, populate facility profile fields (floors, rooms, sqft, elevator brand, operator, brand), attach photos, identify operational challenges
- **Output:** Updated facility record + suggested challenges
- **Approval:** Facility profile review before deal advances

#### Proposal Agent
- **Trigger:** Configuration status set to `accepted`
- **Actions:** Render proposal from template, generate PDF, draft cover email
- **Output:** Proposal record in `draft` status
- **Approval:** Human reviews and approves before sending

#### Outreach Agent
- **Trigger:** Deal stage changes or scheduled follow-up date reached
- **Actions:** Draft personalized email based on deal context, stage, and contact info
- **Output:** Email draft in activity queue with `pending_approval` status
- **Approval:** Human reviews, edits, and approves before send

#### Deployment Agent
- **Trigger:** Deal stage set to `won`
- **Actions:** Generate deployment playbook, pre-deployment checklist, phase schedule, risk register from configuration and facility data
- **Output:** Playbook documents attached to deal
- **Approval:** Ops team reviews before deployment begins

#### Market Intelligence Agent
- **Trigger:** Scheduled (weekly/monthly) or manual
- **Actions:** Scan manufacturer websites for new models, pricing changes, tariff updates. Update robot catalog JSON.
- **Output:** Updated `robotics-product-database.json` with changelog
- **Approval:** Catalog changes reviewed before merge

### Agent API Endpoints

```
POST   /api/agents/:name/trigger    — Trigger an agent run
GET    /api/agents/:name/status     — Check agent run status
GET    /api/agents/queue             — Pending approval queue
POST   /api/agents/queue/:id/approve — Approve a pending action
POST   /api/agents/queue/:id/reject  — Reject a pending action
```

---

## Human Interface

### Deal Dashboard (`/admin/deals`)

Pipeline view showing all deals. Two view modes:

- **Kanban** — columns per stage (lead → qualified → site_walk → configured → proposed → negotiation → won/lost)
- **Table** — sortable list with filters (stage, owner, facility type, value, risk)

Each deal card shows: facility name, type, stage, owner, fleet size, monthly value, import risk indicator, days in stage.

Click a deal to open the detail view: facility profile, operational challenges, configurations, proposals, activity timeline, contacts.

### Fleet Configurator (`/admin/deals/:id/configure`)

The core tool. Accessed from a deal's detail view.

1. **Challenges Panel** (left) — list of this facility's operational challenges with current cost/staffing
2. **Solution Panel** (center) — for each challenge, show matching robots from catalog with specs, images, risk scores. Filter by import risk tolerance, country, availability.
3. **Fleet Summary** (right) — assembled fleet with quantities, total cost, ROI preview, risk heatmap

User can drag robots from solution panel to fleet, adjust quantities, swap vendors. ROI and risk recalculate in real time.

### Robot Catalog (`/admin/catalog`)

The catalog we just built — 86+ models with images, specs, risk scores. Enhanced with:
- "Add to configuration" button on each robot (context: which deal/challenge)
- Comparison mode (select 2-3 robots side by side)
- Vendor profile pages

### Proposal Viewer (`/admin/deals/:id/proposals`)

List of generated proposals for a deal. Preview, edit, approve, send, track views.

### Agent Queue (`/admin/agents`)

Pending agent actions awaiting human approval. Each item shows: agent name, action type, deal context, proposed action, approve/reject buttons.

---

## Auth & Roles

Extend existing JWT auth with role-based access:

| Role | Permissions |
|------|------------|
| `admin` | Everything — user management, system config, all deals |
| `sales` | Create/edit deals, configure fleets, generate proposals, approve outreach |
| `ops` | View deals, manage deployments, approve playbooks, site profiles |
| `viewer` | Read-only dashboard access |

Add `role` column to existing `admin_users` table. Default existing users to `admin`.

---

## Build Phases

### Phase 1: Foundation
**Scope:** Database schema, deal pipeline, facility profiles, role-based auth, consolidate existing deals.

- Add new tables: `deals`, `facilities`, `contacts`, `operational_challenges`, `activities`
- Add `role` column to `admin_users`
- Deal dashboard page (kanban + table views)
- Deal detail page (facility profile, challenges, activity timeline)
- Facility profile form (all fields from schema above)
- Seed database with existing 8 hotel deals from current repos
- Wire existing inquiry form to auto-create deals
- API endpoints: CRUD for deals, facilities, contacts, challenges, activities

### Phase 2: Configurator
**Scope:** Challenge-to-solution mapping, fleet builder UI, ROI calculator, import risk filtering.

- Operational challenges taxonomy and challenge → robot mapping
- Add `configurations` table
- Fleet configurator UI (three-panel layout)
- Robot catalog integration (filter, select, add to fleet)
- Real-time ROI calculator
- Import risk tolerance slider and fleet risk heatmap
- Save/load configurations per deal
- API endpoints: CRUD for configurations, robot catalog queries

### Phase 3: Proposal Engine
**Scope:** Template-based proposal generation, PDF export, shareable links.

- Add `proposals` table
- Template engine (absorb hotel-template patterns)
- Proposal generation from deal + config + facility
- PDF export (headless browser)
- Shareable link with view tracking
- Version history per deal
- Deployment playbook generation
- API endpoints: generate, list, approve, share proposals

### Phase 4: Agent Framework
**Scope:** Research and proposal agents, approval queue, activity logging.

- Agent trigger/status API endpoints
- Approval queue UI in dashboard
- Research agent: auto-populate facility from property name
- Proposal agent: draft proposal from accepted configuration
- Activity logging for all agent actions
- Agent role definitions in `.claude/rules/`

### Phase 5: Scale
**Scope:** Remaining agents, analytics, team onboarding.

- Outreach agent: email drafting with approval
- Market intelligence agent: catalog updates
- Deployment agent: playbook generation
- Analytics dashboard (pipeline value, conversion rates, fleet mix, geographic spread)
- Team onboarding flows and documentation
- Webhook integrations (email open tracking, calendar)

---

## Technical Decisions

### SQLite over Postgres
Already decided (ADR-0001). Correct for this scale. Single-file database, zero ops overhead, handles concurrent reads well. Write contention is not an issue at <100 concurrent users.

### No Frontend Framework
Static HTML + vanilla JS. Matches existing codebase. Interactive elements (fleet configurator, kanban drag) use lightweight libraries (SortableJS for drag-and-drop, Chart.js for analytics) — not React/Vue/Angular.

### Robot Catalog Stays as JSON
The catalog is maintained by the Market Intel agent and version-controlled in git. It's loaded into memory on server start and served via API. No need to put 86 robot specs in SQLite — the data is read-heavy, write-rare, and benefits from git history.

### Proposal Templates as HTML Files
Templates live in `src/templates/` as HTML files with `{{VARIABLE}}` placeholders. Simple `String.replace()` rendering. No template engine dependency (Handlebars, EJS, etc.) unless conditional sections become complex enough to warrant it.

### Agent Communication via REST API
Agents don't access SQLite directly. They use the same authenticated API as the web UI. This enforces permission boundaries, creates audit trails, and means agents can run from any machine with API access.

---

## File Structure (New Files)

```
src/
├── db/
│   └── database.js              ← Add new CREATE TABLE statements
├── routes/
│   ├── deals.js                 ← NEW: CRUD + pipeline operations
│   ├── facilities.js            ← NEW: CRUD + profile management
│   ├── configurations.js        ← NEW: Fleet configs + ROI calc
│   ├── proposals.js             ← NEW: Generate, manage, share
│   ├── agents.js                ← NEW: Trigger, status, approval queue
│   ├── catalog.js               ← NEW: Robot catalog API (read from JSON)
│   └── (existing: auth, inquiries, recipients, stocks)
├── services/
│   ├── roi-calculator.js        ← NEW: ROI/savings computation
│   ├── proposal-renderer.js     ← NEW: Template → HTML generation
│   ├── challenge-mapper.js      ← NEW: Challenge → robot solution mapping
│   └── (existing: email.js)
├── templates/
│   ├── proposal-interactive.html ← NEW: From hotel-template
│   ├── proposal-print.html      ← NEW: PDF-friendly version
│   ├── onepager.html            ← NEW: Executive summary
│   ├── playbook.html            ← NEW: Deployment playbook
│   └── site-profile.html        ← NEW: Facility overview
└── server.js                    ← Mount new routes

public/
├── admin-deals.html             ← NEW: Deal dashboard
├── admin-deal-detail.html       ← NEW: Deal detail + configure
├── admin-catalog.html           ← NEW: Robot catalog (evolve from pages/)
├── admin-agents.html            ← NEW: Agent approval queue
├── admin-analytics.html         ← NEW: Pipeline analytics (Phase 5)
└── js/
    ├── deals.js                 ← NEW: Dashboard interactivity
    ├── configurator.js          ← NEW: Fleet builder logic
    └── (existing: admin-auth.js)
```

---

## Success Criteria

### Phase 1 is done when:
- All 8+ existing hotel deals are in the database with facility profiles
- Team members can log in with role-based access
- Deal dashboard shows pipeline with stage filtering
- New website inquiries auto-create deal records
- Activity timeline tracks all changes

### Phase 2 is done when:
- User can select operational challenges for a facility
- System recommends matching robots from the 86-model catalog
- User can assemble a fleet with quantities and per-challenge assignments
- ROI calculates automatically from challenge costs + robot pricing
- Import risk is visible and filterable
- Configurations save to deals

### Phase 3 is done when:
- Clicking "Generate Proposal" produces a branded HTML proposal
- Proposal includes fleet details, ROI, phase timeline, risk assessment
- PDF export works
- Shareable link tracks when the recipient views it

### Phase 4 is done when:
- Research agent auto-populates facility profile from property name
- Proposal agent drafts proposals from accepted configurations
- All agent actions appear in the approval queue
- Nothing reaches a customer without human approval

### Phase 5 is done when:
- Outreach agent drafts stage-appropriate emails
- Market intel agent updates the robot catalog
- Analytics dashboard shows pipeline health
- A new hire can use the system with minimal training
