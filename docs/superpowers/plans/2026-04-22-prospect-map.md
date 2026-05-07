# Interactive Prospect Map Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an interactive Leaflet + OpenStreetMap map view as a third tab on the Prospect Pipeline page, visualizing market locations, prospect density, cross-market connections, and territory coverage.

**Architecture:** Market-level geocoding (lat/lng stored on the `markets` table, not per-prospect). A self-contained `public/js/prospect-map.js` module owns the Leaflet map lifecycle and compact prospect list. The pipeline page gains a Map toggle alongside existing Cards/Table, with two-way filter sync between map and pipeline filters.

**Tech Stack:** Leaflet 1.9 (CDN from unpkg.com), OpenStreetMap tiles, better-sqlite3, Express, vanilla JS

**Spec:** `docs/superpowers/specs/2026-04-22-prospect-map-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/db/database.js` | Modify | Add `lat REAL`, `lng REAL` columns to markets table |
| `src/db/seed-prospects.js` | Modify | Seed coordinates for 14 existing markets |
| `data/seed-prospects.json` | Modify | Add lat/lng to each market entry |
| `src/routes/markets.js` | Modify | Include lat/lng in PATCH handler |
| `src/server.js` | Modify | Add explicit OSM tile domain to CSP imgSrc |
| `pages/pipeline-prospects.html` | Modify | Add Map toggle, containers, Leaflet CDN, wiring |
| `public/js/prospect-map.js` | Create | Leaflet map module: markers, connections, popups, list, sync |
| `tests/helpers/setup.js` | Modify | Add markets + prospects tables to test helper schema |
| `tests/integration/markets.test.js` | Create | Integration tests for markets API + coordinates |

---

### Task 1: Add lat/lng columns to markets table

**Files:**
- Modify: `src/db/database.js:240-247` (CREATE TABLE) and after line 281 (ALTER TABLE block)
- Modify: `tests/helpers/setup.js` (add markets + prospects tables to test schema)

- [ ] **Step 1: Write the integration test for lat/lng columns**

Create `tests/integration/markets.test.js`:

```javascript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createTestDb } = require('../helpers/setup');

describe('markets schema', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => cleanup());

  it('markets table includes lat and lng columns', () => {
    db.prepare("INSERT INTO markets (id, name, lat, lng) VALUES ('test', 'Test Market', 37.77, -122.42)").run();
    const market = db.prepare("SELECT lat, lng FROM markets WHERE id = 'test'").get();
    expect(market.lat).toBeCloseTo(37.77, 2);
    expect(market.lng).toBeCloseTo(-122.42, 2);
  });

  it('lat and lng default to null', () => {
    db.prepare("INSERT INTO markets (id, name) VALUES ('test', 'Test Market')").run();
    const market = db.prepare("SELECT lat, lng FROM markets WHERE id = 'test'").get();
    expect(market.lat).toBeNull();
    expect(market.lng).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/integration/markets.test.js`
Expected: FAIL — `markets` table doesn't exist in test helper schema

- [ ] **Step 3: Add markets + prospects tables to test helper**

In `tests/helpers/setup.js`, add after the `assessment_photos` CREATE TABLE (before the CREATE INDEX statements around line 200):

```javascript
    -- WHY: Markets define geographic areas where Accelerate targets hotel prospects.
    CREATE TABLE IF NOT EXISTS markets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cluster TEXT,
      color TEXT,
      notes TEXT,
      lat REAL,
      lng REAL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS prospects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      market_id TEXT REFERENCES markets(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'staged' CHECK(status IN ('staged', 'confirmed')),
      name TEXT NOT NULL,
      address TEXT,
      brand TEXT,
      brand_class TEXT CHECK(brand_class IN ('luxury', 'soft', 'chain', 'independent')),
      keys INTEGER,
      floors INTEGER,
      stars INTEGER CHECK(stars BETWEEN 1 AND 5),
      signal TEXT,
      operator TEXT,
      portfolio TEXT,
      monogram TEXT,
      mono_color TEXT,
      source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('ai_research', 'manual')),
      research_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_prospects_market ON prospects(market_id);
    CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
```

- [ ] **Step 4: Add lat/lng to production schema**

In `src/db/database.js`, update the markets CREATE TABLE (lines 240-247) to include lat and lng:

```sql
  CREATE TABLE IF NOT EXISTS markets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cluster TEXT,
    color TEXT,
    notes TEXT,
    lat REAL,
    lng REAL,
    created_at TEXT DEFAULT (datetime('now'))
  );
```

Add ALTER TABLE statements after line 281 (after the existing `role` ALTER TABLE block):

```javascript
// WHY: Add lat/lng for map view — market-level geocoding is sufficient for territory visualization
try {
  db.exec("ALTER TABLE markets ADD COLUMN lat REAL");
} catch (e) {
  if (!e.message.includes('duplicate column')) throw e;
}
try {
  db.exec("ALTER TABLE markets ADD COLUMN lng REAL");
} catch (e) {
  if (!e.message.includes('duplicate column')) throw e;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/integration/markets.test.js`
Expected: PASS — both tests green

- [ ] **Step 6: Run full test suite to verify no regressions**

Run: `npx vitest run`
Expected: All existing tests still pass

- [ ] **Step 7: Commit**

```bash
git add src/db/database.js tests/helpers/setup.js tests/integration/markets.test.js
git commit -m "feat(db): add lat/lng columns to markets table

Problem: Map view needs geographic coordinates to place market bubbles
Solution: Add lat REAL and lng REAL columns to markets table, with ALTER
TABLE migration for existing databases. Test helper updated with markets
and prospects tables for integration testing."
```

---

### Task 2: Seed market coordinates

**Files:**
- Modify: `data/seed-prospects.json` (add lat/lng to each of the 14 market entries)
- Modify: `src/db/seed-prospects.js` (include lat/lng in INSERT, add UPDATE for existing markets)

- [ ] **Step 1: Write the integration test for coordinate seeding**

Add to `tests/integration/markets.test.js`:

