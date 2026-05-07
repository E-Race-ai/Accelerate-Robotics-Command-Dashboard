# Dashboard Brand Overhaul — Design Spec

**Goal:** Transform all admin and internal pages from generic white-card layouts into a cohesive, branded experience that matches the Accelerate Robotics website identity — light theme, professional, joyful but not tacky. Introduce a Deal Workspace with tabbed navigation so users can switch between tools without losing context.

**Audience:** Eric Race (CEO), sales team, investors viewing demos, potential delegates (Celia).

**Constraints:**
- Light theme only — no dark backgrounds.
- Motion marks moments (load, hover, deal close), never loops endlessly.
- All deal tools accessible via tabs without page navigation or back button.

---

## 1. Design System

### 1.1 Typography

| Role | Font | Weight | Usage |
|---|---|---|---|
| Headlines, stat values, step numbers | Space Grotesk | 700–800 | Page titles, KPI numbers, workflow step labels |
| Body, labels, metadata | Inter | 400–700 | Everything else |
| Gradient text | — | — | Key stat values: `background: linear-gradient(135deg, #0f172a, #0055ff)` with `-webkit-background-clip: text` |

### 1.2 Color System

Every color has a semantic meaning. Use consistently across all pages.

| Token | Hex | Meaning |
|---|---|---|
| `--blue` | `#0055ff` | Primary actions, Thesis Hotel, default deal color |
| `--cyan` | `#00c8ff` | Secondary, fleet/tech, nav gradient endpoint |
| `--purple` | `#7c3aed` | Premium tier (Moore Miami), investor-related |
| `--teal` | `#06b6d4` | Gulf Coast region, assessment stage |
| `--amber` | `#f59e0b` | Clusters, warnings, attention |
| `--green` | `#16a34a` | Live deployments, success, closed-won |
| `--bg` | `#f7f8fc` | Page background |
| `--surface` | `white` | Card/panel background |
| `--border` | `#e5e7eb` | Default border |
| `--text` | `#0f172a` | Primary text |
| `--text-dim` | `#64748b` | Secondary text |
| `--text-faint` | `#94a3b8` | Labels, captions |

Badge color pairings (background / text):
- Blue: `#eef2ff` / `#0055ff`
- Cyan: `#ecfeff` / `#06b6d4`
- Purple: `#f5f3ff` / `#7c3aed`
- Green: `#f0fdf4` / `#16a34a`
- Amber: `#fffbeb` / `#d97706`

### 1.3 Nav Bar

