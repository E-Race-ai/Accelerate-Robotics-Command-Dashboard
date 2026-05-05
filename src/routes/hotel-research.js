// Hotel Research Tool — sales-rep prospecting helper.
//
// Architecture:
//   • Geocoding via Nominatim (free, no key, OSM-hosted) — turn a city/zip
//     into (lat, lng).
//   • Hotel discovery via Overpass API — query OSM for tourism=hotel|motel|
//     hostel|guest_house within a radius. No key, free, but we MUST cache
//     and we MUST send a real User-Agent header per OSM usage policy.
//   • Pricing signal via a brand/star ADR lookup — sales reps want a rough
//     "$130 vs $600" gauge, not a precise rate. Real-time rates need a paid
//     partner API and are intentionally not included.
//   • Saved hotels persist in SQLite — reps capture per-property intel
//     (actual rate, status, notes) over time.
//
// External-API politeness:
//   • Nominatim: max 1 req/sec per their policy. We cache 24h.
//   • Overpass: heavy query => cache 6h. Identifying User-Agent set.

const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const {
  estimateAdr, normLocation, distanceMiles, shapeHotel, brandClass,
  revenuePotential, dealSizeTier,
} = require('../services/hotel-research-utils');
const { findOrCreateFacility } = require('../services/facility-master');
const { enrichHotel, deepEnrichHotel } = require('../services/hotel-enrichment');
const { getAllChargersInBbox } = require('../services/charger-discovery');
const { fitScoreFor } = require('../services/fit-score');

const router = express.Router();

const ALLOWED_STATUS = new Set(['lead', 'contacted', 'qualified', 'proposed', 'won', 'lost', 'archived']);
const ALLOWED_TRIAGE = new Set(['yes', 'no', 'maybe', 'needs_research']);

// Best-effort JSON.parse that returns null on bad data instead of throwing.
// Used when re-hydrating fields stored as JSON strings (ai_fit_reasoning).
function safeJson(str) {
  try { return JSON.parse(str); } catch { return null; }
}

// User-Agent identifies us to OSM ops per their tile/api policy. Plain string
// (no PII) so the operators can reach us if our usage gets noisy.
const OSM_USER_AGENT = 'AccelerateRoboticsResearch/1.0 (sales-prospecting; admin@acceleraterobotics.ai)';

const GEOCODE_TTL_MS = 24 * 60 * 60 * 1000; // 24h — city/zip → lat/lng rarely changes
const SEARCH_TTL_MS  =  6 * 60 * 60 * 1000; // 6h  — OSM hotel data is slow-moving; lighter on Overpass

const geocodeCache = new Map(); // normalized location → { lat, lng, display, at }
const searchCache  = new Map(); // `${lat3},${lng3},${radius}` → { hotels, at }

// Limit how big a search we'll accept. Bigger radius = more Overpass load.
const MIN_RADIUS_MI = 1;
const MAX_RADIUS_MI = 25; // 25mi covers a metro; beyond that is wasteful for prospecting

// ── Preset markets ────────────────────────────────────────────────
// WHY: Sales reps prospect within a fixed set of submarkets. Hardcoded here
// so the team has consistent labels across runs (the saved-hotel `submarket`
// field uses these exact strings). Add new metros by extending this map; the
// frontend reads it via /presets so no UI redeploy is needed for a new entry.
const PRESET_MARKETS = {
  'miami-dade': {
    label: 'Miami-Dade',
    submarkets: [
      // Radii expanded to catch the full submarket plus halos that contain
      // adjacent hotel clusters. The original 1mi values missed >60% of
      // Miami-Dade's actual hotel inventory — a 1mi circle on Brickell
      // doesn't even reach the river. Targeted overlap is fine since the
      // run-all dedupes by osm_id.
      { submarket: 'Brickell',           location: 'Brickell, Miami, FL',           radius_miles: 2   },
      { submarket: 'Downtown Miami',     location: 'Downtown Miami, FL',            radius_miles: 2   },
      { submarket: 'Midtown / Wynwood',  location: 'Wynwood, Miami, FL',            radius_miles: 2   },
      { submarket: 'Edgewater',          location: 'Edgewater, Miami, FL',          radius_miles: 1.5 },
      { submarket: 'Little Havana',      location: 'Little Havana, Miami, FL',      radius_miles: 1.5 },
      { submarket: 'Coconut Grove',      location: 'Coconut Grove, Miami, FL',      radius_miles: 2   },
      { submarket: 'Coral Gables',       location: 'Coral Gables, FL',              radius_miles: 3   },
      { submarket: 'Kendall',            location: 'Kendall, FL',                   radius_miles: 4   },
      { submarket: 'Doral',              location: 'Doral, FL',                     radius_miles: 3   },
      { submarket: 'MIA Airport',        location: 'Miami International Airport, FL', radius_miles: 3 },
      { submarket: 'Hialeah',            location: 'Hialeah, FL',                   radius_miles: 3   },
      { submarket: 'South Beach',        location: 'South Beach, Miami Beach, FL',  radius_miles: 2.5 },
      { submarket: 'Mid-Beach',          location: 'Mid-Beach, Miami Beach, FL',    radius_miles: 1.5 },
      { submarket: 'North Beach',        location: 'North Beach, Miami Beach, FL',  radius_miles: 1.5 },
      { submarket: 'Surfside',           location: 'Surfside, FL',                  radius_miles: 1.5 },
      { submarket: 'Bal Harbour',        location: 'Bal Harbour, FL',               radius_miles: 1.5 },
      { submarket: 'Sunny Isles Beach',  location: 'Sunny Isles Beach, FL',         radius_miles: 1.5 },
      { submarket: 'Aventura',           location: 'Aventura, FL',                  radius_miles: 2.5 },
      { submarket: 'Key Biscayne',       location: 'Key Biscayne, FL',              radius_miles: 1.5 },
      { submarket: 'Homestead',          location: 'Homestead, FL',                 radius_miles: 4   },
      // County-wide sweep at the maximum radius — catches anything the
      // submarket cuts miss (private resorts, isolated motels). Run last so
      // the submarket tagging on prior cuts stays authoritative for dedupe.
      { submarket: 'Miami-Dade (full county)', location: 'Miami, FL',               radius_miles: 25  },
    ],
  },
};

async function geocode(rawLocation) {
  const key = normLocation(rawLocation);
  if (!key) return null;

  const hit = geocodeCache.get(key);
  if (hit && Date.now() - hit.at < GEOCODE_TTL_MS) return hit;

  // Prefer US results since prospects are domestic. Nominatim accepts
  // "city, state" or zip equally well via free-form query.
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', rawLocation);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');
  url.searchParams.set('countrycodes', 'us');
  url.searchParams.set('addressdetails', '1');

  const res = await fetch(url, {
    headers: { 'User-Agent': OSM_USER_AGENT, 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`geocode HTTP ${res.status}`);
  const data = await res.json();
  if (!Array.isArray(data) || data.length === 0) return null;

  const top = data[0];
  const result = {
    lat: Number(top.lat),
    lng: Number(top.lon),
    display: top.display_name || rawLocation,
    at: Date.now(),
  };
  geocodeCache.set(key, result);
  return result;
}

// ─── Overpass hotel discovery ─────────────────────────────────────
// 4 decimal places ≈ 11m, plenty precise for an OSM cache key.
function searchKey(lat, lng, radiusMi) {
  return `${lat.toFixed(4)},${lng.toFixed(4)},${radiusMi}`;
}

// Build the Overpass QL. We pull node/way/relation for tourism in
// (hotel|motel|hostel|guest_house) within the radius. `out center tags`
// returns center coords for ways/relations, which is what we want for
// dropping a pin on the map.
//
// WHY the four tourism types: hotel + motel = the bread-and-butter
// prospects; hostel + guest_house catch boutique/independent properties
// that often miss the "hotel" tag.
function buildOverpassQuery(lat, lng, radiusMeters) {
  return `[out:json][timeout:25];
(
  node["tourism"~"^(hotel|motel|hostel|guest_house)$"](around:${radiusMeters},${lat},${lng});
  way["tourism"~"^(hotel|motel|hostel|guest_house)$"](around:${radiusMeters},${lat},${lng});
  relation["tourism"~"^(hotel|motel|hostel|guest_house)$"](around:${radiusMeters},${lat},${lng});
);
out center tags;`;
}

async function fetchHotels(lat, lng, radiusMi) {
  const key = searchKey(lat, lng, radiusMi);
  const hit = searchCache.get(key);
  if (hit && Date.now() - hit.at < SEARCH_TTL_MS) return hit.hotels;

  const radiusMeters = Math.round(radiusMi * 1609.344);
  const query = buildOverpassQuery(lat, lng, radiusMeters);
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'User-Agent': OSM_USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: 'data=' + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`overpass HTTP ${res.status}`);
  const data = await res.json();
  const elements = Array.isArray(data.elements) ? data.elements : [];
  const hotels = elements
    .map(el => shapeHotel(el, lat, lng))
    .filter(Boolean)
    .sort((a, b) => a.distance_miles - b.distance_miles);

  searchCache.set(key, { hotels, at: Date.now() });
  return hotels;
}