```javascript
describe('market coordinate seeding', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
  });

  afterEach(() => cleanup());

  it('seeds coordinates for markets that have lat/lng in seed data', () => {
    // Simulate what seed-prospects.js does: insert market, then update coords
    db.prepare("INSERT INTO markets (id, name, cluster, color) VALUES ('san-francisco', 'San Francisco', 'sf-bay', '#2563eb')").run();
    db.prepare("UPDATE markets SET lat = ?, lng = ? WHERE id = ? AND lat IS NULL").run(37.7749, -122.4194, 'san-francisco');

    const market = db.prepare("SELECT lat, lng FROM markets WHERE id = 'san-francisco'").get();
    expect(market.lat).toBeCloseTo(37.7749, 4);
    expect(market.lng).toBeCloseTo(-122.4194, 4);
  });

  it('does not overwrite existing coordinates', () => {
    db.prepare("INSERT INTO markets (id, name, lat, lng) VALUES ('test', 'Test', 99.0, -99.0)").run();
    // The WHERE lat IS NULL guard prevents overwrite
    db.prepare("UPDATE markets SET lat = ?, lng = ? WHERE id = ? AND lat IS NULL").run(0, 0, 'test');

    const market = db.prepare("SELECT lat, lng FROM markets WHERE id = 'test'").get();
    expect(market.lat).toBeCloseTo(99.0, 1);
    expect(market.lng).toBeCloseTo(-99.0, 1);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/integration/markets.test.js`
Expected: PASS — these tests validate the SQL pattern, not the seeder itself

- [ ] **Step 3: Add lat/lng to seed-prospects.json**

Update each market entry in `data/seed-prospects.json` to include lat and lng. The markets array should become:

```json
{
  "markets": [
    {"id": "san-francisco", "name": "San Francisco", "cluster": "sf-bay", "color": "#2563eb", "lat": 37.7749, "lng": -122.4194},
    {"id": "walnut-creek", "name": "Walnut Creek", "cluster": "sf-bay", "color": "#2563eb", "lat": 37.9101, "lng": -122.0652},
    {"id": "sacramento", "name": "Sacramento", "cluster": "sacramento", "color": "#d97706", "lat": 38.5816, "lng": -121.4944},
    {"id": "beverly-hills", "name": "Beverly Hills", "cluster": "la-west", "color": "#7c3aed", "lat": 34.0736, "lng": -118.4004},
    {"id": "santa-monica", "name": "Santa Monica", "cluster": "la-west", "color": "#7c3aed", "lat": 34.0195, "lng": -118.4912},
    {"id": "west-hollywood", "name": "West Hollywood", "cluster": "la-west", "color": "#7c3aed", "lat": 34.0900, "lng": -118.3617},
    {"id": "venice-marina-del-rey", "name": "Venice / Marina del Rey", "cluster": "la-west", "color": "#7c3aed", "lat": 33.9850, "lng": -118.4695},
    {"id": "san-diego", "name": "San Diego", "cluster": "san-diego", "color": "#0891b2", "lat": 32.7157, "lng": -117.1611},
    {"id": "miami", "name": "Miami", "cluster": "south-fl", "color": "#f59e0b", "lat": 25.7617, "lng": -80.1918},
    {"id": "fort-lauderdale", "name": "Fort Lauderdale", "cluster": "south-fl", "color": "#f59e0b", "lat": 26.1224, "lng": -80.1373},
    {"id": "coconut-grove", "name": "Coconut Grove", "cluster": "south-fl", "color": "#f59e0b", "lat": 25.7280, "lng": -80.2462},
    {"id": "coral-gables", "name": "Coral Gables", "cluster": "south-fl", "color": "#f59e0b", "lat": 25.7215, "lng": -80.2684},
    {"id": "sarasota-longboat-key", "name": "Sarasota / Longboat Key", "cluster": "gulf-fl", "color": "#16a34a", "lat": 27.3364, "lng": -82.5307},
    {"id": "dallas", "name": "Dallas", "cluster": "dallas", "color": "#dc2626", "lat": 32.7767, "lng": -96.7970}
  ],
  "prospects": [...]
}
```

Do NOT modify the prospects array — only update the market entries.

- [ ] **Step 4: Update seed-prospects.js to include lat/lng**

In `src/db/seed-prospects.js`, update the `insertMarket` prepared statement (lines 22-25) to include lat and lng:

```javascript
  const insertMarket = db.prepare(`
    INSERT OR IGNORE INTO markets (id, name, cluster, color, lat, lng)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
```

Update the market insertion loop (line 35) to pass lat/lng:

```javascript
    for (const m of seed.markets) {
      insertMarket.run(m.id, m.name, m.cluster, m.color, m.lat || null, m.lng || null);
    }
```

After the transaction function but before the `seedAll()` call, add a coordinate backfill for existing databases where markets were seeded without coordinates:

```javascript
  // WHY: Backfill coordinates for markets seeded before lat/lng existed.
  // Only updates markets where lat IS NULL, so manual overrides are preserved.
  const updateCoords = db.prepare('UPDATE markets SET lat = ?, lng = ? WHERE id = ? AND lat IS NULL');
  for (const m of seed.markets) {
    if (m.lat != null && m.lng != null) {
      updateCoords.run(m.lat, m.lng, m.id);
    }
  }
```

Place this code AFTER `seedAll()` (so it runs unconditionally — even if prospects already exist, coordinates may still be missing).

- [ ] **Step 5: Verify seeding works by restarting the dev server**

Run: `npm run dev` (check console for no errors on boot)

Then verify coordinates exist:

Run: `curl -s http://localhost:3000/api/markets -H "Cookie: token=$(node -e "const jwt=require('jsonwebtoken'); console.log(jwt.sign({id:1,email:'test',role:'admin'}, process.env.JWT_SECRET||'dev', {expiresIn:'1h'}))")" | node -e "process.stdin.on('data',d=>{const m=JSON.parse(d);m.forEach(x=>console.log(x.id,x.lat,x.lng))})"`

Expected: All 14 markets show lat/lng values (not null).

