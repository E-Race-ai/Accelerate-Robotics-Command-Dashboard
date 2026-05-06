// AI Fit Score — pre-sorts the triage queue so Ben/Celia spend their
// triage time on the hotels most likely to be a real Accelerate Robotics
// opportunity. The score is deterministic + explainable: every input has a
// known weight and the top-3 reasons surface on the card.
//
// Why we score (the platform fit narrative):
//   • Accelerate's wedge is robot↔elevator integration + hospital robotics OS
//   • Multi-floor properties amplify the value of an integration deal
//   • Branded chains have the budget + decision hierarchy to engage on
//     enterprise software, but also the longer sales cycle
//   • Independents can move fast but average smaller deal sizes
//   • Hostels / motels / guesthouses are out of scope — small budgets, no
//     elevator floors, no robotics ROI story
//
// Score range: 0–100 (clamped). 70+ = top-tier, 40–69 = worth a call,
// 0–39 = deprioritize. Reasoning is a short array of human strings.

// Goldilocks scoring derives brand tier directly from CHAIN_TIER buckets
// below — `brandClass` from hotel-research-utils is intentionally not used
// here because its luxury/upper_upscale split treats Ritz and Marriott as
// equally good; we want the curve to peak in the middle instead.

// ─── Chain classification — Goldilocks curve ───────────────────────
//
// The Accelerate Robotics fit ISN'T monotonically rising with luxury.
// The sweet spot is mid-tier: full-service brands with real ops pain,
// budget for software, and decision-makers who can move fast. Both
// extremes underperform:
//   • TOO LUXURY (Ritz, St Regis, Four Seasons, Aman, Mandarin) — long
//     corporate sales cycles, ultra-conservative on guest-facing tech,
//     rarely pilot anything not vendor-locked.
//   • TOO BUDGET (Days Inn, Super 8, Motel 6, Econo Lodge) — no software
//     budget, no F&B, single-shift staffing, no robotics ROI story.
// The fit peaks in the upper-upscale + upscale chains (Marriott full-
// service, Hilton, Hyatt Regency, Sheraton, Westin, DoubleTree, Embassy
// Suites, Kimpton, Autograph, Curio, Loews) and well-priced boutiques.
const CHAIN_TIER = {
  luxury_top: [
    'four seasons', 'aman', 'mandarin', 'rosewood', 'st regis', 'st. regis',
    'ritz-carlton', 'ritz carlton', 'the ritz', 'park hyatt',
    'waldorf astoria', 'edition',
  ],
  sweet_spot: [
    'jw marriott', 'marriott', 'hilton', 'hyatt regency', 'grand hyatt',
    'sheraton', 'westin', 'renaissance', 'doubletree', 'embassy suites',
    'kimpton', 'autograph', 'curio', 'tribute', 'loews', 'fontainebleau',
    'eden roc', 'sofitel', 'fairmont', '1 hotel', 'conrad', 'andaz',
    'crowne plaza', 'intercontinental', 'w hotel', 'omni', 'delano',
    'mondrian',
  ],
  good_upscale: [
    'hilton garden inn', 'courtyard', 'ac hotels', 'aloft', 'cambria',
    'hyatt place', 'four points', 'springhill suites', 'residence inn',
    'element', 'homewood suites', 'home2 suites', 'hyatt house',
    'citizenm', 'autograph collection', 'graduate hotel', 'hotel indigo',
  ],
  midscale: [
    'holiday inn express', 'holiday inn', 'hampton inn', 'best western plus',
    'fairfield', 'wingate', 'avid hotel', 'la quinta',
  ],
  budget_too_low: [
    'days inn', 'super 8', 'travelodge', 'econolodge', 'econ lodge',
    'econo lodge', 'red roof', 'motel 6', 'days hotel', 'best western',
    'quality inn', 'comfort inn', 'comfort suites', 'sleep inn', 'baymont',
    'rodeway', 'americas best value', 'studio 6', 'extended stay',
  ],
};

function classifyChain(operator, brand, name) {
  const blob = `${operator || ''} ${brand || ''} ${name || ''}`.toLowerCase();
  // Order matters — check most-specific buckets first so "Hyatt Regency"
  // beats generic "Hyatt", and "Hilton Garden Inn" beats generic "Hilton".
  for (const tier of ['luxury_top', 'sweet_spot', 'good_upscale', 'midscale', 'budget_too_low']) {
    for (const c of CHAIN_TIER[tier]) {
      if (blob.includes(c)) return tier;
    }
  }
  return null; // independent / unrecognized
}

