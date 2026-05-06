# Fleet Designer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Fleet Designer page that reads from the shared robot catalog, recommends optimal robot fleets based on property inputs and client goals, enables side-by-side comparison per fleet slot, and exports `fleet.yml` for the proposal generator.

**Architecture:** Extract robot data from `robot-catalog.html` into a shared `pages/data/robots.json`. Create a new self-contained `pages/fleet-designer.html` with two-column layout (inputs left, results right). All logic runs client-side — no backend. A scoring engine filters and ranks robots per goal slot, shows top-3 comparisons, and exports proposal-ready YAML.

**Tech Stack:** Vanilla HTML/CSS/JS (no build step). `fetch()` for data loading. No external dependencies beyond Google Fonts (already used by catalog).

**Spec:** `docs/superpowers/specs/2026-04-20-fleet-designer-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `pages/data/robots.json` | **Create** | Shared robot catalog data — the single source of truth for both pages |
| `pages/robot-catalog.html` | **Modify** (line 613) | Switch from inline `const R=[...]` to `fetch('./data/robots.json')` |
| `pages/fleet-designer.html` | **Create** | Fleet Designer page — input form, recommendation engine, comparison view, YAML export |

---

### Task 1: Extract robot data into `pages/data/robots.json`

**Files:**
- Create: `pages/data/robots.json`
- Modify: `pages/robot-catalog.html:610-613`

The robot catalog currently has a 222-robot JSON array hard-coded as `const R=[...];` on line 613 of `robot-catalog.html`. We need to extract it into a separate file and update the catalog to load it via `fetch()`.

- [ ] **Step 1: Create the extraction script**

Create a Node.js script that reads the HTML, extracts the R array, and writes it to `pages/data/robots.json`:

```js
// pages/extract-robots.js
const fs = require('fs');
const path = require('path');

const HTML_PATH = path.join(__dirname, 'robot-catalog.html');
const OUT_DIR = path.join(__dirname, 'data');
const OUT_PATH = path.join(OUT_DIR, 'robots.json');

const html = fs.readFileSync(HTML_PATH, 'utf8');
const match = html.match(/^const R=(\[[\s\S]*?\]);$/m);
if (!match) { console.error('Could not find R array in HTML'); process.exit(1); }

let R;
try { R = JSON.parse(match[1]); }
catch(e) { console.error('Failed to parse R array:', e.message); process.exit(1); }

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });
fs.writeFileSync(OUT_PATH, JSON.stringify(R, null, 2), 'utf8');
console.log(`Extracted ${R.length} robots to ${OUT_PATH}`);
```

- [ ] **Step 2: Run the extraction**

Run: `node pages/extract-robots.js`
Expected: `Extracted 222 robots to pages/data/robots.json`

Verify: `node -e "const R=require('./pages/data/robots.json'); console.log(R.length, 'robots,', Object.keys(R[0]).length, 'fields each')"`
Expected: `222 robots, 36 fields each`

- [ ] **Step 3: Modify `robot-catalog.html` to load from `robots.json`**

In `robot-catalog.html`, the current code structure (starting around line 610) is:

```html
<script>
const R=[{...giant inline JSON...}];
const FLAGS={...};
```

Replace the inline `const R=[...]` with a `fetch()` call. Wrap all the code that depends on `R` inside the fetch callback. The structure becomes:

```html
<script>
fetch('./data/robots.json')
  .then(res => res.json())
  .then(R => {
    // --- everything that was below "const R=..." moves inside here ---
    const FLAGS={...};
    // ... all filter, render, quick-sort code ...
  })
  .catch(err => {
    document.getElementById('gv').innerHTML =
      '<div class="empty"><h3>Failed to load robot data</h3><p>' + err.message + '</p></div>';
  });
```

Key details:
- `R` becomes the parameter of the `.then()` callback instead of a top-level `const`
- All existing code (FLAGS, helper functions `f()`, `fc()`, `ac()`, `sc()`, `sl()`, `rc()`, filter population, stats population, `getF()`, `renderCards()`, `render()`, quick-sort code) moves inside the `.then()` block
- Indentation does NOT need to change — just wrap the existing block
- The `<script>` tag stays in the same location
- No other changes to the HTML structure, CSS, or logic

- [ ] **Step 4: Verify the catalog still works**

Start the dev server: `npm run dev`
Open `http://localhost:3000/pages/robot-catalog.html` in a browser.
Verify:
- All 222 robots render in the grid
- Filters work (category, company, country, status dropdowns)
- Search works
- Quick-sort buttons work
- Analysis strip shows correct counts
- No console errors

- [ ] **Step 5: Clean up extraction script and commit**

Delete `pages/extract-robots.js` (one-time script, no longer needed).

```bash
git add pages/data/robots.json pages/robot-catalog.html
git commit -m "refactor(catalog): extract robot data into shared robots.json

Problem: Robot data was embedded inline in robot-catalog.html, making it
impossible for other pages to share the same dataset without duplication.
Solution: Extract the 222-robot JSON array into pages/data/robots.json
and load it via fetch(). Both the catalog and the new Fleet Designer
can now read from a single source of truth."
```

---

### Task 2: Price parser utility

**Files:**
- Create: `pages/fleet-designer.html` (initial scaffold with just the price parser)

The recommendation engine needs to extract a numeric monthly cost from the messy `public_price` strings in the catalog (e.g., `"$11,500-$16,400"`, `"~$50,000 + ~$500/mo service plan"`, `"$599/month lease; ~$18,000-$25,000 purchase"`). Build this as the first piece of the Fleet Designer.

- [ ] **Step 1: Create the Fleet Designer HTML with price parser**