If the server requires login, check via the SQLite CLI instead:

Run: `sqlite3 data/accelerate.db "SELECT id, lat, lng FROM markets"`
Expected: All 14 markets have coordinates

- [ ] **Step 6: Commit**

```bash
git add data/seed-prospects.json src/db/seed-prospects.js tests/integration/markets.test.js
git commit -m "feat(db): seed lat/lng coordinates for 14 markets

Problem: Map view needs geographic coordinates to position market bubbles
Solution: Add lat/lng to seed JSON, update seeder to INSERT with coords
and backfill existing databases where coordinates are missing"
```

---

### Task 3: Markets API coordinate support

**Files:**
- Modify: `src/routes/markets.js:45-61` (PATCH handler)
- Modify: `tests/integration/markets.test.js` (add PATCH tests)

- [ ] **Step 1: Write integration tests for PATCH lat/lng**

Add to `tests/integration/markets.test.js`:

```javascript
describe('markets PATCH coordinates', () => {
  let db, cleanup;

  beforeEach(() => {
    ({ db, cleanup } = createTestDb());
    db.prepare("INSERT INTO markets (id, name, cluster, color) VALUES ('sf', 'San Francisco', 'sf-bay', '#2563eb')").run();
  });

  afterEach(() => cleanup());

  it('updates lat and lng via PATCH fields', () => {
    db.prepare(`
      UPDATE markets SET
        lat = COALESCE(?, lat),
        lng = COALESCE(?, lng)
      WHERE id = ?
    `).run(37.7749, -122.4194, 'sf');

    const market = db.prepare("SELECT lat, lng FROM markets WHERE id = 'sf'").get();
    expect(market.lat).toBeCloseTo(37.7749, 4);
    expect(market.lng).toBeCloseTo(-122.4194, 4);
  });

  it('preserves lat/lng when not provided in PATCH', () => {
    db.prepare("UPDATE markets SET lat = 37.77, lng = -122.42 WHERE id = 'sf'").run();
    // COALESCE(null, lat) keeps existing value
    db.prepare(`
      UPDATE markets SET
        name = COALESCE(?, name),
        lat = COALESCE(?, lat),
        lng = COALESCE(?, lng)
      WHERE id = ?
    `).run('SF Updated', undefined, undefined, 'sf');

    const market = db.prepare("SELECT name, lat, lng FROM markets WHERE id = 'sf'").get();
    expect(market.name).toBe('SF Updated');
    expect(market.lat).toBeCloseTo(37.77, 2);
    expect(market.lng).toBeCloseTo(-122.42, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/integration/markets.test.js`
Expected: PASS (the SQL pattern works regardless of route handler)

- [ ] **Step 3: Update PATCH handler in markets route**

In `src/routes/markets.js`, update the PATCH handler (lines 45-61):

Change the destructuring (line 49) from:
```javascript
  const { name, cluster, color, notes } = req.body;
```
to:
```javascript
  const { name, cluster, color, notes, lat, lng } = req.body;
```

Change the UPDATE SQL (lines 50-56) from:
```javascript
  db.prepare(`
    UPDATE markets SET
      name = COALESCE(?, name),
      cluster = COALESCE(?, cluster),
      color = COALESCE(?, color),
      notes = COALESCE(?, notes)
    WHERE id = ?
  `).run(name, cluster, color, notes, req.params.id);
```
to:
```javascript
  db.prepare(`
    UPDATE markets SET
      name = COALESCE(?, name),
      cluster = COALESCE(?, cluster),
      color = COALESCE(?, color),
      notes = COALESCE(?, notes),
      lat = COALESCE(?, lat),
      lng = COALESCE(?, lng)
    WHERE id = ?
  `).run(name, cluster, color, notes, lat, lng, req.params.id);
```

- [ ] **Step 4: Run full test suite**

Run: `npx vitest run`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/routes/markets.js tests/integration/markets.test.js
git commit -m "feat(api): support lat/lng in markets PATCH endpoint

Problem: No way to update market coordinates via API
Solution: Add lat and lng to the PATCH handler destructuring and
COALESCE update — null values preserve existing coordinates"
```

---

### Task 4: HTML scaffold — Leaflet CDN, Map toggle, containers

**Files:**
- Modify: `src/server.js:43` (CSP imgSrc)
- Modify: `pages/pipeline-prospects.html` (multiple sections)

- [ ] **Step 1: Add OSM tile server to CSP**

In `src/server.js`, update the imgSrc line (line 43). Change:

```javascript
      imgSrc: ["'self'", "data:", "https://img.youtube.com", "https:", "http:"],
```
to:
```javascript
      // WHY: https: already covers OSM tiles, but explicit entry documents the dependency
      imgSrc: ["'self'", "data:", "https://img.youtube.com", "https:", "http:", "https://tile.openstreetmap.org"],
```

- [ ] **Step 2: Add Leaflet CSS to HTML head**

In `pages/pipeline-prospects.html`, add after the `brand.css` link (line 9):

```html
<!-- WHY: Leaflet CSS loaded unconditionally since it's tiny (4KB) and avoids FOUC when switching to map view -->
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9/dist/leaflet.css">
```

- [ ] **Step 3: Add Map toggle button**

In `pages/pipeline-prospects.html`, update the view toggle (lines 112-115). Change:

```html
        <div class="flex rounded-xl border border-gray-200 overflow-hidden">
          <button onclick="setView('card')" id="view-card" class="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white">Cards</button>
          <button onclick="setView('table')" id="view-table" class="px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50">Table</button>
        </div>
```
to:
```html
        <div class="flex rounded-xl border border-gray-200 overflow-hidden">
          <button onclick="setView('card')" id="view-card" class="px-3 py-1.5 text-xs font-semibold bg-blue-600 text-white">Cards</button>
          <button onclick="setView('table')" id="view-table" class="px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50">Table</button>
          <button onclick="setView('map')" id="view-map" class="px-3 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-50">Map</button>
        </div>