// ─── EV charger discovery (Tesla + everything else) ──────────────
//
// Overpass query for amenity=charging_station within a bounding box. Tesla
// stations are tagged with operator/network/brand=Tesla; we surface that as
// is_tesla so the frontend can color them red. The rest are general EV.
//
// Uses a separate cache from hotel search since charger placement evolves
// faster (new sites added quarterly). 12h TTL is plenty for a sales tool.
const CHARGER_TTL_MS = 12 * 60 * 60 * 1000;
const chargerCache = new Map(); // bbox key → { chargers, at }

function buildChargerQuery(south, west, north, east) {
  // WHY `out;` instead of `out tags;`: the bare `out` (alias for `out body`)
  // emits both geometry (lat/lon) and tags for nodes. `out tags` strips
  // geometry, which silently breaks downstream — every charger ends up with
  // null coords and gets filtered out.
  return `[out:json][timeout:25];
(
  node["amenity"="charging_station"](${south},${west},${north},${east});
);
out;`;
}

function isTeslaCharger(tags) {
  if (!tags) return false;
  const fields = ['brand', 'operator', 'network', 'name'];
  for (const f of fields) {
    const v = tags[f];
    if (v && /tesla/i.test(v)) return true;
  }
  return false;
}

function shapeCharger(el) {
  if (el.lat == null || el.lon == null) return null;
  const t = el.tags || {};
  const tesla = isTeslaCharger(t);
  // Capacity: OSM tags vary. capacity is the count of stalls; socket:* are
  // per-socket-type counts. We surface what's available.
  const capacity = parseInt(t.capacity, 10) || null;
  const fastCount =
    parseInt(t['socket:tesla_supercharger'], 10) ||
    parseInt(t['socket:type2_combo'], 10) ||
    parseInt(t['socket:chademo'], 10) ||
    null;
  return {
    id: el.id,
    lat: el.lat,
    lng: el.lon,
    name: t.name || (tesla ? 'Tesla Supercharger' : 'EV charger'),
    operator: t.operator || t.brand || t.network || null,
    is_tesla: tesla,
    capacity: capacity || fastCount || null,
    network: t.network || null,
    fee: t.fee || null,
    access: t.access || null,
    opening_hours: t.opening_hours || null,
  };
}

async function fetchChargersInBbox(south, west, north, east) {
  // Round bbox to 2dp to dedupe near-identical viewport requests
  const key = `${south.toFixed(2)},${west.toFixed(2)},${north.toFixed(2)},${east.toFixed(2)}`;
  const hit = chargerCache.get(key);
  if (hit && Date.now() - hit.at < CHARGER_TTL_MS) return hit.chargers;

  const query = buildChargerQuery(south, west, north, east);
  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'User-Agent': OSM_USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: 'data=' + encodeURIComponent(query),
  });
  if (!res.ok) throw new Error(`overpass HTTP ${res.status}`);
  const data = await res.json();
  const elements = Array.isArray(data.elements) ? data.elements : [];
  const chargers = elements.map(shapeCharger).filter(Boolean);
  chargerCache.set(key, { chargers, at: Date.now() });
  return chargers;
}

// ─── Routes ───────────────────────────────────────────────────────

// GET /presets — list available preset markets (Miami-Dade, etc.)
// WHY: Frontend renders these as quick-pick chips so reps don't have to
// remember exact submarket names or radii.
router.get('/presets', requireAuth, (_req, res) => {
  res.json({ markets: PRESET_MARKETS });
});

// GET /chargers?bbox=south,west,north,east — Tesla + general EV chargers
// inside the box. Bbox is required (caps the query size — Overpass globally
// is expensive). Returns shaped charger records with is_tesla so the
// frontend can pick the right icon.
router.get('/chargers', requireAuth, async (req, res) => {
  const bbox = String(req.query.bbox || '').split(',').map(Number);
  if (bbox.length !== 4 || bbox.some(n => !Number.isFinite(n))) {
    return res.status(400).json({ error: 'bbox=south,west,north,east required' });
  }
  const [south, west, north, east] = bbox;
  if (south >= north || west >= east) {
    return res.status(400).json({ error: 'invalid bbox order' });
  }
  // WHY 2.5° cap: protects the upstream sources (NREL DEMO_KEY rate limit,
  // Overpass public servers) from a pathological "Boston to LA" request.
  // 2.5° latitude ≈ 175 mi — comfortably bigger than any city view.
  if ((north - south) > 2.5 || (east - west) > 2.5) {
    return res.status(400).json({ error: 'bbox too large — zoom in' });
  }
  try {
    const result = await getAllChargersInBbox(south, west, north, east);
    res.json(result);
  } catch (err) {
    console.error('[hotel-research] chargers failed:', err);
    res.status(503).json({ error: 'Charger lookup busy or unreachable.' });
  }
});

// POST /search — body: { location: "Boston, MA" | "02108", radius_miles?: 5 }
router.post('/search', requireAuth, async (req, res) => {
  const { location, radius_miles } = req.body || {};
  const loc = String(location || '').trim();
  if (!loc) return res.status(400).json({ error: 'location is required (city, state or zip)' });
  if (loc.length > 200) return res.status(400).json({ error: 'location is too long' });

  let radius = Number(radius_miles);
  if (!Number.isFinite(radius)) radius = 5;
  radius = Math.max(MIN_RADIUS_MI, Math.min(MAX_RADIUS_MI, Math.round(radius)));

  try {
    const geo = await geocode(loc);
    if (!geo) return res.status(404).json({ error: `Couldn't find "${loc}". Try "City, State" or a 5-digit zip.` });

    const hotels = await fetchHotels(geo.lat, geo.lng, radius);
    res.json({
      query: { location: loc, radius_miles: radius },
      center: { lat: geo.lat, lng: geo.lng, display: geo.display },
      hotels,
      cached_geocode: true,  // best-effort signal — useful for the UI to show "fresh" vs "cached"
    });
  } catch (err) {
    console.error('[hotel-research] search failed:', err);
    res.status(503).json({ error: 'Hotel database is busy or unreachable. Try again in a moment.' });
  }
});

