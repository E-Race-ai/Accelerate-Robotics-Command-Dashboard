# Universal Proposal Generator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a user clicks "Generate Proposal" in the Fleet Designer, open a fully interactive proposal page — modeled on the Moore Miami gold standard — populated dynamically with fleet data and Claude-generated narratives.

**Architecture:** Static HTML proposal page (`pages/proposal.html`) receives fleet data via localStorage or URL hash. On load, it calls `POST /api/narrate` (Express + Anthropic SDK) for Claude-generated narratives, then renders an interactive page with slider, robot grid, ROI calculator, phase timeline, and property theming. Fallback templates render if narration fails.

**Tech Stack:** Express.js, @anthropic-ai/sdk (Claude Haiku), Tailwind CSS (CDN), vanilla JS, Vitest

**Spec:** `docs/superpowers/specs/2026-04-21-universal-proposal-generator-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `src/routes/narrate.js` | **New.** POST /api/narrate — validates input, calls Claude Haiku, returns narrative JSON |
| `src/server.js` | **Modify.** Mount narrate route, add rate limiter |
| `.env.example` | **Modify.** Add ANTHROPIC_API_KEY |
| `package.json` | **Modify.** Add @anthropic-ai/sdk dependency |
| `tests/integration/narrate.test.js` | **New.** Integration tests for narration endpoint |
| `pages/fleet-designer.html` | **Modify.** Add `launchProposal()`, update `updateProposalButton()` |
| `pages/proposal.html` | **New.** Universal interactive proposal page (HTML + CSS + JS) |

---

### Task 1: Narration API Endpoint

**Files:**
- Create: `src/routes/narrate.js`
- Modify: `src/server.js:14-15` (add import), `src/server.js:89-99` (mount route)
- Modify: `.env.example` (add ANTHROPIC_API_KEY)
- Modify: `package.json` (add dependency)
- Test: `tests/integration/narrate.test.js`

- [ ] **Step 1: Install the Anthropic SDK**

```bash
cd /Users/ericrace/Code/accelerate-robotics
npm install @anthropic-ai/sdk
```

Expected: `package.json` now has `"@anthropic-ai/sdk"` in dependencies.

- [ ] **Step 2: Add ANTHROPIC_API_KEY to .env.example**

Add this line at the end of `.env.example`:

```
# Anthropic API key — used by /api/narrate for proposal narrative generation
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

- [ ] **Step 3: Create the narrate route**

Create `src/routes/narrate.js`:

```js
const express = require('express');
const Anthropic = require('@anthropic-ai/sdk').default;

const router = express.Router();

// WHY: Lazy-init the client so the server starts even without an API key —
// narration is a nice-to-have, not a boot requirement.
let client = null;
function getClient() {
  if (!client && process.env.ANTHROPIC_API_KEY) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

// WHY: 800 max tokens keeps responses focused and cost low (~$0.001/call with Haiku).
// The structured JSON output rarely exceeds 600 tokens.
const MAX_TOKENS = 800;

const SYSTEM_PROMPT = `You are a proposal writer for Accelerate Robotics, a company that deploys autonomous robot fleets in hotels, hospitals, and commercial buildings. Write in a professional hospitality voice — confident but not salesy, specific to the property.

Return ONLY valid JSON matching this schema (no markdown fences, no extra text):
{
  "intro": "2-3 sentence property-specific intro",
  "headline": "Short punchy headline for the configurator section",
  "valueProp": "1-2 sentences about what the fleet delivers",
  "robots": [
    {
      "goalId": "the goalId from the input",
      "roleDescription": "One-line role for this robot at this property",
      "unlockNarrative": "One sentence about what this robot enables for guests/staff",
      "savingsCapture": "What cost/labor this robot replaces"
    }
  ],
  "tierName": "Name for the current service tier",
  "tierNarrative": "2-3 sentences describing what this tier means for the property",
  "phases": [
    {
      "name": "Phase name",
      "timeframe": "Month N or Months N-M",
      "description": "1-2 sentences about what deploys in this phase"
    }
  ]
}`;

function buildUserPrompt(data) {
  const { property, facility, fleet } = data;
  const robotList = fleet.map((s, i) => (
    `${i + 1}. ${s.robot.company} ${s.robot.model_name} — ${s.serviceLine} (score: ${s.score}, saves $${s.savings}/mo)`
  )).join('\n');

  // WHY: Derive phase count from fleet size — same logic the proposal page uses.
  // Providing it here so narratives reference the right number of phases.
  const phaseCount = fleet.length <= 1 ? 1
    : fleet.length <= 3 ? 2
    : fleet.length <= 6 ? 3
    : 4;

  return `Generate proposal narratives for this property:

Property: ${property.name} — ${property.rooms} rooms, ${property.floors} floors, ${property.type} in ${property.market || 'unknown market'}
Elevators: ${property.elevators || 0} (${facility?.elevatorMake || 'unknown make'})
F&B outlets: ${facility?.fbOutlets || 0}
Event space: ${facility?.eventSpaceSqFt || 0} sqft
Outdoor amenities: ${(facility?.outdoorAmenities || []).join(', ') || 'none'}
Surfaces: ${(facility?.surfaces || []).join(', ') || 'unknown'}

Fleet (${fleet.length} robots, ordered by score):
${robotList}

Generate narratives for ${phaseCount} deployment phases.`;
}

router.post('/narrate', async (req, res) => {
  const { property, facility, fleet } = req.body;

  if (!property || !property.name) {
    return res.status(400).json({ error: 'property.name is required' });
  }
  if (!fleet || !Array.isArray(fleet) || fleet.length === 0) {
    return res.status(400).json({ error: 'fleet must be a non-empty array' });
  }

  // WHY: Max 15 robots prevents prompt abuse — the fleet designer never produces more than ~9
  const MAX_FLEET_SIZE = 15;
  if (fleet.length > MAX_FLEET_SIZE) {
    return res.status(400).json({ error: `fleet cannot exceed ${MAX_FLEET_SIZE} robots` });
  }

  const anthropic = getClient();
  if (!anthropic) {
    return res.status(503).json({ error: 'Narration service unavailable — ANTHROPIC_API_KEY not configured' });
  }

  try {
    const message = await anthropic.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: MAX_TOKENS,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: buildUserPrompt({ property, facility, fleet }) }],
    });

    const text = message.content[0]?.text || '';

    // WHY: Parse the JSON response — Claude should return raw JSON per the system prompt.
    // If parsing fails, return the raw text so the client can show a fallback.
    let narratives;
    try {
      narratives = JSON.parse(text);
    } catch {
      return res.status(502).json({
        error: 'Failed to parse narrative response',
        raw: text,
      });
    }

    return res.json(narratives);
  } catch (err) {
    console.error('[narrate] Claude API error:', err.message);
    return res.status(502).json({ error: 'Narrative generation failed', detail: err.message });
  }
});

module.exports = router;
```

- [ ] **Step 4: Mount the narrate route in server.js**

In `src/server.js`, add the import after the existing route imports (around line 16):

```js
const narrateRoutes = require('./routes/narrate');
```

Add the rate limiter after the existing `inquiryLimiter` (around line 62):

```js
// WHY: 10 proposals per IP per hour — generous for iteration, prevents abuse
const narrateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many narration requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
```

Mount the route in the API routes section (around line 99):

```js
app.use('/api', narrateLimiter, narrateRoutes);
```

- [ ] **Step 5: Write integration tests**

Create `tests/integration/narrate.test.js`:

```js
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// WHY: Mock the Anthropic SDK so tests don't need a real API key or make network calls.
// We're testing our route logic (validation, prompt construction, error handling),
// not the Anthropic SDK itself.
vi.mock('@anthropic-ai/sdk', () => {
  const mockCreate = vi.fn();
  return {
    default: class MockAnthropic {
      constructor() {
        this.messages = { create: mockCreate };
      }
    },
    __mockCreate: mockCreate,
  };
});

// WHY: Set the key before requiring the route so getClient() initializes
process.env.ANTHROPIC_API_KEY = 'sk-ant-test-key';

const express = require('express');
const narrateRoutes = require('../../src/routes/narrate');

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use('/api', narrateRoutes);
  return app;
}

function validPayload() {
  return {
    property: { name: 'Test Hotel', type: 'hotel', rooms: 100, floors: 5, elevators: 1, market: 'Miami' },
    facility: { fbOutlets: 2, eventSpaceSqFt: 0, outdoorAmenities: [], surfaces: ['carpet'] },
    fleet: [
      {
        goalId: 'goal-lobby',
        serviceLine: 'Lobby Floor Care',
        type: 'cleaning',
        savings: 3500,
        robot: { company: 'Keenon', model_name: 'C40', image_url: '', primary_use_cases: [] },
        score: 87,
        monthlyEstimate: 2200,
      },
    ],
  };
}

describe('POST /api/narrate', () => {
  let app;
  let mockCreate;

  beforeEach(async () => {
    // WHY: Get the mock function from our mock module to control responses per test
    const mod = await import('@anthropic-ai/sdk');
    mockCreate = mod.__mockCreate;
    mockCreate.mockReset();
    app = buildApp();
  });

  it('returns 400 when property.name is missing', async () => {
    const res = await fetch(await startServer(app), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property: {}, fleet: [{ goalId: 'x' }] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/property\.name/);
  });

  it('returns 400 when fleet is empty', async () => {
    const res = await fetch(await startServer(app), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property: { name: 'Test' }, fleet: [] }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/non-empty/);
  });

  it('returns 400 when fleet exceeds 15 robots', async () => {
    const bigFleet = Array.from({ length: 16 }, (_, i) => ({
      goalId: `goal-${i}`, serviceLine: `Line ${i}`, type: 'cleaning',
      savings: 1000, robot: { company: 'X', model_name: 'Y' }, score: 50, monthlyEstimate: 1000,
    }));
    const res = await fetch(await startServer(app), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ property: { name: 'Test' }, fleet: bigFleet }),
    });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/exceed/);
  });

  it('returns narrative JSON on success', async () => {
    const narrative = {
      intro: 'Test Hotel is a 100-room property...',
      headline: 'Watch the operation transform.',
      valueProp: 'Every robot reclaims hours...',
      robots: [{ goalId: 'goal-lobby', roleDescription: 'Floor scrubber', unlockNarrative: 'Clean floors', savingsCapture: 'EVS shift' }],
      tierName: 'Pilot',
      tierNarrative: 'Starting with one robot...',
      phases: [{ name: 'Pilot', timeframe: 'Month 1', description: 'One C40 overnight.' }],
    };
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: JSON.stringify(narrative) }],
    });

    const res = await fetch(await startServer(app), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload()),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.intro).toBe(narrative.intro);
    expect(body.robots).toHaveLength(1);
    expect(body.robots[0].goalId).toBe('goal-lobby');
  });

  it('returns 502 when Claude returns invalid JSON', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'This is not JSON' }],
    });

    const res = await fetch(await startServer(app), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload()),
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error).toMatch(/parse/);
    expect(body.raw).toBe('This is not JSON');
  });

  it('returns 502 when Claude API throws', async () => {
    mockCreate.mockRejectedValueOnce(new Error('rate_limit_exceeded'));

    const res = await fetch(await startServer(app), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload()),
    });
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.detail).toMatch(/rate_limit/);
  });
});

// WHY: Helper that starts the Express app on a random port and returns the base URL.
// Using node's native http.createServer to avoid port conflicts between test runs.
const http = require('http');
const servers = [];

async function startServer(app) {
  return new Promise((resolve) => {
    const server = http.createServer(app);
    servers.push(server);
    server.listen(0, () => {
      const port = server.address().port;
      resolve(`http://localhost:${port}`);
    });
  });
}