```

- [ ] **Step 4: Add map container and prospect list container**

In `pages/pipeline-prospects.html`, add after the `<!-- Table view -->` section (after line 256, before the `<!-- Empty state -->` line):

```html
    <!-- Map view -->
    <div id="mapView" class="hidden mb-8">
      <div id="mapContainer" style="height:60vh;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);"></div>
      <div id="mapProspectList" class="mt-4"></div>
    </div>
```

- [ ] **Step 5: Update setView function to handle map**

In `pages/pipeline-prospects.html`, update the `setView` function (lines 775-780). Change:

```javascript
function setView(v) {
  currentView = v;
  document.getElementById('view-card').className = `px-3 py-1.5 text-xs font-semibold ${v==='card' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`;
  document.getElementById('view-table').className = `px-3 py-1.5 text-xs font-semibold ${v==='table' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`;
  renderAll();
}
```
to:
```javascript
function setView(v) {
  currentView = v;
  document.getElementById('view-card').className = `px-3 py-1.5 text-xs font-semibold ${v==='card' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`;
  document.getElementById('view-table').className = `px-3 py-1.5 text-xs font-semibold ${v==='table' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`;
  document.getElementById('view-map').className = `px-3 py-1.5 text-xs font-semibold ${v==='map' ? 'bg-blue-600 text-white' : 'text-gray-500 hover:bg-gray-50'}`;
  renderAll();
}
```

- [ ] **Step 6: Update renderAll to show/hide map view**

In `pages/pipeline-prospects.html`, update `renderAll` (lines 552-561). Change:

```javascript
function renderAll() {
  const filtered = getFiltered();
  renderStats(filtered);
  renderCards(filtered);
  renderTable(filtered);
  document.getElementById('resultCount').textContent = `${filtered.length} of ${PROSPECTS.length} prospects`;
  document.getElementById('emptyState').classList.toggle('hidden', filtered.length > 0);
  document.getElementById('cardView').classList.toggle('hidden', currentView !== 'card' || filtered.length === 0);
  document.getElementById('tableView').classList.toggle('hidden', currentView !== 'table' || filtered.length === 0);
}
```
to:
```javascript
function renderAll() {
  const filtered = getFiltered();
  renderStats(filtered);
  renderCards(filtered);
  renderTable(filtered);
  document.getElementById('resultCount').textContent = `${filtered.length} of ${PROSPECTS.length} prospects`;
  document.getElementById('emptyState').classList.toggle('hidden', filtered.length > 0 || currentView === 'map');
  document.getElementById('cardView').classList.toggle('hidden', currentView !== 'card' || filtered.length === 0);
  document.getElementById('tableView').classList.toggle('hidden', currentView !== 'table' || filtered.length === 0);
  document.getElementById('mapView').classList.toggle('hidden', currentView !== 'map');

  // WHY: Lazy-init map on first switch to map view — don't load tiles until the user wants them
  if (currentView === 'map' && typeof initProspectMap === 'function') {
    if (!window._prospectMapInitialized) {
      initProspectMap('mapContainer', MARKETS, filtered);
      window._prospectMapInitialized = true;
    } else {
      updateProspectMap(MARKETS, filtered);
    }
  }
}
```

- [ ] **Step 7: Add Leaflet JS and prospect-map.js script tags**

In `pages/pipeline-prospects.html`, add before `<script src="/js/brand.js"></script>` (before line 885):

```html
<script src="https://unpkg.com/leaflet@1.9/dist/leaflet.js"></script>
<script src="/js/prospect-map.js"></script>
```

- [ ] **Step 8: Verify the page loads without errors**

Start the dev server: `npm run dev`

Open `http://localhost:3000/pages/pipeline-prospects.html` in a browser.

Verify:
- Cards/Table/Map toggle is visible with 3 buttons
- Clicking "Map" shows the empty map container div
- Clicking "Cards" returns to card view
- No console errors
- Leaflet library loads (check `typeof L` in console should be `"object"`)

- [ ] **Step 9: Commit**

```bash
git add src/server.js pages/pipeline-prospects.html
git commit -m "feat(map): add Map toggle, containers, and Leaflet CDN to pipeline page

Problem: Pipeline page has no map view option
Solution: Add third 'Map' button to view toggle, map/list containers,
Leaflet CSS+JS from unpkg CDN, and view switching logic with lazy init"
```

---

### Task 5: Create prospect-map.js — core map + market bubbles

**Files:**
- Create: `public/js/prospect-map.js`

- [ ] **Step 1: Create the prospect-map.js module with map initialization and market bubbles**

Create `public/js/prospect-map.js`:

```javascript
/**
 * prospect-map.js — Leaflet map module for the Prospect Pipeline page.
 *
 * Exports (as globals, since this is a no-build vanilla JS project):
 * - initProspectMap(containerId, markets, prospects)
 * - updateProspectMap(markets, prospects)
 * - destroyProspectMap()
 */

/* ── State ─────────────────────────────────────────────────────── */

let map = null;
let markerGroup = null;       // L.layerGroup for market bubbles
let connectionGroup = null;   // L.layerGroup for connection lines
let showConnections = true;
let displayMode = 'count';    // 'count' or 'keys'

// WHY: Store market data keyed by id for fast lookup when rendering popups and list
let marketsById = {};

/* ── Constants ─────────────────────────────────────────────────── */

// WHY: 28px min keeps labels readable on small clusters; 56px max prevents
// large markets from overlapping neighbors at continental zoom
const BUBBLE_MIN_PX = 28;
const BUBBLE_MAX_PX = 56;
// WHY: 3px per prospect gives visible size difference between 1-prospect and
// 10-prospect markets without making the cap unreachable
const BUBBLE_PX_PER_PROSPECT = 3;
// WHY: For keys mode, dividing by 100 scales ~100-key markets to min size
// and ~2800+ key markets toward max — matches the typical hotel range
const BUBBLE_KEYS_DIVISOR = 100;

/* ── Public API ────────────────────────────────────────────────── */

/**
 * Initialize the Leaflet map inside the given container.
 * @param {string} containerId - DOM id for the map container div
 * @param {Array} markets - Markets from GET /api/markets (with lat, lng, prospect_count)
 * @param {Array} prospects - Filtered prospects from GET /api/prospects
 */
function initProspectMap(containerId, markets, prospects) {
  if (map) destroyProspectMap();

  // WHY: Restore saved map state so switching Card→Map→Card→Map doesn't reset position
  const saved = loadMapState();

  map = L.map(containerId, {
    center: saved ? [saved.lat, saved.lng] : [37, -98],  // WHY: center of continental US as fallback
    zoom: saved ? saved.zoom : 4,
    zoomControl: true,
    scrollWheelZoom: true,
  });

  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    maxZoom: 18,
  }).addTo(map);

  // WHY: Save state on every move so it persists across view toggles
  map.on('moveend', saveMapState);

  markerGroup = L.layerGroup().addTo(map);
  connectionGroup = L.layerGroup().addTo(map);

  // Add controls
  addMapControls();

  // Build lookup
  marketsById = {};
  markets.forEach(m => { marketsById[m.id] = m; });

  // Render
  renderMarketBubbles(markets, prospects);
  renderConnectionLines(markets, prospects);
  renderMapProspectList(markets, prospects);

  // WHY: Fit bounds only on first init (no saved state) so user sees all markets
  if (!saved) {
    fitToMarkets(markets);
  }
}

/**
 * Re-render markers and list when filters change.
 * @param {Array} markets - Full markets list (dimmed markets get reduced opacity)
 * @param {Array} prospects - Currently filtered prospects
 */
function updateProspectMap(markets, prospects) {
  if (!map) return;

  marketsById = {};
  markets.forEach(m => { marketsById[m.id] = m; });

  renderMarketBubbles(markets, prospects);
  renderConnectionLines(markets, prospects);
  renderMapProspectList(markets, prospects);
}

/**
 * Cleanup when switching away from map view.
 */
function destroyProspectMap() {
  if (map) {
    saveMapState();
    map.remove();
    map = null;
    markerGroup = null;
    connectionGroup = null;
  }
  window._prospectMapInitialized = false;
}

/* ── Market Bubbles ────────────────────────────────────────────── */

function renderMarketBubbles(markets, prospects) {
  markerGroup.clearLayers();

  // WHY: Build prospect stats per market from the filtered set
  const marketStats = buildMarketStats(prospects);
  // WHY: Build stats from ALL prospects (unfiltered) to know which markets have data
  const allMarketIds = new Set(prospects.map(p => p.market_id));

  markets.forEach(m => {
    if (m.lat == null || m.lng == null) return;

    const stats = marketStats[m.id] || { count: 0, totalKeys: 0 };
    const isActive = allMarketIds.has(m.id);

    // WHY: Filtered-out markets render at 20% opacity to preserve geographic context
    const opacity = isActive && stats.count > 0 ? 1.0 : 0.2;

    const value = displayMode === 'keys' ? stats.totalKeys : stats.count;
    const label = displayMode === 'keys' && stats.totalKeys >= 1000
      ? (stats.totalKeys / 1000).toFixed(1) + 'K'
      : String(value);

    const size = displayMode === 'keys'
      ? BUBBLE_MIN_PX + Math.min(stats.totalKeys / BUBBLE_KEYS_DIVISOR, BUBBLE_MAX_PX - BUBBLE_MIN_PX)
      : BUBBLE_MIN_PX + Math.min(stats.count * BUBBLE_PX_PER_PROSPECT, BUBBLE_MAX_PX - BUBBLE_MIN_PX);

    const icon = L.divIcon({
      className: '',  // WHY: Empty class prevents Leaflet's default white-background icon styling
      html: `<div style="
        width:${size}px;height:${size}px;border-radius:50%;
        background:${m.color || '#64748b'};
        color:#fff;font-weight:700;font-size:${size > 40 ? '0.85rem' : '0.75rem'};
        display:flex;align-items:center;justify-content:center;
        border:3px solid #fff;
        box-shadow:0 2px 8px rgba(0,0,0,0.25);
        opacity:${opacity};
        transition:opacity 0.3s;
        cursor:pointer;
      ">${label}</div>
      <div style="
        text-align:center;font-size:0.6rem;font-weight:600;
        color:#1e293b;margin-top:2px;
        text-shadow:0 1px 2px #fff;
        opacity:${opacity};
        white-space:nowrap;
      ">${escMap(m.name)}</div>`,
      iconSize: [size, size + 16],
      iconAnchor: [size / 2, size / 2],
    });

    const marker = L.marker([m.lat, m.lng], { icon }).addTo(markerGroup);

    // WHY: Click market bubble → show popup with stats AND trigger pipeline cluster filter
    marker.on('click', () => {
      showMarketPopup(m, stats, marker);
      if (typeof toggleFilter === 'function') {
        toggleFilter('cluster', m.cluster);
      }
    });
  });

  // WHY: Click map background → reset cluster filter to "All"
  map.off('click', onMapBackgroundClick);
  map.on('click', onMapBackgroundClick);
}

function onMapBackgroundClick() {
  if (typeof toggleFilter === 'function') {
    toggleFilter('cluster', 'all');
  }
}

/* ── Market Popups ─────────────────────────────────────────────── */

function showMarketPopup(market, stats, marker) {
  const brandBreakdown = stats.brandClasses
    ? Object.entries(stats.brandClasses)
        .map(([cls, n]) => `${n} ${cls}`)
        .join(', ')
    : 'none';

  const content = `
    <div style="font-family:Inter,system-ui,sans-serif;min-width:180px;">
      <div style="font-weight:700;font-size:0.95rem;margin-bottom:6px;">${escMap(market.name)}</div>
      <div style="font-size:0.8rem;color:#555;line-height:1.6;">
        <div><strong>${stats.count}</strong> prospects</div>
        <div><strong>${stats.totalKeys.toLocaleString()}</strong> total keys</div>
        <div><strong>${stats.avgFloors}</strong> avg floors</div>
        <div style="margin-top:4px;font-size:0.75rem;color:#777;">${brandBreakdown}</div>
      </div>
      <a href="#" onclick="event.preventDefault();scrollToMarketInList('${market.id}')" style="
        display:inline-block;margin-top:8px;font-size:0.75rem;color:#2563eb;
        font-weight:600;text-decoration:none;
      ">Show prospects &darr;</a>
    </div>`;

  marker.bindPopup(content, { maxWidth: 280 }).openPopup();
}

