# Accelerate Robotics Command Dashboard — Requirements Specification & Workflow

**Version:** 1.0
**Date:** 2026-05-07
**Commit:** `10a5e7a` (main)

---

## 1. System Overview

The Accelerate Robotics Command Dashboard is a monolithic Node.js/Express web application that serves as the operating system for a hospital robotics company. It manages the full sales lifecycle — from lead generation through site assessment, proposal, deployment, and ongoing operations.

**Stack:** Node.js 24 + Express 4.21 | SQLite (libsql/Turso) | Vanilla JS frontend | Render.com hosting

---

## 2. Functional Requirements

### 2.1 Authentication & User Management

| ID | Requirement | Implementation |
|----|-------------|----------------|
| AUTH-01 | Admin login via email + password | `POST /api/auth/login` → JWT in httpOnly cookie (24h) |
| AUTH-02 | Invite-based onboarding | Admin sends invite email → user sets password via token link |
| AUTH-03 | Password reset via email | Forgot-password flow with 1-hour token, Resend email |
| AUTH-04 | Role-based access control (6 roles) | `super_admin`, `admin`, `module_owner`, `viewer`, `sales`, `ops` |
| AUTH-05 | Per-module permissions (edit/view/none) | `role_permissions` table + `user_permissions` overrides |
| AUTH-06 | Session validation on every admin page | `checkAuth()` → `GET /api/auth/me` on page load |
| AUTH-07 | Dev bypass (no login required locally) | `NODE_ENV !== 'production'` → auto super_admin |

**Files:** `src/routes/auth.js`, `src/middleware/auth.js`, `src/services/permissions.js`, `public/admin-login.html`

### 2.2 Deal Pipeline (Sales CRM)

| ID | Requirement | Implementation |
|----|-------------|----------------|
| DEAL-01 | Track deals through 10 stages | lead → qualified → site_walk → configured → proposed → negotiation → won → deploying → active → lost |
| DEAL-02 | Facility master database | Properties with address, elevator info, surfaces, contacts |
| DEAL-03 | Contact management per facility | Decision makers, champions, influencers, blockers, end users |
| DEAL-04 | Operational challenges per facility | Cleaning, delivery, transport, security — with cost/staff data |
| DEAL-05 | Activity timeline per deal | Chronological log of stage changes, notes, owner changes |
| DEAL-06 | Deal valuation | Monthly value, total value, close probability (0-100%) |
| DEAL-07 | Deal ownership + source tracking | Owner email, source (inbound/referral/outbound/event) |
| DEAL-08 | Dormant deal flagging | `is_dormant` flag for paused but not lost deals |
| DEAL-09 | Meeting scheduler per deal | `next_meeting_at` + `next_meeting_note` |

**Files:** `src/routes/deals.js`, `src/routes/facilities.js`, `public/admin-deals.html`, `public/admin-deal-detail.html`

### 2.3 Site Assessments

| ID | Requirement | Implementation |
|----|-------------|----------------|
| ASSESS-01 | Multi-zone property evaluation | 13 zone types (lobby, restaurant, kitchen, pool deck, etc.) |
| ASSESS-02 | Per-zone data collection | Floor surfaces, ceiling height, WiFi, cleaning method, robot readiness |
| ASSESS-03 | Stakeholder identification | Name, title, role (decision_maker/influencer/champion/blocker/technical) |
| ASSESS-04 | Photo capture with BLOB storage | Base64 upload, thumbnail generation, zone association |
| ASSESS-05 | PDF report generation | PDFKit streaming (684-line renderer) |
| ASSESS-06 | Offline-first sync | Client generates UUIDs, full-state upsert (INSERT OR REPLACE) |
| ASSESS-07 | Assignment & status tracking | assigned_to + status (draft/in_progress/completed/synced) |

**Files:** `src/routes/assessments.js`, `src/routes/assessment-photos.js`, `src/routes/assessment-pdf.js`, `pages/assessment.html`

### 2.4 Hotel Research Tool (Sales Prospecting)