// POST /saved — single object OR { hotels: [...] } for bulk
router.post('/saved', requireAuth, async (req, res) => {
  const body = req.body || {};
  const items = Array.isArray(body.hotels) ? body.hotels : [body];
  if (items.length === 0) return res.status(400).json({ error: 'no hotels to save' });
  if (items.length > 50) return res.status(400).json({ error: 'save up to 50 hotels per request' });

  const ids = [];
  const facilityIds = [];
  try {
    for (const h of items) {
      const name = String(h.name || '').trim().slice(0, 200);
      if (!name) return res.status(400).json({ error: 'each saved hotel needs a name' });

      // Master-record link: every saved hotel resolves to (or creates) a row
      // in facilities. The same facility may already exist if another rep
      // saved it earlier or it came in via the deals UI — dedupe takes care
      // of that. If anything fails here we DON'T block the hotel save; the
      // research record is still useful even without the FK and a backfill
      // endpoint can stitch it later.
      let facilityId = null;
      try {
        const f = await findOrCreateFacility(db, { ...h, name });
        facilityId = f.facility_id;
      } catch (fe) {
        console.warn('[hotel-research] facility find/create failed:', fe.message);
      }

      const r = await db.run(
        `INSERT INTO hotels_saved (
           name, address, city, state, zip, country, lat, lng,
           brand, stars, rooms, phone, website, osm_id, submarket,
           est_adr_dollars, status, notes, saved_by,
           operator, ownership, year_opened, total_floors, amenities,
           facility_id
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          name,
          h.address || null, h.city || null, h.state || null, h.zip || null, h.country || 'US',
          Number.isFinite(Number(h.lat)) ? Number(h.lat) : null,
          Number.isFinite(Number(h.lng)) ? Number(h.lng) : null,
          h.brand || null,
          Number.isInteger(Number(h.stars)) ? Number(h.stars) : null,
          Number.isInteger(Number(h.rooms)) ? Number(h.rooms) : null,
          h.phone || null,
          h.website || null,
          h.osm_id || null,
          h.submarket ? String(h.submarket).slice(0, 80) : null,
          Number.isFinite(Number(h.estimated_adr_dollars)) ? Math.round(Number(h.estimated_adr_dollars)) :
            (Number.isFinite(Number(h.est_adr_dollars))    ? Math.round(Number(h.est_adr_dollars))    : null),
          ALLOWED_STATUS.has(h.status) ? h.status : 'lead',
          h.notes ? String(h.notes).slice(0, 4000) : null,
          req.admin?.email || null,
          h.operator ? String(h.operator).slice(0, 200) : null,
          h.ownership ? String(h.ownership).slice(0, 200) : null,
          Number.isInteger(Number(h.year_opened)) ? Number(h.year_opened) : null,
          Number.isInteger(Number(h.total_floors)) ? Number(h.total_floors) : null,
          h.amenities ? JSON.stringify(h.amenities).slice(0, 4000) : null,
          facilityId,
        ],
      );
      ids.push(r.lastInsertRowid);
      facilityIds.push(facilityId);
    }
    res.status(201).json({ ok: true, ids, facility_ids: facilityIds });
  } catch (err) {
    console.error('[hotel-research] save failed:', err);
    res.status(500).json({ error: 'Failed to save hotel(s)' });
  }
});

// GET /saved — list saved hotels
router.get('/saved', requireAuth, async (req, res) => {
  const { status, q } = req.query;
  const where = [];
  const args = [];
  if (status && ALLOWED_STATUS.has(status)) { where.push('status = ?'); args.push(status); }
  if (q && String(q).trim()) {
    where.push('(LOWER(name) LIKE ? OR LOWER(city) LIKE ? OR LOWER(brand) LIKE ?)');
    const needle = `%${String(q).toLowerCase().trim()}%`;
    args.push(needle, needle, needle);
  }
  try {
    const rows = await db.all(
      `SELECT h.id, h.name, h.address, h.city, h.state, h.zip, h.country, h.lat, h.lng,
              h.brand, h.stars, h.rooms, h.phone, h.website, h.osm_id, h.submarket,
              h.est_adr_dollars, h.status, h.notes, h.saved_by, h.prospect_id,
              h.operator, h.ownership, h.year_opened, h.total_floors, h.amenities,
              h.tags, h.dm_name, h.dm_title, h.dm_email, h.dm_phone, h.dm_linkedin,
              h.existing_vendor, h.opportunity_score, h.photo_url, h.facility_id, h.triage,
              h.ai_fit_score, h.ai_fit_tier, h.ai_fit_reasoning,
              h.enrichment_depth, h.chain_description, h.chain_url,
              h.description, h.wikipedia_url,
              h.created_at, h.updated_at,
              (SELECT COUNT(*) FROM hotel_visits v WHERE v.hotel_saved_id = h.id) AS visit_count,
              (SELECT MAX(visit_date) FROM hotel_visits v WHERE v.hotel_saved_id = h.id) AS last_visit_date
       FROM hotels_saved h
       ${where.length ? 'WHERE ' + where.join(' AND ').replace(/(name|city|brand|status)/g, 'h.$1') : ''}
       ORDER BY h.updated_at DESC, h.id DESC`,
      args,
    );
    // Stamp derived fields the UI uses for filtering, sorting, and display:
    // brand_class (tier), revenue_potential_annual (room-rev × occupancy ×
    // 365), deal_size_tier (XS-XL banding), parsed amenities + tags JSON.
    const enriched = rows.map(r => {
      // Fall back to brand-based ADR estimate when the rep hasn't captured a real one,
      // so revenue/tier still surface for new saves.
      const adrStored = Number(r.est_adr_dollars);
      const adrForRev = (Number.isFinite(adrStored) && adrStored > 0)
        ? adrStored
        : estimateAdr({ brand: r.brand, stars: r.stars });
      const rev = revenuePotential({ rooms: r.rooms, est_adr_dollars: adrForRev });
      let amenities = null, tags = null;
      try { if (r.amenities) amenities = JSON.parse(r.amenities); } catch {}
      try { if (r.tags) { const t = JSON.parse(r.tags); if (Array.isArray(t)) tags = t; } } catch {}
      return {
        ...r,
        brand_class: brandClass({ brand: r.brand, stars: r.stars, est_adr: r.est_adr_dollars }),
        revenue_potential_annual: rev,
        deal_size_tier: dealSizeTier(rev),
        amenities,
        tags: tags || [],
      };
    });
    res.json({ hotels: enriched });
  } catch (err) {
    console.error('[hotel-research] list failed:', err);
    res.status(500).json({ error: 'Failed to load saved hotels' });
  }
});

// PATCH /saved/:id — update fields (status, notes, est_adr_dollars, etc.)
router.patch('/saved/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });

  const fields = [];
  const args = [];
  const b = req.body || {};

  if (b.notes !== undefined) {
    fields.push('notes = ?');
    args.push(b.notes ? String(b.notes).slice(0, 4000) : null);
  }
  if (b.status !== undefined) {
    if (!ALLOWED_STATUS.has(b.status)) return res.status(400).json({ error: 'invalid status' });
    fields.push('status = ?'); args.push(b.status);
  }
  if (b.est_adr_dollars !== undefined) {
    const n = Number(b.est_adr_dollars);
    if (b.est_adr_dollars === null || b.est_adr_dollars === '') {
      fields.push('est_adr_dollars = ?'); args.push(null);
    } else if (Number.isFinite(n) && n >= 0 && n < 100000) {
      fields.push('est_adr_dollars = ?'); args.push(Math.round(n));
    } else {
      return res.status(400).json({ error: 'est_adr_dollars must be a non-negative number under 100000' });
    }
  }
  if (b.phone !== undefined)     { fields.push('phone = ?');     args.push(b.phone || null); }
  if (b.website !== undefined)   { fields.push('website = ?');   args.push(b.website || null); }
  if (b.submarket !== undefined) { fields.push('submarket = ?'); args.push(b.submarket ? String(b.submarket).slice(0, 80) : null); }

  // ─── Sales-intel + property-data fields (all optional, nullable, free-form) ─
  const STR_FIELDS = {
    operator: 200, ownership: 200,
    dm_name: 200, dm_title: 200, dm_email: 200, dm_phone: 100, dm_linkedin: 500,
    existing_vendor: 200, photo_url: 1000,
  };
  for (const [field, max] of Object.entries(STR_FIELDS)) {
    if (b[field] !== undefined) {
      fields.push(`${field} = ?`);
      args.push(b[field] ? String(b[field]).slice(0, max) : null);
    }
  }
  const INT_FIELDS = ['year_opened', 'total_floors', 'opportunity_score'];
  for (const f of INT_FIELDS) {
    if (b[f] !== undefined) {
      const v = b[f];
      if (v === null || v === '') { fields.push(`${f} = ?`); args.push(null); }
      else {
        const n = Number(v);
        if (!Number.isInteger(n)) return res.status(400).json({ error: `${f} must be an integer or null` });
        if (f === 'opportunity_score' && (n < 0 || n > 5)) return res.status(400).json({ error: 'opportunity_score must be 0-5' });
        fields.push(`${f} = ?`); args.push(n);
      }
    }
  }
  // Tags: array of short strings, stored as JSON. Caps array length and
  // each tag length so a runaway client can't blow up the column.
  if (b.triage !== undefined) {
    if (b.triage === null || b.triage === '') { fields.push('triage = ?'); args.push(null); }
    else if (ALLOWED_TRIAGE.has(b.triage))    { fields.push('triage = ?'); args.push(b.triage); }
    else return res.status(400).json({ error: 'triage must be yes / no / maybe / needs_research / null' });
  }
  if (b.tags !== undefined) {
    if (b.tags === null) { fields.push('tags = ?'); args.push(null); }
    else if (Array.isArray(b.tags)) {
      const clean = b.tags.slice(0, 30).map(t => String(t).trim().slice(0, 60)).filter(Boolean);
      fields.push('tags = ?'); args.push(JSON.stringify(clean));
    } else {
      return res.status(400).json({ error: 'tags must be an array of strings' });
    }
  }
  if (b.rooms !== undefined) {
    const n = Number(b.rooms);
    if (b.rooms === null || b.rooms === '') { fields.push('rooms = ?'); args.push(null); }
    else if (Number.isInteger(n) && n >= 0 && n < 100000) { fields.push('rooms = ?'); args.push(n); }
    else return res.status(400).json({ error: 'rooms must be a non-negative integer' });
  }

  if (fields.length === 0) return res.status(400).json({ error: 'no fields to update' });
  fields.push("updated_at = datetime('now')");
  args.push(id);

  try {
    const r = await db.run(`UPDATE hotels_saved SET ${fields.join(', ')} WHERE id = ?`, args);
    if (!r.changes) return res.status(404).json({ error: 'saved hotel not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[hotel-research] update failed:', err);
    res.status(500).json({ error: 'Failed to update saved hotel' });
  }
});

// DELETE /saved/:id
router.delete('/saved/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
  try {
    const r = await db.run('DELETE FROM hotels_saved WHERE id = ?', [id]);
    if (!r.changes) return res.status(404).json({ error: 'saved hotel not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[hotel-research] delete failed:', err);
    res.status(500).json({ error: 'Failed to delete saved hotel' });
  }
});

// ─── Visit log — drop-in / drive-by tracking ─────────────────────
const ALLOWED_VISIT_TYPE = new Set(['drop_in', 'drive_by', 'scheduled_meeting', 'phone_call', 'email']);

// GET /saved/:id/visits — visit timeline for one hotel
router.get('/saved/:id/visits', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
  try {
    const visits = await db.all(
      `SELECT id, visit_date, visit_type, contact_name, contact_role, summary, next_step, next_step_due, created_by, created_at
       FROM hotel_visits WHERE hotel_saved_id = ? ORDER BY visit_date DESC, id DESC`,
      [id],
    );
    res.json({ visits });
  } catch (err) {
    console.error('[hotel-research] visits list failed:', err);
    res.status(500).json({ error: 'Failed to load visits' });
  }
});

// POST /saved/:id/visits — log a visit
router.post('/saved/:id/visits', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });

  const hotel = await db.one('SELECT id FROM hotels_saved WHERE id = ?', [id]);
  if (!hotel) return res.status(404).json({ error: 'saved hotel not found' });

  const b = req.body || {};
  const visitDate = String(b.visit_date || '').trim();
  if (!visitDate) return res.status(400).json({ error: 'visit_date is required (YYYY-MM-DD)' });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(visitDate)) return res.status(400).json({ error: 'visit_date must be YYYY-MM-DD' });

  const visitType = ALLOWED_VISIT_TYPE.has(b.visit_type) ? b.visit_type : 'drop_in';
  const nextDue = b.next_step_due && /^\d{4}-\d{2}-\d{2}$/.test(b.next_step_due) ? b.next_step_due : null;

  try {
    const r = await db.run(
      `INSERT INTO hotel_visits (
         hotel_saved_id, visit_date, visit_type, contact_name, contact_role,
         summary, next_step, next_step_due, created_by
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, visitDate, visitType,
        b.contact_name ? String(b.contact_name).slice(0, 200) : null,
        b.contact_role ? String(b.contact_role).slice(0, 100) : null,
        b.summary ? String(b.summary).slice(0, 4000) : null,
        b.next_step ? String(b.next_step).slice(0, 1000) : null,
        nextDue,
        req.admin?.email || null,
      ],
    );
    // Bump the saved hotel's updated_at so it sorts to the top of the list.
    await db.run("UPDATE hotels_saved SET updated_at = datetime('now') WHERE id = ?", [id]);
    res.status(201).json({ ok: true, id: r.lastInsertRowid });
  } catch (err) {
    console.error('[hotel-research] visit save failed:', err);
    res.status(500).json({ error: 'Failed to save visit' });
  }
});

// DELETE /saved/:id/visits/:visitId
router.delete('/saved/:id/visits/:visitId', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const vid = Number(req.params.visitId);
  if (!Number.isInteger(id) || !Number.isInteger(vid)) return res.status(400).json({ error: 'invalid id' });
  try {
    const r = await db.run('DELETE FROM hotel_visits WHERE id = ? AND hotel_saved_id = ?', [vid, id]);
    if (!r.changes) return res.status(404).json({ error: 'visit not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[hotel-research] visit delete failed:', err);
    res.status(500).json({ error: 'Failed to delete visit' });
  }
});

// ─── Route builder ───────────────────────────────────────────────
// POST /route — body: { hotel_ids: [1, 2, 3], origin?: "current"|"first" }
// Returns a Google Maps deep-link with the hotels as waypoints. Order
// preserves the input array, so reps can pre-arrange in their preferred
// drive order. Auto-optimization (TSP) is a future enhancement.
router.post('/route', requireAuth, async (req, res) => {
  const ids = Array.isArray(req.body?.hotel_ids) ? req.body.hotel_ids.map(Number).filter(Number.isInteger) : [];
  if (ids.length < 2) return res.status(400).json({ error: 'pick at least 2 hotels for a route' });
  if (ids.length > 25) return res.status(400).json({ error: 'Google Maps caps waypoints at 25' });

  try {
    // Preserve input order: build a CASE-WHEN ORDER BY so SQLite returns
    // rows in the same sequence the rep selected.
    const placeholders = ids.map(() => '?').join(',');
    const orderBy = ids.map((id, i) => `WHEN ${id} THEN ${i}`).join(' ');
    const rows = await db.all(
      `SELECT id, name, lat, lng, address
       FROM hotels_saved
       WHERE id IN (${placeholders}) AND lat IS NOT NULL AND lng IS NOT NULL
       ORDER BY CASE id ${orderBy} END`,
      ids,
    );
    if (rows.length < 2) return res.status(400).json({ error: 'fewer than 2 of those hotels have coordinates' });

    // Google Maps directions URL with all stops as path segments — works
    // without an API key, opens in the user's preferred map app on mobile.
    const segments = rows.map(r => `${r.lat},${r.lng}`).join('/');
    const google_maps_url = `https://www.google.com/maps/dir/${segments}`;

    res.json({
      google_maps_url,
      stops: rows.map(r => ({ id: r.id, name: r.name, lat: r.lat, lng: r.lng, address: r.address })),
      total_stops: rows.length,
    });
  } catch (err) {
    console.error('[hotel-research] route failed:', err);
    res.status(500).json({ error: 'Failed to build route' });
  }
});

// ─── Graduate to prospect ────────────────────────────────────────
// POST /saved/:id/graduate — body: { market_id?: 'miami-dade-fl' }
// Creates a row in the existing `prospects` table from the saved hotel's
// research data and links the saved hotel back via prospect_id so the
// graduation is auditable.
//
// WHY this design: the deal pipeline already has a prospects table with its
// own UI; we don't want to fork that. Graduation hands the property over
// while preserving the research breadcrumbs (visits, notes, submarket tag
// stay on the hotel_saved row).
router.post('/saved/:id/graduate', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });

  const hotel = await db.one('SELECT * FROM hotels_saved WHERE id = ?', [id]);
  if (!hotel) return res.status(404).json({ error: 'saved hotel not found' });
  if (hotel.prospect_id) return res.status(409).json({ error: 'already graduated', prospect_id: hotel.prospect_id });

  // brand_class heuristic: stars or brand name → CHECK-friendly value.
  const brand = (hotel.brand || '').toLowerCase();
  let brandClass = 'independent';
  if (hotel.stars >= 5 || /four seasons|ritz|st\.? regis|waldorf|mandarin/.test(brand)) brandClass = 'luxury';
  else if (/autograph|tribute|curio|kimpton|w hotel|edition/.test(brand))               brandClass = 'soft';
  else if (brand)                                                                        brandClass = 'chain';

  // market_id is optional; the prospects UI lets an admin assign it later.
  const marketId = req.body?.market_id ? String(req.body.market_id).slice(0, 80) : null;

  // Master-record link: ensure this hotel has a facility row, then carry the
  // facility_id onto the prospect so the deal pipeline picks up where research
  // left off. If the hotel was saved before the facility-master rollout it
  // may not have one yet — find or create on the fly.
  let facilityId = hotel.facility_id;
  if (!facilityId) {
    try {
      const f = await findOrCreateFacility(db, hotel);
      facilityId = f.facility_id;
      await db.run('UPDATE hotels_saved SET facility_id = ? WHERE id = ?', [facilityId, id]);
    } catch (fe) {
      console.warn('[hotel-research] graduate: facility find/create failed:', fe.message);
    }
  }

  try {
    const r = await db.run(
      `INSERT INTO prospects (
         market_id, status, name, address, brand, brand_class, keys, stars,
         signal, source, research_date, facility_id
       ) VALUES (?, 'staged', ?, ?, ?, ?, ?, ?, ?, 'ai_research', datetime('now'), ?)`,
      [
        marketId,
        hotel.name,
        hotel.address,
        hotel.brand,
        brandClass,
        hotel.rooms,
        hotel.stars,
        hotel.submarket || null,        // signal field — repurposed for our submarket tag
        facilityId,
      ],
    );
    const prospectId = r.lastInsertRowid;
    await db.run("UPDATE hotels_saved SET prospect_id = ?, status = 'qualified', updated_at = datetime('now') WHERE id = ?", [prospectId, id]);
    res.status(201).json({ ok: true, prospect_id: prospectId, facility_id: facilityId });
  } catch (err) {
    console.error('[hotel-research] graduate failed:', err);
    res.status(500).json({ error: 'Failed to graduate to prospect — ' + err.message });
  }
});

