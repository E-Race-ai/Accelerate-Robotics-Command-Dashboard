// Pure helpers for the Hotel Research route.
//
// Why a separate file: these don't depend on the DB module, so unit tests can
// require this file directly without bootstrapping libsql/Turso.

// Rough US ADR estimates by brand. Sales reps need a "is this a $130 vs $500
// property" gauge — numbers are intentionally approximate. Reps override per-
// hotel via the saved-hotel `est_adr_dollars` field. Sources: STR composite
// 2024-2025 + chain segment averages. Update as needed (or replace with a
// real partner API).
const BRAND_ADR_USD = {
  // Economy / budget
  'motel 6':              80,
  'super 8':              80,
  'days inn':             95,
  'red roof inn':         90,
  'travelodge':           85,
  'econo lodge':          85,
  // Midscale
  'best western':        130,
  'comfort inn':         130,
  'comfort suites':      135,
  'la quinta':           115,
  'quality inn':         115,
  'sleep inn':           120,
  // Upper midscale
  'holiday inn express': 145,
  'holiday inn':         155,
  'hampton inn':         165,
  'hampton':             165,
  'fairfield inn':       150,
  'fairfield':           150,
  'wingate':             150,
  // Upscale
  'courtyard':           175,
  'hilton garden inn':   195,
  'doubletree':          195,
  'embassy suites':      215,
  'marriott':            220,
  'hilton':              230,
  'sheraton':            220,
  'crowne plaza':        205,
  'westin':              280,
  // Upper upscale
  'hyatt regency':       280,
  'renaissance':         300,
  'jw marriott':         380,
  'w hotel':             400,
  'kimpton':             310,
  // Luxury
  'ritz-carlton':        600,
  'ritz carlton':        600,
  'four seasons':        700,
  'st. regis':           750,
  'st regis':            750,
  'waldorf astoria':     600,
  'park hyatt':          650,
  'mandarin oriental':   700,
};

// Star → ADR fallback when brand unknown. Loose order-of-magnitude rule.
const STAR_ADR_USD = { 1: 75, 2: 110, 3: 160, 4: 240, 5: 450 };

// Normalize a brand string into a space-separated token sequence so we can do
// word-boundary matching. Strips punctuation but preserves word order:
// "Ritz-Carlton, Boston" → "ritz carlton boston". Means brand keys like
// "ritz-carlton" must also be tokenized before matching.
function tokenizeBrand(s) {
  return String(s || '').toLowerCase().split(/[^a-z0-9]+/i).filter(Boolean).join(' ');
}

function estimateAdr({ brand, stars }) {
  if (brand) {
    const tokenized = tokenizeBrand(brand);
    // Word-boundary partial match — "Hampton Inn & Suites Boston" should
    // match "hampton inn", but "Unknown Brand" must NOT spuriously match
    // brands whose normalized key is a substring of unrelated words.
    // Pad with spaces so we match whole-token sequences only.
    const padded = ' ' + tokenized + ' ';
    for (const [k, v] of Object.entries(BRAND_ADR_USD)) {
      const kTok = tokenizeBrand(k);
      if (padded.includes(' ' + kTok + ' ')) return v;
    }
  }
  const s = Number(stars);
  if (Number.isInteger(s) && STAR_ADR_USD[s] != null) return STAR_ADR_USD[s];
  return null;
}