| ID | Requirement | Implementation |
|----|-------------|----------------|
| HOTEL-01 | Free hotel discovery via OpenStreetMap | Nominatim geocoding + Overpass API (no API key) |
| HOTEL-02 | Save & track hotel prospects | `hotels_saved` table with status workflow |
| HOTEL-03 | Visit timeline per hotel | Drop-in, phone call, scheduled meeting, email logs |
| HOTEL-04 | BDR route planning | Named routes with sequenced stops + completion tracking |
| HOTEL-05 | AI fit scoring | 16-point rubric scoring property suitability for robotics |
| HOTEL-06 | Rooms/ADR estimation | Brand-median lookup for unknown properties |
| HOTEL-07 | Graduate to prospect | Promote saved hotel → `prospects` table with `prospect_id` FK |
| HOTEL-08 | Triage mobile app | Standalone mobile view for field reps |
| HOTEL-09 | Submarket filtering | City-level geographic filtering |

**Files:** `src/routes/hotel-research.js` (2241 lines), `pages/hotel-research.html`, `pages/triage.html`, `src/services/fit-score.js`

### 2.5 Enterprise Risk Management

| ID | Requirement | Implementation |
|----|-------------|----------------|
| ERM-01 | Risk register with categories | strategic, operational, financial, technology, legal, reputation |
| ERM-02 | Inherent vs residual scoring | likelihood x impact (1-5 each, max 25) |
| ERM-03 | Auto risk band calculation | low (1-4), moderate (5-9), high (10-15), critical (16-25) |
| ERM-04 | Trend tracking | rising / stable / falling per risk |
| ERM-05 | Mitigation tracking | Concrete action items per risk with delta value |
| ERM-06 | Review cadence + overdue alerts | Review dates tracked, overdue flagged on dashboard |
| ERM-07 | Heat map dashboard | Color-coded grid by likelihood x impact |
| ERM-08 | Audit history per risk | Every change logged with timestamp |

**Files:** `src/routes/risk-management.js` (515 lines), `pages/risk-management.html`

### 2.6 Project Tracker (Sprint Planning)

| ID | Requirement | Implementation |
|----|-------------|----------------|
| TRACK-01 | Sprint-based planning | Named sprints with start/end dates |
| TRACK-02 | 3-level hierarchy | Project → Task → Subtask |
| TRACK-03 | Gantt view | Start/end dates with visual timeline |
| TRACK-04 | People assignment | Owner + support team per item |
| TRACK-05 | Status workflow | not_started → in_progress → blocked → complete |
| TRACK-06 | Verification gate | `needs_verification` flag + note before marking complete |
| TRACK-07 | Milestone markers | `is_milestone` flag for key deliverables |

**Files:** `src/routes/tracker.js` (480 lines), `public/admin-project-tracker.html`

### 2.7 Prospect Pipeline

| ID | Requirement | Implementation |
|----|-------------|----------------|
| PROSPECT-01 | Market definitions with geography | Clusters, lat/lng, color coding |
| PROSPECT-02 | Prospect status workflow | staged → confirmed |
| PROSPECT-03 | Brand classification | luxury, soft, chain, independent |
| PROSPECT-04 | Map visualization | Leaflet map with color-coded dots |
| PROSPECT-05 | Source tracking | ai_research vs manual entry |

**Files:** `src/routes/prospects.js`, `src/routes/markets.js`, `pages/pipeline-prospects.html`

### 2.8 AI Proposal Generation

| ID | Requirement | Implementation |
|----|-------------|----------------|
| NARRATE-01 | AI-generated proposal narrative | Anthropic Claude API → HTML output |
| NARRATE-02 | Rate-limited public endpoint | 10 requests/hour per IP |
| NARRATE-03 | Embedded proposal templates | Sibling repo content (thesis-hotel, etc.) |

**Files:** `src/routes/narrate.js`, `pages/proposal.html`

### 2.9 Feedback & Improvement Tracking