/* ── Connection Lines ──────────────────────────────────────────── */

function renderConnectionLines(markets, prospects) {
  connectionGroup.clearLayers();
  if (!showConnections) return;

  // WHY: Only draw connections between active (non-dimmed) markets
  const activeMarketIds = new Set(prospects.map(p => p.market_id));
  const activeMarkets = markets.filter(m => m.lat != null && m.lng != null && activeMarketIds.has(m.id));

  // Build keyword → market_ids maps for brands and operators
  const brandMap = {};   // brand parent → Set of market_ids
  const operatorMap = {}; // operator → Set of market_ids

  prospects.forEach(p => {
    if (!p.market_id) return;

    // WHY: Split brand by "/" to extract parent names (e.g., "WESTIN / MARRIOTT" → ["WESTIN", "MARRIOTT"])
    if (p.brand) {
      p.brand.split('/').map(b => b.trim().toLowerCase()).filter(Boolean).forEach(keyword => {
        if (!brandMap[keyword]) brandMap[keyword] = {};
        if (!brandMap[keyword][p.market_id]) brandMap[keyword][p.market_id] = 0;
        brandMap[keyword][p.market_id]++;
      });
    }

    if (p.operator) {
      const op = p.operator.trim().toLowerCase();
      if (!operatorMap[op]) operatorMap[op] = {};
      if (!operatorMap[op][p.market_id]) operatorMap[op][p.market_id] = 0;
      operatorMap[op][p.market_id]++;
    }
  });

  // Build connection map: "marketA|marketB" → { brands: [...], operators: [...] }
  const connections = {};

  function addConnection(type, keyword, marketIds) {
    const ids = Object.keys(marketIds);
    if (ids.length < 2) return;
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const key = [ids[i], ids[j]].sort().join('|');
        if (!connections[key]) connections[key] = { brands: [], operators: [] };
        const count = Math.min(marketIds[ids[i]], marketIds[ids[j]]);
        connections[key][type].push({ keyword, count });
      }
    }
  }

  Object.entries(brandMap).forEach(([kw, mids]) => addConnection('brands', kw, mids));
  Object.entries(operatorMap).forEach(([kw, mids]) => addConnection('operators', kw, mids));

  // Draw lines
  Object.entries(connections).forEach(([key, conn]) => {
    const [idA, idB] = key.split('|');
    const mA = marketsById[idA];
    const mB = marketsById[idB];
    if (!mA || !mB || mA.lat == null || mB.lat == null) return;

    const totalEntities = conn.brands.length + conn.operators.length;
    // WHY: Thicker lines for more shared entities — 1 = 1.5px, 2 = 2.5px, 3+ = 3.5px
    const weight = totalEntities >= 3 ? 3.5 : totalEntities >= 2 ? 2.5 : 1.5;

    // WHY: Blue for brand connections, orange for operator, mixed if both
    const hasBrands = conn.brands.length > 0;
    const hasOps = conn.operators.length > 0;
    const color = hasBrands && hasOps ? '#8b5cf6' : hasBrands ? '#3b82f6' : '#f97316';

    const line = L.polyline([[mA.lat, mA.lng], [mB.lat, mB.lng]], {
      color,
      weight,
      opacity: 0.3,
      dashArray: '6 4',
    }).addTo(connectionGroup);

    // WHY: Hover tooltip shows which brands/operators are shared
    const tooltipParts = [];
    conn.brands.forEach(b => tooltipParts.push(`${b.keyword} (${b.count} prospects)`));
    conn.operators.forEach(o => tooltipParts.push(`${o.keyword} (${o.count} prospects)`));
    line.bindTooltip(tooltipParts.join('<br>'), { sticky: true });
  });
}

/* ── Map Controls ──────────────────────────────────────────────── */

function addMapControls() {
  // Connection toggle
  const ConnToggle = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function () {
      const container = L.DomUtil.create('div', 'leaflet-bar');
      container.innerHTML = `<a href="#" id="connToggle" style="
        display:block;padding:6px 10px;background:#fff;font-size:0.7rem;
        font-weight:600;color:#555;text-decoration:none;white-space:nowrap;
        border-radius:4px;
      " title="Toggle connection lines">Connections: On</a>`;

      L.DomEvent.disableClickPropagation(container);

      container.querySelector('#connToggle').addEventListener('click', e => {
        e.preventDefault();
        showConnections = !showConnections;
        e.target.textContent = `Connections: ${showConnections ? 'On' : 'Off'}`;
        // WHY: Re-render connections with current state rather than just toggling visibility,
        // so new filter state is respected
        if (typeof updateProspectMap === 'function') {
          renderConnectionLines(
            Object.values(marketsById),
            getCurrentFilteredProspects()
          );
        }
      });

      return container;
    }
  });

  // Keys/Count mode toggle
  const ModeToggle = L.Control.extend({
    options: { position: 'topright' },
    onAdd: function () {
      const container = L.DomUtil.create('div', 'leaflet-bar');
      container.innerHTML = `<a href="#" id="modeToggle" style="
        display:block;padding:6px 10px;background:#fff;font-size:0.7rem;
        font-weight:600;color:#555;text-decoration:none;white-space:nowrap;
        border-radius:4px;
      " title="Toggle bubble sizing">Mode: Count</a>`;

      L.DomEvent.disableClickPropagation(container);

      container.querySelector('#modeToggle').addEventListener('click', e => {
        e.preventDefault();
        displayMode = displayMode === 'count' ? 'keys' : 'count';
        e.target.textContent = `Mode: ${displayMode === 'count' ? 'Count' : 'Keys'}`;
        renderMarketBubbles(
          Object.values(marketsById),
          getCurrentFilteredProspects()
        );
      });

      return container;
    }
  });

  new ConnToggle().addTo(map);
  new ModeToggle().addTo(map);
}

