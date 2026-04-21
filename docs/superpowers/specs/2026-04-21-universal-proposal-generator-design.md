# Universal Proposal Generator — Design Spec

## Goal

When a user clicks "Generate Proposal" in the Fleet Designer, open a fully interactive proposal page — modeled on the Moore Miami gold standard — populated dynamically with the fleet designer's data and Claude-generated narratives. Works for all 75 properties (pipeline, prospects, and custom), not just the three with existing bespoke proposal repos.

## Architecture & Data Flow

Three paths into one static HTML proposal page:

1. **Local handoff (primary):** Fleet designer writes fleet config to `localStorage`, opens `pages/proposal.html` in a new tab. Proposal reads localStorage on load.
2. **Share link:** A "Share" button on the proposal encodes fleet config as base64 JSON in a URL hash (`#config=eyJ...`). Recipients open the link; the proposal reads the hash instead of localStorage.
3. **Narration endpoint:** On load (from either source), the proposal calls `POST /api/narrate` to get Claude-generated narratives for each section. If the call fails, the page falls back to template-based text.

```
Fleet Designer ──localStorage──► proposal.html ──POST /api/narrate──► Express endpoint
Share URL ──────hash params────► proposal.html ──POST /api/narrate──► (Claude Haiku)
```

### localStorage Payload

Written by fleet designer on "Generate Proposal" click:

```js
{
  property: {
    name: 'Thesis Hotel',
    type: 'hotel',          // hotel | resort | hospital | senior_living
    rooms: 245,
    floors: 10,
    guestFloors: '4-10',
    elevators: 2,
    market: 'Miami'
  },
  facility: {
    elevatorMake: 'ThyssenKrupp',
    elevatorGuestCount: 1,
    elevatorServiceCount: 1,
    outdoorAmenities: ['pool'],
    fbOutlets: 3,
    eventSpaceSqFt: 5000,
    surfaceZones: {
      corridors: ['carpet'],
      lobby: ['tile'],
      fb: ['hardwood'],
      boh: ['tile']
    },
    surfaces: ['carpet', 'tile', 'hardwood']   // global union, for display
  },
  fleet: [
    {
      goalId: 'goal-lobby',
      serviceLine: 'Lobby Floor Care',
      type: 'cleaning',
      savings: 3500,
      robot: {
        company: 'Keenon',
        model_name: 'C40',
        image_url: 'https://...',
        primary_use_cases: ['hard floor scrubbing', 'lobby cleaning'],
        payload_kg: null,
        elevator_integration: false,
        public_price: '$18,000-$25,000'
      },
      score: 87,
      monthlyEstimate: 2200
    }
    // ... one entry per fleet slot
  ],
  summary: {
    totalRobots: 5,
    totalMonthlyCost: 11400,
    totalAnnualSavings: 228000,
    roiMultiple: 1.7
  },
  generatedAt: '2026-04-21T14:30:00Z'
}
```

### Share URL Encoding

The "Share Proposal" button serializes the fleet config (same structure as localStorage) to JSON, base64-encodes it, and appends it as a hash fragment (no compression — the payload is typically 2-5 KB, well within URL limits):

```
/accelerate-robotics/pages/proposal.html#config=eyJwcm9wZXJ0eS...
```

On load, the proposal checks for `location.hash` first, then falls back to localStorage.

## Narration API Endpoint

### Route

`POST /api/narrate`

### Input

Same structure as the localStorage payload (property + facility + fleet).

### Prompt Design

System prompt establishes the voice: professional hospitality proposal, confident but not salesy, specific to the property type. User message contains the structured data and asks for a JSON response.

### Output

```json
{
  "intro": "Thesis Hotel is a 245-room property across 10 floors in Miami...",
  "headline": "Drag the slider. Watch the operation transform.",
  "valueProp": "Every robot in your fleet reclaims hours your team currently spends on...",
  "robots": [
    {
      "goalId": "goal-lobby",
      "roleDescription": "Overnight hard-floor scrubber — lobby, corridors, and F&B areas",
      "unlockNarrative": "Guests never see a mop bucket during operating hours — floors reset before first check-in.",
      "savingsCapture": "Lobby/public-area cleaning shift replaced"
    }
  ],
  "tierName": "Full-Property Service",
  "tierNarrative": "Every indoor guest-facing and BOH task automated. Corridors, lobby, delivery, linen transport — the fleet handles the invisible work that pulls your best people away from guests.",
  "phases": [
    {
      "name": "Pilot",
      "timeframe": "Month 1",
      "description": "One C40 on lobby hardwood overnight. 30-day pilot, success criteria agreed jointly."
    }
  ]
}
```

### Model

Claude Haiku — narrative generation is structured and constrained, doesn't need heavy reasoning. Response typically under 1K tokens.

### Rate Limiting

10 requests per IP per hour. Same pattern as the existing inquiries endpoint.

### Error Handling

If the Claude call fails (network, rate limit, timeout), the proposal page falls back to template-based text. For each narrative field, a deterministic fallback is generated client-side:

- `intro` → "{name} is a {rooms}-room {type} across {floors} floors in {market}."
- `headline` → "Drag the slider. Watch the operation transform."
- `robots[].roleDescription` → "{serviceLine} — {robot.company} {robot.model_name}"
- `robots[].unlockNarrative` → "Automates {serviceLine} to free staff for higher-value work."

The proposal still works and looks good — just without the bespoke polish.

## Proposal Page Sections

All sections rendered in `pages/proposal.html` — a single self-contained HTML file (no build step), consistent with the existing project architecture.

### 1. Header

- Property name in Playfair Display, large
- Accelerate Robotics badge, right-aligned
- Subtitle: "Executive Proposal · Live Configurator"
- Property stats tagline: "{rooms}-room {type} · {floors} floors · {market}"

### 2. Intro Paragraph

- Claude-generated (or fallback template)
- 2-3 sentences framing the proposal for this specific property
- Includes a link concept: "For the full fleet analysis, see the Fleet Designer"

### 3. Configurator Panel (dark themed)

**Fleet size display + slider:**
- Large fleet count number (Space Grotesk, bold)
- Range slider from 1 to N (N = total fleet slots)
- Slider fill bar with accent color gradient

**Preset tier chips (auto-generated):**

| Fleet size (N) | Chips |
|---|---|
| 1-2 | "Pilot · 1", "Full · N" |
| 3-4 | "Pilot · 1", "Core · 2", "Full · N" |
| 5-7 | "Pilot · 1", "Core · 3", "Full · N" |
| 8+ | "Pilot · 1", "Core · 3", "Extended · 6", "Full · N" |

**Robot grid:**
- One card per fleet slot, ordered by score descending
- Each card: robot photo (from `image_url`), model name, category chip, Claude-narrated role description
- Active cards (≤ slider position) are full color; inactive cards are dimmed/greyscale
- Active cards show a status dot (accent color)

**Service line LED indicators:**
- One LED per fleet slot's `serviceLine`
- LEDs illuminate as the slider passes each slot's position
- Counter: "N / total online"

**Intelligence Platform toggle:**
- Same as Moore: $38,500 Y1 install, $10,000/yr license
- Toggle on/off affects Year 1 and Year 2+ cost calculations

### 4. Impact Section (inside configurator panel)

**"Enhanced Guest Experience" card:**

Two pillars side by side:
- **New Service Touchpoints:** `activeSlots × 6` per day, `× 30` per month
- **Staff Freed for Higher-Value Work:** `totalSavings / fteMonthlyCost` FTE equivalent

**Revenue capture hero (full width):**
- `activeSlots × $2,500` monthly estimated new revenue
- Annual projection
- Narrative about revenue creation vs. cost cutting

### 5. Hard Savings Row

Three stat tiles:
- Monthly Fleet Cost: sum of `monthlyEstimate` for active slots
- Monthly Hard Savings: sum of `savings` for active slots
- Net Monthly Benefit: savings minus cost

Annual summary bar:
- Year 1 All-In: `(monthlyCost × 12) + intelY1`
- Year 2+ Steady-State: `(monthlyCost × 12) + intelY2`
- Annual Net Cash Benefit: `(monthlySavings - monthlyCost) × 12`

### 6. vs. Hiring Comparison

Fleet cost vs. equivalent FTE cost:
- FTE monthly cost varies by property type:
  - Hotel: $4,200/mo
  - Resort: $4,500/mo
  - Luxury (auto-detected): $5,200/mo
  - Hospital: $4,800/mo
  - Senior Living: $4,000/mo
- FTE count = `totalSavings / fteMonthlyCost`
- Delta = FTE cost - fleet cost
- Percentage savings
- Annual delta

Footnote about costs not counted: recruiting, turnover, OT, agency markup.

### 7. Phase Timeline

Auto-generated phases based on fleet size:

| Slider position | Phases shown |
|---|---|
| 1 | Phase 1: Pilot (30-day proof of concept) |
| 2-3 | + Phase 2: Core Service |
| 4-6 | + Phase 3: Full Property |
| 7+ | + Phase 4: Autonomous Operations |
| Intel toggle on | + Phase 5: Intelligence Platform |

Each phase card shows:
- Phase number (circled), timeframe
- Phase name (bold)
- Description (Claude-narrated or fallback)
- Which robots deploy in that phase (derived from slot ordering)

Phases not yet reached by the slider show as dimmed/skipped.

### 8. Savings Breakdown Table

Standard HTML table:
- Columns: Robot, Service Line, What It Replaces, Monthly Savings
- One row per active fleet slot
- Total row at bottom with sum

### 9. Service Tier Unlocks

- Current tier badge and name (Claude-narrated)
- Grid of unlock cards — one per active robot
  - Category color stripe (left border)
  - Category label, robot code
  - Unlock narrative (Claude-generated: what this robot enables)
- "Next up" preview: 1-2 dashed cards showing what the next slider positions would unlock

### 10. Footer

- "Share Proposal" button — generates and copies the share URL
- "Print / Save PDF" button — triggers `window.print()` (comprehensive `@media print` CSS)
- Accelerate Robotics branding, generation date
- "Powered by Fleet Designer" link back