Shared across all admin and pages/* pages. Replaces current inconsistent headers.

- Background: white, `border-bottom: 1px solid #e5e7eb`
- **Gradient underline**: 2px bar below nav, `linear-gradient(90deg, var(--blue), var(--cyan), var(--purple), transparent 80%)`
- Logo: 36x36px rounded-10 rectangle, `linear-gradient(135deg, var(--blue), var(--cyan))`, `box-shadow: 0 4px 14px rgba(0,85,255,0.25)`, lightning bolt SVG inside
- Brand text: "Accelerate **Robotics**" (Robotics in `var(--blue)`), Space Grotesk 700
- Tagline: "ONE BRAIN. MANY BOTS." — 0.58rem, uppercase, `letter-spacing: 0.14em`, `color: var(--text-faint)`
- Nav links: Inter 600, 0.8rem, `color: var(--text-dim)`, active state gets `color: var(--blue)`, `background: #eef2ff`, small blue dot below via `::after`
- Links: Command Center, Deals, Prospects, Catalog, Fleet, Rollout (adjust per page context)

### 1.4 Stat Cards

- Background: white, `border-radius: 16px`, `border: 1px solid var(--border)`
- Hover: `border-color: #c7d2fe`, `box-shadow: 0 8px 28px rgba(0,85,255,0.08)`, `translateY(-2px)`
- Top gradient stripe appears on hover: 3px, `linear-gradient(90deg, var(--blue), var(--cyan))`, `opacity: 0 → 1`
- Value: Space Grotesk 800, 2rem, gradient text
- Label: Inter 700, 0.65rem, uppercase, `var(--text-faint)`
- Sparkline: flex row of 5px-wide bars, `border-radius: 2px`, gradient fill, `bar-grow` animation on load with staggered delays
- Delta badge: absolute top-right, 0.68rem, colored pill

### 1.5 Deal Cards

- Background: white, `border-radius: 14px`, `border: 1px solid var(--border)`
- Left stripe: 4px wide, full height, gradient color per deal (blue, purple, teal, amber)
- Hover: 3D tilt — `transform: perspective(800px) rotateY(-1.5deg) rotateX(0.5deg) translateY(-3px)`, `box-shadow: 0 12px 36px rgba(0,85,255,0.08)`, `border-color: #c7d2fe`
- Transition: `0.3s cubic-bezier(0.4, 0, 0.2, 1)`
- Name: Inter 700, 0.9rem
- ARR value: Space Grotesk 800, 1.15rem, gradient text
- Badges: colored pills per semantic meaning

### 1.6 Workflow Steps

- Grid of cards, `border-radius: 14px`, `border: 1.5px solid var(--border)`
- Active step: `border-color: var(--blue)`, `background: linear-gradient(180deg, #eef2ff, white)`, `box-shadow: 0 4px 20px rgba(0,85,255,0.1)`
- Top progress bar: 3px, gradient fill width proportional to stage completion
- Shimmer animation on progress bar: single light sweep, `animation: shimmer 3s ease-in-out infinite`
- Step number: Space Grotesk 800, 0.7rem, blue
- Step name: Inter 700, 0.82rem
- Meta: Inter, 0.68rem, `var(--text-faint)`

### 1.7 Glass Cards (Quick Actions, summaries)

- `background: rgba(255,255,255,0.8)`, `backdrop-filter: blur(12px)`
- `border: 1px solid rgba(255,255,255,0.9)`, `border-radius: 16px`
- `box-shadow: 0 2px 12px rgba(0,0,0,0.03)`
- Action buttons: primary = blue-cyan gradient + white text + glow shadow, secondary = `#eef2ff` + blue text

### 1.8 Badges

- 0.6rem, Inter 700, `padding: 3px 8px`, `border-radius: 6px`
- Color pairs defined in 1.2 above
- Used for: deal stage, tier, region, status, key count, floor count

---

## 2. Motion System

### 2.1 On Page Load

| Element | Animation | Duration | Stagger |
|---|---|---|---|
| Nav bar | `reveal-up` (fade + translateY 16px) | 0.6s | 0s |
| Page header | `reveal-up` | 0.6s | 0.05s |
| Stat cards | `reveal-up` | 0.6s | 0.1s, 0.15s, 0.2s, 0.25s |
| Stat values | Counter roll-up | 1.8s | Starts at 0.4s after load |
| Sparkline bars | `bar-grow` (scaleY 0 → 1) | 1.2s | 0.1s between bars |
| Workflow steps | `reveal-up` | 0.6s | 0.3s–0.45s |
| Content grid | `reveal-up` | 0.6s | 0.5s, 0.55s |

All use `cubic-bezier(0.16, 1, 0.3, 1)` easing (ease-out with slight overshoot).

### 2.2 On Hover

| Element | Effect | Transition |
|---|---|---|
| Stat cards | translateY(-2px), blue box-shadow, top stripe appears | 0.3s cubic-bezier |
| Deal cards | 3D tilt (1.5deg Y, 0.5deg X), translateY(-3px), blue glow | 0.3s cubic-bezier |
| Workflow steps | border-color → blue, subtle shadow | 0.2s |
| Nav links | color → blue, background → #eef2ff | 0.2s |
| Action buttons (primary) | translateY(-1px), deeper glow shadow | 0.2s |

### 2.3 On Event

| Event | Effect |
|---|---|
| Deal moved to "Closed Won" | Confetti burst — 80 particles, brand colors (blue, cyan, purple, teal, amber, green, pink), gravity physics, 2s duration, fires once |

### 2.4 Rules

- No infinite background animations (no pulsing logos, no ambient particles)
- Shimmer on pipeline bars is the one exception — slow (3s), subtle, conveys live momentum
- All hover transitions use `cubic-bezier(0.4, 0, 0.2, 1)` for natural feel
- Page-load animations complete within 1.5s — the page should feel settled by then

---

## 3. Deal Workspace — Tabbed Navigation

The core navigation problem: clicking into a deal's sub-tools (Assessment, Fleet Design, Proposal) navigates to separate pages with no easy way to switch between tools or get back. The Deal Workspace solves this with a two-level navigation system.

### 3.1 Architecture: Two-Level Nav

**Level 1 — Primary Nav (top):** Global navigation shared across all pages.
- Links: Command Center, Deals, Prospects, Catalog, Fleet, Rollout
- Always visible, sticky top, height 56px

**Level 2 — Workspace Bar:** Appears when you're working on a specific deal. Sticks below the primary nav (sticky top: 56px), height 48px. Contains:

1. **Deal Identity** (left): Colored stripe + deal name + OPP ID + ARR. Right-bordered separator.
2. **Deal Switcher** (dropdown arrow): Opens a searchable dropdown of all deals. Clicking a deal switches context without leaving the current tool tab.
3. **Tool Tabs** (center): Overview | Assessment | Fleet Design | Proposal | Pipeline | Contacts | Notes
4. **Auto-Save Indicator** (right): Green dot + "Saved" text. Flashes blue "Saving..." on tab switch or data change.

### 3.2 Tool Tabs

| Tab | Icon | Content | Source |
|---|---|---|---|
| Overview | clipboard | Deal summary: stage, ARR, contacts, recent activity, next actions | Current `admin-deal-detail.html` content |
| Assessment | magnifier | Full property assessment form — profile, infrastructure, photos | Current `pages/assessment.html` |
| Fleet Design | robot | Robot selection, fleet config, cost modeling | Current `pages/fleet-designer.html` (deal-scoped) |
| Proposal | document | Proposal builder — generates client-facing document | Current `pages/proposal.html` (deal-scoped) |
| Pipeline | chart | Stage progression, milestone tracking, revenue forecast | New — deal-specific pipeline view |
| Contacts | people | Key people at this property — roles, notes per contact | From current deal detail contacts section |
| Notes | memo | Running log of meetings, calls, site visits, decisions | From current deal detail notes section |

### 3.3 Tab Status Dots

Each tab shows a small colored dot indicating completion status:
- Green `#16a34a` — Complete
- Amber `#f59e0b` — In Progress
- Gray `var(--border)` — Not Started
- No dot — always-available tabs (Overview, Pipeline, Contacts, Notes)

Status is derived from the deal's data (e.g., assessment is "complete" when all required fields are filled).

### 3.4 Deal Switcher Dropdown

- Triggered by clicking the down-arrow button next to the deal name
- Contains a search input at top + list of all active deals
- Each deal shows: colored stripe + name + OPP ID + ARR
- Current deal is highlighted with `background: #eef2ff`
- Clicking a different deal reloads the workspace bar and content for that deal, staying on the same tool tab
- Closes on outside click

### 3.5 URL Structure and Deep Links

Each workspace state is represented in the URL so it's bookmarkable and shareable:

```
/admin-deal-detail.html?id=<deal-id>#overview
/admin-deal-detail.html?id=<deal-id>#assessment
/admin-deal-detail.html?id=<deal-id>#fleet
/admin-deal-detail.html?id=<deal-id>#proposal
/admin-deal-detail.html?id=<deal-id>#pipeline
/admin-deal-detail.html?id=<deal-id>#contacts
/admin-deal-detail.html?id=<deal-id>#notes
```

Hash changes update the active tab without page reload. Deal ID in query string loads the correct deal context.

### 3.6 Auto-Save Behavior

- All form changes auto-save to the deal via `PUT /api/deals/:id` (or sub-resource endpoints)
- Debounced: 500ms after last keystroke
- Save indicator shows "Saving..." (blue) → "Saved" (green)
- Tab switches do NOT discard unsaved work — save fires before switching
- If save fails, indicator shows "Save failed" (red) with retry

### 3.7 Where the Workspace Bar Appears

- `admin-deal-detail.html` — always (this becomes the workspace host page)
- All other pages — primary nav only, no workspace bar

When navigating from Command Center or Deals list, clicking a deal opens `admin-deal-detail.html?id=X#overview`, which renders the workspace.

### 3.8 Implementation Approach

The workspace is **client-side tab switching** within a single HTML page (`admin-deal-detail.html`):

- Each tab has a `<div class="tab-panel" id="panel-{tab}">` container
- Clicking a tab hides all panels, shows the target panel, updates the URL hash
- Tab content is loaded on first click (lazy) via fetch to avoid loading all tools upfront
- Assessment, Fleet Design, and Proposal forms are embedded as self-contained HTML blocks within their panels
- The deal context (ID, name, stage, ARR) is loaded once on page init and passed to all tab panels

---

## 4. Pages In Scope

All pages get the shared primary nav bar, color system, typography, and base card styles. Page-specific treatments below.

### 4.1 Command Center (`public/admin-command-center.html`)

Full treatment: branded nav, stat cards with sparklines and animated counters, workflow steps with shimmer, deal cards with 3D tilt, map panel, quick actions glass card. Clicking a deal card navigates to the Deal Workspace.

### 4.2 Deals Pipeline (`public/admin-deals.html`)

- Branded nav replaces current header
- Kanban columns keep current layout
- Deal cards get stripe + 3D tilt + branded badges
- Stage headers get step numbers and color coding
- Confetti fires when a card is dropped into "Closed Won"
- Clicking a deal card opens the Deal Workspace

### 4.3 Deal Workspace (`public/admin-deal-detail.html`)

The central workspace page. See Section 3 for full spec. Hosts all deal tools as tabs:
- Branded primary nav + workspace bar
- Overview tab: deal summary with gradient ARR, branded timeline, glass contact cards
- Assessment tab: full property assessment form with blue focus rings
- Fleet Design tab: deal-scoped fleet designer with glass cards + hover glow
- Proposal tab: deal-scoped proposal builder
- Pipeline tab: stage progression, milestones
- Contacts tab: key people with glass-card treatment
- Notes tab: activity log with hover elevation

### 4.4 Prospect Pipeline (`pages/pipeline-prospects.html`)

- Branded nav replaces current header
- Prospect cards get subtle stripe (amber for luxury, teal for soft brand, blue for chain)
- Stat pills get gradient values + sparklines
- Filter chips get branded color coding
- "Convert to Deal" modal gets gradient primary button

### 4.5 Investor CRM (`pages/investor-crm.html`)

- Branded nav replaces current header
- Investor cards get purple theme (matches premium/investor semantic)
- Fund size numbers get gradient text
- Status badges use green/amber/blue system

### 4.6 Robot Catalog (`pages/robot-catalog.html`)

- Branded nav replaces current header
- Robot cards get category-colored stripes
- Filter sidebar gets glass-card treatment
- Spec values (payload, speed, runtime) get Space Grotesk treatment

### 4.7 Fleet Designer — Standalone (`pages/fleet-designer.html`)

- Branded nav replaces current header
- Recommendation cards get glass treatment + hover glow
- Export button gets gradient primary style
- Cost summary gets stat-card treatment with gradient values
- Note: this standalone page remains for general fleet exploration. Deal-scoped fleet design lives in the workspace tab.

### 4.8 National Rollout Strategy (`pages/national-rollout-strategy.html`)

- Branded nav replaces current header
- Market cards get region-colored stripes
- TAM values get gradient text
- Chain logos get hover elevation

### 4.9 Assessment — Standalone (`pages/assessment.html`, `pages/assessments.html`)

- Branded nav replaces current header
- Form fields get blue focus ring
- Note: standalone assessment page remains for direct access. Deal-scoped assessment lives in the workspace tab. Both share the same form component.

### 4.10 Login page (`public/admin-login.html`)

- Centered card with gradient logo
- Gradient primary button
- No workspace bar (not logged in)

---

## 5. Shared CSS + JS Architecture

### 5.1 Shared CSS: `public/css/brand.css`

Contains:
- CSS custom properties (all color tokens)
- Primary nav bar styles
- Workspace bar styles (tabs, deal identity, switcher, save indicator)
- Stat card base styles
- Deal card base styles (including 3D tilt)
- Badge system (all color pairs)
- Glass card
- Workflow step styles
- Reveal animation keyframes
- Shimmer keyframe
- Print overrides (`@media print` kills all animations)

### 5.2 Shared JS: `public/js/brand.js`

Contains:
- `animateCounter(el, target, prefix, suffix)` — counter roll-up
- `fireConfetti(canvas)` — confetti burst for deal close
- `initWorkspace(dealId)` — workspace bar tab switching, hash routing, deal switcher dropdown
- `autoSave(dealId, data)` — debounced save with indicator flash

Each page imports these shared files via `<link>` and `<script>` tags and adds page-specific styles/logic inline.

---

## 6. Implementation Notes

- No external dependencies beyond current stack (Tailwind CDN, Google Fonts, Leaflet)
- Confetti is vanilla canvas — no library needed
- Counter animation is ~15 lines of vanilla JS
- 3D tilt is pure CSS (no JS needed for the hover effect)
- Shimmer is a single CSS keyframe
- Workspace tab switching is vanilla JS — hide/show panels, update hash
- Lazy-loading tab content prevents loading all tools upfront
- Print styles must kill all animations (`animation: none !important; transition: none !important`)
- The shared nav HTML is duplicated in each page (no build step, no templating — matches current architecture)
- The workspace bar HTML is only in `admin-deal-detail.html`