| ID | Requirement | Implementation |
|----|-------------|----------------|
| FB-01 | Public bug/feature reports | No auth required, rate-limited |
| FB-02 | Screenshot capture | Up to 6 files, 8MB each, BLOB storage |
| FB-03 | Triage workflow | new → triaged → in_progress → resolved → wontfix |
| IR-01 | Public improvement requests | Submit + track status publicly |
| IR-02 | Admin assignment + prioritization | Category, priority, assigned_to, status workflow |
| IR-03 | Cross-post from feedback | Bug/feature reports auto-create improvement request |

**Files:** `src/routes/feedback.js`, `src/routes/improvement-requests.js`, `pages/feedback.html`, `pages/improvement-request.html`

### 2.10 Collaboration Bulletin Board

| ID | Requirement | Implementation |
|----|-------------|----------------|
| COLLAB-01 | Cross-team help requests | 6 types: feature, tool, integration, doc, design, other |
| COLLAB-02 | Claim-and-track workflow | open → claimed → in_progress → done → archived |
| COLLAB-03 | Auto-archive stale tickets | 30+ day idle → auto-archived on server boot |
| COLLAB-04 | Security flagging | Keyword detection for hazard-styled display |
| COLLAB-05 | Optional attribution | softAuth — logged-in users get credit, anonymous OK |

**Files:** `src/routes/collab.js`, `pages/collab.html`

### 2.11 Glossary Game (Gamification)

| ID | Requirement | Implementation |
|----|-------------|----------------|
| GAME-01 | Quiz sessions with 10-min TTL | In-memory session store, server-side validation |
| GAME-02 | Server-awarded points | Client cannot fake scores |
| GAME-03 | Leaderboard | total_points, level, streak tracking |
| GAME-04 | Badge system | Achievement unlocks (stored as JSON array) |
| GAME-05 | Activity audit trail | Every point award logged for potential Axomo/Nectar integration |

**Files:** `src/routes/glossary-game.js`, `pages/team-glossary.html`, `data/glossary-terms.js`

### 2.12 WhatsApp Hub

| ID | Requirement | Implementation |
|----|-------------|----------------|
| WA-01 | Curated group directory | Manual entry (no WhatsApp API) |
| WA-02 | Categories + pinning | team, project, customer, community, other |
| WA-03 | Invite link management | Direct links to WhatsApp group invites |

**Files:** `src/routes/whatsapp.js`, `pages/whatsapp-hub.html`

### 2.13 Elevator Integration Toolkit

| ID | Requirement | Implementation |
|----|-------------|----------------|
| ELEV-01 | Button emulator simulator | Interactive relay-parallel wiring demo |
| ELEV-02 | TAC32T reference docs | ThyssenKrupp control system guide |
| ELEV-03 | Installation guide | Step-by-step with photos |

**Files:** `public/elevator-button-emulator.html`, `public/elevator-install-guide.html`, `public/elevator-integration.html`

### 2.14 Additional Modules

| Module | Purpose | Files |
|--------|---------|-------|
| Financial Analysis | Stock ticker + portfolio view | `src/routes/stocks.js`, `public/financial-analysis.html` |
| Investor CRM | Investor relationship tracking | `pages/investor-crm.html` |
| National Rollout Strategy | Multi-market expansion planning | `pages/national-rollout-strategy.html` |
| Robot Catalog | Product database + specs | `pages/robot-catalog.html` |
| Fleet Designer | Robot fleet composition planner | `pages/fleet-designer.html` |
| Print Label | Headless Chrome PDF → lp printer | `src/routes/print-label.js` |
| Creative Labs Proxy | Robot command feed via tunnel | `src/routes/creative-labs-proxy.js` |

---

## 3. Non-Functional Requirements

### 3.1 Security

| ID | Requirement | Implementation |
|----|-------------|----------------|
| SEC-01 | JWT in httpOnly cookie | `sameSite: strict`, `secure: true` in production |
| SEC-02 | Bcrypt password hashing | 12 rounds |
| SEC-03 | Rate limiting on public endpoints | 5-10 requests/hour per IP |
| SEC-04 | CSP headers via Helmet | Strict Content-Security-Policy |
| SEC-05 | Input validation on all routes | Length limits, enum whitelists, type checks |
| SEC-06 | HTML escaping | `escapeHtml()` on all user-generated content |
| SEC-07 | No secrets in git | `.env` gitignored, secrets in Render dashboard |

