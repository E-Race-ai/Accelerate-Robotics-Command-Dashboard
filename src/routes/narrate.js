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

// WHY: 1200 max tokens — the richer prompt voice needs more room than the original 800.
// Typical structured output runs 700–900 tokens. Cost still ~$0.002/call with Haiku.
const MAX_TOKENS = 1200;

// WHY: Voice and framing are modeled on the Moore Miami and Thesis Hotel gold-standard
// proposals — founder-led, specificity-driven, risk-transparent, anchored in operational
// reality. Key principles: lead with guest/member experience (not cost savings), describe
// robots by workflow role (not labor replacement), bind savings to specific expense-line
// eliminations (contract terminations, FTE non-backfill), and phase from low-risk pilot
// to full fleet.
const SYSTEM_PROMPT = `You are a proposal writer for Accelerate Robotics, a company that deploys autonomous robot fleets in hotels and commercial buildings. The founder writes every proposal. Match this voice:

VOICE RULES:
- Confident but never salesy. Specific to the property — name the property, reference its type, market, and operational context.
- Lead with guest/member experience, follow with efficiency. The primary value is a branded amenity that extends service past what human staffing can sustainably cover. Cash savings are real but secondary.
- Describe each robot by its workflow role ("overnight hard-floor maintenance," "in-room dining delivery platform"), never as "labor replacement." The fleet gives staff leverage — it frees them for guest-facing, high-touch work.
- Bind savings to specific expense-line eliminations: contract terminations, FTE non-backfill, OT reduction. Never say "hours freed" or "efficiency gains" — name the line item that shrinks.
- Phases always start with a small, low-risk pilot (1 robot, 30 days, measurable success criteria). Each subsequent phase builds on the previous with clear gates.
- Be honest about constraints. If the property is multi-floor, acknowledge elevator integration as a Phase 2 dependency. Never oversell.

Return ONLY valid JSON matching this schema (no markdown fences, no extra text):
{
  "intro": "2-3 sentences. Name the property. Position the fleet as a branded amenity — something guests see, not back-of-house infrastructure. Mention what makes this property specific (market, size, type).",
  "headline": "Short punchy headline for the interactive fleet configurator (under 10 words)",
  "valueProp": "1-2 sentences. Frame as: this fleet doesn't replace your team, it gives your team leverage. Name the specific shift — from logistics/hauling to guest-facing hospitality.",
  "robots": [
    {
      "goalId": "the goalId from the input",
      "roleDescription": "One-line workflow role at THIS property (e.g., 'Overnight lobby and corridor hard-floor maintenance')",
      "unlockNarrative": "One sentence: what this robot enables for guests or staff — frame as amenity or capacity, not automation",
      "savingsCapture": "The specific expense line this robot offsets (e.g., 'Overnight porter shift — not backfilled', 'Third-party floor-care contract terminated')"
    }
  ],
  "tierName": "A name for the current service tier (e.g., 'Pilot', 'Core Fleet', 'Full Autonomy')",
  "tierNarrative": "2-3 sentences describing what this tier means for the property's operations and guest experience. Reference the specific robots deployed at this tier level.",
  "phases": [
    {
      "name": "Phase name (e.g., 'Pilot', 'Core Fleet', 'Full Fleet', 'Intelligence Platform')",
      "timeframe": "Month N or Months N-M",
      "description": "1-2 sentences. Use action verbs (deploy, commission, integrate). Phase 1 must mention 30-day pilot with measurable success criteria."
    }
  ]
}`;

function buildUserPrompt(data) {
  const { property, facility, fleet } = data;
  const robotList = fleet.map((s, i) => {
    const r = s.robot;
    const details = [
      r.elevator_integration ? 'elevator-capable' : null,
      r.payload_kg ? `${r.payload_kg}kg payload` : null,
    ].filter(Boolean).join(', ');
    return `${i + 1}. ${r.company} ${r.model_name} — ${s.serviceLine} (score: ${s.score}, saves $${s.savings}/mo${details ? ', ' + details : ''})`;
  }).join('\n');

  // WHY: Derive phase count from fleet size — same logic the proposal page uses.
  // Providing it here so narratives reference the right number of phases.
  const phaseCount = fleet.length <= 1 ? 1
    : fleet.length <= 3 ? 2
    : fleet.length <= 6 ? 3
    : 4;

  // WHY: Surface context helps the model write property-specific narratives —
  // carpet vs hardwood changes which cleaning robots matter, F&B count changes
  // delivery robot framing, multi-floor changes phasing language.
  const surfaceList = (facility?.surfaces || []).join(', ') || 'unknown';
  const outdoorList = (facility?.outdoorAmenities || []).join(', ') || 'none';
  const isMultiFloor = (property.floors || 1) > 1;

  return `Generate proposal narratives for this property:

Property: ${property.name}
Type: ${property.type} · ${property.rooms || '?'} rooms · ${property.floors || 1} floors · ${property.market || 'unknown market'}
Elevators: ${property.elevators || 0}${facility?.elevatorMake ? ' (' + facility.elevatorMake + ')' : ''}
F&B outlets: ${facility?.fbOutlets || 0}
Event space: ${facility?.eventSpaceSqFt || 0} sqft
Outdoor amenities: ${outdoorList}
Floor surfaces: ${surfaceList}
${isMultiFloor ? 'Multi-floor property — elevator integration is a Phase 2 dependency.' : 'Single-floor property — no elevator integration required.'}

Fleet (${fleet.length} robots, ordered by deployment priority):
${robotList}

Generate narratives for exactly ${phaseCount} deployment phase${phaseCount > 1 ? 's' : ''}. Phase 1 is always a 30-day pilot with the highest-scoring robot.`;
}

router.post('/', async (req, res) => {
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

// WHY: Test hooks — allow injecting a mock client and resetting the singleton.
// Underscore prefix signals these are internal/test-only.
router._setClient = (c) => { client = c; };
router._resetClient = () => { client = null; };

module.exports = router;