// ─── BDR Schedule — saved + dated routes ────────────────────────
//
// A `bdr_route` is either a saved template (no date) OR a planned day
// (with a scheduled_date). Both live in the same table so reps can
// promote a template into a scheduled day with one click. Stops are
// in `bdr_route_stops` with an explicit sort_order — the rep's intended
// drive sequence — and a `done` flag they tick off in the field.

// GET /routes — list, optionally filter by date range
// Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD&undated_too=1
router.get('/routes', requireAuth, async (req, res) => {
  const { from, to, undated_too } = req.query;
  const where = [];
  const args = [];
  if (from) { where.push('(scheduled_date IS NULL OR scheduled_date >= ?)'); args.push(from); }
  if (to)   { where.push('(scheduled_date IS NULL OR scheduled_date <= ?)'); args.push(to); }
  if (!undated_too && from) {
    // If a date range is specified and we don't want undated, drop the IS NULL clauses
    where[where.length - 1] = where[where.length - 1].replace('scheduled_date IS NULL OR ', '');
  }
  try {
    const routes = await db.all(
      `SELECT r.*,
              (SELECT COUNT(*) FROM bdr_route_stops s WHERE s.route_id = r.id) AS stop_count,
              (SELECT COUNT(*) FROM bdr_route_stops s WHERE s.route_id = r.id AND s.done = 1) AS done_count
       FROM bdr_routes r
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY scheduled_date IS NULL, scheduled_date ASC, r.id DESC`,
      args,
    );
    res.json({ routes });
  } catch (err) {
    console.error('[hotel-research] /routes list failed:', err);
    res.status(500).json({ error: 'Failed to load routes' });
  }
});

