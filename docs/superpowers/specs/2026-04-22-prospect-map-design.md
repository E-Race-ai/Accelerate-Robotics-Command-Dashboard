# Interactive Prospect Map — Design Spec

**Date:** 2026-04-22
**Status:** Approved
**Author:** Eric Race + Claude

## Goal

Add an interactive map view to the Prospect Pipeline page as a third view alongside Cards and Table. The map visualizes market locations, prospect density, cross-market connections, and territory coverage using Leaflet + OpenStreetMap tiles.

## Context

The Prospect Pipeline page (`pages/pipeline-prospects.html`) currently shows 66 hotel prospects across 14 markets in card and table views. These views are great for individual prospect data but give no sense of geographic spread, territory gaps, or cross-market relationships. The map view fills this gap — it's a strategic planning lens over the same data.

**Why this matters:** Accelerate's operational footprint decisions depend on understanding market clustering, geographic adjacency, and operator/brand overlap across regions. A visual map makes these patterns obvious at a glance instead of requiring mental assembly from a list.

---

## 1. Database Change

### 1.1 Add coordinates to `markets` table

Add two columns to the `markets` table:

| Column | Type | Constraints | Notes |
|---|---|---|---|
| lat | REAL | | Latitude of market center |
| lng | REAL | | Longitude of market center |

These are added via `ALTER TABLE` with defaults (existing `CREATE TABLE IF NOT EXISTS` also updated for new databases).

### 1.2 Seed coordinates

Update the seeder to populate coordinates for all 14 existing markets:

| Market | Lat | Lng |
|---|---|---|
| San Francisco | 37.7749 | -122.4194 |
| Oakland | 37.8044 | -122.2712 |
| San Jose | 37.3382 | -121.8863 |
| Sacramento | 38.5816 | -121.4944 |
| Napa | 38.2975 | -122.2869 |
| Beverly Hills | 34.0736 | -118.4004 |
| Santa Monica | 34.0195 | -118.4912 |
| West Hollywood | 34.0900 | -118.3617 |
| San Diego | 32.7157 | -117.1611 |
| Coronado | 32.6859 | -117.1831 |
| Miami Beach | 25.7907 | -80.1300 |
| Fort Lauderdale | 26.1224 | -80.1373 |
| Sarasota | 27.3364 | -82.5307 |
| Dallas | 32.7767 | -96.7970 |

The seeder runs an `UPDATE markets SET lat = ?, lng = ? WHERE id = ?` for each market if `lat` is NULL.

### 1.3 New market form

When creating a new market via the Add Market form, lat/lng is optional. If not provided, the map won't show that market until coordinates are added (via API PATCH). A future enhancement could auto-geocode from the market name.

---

## 2. Frontend Architecture

### 2.1 View toggle

The existing Cards/Table toggle gains a third option: **Map**. The toggle buttons become: `Cards | Table | Map`.

When Map is active:
- Hide the card grid / table
- Show `#mapContainer` (Leaflet map, 60% viewport height) + `#mapProspectList` (compact prospect list, remaining space)
- Existing filters (cluster, brand class) and search still apply

### 2.2 New file: `public/js/prospect-map.js`

A self-contained module that owns the Leaflet map. Exports:

- `initProspectMap(containerId, markets, prospects)` — creates the Leaflet map, adds market markers, draws connection lines, renders the prospect list
- `updateProspectMap(markets, prospects)` — re-renders markers and list when filters change
- `destroyProspectMap()` — cleanup when switching away from map view

