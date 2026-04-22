# Market Research & Prospect Pipeline — Design Spec

**Date:** 2026-04-22
**Status:** Approved
**Author:** Eric Race + Claude

## Goal

Add the ability to create new geographic markets in the Prospect Pipeline, trigger AI-powered market research to find the top 5–10 hotel prospects per market, review and curate results before they hit the pipeline, and surface strategic connections from the Investor/Contact CRM during review.

## Context

The Prospect Pipeline page (`pages/pipeline-prospects.html`) currently holds 66 hardcoded hotel prospects across 14 markets and 7 clusters. There is no database table, no API, and no way to add markets or prospects dynamically. The Investor CRM (`pages/investor-crm.html`) is similarly hardcoded. This feature moves prospects to the database, adds market management, and introduces AI-powered research with a governance layer.

**Why this matters:** The prospects in this pipeline directly shape where Accelerate puts operational resources and hiring pools. Research quality and prospect curation are strategic decisions, not data entry. The system must treat them accordingly.

---

## 1. Database Schema

### 1.1 `markets` table

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | TEXT | PRIMARY KEY | Slug, e.g. `austin`, `sf-bay` |
| name | TEXT | NOT NULL | Display name, e.g. "Austin" |
| cluster | TEXT | | Group for filter chips. NULL = standalone market |
| color | TEXT | | Chip color hex, e.g. `#d97706` |
| notes | TEXT | | Strategic rationale for entering this market |
| created_at | TEXT | DEFAULT CURRENT_TIMESTAMP | ISO timestamp |

### 1.2 `prospects` table

| Column | Type | Constraints | Notes |
|---|---|---|---|
| id | INTEGER | PRIMARY KEY | Auto-increment |
| market_id | TEXT | REFERENCES markets(id) | Which market this belongs to |
| status | TEXT | NOT NULL DEFAULT 'staged' | `staged` (pending review) or `confirmed` (in pipeline) |
| name | TEXT | NOT NULL | Hotel name |
| address | TEXT | | Street address |
| brand | TEXT | | Brand name, e.g. "WALDORF ASTORIA / HILTON" |
| brand_class | TEXT | | `luxury`, `soft`, `chain`, `independent` |
| keys | INTEGER | | Room count |
| floors | INTEGER | | Floor count |
| stars | INTEGER | | Star rating (3–5) |
| signal | TEXT | | Why this is an opportunity for robotics |
| operator | TEXT | | Management company |
| portfolio | TEXT | | Portfolio play notes |
| monogram | TEXT | | 2-letter display code |
| mono_color | TEXT | | Monogram background hex |
| source | TEXT | NOT NULL DEFAULT 'manual' | `ai_research` or `manual` |
| research_date | TEXT | | ISO timestamp of when AI research was run |
| created_at | TEXT | DEFAULT CURRENT_TIMESTAMP | |
| updated_at | TEXT | DEFAULT CURRENT_TIMESTAMP | |

**Indexes:**
- `idx_prospects_market ON prospects(market_id)`
- `idx_prospects_status ON prospects(status)`

---

## 2. API Endpoints

### 2.1 Markets

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/markets` | requireAuth | List all markets, ordered by name |
| POST | `/api/markets` | requireAuth | Create a market. Body: `{ id, name, cluster, color, notes }` |
| PATCH | `/api/markets/:id` | requireAuth | Update market fields (name, cluster, color, notes) |
| DELETE | `/api/markets/:id` | requireAuth | Delete a market and all its prospects |

### 2.2 Prospects

| Method | Path | Auth | Description |
|---|---|---|---|
| GET | `/api/prospects` | requireAuth | List prospects. Query params: `market_id`, `status` (`staged`/`confirmed`), `brand_class` |
| POST | `/api/prospects` | requireAuth | Add a single prospect manually. Sets `source='manual'`, `status='confirmed'` |
| PATCH | `/api/prospects/:id` | requireAuth | Update any prospect field |
| DELETE | `/api/prospects/:id` | requireAuth | Delete a single prospect |
| POST | `/api/prospects/bulk-confirm` | requireAuth | Body: `{ ids: [1, 2, 3] }`. Sets `status='confirmed'` on all listed IDs |
| POST | `/api/prospects/bulk-delete` | requireAuth | Body: `{ ids: [1, 2, 3] }`. Deletes all listed IDs |

### 2.3 AI Research

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/markets/:id/research` | requireAuth | Trigger AI market research. Body: `{ count: 5|8|10 }`. Calls Claude API with web search tool. Inserts results as `status='staged'`, `source='ai_research'`. Returns the inserted prospects + any CRM connections found. |

---

## 3. AI Research Service

### 3.1 Research prompt

The Claude API call uses the `web_search` tool to find real hotel data. The system prompt is structured and opinionated:

```
You are a market research analyst for Accelerate Robotics, a hospital/hotel robotics company.
Research the top {count} hotel prospects in {market_name} for robotics deployment.

CRITERIA (in priority order):
1. Hotels with 100+ keys (below that, robotics ROI doesn't pencil)
2. Properties with multiple F&B outlets, event/meeting space, multi-floor layouts
3. Prefer luxury and soft-brand properties (higher willingness to pay)
4. Include 1-2 chain flagships for volume if they meet the floor count
5. Flag operator/portfolio relationships (e.g., "Aimbridge manages 3 others in-market")

FOR EACH HOTEL, return:
- name: Official hotel name
- address: Street address
- brand: Brand and parent (e.g., "WALDORF ASTORIA / HILTON")
- brand_class: One of: luxury, soft, chain, independent
- keys: Room count (integer)
- floors: Floor count (integer)
- stars: Star rating (3-5)
- signal: 1-2 sentences on WHY this property is a robotics opportunity — not a description, but a strategic signal
- operator: Management company name
- portfolio: Any portfolio play notes (e.g., "Davidson manages 12 other properties")
- monogram: 2-letter abbreviation for display
- mono_color: A hex color that fits the brand (luxury=#8b7340, chain=#1e40af, soft=#0e7490, independent=#1a6b3a as defaults)

Return ONLY verifiable data. Do not fabricate key counts or floor counts.
Return as a JSON array.
```

### 3.2 Response parsing

The service extracts the JSON array from Claude's response, validates each entry has at minimum `name` and `keys`, assigns `source='ai_research'`, `status='staged'`, `research_date=now()`, and inserts into the `prospects` table.

### 3.3 Connection scanning

After inserting prospects, the service loads `data/crm-contacts.json` and scans each contact's `background`, `whyAccelerate`, `fundingPath`, and `notes` fields for keyword matches against:
- Brand names from the new prospects (e.g., "Marriott", "IHG", "Hilton")
- Operator names (e.g., "Aimbridge", "Davidson")
- Market/city name (e.g., "Austin")

Returns an array of connections:
```json
[
  {
    "keyword": "Marriott",
    "matchType": "brand",
    "prospectCount": 3,
    "contacts": [
      { "name": "Harry Glorikian", "snippet": "YPO access to hospital/hotel chain CEOs" }
    ]
  }
]
```

### 3.4 Error handling

- If Claude API key is missing: return 503 with `"Anthropic API key not configured"`
- If Claude returns malformed JSON: return 502 with `"Research returned invalid data — try again"`
- If web search finds no results: return 200 with empty array (not an error — some markets may have few prospects)

### 3.5 Environment variable

Requires `ANTHROPIC_API_KEY` in `.env`. Add to `.env.example` with placeholder value.

---

## 4. Data Migration

### 4.1 Prospect seeding

A seed module (`src/db/seed-prospects.js`) runs on server boot:

1. Check if `prospects` table is empty
2. If empty, parse the 66 existing prospects (extracted from the current hardcoded JS array into a seed data file `data/seed-prospects.json`)
3. Insert all 66 as `status='confirmed'`, `source='manual'`
4. Insert the 7 clusters / 14 markets into the `markets` table

The seeder generates market IDs as slugs from the existing `market` field (e.g., "San Francisco" → `san-francisco`, "Beverly Hills" → `beverly-hills`). The `cluster` field maps from the existing `cluster` field in the hardcoded data (e.g., `sf-bay`, `la-west`). Market colors are derived from the existing cluster color conventions.

This is idempotent — if the table already has data, it does nothing.

### 4.2 CRM data extraction

Extract the investor/contact data from `pages/investor-crm.html` into `data/crm-contacts.json`. The CRM page then imports from this JSON file. This is a one-time manual extraction, not an automated migration.

The JSON structure preserves the existing fields: `name`, `company`, `background`, `whyAccelerate`, `fundingPath`, `notes`, `fundSize`, `sectors`, etc.

---

## 5. Pipeline Page UI Changes

### 5.1 Data source switch

On page load:
- `GET /api/prospects?status=confirmed` replaces the hardcoded JS array
- `GET /api/markets` replaces the hardcoded cluster/market chip definitions
- Delete the inline `prospects` array from the HTML

Filter chips, search, sort, card/table views all work the same — they just read from API data instead of inline data.

### 5.2 Add Market button

A "+" chip at the end of the market filter chip row. Clicking it reveals an inline form (slides down, not a modal):

- **Market name** — text input (required)
- **Cluster** — dropdown of existing clusters + "New cluster" text input
- **Color** — preset swatches (6 brand colors) or hex input
- **Market notes** — textarea for strategic rationale
- **Run AI Research** — checkbox (default off)
  - If checked: **Count** dropdown appears (5 / 8 / 10)
- **Actions:** "Add Market" button, "Cancel" link

Submitting with research toggled on:
1. `POST /api/markets` to create the market
2. `POST /api/markets/:id/research` to trigger research
3. Show loading spinner: "Researching {market} hotels... this takes 15–30 seconds"
4. On completion, staging area appears with results