// GET /routes/:id — full route with ordered stops + their hotel data
router.get('/routes/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
  try {
    const route = await db.one('SELECT * FROM bdr_routes WHERE id = ?', [id]);
    if (!route) return res.status(404).json({ error: 'route not found' });
    const stops = await db.all(
      `SELECT s.id AS stop_id, s.hotel_saved_id, s.sort_order, s.done, s.visit_id,
              h.name, h.address, h.city, h.state, h.zip, h.lat, h.lng, h.brand, h.stars,
              h.rooms, h.phone, h.website, h.submarket, h.est_adr_dollars, h.status
       FROM bdr_route_stops s JOIN hotels_saved h ON h.id = s.hotel_saved_id
       WHERE s.route_id = ? ORDER BY s.sort_order ASC, s.id ASC`,
      [id],
    );
    res.json({ route, stops });
  } catch (err) {
    console.error('[hotel-research] /routes/:id failed:', err);
    res.status(500).json({ error: 'Failed to load route' });
  }
});

// POST /routes — create a route (with optional initial stops)
// Body: { name, scheduled_date?, zone?, notes?, hotel_ids?: [] }
router.post('/routes', requireAuth, async (req, res) => {
  const { name, scheduled_date, zone, notes, hotel_ids } = req.body || {};
  const cleanName = String(name || '').trim().slice(0, 200);
  if (!cleanName) return res.status(400).json({ error: 'name is required' });
  const date = scheduled_date && /^\d{4}-\d{2}-\d{2}$/.test(scheduled_date) ? scheduled_date : null;
  try {
    const r = await db.run(
      `INSERT INTO bdr_routes (name, scheduled_date, zone, notes, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [
        cleanName, date,
        zone ? String(zone).slice(0, 100) : null,
        notes ? String(notes).slice(0, 4000) : null,
        req.admin?.email || null,
      ],
    );
    const routeId = r.lastInsertRowid;
    // Bulk insert initial stops if provided.
    if (Array.isArray(hotel_ids) && hotel_ids.length > 0) {
      let ord = 0;
      for (const hid of hotel_ids) {
        const n = Number(hid);
        if (!Number.isInteger(n)) continue;
        await db.run(
          `INSERT INTO bdr_route_stops (route_id, hotel_saved_id, sort_order) VALUES (?, ?, ?)`,
          [routeId, n, ord++],
        );
      }
    }
    res.status(201).json({ ok: true, id: routeId });
  } catch (err) {
    console.error('[hotel-research] /routes create failed:', err);
    res.status(500).json({ error: 'Failed to save route' });
  }
});

// PATCH /routes/:id — update metadata (name, date, zone, notes)
router.patch('/routes/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
  const fields = [];
  const args = [];
  const b = req.body || {};
  if (b.name !== undefined) {
    const v = String(b.name || '').trim();
    if (!v) return res.status(400).json({ error: 'name cannot be empty' });
    fields.push('name = ?'); args.push(v.slice(0, 200));
  }
  if (b.scheduled_date !== undefined) {
    const v = b.scheduled_date;
    if (v === null || v === '')                          { fields.push('scheduled_date = ?'); args.push(null); }
    else if (/^\d{4}-\d{2}-\d{2}$/.test(String(v)))      { fields.push('scheduled_date = ?'); args.push(String(v)); }
    else return res.status(400).json({ error: 'scheduled_date must be YYYY-MM-DD or null' });
  }
  if (b.zone !== undefined)  { fields.push('zone = ?');  args.push(b.zone ? String(b.zone).slice(0, 100) : null); }
  if (b.notes !== undefined) { fields.push('notes = ?'); args.push(b.notes ? String(b.notes).slice(0, 4000) : null); }
  if (fields.length === 0) return res.status(400).json({ error: 'nothing to update' });
  fields.push("updated_at = datetime('now')");
  args.push(id);
  try {
    const r = await db.run(`UPDATE bdr_routes SET ${fields.join(', ')} WHERE id = ?`, args);
    if (!r.changes) return res.status(404).json({ error: 'route not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[hotel-research] /routes update failed:', err);
    res.status(500).json({ error: 'Failed to update route' });
  }
});

// DELETE /routes/:id — drop a route + its stops (CASCADE)
router.delete('/routes/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
  try {
    const r = await db.run('DELETE FROM bdr_routes WHERE id = ?', [id]);
    if (!r.changes) return res.status(404).json({ error: 'route not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[hotel-research] /routes delete failed:', err);
    res.status(500).json({ error: 'Failed to delete route' });
  }
});

// POST /routes/:id/stops — add hotels to a route (appends to end)
router.post('/routes/:id/stops', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
  const route = await db.one('SELECT id FROM bdr_routes WHERE id = ?', [id]);
  if (!route) return res.status(404).json({ error: 'route not found' });
  const ids = Array.isArray(req.body?.hotel_ids) ? req.body.hotel_ids.map(Number).filter(Number.isInteger) : [];
  if (!ids.length) return res.status(400).json({ error: 'hotel_ids required' });
  try {
    const max = await db.one('SELECT COALESCE(MAX(sort_order), -1) AS m FROM bdr_route_stops WHERE route_id = ?', [id]);
    let ord = (max?.m ?? -1) + 1;
    const newIds = [];
    for (const hid of ids) {
      const r = await db.run(
        `INSERT INTO bdr_route_stops (route_id, hotel_saved_id, sort_order) VALUES (?, ?, ?)`,
        [id, hid, ord++],
      );
      newIds.push(r.lastInsertRowid);
    }
    res.status(201).json({ ok: true, stop_ids: newIds });
  } catch (err) {
    console.error('[hotel-research] /routes/:id/stops add failed:', err);
    res.status(500).json({ error: 'Failed to add stops' });
  }
});

// PATCH /routes/:id/stops/:stopId — toggle done flag
router.patch('/routes/:id/stops/:stopId', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const sid = Number(req.params.stopId);
  if (!Number.isInteger(id) || !Number.isInteger(sid)) return res.status(400).json({ error: 'invalid id' });
  const fields = [];
  const args = [];
  const b = req.body || {};
  if (b.done !== undefined)    { fields.push('done = ?');    args.push(b.done ? 1 : 0); }
  if (b.visit_id !== undefined) {
    if (b.visit_id === null) { fields.push('visit_id = ?'); args.push(null); }
    else                     { fields.push('visit_id = ?'); args.push(Number(b.visit_id)); }
  }
  if (!fields.length) return res.status(400).json({ error: 'nothing to update' });
  args.push(sid, id);
  try {
    const r = await db.run(
      `UPDATE bdr_route_stops SET ${fields.join(', ')} WHERE id = ? AND route_id = ?`,
      args,
    );
    if (!r.changes) return res.status(404).json({ error: 'stop not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[hotel-research] /routes/:id/stops/:stopId update failed:', err);
    res.status(500).json({ error: 'Failed to update stop' });
  }
});

// DELETE /routes/:id/stops/:stopId — remove a single stop
router.delete('/routes/:id/stops/:stopId', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  const sid = Number(req.params.stopId);
  if (!Number.isInteger(id) || !Number.isInteger(sid)) return res.status(400).json({ error: 'invalid id' });
  try {
    const r = await db.run('DELETE FROM bdr_route_stops WHERE id = ? AND route_id = ?', [sid, id]);
    if (!r.changes) return res.status(404).json({ error: 'stop not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[hotel-research] stop delete failed:', err);
    res.status(500).json({ error: 'Failed to remove stop' });
  }
});

// POST /routes/:id/reorder — body: { stop_ids: [in new order] }
router.post('/routes/:id/reorder', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
  const order = Array.isArray(req.body?.stop_ids) ? req.body.stop_ids.map(Number).filter(Number.isInteger) : [];
  if (!order.length) return res.status(400).json({ error: 'stop_ids required' });
  try {
    let i = 0;
    for (const sid of order) {
      await db.run('UPDATE bdr_route_stops SET sort_order = ? WHERE id = ? AND route_id = ?', [i++, sid, id]);
    }
    res.json({ ok: true });
  } catch (err) {
    console.error('[hotel-research] reorder failed:', err);
    res.status(500).json({ error: 'Failed to reorder' });
  }
});

// POST /routes/auto-week — quick weekly schedule builder
// Body: { days: { '2026-05-11': { zone: 'Coral Gables', cap?: 8 }, '2026-05-12': {...}, ... } }
// For each (date, zone), creates a bdr_route auto-populated with up to `cap`
// untouched + lowest-rank-by-distance hotels in that submarket. Saves a whole
// week of plans in one POST.
router.post('/routes/auto-week', requireAuth, async (req, res) => {
  const days = req.body?.days || {};
  const entries = Object.entries(days);
  if (!entries.length) return res.status(400).json({ error: 'days map required' });
  if (entries.length > 7) return res.status(400).json({ error: 'one week max' });

  const created = [];
  try {
    for (const [date, cfg] of entries) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
      const zone = String(cfg?.zone || '').trim();
      if (!zone) continue;
      const cap = Math.max(1, Math.min(15, Number(cfg?.cap) || 8));
      // Pull untouched hotels (no visits yet) in this zone with coords. Default
      // ordering: most recently saved first — close enough until we have
      // smarter scoring.
      const candidates = await db.all(
        `SELECT h.id, h.lat, h.lng FROM hotels_saved h
         WHERE h.submarket = ? AND h.lat IS NOT NULL AND h.lng IS NOT NULL
           AND (SELECT COUNT(*) FROM hotel_visits v WHERE v.hotel_saved_id = h.id) = 0
         ORDER BY h.id DESC LIMIT ?`,
        [zone, cap],
      );
      if (!candidates.length) {
        created.push({ date, zone, route_id: null, stops_added: 0, note: 'no untouched hotels in zone' });
        continue;
      }
      const dayLabel = new Date(date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
      const r = await db.run(
        `INSERT INTO bdr_routes (name, scheduled_date, zone, created_by)
         VALUES (?, ?, ?, ?)`,
        [`${zone} · ${dayLabel}`, date, zone, req.admin?.email || null],
      );
      const routeId = r.lastInsertRowid;
      let ord = 0;
      for (const c of candidates) {
        await db.run(
          `INSERT INTO bdr_route_stops (route_id, hotel_saved_id, sort_order) VALUES (?, ?, ?)`,
          [routeId, c.id, ord++],
        );
      }
      created.push({ date, zone, route_id: routeId, stops_added: candidates.length });
    }
    res.status(201).json({ ok: true, created });
  } catch (err) {
    console.error('[hotel-research] auto-week failed:', err);
    res.status(500).json({ error: 'Failed to build week — ' + err.message });
  }
});

// ─── Triage — one-tap BDR decision (the game-mode endpoint) ─────────────
// POST /saved/:id/triage  body: { decision: 'yes'|'no'|'maybe'|'needs_research' }
// Single-purpose endpoint optimized for fast clicks. Optionally also flips
// the status field so a "no" triage moves the card to 'lost' / 'archived',
// keeping the rest of the funnel honest.
router.post('/saved/:id/triage', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
  const decision = req.body?.decision;
  if (!ALLOWED_TRIAGE.has(decision) && decision !== null && decision !== '') {
    return res.status(400).json({ error: 'decision must be yes / no / maybe / needs_research / null' });
  }
  const triageVal = (decision === null || decision === '') ? null : decision;
  const player = req.body?.player ? String(req.body.player).slice(0, 40).trim() : null;

  // Status auto-mapping. Aggressive but reversible — the rep can always
  // flip the status manually in the edit modal if they want a different
  // funnel placement.
  const statusForTriage = {
    yes:            'qualified',
    maybe:          'lead',
    needs_research: 'lead',
    no:             'archived',
  };
  const newStatus = triageVal ? statusForTriage[triageVal] : null;

  try {
    if (triageVal === null) {
      // Undo: clear everything triage-related, leave status alone.
      await db.run(
        "UPDATE hotels_saved SET triage = NULL, triage_by = NULL, triage_player = NULL, triage_at = NULL, updated_at = datetime('now') WHERE id = ?",
        [id],
      );
    } else if (newStatus) {
      await db.run(
        `UPDATE hotels_saved
         SET triage = ?, status = ?, triage_by = ?, triage_player = ?, triage_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`,
        [triageVal, newStatus, req.admin?.email || null, player, id],
      );
    } else {
      await db.run(
        `UPDATE hotels_saved
         SET triage = ?, triage_by = ?, triage_player = ?, triage_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?`,
        [triageVal, req.admin?.email || null, player, id],
      );
    }
    res.json({ ok: true, triage: triageVal, status: newStatus, player });
  } catch (err) {
    console.error('[hotel-research] triage failed:', err);
    res.status(500).json({ error: 'Failed to set triage' });
  }
});

// GET /triage/leaderboard — per-player tally for the mobile app
router.get('/triage/leaderboard', requireAuth, async (_req, res) => {
  try {
    const rows = await db.all(
      `SELECT COALESCE(triage_player, '(no player)') AS player,
              COUNT(*) AS total,
              SUM(CASE WHEN triage = 'yes' THEN 1 ELSE 0 END) AS yes_count,
              SUM(CASE WHEN triage = 'maybe' THEN 1 ELSE 0 END) AS maybe_count,
              SUM(CASE WHEN triage = 'needs_research' THEN 1 ELSE 0 END) AS needs_research_count,
              SUM(CASE WHEN triage = 'no' THEN 1 ELSE 0 END) AS no_count,
              MAX(triage_at) AS last_at
       FROM hotels_saved
       WHERE triage IS NOT NULL
       GROUP BY COALESCE(triage_player, '(no player)')
       ORDER BY total DESC`,
      [],
    );
    res.json({ leaderboard: rows });
  } catch (err) {
    console.error('[hotel-research] leaderboard failed:', err);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

// GET /triage/queue — returns saved hotels with no triage decision yet,
// sorted submarket-then-id so reps can sweep zone-by-zone. Powers the
// game-mode card-stack UI.
router.get('/triage/queue', requireAuth, async (_req, res) => {
  try {
    // Sort: best-fit first (highest ai_fit_score) so reps spend triage time
    // on the strongest opportunities. NULL scores fall to the bottom — they
    // get the next score-all sweep but don't push high-fit hotels off-screen.
    const rows = await db.all(
      `SELECT h.id, h.name, h.address, h.city, h.state, h.brand, h.stars, h.rooms,
              h.phone, h.website, h.submarket, h.est_adr_dollars,
              h.operator, h.year_opened, h.total_floors, h.lat, h.lng, h.notes,
              h.photo_url, h.description, h.rating, h.review_count, h.wikipedia_url,
              h.enriched_at,
              h.ai_fit_score, h.ai_fit_reasoning, h.ai_fit_tier,
              h.enrichment_depth, h.chain_description, h.chain_url
       FROM hotels_saved h
       WHERE h.triage IS NULL
       ORDER BY (h.ai_fit_score IS NULL) ASC,
                h.ai_fit_score DESC,
                h.submarket ASC,
                h.id ASC`,
      [],
    );
    // Tally totals for the progress bar — independent query to be cheap.
    const totals = await db.one(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN triage IS NOT NULL THEN 1 ELSE 0 END) AS sorted,
         SUM(CASE WHEN triage = 'yes' THEN 1 ELSE 0 END) AS yes_count,
         SUM(CASE WHEN triage = 'maybe' THEN 1 ELSE 0 END) AS maybe_count,
         SUM(CASE WHEN triage = 'needs_research' THEN 1 ELSE 0 END) AS needs_research_count,
         SUM(CASE WHEN triage = 'no' THEN 1 ELSE 0 END) AS no_count
       FROM hotels_saved`, [],
    );
    // Parse the stored JSON reasoning so the client gets an array, not a string
    const queue = rows.map(r => ({
      ...r,
      ai_fit_reasoning: r.ai_fit_reasoning ? safeJson(r.ai_fit_reasoning) : null,
    }));
    res.json({
      queue,
      totals: {
        total:               Number(totals?.total || 0),
        sorted:              Number(totals?.sorted || 0),
        yes:                 Number(totals?.yes_count || 0),
        maybe:               Number(totals?.maybe_count || 0),
        needs_research:      Number(totals?.needs_research_count || 0),
        no:                  Number(totals?.no_count || 0),
      },
    });
    // Fire-and-forget: enrich the first 20 unenriched rows in the background
    // while the rep sorts the first card. Rate-limited internally by the
    // serial loop in enrichBatchInBackground.
    enrichBatchInBackground(rows).catch(err =>
      console.warn('[enrich] background sweep failed:', err.message),
    );
  } catch (err) {
    console.error('[hotel-research] triage queue failed:', err);
    res.status(500).json({ error: 'Failed to load triage queue' });
  }
});

