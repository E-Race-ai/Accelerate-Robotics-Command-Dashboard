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

const { brandClass } = require('./hotel-research-utils');

// Major chains we know hire enterprise tech. Used for the operator bonus.
// Match is case-insensitive substring.
const ENTERPRISE_CHAINS = [
  'marriott', 'hilton', 'hyatt', 'ihg', 'accor', 'four seasons', 'ritz',
  'wyndham', 'choice', 'best western', 'kimpton', 'westin', 'sheraton',
  'sofitel', 'fairmont', 'st regis', 'st. regis', 'edition', 'w hotel',
  'aman', 'mandarin', 'rosewood', 'loews', 'omni', 'fontainebleau',
];

// Weights tuned for the Miami pilot — knobs we can re-balance after the
// first batch of triage decisions teaches us which signals predict YES.
const W_ROOMS_XL    = 25; // 300+ rooms — big property, big elevator infra
const W_ROOMS_L     = 18; // 150–299
const W_ROOMS_M     = 10; // 75–149
const W_ROOMS_S     = 4;  // 30–74
const W_BRAND_LUX   = 20; // luxury
const W_BRAND_UU    = 17; // upper_upscale
const W_BRAND_UPS   = 13; // upscale
const W_BRAND_UM    = 8;  // upper_midscale
const W_BRAND_MID   = 4;  // midscale
const W_FLOORS_XL   = 15; // 8+ floors — robot↔elevator value spike
const W_FLOORS_L    = 8;  // 4–7 floors
const W_STARS_5     = 10;
const W_STARS_4     = 7;
const W_STARS_3     = 3;
const W_OPERATOR    = 10; // recognized enterprise chain
const W_ADR_XL      = 15; // $400+ ADR — high revenue density, robotics ROI works
const W_ADR_L       = 10; // $250–399
const W_ADR_M       = 5;  // $150–249
const W_NEW_BUILD   = 6;  // opened ≥ 2018 — modern infra, easier integration
const W_OWN_LIST    = 4;  // already qualified/contacted — give a small nudge

// Penalties — knock out properties that aren't a fit no matter what
const P_HOSTEL      = -40;
const P_MOTEL       = -25;
const P_TINY        = -15; // <15 rooms

// Now also matches the hotel NAME — many OSM rows lack the operator/brand
// field but the chain shows up in the name ("Marriott Coral Gables").
function isEnterpriseOperator(operator, brand, name) {
  const blob = `${operator || ''} ${brand || ''} ${name || ''}`.toLowerCase();
  return ENTERPRISE_CHAINS.some(c => blob.includes(c));
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
// reason strings so the reasoning matches what was rewarded.
function bucketSize(rooms) {
  const r = Number(rooms) || 0;
  if (r >= 300) return ['xl', `${r} rooms (XL)`,    W_ROOMS_XL];
  if (r >= 150) return ['l',  `${r} rooms (large)`, W_ROOMS_L];
  if (r >= 75)  return ['m',  `${r} rooms`,         W_ROOMS_M];
  if (r >= 30)  return ['s',  `${r} rooms`,         W_ROOMS_S];
  return [null, null, 0];
}

function bucketBrand(cls) {
  switch (cls) {
    case 'luxury':         return ['lux', 'Luxury class',         W_BRAND_LUX];
    case 'upper_upscale':  return ['uu',  'Upper-upscale brand',  W_BRAND_UU];
    case 'upscale':        return ['ups', 'Upscale brand',        W_BRAND_UPS];
    case 'upper_midscale': return ['um',  'Upper-midscale brand', W_BRAND_UM];
    case 'midscale':       return ['mid', 'Midscale brand',       W_BRAND_MID];
    default:               return [null, null, 0];
  }
}

function bucketFloors(floors) {
  const f = Number(floors) || 0;
  if (f >= 8) return ['xl', `${f}-floor tower`,   W_FLOORS_XL];
  if (f >= 4) return ['l',  `${f} floors`,        W_FLOORS_L];
  return [null, null, 0];
}

function bucketAdr(adr) {
  const a = Number(adr) || 0;
  if (a >= 400) return ['xl', `~$${a}/night ADR`, W_ADR_XL];
  if (a >= 250) return ['l',  `~$${a}/night ADR`, W_ADR_L];
  if (a >= 150) return ['m',  `~$${a}/night ADR`, W_ADR_M];
  return [null, null, 0];
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

  // ── Brand class — derive from the same util the rest of the app uses
  const cls = brandClass({
    brand: hotel.brand,
    stars: hotel.stars,
    est_adr: hotel.est_adr_dollars,
  });
  const [, brandLabel, brandPts] = bucketBrand(cls);
  if (brandPts > 0) { score += brandPts; reasons.push({ label: brandLabel, pts: brandPts }); }

  // ── Floors
  const [, floorLabel, floorPts] = bucketFloors(hotel.total_floors);
  if (floorPts > 0) { score += floorPts; reasons.push({ label: floorLabel, pts: floorPts }); }

  // ── Stars (independent signal — some indies have stars but no brand)
  const stars = Number(hotel.stars) || 0;
  if (stars >= 5)      { score += W_STARS_5; reasons.push({ label: '5★ rating',  pts: W_STARS_5 }); }
  else if (stars >= 4) { score += W_STARS_4; reasons.push({ label: '4★ rating',  pts: W_STARS_4 }); }
  else if (stars >= 3) { score += W_STARS_3; reasons.push({ label: '3★ rating',  pts: W_STARS_3 }); }

  // ── Enterprise chain (operator, brand, OR name)
  if (isEnterpriseOperator(hotel.operator, hotel.brand, hotel.name)) {
    score += W_OPERATOR;
    reasons.push({
      label: `${hotel.operator || hotel.brand || 'Recognized chain'} (enterprise chain)`,
      pts: W_OPERATOR,
    });
  }

  // ── Name-pattern bonuses — fills in for sparse OSM data
  const np = namePatternBonus(hotel.name);
  if (np.pts > 0) {
    score += np.pts;
    reasons.push({ label: np.labels.slice(0, 2).join(' · '), pts: np.pts });
  }

  // ── ADR
  const [, adrLabel, adrPts] = bucketAdr(hotel.est_adr_dollars);
  if (adrPts > 0) { score += adrPts; reasons.push({ label: adrLabel, pts: adrPts }); }

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