Submitting without research:
1. `POST /api/markets` to create the market
2. New market chip appears in the filter row (with 0 prospects)

### 5.3 Staging area

Appears at the top of the page (below stats, above search bar) whenever `staged` prospects exist. Grouped by market.

```
┌─────────────────────────────────────────────────────────────────────┐
│  🔬 Research Results — Austin  (8 hotels found)                    │
│  AI Researched — Apr 22, 2026                                      │
│                                                                     │
│  [Select All]  [Add Selected to Pipeline]  [Discard All]           │
│                                                                     │
│  ☑ Fairmont Austin — 388 keys, 37 fl — FAIRMONT / ACCOR — luxury  │
│    "Tallest hotel in Austin, 3 restaurants, convention-adjacent"    │
│    [Edit]                                                           │
│                                                                     │
│  ☑ JW Marriott Austin — 1,012 keys, 34 fl — MARRIOTT — chain     │
│    "Largest hotel in Texas, 120K sq ft events..."                  │
│    [Edit]                                                           │
│                                                                     │
│  ☐ Omni Austin Downtown — 392 keys, 20 fl — OMNI — chain         │
│    "Convention center attached, 33K sq ft meetings..."             │
│    [Edit]                                                           │
│                                                                     │
│  ─── Strategic Connections ───────────────────────────────────────  │
│  Marriott (2 prospects) — Harry Glorikian: YPO access to hotel     │
│  chain CEOs                                                         │
│  IHG (1 prospect) — 6 IHG properties already in pipeline           │
└─────────────────────────────────────────────────────────────────────┘
```

Each staged prospect row:
- Checkbox (default checked)
- Hotel name, keys, floors, brand, brand class
- Signal text
- Edit button — inline editable fields (click field to edit)
- Source badge: "AI Researched — {date}"

Action buttons:
- **Select All / Deselect All** — toggles all checkboxes
- **Add Selected to Pipeline** — calls `POST /api/prospects/bulk-confirm` with checked IDs
- **Discard All** — calls `POST /api/prospects/bulk-delete` with all IDs in this staging group

### 5.4 Strategic Connections panel

Appears below the staged prospects within the staging area. Read-only. Shows keyword matches between the new prospects and CRM contacts:

- Grouped by keyword (brand name, operator, market)
- Shows how many prospects match
- Shows contact name + a short snippet explaining the relevance
- Collapsed by default if no connections found

### 5.5 Manual Add Prospect button

A secondary button next to the "+" market button: "+ Add Prospect". Opens an inline form:

- Market (dropdown of existing markets, required)
- Name (required)
- Address
- Brand
- Brand class (dropdown: luxury / soft / chain / independent)
- Keys, Floors, Stars
- Signal
- Operator
- Submit: inserts as `status='confirmed'`, `source='manual'`

### 5.6 Research badge on prospect cards

All prospect cards/table rows show a source indicator:
- AI-researched: small "🔬 AI" badge with research date
- Manual: no badge (manual is the default, no need to label it)

### 5.7 Loading state during research

While `POST /api/markets/:id/research` is in flight:
- Disable the form
- Show a spinner with message: "Researching {market name} hotels... this takes 15–30 seconds"
- On success: staging area appears
- On error: show error message inline, re-enable form

---

## 6. Investor CRM Page Change

### 6.1 Data source switch

The investor/contact data moves from an inline JS array in `pages/investor-crm.html` to `data/crm-contacts.json`. The page loads this file via fetch on page load. All existing rendering and filtering logic stays the same — just the data source changes.

---

## 7. File Inventory

| File | Action | Responsibility |
|---|---|---|
| `src/db/database.js` | Modify | Add `markets` + `prospects` CREATE TABLE statements |
| `data/seed-prospects.json` | Create | 66 existing prospects extracted from HTML |
| `data/crm-contacts.json` | Create | Investor/contact data extracted from CRM HTML |
| `src/db/seed-prospects.js` | Create | Boot-time seeder: populate markets + prospects if empty |
| `src/routes/markets.js` | Create | Markets CRUD + research trigger |
| `src/routes/prospects.js` | Create | Prospects CRUD + bulk confirm/delete |
| `src/services/market-research.js` | Create | Claude API integration, prompt, parsing, connection scanning |
| `src/server.js` | Modify | Mount new routes, run seeder on boot |
| `pages/pipeline-prospects.html` | Modify | Switch to API, add market form, staging area, connections panel, manual add |
| `pages/investor-crm.html` | Modify | Switch to loading from `data/crm-contacts.json` |
| `.env.example` | Modify | Add `ANTHROPIC_API_KEY` placeholder |

---

## 8. Out of Scope

- CRM database migration (contacts stay in JSON file for now)
- Market research scheduling/automation (research is manual trigger only)
- Prospect-to-deal conversion workflow (the existing "Convert to Deal" modal in the pipeline page is unchanged)
- Editing or deleting markets from the UI after creation (can be done via API directly)
- Multi-user research history or audit trail