## Property Theming

CSS custom properties set on page load based on property data:

```js
document.documentElement.style.setProperty('--accent', palette.primary);
document.documentElement.style.setProperty('--accent-light', palette.secondary);
document.documentElement.style.setProperty('--panel-bg', palette.panelBg);
```

| Property Type | Primary Accent | Secondary | Panel Background |
|---|---|---|---|
| Hotel | `#0055ff` (blue) | `#00c8ff` (cyan) | `#0f1218` (dark navy) |
| Resort | `#2d8a6e` (green) | `#7ecfb0` (seafoam) | `#0f1a16` (dark forest) |
| Hospital | `#1a73e8` (clinical blue) | `#4fc3f7` (sky) | `#0f1520` (dark steel) |
| Senior Living | `#7c5cbf` (purple) | `#b39ddb` (lavender) | `#16121f` (dark plum) |
| Luxury | `#8a6f47` (bronze) | `#d9c9a8` (cream) | `#151515` (blackened) |

**Luxury auto-detection:** Applied when `rooms < 50` OR property name contains "club", "boutique", "members", or "residence". Overrides the base type palette.

All accent-colored elements (slider fill, robot card borders, LED dots, stat tile accents, chip active states, preset chips) reference `var(--accent)` and `var(--accent-light)`.

## Robot Ladder Ordering

Fleet slots are sorted by score descending — the highest-scored recommendation is position 1 on the slider. This reveals robots in order of value, building the business case incrementally.

The ordering is locked at generation time (from the fleet designer's output). Users can reorder by editing the proposal data, but the default order is the algorithm's recommendation.

## Fleet Designer Changes

### "Generate Proposal" button behavior (updated)

Current behavior:
- Properties with `proposalUrl` → link to existing proposal
- Others → download `config.yml`

New behavior:
- Properties with `proposalUrl` → link to existing proposal (unchanged)
- All others → write fleet data to localStorage, open `pages/proposal.html` in new tab

### New function: `launchProposal()`

Gathers current fleet state (same data already collected by `downloadProposalConfig()` plus the fleet slots from `generateFleet()`), writes it to `localStorage.setItem('accelerate-proposal', JSON.stringify(payload))`, and opens the proposal page.

### `updateProposalButton()` update

For properties without a `proposalUrl`, the button's `onclick` calls `launchProposal()` instead of `downloadProposalConfig()`.

## Express Server Changes

### New file: `src/routes/narrate.js`

Single route: `POST /api/narrate`

- Validates input (property, fleet required)
- Constructs Claude prompt from structured data
- Calls Anthropic API (Claude Haiku)
- Returns narrative JSON
- Rate limited: 10 req/IP/hour

### `src/server.js` changes

- Mount narrate route: `app.use('/api', narrateRouter)`
- Add `api.anthropic.com` to CSP `connect-src` if calling from server (not needed — server-side call)

### Dependencies

- `@anthropic-ai/sdk` — Anthropic SDK for Claude API calls
- `ANTHROPIC_API_KEY` added to `.env` and `.env.example`

## CSS Approach

The proposal page uses Tailwind (via CDN, same as Moore) for layout utilities, plus custom CSS for:
- Configurator panel (dark background, slider, robot grid)
- LED indicators with pulse animation
- Stat tiles and accent variants
- Phase timeline cards
- Robot cards (active/inactive states)
- Property theming via CSS custom properties
- Comprehensive `@media print` styles (per project rules)

Typography: Inter (body), Playfair Display (headlines), Space Grotesk (numbers/tech).

## Print Styles

Full `@media print` CSS following the project's print-friendly-proposals rule:
- `print-color-adjust: exact` on body
- `break-inside: avoid` on all section containers, robot cards, phase cards
- Kill all animations and transitions
- Hide interactive controls (slider, preset chips, toggles)
- Force `opacity: 1` and `filter: none` on all robot cards
- LED dots: solid color, no animation, forced `border-radius: 50%`
- Dark panels: keep background, remove box-shadow
- Tables: force visible borders
- Fixed/sticky elements: `position: static`

## File Changes Summary

| File | Change |
|---|---|
| `pages/proposal.html` | **New file** — universal interactive proposal page |
| `pages/fleet-designer.html` | Update `updateProposalButton()` and add `launchProposal()` |
| `src/routes/narrate.js` | **New file** — narration API endpoint |
| `src/server.js` | Mount narrate route |
| `.env.example` | Add `ANTHROPIC_API_KEY` |
| `package.json` | Add `@anthropic-ai/sdk` dependency |

## Scope Boundaries

**In scope:**
- Universal proposal page with all 10 sections
- Narration API endpoint
- Fleet designer → proposal handoff
- Share URL generation
- Property theming (5 palettes)
- Print styles
- Fallback text when narration fails

**Out of scope (future):**
- Persistent proposal storage (database)
- PDF generation (server-side; for now, browser print-to-PDF)
- Proposal versioning / history
- Custom property logos or images
- Software surface mockups (Moore's POS dashboards, device mockups)
- Editable proposal fields in the browser (user customization beyond slider)