afterEach(() => {
  servers.forEach(s => s.close());
  servers.length = 0;
});
```

- [ ] **Step 6: Run the tests**

```bash
cd /Users/ericrace/Code/accelerate-robotics
npx vitest run tests/integration/narrate.test.js
```

Expected: All 5 tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/routes/narrate.js src/server.js .env.example package.json package-lock.json tests/integration/narrate.test.js
git commit -m "feat(narrate): add /api/narrate endpoint for proposal narrative generation

Problem: Proposal pages need property-specific narratives but generating
them client-side would expose the API key.

Solution: Server-side endpoint that calls Claude Haiku with fleet data
and returns structured narrative JSON. Rate-limited to 10 req/IP/hour.
Includes integration tests with mocked Anthropic SDK."
```

---

### Task 2: Fleet Designer — launchProposal() Handoff

**Files:**
- Modify: `pages/fleet-designer.html:3601-3624` (updateProposalButton)
- Modify: `pages/fleet-designer.html:3657-3766` (after downloadProposalConfig)

- [ ] **Step 1: Add the `launchProposal()` function**

Add this function in `pages/fleet-designer.html` right after the `downloadProposalConfig()` function (after the closing `}` around line 3766):

```js
// ─────────────────────────────────────────────────────────────
// launchProposal — writes fleet data to localStorage and opens
// the universal proposal page in a new tab.
// ─────────────────────────────────────────────────────────────
function launchProposal() {
    const propSelect = document.getElementById('prop-name');
    const propKey = propSelect.value;
    const pipelineProp = PIPELINE[propKey];
    const prospectKey = propKey.startsWith('prospect-') ? propKey.replace('prospect-', '') : null;
    const prospect = prospectKey ? PROSPECTS[prospectKey] : null;
    const p = pipelineProp || prospect;
    const name = p ? p.name : (propSelect.options[propSelect.selectedIndex]?.text || 'New Property');

    // Gather property basics from the form
    const property = {
        name: name,
        type: document.querySelector('.prop-type.active')?.dataset.type || 'hotel',
        rooms: parseInt(document.getElementById('prop-rooms').value) || 0,
        floors: parseInt(document.getElementById('prop-floors').value) || 1,
        guestFloors: document.getElementById('prop-guest-floors').value || '',
        elevators: parseInt(document.getElementById('prop-elevators').value) || 0,
        market: p?.market || null,
    };

    // Gather facility details
    const elevMakeSelect = document.getElementById('fd-elevator-make');
    const elevCustom = document.getElementById('fd-elevator-custom');
    let elevMake = elevMakeSelect.value;
    if (elevMake === 'Other' && elevCustom.value.trim()) {
        elevMake = elevCustom.value.trim();
    }

    const outdoorAmenities = [];
    document.querySelectorAll('#amenity-grid .amenity-chip input:checked').forEach(cb => outdoorAmenities.push(cb.value));

    const surfaceZones = {};
    document.querySelectorAll('.zone-group').forEach(group => {
        const zoneKey = group.dataset.zone;
        const checked = [];
        group.querySelectorAll('.zone-chip.checked').forEach(chip => checked.push(chip.dataset.surface));
        if (checked.length > 0) surfaceZones[zoneKey] = checked;
    });

    const surfaces = [];
    document.querySelectorAll('.surface-chip input:checked').forEach(cb => surfaces.push(cb.value));

    const facility = {
        elevatorMake: elevMake || null,
        elevatorGuestCount: parseInt(document.getElementById('fd-elevator-guest').value) || 0,
        elevatorServiceCount: parseInt(document.getElementById('fd-elevator-service').value) || 0,
        outdoorAmenities,
        fbOutlets: parseInt(document.getElementById('fd-fb-outlets').value) || 0,
        eventSpaceSqFt: parseInt(document.getElementById('fd-event-sqft').value) || 0,
        surfaceZones: Object.keys(surfaceZones).length > 0 ? surfaceZones : null,
        surfaces,
    };

    // Gather fleet slots (only those with a selected robot)
    const fleet = currentSlots.filter(s => s.selected).map(s => ({
        goalId: s.goalId,
        serviceLine: s.serviceLine,
        type: s.type,
        savings: s.savings,
        robot: {
            company: s.selected.robot.company,
            model_name: s.selected.robot.model_name,
            image_url: s.selected.robot.image_url || '',
            primary_use_cases: s.selected.robot.primary_use_cases || [],
            payload_kg: s.selected.robot.payload_kg,
            elevator_integration: s.selected.robot.elevator_integration || false,
            public_price: s.selected.robot.public_price || '',
        },
        score: s.selected.score,
        monthlyEstimate: s.selected.monthlyEstimate,
    }));

    // Compute summary
    const totalMonthlyCost = fleet.reduce((sum, s) => sum + s.monthlyEstimate, 0);
    const totalAnnualSavings = fleet.reduce((sum, s) => sum + s.savings, 0) * 12;
    const annualCost = totalMonthlyCost * 12;
    // WHY: ROI multiple = annual savings / annual cost — how many times the investment pays back
    const roiMultiple = annualCost > 0 ? (totalAnnualSavings / annualCost) : 0;

    const payload = {
        property,
        facility,
        fleet,
        summary: {
            totalRobots: fleet.length,
            totalMonthlyCost,
            totalAnnualSavings,
            roiMultiple: parseFloat(roiMultiple.toFixed(1)),
        },
        generatedAt: new Date().toISOString(),
    };

    localStorage.setItem('accelerate-proposal', JSON.stringify(payload));
    window.open('proposal.html', '_blank');
}
```

- [ ] **Step 2: Update `updateProposalButton()` to use launchProposal()**

Replace the else branch in `updateProposalButton()` (the section that currently calls `downloadProposalConfig()`):

Find this block (around line 3616-3624):
```js
    } else {
        // No existing proposal — download a pre-filled config.yml
        btn.href = '#';
        btn.title = 'Download config.yml for proposal generator';
        btn.onclick = function(e) {
            e.preventDefault();
            downloadProposalConfig();
        };
    }
```

Replace with:
```js
    } else {
        // No existing proposal — launch universal proposal page
        btn.href = '#';
        btn.title = 'Generate interactive proposal';
        btn.onclick = function(e) {
            e.preventDefault();
            launchProposal();
        };
    }
```

- [ ] **Step 3: Test manually**

1. Start the dev server: `npm run dev`
2. Open `http://localhost:3000/pages/fleet-designer.html`
3. Select a pipeline property (e.g., Thesis Hotel), configure goals, click "Generate Fleet"
4. Click "Generate Proposal" — should open `proposal.html` in a new tab
5. Open browser console on the new tab. Run: `JSON.parse(localStorage.getItem('accelerate-proposal'))`
6. Verify the payload has `property`, `facility`, `fleet`, and `summary` with correct values

- [ ] **Step 4: Commit**

```bash
git add pages/fleet-designer.html
git commit -m "feat(fleet-designer): add launchProposal() to open universal proposal page

Problem: Generate Proposal button downloads a config.yml for properties
without a bespoke proposal repo — not shareable or interactive.

Solution: New launchProposal() writes fleet data to localStorage and
opens pages/proposal.html in a new tab. Properties with existing
proposal repos still link directly to their bespoke pages."
```

---

### Task 3: Proposal Page — Shell, Data Loading, and Property Theming

**Files:**
- Create: `pages/proposal.html`

This task creates the page skeleton: HTML structure, CSS custom properties for theming, data loading from localStorage / URL hash, narration API call with fallback, and the `render()` entry point. No interactive sections yet — just the shell that loads data and applies theming.

- [ ] **Step 1: Create the proposal page shell**

Create `pages/proposal.html` with the full HTML structure, CSS, data loading, theming, and fallback logic. The page has placeholder `<div>` containers for each section — Tasks 4-7 will fill them in.

