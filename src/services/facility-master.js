// Facility master record — the unifying layer.
//
// Every real-world property has exactly one row in `facilities`. BDR research
// records (`hotels_saved`), prospects, deals, and assessments all FK back to
// it via `facility_id`. This module owns the find-or-create logic so the
// same property never gets duplicated when:
//   • A BDR saves a hotel from research
//   • That same hotel is graduated to a prospect
//   • Sales separately creates a facility from the deals UI
//
// Match strategies, in order of confidence:
//   1. osm_id exact match (strongest — same OSM way/relation)
//   2. normalized name + city + state exact match
//   3. fall through → create a fresh facility row
//
// Proximity-based fallback (lat/lng within ~100m) is intentionally deferred
// to v2 — for now strict name+city matching avoids accidentally merging two
// different Hampton Inns in the same city.

const crypto = require('crypto');

function normalizeName(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Stable, opaque id. Prefix makes facility ids distinguishable from prospect /
// deal ids in logs and URLs without imposing a particular generator.
function generateFacilityId() {
  return 'fac_' + crypto.randomBytes(7).toString('hex');
}

// `db` is the same module as src/db/database.js (one, all, run helpers).
async function findFacilityByOsmId(db, osmId) {
  if (!osmId) return null;
  const row = await db.one(
    'SELECT id FROM facilities WHERE osm_id = ? LIMIT 1',
    [osmId],
  );
  return row?.id || null;
}

async function findFacilityByNameCity(db, name, city, state) {
  const n = normalizeName(name);
  const c = normalizeName(city);
  if (!n || !c) return null;
  const row = await db.one(
    `SELECT id FROM facilities
     WHERE LOWER(name) = ? AND LOWER(COALESCE(city, '')) = ?
       AND (? = '' OR LOWER(COALESCE(state, '')) = LOWER(?))
     LIMIT 1`,
    [n, c, state || '', state || ''],
  );
  // Note: SQL uses raw lower-case match on stored values; the index
  // idx_facilities_name_city covers LOWER(name), LOWER(city) so this stays fast.
  if (row?.id) return row.id;
  // Fall-back: try comparing normalized stored name. Stored names may have
  // punctuation we stripped, so the strict lowercase match misses them.
  // Walk a small page filtered by city to avoid scanning the whole table.
  const candidates = await db.all(
    `SELECT id, name, state FROM facilities
     WHERE LOWER(COALESCE(city, '')) = ? LIMIT 50`,
    [c],
  );
  for (const cand of candidates) {
    if (normalizeName(cand.name) === n &&
        (!state || !cand.state || normalizeName(cand.state) === normalizeName(state))) {
      return cand.id;
    }
  }
  return null;
}

// Main entry point. Returns { facility_id, created: bool }.
//
// Hotel data shape (subset of the search-result shape, all optional except name):
//   { name, address, city, state, zip, country, lat, lng, brand, stars, rooms,
//     phone, website, osm_id, submarket, est_adr_dollars, year_opened,
//     total_floors, operator, ownership }
async function findOrCreateFacility(db, hotel) {
  if (!hotel || !hotel.name) throw new Error('hotel.name is required');

  // 1) OSM id match — strongest
  let facilityId = await findFacilityByOsmId(db, hotel.osm_id);
  if (facilityId) return { facility_id: facilityId, created: false, matched_by: 'osm_id' };

  // 2) Name + city + state match
  facilityId = await findFacilityByNameCity(db, hotel.name, hotel.city, hotel.state);
  if (facilityId) {
    // Backfill the OSM id if we now have one — strengthens future dedupe.
    if (hotel.osm_id) {
      try { await db.run('UPDATE facilities SET osm_id = ? WHERE id = ? AND osm_id IS NULL', [hotel.osm_id, facilityId]); } catch {}
    }
    return { facility_id: facilityId, created: false, matched_by: 'name_city' };
  }

  // 3) Create a fresh facility from the hotel's data. Default type='hotel'
  // since this service is hotel-research-driven; if other property types
  // start saving research data, the type can be passed in.
  facilityId = generateFacilityId();
  const num = v => Number.isFinite(Number(v)) ? Number(v) : null;
  const intOrNull = v => Number.isInteger(Number(v)) ? Number(v) : null;
  await db.run(
    `INSERT INTO facilities (
       id, name, type, address, city, state, country, zip,
       lat, lng, submarket, osm_id, brand, operator, stars, year_opened,
       rooms_or_units, floors, est_adr_dollars, phone, website
     ) VALUES (?, ?, 'hotel', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      facilityId,
      String(hotel.name).slice(0, 200),
      hotel.address ? String(hotel.address).slice(0, 500) : null,
      hotel.city ? String(hotel.city).slice(0, 100) : null,
      hotel.state ? String(hotel.state).slice(0, 100) : null,
      hotel.country ? String(hotel.country).slice(0, 100) : 'United States',
      hotel.zip ? String(hotel.zip).slice(0, 20) : null,
      num(hotel.lat),
      num(hotel.lng),
      hotel.submarket ? String(hotel.submarket).slice(0, 80) : null,
      hotel.osm_id ? String(hotel.osm_id).slice(0, 80) : null,
      hotel.brand ? String(hotel.brand).slice(0, 200) : null,
      hotel.operator ? String(hotel.operator).slice(0, 200) : null,
      intOrNull(hotel.stars),
      intOrNull(hotel.year_opened),
      intOrNull(hotel.rooms),
      intOrNull(hotel.total_floors),
      intOrNull(hotel.est_adr_dollars ?? hotel.estimated_adr_dollars),
      hotel.phone ? String(hotel.phone).slice(0, 100) : null,
      hotel.website ? String(hotel.website).slice(0, 500) : null,
    ],
  );
  return { facility_id: facilityId, created: true, matched_by: 'created' };
}

module.exports = {
  findOrCreateFacility,
  findFacilityByOsmId,
  findFacilityByNameCity,
  normalizeName,
  generateFacilityId,
};