// Serial background enrichment of unenriched queue rows. Caps at 20 per call
// so we don't hammer Wikipedia / hotel sites if the queue is huge — repeated
// queue loads will keep chipping away until everyone's enriched.
let backgroundEnrichRunning = false;
async function enrichBatchInBackground(queueRows) {
  if (backgroundEnrichRunning) return; // single concurrent sweep
  const targets = queueRows.filter(r => !r.enriched_at).slice(0, 20);
  if (targets.length === 0) return;
  backgroundEnrichRunning = true;
  try {
    for (const h of targets) {
      try {
        const patch = await enrichHotel(h);
        await applyEnrichment(h.id, h, patch);
      } catch (err) {
        console.warn(`[enrich] bg row ${h.id} failed:`, err.message);
      }
    }
    console.log(`[enrich] background sweep enriched ${targets.length} hotels`);
  } finally {
    backgroundEnrichRunning = false;
  }
}

// ─── Enrichment — pull photo + description from Wikipedia / website OG ──
//
// Why: BDRs need a real card with a picture and a short bio, not OSM bones.
// findHotel runs through the enrichment service and writes back any field
// that came back populated. Existing values aren't overwritten — call PATCH
// /saved/:id with explicit fields if you need to edit.
router.post('/saved/:id/enrich', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
  try {
    const h = await db.one('SELECT * FROM hotels_saved WHERE id = ?', [id]);
    if (!h) return res.status(404).json({ error: 'not found' });
    const enrich = await enrichHotel(h);
    await applyEnrichment(id, h, enrich);
    const updated = await db.one(
      `SELECT id, photo_url, description, rating, review_count, wikipedia_url, enriched_at
       FROM hotels_saved WHERE id = ?`, [id]);
    res.json({ id, enrichment: enrich, hotel: updated });
  } catch (err) {
    console.error('[hotel-research] enrich one failed:', err);
    res.status(500).json({ error: 'Failed to enrich hotel' });
  }
});