```html
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Proposal — Accelerate Robotics</title>
<script src="https://cdn.tailwindcss.com"></script>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:wght@400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
    :root {
        --accent: #0055ff;
        --accent-light: #00c8ff;
        --accent-soft: rgba(0, 85, 255, 0.15);
        --panel-bg: #0f1218;
        --panel-bg-deep: #080b10;
    }
    * { font-family: 'Inter', system-ui, sans-serif; margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #fff; color: #1f2937; }
    .headline { font-family: 'Playfair Display', serif; }
    .tech-font { font-family: 'Space Grotesk', sans-serif; font-feature-settings: 'tnum'; }
    .accel-gradient { background: linear-gradient(135deg, var(--accent), var(--accent-light)); -webkit-background-clip: text; -webkit-text-fill-color: transparent; background-clip: text; }

    /* ── Configurator panel (dark themed) ─────────── */
    .config-panel {
        background: linear-gradient(160deg, var(--panel-bg) 0%, var(--panel-bg-deep) 100%);
        color: #fff;
        border-radius: 1.5rem;
        box-shadow: 0 30px 80px rgba(0, 0, 0, 0.4);
        position: relative;
        overflow: hidden;
    }
    .config-panel::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image: radial-gradient(circle at 20% 0%, color-mix(in srgb, var(--accent) 18%, transparent), transparent 40%),
                          radial-gradient(circle at 80% 100%, color-mix(in srgb, var(--accent) 8%, transparent), transparent 40%);
        pointer-events: none;
    }
    .config-panel > * { position: relative; }

    /* ── Slider ─────────── */
    .slider-wrap { position: relative; padding: 1.5rem 0; }
    .slider-track {
        height: 6px;
        background: rgba(255, 255, 255, 0.08);
        border-radius: 999px;
        position: relative;
        margin: 0 12px;
    }
    .slider-fill {
        position: absolute; inset: 0 auto 0 0;
        background: linear-gradient(90deg, var(--accent) 0%, var(--accent-light) 100%);
        border-radius: 999px;
        box-shadow: 0 0 20px color-mix(in srgb, var(--accent) 50%, transparent);
        transition: width 0.25s ease;
    }
    .slider-ticks {
        position: absolute; inset: 0;
        display: flex; justify-content: space-between; align-items: center;
        padding: 0 12px; pointer-events: none;
    }
    .tick { width: 2px; height: 12px; background: rgba(255, 255, 255, 0.15); border-radius: 2px; }
    .tick.tier-marker { width: 3px; height: 18px; background: var(--accent-light); box-shadow: 0 0 8px color-mix(in srgb, var(--accent) 70%, transparent); }
    .slider-input {
        -webkit-appearance: none; appearance: none;
        width: 100%; background: transparent;
        position: absolute; top: 50%; left: 0; right: 0;
        transform: translateY(-50%); height: 40px;
        cursor: pointer; padding: 0 12px;
    }
    .slider-input::-webkit-slider-thumb {
        -webkit-appearance: none; appearance: none;
        width: 28px; height: 28px;
        background: linear-gradient(135deg, var(--accent-light), var(--accent));
        border: 3px solid #fff; border-radius: 50%;
        cursor: grab;
        box-shadow: 0 4px 20px color-mix(in srgb, var(--accent) 60%, transparent), 0 0 0 1px rgba(0,0,0,0.2);
        transition: transform 0.15s ease;
    }
    .slider-input::-webkit-slider-thumb:active { transform: scale(1.15); cursor: grabbing; }
    .slider-input::-moz-range-thumb {
        width: 28px; height: 28px;
        background: linear-gradient(135deg, var(--accent-light), var(--accent));
        border: 3px solid #fff; border-radius: 50%;
        cursor: grab;
        box-shadow: 0 4px 20px color-mix(in srgb, var(--accent) 60%, transparent);
    }

    /* ── Robot grid ─────────── */
    .robot-slot {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 0.75rem;
        padding: 0.875rem 0.75rem;
        transition: all 0.35s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative; overflow: hidden;
        opacity: 0.4; filter: grayscale(0.6);
    }
    .robot-slot.active {
        background: linear-gradient(140deg, color-mix(in srgb, var(--accent) 18%, transparent), color-mix(in srgb, var(--accent) 6%, transparent));
        border-color: color-mix(in srgb, var(--accent) 50%, transparent);
        opacity: 1; filter: none;
        transform: translateY(-1px);
        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
    }
    .robot-slot.active::after {
        content: ''; position: absolute; top: 0; right: 0;
        width: 10px; height: 10px; margin: 8px;
        background: var(--accent-light); border-radius: 50%;
        box-shadow: 0 0 12px var(--accent-light);
    }
    .robot-chip-mini {
        display: inline-flex; align-items: center; justify-content: center;
        width: 2rem; height: 2rem; border-radius: 0.5rem;
        background: color-mix(in srgb, var(--accent) 18%, transparent);
        color: var(--accent-light);
        font-family: 'Space Grotesk', sans-serif; font-weight: 700;
        font-size: 0.7rem; letter-spacing: 0.04em;
    }
    .robot-slot.active .robot-chip-mini { background: var(--accent); color: #fff; }
    .robot-photo {
        width: 100%; aspect-ratio: 4 / 3;
        object-fit: contain; object-position: center;
        margin-bottom: 0.5rem;
        background: radial-gradient(circle at 50% 60%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 65%),
                    linear-gradient(140deg, rgba(255,255,255,0.03), rgba(255,255,255,0));
        border-radius: 0.5rem; padding: 0.25rem;
        filter: grayscale(0.85) brightness(0.7);
        transition: filter 0.5s ease, transform 0.5s ease;
    }
    .robot-slot.active .robot-photo { filter: grayscale(0) brightness(1); transform: scale(1.02); }

    /* ── Preset chips ─────────── */
    .preset-chip {
        padding: 0.5rem 1rem; border-radius: 0.6rem;
        background: rgba(255, 255, 255, 0.06);
        border: 1px solid rgba(255, 255, 255, 0.1);
        color: rgba(255, 255, 255, 0.85);
        cursor: pointer; font-size: 0.8rem; font-weight: 600;
        transition: all 0.2s ease;
        font-family: 'Space Grotesk', sans-serif;
    }
    .preset-chip:hover { background: rgba(255, 255, 255, 0.1); border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
    .preset-chip.active {
        background: var(--accent); color: #fff; border-color: var(--accent);
        box-shadow: 0 4px 16px color-mix(in srgb, var(--accent) 40%, transparent);
    }

    /* ── LED indicators ─────────── */
    .led-indicator {
        display: flex; align-items: center; gap: 9px;
        padding: 9px 11px; border-radius: 6px;
        background: rgba(255, 255, 255, 0.025);
        border: 1px solid rgba(255, 255, 255, 0.06);
        transition: background 0.35s ease, border-color 0.35s ease;
    }
    .led-indicator.on {
        background: color-mix(in srgb, var(--accent) 9%, transparent);
        border-color: color-mix(in srgb, var(--accent) 35%, transparent);
    }
    .led-dot {
        flex: 0 0 auto; width: 9px; height: 9px; border-radius: 50%;
        background: #3a3833;
        box-shadow: inset 0 0 2px rgba(0,0,0,0.5);
        transition: background 0.35s ease, box-shadow 0.35s ease;
    }
    .led-indicator.on .led-dot {
        background: #5eff88;
        box-shadow: 0 0 9px rgba(94, 255, 136, 0.75), 0 0 2px #5eff88, inset 0 0 2px rgba(255,255,255,0.6);
        animation: ledPulse 2.4s ease-in-out infinite;
    }
    @keyframes ledPulse {
        0%, 100% { box-shadow: 0 0 8px rgba(94, 255, 136, 0.65), 0 0 2px #5eff88; }
        50%      { box-shadow: 0 0 14px rgba(94, 255, 136, 0.95), 0 0 4px #5eff88; }
    }
    .led-label { font-size: 11px; color: rgba(255,255,255,0.45); font-weight: 500; transition: color 0.35s ease; }
    .led-indicator.on .led-label { color: #fff; font-weight: 600; }
    .led-threshold { font-family: 'Space Grotesk', sans-serif; font-size: 9px; color: rgba(255,255,255,0.3); margin-left: auto; }
    .led-indicator.on .led-threshold { color: var(--accent-light); }

    /* ── Toggle ─────────── */
    .toggle {
        display: inline-flex; align-items: center;
        width: 52px; height: 28px;
        background: rgba(255, 255, 255, 0.12);
        border-radius: 999px; position: relative;
        cursor: pointer; transition: background 0.2s ease; flex-shrink: 0;
    }
    .toggle::after {
        content: ''; position: absolute;
        width: 22px; height: 22px; background: #fff; border-radius: 50%;
        top: 3px; left: 3px; transition: all 0.2s ease;
        box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    .toggle.on { background: var(--accent); }
    .toggle.on::after { left: 27px; }

    /* ── Stat tiles ─────────── */
    .stat-tile {
        background: rgba(255, 255, 255, 0.04);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 1rem; padding: 1rem 1.25rem;
        transition: all 0.3s ease;
    }
    .stat-tile.accent {
        background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, transparent), color-mix(in srgb, var(--accent) 5%, transparent));
        border-color: color-mix(in srgb, var(--accent) 40%, transparent);
    }
    .stat-tile.accent-green {
        background: linear-gradient(135deg, rgba(58, 106, 58, 0.22), rgba(58, 106, 58, 0.08));
        border-color: rgba(90, 180, 100, 0.4);
    }

    /* ── Hours/Impact card ─────────── */
    .hours-card {
        background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 14%, transparent), color-mix(in srgb, var(--accent) 4%, transparent));
        border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);
        border-radius: 1.25rem; padding: 2rem 2rem 1.75rem;
    }
    .hours-eyebrow {
        font-family: 'Space Grotesk', sans-serif;
        font-size: 0.7rem; font-weight: 700;
        letter-spacing: 0.22em; text-transform: uppercase;
        color: var(--accent-light); text-align: center; margin-bottom: 0.5rem;
    }
    .hours-anchor {
        font-family: 'Playfair Display', serif;
        font-size: 1.45rem; font-weight: 500; color: #fff;
        text-align: center; line-height: 1.35;
        margin: 0 auto 2rem; max-width: 46rem;
    }
    .hours-anchor em { color: var(--accent-light); font-style: normal; font-weight: 600; }

    .pillar-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 1rem; margin-bottom: 1rem; }
    .pillar {
        background: rgba(255,255,255,0.035);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 1rem; padding: 1.4rem 1.25rem 1.35rem;
        display: flex; flex-direction: column; position: relative;
        border-top: 2px solid var(--accent);
    }
    .pillar .p-eyebrow { font-family: 'Space Grotesk', sans-serif; font-size: 0.62rem; font-weight: 700; letter-spacing: 0.15em; text-transform: uppercase; color: var(--accent-light); margin-bottom: 0.5rem; }
    .pillar .p-num { font-family: 'Space Grotesk', monospace; font-size: 2.6rem; font-weight: 700; color: #fff; line-height: 1; }
    .pillar .p-num .plus { color: var(--accent-light); font-weight: 600; }
    .pillar .p-unit { font-family: 'Playfair Display', serif; font-size: 0.95rem; color: #ccc; font-style: italic; margin-top: 0.25rem; }
    .pillar .p-body { font-size: 0.82rem; color: #d0d0d0; line-height: 1.5; margin-top: 0.9rem; flex: 1; }
    .pillar .p-body strong { color: #fff; }
    .pillar .p-foot { font-size: 0.7rem; color: #888; margin-top: 0.7rem; padding-top: 0.7rem; border-top: 1px solid rgba(255,255,255,0.08); }

    /* ── Revenue hero ─────────── */
    .revenue-hero {
        background: linear-gradient(135deg, rgba(139,194,161,0.12), color-mix(in srgb, var(--accent) 8%, transparent));
        border: 1px solid rgba(139,194,161,0.35);
        border-top: 3px solid #8bc2a1;
        border-radius: 1rem; padding: 2rem 2.5rem;
        display: grid; grid-template-columns: auto 1fr;
        gap: 0 2.5rem; align-items: center; margin-bottom: 1.25rem;
    }
    .revenue-hero .rv-eyebrow { font-family: 'Space Grotesk', sans-serif; font-size: 0.68rem; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #8bc2a1; grid-column: 1 / -1; margin-bottom: 0.6rem; }
    .revenue-hero .rv-num { font-family: 'Space Grotesk', monospace; font-size: 3.6rem; font-weight: 700; color: var(--accent-light); line-height: 1; }
    .revenue-hero .rv-num .plus { color: #8bc2a1; }
    .revenue-hero .rv-unit { font-family: 'Playfair Display', serif; font-size: 1.05rem; color: #ccc; font-style: italic; margin-top: 0.15rem; }
    .revenue-hero .rv-body { font-size: 0.88rem; color: #d0d0d0; line-height: 1.6; }
    .revenue-hero .rv-body strong { color: #fff; }
    .revenue-hero .rv-annual { grid-column: 1 / -1; margin-top: 0.8rem; padding-top: 0.8rem; border-top: 1px solid rgba(255,255,255,0.08); font-family: 'Space Grotesk', sans-serif; font-size: 0.82rem; color: #888; }
    .revenue-hero .rv-annual .big { color: var(--accent-light); font-weight: 700; font-size: 1.15rem; }
    @media (max-width: 820px) {
        .pillar-grid { grid-template-columns: 1fr; }
        .revenue-hero { grid-template-columns: 1fr; gap: 0.5rem 0; padding: 1.5rem 1.25rem; }
    }

    /* ── Phase timeline ─────────── */
    .phase-timeline { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.5rem; }
    .phase-card {
        background: #f9fafb; border: 1px solid #e5e7eb;
        border-radius: 0.75rem; padding: 1rem; transition: all 0.3s ease;
    }
    .phase-card.included { background: #fafaf8; border-color: var(--accent); }
    .phase-card.skipped { opacity: 0.35; filter: grayscale(0.8); }

    /* ── Savings table ─────────── */
    .data-table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
    .data-table th { background: var(--panel-bg); color: #fff; font-weight: 700; text-align: left; padding: 0.65rem 0.85rem; font-size: 0.72rem; letter-spacing: 0.04em; text-transform: uppercase; }
    .data-table th.right { text-align: right; }
    .data-table td { padding: 0.6rem 0.85rem; border-bottom: 1px solid #e5e7eb; }
    .data-table tr:nth-child(even) td { background: #fafafa; }
    .data-table td.num { text-align: right; font-family: 'Space Grotesk', sans-serif; font-variant-numeric: tabular-nums; }
    .data-table tr.total td { background: #f0f9ff !important; font-weight: 700; border-top: 2px solid var(--accent); }

    /* ── Unlock cards ─────────── */
    .unlock-card {
        padding: 1rem; border-radius: 0.5rem;
        background: #fff; border: 1px solid rgba(0,0,0,0.08);
        border-left: 3px solid var(--accent);
    }
    .unlock-card.locked {
        background: rgba(0,0,0,0.02); border: 1px dashed rgba(0,0,0,0.15);
        border-left: 3px dashed rgba(0,0,0,0.15); opacity: 0.75;
    }

    /* ── Loading state ─────────── */
    .loading-overlay {
        display: flex; align-items: center; justify-content: center;
        min-height: 60vh; flex-direction: column; gap: 1rem;
    }
    .spinner {
        width: 40px; height: 40px; border: 3px solid #e5e7eb;
        border-top-color: var(--accent); border-radius: 50%;
        animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }

    /* ── Print ─────────── */
    @media print {
        .no-print { display: none !important; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; background: #fff !important; font-size: 11pt; }
        section { break-inside: avoid; page-break-inside: avoid; }
        h2, h3, .headline { break-after: avoid; page-break-after: avoid; }
        .slider-wrap, .preset-chips-row, .toggle-row, #shareBtn { display: none !important; }
        .config-panel { box-shadow: none !important; }
        .robot-slot { opacity: 1 !important; filter: none !important; break-inside: avoid; border: 1px solid #ccc !important; }
        .robot-slot.active { box-shadow: none !important; transform: none !important; }
        .robot-slot.active::after { border-radius: 50% !important; -webkit-border-radius: 50% !important; overflow: hidden !important; box-shadow: none !important; width: 8px !important; height: 8px !important; background: #2e7d32 !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .robot-photo { filter: none !important; transform: none !important; max-height: 120px; object-fit: contain; }
        .led-dot { animation: none !important; border-radius: 50% !important; -webkit-border-radius: 50% !important; print-color-adjust: exact; -webkit-print-color-adjust: exact; }
        .led-indicator.on .led-dot { background: #00c853 !important; box-shadow: none !important; animation: none !important; border-radius: 50% !important; -webkit-border-radius: 50% !important; }
        .stat-tile { border: 1px solid #ddd !important; box-shadow: none !important; }
        .phase-card { break-inside: avoid; box-shadow: none !important; }
        .data-table td, .data-table th { border: 1px solid #ccc !important; }
        *, *::before, *::after { animation: none !important; transition: none !important; }
        .fixed, [style*="position: fixed"], .sticky, [style*="position: sticky"] { position: static !important; }
    }
    @media (max-width: 768px) { .phase-timeline { grid-template-columns: 1fr; } }
</style>
</head>
<body>

<!-- Loading state (shown while narration loads) -->
<div class="loading-overlay" id="loadingState">
    <div class="spinner"></div>
    <p class="text-sm text-gray-500">Generating proposal narratives...</p>
</div>

<!-- Main content (hidden until data loads) -->
<div id="proposalContent" style="display:none">

    <!-- Section 1: Header -->
    <header class="bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 text-white px-6 md:px-8 py-10 md:py-12 relative overflow-hidden" id="headerSection"></header>

    <!-- Section 2: Intro -->
    <section class="max-w-6xl mx-auto px-6 md:px-8 pt-10 pb-4" id="introSection"></section>

    <!-- Section 3: Configurator panel -->
    <section class="max-w-6xl mx-auto px-6 md:px-8 py-8" id="configuratorSection"></section>

    <!-- Section 7: Phase timeline -->
    <section class="max-w-6xl mx-auto px-6 md:px-8 py-12" id="phaseSection"></section>

    <!-- Section 8: Savings breakdown -->
    <section class="max-w-6xl mx-auto px-6 md:px-8 py-8" id="savingsTableSection"></section>

    <!-- Section 9: Service tier unlocks -->
    <section class="max-w-6xl mx-auto px-6 md:px-8 py-12" id="unlocksSection"></section>

    <!-- Section 10: Footer -->
    <footer class="bg-gray-50 border-t border-gray-200 px-6 md:px-8 py-8" id="footerSection"></footer>
</div>

<script>
/* ──────────────────────────────────────────────────────────────────
   UNIVERSAL PROPOSAL — DATA LOADING, THEMING, AND RENDER PIPELINE
   ────────────────────────────────────────────────────────────────── */

/* ── Property theme palettes ─────────────────────────────────── */
const THEMES = {
    hotel:         { primary: '#0055ff', secondary: '#00c8ff', panelBg: '#0f1218', panelBgDeep: '#080b10' },
    resort:        { primary: '#2d8a6e', secondary: '#7ecfb0', panelBg: '#0f1a16', panelBgDeep: '#081210' },
    hospital:      { primary: '#1a73e8', secondary: '#4fc3f7', panelBg: '#0f1520', panelBgDeep: '#080d18' },
    senior_living: { primary: '#7c5cbf', secondary: '#b39ddb', panelBg: '#16121f', panelBgDeep: '#0e0a16' },
    luxury:        { primary: '#8a6f47', secondary: '#d9c9a8', panelBg: '#151515', panelBgDeep: '#0a0a0a' },
};

// WHY: Luxury auto-detection — small or premium-named properties get the bronze palette
// regardless of their base type, matching Moore Miami's aesthetic.
const LUXURY_KEYWORDS = /club|boutique|member|residence|manor|chateau/i;
const LUXURY_ROOM_THRESHOLD = 50;

function detectTheme(property) {
    if (property.rooms < LUXURY_ROOM_THRESHOLD || LUXURY_KEYWORDS.test(property.name)) {
        return THEMES.luxury;
    }
    return THEMES[property.type] || THEMES.hotel;
}

function applyTheme(theme) {
    const root = document.documentElement;
    root.style.setProperty('--accent', theme.primary);
    root.style.setProperty('--accent-light', theme.secondary);
    root.style.setProperty('--panel-bg', theme.panelBg);
    root.style.setProperty('--panel-bg-deep', theme.panelBgDeep);
}

/* ── FTE cost by property type ───────────────────────────────── */
const FTE_COST = {
    hotel: 4200,
    resort: 4500,
    hospital: 4800,
    senior_living: 4000,
    luxury: 5200,  // WHY: Private-club / ultra-premium roles skew senior
};

function getFteMonthlyCost(property) {
    if (property.rooms < LUXURY_ROOM_THRESHOLD || LUXURY_KEYWORDS.test(property.name)) {
        return FTE_COST.luxury;
    }
    return FTE_COST[property.type] || FTE_COST.hotel;
}

/* ── Intelligence Platform constants ─────────────────────────── */
const INTEL_Y1_INSTALL = 38500;  // one-time capex
const INTEL_Y2_LICENSE = 10000;  // annual software license

/* ── Preset tier chip generation ─────────────────────────────── */
function generatePresets(fleetSize) {
    if (fleetSize <= 2) return [{ label: 'Pilot', count: 1 }, { label: 'Full', count: fleetSize }];
    if (fleetSize <= 4) return [{ label: 'Pilot', count: 1 }, { label: 'Core', count: 2 }, { label: 'Full', count: fleetSize }];
    if (fleetSize <= 7) return [{ label: 'Pilot', count: 1 }, { label: 'Core', count: 3 }, { label: 'Full', count: fleetSize }];
    return [{ label: 'Pilot', count: 1 }, { label: 'Core', count: 3 }, { label: 'Extended', count: 6 }, { label: 'Full', count: fleetSize }];
}

/* ── Phase generation ────────────────────────────────────────── */
function generatePhaseBreaks(fleetSize) {
    // WHY: Returns array of { upTo, name, timeframe } describing which slots belong to each phase.
    const phases = [{ upTo: 1, name: 'Pilot', timeframe: 'Month 1' }];
    if (fleetSize >= 2) phases.push({ upTo: Math.min(3, fleetSize), name: 'Core Service', timeframe: 'Months 2–3' });
    if (fleetSize >= 4) phases.push({ upTo: Math.min(6, fleetSize), name: 'Full Property', timeframe: 'Months 3–5' });
    if (fleetSize >= 7) phases.push({ upTo: fleetSize, name: 'Autonomous Operations', timeframe: 'Months 5–7' });
    return phases;
}

/* ── Fallback narratives (used when /api/narrate is unavailable) ── */
function generateFallbackNarratives(data) {
    const { property, fleet } = data;
    const phaseBreaks = generatePhaseBreaks(fleet.length);
    return {
        intro: `${property.name} is a ${property.rooms}-room ${property.type} across ${property.floors} floors in ${property.market || 'the market'}.`,
        headline: 'Drag the slider. Watch the operation transform.',
        valueProp: 'Every robot in your fleet reclaims hours your team currently spends on repetitive logistics — and turns them into capacity for higher-value work.',
        robots: fleet.map(s => ({
            goalId: s.goalId,
            roleDescription: `${s.serviceLine} — ${s.robot.company} ${s.robot.model_name}`,
            unlockNarrative: `Automates ${s.serviceLine.toLowerCase()} to free staff for higher-value work.`,
            savingsCapture: `Replaces $${s.savings.toLocaleString()}/mo in labor costs`,
        })),
        tierName: phaseBreaks[phaseBreaks.length - 1].name,
        tierNarrative: `With ${fleet.length} robots deployed, the fleet covers ${fleet.map(s => s.serviceLine.toLowerCase()).join(', ')}.`,
        phases: phaseBreaks.map(p => ({
            name: p.name,
            timeframe: p.timeframe,
            description: `Deploy robots ${phases_robot_range(p, phaseBreaks, fleet)}.`,
        })),
    };
}

// WHY: Helper to describe which robots deploy in each phase for fallback text
function phases_robot_range(phase, allPhases, fleet) {
    const idx = allPhases.indexOf(phase);
    const start = idx === 0 ? 0 : allPhases[idx - 1].upTo;
    const end = phase.upTo;
    const names = fleet.slice(start, end).map(s => `${s.robot.company} ${s.robot.model_name}`);
    return names.join(', ') || 'as configured';
}

/* ── STATE ──────────────────────────────────────────���─────────── */
let DATA = null;       // the full payload from localStorage or URL hash
let NARRATIVES = null; // from /api/narrate or fallback
let state = { count: 1, intel: false };

/* ── DATA LOADING ────────────────────────────────────────────── */
function loadData() {
    // Priority 1: URL hash (share link)
    if (location.hash.startsWith('#config=')) {
        try {
            const encoded = location.hash.slice('#config='.length);
            const json = atob(encoded);
            return JSON.parse(json);
        } catch (e) {
            console.error('[proposal] Failed to parse share link:', e);
        }
    }
    // Priority 2: localStorage (fleet designer handoff)
    const stored = localStorage.getItem('accelerate-proposal');
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch (e) {
            console.error('[proposal] Failed to parse localStorage:', e);
        }
    }
    return null;
}

async function fetchNarratives(data) {
    try {
        const res = await fetch('/api/narrate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                property: data.property,
                facility: data.facility,
                fleet: data.fleet,
            }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (err) {
        console.warn('[proposal] Narration failed, using fallback:', err.message);
        return null;
    }
}

/* ── INIT ─────────────────────────────────────────────────────── */
async function init() {
    DATA = loadData();
    if (!DATA || !DATA.fleet || DATA.fleet.length === 0) {
        document.getElementById('loadingState').innerHTML = `
            <div style="text-align:center; padding:4rem;">
                <h2 class="headline text-2xl font-bold text-gray-800 mb-4">No Fleet Data Found</h2>
                <p class="text-gray-500 mb-6">Open the Fleet Designer, configure a fleet, and click "Generate Proposal" to get started.</p>
                <a href="fleet-designer.html" class="inline-block px-6 py-3 rounded-lg text-white font-semibold" style="background:var(--accent)">Open Fleet Designer</a>
            </div>
        `;
        return;
    }

    // Apply property theming
    const theme = detectTheme(DATA.property);
    applyTheme(theme);

    // Update page title
    document.title = `${DATA.property.name} — Proposal`;

    // Set slider max to fleet size, default to full fleet
    state.count = DATA.fleet.length;

    // Fetch narratives (non-blocking — render with fallback if it fails)
    const narrated = await fetchNarratives(DATA);
    NARRATIVES = narrated || generateFallbackNarratives(DATA);

    // Hide loading, show content
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('proposalContent').style.display = 'block';

    // Render all sections
    render();
}

/* ── RENDER ALL ───────────────────────────────────────────────── */
function render() {
    renderHeader();
    renderIntro();
    renderConfigurator();
    renderImpact();
    renderSavings();
    renderHiring();
    renderAnnualSummary();
    renderPhases();
    renderSavingsTable();
    renderUnlocks();
    renderFooter();
}

// Placeholder render functions — implemented in Tasks 4-7
function renderHeader() {}
function renderIntro() {}
function renderConfigurator() {}
function renderImpact() {}
function renderSavings() {}
function renderHiring() {}
function renderAnnualSummary() {}
function renderPhases() {}
function renderSavingsTable() {}
function renderUnlocks() {}
function renderFooter() {}

/* ── BOOT ─────────────────────────────────────────────────────── */
init();
</script>

</body>
</html>
```