/* ── Compact Prospect List ─────────────────────────────────────── */

function renderMapProspectList(markets, prospects) {
  const container = document.getElementById('mapProspectList');
  if (!container) return;

  // WHY: Group prospects by market for visual coherence — matches how the map organizes data
  const byMarket = {};
  prospects.forEach(p => {
    const mId = p.market_id;
    if (!byMarket[mId]) byMarket[mId] = [];
    byMarket[mId].push(p);
  });

  const marketOrder = markets
    .filter(m => byMarket[m.id])
    .sort((a, b) => a.name.localeCompare(b.name));

  if (marketOrder.length === 0) {
    container.innerHTML = '<p class="text-gray-400 text-center py-8 text-sm">No prospects match your filters.</p>';
    return;
  }

  let html = `<div style="font-size:0.7rem;color:#94a3b8;margin-bottom:8px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;">
    Showing: ${prospects.length} prospects across ${marketOrder.length} markets
  </div>`;

  marketOrder.forEach(m => {
    const mProspects = byMarket[m.id];
    html += `
    <div class="mb-3" id="map-market-${m.id}">
      <div style="font-size:0.7rem;font-weight:700;color:${m.color || '#64748b'};
        padding:4px 0;border-bottom:2px solid ${m.color || '#e5e7eb'};margin-bottom:4px;
        text-transform:uppercase;letter-spacing:0.04em;">
        ${escMap(m.name)} &middot; ${mProspects.length} prospects
      </div>`;

    mProspects.forEach(p => {
      const initials = (p.monogram || p.name.substring(0, 2)).toUpperCase();
      const brandClass = p.brand_class || '';
      const pillColors = {
        luxury: 'background:#fffbeb;color:#92400e;',
        soft: 'background:#f0fdfa;color:#115e59;',
        chain: 'background:#dbeafe;color:#1e40af;',
        independent: 'background:#f3e8ff;color:#6b21a8;',
      };

      html += `
      <div onclick="panToMarket('${m.id}')" style="
        display:flex;align-items:center;gap:12px;padding:8px 12px;
        background:#fff;border-radius:10px;border:1px solid #e2e8f0;
        font-size:0.75rem;cursor:pointer;margin-bottom:4px;
        transition:background 0.15s;
      " onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background='#fff'">
        <div style="width:28px;height:28px;border-radius:8px;background:${p.mono_color || '#64748b'};
          color:#fff;display:flex;align-items:center;justify-content:center;
          font-weight:700;font-size:0.6rem;flex-shrink:0;">${escMap(initials)}</div>
        <div style="flex:1;min-width:0;">
          <strong style="color:#1e293b;">${escMap(p.name)}</strong>
          <span style="color:#94a3b8;margin-left:8px;">${p.keys || '?'} keys &middot; ${p.floors || '?'} fl</span>
        </div>
        ${brandClass ? `<span style="font-size:0.6rem;padding:2px 8px;border-radius:99px;${pillColors[brandClass] || ''}">${brandClass}</span>` : ''}
        <span style="font-size:0.6rem;color:${m.color || '#64748b'};font-weight:600;">${escMap(m.name)}</span>
        ${p.source === 'ai_research' ? '<span style="font-size:0.55rem;color:#7c3aed;" title="AI Researched">&#128300;</span>' : ''}
        <button onclick="event.stopPropagation();if(typeof openDealModal===\'function\')openDealModal(${p.id})" style="
          font-size:0.65rem;font-weight:600;color:#2563eb;background:none;border:none;
          cursor:pointer;padding:2px 6px;border-radius:6px;white-space:nowrap;
        " onmouseover="this.style.background='#dbeafe'" onmouseout="this.style.background='none'">+ Deal</button>
      </div>`;
    });

    html += '</div>';
  });

  container.innerHTML = html;
}

/* ── Helpers ────────────────────────────────────────────────────── */

function buildMarketStats(prospects) {
  const stats = {};
  prospects.forEach(p => {
    if (!stats[p.market_id]) {
      stats[p.market_id] = { count: 0, totalKeys: 0, totalFloors: 0, brandClasses: {} };
    }
    const s = stats[p.market_id];
    s.count++;
    s.totalKeys += (p.keys || 0);
    s.totalFloors += (p.floors || 0);
    if (p.brand_class) {
      s.brandClasses[p.brand_class] = (s.brandClasses[p.brand_class] || 0) + 1;
    }
  });
  // Compute averages
  Object.values(stats).forEach(s => {
    s.avgFloors = s.count ? Math.round(s.totalFloors / s.count) : 0;
  });
  return stats;
}

function fitToMarkets(markets) {
  const withCoords = markets.filter(m => m.lat != null && m.lng != null);
  if (withCoords.length === 0) return;
  const bounds = L.latLngBounds(withCoords.map(m => [m.lat, m.lng]));
  // WHY: padding ensures edge markers aren't hidden behind controls
  map.fitBounds(bounds, { padding: [40, 40] });
}

/**
 * Get currently filtered prospects from the pipeline page's global state.
 * WHY: prospect-map.js doesn't own the filter state — the pipeline page does.
 * This bridge function reads whatever getFiltered() returns.
 */
function getCurrentFilteredProspects() {
  if (typeof getFiltered === 'function') return getFiltered();
  return [];
}

function panToMarket(marketId) {
  if (!map || !marketsById[marketId]) return;
  const m = marketsById[marketId];
  if (m.lat == null || m.lng == null) return;
  map.flyTo([m.lat, m.lng], 10, { duration: 0.8 });
}

