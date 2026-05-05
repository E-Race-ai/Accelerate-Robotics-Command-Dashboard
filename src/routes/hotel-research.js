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
const { estimateAdr, normLocation, distanceMiles, shapeHotel, brandClass } = require('../services/hotel-research-utils');

const router = express.Router();

const ALLOWED_STATUS = new Set(['lead', 'contacted', 'qualified', 'proposed', 'won', 'lost', 'archived']);

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
      // Radii are tight — these are dense urban submarkets. 1mi captures the
      // walkable core; Kendall and Aventura get a touch more for spread.
      { submarket: 'Brickell',         location: 'Brickell, Miami, FL',         radius_miles: 1   },
      { submarket: 'Downtown Miami',   location: 'Downtown Miami, FL',          radius_miles: 1   },
      { submarket: 'Midtown Miami',    location: 'Midtown Miami, FL',           radius_miles: 1   },
      { submarket: 'Coconut Grove',    location: 'Coconut Grove, Miami, FL',    radius_miles: 1.5 },
      { submarket: 'Coral Gables',     location: 'Coral Gables, FL',            radius_miles: 2   },
      { submarket: 'Kendall',          location: 'Kendall, FL',                 radius_miles: 3   },
      { submarket: 'Bal Harbour',      location: 'Bal Harbour, FL',             radius_miles: 1   },
      { submarket: 'Surfside',         location: 'Surfside, FL',                radius_miles: 1   },
      { submarket: 'North Beach',      location: 'North Beach, Miami Beach, FL', radius_miles: 1   },
      { submarket: 'South Beach',      location: 'South Beach, Miami Beach, FL', radius_miles: 1.5 },
      { submarket: 'Aventura',         location: 'Aventura, FL',                radius_miles: 2   },
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

// ─── Routes ───────────────────────────────────────────────────────

// GET /presets — list available preset markets (Miami-Dade, etc.)
// WHY: Frontend renders these as quick-pick chips so reps don't have to
// remember exact submarket names or radii.
router.get('/presets', requireAuth, (_req, res) => {
  res.json({ markets: PRESET_MARKETS });
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
  try {
    for (const h of items) {
      const name = String(h.name || '').trim().slice(0, 200);
      if (!name) return res.status(400).json({ error: 'each saved hotel needs a name' });
      const r = await db.run(
        `INSERT INTO hotels_saved (
           name, address, city, state, zip, country, lat, lng,
           brand, stars, rooms, phone, website, osm_id, submarket,
           est_adr_dollars, status, notes, saved_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        ],
      );
      ids.push(r.lastInsertRowid);
    }
    res.status(201).json({ ok: true, ids });
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
              h.created_at, h.updated_at,
              (SELECT COUNT(*) FROM hotel_visits v WHERE v.hotel_saved_id = h.id) AS visit_count,
              (SELECT MAX(visit_date) FROM hotel_visits v WHERE v.hotel_saved_id = h.id) AS last_visit_date
       FROM hotels_saved h
       ${where.length ? 'WHERE ' + where.join(' AND ').replace(/(name|city|brand|status)/g, 'h.$1') : ''}
       ORDER BY h.updated_at DESC, h.id DESC`,
      args,
    );
    // Stamp brand_class so the frontend can filter without re-deriving.
    const enriched = rows.map(r => ({
      ...r,
      brand_class: brandClass({ brand: r.brand, stars: r.stars, est_adr: r.est_adr_dollars }),
    }));
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

  try {
    const r = await db.run(
      `INSERT INTO prospects (
         market_id, status, name, address, brand, brand_class, keys, stars,
         signal, source, research_date
       ) VALUES (?, 'staged', ?, ?, ?, ?, ?, ?, ?, 'ai_research', datetime('now'))`,
      [
        marketId,
        hotel.name,
        hotel.address,
        hotel.brand,
        brandClass,
        hotel.rooms,
        hotel.stars,
        hotel.submarket || null,        // signal field — repurposed for our submarket tag
      ],
    );
    const prospectId = r.lastInsertRowid;
    await db.run("UPDATE hotels_saved SET prospect_id = ?, status = 'qualified', updated_at = datetime('now') WHERE id = ?", [prospectId, id]);
    res.status(201).json({ ok: true, prospect_id: prospectId });
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

module.exports = router;