### 3.2 Performance

| ID | Requirement | Implementation |
|----|-------------|----------------|
| PERF-01 | Stock data cached 15 minutes | Avoids Yahoo Finance rate limits |
| PERF-02 | Geocoding cached 24 hours | Avoids Nominatim rate limits |
| PERF-03 | Hotel search cached 6 hours | Overpass API throttling |
| PERF-04 | 500-row query limits | All list endpoints capped |
| PERF-05 | No-store on HTML pages | Browser always gets fresh content after deploy |

### 3.3 Reliability

| ID | Requirement | Implementation |
|----|-------------|----------------|
| REL-01 | Fire-and-forget email | Email failures don't block responses |
| REL-02 | Best-effort activity logging | Log failures are non-fatal |
| REL-03 | Graceful schema migration | `IF NOT EXISTS` guards, additive ALTERs |
| REL-04 | Auto-deploy on push to main | Render `autoDeploy: true` |

---

## 4. System Workflow Diagrams

### 4.1 Authentication Flow

```
User → GET /admin-login
  ├─ Already logged in? → checkAuth() → redirect /admin
  └─ Not logged in → Show login form
       ├─ POST /api/auth/login (email + password)
       │   ├─ 401: Invalid credentials → show error
       │   └─ 200: Set httpOnly cookie → redirect /admin
       └─ Forgot password? → GET /forgot-password
            └─ POST /api/auth/forgot-password → email with reset link
                 └─ GET /reset-password?token=... → set new password
```

### 4.2 Deal Lifecycle

```
Lead Inquiry (public form)
  │
  ▼
Inquiry Received ──── Email notification to recipients
  │
  ▼
Deal Created (admin)
  │  facility_id linked
  │  contacts + challenges added
  │
  ▼
Pipeline Stages:
  lead → qualified → site_walk → configured → proposed → negotiation
  │                      │
  │                      ▼
  │              Site Assessment
  │                (zones, photos, stakeholders)
  │                      │
  │                      ▼
  │              Assessment PDF
  │
  ▼
  won → deploying → active        OR        lost
  │                                           │
  ▼                                           ▼
  closed_at set                        closed_at set
  value_total logged                   reason in notes
```

### 4.3 Hotel Research → Prospect Pipeline

```
Sales Rep opens Hotel Research Tool
  │
  ▼
Search by city/zip (OSM Nominatim geocoding)
  │
  ▼
Overpass API returns hotels in radius
  │
  ▼
Rep saves interesting hotels → hotels_saved table
  │   ├─ AI fit scoring (16-point rubric)
  │   ├─ ADR estimation (brand medians)
  │   └─ Brand classification
  │
  ▼
Field Activity:
  ├─ BDR Route planned (sequenced stops)
  ├─ Drop-in / phone call / scheduled meeting
  └─ Visit logged → hotel_visits table
  │
  ▼
Graduate hotel → prospects table
  │   prospect_id linked back to hotels_saved
  │
  ▼
Prospect Pipeline (staged → confirmed)
  │
  ▼
Create Deal (links to facility + prospect)
```

### 4.4 Site Assessment Flow

```
Admin creates assessment (linked to deal)
  │
  ▼
Field rep opens assessment on mobile/tablet
  │
  ├─ Add zones (lobby, kitchen, pool deck, etc.)
  │   ├─ Floor surfaces, ceiling height, WiFi strength
  │   ├─ Cleaning method, frequency, contractor
  │   ├─ Robot readiness (ready/minor_work/major_work/not_feasible)
  │   └─ Photos per zone (BLOB upload)
  │
  ├─ Add stakeholders (decision maker, champion, blocker)
  │
  └─ Save (offline-first: full-state upsert with client UUID)
  │
  ▼
Assessment synced → status: completed
  │
  ▼
Generate PDF report (GET /api/assessments/:id/pdf)
  │
  ▼
Share with prospect / attach to proposal
```

