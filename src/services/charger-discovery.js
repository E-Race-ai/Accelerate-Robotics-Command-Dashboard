// EV charger discovery — pulls from multiple public sources and merges them
// into a single deduped list per bounding box.
//
// Sources, in priority order for the merge:
//   1. supercharge.info  → DEFINITIVE source for every Tesla Supercharger
//      worldwide (open + under construction). Tesla blocks their own
//      find_us endpoint, so the community-maintained list is the only
//      reliable Tesla source.
//   2. NREL Alternative Fuels Data Center → comprehensive US-public EV
//      stations (ChargePoint, EVgo, EA, Blink, Volta, etc.). Free key
//      DEMO_KEY works at low volume; real NREL_API_KEY recommended.
//   3. OpenStreetMap (Overpass) → community supplement for stations not in
//      either of the above. Adds older / lesser-known sites.
//
// Deduplication: matches across sources by lat/lng rounded to 4 decimal
// places (~11m). When the same site appears in multiple sources we keep
// the richest record and combine metadata.

const OSM_USER_AGENT = 'AccelerateRoboticsResearch/1.0 (sales-prospecting; admin@acceleraterobotics.ai)';

// ── Cache TTLs ───────────────────────────────────────────────────────
const SUPERCHARGE_TTL_MS = 24 * 60 * 60 * 1000;  // 24h — Tesla rolls out new sites monthly, daily refresh is plenty
const NREL_TTL_MS        = 12 * 60 * 60 * 1000;  // 12h — NREL data updates several times per week
const OSM_TTL_MS         = 12 * 60 * 60 * 1000;  // 12h — OSM is community-edited, slower-moving

// ── In-memory caches ─────────────────────────────────────────────────
// supercharge.info is one big global list (~6MB). Cache the whole thing once
// and filter by bbox in-memory — far cheaper than refetching per viewport.
let SUPERCHARGE_CACHE = null;     // { sites: [...], at: timestamp }
const NREL_CACHE = new Map();     // bbox key → { stations, at }
const OSM_CACHE  = new Map();     // bbox key → { stations, at }