function scrollToMarketInList(marketId) {
  const el = document.getElementById(`map-market-${marketId}`);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

/* ── Map State Persistence ─────────────────────────────────────── */

function saveMapState() {
  if (!map) return;
  const center = map.getCenter();
  sessionStorage.setItem('prospectMapState', JSON.stringify({
    lat: center.lat, lng: center.lng, zoom: map.getZoom()
  }));
}

function loadMapState() {
  try {
    const raw = sessionStorage.getItem('prospectMapState');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/** Minimal HTML escape for map content */
function escMap(s) {
  if (!s) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
```

- [ ] **Step 2: Verify the map renders with real data**

Start the dev server: `npm run dev`

Open `http://localhost:3000/pages/pipeline-prospects.html` in a browser. Click the "Map" tab.

Verify:
- OSM tiles load (map background shows real geography)
- 14 colored market bubbles appear at correct geographic positions
- Bubble sizes vary by prospect count
- Market names appear below each bubble
- Dashed connection lines appear between markets sharing brands/operators
- Compact prospect list appears below the map, grouped by market
- "Connections: On/Off" and "Mode: Count/Keys" controls visible in top-right
- Clicking a market bubble opens a popup with stats
- Clicking a prospect row pans the map to that market
- Clicking "Cards" tab returns to card view without errors
- Switching back to "Map" preserves map position (doesn't reset to default zoom)
- No console errors

- [ ] **Step 3: Verify filter sync works**

On the Map view:
- Change a cluster filter chip → map bubbles should update (filtered-out markets dim to 20% opacity)
- Change a brand class filter → same dimming behavior
- Click a market bubble → cluster filter chip should activate for that cluster
- Click the map background → filter resets to "All"
- Type in the search box → list and bubbles update

- [ ] **Step 4: Verify map controls work**

- Click "Connections: On" → toggles to "Off" and lines disappear
- Click again → lines reappear
- Click "Mode: Count" → toggles to "Keys", bubbles resize and labels show key counts
- Click again → back to prospect count mode

- [ ] **Step 5: Commit**

```bash
git add public/js/prospect-map.js
git commit -m "feat(map): create prospect-map.js with full map visualization

Problem: No interactive map for visualizing market geography and connections
Solution: Self-contained Leaflet map module with market cluster bubbles,
cross-market connection lines, interactive popups, compact prospect list,
filter sync, keys/count toggle, and sessionStorage state persistence"
```

---

### Task 6: Print and polish

**Files:**
- Modify: `pages/pipeline-prospects.html` (print styles, map view cleanup)

- [ ] **Step 1: Add print styles for map view**

In `pages/pipeline-prospects.html`, add to the existing `@media print` block (around lines 40-49):

```css
    #mapContainer { display: none !important; }
    #mapView .leaflet-control-container { display: none !important; }
    #mapProspectList { break-inside: avoid; }
```

WHY: Leaflet maps don't print well (tiles may not render, controls are useless). The prospect list below the map does print usefully, so we keep it but hide the interactive map itself.

- [ ] **Step 2: Hide sort controls when in map view**

The sort buttons (Keys, Floors, Name, Stars) don't affect map view — the map orders by geography, not by sort field. This is acceptable since the list below still benefits from the same prospect ordering. No change needed.

- [ ] **Step 3: Verify everything works end-to-end**

Full manual test checklist:

1. Load pipeline page → Cards view shows correctly
2. Switch to Table → table renders
3. Switch to Map → map loads with tiles, bubbles, connections, list
4. Click market bubble → popup shows stats, cluster filter activates
5. Click "Show prospects" in popup → list scrolls to that market
6. Click prospect row → map pans to market
7. Click "+ Deal" on a prospect → deal modal opens
8. Change cluster filter → map dims unfiltered markets
9. Change brand filter → map dims unfiltered markets
10. Toggle Connections On/Off → lines appear/disappear
11. Toggle Mode Count/Keys → bubbles resize and relabel
12. Search by text → map and list filter
13. Switch to Cards → cards show (with current filters)
14. Switch back to Map → map position preserved
15. Open Print Preview (Cmd+P) → map container hidden, prospect list visible

- [ ] **Step 4: Commit**

```bash
git add pages/pipeline-prospects.html
git commit -m "feat(map): add print styles for map view

Problem: Leaflet maps don't render in print/PDF
Solution: Hide map container in print, keep prospect list visible"
```

---

## Self-Review

### Spec Coverage

| Spec Section | Task |
|---|---|
| 1.1 Add coordinates to markets table | Task 1 |
| 1.2 Seed coordinates | Task 2 |
| 1.3 New market form (lat/lng optional) | Already works — CREATE TABLE allows NULL |
| 2.1 View toggle (Cards/Table/Map) | Task 4 |
| 2.2 New file: prospect-map.js | Task 5 |
| 2.3 Leaflet via CDN | Task 4 |
| 3.1 Market cluster bubbles | Task 5 (renderMarketBubbles) |
| 3.2 Market popup on click | Task 5 (showMarketPopup) |
| 3.3 Connection lines | Task 5 (renderConnectionLines) |
| 3.4 Filter sync | Task 5 (toggleFilter calls, onMapBackgroundClick) |
| 3.5 Heat overlay toggle | Task 5 (ModeToggle, displayMode) |
| 3.6 Compact prospect list | Task 5 (renderMapProspectList) |
| 4 Map state persistence | Task 5 (saveMapState/loadMapState) |
| 5 CSP change | Task 4 |

### Placeholder Scan

No TBD, TODO, or "implement later" found. All code blocks are complete.

### Type Consistency

- `initProspectMap(containerId, markets, prospects)` — called in renderAll with `('mapContainer', MARKETS, filtered)` ✓
- `updateProspectMap(markets, prospects)` — called in renderAll with `(MARKETS, filtered)` ✓
- `destroyProspectMap()` — called in initProspectMap cleanup and sets `window._prospectMapInitialized = false` ✓
- `toggleFilter(type, val)` — called from prospect-map.js, exists on pipeline page at line 800 ✓
- `getFiltered()` — called from getCurrentFilteredProspects(), exists on pipeline page at line 535 ✓
- `openDealModal(prospectId)` — called from list "Deal" button, exists on pipeline page at line 811 ✓
- `escMap()` in prospect-map.js matches `esc()` behavior on pipeline page ✓