- [ ] **Step 2: Test the shell manually**

1. Start dev server: `npm run dev`
2. Open Fleet Designer, generate a fleet, click "Generate Proposal"
3. Verify: proposal.html opens, shows loading spinner, then switches to empty content (placeholder functions)
4. Verify: page title updates to property name
5. Open console — check for theme CSS variables: `getComputedStyle(document.documentElement).getPropertyValue('--accent')`
6. Verify: no console errors

- [ ] **Step 3: Test the share link path**

1. In the proposal page console, run:
```js
const data = JSON.parse(localStorage.getItem('accelerate-proposal'));
const encoded = btoa(JSON.stringify(data));
location.hash = 'config=' + encoded;
location.reload();
```
2. Verify: page loads from hash, same behavior as localStorage path

- [ ] **Step 4: Commit**

```bash
git add pages/proposal.html
git commit -m "feat(proposal): add page shell with data loading, theming, and print styles

Problem: No universal proposal page exists — only 3 properties have
bespoke proposals.

Solution: Static HTML page that loads fleet data from localStorage or
URL hash, fetches Claude-generated narratives from /api/narrate with
fallback templates, and applies property-type theming via CSS custom
properties. Includes comprehensive print styles. Render functions are
stubs — filled in by subsequent tasks."
```

---