// Bulk enrich — walks every saved hotel that hasn't been enriched yet (or
// missing a photo) and runs them serially. Serial keeps us polite to
// Wikipedia + the websites we hit. Returns a summary so the operator can see
// what stitched.
router.post('/enrich/all', requireAuth, async (req, res) => {
  // Optional: ?force=1 to re-enrich everything (e.g. after a parser change)
  const force = req.query.force === '1' || req.body?.force === true;
  // Cap one pass at 100 — keeps long-running requests bounded. Re-run for more.
  const LIMIT = Math.min(parseInt(req.query.limit, 10) || 100, 200);
  try {
    const rows = await db.all(
      force
        ? 'SELECT * FROM hotels_saved ORDER BY id ASC LIMIT ?'
        : 'SELECT * FROM hotels_saved WHERE enriched_at IS NULL OR photo_url IS NULL ORDER BY id ASC LIMIT ?',
      [LIMIT],
    );
    const summary = { scanned: 0, enriched: 0, photo_added: 0, desc_added: 0, errors: 0, ids: [] };
    for (const h of rows) {
      summary.scanned++;
      try {
        const enrich = await enrichHotel(h);
        const had = await applyEnrichment(h.id, h, enrich);
        if (had.wrote_any) {
          summary.enriched++;
          if (had.wrote_photo) summary.photo_added++;
          if (had.wrote_desc)  summary.desc_added++;
          summary.ids.push(h.id);
        }
      } catch (err) {
        summary.errors++;
        console.warn(`[enrich] row ${h.id} (${h.name}) failed:`, err.message);
      }
    }
    res.json(summary);
  } catch (err) {
    console.error('[hotel-research] enrich all failed:', err);
    res.status(500).json({ error: 'Failed to bulk enrich' });
  }
});

// Apply an enrichment patch — only writes fields that came back populated and
// where the hotel didn't already have a value. Returns flags so callers know
// what changed (used for the bulk summary).
async function applyEnrichment(id, current, patch, opts = {}) {
  const sets = [];
  const params = [];
  const out = { wrote_any: false, wrote_photo: false, wrote_desc: false };
  if (patch.photo_url && !current.photo_url) {
    sets.push('photo_url = ?'); params.push(patch.photo_url); out.wrote_photo = true;
  }
  if (patch.description && !current.description) {
    sets.push('description = ?'); params.push(patch.description); out.wrote_desc = true;
  }
  if (patch.wikipedia_url && !current.wikipedia_url) {
    sets.push('wikipedia_url = ?'); params.push(patch.wikipedia_url);
  }
  // Deep-only fields — chain context only meaningful for properties of a
  // recognized chain
  if (patch.chain_description && !current.chain_description) {
    sets.push('chain_description = ?'); params.push(patch.chain_description);
  }
  if (patch.chain_url && !current.chain_url) {
    sets.push('chain_url = ?'); params.push(patch.chain_url);
  }
  if (opts.depth) {
    sets.push('enrichment_depth = ?'); params.push(opts.depth);
  }
  // Always stamp enriched_at so we can skip already-tried rows on the next sweep
  sets.push('enriched_at = ?'); params.push(new Date().toISOString());
  params.push(id);
  await db.run(`UPDATE hotels_saved SET ${sets.join(', ')} WHERE id = ?`, params);
  out.wrote_any = sets.length > 1;
  return out;
}