// Weights — tuned to peak in the middle. Both extremes get penalties
// so reps don't waste time on wrong-tier targets.
const W_ROOMS_SWEET    = 18; // 100-300 rooms — sweet spot, real ops pain
const W_ROOMS_LARGE    = 12; // 300-500 — still good, longer sales cycle
const W_ROOMS_HUGE     = 4;  // 500+ — convention property, slow
const W_ROOMS_SMALL    = 8;  // 50-99 — workable boutique
const W_ROOMS_TINY     = 0;  // <50 — too small, no software budget
const W_BRAND_LUX_TOP  = 4;  // top luxury — slow, conservative, deprioritize
const W_BRAND_SWEET    = 22; // upper-upscale + upscale — the target
const W_BRAND_GOOD     = 18; // good upscale (Hilton Garden Inn, Courtyard)
const W_BRAND_MID      = 8;  // midscale (Hampton Inn, Holiday Inn) — workable
const W_BRAND_BUDGET   = -12; // budget (Days Inn, Motel 6) — actively penalize
const W_BRAND_INDIE    = 14; // boutique premium — fast decisions, real pain
const W_FLOORS_XL      = 12;
const W_FLOORS_L       = 6;
const W_STARS_4        = 10; // 4★ — sweet spot
const W_STARS_3        = 7;  // solid mid-market
const W_STARS_5        = 4;  // luxury — moderate; extremely high-end is too slow
const W_ADR_SWEET      = 18; // $200-400 — peak fit
const W_ADR_GOOD       = 14; // $150-200 OR $400-600
const W_ADR_OK         = 8;  // $100-150 OR $600-800
const W_ADR_TOO_LUX    = 2;  // $800+ — over-the-top, deprioritize
const W_ADR_BUDGET     = -8; // <$80 — no software budget
const W_NEW_BUILD      = 6;
const W_OWN_LIST       = 4;

const P_HOSTEL         = -40;
const P_MOTEL          = -25;
const P_TINY           = -15; // <15 rooms

// Backward-compat helpers — kept so any external caller still works.
const ENTERPRISE_CHAINS = [
  ...CHAIN_TIER.sweet_spot, ...CHAIN_TIER.good_upscale,
  ...CHAIN_TIER.luxury_top,
];
function isEnterpriseOperator(operator, brand, name) {
  const tier = classifyChain(operator, brand, name);
  return tier && tier !== 'budget_too_low';
}

// Name-pattern signals — words that hint at scale + service tier when the
// structured rooms/floors data isn't present. "Resort" + "Tower" + "Grand"
// suggest 100+ rooms and elevator infrastructure even without the stats.
const NAME_PATTERN_BONUSES = [
  { rx: /\b(resort|spa)\b/i,           pts: 6,  label: 'Resort/spa property' },
  { rx: /\b(tower|towers|skyline)\b/i, pts: 6,  label: 'Tower property' },
  { rx: /\b(grand|grande)\b/i,         pts: 5,  label: '"Grand" naming' },
  { rx: /\b(plaza)\b/i,                pts: 4,  label: 'Plaza property' },
  { rx: /\b(hotel)\s/i,                pts: 1,  label: 'Branded as hotel' },
  { rx: /\b(boutique)\b/i,             pts: 4,  label: 'Boutique brand' },
  { rx: /\b(palace|royal|imperial)\b/i, pts: 3, label: 'Premium naming' },
  { rx: /\b(beach|oceanfront|harbor|harbour|bay)\b/i, pts: 4, label: 'Waterfront' },
];

function namePatternBonus(name) {
  if (!name) return { pts: 0, labels: [] };
  let total = 0;
  const labels = [];
  for (const p of NAME_PATTERN_BONUSES) {
    if (p.rx.test(name)) { total += p.pts; labels.push(p.label); }
  }
  // Cap stacking at 12 so a "Grand Resort & Spa Tower" doesn't dominate
  return { pts: Math.min(total, 12), labels };
}

// Categorize size, brand, floors, ADR — used both for scoring and for the
// reason strings so the reasoning matches what was rewarded. All curves are
// peak-in-middle: extremes (too small / too luxe / too budget) get little
// or negative weight so reps don't waste time on wrong-tier targets.
function bucketSize(rooms) {
  const r = Number(rooms) || 0;
  // Sweet spot: 100-300 rooms. Real ops pain, real software budget.
  if (r >= 500) return ['huge',  `${r} rooms (very large)`,  W_ROOMS_HUGE];
  if (r >= 300) return ['large', `${r} rooms (large)`,       W_ROOMS_LARGE];
  if (r >= 100) return ['sweet', `${r} rooms — sweet spot`,  W_ROOMS_SWEET];
  if (r >= 50)  return ['small', `${r} rooms (boutique)`,    W_ROOMS_SMALL];
  if (r >= 15)  return ['tiny',  `${r} rooms (small inn)`,   W_ROOMS_TINY];
  return [null, null, 0];
}

