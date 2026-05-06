# Facility Assessment Toolkit — Design Spec

## Overview

An iPad-optimized, offline-first facility assessment tool for Accelerate Robotics field reps. Used during site walks to capture detailed property data — physical layout, infrastructure, operations, staffing, pain points, photos — that feeds directly into the Fleet Designer and proposal pipeline.

**Primary users:** Trained sales/ops reps (Cory, Tyler, David, Eric, Lydia, JB, Ben) — not robotics experts.

**When in process:** Pre-proposal. The assessment is the first structured data capture for a potential deal. Its output auto-populates Fleet Designer and generates a branded PDF report for stakeholders.

**Facility type scope:** Hotel-only for V1. Data model includes `facility_type` field from day one so hospital/commercial/arena templates can be added later without schema changes.

---

## Architecture

Single self-contained HTML page (`pages/assessment.html`) following the same pattern as `fleet-designer.html` and `proposal.html` — no build step, no framework, embedded CSS/JS.

- **Offline storage:** localStorage for form data (auto-save every 30s), IndexedDB for photos (handles hundreds of MBs)
- **Sync:** Manual sync button pushes assessment JSON + photos to server when online. Last-write-wins conflict resolution via `updated_at` timestamps.
- **Backend:** New Express routes at `/api/assessments` for CRUD + sync + PDF generation
- **Database:** Four new tables in SQLite (`assessments`, `assessment_zones`, `assessment_stakeholders`, `assessment_photos`)
- **PDF:** Server-side generation via PDFKit (Node.js native, no external dependencies)
- **Pipeline:** `GET /api/assessments/:id/fleet-input` returns assessment data shaped for Fleet Designer consumption

---

## Data Model

### `assessments` table

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUID, generated client-side for offline support |
| deal_id | TEXT | FK to deals table (nullable — can assess without a deal) |
| facility_type | TEXT NOT NULL | 'hotel' for V1. Future: 'hospital', 'commercial', 'arena' |
| property_name | TEXT NOT NULL | |
| property_address | TEXT | |
| property_type | TEXT | e.g., 'boutique_hotel', 'resort', 'full_service' |
| rooms | INTEGER | Key/room count |
| floors | INTEGER | |
| elevators | INTEGER | |
| elevator_make | TEXT | e.g., 'ThyssenKrupp TAC32T' |
| year_built | INTEGER | |
| last_renovation | INTEGER | |
| gm_name | TEXT | General Manager |
| gm_email | TEXT | |
| gm_phone | TEXT | |
| engineering_contact | TEXT | Head of Engineering / Facilities |
| engineering_email | TEXT | |
| fb_director | TEXT | F&B Director |
| fb_outlets | INTEGER | Number of restaurants/bars |
| event_space_sqft | INTEGER | |
| union_status | TEXT | 'union', 'non_union', 'mixed' |
| union_details | TEXT | Which departments, which local |
| assigned_to | TEXT NOT NULL | Team member name |
| status | TEXT NOT NULL DEFAULT 'draft' | 'draft', 'in_progress', 'completed', 'synced' |
| notes | TEXT | General notes |
| created_at | TEXT NOT NULL | ISO 8601 timestamp |
| updated_at | TEXT NOT NULL | ISO 8601 timestamp |
| synced_at | TEXT | NULL until pushed to server |

### `assessment_zones` table

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUID |
| assessment_id | TEXT NOT NULL | FK → assessments.id, ON DELETE CASCADE |
| zone_type | TEXT NOT NULL | See zone template list below |
| zone_name | TEXT NOT NULL | User-provided label (e.g., "3rd Floor East Wing") |
| floor_number | INTEGER | |
| floor_surfaces | TEXT | JSON array: e.g., '["carpet","hardwood"]' |
| corridor_width_ft | REAL | Measured or estimated |
| ceiling_height_ft | REAL | |
| door_width_min_ft | REAL | Narrowest door in zone |
| wifi_strength | TEXT | 'strong', 'moderate', 'weak', 'none' |
| wifi_network | TEXT | SSID if known |
| lighting | TEXT | 'bright', 'moderate', 'dim' |
| foot_traffic | TEXT | 'high', 'moderate', 'low' |
| current_cleaning_method | TEXT | How floors are cleaned today |
| cleaning_frequency | TEXT | 'daily', '2x_daily', 'weekly', etc. |
| cleaning_contractor | TEXT | In-house or contractor name |
| cleaning_shift | TEXT | When cleaning happens (e.g., 'overnight 11pm-6am') |
| delivery_method | TEXT | How items move through this zone today |
| staffing_notes | TEXT | Who works here, what shifts |
| pain_points | TEXT | What's broken / what they complain about |
| robot_readiness | TEXT | 'ready', 'minor_work', 'major_work', 'not_feasible' |
| readiness_notes | TEXT | What work is needed for robot readiness |
| notes | TEXT | |
| sort_order | INTEGER NOT NULL DEFAULT 0 | Tab ordering |

