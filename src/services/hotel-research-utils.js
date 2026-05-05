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
    stars: Number.isInteger(stars) ? stars : null,
    rooms: Number.isInteger(rooms) ? rooms : null,
    phone: tags.phone || tags['contact:phone'] || null,
    website: tags.website || tags['contact:website'] || null,
    distance_miles: Number(distanceMiles(centerLat, centerLng, coords.lat, coords.lng).toFixed(2)),
    estimated_adr_dollars: estimateAdr({ brand, stars }),
  };
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
};
