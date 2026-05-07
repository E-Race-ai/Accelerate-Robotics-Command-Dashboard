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
// WHY: Off by default — connection lines between markets are noisy at national zoom.
// Sales reps can toggle them on via the map controls when needed.
let showConnections = false;
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

  // WHY: Fit bounds only on first init (no saved state) so user sees all markets.
  // When a cluster filter is active, fit to only the markets with filtered prospects
  // so the map zooms into the relevant region.
  if (!saved) {
    const activeMarketIds = new Set(prospects.map(p => p.market_id));
    const fitMarkets = activeMarketIds.size > 0 && activeMarketIds.size < markets.length
      ? markets.filter(m => activeMarketIds.has(m.id))
      : markets;
    fitToMarkets(fitMarkets);
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

  // WHY: Container was display:none while user was on Card/Table view, so Leaflet's
  // cached size is stale. Without this, tiles render at the wrong scale and markers
  // land in the wrong pixel positions on the second visit to map view.
  map.invalidateSize();

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

  // Build keyword → market_ids maps for brands and operators
  const brandMap = {};   // brand parent → { market_id: count }
  const operatorMap = {}; // operator → { market_id: count }

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
      " title="Toggle connection lines">Connections: Off</a>`;

      L.DomEvent.disableClickPropagation(container);

      container.querySelector('#connToggle').addEventListener('click', e => {
        e.preventDefault();
        showConnections = !showConnections;
        e.target.textContent = `Connections: ${showConnections ? 'On' : 'Off'}`;
        renderConnectionLines(
          Object.values(marketsById),
          getCurrentFilteredProspects()
        );
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