**Zone types (V1 hotel templates):** `lobby`, `restaurant`, `guest_floor`, `pool_deck`, `kitchen`, `laundry`, `boh_corridor`, `parking_garage`, `event_space`, `fitness_center`, `spa`, `exterior`, `other`

### `assessment_stakeholders` table

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUID |
| assessment_id | TEXT NOT NULL | FK → assessments.id, ON DELETE CASCADE |
| name | TEXT NOT NULL | |
| title | TEXT | Job title |
| department | TEXT | |
| role | TEXT NOT NULL | 'decision_maker', 'influencer', 'champion', 'blocker', 'technical' |
| email | TEXT | |
| phone | TEXT | |
| notes | TEXT | |
| sort_order | INTEGER NOT NULL DEFAULT 0 | |

### `assessment_photos` table

| Column | Type | Notes |
|---|---|---|
| id | TEXT PK | UUID |
| assessment_id | TEXT NOT NULL | FK → assessments.id, ON DELETE CASCADE |
| zone_id | TEXT | FK → assessment_zones.id (nullable for property-level photos) |
| checklist_item | TEXT | Which suggested shot this fulfills (nullable for freeform) |
| photo_data | BLOB | Full image data (uploaded on sync, stored in IndexedDB client-side) |
| thumbnail | TEXT | Small base64 thumbnail for list views |
| annotations | TEXT | JSON array of annotation objects (pins, arrows, labels) |
| caption | TEXT | |
| taken_at | TEXT NOT NULL | ISO 8601 timestamp |

---

## Tab Structure

### Property-Level Tabs (always present)

**Overview tab:**
- Property basics: name, address, type (dropdown), rooms, floors, elevators, elevator make, year built, last renovation
- Contacts: GM (name/email/phone), Engineering contact (name/email), F&B Director
- F&B outlets count, event space sqft
- Union status (toggle: union / non-union / mixed) + details field

**Stakeholders tab:**
- Editable grid/list of people involved in the deal
- Per person: Name, Title, Department, Role (Decision Maker / Influencer / Champion / Blocker / Technical), Email, Phone, Notes
- "Add Stakeholder" button to add rows
- Inspired by Atlas SPHM org chart — captures who signs, who blocks, who champions

**Operations tab:**
- Shift structure: number of shifts, shift times, staffing levels per shift
- Contracted services table: Service type (cleaning, security, laundry, landscaping, pest control), vendor name, annual cost, contract end date, satisfaction rating
- Current automation: any existing robots, smart systems, or automated equipment
- Property-level pain points: free text

**Infrastructure tab:**
- WiFi: coverage rating per area, network name, bandwidth if known, IT contact
- Elevator inventory: per elevator — make, model, age, floors served, API/integration access (yes/no/unknown), notes
- Power: available outlets in potential charging locations, dedicated circuit availability
- Storage: potential robot docking/charging room locations, dimensions
- Network: cellular coverage strength, backup connectivity

### Zone Tabs (added dynamically)

Each zone tab contains:

1. **Zone details form** — fields specific to the zone template (see Zone Templates section)
2. **Photo checklist** — suggested shots with checkboxes, plus "Add Photo" for extras
3. **Pain Points** — free text about what's broken in this zone
4. **Robot Readiness** — rating selector (Ready / Minor Work / Major Work / Not Feasible) + notes
5. **Assessor Notes** — anything else

The rep can add **multiple instances** of any zone type (e.g., three Guest Floors, two Restaurants).

---

## Zone Templates

Each template pre-populates zone-specific form fields and a photo checklist.

### Lobby
- Fields: floor surface, area sqft, corridor width to elevators, front desk proximity, bellhop station, luggage storage location, hours of peak traffic
- Photo checklist: wide lobby shot, floor surface close-up, entrance/exit paths, path to elevators, any obstacles/thresholds, front desk area

### Restaurant / Bar
- Fields: name, seating capacity, kitchen proximity, service style (plated/buffet/room service origin), hours, peak meal times, current delivery method (trays/carts/runners)
- Photo checklist: dining room layout, kitchen pass/window, server station, path from kitchen, host stand, any steps/thresholds