// Goldilocks brand weights: top luxury and bottom-budget both penalized,
// the upper-upscale + upscale tiers reward the most. Independents that
// weren't matched as a chain still get a positive nudge (W_BRAND_INDIE)
// because boutiques can move fast and have real ops pain.
function bucketBrand(operator, brand, name) {
  const tier = classifyChain(operator, brand, name);
  switch (tier) {
    case 'luxury_top':
      return ['lux_top', 'Top-luxury (slow sales cycle)',  W_BRAND_LUX_TOP];
    case 'sweet_spot':
      return ['sweet',   'Upper-upscale brand — sweet spot', W_BRAND_SWEET];
    case 'good_upscale':
      return ['good',    'Upscale brand',                  W_BRAND_GOOD];
    case 'midscale':
      return ['mid',     'Midscale brand',                 W_BRAND_MID];
    case 'budget_too_low':
      return ['budget',  'Budget tier (no software ROI)',  W_BRAND_BUDGET];
    default:
      // No chain match — independent / boutique / unknown
      return [null, null, 0];
  }
}

function bucketFloors(floors) {
  const f = Number(floors) || 0;
  if (f >= 8) return ['xl', `${f}-floor tower`,   W_FLOORS_XL];
  if (f >= 4) return ['l',  `${f} floors`,        W_FLOORS_L];
  return [null, null, 0];
}

// Peak-in-middle ADR curve: $200-400 is the sweet spot.
// <$80 = budget, no software money. $800+ = too luxe, too slow.
function bucketAdr(adr) {
  const a = Number(adr) || 0;
  if (a <= 0) return [null, null, 0];
  if (a >= 800) return ['too_lux', `~$${a}/night ADR (very high-end)`, W_ADR_TOO_LUX];
  if (a >= 600) return ['ok_high', `~$${a}/night ADR`,                 W_ADR_OK];
  if (a >= 400) return ['good_h',  `~$${a}/night ADR`,                 W_ADR_GOOD];
  if (a >= 200) return ['sweet',   `~$${a}/night ADR — sweet spot`,    W_ADR_SWEET];
  if (a >= 150) return ['good_l',  `~$${a}/night ADR`,                 W_ADR_GOOD];
  if (a >= 100) return ['ok_low',  `~$${a}/night ADR`,                 W_ADR_OK];
  if (a >= 80)  return ['mid',     `~$${a}/night ADR`,                 4];
  return ['budget', `~$${a}/night ADR (budget)`, W_ADR_BUDGET];
}

// Independent / boutique nudge — paid only when no chain matched and the
// hotel still looks like a real property (not a hostel or motel).
function bucketIndie(operator, brand, name) {
  const tier = classifyChain(operator, brand, name);
  if (tier) return [null, null, 0]; // it's a chain, handled by bucketBrand
  const n = (name || '').toLowerCase();
  if (/\b(hostel|motel|guesthouse|guest house)\b/.test(n)) return [null, null, 0];
  return ['indie', 'Independent / boutique', W_BRAND_INDIE];
}

function nameNegatives(name) {
  const n = (name || '').toLowerCase();
  if (/(^|\s)hostel(\s|$)/.test(n)) return ['hostel', 'Hostel — out of fit', P_HOSTEL];
  if (/(^|\s)motel(\s|$)/.test(n))  return ['motel',  'Motel — small ops',   P_MOTEL];
  return [null, null, 0];
}