### Task 4: Configurator Panel — Header, Slider, Robot Grid, Service LEDs, Intelligence Toggle

**Files:**
- Modify: `pages/proposal.html` (replace placeholder render functions)

This task implements the core interactive configurator: header, intro, slider with preset chips, robot grid, service line LEDs, and the Intelligence Platform toggle. All rendered inside the dark-themed configurator panel.

- [ ] **Step 1: Implement renderHeader()**

Replace the `function renderHeader() {}` stub with:

```js
function renderHeader() {
    const p = DATA.property;
    const el = document.getElementById('headerSection');
    el.style.background = `linear-gradient(135deg, var(--panel-bg), var(--panel-bg-deep))`;
    el.innerHTML = `
        <div class="max-w-6xl mx-auto relative">
            <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                <div class="flex items-center gap-4">
                    <div class="w-14 h-14 rounded-xl border-2 flex items-center justify-center" style="border-color: var(--accent-light)">
                        <span class="font-bold text-2xl headline" style="color: var(--accent-light)">${p.name.charAt(0)}</span>
                    </div>
                    <div>
                        <h1 class="text-3xl md:text-4xl font-bold tracking-tight headline">${p.name}</h1>
                        <p class="text-xs text-gray-400 tracking-widest uppercase mt-1">Executive Proposal · Live Configurator</p>
                    </div>
                </div>
                <div class="flex flex-col md:items-end gap-2">
                    <div class="flex items-center gap-3">
                        <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: linear-gradient(135deg, #0055ff, #00c8ff, #7c3aed);">
                            <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="20" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/><circle cx="20" cy="18" r="1.5" fill="currentColor"/><line x1="12" y1="12" x2="4" y2="6"/><line x1="12" y1="12" x2="20" y2="6"/><line x1="12" y1="12" x2="4" y2="18"/><line x1="12" y1="12" x2="20" y2="18"/></svg>
                        </div>
                        <span class="text-sm font-bold tracking-tight accel-gradient tech-font">Accelerate Robotics</span>
                    </div>
                    <div class="text-[10px] text-gray-400 md:text-right tracking-wide">
                        One Brain. Many Bots.<br>
                        <span class="text-gray-500">${p.rooms}-room ${p.type} · ${p.floors} floors · ${p.market || ''}</span>
                    </div>
                </div>
            </div>
        </div>
    `;
}
```

- [ ] **Step 2: Implement renderIntro()**

Replace the `function renderIntro() {}` stub with:

```js
function renderIntro() {
    const el = document.getElementById('introSection');
    el.innerHTML = `
        <div class="max-w-3xl">
            <p class="text-sm uppercase tracking-widest font-semibold mb-3" style="color: var(--accent)">Executive Proposal</p>
            <h2 class="headline text-3xl md:text-4xl font-bold text-gray-900 mb-4 leading-tight">${NARRATIVES.headline}</h2>
            <p class="text-gray-600 leading-relaxed">${NARRATIVES.intro}</p>
            <p class="text-gray-600 leading-relaxed mt-3">${NARRATIVES.valueProp}</p>
        </div>
    `;
}
```

- [ ] **Step 3: Implement renderConfigurator() — fleet size display, slider, presets, robot grid, LEDs, toggle**

Replace the `function renderConfigurator() {}` stub with:

```js
function renderConfigurator() {
    const n = state.count;
    const total = DATA.fleet.length;
    const presets = generatePresets(total);
    const pct = total > 1 ? ((n - 1) / (total - 1)) * 100 : 100;

    // Build preset chips HTML
    const presetChipsHtml = presets.map(p =>
        `<button class="preset-chip${p.count === n ? ' active' : ''}" data-count="${p.count}">${p.label} · ${p.count}</button>`
    ).join('');

    // Build slider ticks HTML
    const presetCounts = presets.map(p => p.count);
    let ticksHtml = '';
    for (let i = 1; i <= total; i++) {
        ticksHtml += `<div class="tick${presetCounts.includes(i) ? ' tier-marker' : ''}"></div>`;
    }

    // Build robot grid HTML
    let robotGridHtml = '';
    DATA.fleet.forEach((slot, i) => {
        const active = i < n;
        const r = slot.robot;
        const narr = NARRATIVES.robots[i] || {};
        robotGridHtml += `
            <div class="robot-slot${active ? ' active' : ''}">
                ${r.image_url ? `<img class="robot-photo" src="${r.image_url}" alt="${r.model_name}" loading="lazy">` : '<div class="robot-photo" style="display:flex;align-items:center;justify-content:center;color:#555;font-size:0.7rem;">No image</div>'}
                <div class="flex items-start gap-2.5">
                    <div class="robot-chip-mini">${r.model_name.split(' ')[0]}</div>
                    <div class="flex-1 min-w-0">
                        <p class="text-[11px] font-semibold text-white leading-snug truncate">${r.company} ${r.model_name}</p>
                        <p class="text-[10px] text-gray-400 leading-snug mt-0.5 truncate">${narr.roleDescription || slot.serviceLine}</p>
                    </div>
                </div>
            </div>
        `;
    });

    // Build service LED HTML
    let ledHtml = '';
    let onCount = 0;
    DATA.fleet.forEach((slot, i) => {
        const on = i < n;
        if (on) onCount++;
        ledHtml += `
            <div class="led-indicator${on ? ' on' : ''}">
                <span class="led-dot"></span>
                <span class="led-label">${slot.serviceLine}</span>
                <span class="led-threshold">${i + 1}+</span>
            </div>
        `;
    });

    const el = document.getElementById('configuratorSection');
    el.innerHTML = `
        <div class="config-panel p-6 md:p-10">
            <!-- Fleet size header -->
            <div class="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
                <div>
                    <p class="text-[11px] uppercase tracking-widest font-semibold mb-2" style="color:var(--accent-light)">Fleet Size</p>
                    <div class="flex items-baseline gap-3">
                        <div class="text-6xl md:text-7xl font-bold tech-font text-white" id="fleetCount">${n}</div>
                        <div class="text-xl text-gray-400 font-light">/ ${total} robots</div>
                    </div>
                    <p class="text-sm text-gray-400 mt-1" id="tierLabel">${NARRATIVES.tierName}</p>
                </div>
                <div class="flex flex-wrap gap-2 preset-chips-row" id="presetChips">${presetChipsHtml}</div>
            </div>

            <!-- Slider -->
            <div class="slider-wrap mb-2 no-print">
                <div class="slider-track">
                    <div class="slider-fill" id="sliderFill" style="width: ${pct}%"></div>
                    <div class="slider-ticks">${ticksHtml}</div>
                </div>
                <input type="range" min="1" max="${total}" value="${n}" step="1" class="slider-input" id="fleetSlider">
            </div>

            <!-- Robot grid -->
            <div class="mt-8">
                <p class="text-[11px] uppercase tracking-widest font-semibold mb-3" style="color:var(--accent-light)">Fleet Composition</p>
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2.5" id="robotGrid">${robotGridHtml}</div>
            </div>

            <!-- Service line LEDs -->
            <div class="mt-8">
                <div class="flex items-center justify-between mb-3">
                    <p class="text-[11px] uppercase tracking-widest font-semibold" style="color:var(--accent-light)">Service Lines — System Status</p>
                    <p class="text-[10px] uppercase tracking-widest text-gray-400">
                        <span class="tech-font text-[#5eff88] font-bold" id="serviceOnCount">${onCount}</span>
                        <span class="text-gray-500"> / ${total} online</span>
                    </p>
                </div>
                <div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2" id="serviceLedGrid">${ledHtml}</div>
            </div>

            <!-- Intelligence Platform toggle -->
            <div class="mt-8 toggle-row">
                <div class="flex items-center justify-between bg-white/5 border border-white/10 rounded-xl p-4">
                    <div class="flex-1 pr-4">
                        <p class="text-sm font-semibold text-white">Facility Intelligence Platform</p>
                        <p class="text-[11px] text-gray-400 mt-0.5">Asset sensing, BLE + UWB tags, smart-dispatch rules, ops dashboard · <span style="color:var(--accent-light)">$${INTEL_Y1_INSTALL.toLocaleString()} Y1 install · $${(INTEL_Y2_LICENSE/1000).toFixed(0)}K/yr license</span></p>
                    </div>
                    <div class="toggle${state.intel ? ' on' : ''}" id="intelToggle"></div>
                </div>
            </div>

            <!-- Impact divider -->
            <div class="mt-12 mb-8 text-center">
                <p class="text-[11px] uppercase tracking-widest font-semibold mb-2" style="color:var(--accent-light)">Now see what this fleet delivers</p>
                <p class="headline text-2xl md:text-3xl font-bold text-white" style="line-height:1.3">Better service. Stronger bottom line.</p>
            </div>

            <!-- Impact section (rendered by renderImpact) -->
            <div id="impactContainer"></div>

            <!-- Savings stats (rendered by renderSavings) -->
            <div id="savingsContainer"></div>

            <!-- Annual summary (rendered by renderAnnualSummary) -->
            <div id="annualContainer"></div>

            <!-- vs. Hiring (rendered by renderHiring) -->
            <div id="hiringContainer"></div>
        </div>
    `;

    // Wire slider
    document.getElementById('fleetSlider').addEventListener('input', (e) => {
        state.count = parseInt(e.target.value);
        render();
    });

    // Wire preset chips
    document.querySelectorAll('#presetChips .preset-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            state.count = parseInt(chip.dataset.count);
            render();
        });
    });

    // Wire intel toggle
    document.getElementById('intelToggle').addEventListener('click', () => {
        state.intel = !state.intel;
        render();
    });
}
```

- [ ] **Step 4: Test manually**

1. Open the proposal page (via fleet designer → Generate Proposal)
2. Verify: robot grid shows with photos, model names, role descriptions
3. Verify: slider moves, robot cards activate/deactivate
4. Verify: preset chips work, LED indicators illuminate
5. Verify: Intelligence Platform toggle toggles
6. Verify: property theming (try a hospital property vs. hotel — colors should differ)

- [ ] **Step 5: Commit**

```bash
git add pages/proposal.html
git commit -m "feat(proposal): implement configurator panel — slider, robot grid, LEDs, toggle

Problem: Proposal page shell has stub render functions.

Solution: Full configurator panel with fleet size slider, auto-generated
preset chips, robot grid with photos and narrated descriptions, service
line LED indicators, and Intelligence Platform toggle. All elements
reference CSS custom properties for property theming."
```

---

### Task 5: Impact, Savings, FTE Comparison, and Annual Summary

**Files:**
- Modify: `pages/proposal.html` (replace renderImpact, renderSavings, renderHiring, renderAnnualSummary stubs)

- [ ] **Step 1: Implement renderImpact()**

Replace the `function renderImpact() {}` stub with:

```js
function renderImpact() {
    const n = state.count;
    const activeFleet = DATA.fleet.slice(0, n);
    const totalSavings = activeFleet.reduce((s, r) => s + r.savings, 0);
    const fteCost = getFteMonthlyCost(DATA.property);
    const fteFreed = (totalSavings / fteCost).toFixed(1);
    const touchpoints = n * 6;
    const touchpointsMonthly = touchpoints * 30;
    const revenueMonthly = n * 2500;
    const revenueAnnual = revenueMonthly * 12;

    document.getElementById('impactContainer').innerHTML = `
        <div class="hours-card mb-8">
            <div class="hours-eyebrow">Enhanced Service Capacity</div>
            <div class="hours-anchor">
                Every robot in your fleet <em>creates capacity your current staffing can't reach</em> — and turns each hour into revenue or service quality your operation leaves on the table today.
            </div>
            <div class="pillar-grid">
                <div class="pillar">
                    <div class="p-eyebrow">New Service Touchpoints</div>
                    <div class="p-num"><span class="plus">+</span>${touchpoints}</div>
                    <div class="p-unit">service events / day</div>
                    <div class="p-body"><strong>Deliveries, cleaning runs, supply transport, and guest interactions</strong> that currently require pulling staff away from higher-value work.</div>
                    <div class="p-foot">&asymp; ${touchpointsMonthly.toLocaleString()} service events / month</div>
                </div>
                <div class="pillar">
                    <div class="p-eyebrow">Staff Freed for Higher-Value Work</div>
                    <div class="p-num"><span class="plus">+</span>${fteFreed}</div>
                    <div class="p-unit">FTE equivalent freed</div>
                    <div class="p-body"><strong>The fleet handles repetitive logistics</strong> — corridor cleaning, supply runs, delivery — so your best people stay where they create the most value.</div>
                    <div class="p-foot">Based on $${fteCost.toLocaleString()}/mo fully-loaded FTE cost</div>
                </div>
            </div>
            <div class="revenue-hero">
                <div class="rv-eyebrow">Estimated Additional Revenue Capacity</div>
                <div>
                    <div class="rv-num"><span class="plus">+</span>$${revenueMonthly.toLocaleString()}</div>
                    <div class="rv-unit">new monthly revenue capacity</div>
                </div>
                <div class="rv-body">
                    Extended service hours, faster turnover between events, and <strong>automated delivery during off-peak windows</strong> that currently go unserved. This is revenue capacity that doesn't exist without the fleet.
                </div>
                <div class="rv-annual">
                    <span class="big">$${revenueAnnual.toLocaleString()}</span> / year in estimated new revenue capacity
                </div>
            </div>
        </div>
    `;
}
```

- [ ] **Step 2: Implement renderSavings()**

Replace the `function renderSavings() {}` stub with:

```js
function renderSavings() {
    const n = state.count;
    const activeFleet = DATA.fleet.slice(0, n);
    const monthlyCost = activeFleet.reduce((s, r) => s + r.monthlyEstimate, 0);
    const monthlySavings = activeFleet.reduce((s, r) => s + r.savings, 0);
    const netMonthly = monthlySavings - monthlyCost;
    const sign = netMonthly >= 0 ? '+$' : '−$';
    const robotWord = n === 1 ? 'robot' : 'robots';
    const avgCost = n > 0 ? Math.round(monthlyCost / n) : 0;

    document.getElementById('savingsContainer').innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            <div class="stat-tile">
                <p class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-1">Monthly Fleet Cost</p>
                <p class="text-2xl md:text-3xl font-bold tech-font text-white">$${monthlyCost.toLocaleString()}</p>
                <p class="text-[11px] text-gray-500 mt-1">${n} ${robotWord} × ~$${avgCost.toLocaleString()} avg</p>
            </div>
            <div class="stat-tile">
                <p class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-1">Monthly Hard Savings</p>
                <p class="text-2xl md:text-3xl font-bold tech-font" style="color:var(--accent-light)">$${monthlySavings.toLocaleString()}</p>
                <p class="text-[11px] text-gray-500 mt-1">Labor &amp; vendor contracts offset</p>
            </div>
            <div class="stat-tile accent-green">
                <p class="text-[10px] uppercase tracking-widest text-gray-300 font-semibold mb-1">Net Monthly Benefit</p>
                <p class="text-2xl md:text-3xl font-bold tech-font text-white">${sign}${Math.abs(netMonthly).toLocaleString()}</p>
                <p class="text-[11px] text-gray-300 mt-1">${netMonthly >= 0 ? '+' : '−'}$${Math.abs(netMonthly * 12).toLocaleString()} annualized</p>
            </div>
        </div>
    `;
}
```

- [ ] **Step 3: Implement renderHiring()**

Replace the `function renderHiring() {}` stub with:

```js
function renderHiring() {
    const n = state.count;
    const activeFleet = DATA.fleet.slice(0, n);
    const monthlyCost = activeFleet.reduce((s, r) => s + r.monthlyEstimate, 0);
    const monthlySavings = activeFleet.reduce((s, r) => s + r.savings, 0);
    const fteCost = getFteMonthlyCost(DATA.property);
    const fteCount = (monthlySavings / fteCost).toFixed(1);
    const fteEquivCost = Math.round(parseFloat(fteCount) * fteCost);
    const delta = fteEquivCost - monthlyCost;
    const deltaPct = fteEquivCost > 0 ? Math.round((delta / fteEquivCost) * 100) : 0;
    const deltaSign = delta >= 0 ? '' : '−';

    document.getElementById('hiringContainer').innerHTML = `
        <div class="mt-6 p-6 rounded-xl" style="background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12);">
            <div class="flex items-center justify-between mb-4">
                <p class="text-[11px] uppercase tracking-widest font-semibold" style="color:var(--accent-light)">vs. Hiring — Fully Loaded Labor Comparison</p>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
                <div class="text-center md:text-left">
                    <p class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-1">Your Fleet</p>
                    <p class="text-3xl font-bold tech-font text-white">$${monthlyCost.toLocaleString()}<span class="text-base text-gray-400 font-normal">/mo</span></p>
                    <p class="text-[11px] text-gray-500 mt-1">All-in — hardware, service, support</p>
                </div>
                <div class="text-center text-3xl text-gray-500 font-light hidden md:block">&rarr;</div>
                <div class="text-center md:text-left">
                    <p class="text-[10px] uppercase tracking-widest text-gray-400 font-semibold mb-1">Equivalent FTE Coverage</p>
                    <p class="text-3xl font-bold tech-font text-white">$${fteEquivCost.toLocaleString()}<span class="text-base text-gray-400 font-normal">/mo</span></p>
                    <p class="text-[11px] text-gray-500 mt-1">${fteCount} FTEs × $${fteCost.toLocaleString()}/mo fully-loaded</p>
                </div>
            </div>
            <div class="mt-5 pt-5 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-3">
                <p class="text-sm text-gray-300">The fleet delivers this coverage for</p>
                <p class="text-2xl md:text-3xl font-bold tech-font" style="color:var(--accent-light)">${deltaSign}$${Math.abs(delta).toLocaleString()}/mo ${delta >= 0 ? 'less' : 'more'}</p>
                <p class="text-sm text-gray-300">${Math.abs(deltaPct)}% ${delta >= 0 ? 'cheaper' : 'more'} · ${deltaSign}$${Math.abs(delta * 12).toLocaleString()}/yr delta</p>
            </div>
            <p class="text-[10px] text-gray-500 italic mt-4 leading-relaxed">
                Not counted: recruiting, turnover, OT premiums, overnight differentials, agency markup. Hospitality turnover runs 70–100%/yr — typically adds 20–40% on top of base FTE cost.
            </p>
        </div>
    `;
}
```

- [ ] **Step 4: Implement renderAnnualSummary()**

Replace the `function renderAnnualSummary() {}` stub with:

```js
function renderAnnualSummary() {
    const n = state.count;
    const activeFleet = DATA.fleet.slice(0, n);
    const monthlyCost = activeFleet.reduce((s, r) => s + r.monthlyEstimate, 0);
    const monthlySavings = activeFleet.reduce((s, r) => s + r.savings, 0);
    const netMonthly = monthlySavings - monthlyCost;
    const annualNet = netMonthly * 12;
    const intelY1 = state.intel ? INTEL_Y1_INSTALL : 0;
    const intelY2 = state.intel ? INTEL_Y2_LICENSE : 0;
    const year1 = monthlyCost * 12 + intelY1;
    const year2 = monthlyCost * 12 + intelY2;
    const sign = annualNet >= 0 ? '+$' : '−$';

    document.getElementById('annualContainer').innerHTML = `
        <div class="mt-4 p-5 rounded-xl" style="background: linear-gradient(135deg, color-mix(in srgb, var(--accent) 15%, transparent), color-mix(in srgb, var(--accent) 4%, transparent)); border: 1px solid color-mix(in srgb, var(--accent) 35%, transparent);">
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 text-center md:text-left">
                <div>
                    <p class="text-[10px] uppercase tracking-widest font-semibold mb-1" style="color:var(--accent-light)">Year 1 All-In</p>
                    <p class="text-2xl font-bold tech-font text-white">$${year1.toLocaleString()}</p>
                </div>
                <div>
                    <p class="text-[10px] uppercase tracking-widest font-semibold mb-1" style="color:var(--accent-light)">Year 2+ Steady-State</p>
                    <p class="text-2xl font-bold tech-font text-white">$${year2.toLocaleString()}</p>
                </div>
                <div>
                    <p class="text-[10px] uppercase tracking-widest font-semibold mb-1" style="color:var(--accent-light)">Annual Net Cash Benefit</p>
                    <p class="text-2xl font-bold tech-font" style="color:var(--accent-light)">${sign}${Math.abs(annualNet).toLocaleString()}</p>
                </div>
            </div>
        </div>
    `;
}
```

- [ ] **Step 5: Test manually**

1. Open proposal via fleet designer
2. Verify: Impact card shows touchpoints and FTE equivalence that change with slider
3. Verify: Three savings tiles show correct math (cost, savings, net)
4. Verify: vs. Hiring comparison updates with slider
5. Verify: Annual summary updates when Intelligence toggle is flipped
6. Verify: all numbers are correctly formatted with commas

- [ ] **Step 6: Commit**

```bash
git add pages/proposal.html
git commit -m "feat(proposal): implement impact, savings, FTE comparison, and annual summary