// ── Generic helpers ──────────────────────────────────────────────────
function bboxKey(s, w, n, e) {
  return `${s.toFixed(2)},${w.toFixed(2)},${n.toFixed(2)},${e.toFixed(2)}`;
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 20000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

// ── Supercharge.info — every Tesla Supercharger worldwide ────────────
async function fetchSuperchargersGlobal() {
  if (SUPERCHARGE_CACHE && Date.now() - SUPERCHARGE_CACHE.at < SUPERCHARGE_TTL_MS) {
    return SUPERCHARGE_CACHE.sites;
  }
  const r = await fetchWithTimeout('https://supercharge.info/service/supercharge/allSites', {
    headers: { 'User-Agent': OSM_USER_AGENT, 'Accept': 'application/json' },
  });
  if (!r.ok) throw new Error(`supercharge.info HTTP ${r.status}`);
  const data = await r.json();
  if (!Array.isArray(data)) throw new Error('supercharge.info: expected array');
  // Map to a unified shape and pre-compute display fields. Keep the raw
  // status — caller filters by OPEN vs CONSTRUCTION based on context.
  const sites = data
    .filter(s => s?.gps?.latitude && s?.gps?.longitude)
    .map(s => ({
      source: 'tesla',
      external_id: `sc-${s.id}`,
      lat: s.gps.latitude,
      lng: s.gps.longitude,
      name: s.name ? `Tesla Supercharger — ${s.name}` : 'Tesla Supercharger',
      operator: 'Tesla',
      network: 'Tesla Supercharger',
      is_tesla: true,
      status: s.status || 'OPEN',
      stall_count: s.stallCount || null,
      power_kw: s.powerKilowatt || null,
      // Tesla NACS plug present + sometimes legacy TPC stalls
      plugs_nacs: s.plugs?.nacs ?? null,
      plugs_tpc: s.plugs?.tpc ?? null,
      address: s.address ? [s.address.street, s.address.city, s.address.state].filter(Boolean).join(', ') : null,
      city: s.address?.city || null,
      state: s.address?.state || null,
      open_to_other_evs: s.otherEVs === true,
      date_opened: s.dateOpened || null,
      facility_name: s.facilityName || null,
      url: s.locationId ? `https://supercharge.info/charger/${s.locationId}` : null,
    }));
  SUPERCHARGE_CACHE = { sites, at: Date.now() };
  return sites;
}

function filterSuperchargersByBbox(sites, south, west, north, east) {
  return sites.filter(s =>
    s.lat >= south && s.lat <= north && s.lng >= west && s.lng <= east);
}

// ── NREL Alt Fuels — comprehensive US public EV stations ─────────────
//
// NREL uses center + radius (miles), not bbox. We approximate by computing
// bbox center + the half-diagonal in miles, then filter results back to the
// requested bbox to avoid bleed-over into adjacent metros.
function bboxCenter(s, w, n, e) {
  return { lat: (s + n) / 2, lng: (w + e) / 2 };
}
function bboxRadiusMiles(s, w, n, e) {
  // 1° lat ≈ 69 mi; 1° lng ≈ 69 * cos(lat).
  const lat = (s + n) / 2;
  const dLatMi = ((n - s) / 2) * 69;
  const dLngMi = ((e - w) / 2) * 69 * Math.cos((lat * Math.PI) / 180);
  // Half-diagonal — covers the corners. NREL clips to whatever radius fits.
  return Math.sqrt(dLatMi * dLatMi + dLngMi * dLngMi);
}

async function fetchNRELStations(south, west, north, east) {
  const key = bboxKey(south, west, north, east);
  const hit = NREL_CACHE.get(key);
  if (hit && Date.now() - hit.at < NREL_TTL_MS) return hit.stations;

  // WHY skip when no real key: NREL's DEMO_KEY silently ignores location
  // filters and returns the same 200 LA-area results regardless of bbox —
  // useless for any non-LA market. Sign up at https://developer.nrel.gov/signup/
  // for a free key (instant, 1000 req/hour) and set NREL_API_KEY in .env.
  const apiKey = process.env.NREL_API_KEY;
  if (!apiKey) {
    NREL_CACHE.set(key, { stations: [], at: Date.now() });
    return [];
  }
  const center = bboxCenter(south, west, north, east);
  const radius = Math.ceil(bboxRadiusMiles(south, west, north, east));
  const url = `https://developer.nrel.gov/api/alt-fuel-stations/v1.json?api_key=${apiKey}` +
              `&fuel_type=ELEC&latitude=${center.lat}&longitude=${center.lng}` +
              `&radius=${radius}&limit=200&access=public`;
  const r = await fetchWithTimeout(url, {
    headers: { 'User-Agent': OSM_USER_AGENT, 'Accept': 'application/json' },
  }, 15000);
  if (!r.ok) throw new Error(`NREL HTTP ${r.status}`);
  const data = await r.json();
  const stations = (data.fuel_stations || [])
    .filter(s => s.latitude != null && s.longitude != null)
    // Trim to actual bbox — NREL returns by radius, which can over-shoot
    .filter(s => s.latitude >= south && s.latitude <= north && s.longitude >= west && s.longitude <= east)
    .map(s => {
      const network = s.ev_network || null;
      const isTesla = network && /TESLA/i.test(network);
      const dcFast = s.ev_dc_fast_num || 0;
      const l2     = s.ev_level2_evse_num || 0;
      return {
        source: 'nrel',
        external_id: `nrel-${s.id}`,
        lat: s.latitude,
        lng: s.longitude,
        name: s.station_name || network || 'EV charger',
        operator: network || s.facility_type || null,
        network: network,
        is_tesla: isTesla,
        connectors: s.ev_connector_types || [],
        dc_fast_count: dcFast || null,
        level2_count: l2 || null,
        stall_count: (dcFast + l2) || null,
        address: [s.street_address, s.city, s.state].filter(Boolean).join(', ') || null,
        city: s.city || null,
        state: s.state || null,
        access: s.access_code || null,
        access_days_time: s.access_days_time || null,
        ev_pricing: s.ev_pricing || null,
        phone: s.station_phone || null,
        url: s.ev_network_web || null,
      };
    });
  NREL_CACHE.set(key, { stations, at: Date.now() });
  return stations;
}

// ── OSM Overpass — community fallback ────────────────────────────────
async function fetchOSMChargers(south, west, north, east) {
  const key = bboxKey(south, west, north, east);
  const hit = OSM_CACHE.get(key);
  if (hit && Date.now() - hit.at < OSM_TTL_MS) return hit.stations;

  const query = `[out:json][timeout:25];
(
  node["amenity"="charging_station"](${south},${west},${north},${east});
);
out;`;
  const r = await fetchWithTimeout('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    headers: {
      'User-Agent': OSM_USER_AGENT,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'application/json',
    },
    body: 'data=' + encodeURIComponent(query),
  }, 30000);
  if (!r.ok) throw new Error(`overpass HTTP ${r.status}`);
  const data = await r.json();
  const stations = (data.elements || [])
    .filter(el => el.lat != null && el.lon != null)
    .map(el => {
      const t = el.tags || {};
      const candidates = [t.brand, t.operator, t.network, t.name].filter(Boolean).join(' ').toLowerCase();
      const isTesla = /tesla/.test(candidates);
      return {
        source: 'osm',
        external_id: `osm-${el.id}`,
        lat: el.lat,
        lng: el.lon,
        name: t.name || (isTesla ? 'Tesla Supercharger' : 'EV charger'),
        operator: t.operator || t.brand || t.network || null,
        network: t.network || t.brand || null,
        is_tesla: isTesla,
        stall_count: parseInt(t.capacity, 10) || null,
        access: t.access || null,
        fee: t.fee || null,
        opening_hours: t.opening_hours || null,
        address: [t['addr:street'], t['addr:housenumber'], t['addr:city']].filter(Boolean).join(' ') || null,
      };
    });
  OSM_CACHE.set(key, { stations, at: Date.now() });
  return stations;
}