function fitScoreFor(hotel) {
  if (!hotel) return { score: 0, reasoning: [], tier: 'low' };
  let score = 0;
  const reasons = [];     // [{label, points}]
  const negatives = [];

  // ── Size
  const [, sizeLabel, sizePts] = bucketSize(hotel.rooms);
  if (sizePts > 0) { score += sizePts; reasons.push({ label: sizeLabel, pts: sizePts }); }

  // ── Brand tier (Goldilocks — peaks in upper-upscale + upscale)
  const [, brandLabel, brandPts] = bucketBrand(hotel.operator, hotel.brand, hotel.name);
  if (brandPts !== 0) {
    if (brandPts > 0) reasons.push({ label: brandLabel, pts: brandPts });
    else negatives.push({ label: brandLabel, pts: brandPts });
    score += brandPts;
  }

  // ── Indie nudge — only paid when no chain matched
  const [, indieLabel, indiePts] = bucketIndie(hotel.operator, hotel.brand, hotel.name);
  if (indiePts > 0) { score += indiePts; reasons.push({ label: indieLabel, pts: indiePts }); }

  // ── Floors
  const [, floorLabel, floorPts] = bucketFloors(hotel.total_floors);
  if (floorPts > 0) { score += floorPts; reasons.push({ label: floorLabel, pts: floorPts }); }

  // ── Stars (independent signal — some indies have stars but no brand)
  const stars = Number(hotel.stars) || 0;
  if (stars >= 5)      { score += W_STARS_5; reasons.push({ label: '5★ rating',  pts: W_STARS_5 }); }
  else if (stars >= 4) { score += W_STARS_4; reasons.push({ label: '4★ rating',  pts: W_STARS_4 }); }
  else if (stars >= 3) { score += W_STARS_3; reasons.push({ label: '3★ rating',  pts: W_STARS_3 }); }

  // ── Name-pattern bonuses — fills in for sparse OSM data
  const np = namePatternBonus(hotel.name);
  if (np.pts > 0) {
    score += np.pts;
    reasons.push({ label: np.labels.slice(0, 2).join(' · '), pts: np.pts });
  }

  // ── ADR (Goldilocks — peaks at $200-400)
  const [, adrLabel, adrPts] = bucketAdr(hotel.est_adr_dollars);
  if (adrPts !== 0) {
    if (adrPts > 0) reasons.push({ label: adrLabel, pts: adrPts });
    else negatives.push({ label: adrLabel, pts: adrPts });
    score += adrPts;
  }

  // ── Newly built / renovated
  const yr = Number(hotel.year_opened) || 0;
  if (yr >= 2018) { score += W_NEW_BUILD; reasons.push({ label: `Opened ${yr}`, pts: W_NEW_BUILD }); }

  // ── Funnel position bonus — the rep already touched this one
  if (hotel.status && ['contacted', 'qualified', 'proposed'].includes(hotel.status)) {
    score += W_OWN_LIST;
    reasons.push({ label: `Already ${hotel.status}`, pts: W_OWN_LIST });
  }

  // ── F&B + event-space intel — only counted when the rep has captured it.
  // These are stronger deal-size signals than rooms alone: a 200-key hotel
  // with 50k sqft of event space is a *much* bigger software opportunity
  // than a 200-key limited-service property. Capped per-field so a single
  // huge value doesn't dominate.
  const restaurants = Number(hotel.restaurant_count) || 0;
  if (restaurants >= 1) {
    const pts = Math.min(restaurants * 3, 12); // 3 each, cap at 12 (4 restaurants)
    score += pts;
    reasons.push({ label: `${restaurants} restaurant${restaurants === 1 ? '' : 's'}`, pts });
  }
  const eventSqft = Number(hotel.event_sqft) || 0;
  if (eventSqft >= 5000) {
    const pts = eventSqft >= 50000 ? 12 : eventSqft >= 20000 ? 8 : eventSqft >= 10000 ? 5 : 3;
    score += pts;
    reasons.push({ label: `${eventSqft.toLocaleString()} sqft event space`, pts });
  }
  const meetingRooms = Number(hotel.meeting_room_count) || 0;
  if (meetingRooms >= 3) {
    const pts = Math.min(Math.floor(meetingRooms / 2), 6);
    score += pts;
    reasons.push({ label: `${meetingRooms} meeting rooms`, pts });
  }
  const ballroomCap = Number(hotel.ballroom_capacity) || 0;
  if (ballroomCap >= 200) {
    const pts = ballroomCap >= 1000 ? 8 : ballroomCap >= 500 ? 5 : 3;
    score += pts;
    reasons.push({ label: `Ballroom seats ${ballroomCap.toLocaleString()}`, pts });
  }
  const spas = Number(hotel.spa_count) || 0;
  if (spas >= 1) { score += 3; reasons.push({ label: `${spas} spa`, pts: 3 }); }
  const pools = Number(hotel.pool_count) || 0;
  if (pools >= 2) { score += 3; reasons.push({ label: `${pools} pools`, pts: 3 }); }

  // ── Negatives — name-based knockouts
  const [, negLabel, negPts] = nameNegatives(hotel.name);
  if (negPts < 0) { score += negPts; negatives.push({ label: negLabel, pts: negPts }); }

  // Tiny inn
  const r = Number(hotel.rooms) || 0;
  if (r > 0 && r < 15) { score += P_TINY; negatives.push({ label: `Only ${r} rooms`, pts: P_TINY }); }

  // Clamp 0..100
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Top-3 reasons by absolute weight (so the strongest signal leads).
  // Negatives get pushed in too if they materially dropped the score.
  const allReasons = [...reasons, ...negatives]
    .sort((a, b) => Math.abs(b.pts) - Math.abs(a.pts))
    .slice(0, 4)
    .map(r => r.label);

  // Tier label drives badge color on the card
  let tier;
  if (score >= 70) tier = 'top';
  else if (score >= 50) tier = 'high';
  else if (score >= 30) tier = 'mid';
  else tier = 'low';

  return { score, reasoning: allReasons, tier };
}

module.exports = {
  fitScoreFor,
  isEnterpriseOperator,
  // Exposed for tests / tuning
  ENTERPRISE_CHAINS,
};