Problem: Configurator panel has no financial analysis sections.

Solution: Four render functions implementing the Enhanced Service
Capacity card (touchpoints + FTE freed + revenue capture), hard savings
row, vs. Hiring comparison, and annual summary. All values update
dynamically as the slider moves and Intelligence Platform toggles."
```

---

### Task 6: Phase Timeline, Savings Table, and Service Tier Unlocks

**Files:**
- Modify: `pages/proposal.html` (replace renderPhases, renderSavingsTable, renderUnlocks stubs)

- [ ] **Step 1: Implement renderPhases()**

Replace the `function renderPhases() {}` stub with:

```js
function renderPhases() {
    const n = state.count;
    const phaseBreaks = generatePhaseBreaks(DATA.fleet.length);

    // WHY: Determine how many phases are "reached" at the current slider position
    let activePhases = 0;
    for (const p of phaseBreaks) {
        if (n >= (phaseBreaks.indexOf(p) === 0 ? 1 : phaseBreaks[phaseBreaks.indexOf(p) - 1].upTo + 1)) {
            activePhases++;
        }
    }

    // Add intelligence phase if toggled
    const allPhases = [...phaseBreaks];
    if (state.intel || DATA.fleet.length >= 7) {
        allPhases.push({ upTo: DATA.fleet.length, name: 'Intelligence Platform', timeframe: 'Months 7–8' });
    }

    let phasesHtml = '';
    allPhases.forEach((phase, idx) => {
        const isIntel = phase.name === 'Intelligence Platform';
        const included = isIntel ? state.intel : idx < activePhases;
        const narrated = NARRATIVES.phases[idx];
        const desc = narrated ? narrated.description : `Deploy fleet robots for ${phase.name.toLowerCase()}.`;

        // WHY: List which robots deploy in this phase
        const prevUpTo = idx > 0 && !isIntel ? allPhases[idx - 1].upTo : 0;
        const robotNames = isIntel ? [] : DATA.fleet.slice(prevUpTo, phase.upTo).map(s => `${s.robot.company} ${s.robot.model_name}`);

        phasesHtml += `
            <div class="phase-card${included ? ' included' : ' skipped'}">
                <div class="flex items-center gap-2 mb-2">
                    <div class="w-7 h-7 rounded-full text-white flex items-center justify-center text-xs font-bold tech-font" style="background:var(--accent)">${idx + 1}</div>
                    <p class="text-[10px] uppercase tracking-widest text-gray-700 font-semibold">${phase.timeframe}</p>
                </div>
                <p class="font-bold text-gray-900 mb-1 text-sm">${phase.name}</p>
                <p class="text-xs text-gray-600 leading-snug">${desc}</p>
                ${robotNames.length > 0 ? `<p class="text-[10px] text-gray-400 mt-2">${robotNames.join(', ')}</p>` : ''}
                ${isIntel && !state.intel ? '<p class="text-[10px] mt-2 text-gray-500 italic">Requires Intelligence Platform add-on</p>' : ''}
            </div>
        `;
    });

    document.getElementById('phaseSection').innerHTML = `
        <div class="text-center mb-6">
            <p class="text-sm uppercase tracking-widest font-semibold mb-3" style="color:var(--accent)">Deployment Timeline</p>
            <h2 class="headline text-3xl font-bold text-gray-900 mb-3">Phased rollout. Proven at each step.</h2>
        </div>
        <div class="phase-timeline">${phasesHtml}</div>
    `;
}
```

- [ ] **Step 2: Implement renderSavingsTable()**

Replace the `function renderSavingsTable() {}` stub with:

```js
function renderSavingsTable() {
    const n = state.count;
    const activeFleet = DATA.fleet.slice(0, n);
    let total = 0;

    let rowsHtml = '';
    activeFleet.forEach((slot, i) => {
        total += slot.savings;
        const narr = NARRATIVES.robots[i] || {};
        rowsHtml += `
            <tr>
                <td><strong>${slot.robot.company} ${slot.robot.model_name}</strong></td>
                <td>${slot.serviceLine}</td>
                <td>${narr.savingsCapture || 'Labor offset'}</td>
                <td class="num">$${slot.savings.toLocaleString()}</td>
            </tr>
        `;
    });

    document.getElementById('savingsTableSection').innerHTML = `
        <div class="text-center mb-6">
            <p class="text-sm uppercase tracking-widest font-semibold mb-3" style="color:var(--accent)">Savings Breakdown</p>
            <h2 class="headline text-3xl font-bold text-gray-900 mb-3">Where the money comes from</h2>
        </div>
        <div class="overflow-x-auto">
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Robot</th>
                        <th>Service Line</th>
                        <th>Replaces</th>
                        <th class="right">Monthly Savings</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
                <tfoot>
                    <tr class="total">
                        <td colspan="3">Total Monthly Savings</td>
                        <td class="num">$${total.toLocaleString()}</td>
                    </tr>
                </tfoot>
            </table>
        </div>
    `;
}
```

- [ ] **Step 3: Implement renderUnlocks()**

Replace the `function renderUnlocks() {}` stub with:

```js
function renderUnlocks() {
    const n = state.count;
    const CATEGORY_COLOR = {
        cleaning: '#6b8e23', delivery: '#3b7a9a', logistics: '#5a6b7a',
        service: '#8a6f47', security: '#4a3a6a',
    };

    let activeCardsHtml = '';
    DATA.fleet.slice(0, n).forEach((slot, i) => {
        const narr = NARRATIVES.robots[i] || {};
        const color = CATEGORY_COLOR[slot.type] || 'var(--accent)';
        activeCardsHtml += `
            <div class="unlock-card" style="border-left-color:${color}">
                <div class="flex items-start justify-between gap-3 mb-2">
                    <span class="tech-font text-[10px] uppercase tracking-widest font-bold" style="color:${color}">${slot.type}</span>
                    <span class="tech-font text-[10px] text-gray-400">${slot.robot.model_name}</span>
                </div>
                <p class="text-sm text-gray-800 leading-snug">${narr.unlockNarrative || 'Automates ' + slot.serviceLine.toLowerCase()}</p>
            </div>
        `;
    });

    // "Next up" preview
    let lockedHtml = '';
    const upcoming = DATA.fleet.slice(n, n + 2);
    if (upcoming.length > 0) {
        upcoming.forEach((slot, i) => {
            const narr = NARRATIVES.robots[n + i] || {};
            lockedHtml += `
                <div class="unlock-card locked">
                    <div class="flex items-start justify-between gap-3 mb-2">
                        <span class="tech-font text-[10px] uppercase tracking-widest font-bold text-gray-400">+${n + i + 1}th robot</span>
                        <span class="tech-font text-[10px] text-gray-400">${slot.robot.model_name}</span>
                    </div>
                    <p class="text-sm text-gray-500 leading-snug">${narr.unlockNarrative || 'Automates ' + slot.serviceLine.toLowerCase()}</p>
                </div>
            `;
        });
    }

    document.getElementById('unlocksSection').innerHTML = `
        <div class="text-center mb-6">
            <p class="text-sm uppercase tracking-widest font-semibold mb-3" style="color:var(--accent)">Service Tier</p>
            <h2 class="headline text-3xl font-bold text-gray-900 mb-3">${NARRATIVES.tierName}</h2>
            <p class="text-gray-600 max-w-2xl mx-auto">${NARRATIVES.tierNarrative}</p>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">${activeCardsHtml}</div>
        ${lockedHtml ? `
            <div class="mt-4">
                <p class="text-sm text-gray-500 font-semibold mb-3">Next up — add more robots to unlock:</p>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-3">${lockedHtml}</div>
            </div>
        ` : ''}
    `;
}
```

- [ ] **Step 4: Test manually**

1. Open proposal via fleet designer
2. Verify: Phase timeline shows correct phases, dimming skipped phases
3. Verify: Savings table lists each active robot with correct savings
4. Verify: Unlock cards show per-robot narratives
5. Verify: "Next up" cards appear when slider is below max
6. Move slider — all three sections update

- [ ] **Step 5: Commit**

```bash
git add pages/proposal.html
git commit -m "feat(proposal): implement phase timeline, savings table, and service unlocks