// ── Dedupe + merge ───────────────────────────────────────────────────
//
// Two records refer to the same physical site when their coordinates
// match to 4dp (~11m). When that happens, the higher-priority source's
// fields win, but we backfill missing metadata from the lower-priority
// record so we end up with the richest possible card.
//
// Priority: tesla > nrel > osm. Tesla data comes from a dedicated Tesla
// community DB so it's authoritative for Superchargers; NREL is the gov
// canonical for non-Tesla US public; OSM fills gaps.
const SOURCE_PRIORITY = { tesla: 3, nrel: 2, osm: 1 };
function coordKey(lat, lng) {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

function mergeRecords(higher, lower) {
  // Spread lower first so higher's defined values overwrite. Then fill any
  // fields higher left null with lower's values.
  const out = { ...lower, ...higher };
  for (const k of Object.keys(lower)) {
    if (out[k] == null && lower[k] != null) out[k] = lower[k];
  }
  // Combine sources for transparency in the popup
  out.sources = Array.from(new Set([higher.source, lower.source, ...(higher.sources || []), ...(lower.sources || [])]));
  return out;
}

function dedupe(records) {
  // Sort by descending source priority so the first record at each coord
  // is the canonical one.
  const sorted = [...records].sort((a, b) =>
    (SOURCE_PRIORITY[b.source] || 0) - (SOURCE_PRIORITY[a.source] || 0));
  const map = new Map();
  for (const r of sorted) {
    const k = coordKey(r.lat, r.lng);
    if (!map.has(k)) {
      map.set(k, { ...r, sources: [r.source] });
    } else {
      // Already have a higher-priority record — merge in any extra fields
      map.set(k, mergeRecords(map.get(k), r));
    }
  }
  return Array.from(map.values());
}

// ── Public orchestrator ──────────────────────────────────────────────
async function getAllChargersInBbox(south, west, north, east) {
  // Run all three sources in parallel — independent failures don't block
  // the others. Promise.allSettled keeps us going even if one source is
  // having a bad day.
  const [scResult, nrelResult, osmResult] = await Promise.allSettled([
    fetchSuperchargersGlobal().then(sites =>
      filterSuperchargersByBbox(sites, south, west, north, east)),
    fetchNRELStations(south, west, north, east),
    fetchOSMChargers(south, west, north, east),
  ]);
  const merged = [];
  const errors = [];
  if (scResult.status === 'fulfilled') merged.push(...scResult.value);
  else errors.push(`tesla: ${scResult.reason?.message || scResult.reason}`);
  if (nrelResult.status === 'fulfilled') merged.push(...nrelResult.value);
  else errors.push(`nrel: ${nrelResult.reason?.message || nrelResult.reason}`);
  if (osmResult.status === 'fulfilled') merged.push(...osmResult.value);
  else errors.push(`osm: ${osmResult.reason?.message || osmResult.reason}`);
  // Filter Tesla records to OPEN only — under-construction sites would
  // mislead a sales rep planning a real visit.
  const filtered = merged.filter(r => !(r.source === 'tesla' && r.status && r.status !== 'OPEN'));
  const deduped = dedupe(filtered);
  return {
    chargers: deduped,
    counts: {
      total: deduped.length,
      tesla: deduped.filter(c => c.is_tesla).length,
      from_supercharge_info: scResult.status === 'fulfilled' ? scResult.value.length : 0,
      from_nrel: nrelResult.status === 'fulfilled' ? nrelResult.value.length : 0,
      from_osm: osmResult.status === 'fulfilled' ? osmResult.value.length : 0,
    },
    errors: errors.length > 0 ? errors : undefined,
  };
}

module.exports = {
  getAllChargersInBbox,
  // Exported for tests
  dedupe, mergeRecords, coordKey,
  fetchSuperchargersGlobal, fetchNRELStations, fetchOSMChargers,
  filterSuperchargersByBbox, bboxRadiusMiles,
};