Create `pages/fleet-designer.html` with a minimal scaffold and the `parseMonthlyPrice(priceStr, fallback)` function. This is a utility function that will be used by the scoring engine in Task 4.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Accelerate Robotics — Fleet Designer</title>
<style>
/* Placeholder — full CSS added in Task 3 */
body { font-family: sans-serif; padding: 20px; background: #0a0a0f; color: #e0e0e0; }
.test-output { font-family: monospace; font-size: 13px; white-space: pre-wrap; padding: 20px; background: #111; border-radius: 8px; }
</style>
</head>
<body>
<h2>Fleet Designer — Price Parser Test</h2>
<div id="test-output" class="test-output"></div>

<script>
/**
 * Parse a public_price string into a monthly dollar estimate.
 * Returns a number (monthly USD) or null if unparseable.
 *
 * Priority:
 * 1. Explicit /month or /mo amount
 * 2. RaaS or lease amount
 * 3. Price range → midpoint → divide by 36 months
 * 4. Single purchase price → divide by 36 months
 * 5. Fallback value
 *
 * WHY: 36-month divisor assumes a 3-year amortization, matching typical
 * RaaS contract length in the hotel/hospital space.
 */
function parseMonthlyPrice(priceStr, fallback) {
  if (!priceStr || priceStr === 'not_publicly_listed' || priceStr === 'null') {
    return fallback || null;
  }

  const s = priceStr.replace(/,/g, ''); // strip commas for number parsing

  // 1. Explicit monthly: look for $X/month, $X/mo, $X per month
  const moMatch = s.match(/\$\s*([\d.]+)\s*[kK]?\s*\/\s*(?:month|mo(?:nth)?)\b/i);
  if (moMatch) {
    let val = parseFloat(moMatch[1]);
    if (/k/i.test(moMatch[0])) val *= 1000;
    return Math.round(val);
  }

  // 2. RaaS or lease with a dollar amount
  const raasMatch = s.match(/\$\s*([\d.]+)\s*[kK]?\s*\/?\s*(?:mo|month)/i);
  if (raasMatch) {
    let val = parseFloat(raasMatch[1]);
    if (/k/i.test(raasMatch[0])) val *= 1000;
    return Math.round(val);
  }

  // 3. Hourly rate (e.g., "$7/hour" for security robots)
  const hrMatch = s.match(/\$\s*([\d.]+)\s*\/\s*(?:hour|hr)\b/i);
  if (hrMatch) {
    // WHY: 720 = 24 hours * 30 days. Security robots patrol 24/7.
    return Math.round(parseFloat(hrMatch[1]) * 720);
  }

  // 4. Price range: $X-$Y or $X–$Y (purchase price → divide by 36)
  const rangeMatch = s.match(/\$\s*~?([\d.]+)\s*[kK]?\s*[-–]\s*\$?\s*~?([\d.]+)\s*[kK]?/);
  if (rangeMatch) {
    let low = parseFloat(rangeMatch[1]);
    let high = parseFloat(rangeMatch[2]);
    if (/k/i.test(rangeMatch[0].split('-')[0] || rangeMatch[0].split('–')[0])) low *= 1000;
    if (high < 100) high *= 1000; // WHY: "$50-$80,000" → $80K, not $80
    const midpoint = (low + high) / 2;
    return Math.round(midpoint / 36);
  }

  // 5. Single price: $X (purchase → divide by 36)
  const singleMatch = s.match(/\$\s*~?([\d.]+)\s*[kK]?/);
  if (singleMatch) {
    let val = parseFloat(singleMatch[1]);
    if (/k/i.test(singleMatch[0])) val *= 1000;
    if (val > 500) { // WHY: below $500 is likely already a monthly figure
      return Math.round(val / 36);
    }
    return Math.round(val);
  }

  return fallback || null;
}

// ── Self-test ──────────────────────────────────────────────────
const tests = [
  // Monthly explicit
  { input: '$599/month lease; ~$18,000-$25,000 purchase', expected: 599 },
  { input: '$2,000/month RaaS (~$75,000/3yr)', expected: 2000 },
  { input: '$375-$746/mo RaaS', expected: 375 },
  { input: '$479-$503/mo financing', expected: 479 },
  { input: '$5,400/month rental', expected: 5400 },
  { input: '$3,500/month lease', expected: 3500 },
  // Hourly
  { input: '$7/hour MaaS (~$100,000 purchase equivalent)', expected: 5040 },
  // Range (purchase → /36)
  { input: '$11,500-$16,400', expected: 388 },
  { input: '$15,000-$23,000', expected: 528 },
  { input: '~$50,000-$55,000', expected: 1458 },
  // Single (purchase → /36)
  { input: '$19,700', expected: 547 },
  { input: '$86,900', expected: 2414 },
  { input: '$64,790', expected: 1800 },
  // Fallback
  { input: 'not_publicly_listed', expected: 2850 },
  { input: null, expected: 2850 },
  { input: 'RaaS model; pricing on request', expected: 2850 },
];

const out = document.getElementById('test-output');
let passed = 0;
tests.forEach(t => {
  const result = parseMonthlyPrice(t.input, 2850);
  const ok = Math.abs(result - t.expected) <= t.expected * 0.15; // 15% tolerance
  passed += ok ? 1 : 0;
  out.textContent += `${ok ? '✓' : '✗'} "${t.input}" → $${result}/mo (expected ~$${t.expected}/mo)\n`;
});
out.textContent += `\n${passed}/${tests.length} passed`;
</script>
</body>
</html>
```

- [ ] **Step 2: Verify price parser in browser**

Open `http://localhost:3000/pages/fleet-designer.html`
Verify all test cases show ✓ (within 15% tolerance).
Adjust regex patterns if any fail.

- [ ] **Step 3: Commit**

```bash
git add pages/fleet-designer.html
git commit -m "feat(fleet-designer): scaffold page with price parser utility

Problem: The recommendation engine needs to extract monthly costs from
the catalog's messy price strings for budget scoring.
Solution: Add parseMonthlyPrice() with priority rules: explicit monthly
→ RaaS/lease → hourly → purchase range midpoint/36 → single price/36
→ fallback. Includes inline self-test."
```

---

### Task 3: Fleet Designer layout and input form

**Files:**
- Modify: `pages/fleet-designer.html`

Build the full two-column layout with the input form (left panel). No recommendation logic yet — just the UI shell.

- [ ] **Step 1: Replace the test scaffold with the full page layout**

Replace the entire contents of `pages/fleet-designer.html` with the full page. Keep the `parseMonthlyPrice()` function from Task 2.

The page structure:

```
<div class="page">
  <header class="header">
    <h1><span class="accent">Fleet</span> Designer</h1>
    <div class="deal-badge" id="deal-badge"></div>
  </header>
  <div class="body">
    <aside class="left-panel" id="left-panel">
      <!-- Property section -->
      <!-- Goals section -->
      <!-- Budget section -->
      <!-- Generate button -->
    </aside>
    <main class="right-panel" id="right-panel">
      <!-- Summary strip (hidden until fleet generated) -->
      <!-- Fleet slots (populated by JS) -->
      <!-- Export bar (hidden until fleet generated) -->
      <div class="empty-state" id="empty-state">
        <div class="empty-icon">⚡</div>
        <h3>Design a Fleet</h3>
        <p>Fill in the property details and goals, then click "Design My Fleet"</p>
      </div>
    </main>
  </div>
</div>
```

CSS requirements (matching the dark theme from the brainstorming mockup):
- `--bg: #0a0a0f`, `--accent: #00d4ff`, `--green: #00e676`, `--amber: #ff9800`, `--red: #ff5252`
- Left panel: 360px fixed width, scrollable, dark card background
- Right panel: flex-grow, scrollable independently
- Same fonts as catalog: Inter, Space Grotesk, JetBrains Mono (Google Fonts)
- Responsive: on screens < 900px, stack panels vertically

Input fields for the **Property** section:

| Field | ID | Type | Placeholder |
|---|---|---|---|
| Property Name | `prop-name` | text | "Kimpton Sawyer Hotel" |
| Room Count | `prop-rooms` | number | "250" |
| Floor Count | `prop-floors` | number | "16" |
| Guest Floors | `prop-guest-floors` | text | "4-16" |
| Elevator Count | `prop-elevators` | number | "4" |
| Floor Surfaces | `prop-surfaces` | checkboxes | carpet, hardwood, tile, terrazzo, outdoor |

Input fields for the **Goals & Pain Points** section (checkbox grid, 2 columns):

| Goal | ID | Maps to categories |
|---|---|---|
| Room Service | `goal-roomservice` | `delivery_robot`, `hotel_delivery_robot` |
| Corridor Cleaning | `goal-corridor` | `cleaning_robot` (carpet subset) |
| Lobby / Public Floor | `goal-lobby` | `cleaning_robot` (hard-floor subset) |
| Guest Wow Factor | `goal-wow` | `service_robot`, `social_robot`, `telepresence_robot` |
| Linen / Supply | `goal-linen` | `hospital_logistics_robot`, `delivery_robot` (high-payload) |
| Security / Patrol | `goal-security` | `security_robot` |
| Disinfection | `goal-disinfection` | `disinfection_robot` |
| Outdoor Service | `goal-outdoor` | any with `outdoor_capable: true` |
| Pool / Amenity | `goal-pool` | `outdoor_cleaning_robot`, `pool_cleaning_robot` |

Budget section:
- Two number inputs: min and max monthly RaaS budget
- Defaults: min = 5000, max = 50000
- Display as formatted currency

Generate button:
- Full-width cyan button: "⚡ Design My Fleet"
- `id="generate-btn"`
- Click handler will be wired in Task 4

- [ ] **Step 2: Add the results panel structure (right side)**

The right panel has these sections (all initially hidden except empty-state):

```html
<!-- Summary strip — 4 chips -->
<div class="summary-strip" id="summary-strip" style="display:none">
  <div class="summary-chip"><div class="val" id="sum-robots">0</div><div class="lbl">Robots</div></div>
  <div class="summary-chip"><div class="val" id="sum-cost">$0</div><div class="lbl">Monthly RaaS</div></div>
  <div class="summary-chip"><div class="val" id="sum-savings">$0</div><div class="lbl">Est. Savings</div></div>
  <div class="summary-chip"><div class="val" id="sum-roi">0x</div><div class="lbl">ROI Multiple</div></div>
</div>

<!-- Fleet slots container -->
<div id="fleet-slots"></div>

<!-- Export bar -->
<div class="export-bar" id="export-bar" style="display:none">
  <button class="export-btn primary" id="btn-download">↓ Export fleet.yml</button>
  <button class="export-btn" id="btn-copy">📋 Copy to clipboard</button>
  <div class="spacer"></div>
  <button class="export-btn" id="btn-reset">Reset</button>
</div>
```

- [ ] **Step 3: Verify layout in browser**

Open `http://localhost:3000/pages/fleet-designer.html`
Verify:
- Two-column layout renders correctly
- Left panel scrolls independently
- All input fields are present and functional
- Goal checkboxes toggle on click
- Budget inputs accept numbers
- "Design My Fleet" button is visible
- Right panel shows the empty state
- Responsive: resize to < 900px — panels stack vertically

- [ ] **Step 4: Commit**

```bash
git add pages/fleet-designer.html
git commit -m "feat(fleet-designer): two-column layout with input form

Problem: Need a UI for entering property details, goals, and budget
before the recommendation engine can generate a fleet.
Solution: Two-column layout — left panel with property fields, goal
checkboxes (9 categories), and budget range inputs. Right panel shows
empty state until fleet is generated."
```

---

### Task 4: Recommendation engine

**Files:**
- Modify: `pages/fleet-designer.html`

The core scoring engine. When the user clicks "Design My Fleet," it:
1. Reads inputs from the form
2. Loads robots from `robots.json`
3. For each checked goal, filters and scores candidates
4. Selects the top robot per slot, respecting budget
5. Renders the results

- [ ] **Step 1: Define the goal-to-category mapping and scoring constants**

Add this JavaScript inside the `<script>` tag, after `parseMonthlyPrice()`:

```js
/**
 * Goal definitions: each checked goal becomes a "slot" in the fleet.
 * Maps goal IDs to robot categories and filtering logic.
 */
const GOALS = {
  'goal-roomservice': {
    label: 'Room Service Delivery',
    type: 'delivery',
    categories: ['delivery_robot', 'hotel_delivery_robot'],
    requireElevator: true,
    requireKeyword: null,
    defaultSavings: 3800,
    serviceLine: 'Room Service'
  },
  'goal-corridor': {
    label: 'Corridor Carpet Cleaning',
    type: 'cleaning',
    categories: ['cleaning_robot'],
    requireElevator: true,
    requireKeyword: 'carpet|vacuum|corridor',
    defaultSavings: 4200,
    serviceLine: 'Corridor Cleaning'
  },
  'goal-lobby': {
    label: 'Lobby & Public Floor',
    type: 'cleaning',
    categories: ['cleaning_robot'],
    requireElevator: false,
    requireKeyword: 'scrub|mop|hard.?floor|lobby|polish',
    defaultSavings: 3500,
    serviceLine: 'Lobby Floor Care'
  },
  'goal-wow': {
    label: 'Guest Wow / Concierge',
    type: 'service',
    categories: ['service_robot', 'social_robot', 'telepresence_robot'],
    requireElevator: false,
    requireKeyword: null,
    defaultSavings: 1500,
    serviceLine: 'Guest Experience'
  },
  'goal-linen': {
    label: 'Linen & Supply Logistics',
    type: 'logistics',
    categories: ['hospital_logistics_robot', 'delivery_robot', 'hotel_delivery_robot'],
    requireElevator: true,
    requireKeyword: 'linen|supply|logistics|heavy|large.?payload',
    minPayloadKg: 20,
    defaultSavings: 4500,
    serviceLine: 'Linen & Supply'
  },
  'goal-security': {
    label: 'Security / Patrol',
    type: 'security',
    categories: ['security_robot'],
    requireElevator: false,
    requireKeyword: null,
    defaultSavings: 5000,
    serviceLine: 'Security'
  },
  'goal-disinfection': {
    label: 'Disinfection',
    type: 'cleaning',
    categories: ['disinfection_robot'],
    requireElevator: false,
    requireKeyword: null,
    defaultSavings: 3000,
    serviceLine: 'Disinfection'
  },
  'goal-outdoor': {
    label: 'Outdoor Service',
    type: 'service',
    categories: [], // WHY: empty — we filter by outdoor_capable instead
    requireElevator: false,
    requireOutdoor: true,
    requireKeyword: null,
    defaultSavings: 2500,
    serviceLine: 'Outdoor Service'
  },
  'goal-pool': {
    label: 'Pool / Amenity Area',
    type: 'cleaning',
    categories: ['outdoor_cleaning_robot', 'pool_cleaning_robot'],
    requireElevator: false,
    requireOutdoor: true,
    requireKeyword: null,
    defaultSavings: 2000,
    serviceLine: 'Pool & Amenity'
  }
};

// WHY: 36 months is a standard RaaS contract; used as the default fallback
// when a robot has no public monthly pricing
const DEFAULT_RAAS_MONTHLY = 2850;

// Scoring weights (must sum to 100)
const WEIGHT_CATEGORY = 30;
const WEIGHT_RISK = 25;
const WEIGHT_PRICE = 20;
const WEIGHT_SPEC = 15;
const WEIGHT_MARKET = 10;
```

- [ ] **Step 2: Implement the scoring function**

```js
/**
 * Score a single robot against a goal slot.
 * Returns 0-100 composite score.
 */
function scoreRobot(robot, goal, budgetPerSlot) {
  let categoryScore = 0;
  let riskScore = 0;
  let priceScore = 0;
  let specScore = 0;
  let marketScore = 0;

  // ── Category relevance (0-100) ──
  if (goal.categories.includes(robot.primary_category)) {
    categoryScore = 100;
  } else {
    // Check use-case keyword match
    const useCases = (robot.primary_use_cases || []).join(' ').toLowerCase();
    const notes = (robot.notes || '').toLowerCase();
    const allText = useCases + ' ' + notes;
    if (goal.requireKeyword) {
      const re = new RegExp(goal.requireKeyword, 'i');
      if (re.test(allText)) categoryScore = 70;
    }
    // Check if any target industry matches hospitality/hotel/hospital
    const industries = (robot.target_industries || []).join(' ').toLowerCase();
    if (/hotel|hospitality|hospital|senior|healthcare/.test(industries)) {
      categoryScore = Math.max(categoryScore, 40);
    }
  }

  // ── Import risk (0-100, lower risk = higher score) ──
  const risk = robot.import_risk_score || 5;
  riskScore = Math.max(0, (10 - risk) * 10); // 1→90, 5→50, 9→10

  // ── Price fit (0-100) ──
  const monthly = parseMonthlyPrice(robot.public_price, DEFAULT_RAAS_MONTHLY);
  if (monthly && budgetPerSlot) {
    if (monthly <= budgetPerSlot) {
      // Under budget = good. Closer to budget = slightly better (using more of allocation)
      priceScore = 60 + Math.round((monthly / budgetPerSlot) * 40);
    } else {
      // Over budget = penalize proportionally
      priceScore = Math.max(0, 100 - Math.round(((monthly - budgetPerSlot) / budgetPerSlot) * 100));
    }
  } else {
    priceScore = 50; // Neutral when price unknown
  }

  // ── Spec match (0-100) ──
  if (goal.requireElevator && robot.elevator_integration === true) specScore += 30;
  else if (goal.requireElevator && !robot.elevator_integration) specScore -= 20;
  if (robot.payload_kg && robot.payload_kg >= (goal.minPayloadKg || 0)) specScore += 20;
  if (robot.runtime_hours && robot.runtime_hours >= 6) specScore += 20;
  if (robot.fleet_management) specScore += 15;
  if (goal.requireOutdoor && robot.outdoor_capable) specScore += 30;
  else if (goal.requireOutdoor && !robot.outdoor_capable) specScore -= 40;
  specScore = Math.max(0, Math.min(100, specScore + 30)); // normalize: base 30 + bonuses

  // ── Market validation (0-100) ──
  if (robot.status === 'commercially_available') marketScore += 60;
  else if (robot.status === 'limited_production' || robot.status === 'early_access') marketScore += 30;
  // Bonus for deployment evidence in notes
  const notes = (robot.notes || '').toLowerCase();
  if (/deployed|deployment|install|customer|partner/.test(notes)) marketScore += 20;
  if (/\d{2,}[\s+]?(?:unit|robot|deploy|site|facilit)/.test(notes)) marketScore += 20;
  marketScore = Math.min(100, marketScore);

  // ── Composite ──
  const composite = Math.round(
    (categoryScore * WEIGHT_CATEGORY +
     riskScore * WEIGHT_RISK +
     priceScore * WEIGHT_PRICE +
     specScore * WEIGHT_SPEC +
     marketScore * WEIGHT_MARKET) / 100
  );

  return {
    score: composite,
    breakdown: { category: categoryScore, risk: riskScore, price: priceScore, spec: specScore, market: marketScore },
    monthlyEstimate: monthly
  };
}
```

- [ ] **Step 3: Implement the fleet generation function**

```js
/**
 * Generate a recommended fleet from checked goals and property inputs.
 * Returns an array of slot objects, each with the top 3 candidates.
 */
function generateFleet(robots) {
  // Read inputs
  const propName = document.getElementById('prop-name').value || 'Untitled Property';
  const propRooms = parseInt(document.getElementById('prop-rooms').value) || 0;
  const propFloors = parseInt(document.getElementById('prop-floors').value) || 0;
  const propElevators = parseInt(document.getElementById('prop-elevators').value) || 0;
  const budgetMin = parseInt(document.getElementById('budget-min').value) || 5000;
  const budgetMax = parseInt(document.getElementById('budget-max').value) || 50000;

  // Collect checked goals
  const checkedGoals = [];
  for (const [goalId, goalDef] of Object.entries(GOALS)) {
    const el = document.getElementById(goalId);
    if (el && el.classList.contains('active')) {
      checkedGoals.push({ id: goalId, ...goalDef });
    }
  }

  if (checkedGoals.length === 0) return [];

  const budgetPerSlot = Math.round(budgetMax / checkedGoals.length);
  const multiFloor = propFloors > 1 && propElevators > 0;

  // For each goal, filter candidates and score
  const slots = checkedGoals.map(goal => {
    // Filter
    let candidates = robots.filter(r => {
      // Must be commercially available (or at least announced)
      if (r.status !== 'commercially_available' && r.status !== 'limited_production' && r.status !== 'early_access') return false;

      // Category match (loose — scoring handles precision)
      if (goal.categories.length > 0) {
        const catMatch = goal.categories.includes(r.primary_category);
        const useCases = (r.primary_use_cases || []).join(' ').toLowerCase();
        const keywordMatch = goal.requireKeyword ? new RegExp(goal.requireKeyword, 'i').test(useCases + ' ' + (r.notes || '')) : false;
        if (!catMatch && !keywordMatch) return false;
      }

      // Outdoor requirement
      if (goal.requireOutdoor && !r.outdoor_capable) return false;

      // Elevator: hard filter only if multi-floor property AND goal requires it
      if (goal.requireElevator && multiFloor && r.elevator_integration === false) return false;

      // Payload minimum
      if (goal.minPayloadKg && r.payload_kg && r.payload_kg < goal.minPayloadKg) return false;

      return true;
    });

    // Score each candidate
    candidates = candidates.map(r => ({
      robot: r,
      ...scoreRobot(r, goal, budgetPerSlot)
    }));

    // Sort by score descending
    candidates.sort((a, b) => b.score - a.score);

    // Top 3
    const top3 = candidates.slice(0, 3);

    return {
      goalId: goal.id,
      label: goal.label,
      type: goal.type,
      serviceLine: goal.serviceLine,
      defaultSavings: goal.defaultSavings,
      savings: goal.defaultSavings, // editable later
      selected: top3[0] || null,
      alternatives: top3.slice(1),
      allCandidates: candidates.length
    };
  });

  return slots;
}
```

- [ ] **Step 4: Wire the generate button to render results**

```js
let currentSlots = [];
let allRobots = [];

// Load robots on page load
fetch('./data/robots.json')
  .then(res => res.json())
  .then(robots => {
    allRobots = robots;
    document.getElementById('robot-count').textContent = robots.length;
  })
  .catch(err => {
    console.error('Failed to load robots:', err);
  });

document.getElementById('generate-btn').addEventListener('click', () => {
  if (allRobots.length === 0) { alert('Robot data not loaded yet'); return; }
  currentSlots = generateFleet(allRobots);
  if (currentSlots.length === 0) { alert('Select at least one goal'); return; }
  renderFleet(currentSlots);
});
```

- [ ] **Step 5: Implement `renderFleet()` to display results**

```js
function renderFleet(slots) {
  // Hide empty state, show results
  document.getElementById('empty-state').style.display = 'none';
  document.getElementById('summary-strip').style.display = 'flex';
  document.getElementById('export-bar').style.display = 'flex';

  // Update summary
  const totalCost = slots.reduce((sum, s) => sum + (s.selected ? s.selected.monthlyEstimate : 0), 0);
  const totalSavings = slots.reduce((sum, s) => sum + s.savings, 0);
  document.getElementById('sum-robots').textContent = slots.length;
  document.getElementById('sum-cost').textContent = '$' + totalCost.toLocaleString();
  document.getElementById('sum-savings').textContent = '$' + totalSavings.toLocaleString();
  document.getElementById('sum-roi').textContent = totalCost > 0 ? (totalSavings / totalCost).toFixed(2) + 'x' : '—';

  // Render slots
  const container = document.getElementById('fleet-slots');
  container.innerHTML = slots.map((slot, i) => {
    if (!slot.selected) {
      return `<div class="fleet-slot empty-slot">
        <div class="slot-num">${i + 1}</div>
        <div class="slot-info">
          <div class="slot-role">${slot.label}</div>
          <div class="slot-robot" style="opacity:0.4">No matching robots found in catalog</div>
        </div>
      </div>`;
    }
    const r = slot.selected.robot;
    const riskClass = (r.import_risk_score || 0) <= 3 ? 'risk-low' : (r.import_risk_score || 0) <= 6 ? 'risk-med' : 'risk-high';
    const altCount = slot.alternatives.length;
    return `<div class="fleet-slot" data-slot="${i}" onclick="toggleComparison(${i})">
      <div class="slot-num">${i + 1}</div>
      <div class="slot-info">
        <div class="slot-role">${slot.label}</div>
        <div class="slot-robot">${r.company} ${r.model_name} — ${(r.primary_use_cases || []).slice(0, 2).join(', ')}</div>
        <div class="slot-meta">
          ${r.elevator_integration ? '✓ Elevator' : '✗ No elevator'} · 
          <span class="${riskClass}">Risk: ${r.import_risk_level || '?'}</span> · 
          Score: ${slot.selected.score}/100
        </div>
      </div>
      <div class="slot-price">
        <div class="amount">$${(slot.selected.monthlyEstimate || 0).toLocaleString()}</div>
        <div class="period">/month</div>
        ${altCount > 0 ? `<div class="slot-swap">compare ${altCount + 1} →</div>` : ''}
      </div>
    </div>
    <div class="comparison" id="comp-${i}" style="display:none"></div>`;
  }).join('');
}
```

- [ ] **Step 6: Verify recommendation engine in browser**

Open `http://localhost:3000/pages/fleet-designer.html`
1. Enter: Property = "Test Hotel", Rooms = 200, Floors = 10, Elevators = 2
2. Check goals: Room Service, Corridor Cleaning, Lobby Floor
3. Set budget: $10,000 - $30,000
4. Click "Design My Fleet"

Verify:
- 3 fleet slots appear
- Each shows a robot name, company, score, and monthly price
- Summary strip shows correct totals
- Slot 1 (Room Service) recommends a delivery robot with elevator support
- Slot 2 (Corridor) recommends a cleaning robot with carpet/vacuum capability
- No console errors

- [ ] **Step 7: Commit**

```bash
git add pages/fleet-designer.html
git commit -m "feat(fleet-designer): recommendation engine with scoring

Problem: Need to automatically recommend the best robots for each
client goal based on category match, import risk, price, specs, and
market validation.
Solution: 5-factor weighted scoring engine (category 30%, risk 25%,
price 20%, spec 15%, market 10%). Filters catalog per goal, scores
all candidates, selects top pick and top-3 alternatives per slot."
```

---

### Task 5: Comparison view and slot swapping

**Files:**
- Modify: `pages/fleet-designer.html`

When the user clicks a fleet slot, expand it to show the top-3 comparison cards. Clicking "Swap" on an alternative replaces the slot's selected robot and recalculates totals.

- [ ] **Step 1: Implement `toggleComparison()` and `renderComparison()`**

```js
function toggleComparison(slotIdx) {
  const el = document.getElementById('comp-' + slotIdx);
  if (el.style.display === 'none') {
    // Close all other comparisons first
    document.querySelectorAll('.comparison').forEach(c => c.style.display = 'none');
    document.querySelectorAll('.fleet-slot').forEach(s => s.classList.remove('expanded'));

    el.style.display = 'block';
    el.previousElementSibling.classList.add('expanded');
    renderComparison(slotIdx);
  } else {
    el.style.display = 'none';
    el.previousElementSibling.classList.remove('expanded');
  }
}

function renderComparison(slotIdx) {
  const slot = currentSlots[slotIdx];
  const all = [slot.selected, ...slot.alternatives].filter(Boolean);
  const el = document.getElementById('comp-' + slotIdx);

  el.innerHTML = `
    <div class="comp-header">Top ${all.length} candidates for ${slot.label} (${slot.allCandidates} evaluated)</div>
    <div class="comp-grid">
      ${all.map((c, ci) => {
        const r = c.robot;
        const isSelected = ci === 0;
        const riskClass = (r.import_risk_score || 0) <= 3 ? 'risk-low' : (r.import_risk_score || 0) <= 6 ? 'risk-med' : 'risk-high';
        return `<div class="comp-card ${isSelected ? 'selected' : ''}" onclick="swapRobot(${slotIdx}, ${ci})">
          <div class="name">${r.model_name}</div>
          <div class="company">${r.company}</div>
          <div class="comp-stat"><span class="k">Score</span><span>${c.score}/100</span></div>
          <div class="comp-stat"><span class="k">Monthly</span><span>$${(c.monthlyEstimate || 0).toLocaleString()}</span></div>
          <div class="comp-stat"><span class="k">Payload</span><span>${r.payload_kg ? r.payload_kg + ' kg' : '—'}</span></div>
          <div class="comp-stat"><span class="k">Runtime</span><span>${r.runtime_hours ? r.runtime_hours + 'h' : '—'}</span></div>
          <div class="comp-stat"><span class="k">Elevator</span><span style="color:${r.elevator_integration ? '#00e676' : '#ff5252'}">${r.elevator_integration ? 'Yes' : 'No'}</span></div>
          <div class="comp-stat"><span class="k">Risk</span><span class="${riskClass}">${r.import_risk_level || '?'}</span></div>
          ${(r.key_differentiators || []).slice(0, 2).map(d => `<div class="comp-diff">• ${d}</div>`).join('')}
          <div class="pick-btn">${isSelected ? '★ Selected' : 'Swap to this'}</div>
        </div>`;
      }).join('')}
    </div>
  `;
}
```

- [ ] **Step 2: Implement `swapRobot()`**

```js
function swapRobot(slotIdx, candidateIdx) {
  const slot = currentSlots[slotIdx];
  const all = [slot.selected, ...slot.alternatives].filter(Boolean);
  if (candidateIdx === 0) return; // Already selected

  // Swap: move current selected to alternatives, promote clicked one
  const newSelected = all[candidateIdx];
  const newAlternatives = all.filter((_, i) => i !== candidateIdx && i !== 0);
  newAlternatives.unshift(slot.selected); // old selected becomes first alternative

  slot.selected = newSelected;
  slot.alternatives = newAlternatives;

  // Re-render
  renderFleet(currentSlots);
  // Re-open this comparison
  setTimeout(() => toggleComparison(slotIdx), 50);
}
```

- [ ] **Step 3: Verify comparison view in browser**

Open Fleet Designer, generate a fleet, then:
1. Click slot 1 — comparison panel expands with up to 3 cards
2. Verify selected card is highlighted
3. Click "Swap to this" on an alternative
4. Verify the slot updates with the new robot
5. Verify summary strip recalculates
6. Click the same slot again — comparison panel collapses

- [ ] **Step 4: Commit**

```bash
git add pages/fleet-designer.html
git commit -m "feat(fleet-designer): comparison cards and robot swapping

Problem: Users need to see alternatives and swap robots per slot
after the initial recommendation.
Solution: Expandable comparison cards (top 3 per slot) with specs,
risk, and differentiators. Click 'Swap' to replace the selected
robot and recalculate fleet totals."
```

---

### Task 6: fleet.yml export

**Files:**
- Modify: `pages/fleet-designer.html`

Generate a proposal-ready `fleet.yml` string from the current fleet configuration and offer download + clipboard copy.

- [ ] **Step 1: Implement `generateFleetYaml()`**

```js
/**
 * Generate fleet.yml content from the current fleet slots.
 * Format matches the proposal generator's expected schema.
 */
function generateFleetYaml() {
  const propName = document.getElementById('prop-name').value || 'Untitled Property';
  const today = new Date().toISOString().slice(0, 10);
  const totalCost = currentSlots.reduce((s, sl) => s + (sl.selected ? sl.selected.monthlyEstimate : 0), 0);
  const totalSavings = currentSlots.reduce((s, sl) => s + sl.savings, 0);

  let yaml = `# Generated by Fleet Designer — ${today}\n`;
  yaml += `# Property: ${propName}\n`;
  yaml += `# Total: ${currentSlots.length} robots, $${totalCost.toLocaleString()}/mo RaaS, $${totalSavings.toLocaleString()}/mo est. savings\n\n`;

  yaml += `robots:\n`;
  currentSlots.forEach((slot, i) => {
    if (!slot.selected) return;
    const r = slot.selected.robot;
    // WHY: code is an abbreviated model name — strip common prefixes like "DINERBOT", "KLEENBOT"
    const code = r.model_name.replace(/^(DINERBOT|KLEENBOT|CLOi|DeliveryBot)\s*/i, '').replace(/\s+/g, '-');
    const altStr = slot.alternatives.map(a => `${a.robot.model_name} (${a.score})`).join(', ');

    yaml += `  - code: "${code}"\n`;
    yaml += `    label: "${slot.label}"\n`;
    yaml += `    role: "${slot.label} — ${r.company} ${r.model_name}"\n`;
    yaml += `    photo: "../assets/robots/photos/${r.company.toLowerCase().replace(/\s+/g, '-')}-${code.toLowerCase()}.png"\n`;
    yaml += `    type: ${slot.type}\n`;
    yaml += `    captures: "${slot.serviceLine} labor offset"\n`;
    yaml += `    savings: ${slot.savings}\n`;
    yaml += `    service_line: "${slot.serviceLine}"\n`;
    yaml += `    unlock_text: ""\n`;
    yaml += `    tier: ${i < 1 ? 1 : i < 3 ? 2 : 3}\n`;
    yaml += `    # Source: robots.json — ${r.company} ${r.model_name} (score: ${slot.selected.score}/100)\n`;
    if (altStr) yaml += `    # Alternatives: ${altStr}\n`;
    yaml += `\n`;
  });

  // Presets
  const count = currentSlots.length;
  yaml += `presets:\n`;
  yaml += `  - name: "Pilot"\n    count: 1\n`;
  if (count >= 3) yaml += `  - name: "Signature"\n    count: ${Math.min(3, count)}\n`;
  if (count >= 4) yaml += `  - name: "Full-Property"\n    count: ${count}\n`;
  yaml += `\ndefault_preset: ${count >= 3 ? 1 : 0}\n`;

  return yaml;
}
```

- [ ] **Step 2: Wire export buttons**

```js
document.getElementById('btn-download').addEventListener('click', () => {
  const yaml = generateFleetYaml();
  const blob = new Blob([yaml], { type: 'text/yaml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'fleet.yml';
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('btn-copy').addEventListener('click', () => {
  const yaml = generateFleetYaml();
  navigator.clipboard.writeText(yaml).then(() => {
    const btn = document.getElementById('btn-copy');
    btn.textContent = '✓ Copied!';
    setTimeout(() => { btn.textContent = '📋 Copy to clipboard'; }, 2000);
  });
});

document.getElementById('btn-reset').addEventListener('click', () => {
  currentSlots = [];
  document.getElementById('fleet-slots').innerHTML = '';
  document.getElementById('summary-strip').style.display = 'none';
  document.getElementById('export-bar').style.display = 'none';
  document.getElementById('empty-state').style.display = 'block';
});
```

- [ ] **Step 3: Verify export in browser**

1. Generate a fleet
2. Click "Export fleet.yml" — verify a `.yml` file downloads
3. Open the file and verify it matches the expected format (robots, presets, comments with scores and alternatives)
4. Click "Copy to clipboard" — paste into a text editor — verify same content
5. Click "Reset" — verify fleet clears and empty state returns

- [ ] **Step 4: Commit**

```bash
git add pages/fleet-designer.html
git commit -m "feat(fleet-designer): fleet.yml export with download and clipboard

Problem: The designed fleet needs to be exported as fleet.yml for
the proposal generator.
Solution: generateFleetYaml() produces YAML matching the proposal
generator schema, with robot entries, presets, and comments documenting
scores and alternatives. Download and clipboard buttons."
```

---

### Task 7: Polish and integration links

**Files:**
- Modify: `pages/fleet-designer.html`
- Modify: `pages/robot-catalog.html` (add link to Fleet Designer)

Final polish: add a link from the robot catalog to the Fleet Designer, ensure the catalog link works from the Fleet Designer, and add the Fleet Designer to the project dashboard.

- [ ] **Step 1: Add a "Design a Fleet" button to the robot catalog header**

In `robot-catalog.html`, in the hero section or navigator panel, add a link:

```html
<a href="fleet-designer.html" class="fleet-link">⚡ Fleet Designer</a>
```

Style it as a small pill/button in the navigator bar, matching the existing UI style.

- [ ] **Step 2: Add a "Browse Full Catalog" link in the Fleet Designer**

In the Fleet Designer header, add:

```html
<a href="robot-catalog.html" class="catalog-link">📊 Full Catalog (222 robots)</a>
```

Update the robot count dynamically after loading `robots.json`.

- [ ] **Step 3: Add Fleet Designer to project dashboard**

In `~/Code/project-dashboard.html`, find the Accelerate Robotics card and add a link:

```html
<a href="accelerate-robotics/pages/fleet-designer.html">⚡ Fleet Designer</a>
```

- [ ] **Step 4: Full end-to-end test**

1. Open robot catalog → verify "Fleet Designer" link works
2. Open Fleet Designer → verify "Full Catalog" link works
3. Enter a real property: Thesis Hotel (245 rooms, 10 floors, 2 elevators, carpet corridors)
4. Check goals: Room Service, Corridor Cleaning, Lobby Floor, Guest Wow, Linen/Supply
5. Budget: $10,000–$25,000
6. Click "Design My Fleet"
7. Verify 5 slots appear with reasonable robots
8. Expand a slot and swap a robot
9. Export fleet.yml and verify content
10. Open project dashboard → verify Fleet Designer link works

- [ ] **Step 5: Commit**

```bash
git add pages/fleet-designer.html pages/robot-catalog.html
git commit -m "feat(fleet-designer): cross-links and integration polish

Problem: Fleet Designer and Robot Catalog need to link to each other,
and the Fleet Designer needs to appear on the project dashboard.
Solution: Added navigation links between catalog and Fleet Designer,
updated project dashboard with Fleet Designer entry."
```

---

## Self-Review Checklist

### Spec coverage
- [x] Shared data layer (`robots.json`) — Task 1
- [x] Price parser — Task 2
- [x] Two-column layout with inputs — Task 3
- [x] Recommendation engine (filter → score → select) — Task 4
- [x] Comparison view with swap — Task 5
- [x] fleet.yml export — Task 6
- [x] Integration links — Task 7
- [x] Summary strip — Task 4 (renderFleet)
- [x] Goal-to-category mapping — Task 4 (GOALS constant)
- [x] Budget range — Task 3 (inputs) + Task 4 (budgetPerSlot)
- [x] Preset/tier generation — Task 6 (generateFleetYaml)
- [x] Savings estimation — Task 4 (defaultSavings per goal)

### Not covered (explicitly out of scope per spec)
- Client-facing "Why These Robots" in proposals — deferred to v2
- Deal API integration ("Save to OPP-007") — deferred
- AI/LLM recommendations — v1 uses deterministic scoring

### Placeholder scan
- No TBDs, TODOs, or "implement later" found
- All code blocks are complete
- All functions are defined before use
- All DOM IDs are consistent across HTML and JS references

### Type consistency
- `parseMonthlyPrice()` returns a number (used by scoreRobot and renderFleet)
- `scoreRobot()` returns `{ score, breakdown, monthlyEstimate }` (used by generateFleet)
- `generateFleet()` returns `[{ goalId, label, type, serviceLine, defaultSavings, savings, selected, alternatives, allCandidates }]` (used by renderFleet, generateFleetYaml)
- `slot.selected` is `{ robot, score, breakdown, monthlyEstimate }` or `null`
- `slot.alternatives` is an array of the same shape
- All consistent across Tasks 4, 5, and 6