The map is initialized lazily on first Map tab click (don't load tiles until the user actually wants the map).

### 2.3 Leaflet via CDN

Load from unpkg.com (already whitelisted in CSP):

```html
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9/dist/leaflet.css">
<script src="https://unpkg.com/leaflet@1.9/dist/leaflet.js"></script>
```

These are loaded with `defer` or dynamically on first map view.

---

## 3. Map Features

### 3.1 Market cluster bubbles

Each market with coordinates renders as a circular marker:

- **Size** — proportional to prospect count in that market. Min 28px (1 prospect), max 56px (20+ prospects). Formula: `28 + Math.min(count * 3, 28)` pixels.
- **Color** — uses the market's `color` field from the database
- **Label** — prospect count displayed as white bold text centered in the circle
- **Name** — market name displayed below the bubble as a permanent tooltip
- **Border** — 3px white border for visual separation from the map

### 3.2 Market popup on click

Clicking a market bubble shows a Leaflet popup with:

- Market name (bold)
- Prospect count
- Total keys across all prospects in market
- Average floor count
- Brand class breakdown (e.g., "3 luxury, 2 chain, 1 independent")
- "Show prospects" link that filters the list below to this market

### 3.3 Connection lines

Dashed polylines connecting markets that share operators or brand parents:

- **Computation** — client-side, on data load. For each prospect's `brand` field, extract parent names (split by `/`, trim). For each prospect's `operator` field, use as-is. Build a map of keyword → list of market_ids. Any keyword appearing in 2+ markets creates a connection.
- **Line style** — dashed (`dashArray: '6 4'`), colored by type (brand connections = blue, operator connections = orange), opacity 0.3
- **Thickness** — scales with connection count: 1 shared entity = 1.5px, 2 = 2.5px, 3+ = 3.5px
- **Hover tooltip** — shows which brands/operators are shared between the two markets (e.g., "Marriott (2 prospects), Aimbridge (1 prospect)")
- **Toggle control** — small button on the map: "Connections: On/Off". Default: on.

### 3.4 Filter sync

Two-way sync between map and pipeline filters:

**Filters → Map:**
- When cluster or brand_class filters change, call `updateProspectMap()` with the filtered data
- Filtered-out markets render at 20% opacity (dimmed, not hidden) so geographic context is preserved
- Filtered-in markets render at full opacity with updated counts
- Connection lines only show between active (non-dimmed) markets

**Map → Filters:**
- Click a market bubble → calls the existing `toggleFilter('cluster', marketCluster)` function to set the cluster filter
- This automatically updates the Cards/Table views too if the user switches back
- Click the map background (not a marker) → resets cluster filter to "All"

**Map → List:**
- Click a market bubble → scrolls the prospect list below to that market's prospects, highlights them
- The list always shows all prospects matching current filters, grouped by market

### 3.5 Heat overlay toggle

A toggle button on the map control area: "Keys" mode vs "Count" mode.

- **Count mode (default)** — bubbles sized and labeled by prospect count
- **Keys mode** — bubbles sized and labeled by total keys in market (e.g., "4.2K"). Size formula: `28 + Math.min(totalKeys / 100, 28)` pixels. This shows where the biggest revenue opportunities are.

### 3.6 Compact prospect list

Below the map, a scrollable list of prospects matching current filters:

- Compact single-row format: monogram badge, hotel name, keys/floors, brand class pill, market name (colored)
- Grouped by market with a thin market header
- Click a prospect row → pans the map to that market and opens the market popup
- Same "Convert to Deal" button as in Cards/Table views
- Shows AI research badge if `source === 'ai_research'`

---

## 4. Map State Persistence

- Map center and zoom level persist in `sessionStorage` (key: `prospectMapState`)
- When switching from Map to Cards and back, the map doesn't reset to default view
- Default initial view: fits all markets with coordinates (`map.fitBounds()`)

---

## 5. CSP Change

Add OSM tile server to the Helmet CSP in `src/server.js`:

```javascript
imgSrc: ["'self'", "data:", "https:", "http:", "https://tile.openstreetmap.org"]
```

Note: `https:` is already in imgSrc (permissive), so OSM tiles may already work. The explicit entry is for documentation/defense-in-depth.

---

## 6. File Inventory

| File | Action | Responsibility |
|---|---|---|
| `src/db/database.js` | Modify | Add `lat` and `lng` columns to markets CREATE TABLE |
| `src/db/seed-prospects.js` | Modify | Add coordinate seeding for 14 markets |
| `data/seed-prospects.json` | Modify | Add lat/lng to each market entry |
| `public/js/prospect-map.js` | Create | Leaflet map module: markers, connections, popups, list, sync |
| `pages/pipeline-prospects.html` | Modify | Add Map toggle, map container, list container, Leaflet CDN links |
| `src/server.js` | Modify | Add OSM tile server to CSP imgSrc (if needed) |

---

## 7. Out of Scope

- Per-prospect geocoding (addresses → lat/lng) — market-level is sufficient for now
- Map on the Command Center page — could be added later, reusing `prospect-map.js`
- Drawing custom territory boundaries or polygons
- Routing/distance calculations between markets
- Mobile-optimized map touch gestures (desktop-first)
- Offline tile caching
- 3D/globe visualization