// ── Tiered deep-sweep — top fit-score hotels get the full treatment ──
//
// Top 100 (or ?n=...) by ai_fit_score get deepEnrichHotel: Wikipedia
// summary + brand/chain Wikipedia article + OG tags. Standard tier
// (101–300) gets the cheaper enrichHotel. Below that we skip — those
// hotels aren't priority targets and shouldn't burn tokens / API calls.
//
// WHY a separate endpoint: Eric explicitly wants the depth gated by fit
// score so reps + tokens spend on the right cohort. Pure /enrich/all is
// a flat sweep; this is the targeted version.
router.post('/enrich/deep-sweep', requireAuth, async (req, res) => {
  const TOP_N      = parseInt(req.query.top || req.body?.top || 100, 10);
  const STANDARD_N = parseInt(req.query.standard || req.body?.standard || 200, 10);
  try {
    // Top-N hotels by fit score (skipping ones already deep-enriched
    // unless ?force=1)
    const force = req.query.force === '1' || req.body?.force === true;
    const topRows = await db.all(
      force
        ? `SELECT * FROM hotels_saved WHERE ai_fit_score IS NOT NULL ORDER BY ai_fit_score DESC LIMIT ?`
        : `SELECT * FROM hotels_saved WHERE ai_fit_score IS NOT NULL AND (enrichment_depth IS NULL OR enrichment_depth != 'deep') ORDER BY ai_fit_score DESC LIMIT ?`,
      [TOP_N],
    );
    const standardRows = await db.all(
      force
        ? `SELECT * FROM hotels_saved WHERE ai_fit_score IS NOT NULL ORDER BY ai_fit_score DESC LIMIT ? OFFSET ?`
        : `SELECT * FROM hotels_saved WHERE ai_fit_score IS NOT NULL AND enrichment_depth IS NULL ORDER BY ai_fit_score DESC LIMIT ? OFFSET ?`,
      [STANDARD_N, TOP_N],
    );

    const summary = {
      deep:     { scanned: 0, enriched: 0, photo_added: 0, desc_added: 0, errors: 0 },
      standard: { scanned: 0, enriched: 0, photo_added: 0, desc_added: 0, errors: 0 },
    };

    // Pass 1: deep enrichment on top tier
    for (const h of topRows) {
      summary.deep.scanned++;
      try {
        const patch = await deepEnrichHotel(h);
        const r = await applyEnrichment(h.id, h, patch, { depth: 'deep' });
        if (r.wrote_any) summary.deep.enriched++;
        if (r.wrote_photo) summary.deep.photo_added++;
        if (r.wrote_desc) summary.deep.desc_added++;
      } catch (err) {
        summary.deep.errors++;
        console.warn(`[deep-sweep] row ${h.id} failed:`, err.message);
      }
    }

    // Pass 2: standard enrichment on the next tier
    for (const h of standardRows) {
      summary.standard.scanned++;
      try {
        const patch = await enrichHotel(h);
        const r = await applyEnrichment(h.id, h, patch, { depth: 'standard' });
        if (r.wrote_any) summary.standard.enriched++;
        if (r.wrote_photo) summary.standard.photo_added++;
        if (r.wrote_desc) summary.standard.desc_added++;
      } catch (err) {
        summary.standard.errors++;
        console.warn(`[std-sweep] row ${h.id} failed:`, err.message);
      }
    }

    // Mark everyone else as 'shallow' so the UI knows not to surface them
    // in deep-research-only views. One UPDATE for the whole tail.
    await db.run(
      `UPDATE hotels_saved SET enrichment_depth = 'shallow'
       WHERE enrichment_depth IS NULL`,
      [],
    );

    res.json(summary);
  } catch (err) {
    console.error('[hotel-research] deep-sweep failed:', err);
    res.status(500).json({ error: 'Deep sweep failed' });
  }
});

// ─── AI Fit Score — pre-sort triage by best-fit-first ────────────────
//
// Recomputes ai_fit_score for every saved hotel using the deterministic
// scorer in src/services/fit-score.js. Cheap (no network) so re-running is
// fine. Pass ?force=1 to re-score even rows that already have a score.
router.post('/score-all', requireAuth, async (req, res) => {
  const force = req.query.force === '1' || req.body?.force === true;
  try {
    const rows = await db.all(
      force
        ? 'SELECT * FROM hotels_saved'
        : 'SELECT * FROM hotels_saved WHERE ai_fit_score IS NULL',
      [],
    );
    let scored = 0;
    const tierCounts = { top: 0, high: 0, mid: 0, low: 0 };
    const now = new Date().toISOString();
    for (const h of rows) {
      const { score, reasoning, tier } = fitScoreFor(h);
      await db.run(
        `UPDATE hotels_saved
         SET ai_fit_score = ?, ai_fit_reasoning = ?, ai_fit_tier = ?, ai_fit_scored_at = ?
         WHERE id = ?`,
        [score, JSON.stringify(reasoning), tier, now, h.id],
      );
      scored++;
      tierCounts[tier] = (tierCounts[tier] || 0) + 1;
    }
    res.json({ scored, tier_counts: tierCounts });
  } catch (err) {
    console.error('[hotel-research] score-all failed:', err);
    res.status(500).json({ error: 'Failed to score hotels' });
  }
});

// Recompute one row's score — used after a manual edit (visit, intel update,
// status bump) so the triage queue picks up changes without a full sweep.
router.post('/saved/:id/score', requireAuth, async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'invalid id' });
  try {
    const h = await db.one('SELECT * FROM hotels_saved WHERE id = ?', [id]);
    if (!h) return res.status(404).json({ error: 'not found' });
    const { score, reasoning, tier } = fitScoreFor(h);
    await db.run(
      `UPDATE hotels_saved
       SET ai_fit_score = ?, ai_fit_reasoning = ?, ai_fit_tier = ?, ai_fit_scored_at = ?
       WHERE id = ?`,
      [score, JSON.stringify(reasoning), tier, new Date().toISOString(), id],
    );
    res.json({ id, score, reasoning, tier });
  } catch (err) {
    console.error('[hotel-research] score one failed:', err);
    res.status(500).json({ error: 'Failed to score hotel' });
  }
});

// ─── Backfill — link existing hotels_saved + prospects to facilities ─────
//
// One-shot maintenance endpoint. Walks every saved-hotel row that doesn't
// have a facility_id yet and runs it through findOrCreateFacility. Same
// for prospects. Safe to re-run — already-linked rows are skipped.
//
// Returns a summary so the operator can confirm everything stitched.
router.post('/backfill-facilities', requireAuth, async (_req, res) => {
  const summary = { hotels_saved: { scanned: 0, linked: 0, errors: 0 },
                    prospects:    { scanned: 0, linked: 0, errors: 0 } };
  try {
    const hotels = await db.all('SELECT * FROM hotels_saved WHERE facility_id IS NULL');
    for (const h of hotels) {
      summary.hotels_saved.scanned++;
      try {
        const f = await findOrCreateFacility(db, h);
        await db.run('UPDATE hotels_saved SET facility_id = ? WHERE id = ?', [f.facility_id, h.id]);
        summary.hotels_saved.linked++;
      } catch (e) {
        summary.hotels_saved.errors++;
        console.warn('[backfill] hotel', h.id, '→', e.message);
      }
    }
    const prospects = await db.all('SELECT * FROM prospects WHERE facility_id IS NULL');
    for (const p of prospects) {
      summary.prospects.scanned++;
      try {
        // Prospects have a different shape than hotels — adapt the fields.
        const f = await findOrCreateFacility(db, {
          name: p.name, address: p.address, brand: p.brand,
          stars: p.stars, rooms: p.keys,
          osm_id: null, // prospects don't carry OSM ids
        });
        await db.run('UPDATE prospects SET facility_id = ? WHERE id = ?', [f.facility_id, p.id]);
        summary.prospects.linked++;
      } catch (e) {
        summary.prospects.errors++;
        console.warn('[backfill] prospect', p.id, '→', e.message);
      }
    }
    res.json({ ok: true, summary });
  } catch (err) {
    console.error('[hotel-research] backfill failed:', err);
    res.status(500).json({ error: 'Backfill failed — ' + err.message });
  }
});

// ─── Facility master view — GET /facility/:id ─────────────────────────────
//
// Returns the unified record: facility row + all linked artifacts (saved
// hotel research, visits, prospects, deals, assessments) so the UI can
// render a single cohesive "opportunity card."
router.get('/facility/:id', requireAuth, async (req, res) => {
  const id = String(req.params.id || '').trim();
  if (!id) return res.status(400).json({ error: 'invalid id' });
  try {
    const facility = await db.one('SELECT * FROM facilities WHERE id = ?', [id]);
    if (!facility) return res.status(404).json({ error: 'facility not found' });

    const hotels = await db.all(
      `SELECT id, name, status, est_adr_dollars, opportunity_score,
              dm_name, dm_title, tags, prospect_id, updated_at
       FROM hotels_saved WHERE facility_id = ? ORDER BY updated_at DESC`, [id],
    );
    const visits = await db.all(
      `SELECT v.* FROM hotel_visits v
       JOIN hotels_saved h ON h.id = v.hotel_saved_id
       WHERE h.facility_id = ? ORDER BY v.visit_date DESC, v.id DESC`, [id],
    );
    const prospects = await db.all(
      `SELECT id, status, name, address, brand, brand_class, keys, stars, source, created_at
       FROM prospects WHERE facility_id = ? ORDER BY created_at DESC`, [id],
    );
    const deals = await db.all(
      `SELECT id, name, stage, owner, value_monthly, value_total, created_at
       FROM deals WHERE facility_id = ? ORDER BY created_at DESC`, [id],
    );

    res.json({ facility, hotels_saved: hotels, visits, prospects, deals });
  } catch (err) {
    console.error('[hotel-research] facility fetch failed:', err);
    res.status(500).json({ error: 'Failed to load facility — ' + err.message });
  }
});

module.exports = router;