### 4.5 User Onboarding Flow

```
Super Admin → POST /api/users/invite
  │   email, name, role, module permissions
  │
  ▼
Resend sends invite email with token link
  │   Token: 32-byte random hex, 24h expiry
  │
  ▼
New user clicks link → GET /accept-invite?token=...
  │
  ▼
Validate token → show password form
  │
  ▼
POST /api/auth/accept-invite
  │   Set password (bcrypt 12 rounds)
  │   Status: invited → active
  │   Auto-login: JWT cookie set
  │
  ▼
Redirect to /admin (Command Center)
```

### 4.6 Risk Management Flow

```
CEO/Admin creates risk
  │   category, description, likelihood, impact
  │   owner, mitigation strategy
  │
  ▼
System auto-calculates:
  │   inherent_score = likelihood × impact
  │   inherent_band = low/moderate/high/critical
  │   residual_score = residual_likelihood × residual_impact
  │   residual_band
  │   mitigation_delta = inherent_score - residual_score
  │
  ▼
Dashboard renders:
  │   Heat map (likelihood × impact grid)
  │   Top risks by residual score
  │   Trend indicators (rising/stable/falling)
  │   Overdue review alerts
  │
  ▼
Review cycle:
  │   POST /api/risk-management/risks/:id/review
  │   Logs review touchpoint in history
  │
  ▼
Risk lifecycle: active → mitigated → closed
```

### 4.7 Command Center (Master Dashboard)

```
GET /admin → admin-command-center.html
  │
  ├─ Velocity Hero (deal pipeline summary)
  ├─ Workflow Pipeline (stage funnel)
  ├─ Community Board (collab requests)
  ├─ Deal Map (Leaflet US map with prospects)
  ├─ Regional Maps (cluster view)
  ├─ Project Hub (sprint tracker summary)
  ├─ Productivity Calendar (activity heatmap)
  ├─ Toolkit Grid (module cards with activity LEDs)
  ├─ Activity Feed (recent deal events)
  └─ Risk Overview (if ERM module active)

Each section loads data independently via fetch()
Toolkit cards are permission-gated (hidden if no access)
Activity LEDs pulse based on 24h event count per module
```

---

## 5. Data Flow Architecture

```
                    ┌──────────────┐
                    │   Browser    │
                    │  (Vanilla JS)│
                    └──────┬───────┘
                           │ HTTPS
                    ┌──────▼───────┐
                    │   Render.com │
                    │  (Node 24)   │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
       ┌──────▼──────┐ ┌──▼──┐  ┌──────▼──────┐
       │   Express   │ │Helmet│  │ Rate Limiter │
       │   Router    │ │ CSP  │  │  (5-10/hr)   │
       └──────┬──────┘ └─────┘  └──────────────┘
              │
    ┌─────────┼─────────┐
    │         │         │
┌───▼──┐ ┌───▼──┐ ┌────▼───┐
│ Auth │ │Routes│ │ Static │
│Middle│ │(API) │ │ Files  │
└───┬──┘ └───┬──┘ └────────┘
    │         │
    │    ┌────▼────┐
    │    │Services │
    │    │(business│
    │    │ logic)  │
    │    └────┬────┘
    │         │
    └────┬────┘
         │
  ┌──────▼──────┐     ┌─────────┐     ┌──────────┐
  │   libsql    │     │ Resend  │     │ Anthropic│
  │  (SQLite/   │     │ (Email) │     │ (Claude  │
  │   Turso)    │     │         │     │  API)    │
  └─────────────┘     └─────────┘     └──────────┘
                                       
  ┌─────────────┐     ┌─────────┐
  │ OpenStreet  │     │  Yahoo  │
  │  Map APIs   │     │ Finance │
  └─────────────┘     └─────────┘
```

---

## 6. API Endpoint Summary