Problem: Proposal has no deployment phases, savings detail, or service
tier narrative.

Solution: Phase timeline auto-generates from fleet size with robot
assignments per phase. Savings breakdown table shows per-robot labor
offsets. Service tier unlocks show Claude-narrated capabilities with
'next up' preview for upselling."
```

---

### Task 7: Footer — Share Link, Print Button, Branding

**Files:**
- Modify: `pages/proposal.html` (replace renderFooter stub)

- [ ] **Step 1: Implement renderFooter()**

Replace the `function renderFooter() {}` stub with:

```js
function renderFooter() {
    const date = DATA.generatedAt ? new Date(DATA.generatedAt).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) : new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

    document.getElementById('footerSection').innerHTML = `
        <div class="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
            <div class="flex items-center gap-3">
                <div class="w-8 h-8 rounded-lg flex items-center justify-center" style="background: linear-gradient(135deg, #0055ff, #00c8ff, #7c3aed);">
                    <svg class="w-4 h-4 text-white" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="4" cy="6" r="1.5" fill="currentColor"/><circle cx="20" cy="6" r="1.5" fill="currentColor"/><circle cx="4" cy="18" r="1.5" fill="currentColor"/><circle cx="20" cy="18" r="1.5" fill="currentColor"/><line x1="12" y1="12" x2="4" y2="6"/><line x1="12" y1="12" x2="20" y2="6"/><line x1="12" y1="12" x2="4" y2="18"/><line x1="12" y1="12" x2="20" y2="18"/></svg>
                </div>
                <div>
                    <p class="text-sm font-bold text-gray-800">Accelerate Robotics</p>
                    <p class="text-xs text-gray-500">One Brain. Many Bots. · Generated ${date}</p>
                </div>
            </div>
            <div class="flex items-center gap-3">
                <button id="shareBtn" class="no-print px-4 py-2 rounded-lg text-sm font-semibold text-white" style="background:var(--accent)" onclick="shareProposal()">Share Proposal</button>
                <button class="no-print px-4 py-2 rounded-lg text-sm font-semibold border border-gray-300 text-gray-700 hover:bg-gray-100" onclick="window.print()">Print / Save PDF</button>
                <a href="fleet-designer.html" class="no-print text-xs text-gray-500 hover:text-gray-700 underline">Back to Fleet Designer</a>
            </div>
        </div>
        <div id="shareToast" style="display:none; position:fixed; bottom:2rem; left:50%; transform:translateX(-50%); background:#1f2937; color:#fff; padding:0.75rem 1.5rem; border-radius:0.5rem; font-size:0.85rem; z-index:1000; box-shadow:0 4px 20px rgba(0,0,0,0.3);">
            Link copied to clipboard!
        </div>
    `;
}
```

- [ ] **Step 2: Add the shareProposal() function**

Add this function in the `<script>` section, after the `render()` function and before the placeholder stubs:

```js
/* ── SHARE PROPOSAL ─────────────────────────────────────────── */
function shareProposal() {
    // WHY: Encode the full payload (minus generatedAt) as base64 in the URL hash.
    // This makes the link self-contained — no server needed to store proposals.
    const payload = { ...DATA, generatedAt: new Date().toISOString() };
    const encoded = btoa(JSON.stringify(payload));
    const url = location.origin + location.pathname + '#config=' + encoded;

    navigator.clipboard.writeText(url).then(() => {
        const toast = document.getElementById('shareToast');
        toast.style.display = 'block';
        setTimeout(() => { toast.style.display = 'none'; }, 2500);
    }).catch(() => {
        // WHY: Fallback for browsers that block clipboard access
        prompt('Copy this link:', url);
    });
}
```

- [ ] **Step 3: Test manually**

1. Open proposal via fleet designer
2. Verify: Footer shows Accelerate branding and generation date
3. Click "Share Proposal" — verify toast appears and URL is in clipboard
4. Open the copied URL in a new incognito tab — verify the proposal loads with same data
5. Click "Print / Save PDF" — verify print preview shows properly (no sliders, no share button)
6. Click "Back to Fleet Designer" — navigates back

- [ ] **Step 4: Commit**

```bash
git add pages/proposal.html
git commit -m "feat(proposal): implement footer with share link, print, and branding