### Guest Floor
- Fields: floor number, room count on floor, corridor width, floor surface, ice/vending locations, linen closet location, elevator distance from furthest room, housekeeping cart staging
- Photo checklist: corridor width shot, floor surface, linen closet, elevator landing, ice/vending area, housekeeping staging

### Pool Deck
- Fields: surface type, covered/uncovered, furniture layout description, towel station, F&B service (yes/no, from where), hours, fencing/access control
- Photo checklist: deck overview, surface close-up, path from building, towel station, F&B service point, gate/access point

### Kitchen
- Fields: size sqft, floor surface, number of stations, walk-in locations, dish pit location, service window location, grease trap locations
- Photo checklist: floor surface, main aisle width, service window/pass, path to dining room, loading dock access

### Laundry
- Fields: in-house or outsourced, volume (lbs/day), equipment list, linen flow path description, cart type and count, storage staging area
- Photo checklist: room overview, equipment, cart staging, path to elevator/floors, storage area

### BOH Corridor
- Fields: width, floor surface, what gets moved through (linen, food, trash, supplies), traffic direction, peak traffic times
- Photo checklist: corridor width shot, floor surface, any pinch points/turns, door clearances, ramp/grade changes

### Parking Garage
- Fields: levels, surface type, lighting quality, current cleaning method/frequency, EV stations, traffic pattern
- Photo checklist: driving lane width, surface condition, trash/debris areas, lighting, EV station area, entrance/exit ramps

### Event Space
- Fields: name, square footage, floor surface, max capacity, setup/teardown frequency, AV equipment, storage room, loading dock access
- Photo checklist: room overview, floor surface, loading path from dock, storage area, AV setup, entry doors

### Fitness Center
- Fields: hours, square footage, floor surface, equipment count, towel service, current cleaning method
- Photo checklist: room overview, floor surface, entry path, towel station

### Spa
- Fields: services offered, treatment room count, floor surface, linen volume estimate, hours
- Photo checklist: corridor, floor surface, linen storage, treatment room entry width

### Exterior / Grounds
- Fields: walkway surface types, landscaping scope, lighting quality, parking lot area, sidewalk condition, any grade changes/slopes
- Photo checklist: main walkways, surface conditions, grade changes, lighting, parking lot surface

### Other
- Fields: custom name, free-form description, floor surface, dimensions, general notes
- Photo checklist: generic (overview, floor surface, access path) + unlimited freeform

---

## Photo Capture & Annotation

### Capture Flow
1. Tap camera icon on a checklist item or the "Add Photo" button
2. Native camera opens via `<input type="file" accept="image/*" capture="environment">`
3. Photo appears in the zone's photo grid (3 columns) with checklist label auto-attached
4. Photo is immediately saved to IndexedDB with a generated thumbnail

### Annotation Flow
1. Tap any photo in the grid to open the annotation overlay
2. Photo fills the screen with a bottom toolbar: **Pin**, **Arrow**, **Line** (with measurement label input), **Text Label**
3. Tap the photo to place the selected tool at that point
4. Each annotation is a JSON object: `{ type: 'pin'|'arrow'|'line'|'text', x, y, x2?, y2?, label?, color? }`
5. Annotations render as an SVG overlay on top of the photo (original image untouched)
6. Pinch to zoom, drag to pan the photo underneath
7. Tap an existing annotation to edit or delete it
8. "Done" closes the overlay and saves the annotation array

### Storage
- Photos stored in IndexedDB as Blobs (not base64 in localStorage — too large)
- Thumbnails generated client-side via Canvas API (200px wide) and stored alongside
- On sync, photos upload to server in batches (5 at a time) to avoid timeout
- Server stores photos as BLOBs in SQLite (acceptable for V1 volume — dozens of photos per assessment, not thousands)

---

## UI Layout

### Header (fixed)
- Left: Accelerate logo + property name (editable inline)
- Center: Assigned rep name + status badge (Draft → In Progress → Completed)
- Right: Auto-save indicator ("Saved locally 30s ago") + Sync button

### Sync Button States
- **Green pulse**: Online, ready to sync
- **Grey**: Offline — data saves locally, sync when reconnected
- **Blue spinner**: Syncing in progress
- **Green check**: Synced successfully (with timestamp)
- **Red warning**: Sync failed — tap for details, retry