### Public (No Auth, Rate-Limited)
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/forgot-password` | Request password reset |
| POST | `/api/auth/accept-invite` | Set password + activate |
| POST | `/api/inquiries` | Submit lead inquiry |
| POST | `/api/feedback` | Submit bug/feature report |
| POST | `/api/collab` | Submit help request |
| POST | `/api/improvement-requests` | Submit improvement idea |
| GET | `/api/improvement-requests` | View tracking board |

### Authenticated (JWT Required)
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/auth/me` | Current user + permissions |
| GET/POST/PATCH/DELETE | `/api/deals/*` | Deal CRUD |
| GET/POST/PATCH | `/api/facilities/*` | Facility CRUD |
| GET/POST/PATCH | `/api/assessments/*` | Assessment CRUD |
| POST/GET/DELETE | `/api/assessments/:id/photos` | Photo management |
| GET | `/api/assessments/:id/pdf` | PDF generation |
| GET/POST/PATCH/DELETE | `/api/prospects/*` | Prospect CRUD |
| GET/POST/PATCH | `/api/markets/*` | Market CRUD |
| POST | `/api/narrate` | AI proposal generation |
| GET/POST/PATCH | `/api/tracker/*` | Sprint planning |
| GET/POST/PATCH/DELETE | `/api/users/*` | User management |
| GET/PATCH | `/api/roles` | Permission matrix |
| GET/POST/PATCH/DELETE | `/api/risk-management/*` | Risk register |
| GET/POST/PATCH/DELETE | `/api/hotel-research/*` | Hotel prospecting |
| GET/POST | `/api/glossary-game/*` | Quiz + leaderboard |
| GET/POST/PATCH/DELETE | `/api/whatsapp/*` | Group directory |
| GET/POST | `/api/activities` | Deal timeline |
| GET/POST/PUT | `/api/system-settings` | Runtime config |

---

## 7. Environment & Deployment

### Required Environment Variables
| Variable | Required | Purpose |
|----------|----------|---------|
| `DATABASE_URL` | Yes | libsql connection string |
| `JWT_SECRET` | Yes (prod) | 64-char hex for token signing |
| `ADMIN_EMAIL` | Yes | Seed admin account |
| `ADMIN_PASSWORD` | Yes | Seed admin password |
| `RESEND_API_KEY` | Yes | Transactional email |
| `EMAIL_FROM` | Yes | Sender address |
| `ANTHROPIC_API_KEY` | Optional | AI proposal generation |
| `NREL_API_KEY` | Optional | EV charger data enrichment |

### Deployment Pipeline
```
git push origin main
       │
       ▼
Render auto-deploy (autoDeploy: true)
       │
       ├─ npm install
       ├─ node src/server.js
       │   ├─ Schema init (CREATE TABLE IF NOT EXISTS)
       │   ├─ Seed admin user
       │   ├─ Bootstrap admin roles
       │   ├─ Seed role permissions
       │   ├─ Seed deals (if empty)
       │   └─ AI fit score boot pass
       │
       ▼
Health check: GET / → 200
       │
       ▼
Live at https://accelerate-robotics.onrender.com
Custom domain: https://acceleraterobotics.ai
```

---

## 8. Database Table Count & Relationships

**Total tables:** 28

**Key relationships:**
- `deals` → `facilities` (1:1 via facility_id)
- `deals` → `activities` (1:many)
- `assessments` → `deals` (1:1 via deal_id)
- `assessments` → `assessment_zones` (1:many, CASCADE)
- `assessments` → `assessment_stakeholders` (1:many, CASCADE)
- `assessments` → `assessment_photos` (1:many, CASCADE)
- `prospects` → `markets` (many:1 via market_id)
- `hotels_saved` → `hotel_visits` (1:many, CASCADE)
- `hotels_saved` → `prospects` (1:1 via prospect_id after graduation)
- `bdr_routes` → `bdr_route_stops` (1:many, CASCADE)
- `tracker_items` → `tracker_items` (self-referential parent_id)
- `tracker_items` → `tracker_sprints` (many:1)
- `feedback` → `feedback_screenshots` (1:many, CASCADE)
- `admin_users` → `user_permissions` (1:many)