Problem: Proposal has no way to share or print.

Solution: Footer with Share Proposal button (encodes fleet config to
base64 URL hash, copies to clipboard with toast notification), Print/PDF
button (triggers window.print with comprehensive @media print styles),
and Back to Fleet Designer link."
```

---

## Self-Review

**Spec coverage check:**
- Architecture & data flow → Task 1 (endpoint), Task 2 (handoff), Task 3 (loading)
- Narration API → Task 1
- Proposal sections 1-2 (header, intro) → Task 4
- Section 3 (configurator, slider, robots, LEDs, toggle) → Task 4
- Section 4 (impact) → Task 5
- Section 5 (savings) → Task 5
- Section 6 (vs. hiring) → Task 5
- Section 7 (phases) → Task 6
- Section 8 (savings table) → Task 6
- Section 9 (unlocks) → Task 6
- Section 10 (footer) → Task 7
- Property theming → Task 3
- Share URL → Task 7
- Print styles → Task 3
- Fallback narratives → Task 3

**Placeholder scan:** No TBD/TODO found. All steps have complete code.

**Type consistency:** `DATA`, `NARRATIVES`, `state` are used consistently across all tasks. `generatePhaseBreaks()`, `generatePresets()`, `getFteMonthlyCost()` are defined in Task 3 and referenced in Tasks 5-6. `shareProposal()` is defined in Task 7 and referenced by the footer's `onclick`.
