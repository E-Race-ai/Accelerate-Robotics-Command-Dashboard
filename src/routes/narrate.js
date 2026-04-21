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