### Tab Bar (sticky, horizontally scrollable)
- Property tabs: Overview | Stakeholders | Operations | Infrastructure
- Divider
- Zone tabs: [icon + name] for each added zone
- "+ Add Zone" button (always visible at far right)
- Each tab shows completion indicator: empty circle (untouched), half-filled (partial), green filled (complete)
- Zone tabs have a small x to remove (with "Delete this zone?" confirmation)

### Form Fields
- Minimum 44px touch target height (Apple Human Interface Guidelines)
- Toggle switches instead of checkboxes
- Native `<select>` for dropdowns (avoids custom dropdown issues on iPad Safari)
- Text areas auto-expand
- Number inputs use `inputmode="numeric"` for numeric keyboard on iPad
- Sections within a tab use collapsible headers to reduce scroll length

### Color Scheme
- Base: same dark theme as fleet-designer (--bg: #0a0a0f)
- **Accent: amber/gold (#f59e0b)** — visually distinguishes assessment from fleet designer (cyan) and proposal (green)
- Robot readiness indicators: green (#00e676) = ready, amber (#f59e0b) = minor work, red (#ef4444) = major work, grey (#6b7280) = not feasible
- Completion dots on tabs: same green/amber/grey scheme

---

## Offline Architecture

### Auto-Save (localStorage)
- Every 30 seconds and on every tab switch, the full assessment state (minus photos) serializes to localStorage under key `assessment_draft_{id}`
- On page load, check localStorage for any draft — prompt to resume or start fresh
- Draft list page shows all locally-saved assessments with status

### Photo Storage (IndexedDB)
- Database name: `accelerate_assessments`
- Object store: `photos` — keyed by photo UUID
- Each entry: `{ id, assessmentId, zoneId, blob, thumbnail, annotations, caption, checklistItem, takenAt }`
- IndexedDB handles hundreds of MBs — well within iPad limits for dozens of site photos

### Sync Protocol
1. User taps Sync button (only available when online — check `navigator.onLine`)
2. POST `/api/assessments` with the full assessment JSON (no photos)
3. Server responds with `201` or `200` (upsert by UUID)
4. Then POST `/api/assessments/:id/photos` in batches of 5
5. Each batch: multipart form data with photo blob + metadata JSON
6. On success, update `synced_at` in localStorage
7. On partial failure: mark which photos synced, retry only unsynced ones
8. Conflict resolution: `updated_at` comparison, last-write-wins

### Offline Indicators
- Network status listener: `window.addEventListener('online'/'offline')`
- Sync button appearance changes based on state
- Toast notification on connectivity change: "You're offline — changes save locally" / "You're back online — tap Sync to upload"

---

## Assessment → Fleet Designer Pipeline

### Auto-Population Flow
1. User opens Fleet Designer for a deal that has a linked assessment
2. Fleet Designer calls `GET /api/assessments/:id/fleet-input`
3. Endpoint returns:
```json
{
  "property": {
    "name": "Thesis Hotel",
    "type": "boutique_hotel",
    "rooms": 69,
    "floors": 10,
    "elevators": 2,
    "market": "Miami"
  },
  "facility": {
    "surfaces": ["carpet", "hardwood", "tile"],
    "outdoorAmenities": ["pool_deck"],
    "fbOutlets": 2,
    "eventSpaceSqFt": 1500,
    "elevatorMake": "ThyssenKrupp TAC32T"
  },
  "suggestedGoals": [
    { "goalId": "carpet_cleaning", "reason": "3 guest floors with carpet, robot-ready corridors" },
    { "goalId": "food_runner", "reason": "Restaurant reports delivery pain point, kitchen 200ft from dining" }
  ],
  "zones": [
    { "type": "lobby", "readiness": "ready", "surfaces": ["marble"] },
    { "type": "guest_floor", "readiness": "ready", "surfaces": ["carpet"] }
  ]
}
```
4. Fleet Designer pre-fills property fields and highlights suggested goals (user can override)

### Goal Suggestion Logic
Zone data maps to fleet goals:
- Guest floor with carpet + readiness 'ready' or 'minor_work' → suggest `carpet_cleaning`
- Guest floor with hard floor → suggest `hard_floor_cleaning`
- Restaurant zone with delivery pain point → suggest `food_runner` or `room_service`
- Laundry zone with high volume → suggest `linen_transport`
- Pool deck zone → suggest `pool_deck_cleaning`
- Parking garage zone → suggest `parking_sweep`
- Lobby with hard floor → suggest `lobby_hard_floor`
- Multiple restaurant zones → suggest `small_item_delivery`

---

## PDF Report

### Generation
- Server-side via PDFKit: `GET /api/assessments/:id/pdf`
- Returns a downloadable PDF with `Content-Disposition: attachment`
- Also accessible from the assessment page via "Download PDF" button

### PDF Structure
1. **Cover page**: Accelerate Robotics logo, property name, address, assessment date, assessor name, "Confidential — Prepared for [property name]"
2. **Executive Summary** (1 page): Property overview table (rooms, floors, elevators, year built), key contacts, overall robot readiness summary
3. **Stakeholder Map** (1 page): Grid of stakeholders with roles
4. **Operations Summary** (1 page): Shift structure, contracted services table with costs, union status
5. **Infrastructure Summary** (1 page): WiFi coverage, elevator inventory table, charging/storage assessment
6. **Zone Assessments** (1-2 pages per zone):
   - Zone name, type, floor number
   - Key metrics table (surface, dimensions, traffic, current methods)
   - Robot readiness rating with color indicator
   - Pain points
   - Photo thumbnails with captions (annotations baked into the rendered image)
   - Assessor notes
7. **Recommendations** (1 page): Auto-generated based on readiness scores
   - Deployment-ready zones (green)
   - Zones needing prep work (amber) with what's needed
   - Not-feasible zones (red) with reasons
   - Suggested pilot zone (highest readiness + highest impact)
8. **Appendix**: Full photo gallery with larger images

### Branding
- Header: Accelerate Robotics logo + "Facility Assessment Report"
- Footer: page numbers + "Confidential" + date
- Colors: dark background pages for cover/section dividers, white background for content pages
- Font: Helvetica (PDFKit built-in)

---

## API Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/assessments` | requireAuth | List all assessments (with filters: assigned_to, status, deal_id) |
| GET | `/api/assessments/:id` | requireAuth | Get full assessment with zones |
| POST | `/api/assessments` | requireAuth | Create or upsert assessment (by UUID) |
| PUT | `/api/assessments/:id` | requireAuth | Update assessment |
| DELETE | `/api/assessments/:id` | requireAuth | Delete assessment and all zones/photos |
| POST | `/api/assessments/:id/photos` | requireAuth | Upload photos (multipart, batch of up to 5) |
| GET | `/api/assessments/:id/photos` | requireAuth | List photo metadata for an assessment |
| GET | `/api/assessments/:id/photos/:photoId` | requireAuth | Get single photo with data |
| GET | `/api/assessments/:id/fleet-input` | requireAuth | Get assessment data shaped for Fleet Designer |
| GET | `/api/assessments/:id/pdf` | requireAuth | Generate and download PDF report |

---

## Team Assignment

The assessment page has an "Assigned To" dropdown populated with the team list:
- Cory
- Tyler
- David
- Eric
- Lydia
- JB
- Ben

This is a hardcoded list for V1. Future: pull from a `team_members` table.

The assignment is set when creating a new assessment and can be changed at any time. The assessment list page can filter by assignee.

---

## Assessment List Page

A simple list/dashboard page (`pages/assessments.html`) showing all assessments:
- Table/card view with: property name, type, assigned to, status, zones count, photos count, last updated, sync status
- Filter by: assigned to, status
- Sort by: last updated (default), property name, status
- "New Assessment" button → opens assessment.html with blank state
- Tap any row → opens that assessment in assessment.html
- Shows both locally-saved drafts and server-synced assessments

---

## Completion Tracking

Each tab tracks its own completion state based on required vs. filled fields:

**Overview**: Complete when property_name + rooms + floors + elevators + at least one contact filled
**Stakeholders**: Complete when at least one stakeholder with name + role
**Operations**: Complete when shift count + at least one contracted service filled
**Infrastructure**: Complete when WiFi and elevator sections have entries
**Zone tabs**: Complete when floor_surfaces + corridor_width + robot_readiness filled, plus at least 2 photos from checklist

Overall assessment status:
- **Draft**: Just created, minimal data
- **In Progress**: At least Overview tab complete
- **Completed**: All property tabs complete + at least 2 zone tabs complete with photos

Status auto-advances as the rep fills in data (but can be manually set).

---

## V2 Considerations (not built in V1)

- **PWA service worker** — true offline page loading, "Add to Home Screen" on iPad
- **Multi-facility-type templates** — hospital units, commercial office floors, arena sections
- **Voice notes** — audio recording per zone with transcription
- **Floor plan sketch** — draw rough floor plan with robot path overlay
- **Real-time collaboration** — two reps assessing different floors simultaneously
- **Assessment comparison** — compare assessments across properties in the pipeline
- **Photo AI** — auto-detect floor surface type, measure corridor width from photos