// Cache-key normalization so "Boston, MA" and "  boston,ma " hit the same entry.
function normLocation(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

// Haversine, miles. Distance from search center for sort + display.
function distanceMiles(lat1, lng1, lat2, lng2) {
  const R = 3958.8;            // Earth radius, miles
  const toRad = d => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
            Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function elementCoords(el) {
  if (el.lat != null && el.lon != null) return { lat: el.lat, lng: el.lon };
  if (el.center) return { lat: el.center.lat, lng: el.center.lon };
  return null;
}

function shapeHotel(el, centerLat, centerLng) {
  const tags = el.tags || {};
  const coords = elementCoords(el);
  if (!coords) return null;

  // Address: OSM splits into addr:* tags. Stitch into a one-liner if any are present.
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ').trim();
  const cityLine = [tags['addr:city'], tags['addr:state'], tags['addr:postcode']].filter(Boolean).join(', ').trim();
  const address = [street, cityLine].filter(Boolean).join(', ');

  const stars = tags.stars ? parseInt(tags.stars, 10) : null;
  const rooms = tags.rooms ? parseInt(tags.rooms, 10) : null;
  const brand = tags.brand || tags.operator || null;
  const operator = tags.operator || null;
  const ownership = tags.ownership || null;
  const totalFloors = tags['building:levels'] ? parseInt(tags['building:levels'], 10) : null;

  // year_opened — OSM uses `start_date` or `construction_year`; both can be a
  // bare 4-digit year, an ISO date, or a year range. Extract the leading 4 digits.
  let yearOpened = null;
  for (const k of ['start_date', 'construction_year', 'opening_date', 'opened']) {
    if (tags[k]) {
      const m = String(tags[k]).match(/(\d{4})/);
      if (m) { yearOpened = parseInt(m[1], 10); break; }
    }
  }

  // Pull amenity flags into a compact JSON object — surfaces what the
  // property has when reps need it without bloating individual columns.
  const AMENITY_KEYS = [
    'internet_access', 'wifi', 'fee', 'air_conditioning', 'wheelchair',
    'smoking', 'parking', 'pool', 'sauna', 'spa', 'restaurant', 'bar',
    'breakfast', 'gym', 'capacity', 'capacity:persons', 'capacity:rooms',
  ];
  const amenities = {};
  for (const k of AMENITY_KEYS) {
    if (tags[k] != null) amenities[k] = tags[k];
  }

  return {
    osm_id: `${el.type}/${el.id}`,
    name: tags.name || tags['name:en'] || '(unnamed property)',
    tourism: tags.tourism || 'hotel',
    address: address || null,
    city: tags['addr:city'] || null,
    state: tags['addr:state'] || null,
    zip: tags['addr:postcode'] || null,
    country: tags['addr:country'] || 'US',
    lat: coords.lat,
    lng: coords.lng,
    brand,
    operator,
    ownership,
    stars: Number.isInteger(stars) ? stars : null,
    rooms: Number.isInteger(rooms) ? rooms : null,
    total_floors: Number.isInteger(totalFloors) ? totalFloors : null,
    year_opened: Number.isInteger(yearOpened) ? yearOpened : null,
    amenities: Object.keys(amenities).length ? amenities : null,
    phone: tags.phone || tags['contact:phone'] || null,
    website: tags.website || tags['contact:website'] || null,
    distance_miles: Number(distanceMiles(centerLat, centerLng, coords.lat, coords.lng).toFixed(2)),
    estimated_adr_dollars: estimateAdr({ brand, stars }),
  };
}

// ── Accelerate Robotics RaaS revenue model ──────────────────────────
// $/month per mid-grade robot. We charge $1500-$2500/month per bot
// depending on tier; $2000 is the midpoint we use for sizing the pipeline
// so reps see one consistent number across the funnel. The actual deal
// price is set per-property at proposal time.
const RAAS_MONTHLY_PER_BOT_USD = 2000;

// Robot count scales with property size + service complexity. Anchors
// (per Eric's deal-cycle model):
//   • Pilot                  → 3 bots
//   • Bigger pilot           → 5-7 bots
//   • Full deployment        → 10+ bots
// Rooms drives the base count; luxury (more service touchpoints), F&B
// outlets, and large event space each add 1-2 bots. The final number
// stays bounded so a Fontainebleau-class property doesn't price itself
// out of believability.
function estimatedRobotCount({
  rooms, stars, restaurant_count, event_sqft, ballroom_capacity,
}) {
  const r = Number(rooms);
  if (!Number.isFinite(r) || r <= 0) return null;
  let bots;
  if (r >= 1000)      bots = 30;
  else if (r >= 500)  bots = 16;
  else if (r >= 300)  bots = 10;  // anchor: full-deployment threshold
  else if (r >= 150)  bots = 6;   // anchor: bigger-pilot threshold
  else if (r >= 50)   bots = 3;   // anchor: pilot threshold
  else if (r >= 20)   bots = 2;
  else                bots = 1;
  // Luxury bump: 5★ properties run more high-touch service flows
  // (turn-down, in-room dining at 11pm, lobby valet runner).
  const s = Number(stars) || 0;
  if (s >= 5) bots = Math.round(bots * 1.3);
  // F&B outlets add food-runner use cases; event space adds banquet
  // setup runners. Caps prevent stacking from blowing the count up.
  const restaurants = Number(restaurant_count) || 0;
  if (restaurants >= 3)      bots += 2;
  else if (restaurants >= 1) bots += 1;
  const events = Number(event_sqft) || 0;
  if (events >= 50_000)      bots += 3;
  else if (events >= 20_000) bots += 2;
  else if (events >= 5_000)  bots += 1;
  const ballroom = Number(ballroom_capacity) || 0;
  if (ballroom >= 1000) bots += 1;
  // Floor + sanity ceiling — don't promise a 50-bot deployment to a
  // 12-room boutique because it has 3 restaurants.
  return Math.max(1, Math.min(bots, 40));
}

// Annual revenue for the deal in our pipeline = bots × monthly × 12.
// Returns null when we don't have enough info (no rooms data) so the UI
// can hide the field rather than show a fake number.
function revenuePotential({
  rooms, stars, restaurant_count, event_sqft, ballroom_capacity,
}) {
  const bots = estimatedRobotCount({ rooms, stars, restaurant_count, event_sqft, ballroom_capacity });
  if (!bots) return null;
  return bots * RAAS_MONTHLY_PER_BOT_USD * 12;
}

// Deal-size tier — banded against the new RaaS-based revenue. Anchor
// points map to the user's deal-cycle vocabulary so the badge means
// the same thing at-a-glance:
//   XS  <  $30k   — sub-pilot exploration (1 bot, tiny boutique)
//   S   $30-75k   — mini-pilot (2-3 bots)
//   M   $75-150k  — pilot+ (3-5 bots)
//   L   $150-300k — bigger pilot (6-10 bots)
//   XL  $300k+    — full deployment (10+ bots)
function dealSizeTier(rev) {
  if (!Number.isFinite(rev) || rev <= 0) return null;
  if (rev >= 300_000) return 'XL';
  if (rev >= 150_000) return 'L';
  if (rev >=  75_000) return 'M';
  if (rev >=  30_000) return 'S';
  return 'XS';
}

function fmtRevenue(rev) {
  if (!Number.isFinite(rev) || rev <= 0) return null;
  if (rev >= 1e9) return '$' + (rev / 1e9).toFixed(1) + 'B';
  if (rev >= 1e6) return '$' + (rev / 1e6).toFixed(1) + 'M';
  if (rev >= 1e3) return '$' + (rev / 1e3).toFixed(0) + 'K';
  return '$' + rev;
}

// Brand class — coarse tier we surface as a filter dimension. Mirrors STR's
// brand-class buckets: luxury → upper-upscale → upscale → upper-midscale →
// midscale → economy → independent. Used by the table-view filter and by the
// `graduate to prospect` heuristic.
function brandClass({ brand, stars, est_adr }) {
  const b = String(brand || '').toLowerCase();
  if (/four seasons|ritz|st\.? regis|waldorf|mandarin|park hyatt/.test(b)) return 'luxury';
  if (/jw marriott|w hotel|kimpton|edition|conrad|fairmont/.test(b))         return 'upper_upscale';
  if (/hyatt regency|renaissance|marriott|hilton(?!\s*garden)|sheraton|westin|crowne plaza|doubletree/.test(b)) return 'upscale';
  if (/hilton garden|courtyard|hampton|holiday inn(?!\s*express)|hyatt place|fairfield/.test(b)) return 'upper_midscale';
  if (/holiday inn express|comfort|best western|la quinta|wingate|sleep inn/.test(b)) return 'midscale';
  if (/super 8|motel 6|days inn|red roof|travelodge|econo lodge/.test(b))    return 'economy';
  // Star fallback when brand is unknown/independent.
  if (Number.isInteger(Number(stars))) {
    const s = Number(stars);
    if (s >= 5) return 'luxury';
    if (s === 4) return 'upper_upscale';
    if (s === 3) return 'upscale';
    if (s === 2) return 'midscale';
    if (s === 1) return 'economy';
  }
  // ADR fallback when brand + stars both empty.
  const adr = Number(est_adr);
  if (Number.isFinite(adr)) {
    if (adr >= 500) return 'luxury';
    if (adr >= 280) return 'upper_upscale';
    if (adr >= 180) return 'upscale';
    if (adr >= 130) return 'upper_midscale';
    if (adr >= 100) return 'midscale';
    if (adr >  0)   return 'economy';
  }
  return 'independent';
}

const BRAND_CLASS_LABELS = {
  luxury:         'Luxury',
  upper_upscale:  'Upper Upscale',
  upscale:        'Upscale',
  upper_midscale: 'Upper Midscale',
  midscale:       'Midscale',
  economy:        'Economy',
  independent:    'Independent',
};

module.exports = {
  BRAND_ADR_USD,
  STAR_ADR_USD,
  estimateAdr,
  normLocation,
  distanceMiles,
  elementCoords,
  shapeHotel,
  brandClass,
  BRAND_CLASS_LABELS,
  RAAS_MONTHLY_PER_BOT_USD,
  estimatedRobotCount,
  revenuePotential,
  dealSizeTier,
  fmtRevenue,
};
