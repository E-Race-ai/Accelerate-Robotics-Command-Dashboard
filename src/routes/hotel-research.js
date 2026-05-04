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
const { estimateAdr, normLocation, distanceMiles, shapeHotel } = require('../services/hotel-research-utils');

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
           brand, stars, rooms, phone, website, osm_id,
           est_adr_dollars, status, notes, saved_by
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
      `SELECT id, name, address, city, state, zip, country, lat, lng,
              brand, stars, rooms, phone, website, osm_id,
              est_adr_dollars, status, notes, saved_by, created_at, updated_at
       FROM hotels_saved
       ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
       ORDER BY updated_at DESC, id DESC`,
      args,
    );
    res.json({ hotels: rows });
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
  if (b.phone !== undefined)   { fields.push('phone = ?');   args.push(b.phone || null); }
  if (b.website !== undefined) { fields.push('website = ?'); args.push(b.website || null); }
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

module.exports = router;
