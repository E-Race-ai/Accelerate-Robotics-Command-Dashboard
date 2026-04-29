// public/js/deals.js

// ── State ──────────────────────────────────────────────────────
let deals = [];
let view = 'kanban'; // 'kanban', 'table', or 'map'
let dealMap = null; // Leaflet map instance — lazy-initialized
// WHY: URL param ?stage=won&stage=deploying filters the view to specific stages (used by Deploy tab)
let stageFilter = null;

const STAGES = ['lead', 'qualified', 'site_walk', 'configured', 'proposed', 'negotiation', 'won', 'deploying', 'active', 'lost'];
// WHY: 'lost' lives outside the trail — losing a deal isn't a forward step. Every
// other stage maps to one pip, drawn left-to-right in pipeline order so the
// trail reads as "where is this deal in our funnel" at a glance.
const PIPELINE_TRAIL_STAGES = ['lead', 'qualified', 'site_walk', 'configured', 'proposed', 'negotiation', 'won', 'deploying', 'active'];
const STAGE_LABELS = {
  lead: 'Lead', qualified: 'Qualified', site_walk: 'Site Walk',
  configured: 'Configured', proposed: 'Proposed', negotiation: 'Negotiation',
  won: 'Won', deploying: 'Deploying', active: 'Active', lost: 'Lost'
};
const STAGE_COLORS = {
  lead: '#64748b', qualified: '#0891b2', site_walk: '#7c3aed',
  configured: '#0055ff', proposed: '#d97706', negotiation: '#f59e0b',
  won: '#16a34a', deploying: '#22c55e', active: '#059669', lost: '#dc2626'
};

// ── API ────────────────────────────────────────────────────────
async function fetchDeals() {
  const res = await fetch('/api/deals');
  if (!res.ok) {
    // WHY: 401 means the JWT cookie is missing or expired — redirect to login so the user can re-authenticate
    if (res.status === 401) {
      window.location.href = '/admin-login';
      return;
    }
    console.error(`GET /api/deals failed with ${res.status}`);
    deals = [];
    render();
    return;
  }
  deals = await res.json();
  render();
}

async function createDeal(data) {
  const res = await fetch('/api/deals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json();
    throw new Error(err.error);
  }
  await fetchDeals();
}

async function updateDealStage(id, stage) {
  await fetch(`/api/deals/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage }),
  });
  await fetchDeals();
}

// WHY: Called from kanban card "Move to..." dropdown — wraps updateDealStage with reset on cancel
async function moveDeal(id, newStage) {
  if (!newStage) return; // User selected the placeholder "Move to..." option
  await updateDealStage(id, newStage);
  // WHY: Celebrate closing a deal — visual reward reinforces pipeline momentum
  if (newStage === 'won' && typeof fireConfetti === 'function') {
    fireConfetti(document.getElementById('confettiCanvas'));
  }
}

// ── Render ──────────────────────────────────────────────────────
function render() {
  const q = document.getElementById('deal-search')?.value?.toLowerCase() || '';
  const filtered = deals.filter(d => {
    if (stageFilter && !stageFilter.includes(d.stage)) return false;
    if (!q) return true;
    return [d.name, d.facility_name, d.city, d.state, d.owner].filter(Boolean).join(' ').toLowerCase().includes(q);
  });

  renderStats(filtered);

  // Show/hide view containers
  document.getElementById('deal-kanban').classList.toggle('hidden', view !== 'kanban');
  document.getElementById('deal-table-wrap')?.classList.toggle('hidden', view !== 'table');
  document.getElementById('deal-map-wrap')?.classList.toggle('hidden', view !== 'map');

  if (view === 'kanban') renderKanban(filtered);
  else if (view === 'table') renderTable(filtered);
  else if (view === 'map') renderMap(filtered);

  // Update toggle button states
  for (const v of ['kanban', 'table', 'map']) {
    const btn = document.getElementById('view-' + v);
    if (!btn) continue;
    btn.classList.toggle('bg-blue-600', view === v);
    btn.classList.toggle('text-white', view === v);
    btn.classList.toggle('text-gray-500', view !== v);
  }
}

function renderStats(filtered) {
  const el = document.getElementById('deal-stats');
  if (!el) return;
  const stageCounts = {};
  STAGES.forEach(s => stageCounts[s] = 0);
  filtered.forEach(d => { if (stageCounts[d.stage] !== undefined) stageCounts[d.stage]++; });

  el.innerHTML = `
    <div class="brand-stat"><span class="brand-stat-val" data-counter="${filtered.length}">${filtered.length}</span><span class="brand-stat-lbl">Total</span></div>
    ${['lead', 'qualified', 'proposed', 'won', 'active'].map(s =>
      `<div class="brand-stat"><span class="brand-stat-val" data-counter="${stageCounts[s]}">${stageCounts[s]}</span><span class="brand-stat-lbl">${STAGE_LABELS[s]}</span></div>`
    ).join('')}
  `;

  // WHY: Re-run counters after dynamic stat rendering — brand.js auto-init fires only on DOMContentLoaded
  if (typeof initCounters === 'function') initCounters();
}

// WHY: Map stage keys to badge color classes for branded stage badges
const STAGE_BADGE_CLASSES = {
  lead: 'brand-badge brand-badge-blue',
  qualified: 'brand-badge brand-badge-cyan',
  site_walk: 'brand-badge brand-badge-purple',
  configured: 'brand-badge brand-badge-blue',
  proposed: 'brand-badge brand-badge-amber',
  negotiation: 'brand-badge brand-badge-amber',
  won: 'brand-badge brand-badge-green',
  deploying: 'brand-badge brand-badge-green',
  active: 'brand-badge brand-badge-green',
  lost: 'brand-badge brand-badge-amber'
};

// WHY: Probability color gradient — green for high confidence, amber for medium, red for low
function probColor(pct) {
  if (pct >= 70) return '#16a34a';
  if (pct >= 40) return '#f59e0b';
  return '#ef4444';
}

// WHY: Generate initials from a name for the avatar circle (e.g. "Eric Race" → "ER")
function initials(name) {
  if (!name) return '?';
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
}

// WHY: Format relative time for activity timestamps — "2d ago" is faster to scan than "4/20/2026"
function timeAgo(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins + 'm ago';
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return hrs + 'h ago';
  const days = Math.floor(hrs / 24);
  if (days < 30) return days + 'd ago';
  return Math.floor(days / 30) + 'mo ago';
}

function renderKanban(filtered) {
  const el = document.getElementById('deal-kanban');
  if (!el) return;
  // WHY: When stage-filtered (Deploy tab), show those stages; otherwise show pipeline stages only
  const pipelineStages = stageFilter
    ? stageFilter.filter(s => STAGES.includes(s))
    : ['lead', 'qualified', 'site_walk', 'configured', 'proposed', 'negotiation'];
  el.innerHTML = pipelineStages.map(stage => {
    const stageDeals = filtered.filter(d => d.stage === stage);
    // WHY: Sum MRR per column so pipeline value is visible at a glance
    const colMRR = stageDeals.reduce((sum, d) => sum + (Number(d.value_monthly) || 0), 0);
    return `
      <div class="kanban-col">
        <div class="kanban-header" style="border-top: 3px solid ${STAGE_COLORS[stage]}">
          <span>${STAGE_LABELS[stage]}</span>
          <div style="display:flex;align-items:center;gap:6px;">
            ${colMRR ? `<span style="font-size:0.65rem;color:${STAGE_COLORS[stage]};font-weight:700;">$${colMRR.toLocaleString()}</span>` : ''}
            <span class="kanban-count">${stageDeals.length}</span>
          </div>
        </div>
        <div class="kanban-cards">
          ${stageDeals.map(d => {
            const moveOptions = STAGES.filter(s => s !== stage && s !== 'lost')
              .map(s => `<option value="${s}">${STAGE_LABELS[s]}</option>`).join('');
            const prob = Number(d.close_probability) || 0;
            const keys = d.rooms_or_units ? Number(d.rooms_or_units) : null;
            const floors = d.facility_floors ? Number(d.facility_floors) : null;
            const elevators = d.elevator_count ? Number(d.elevator_count) : null;
            const hasStats = keys || floors || elevators;
            const actorShort = d.last_activity_actor ? d.last_activity_actor.split('@')[0] : '';
            const actLabel = ACTION_LABELS[d.last_activity_action] || '';

            // Stage-trail: pipeline-position visual ("step N of M"). Built once
            // per card so we don't repeat the indexOf in every interpolation.
            const stageIdx = PIPELINE_TRAIL_STAGES.indexOf(stage);
            const isLostStage = stage === 'lost';
            const trailTitle = isLostStage
              ? 'Deal lost'
              : `${STAGE_LABELS[stage]} — step ${stageIdx + 1} of ${PIPELINE_TRAIL_STAGES.length}`;
            const trailHtml = `
              <div class="deal-stage-trail${isLostStage ? ' is-lost' : ''}" title="${escapeHtml(trailTitle)}">
                ${PIPELINE_TRAIL_STAGES.map((s, i) => {
                  let cls = '';
                  if (!isLostStage && i < stageIdx) cls = 'passed';
                  else if (!isLostStage && i === stageIdx) cls = 'current';
                  const styleAttr = i === stageIdx ? `style="--current-stage-color:${STAGE_COLORS[s]};"` : '';
                  return `<span class="stage-dot ${cls}" ${styleAttr} title="${escapeHtml(STAGE_LABELS[s])}"></span>`;
                }).join('')}
              </div>`;

            return `
            <div class="deal-card brand-deal-card">
              <div class="brand-deal-stripe" style="background:linear-gradient(180deg, ${STAGE_COLORS[stage]}, ${STAGE_COLORS[stage]}88);"></div>
              <a href="/admin/deals/${d.id}#overview" style="text-decoration:none;color:inherit;">
                <div class="brand-deal-name">${escapeHtml(d.name)}</div>
                ${d.facility_brand ? `<div class="deal-brand-tag">${escapeHtml(d.facility_brand)}${d.facility_operator && d.facility_operator !== d.facility_brand ? ' · ' + escapeHtml(d.facility_operator) : ''}</div>` : ''}
                <div class="brand-deal-meta">
                  ${escapeHtml(d.facility_type || '')}${d.facility_type && (d.city || d.state) ? ' · ' : ''}${escapeHtml(d.city || '')}${d.state ? ', ' + escapeHtml(d.state) : ''}
                </div>

                ${d.value_monthly ? `<div class="brand-deal-arr">$${Number(d.value_monthly).toLocaleString()}/mo</div>` : ''}

                ${hasStats ? `
                <div class="deal-stats-grid">
                  ${keys ? `<div class="deal-stat-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg><span class="deal-stat-val">${keys}</span> keys</div>` : ''}
                  ${floors ? `<div class="deal-stat-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="2" width="16" height="20" rx="2"/><line x1="12" y1="6" x2="12" y2="6.01"/><line x1="12" y1="10" x2="12" y2="10.01"/><line x1="12" y1="14" x2="12" y2="14.01"/><line x1="12" y1="18" x2="12" y2="18.01"/></svg><span class="deal-stat-val">${floors}</span> floors</div>` : ''}
                  ${elevators ? `<div class="deal-stat-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="3" x2="12" y2="21"/><polyline points="8 8 6 10 8 12"/><polyline points="16 8 18 10 16 12"/></svg><span class="deal-stat-val">${elevators}</span> elevators</div>` : ''}
                  ${d.source ? `<div class="deal-stat-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg><span class="deal-stat-val" style="text-transform:capitalize;">${escapeHtml(d.source)}</span></div>` : ''}
                </div>` : ''}

                ${trailHtml}

                ${prob > 0 ? `
                <div class="deal-prob-bar">
                  <div class="deal-prob-track">
                    <div class="deal-prob-fill" style="width:${prob}%;background:${probColor(prob)};"></div>
                  </div>
                  <span class="deal-prob-pct" style="color:${probColor(prob)};">${prob}%</span>
                </div>` : ''}

                <div class="brand-deal-badges">
                  <span class="${STAGE_BADGE_CLASSES[stage] || 'brand-badge brand-badge-blue'}">${STAGE_LABELS[stage]}</span>
                  ${d.value_monthly && prob > 0 ? `<span class="brand-badge brand-badge-green">$${Math.round(Number(d.value_monthly) * prob / 100).toLocaleString()} wtd</span>` : ''}
                </div>

                ${d.decision_maker_name || d.gm_name ? `
                <div class="deal-contact">
                  <div class="deal-contact-avatar" style="background:${STAGE_COLORS[stage]};">
                    ${initials(d.decision_maker_name || d.gm_name)}
                  </div>
                  <div class="deal-contact-info">
                    <div class="deal-contact-name">${escapeHtml(d.decision_maker_name || d.gm_name)}</div>
                    ${d.decision_maker_title ? `<div class="deal-contact-title">${escapeHtml(d.decision_maker_title)}</div>` : d.gm_name ? `<div class="deal-contact-title">General Manager</div>` : ''}
                  </div>
                </div>` : ''}

                ${actLabel ? `
                <div class="deal-card-activity">
                  <span class="dot"></span>
                  <span>${escapeHtml(actorShort)} ${actLabel}</span>
                  ${d.last_activity_at ? `<span>· ${timeAgo(d.last_activity_at)}</span>` : ''}
                </div>` : ''}

                <div class="deal-owner">${escapeHtml(d.owner || 'Unassigned')}</div>
              </a>
              <div class="card-actions" onclick="event.stopPropagation()">
                <a href="/admin/deals/${d.id}#overview" class="card-action">Edit</a>
                <select class="card-move-select" onchange="moveDeal('${d.id}', this.value)">
                  <option value="">Move to...</option>
                  ${moveOptions}
                </select>
                <button class="card-action danger" onclick="deleteDeal('${d.id}', '${escapeHtml(d.name).replace(/'/g, "\\'")}')">Delete</button>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
    `;
  }).join('');
}

// WHY: Human-readable labels for activity actions — matches what the API stores
const ACTION_LABELS = {
  deal_created: 'created deal',
  stage_changed: 'moved stage',
  note_added: 'added note',
  contact_added: 'added contact',
  challenge_added: 'added challenge',
};

function formatActivity(d) {
  if (!d.last_activity_action) return '<span class="text-gray-300">—</span>';

  const actor = escapeHtml((d.last_activity_actor || '').split('@')[0]); // WHY: Show "eric" not full email — saves column width
  const action = ACTION_LABELS[d.last_activity_action] || escapeHtml(d.last_activity_action.replace(/_/g, ' '));

  // WHY: For stage changes, show the transition (e.g. "Lead → Qualified") so Eric sees at a glance what happened
  let extra = '';
  if (d.last_activity_action === 'stage_changed' && d.last_activity_detail) {
    try {
      const parsed = JSON.parse(d.last_activity_detail);
      if (parsed.from && parsed.to) {
        extra = ` <span class="text-gray-400">${STAGE_LABELS[parsed.from] || parsed.from} → ${STAGE_LABELS[parsed.to] || parsed.to}</span>`;
      }
    } catch { /* non-JSON detail, skip */ }
  }

  const when = d.last_activity_at ? new Date(d.last_activity_at).toLocaleDateString() : '';

  return `<div class="activity-snippet">
    <div class="text-xs"><span class="actor">${actor}</span> <span class="action">${action}</span>${extra}</div>
    ${when ? `<div class="when">${when}</div>` : ''}
  </div>`;
}

function renderTable(filtered) {
  const el = document.getElementById('deal-table-body');
  const emptyEl = document.getElementById('deal-table-empty');
  if (!el) return;

  if (filtered.length === 0) {
    el.innerHTML = '';
    emptyEl?.classList.remove('hidden');
    return;
  }
  emptyEl?.classList.add('hidden');

  el.innerHTML = filtered.map(d => {
    // WHY: Build <option> list with current stage selected — allows any stage, not just "next"
    const stageOptions = STAGES.map(s =>
      `<option value="${s}" ${s === d.stage ? 'selected' : ''}>${STAGE_LABELS[s]}</option>`
    ).join('');

    return `
    <tr class="border-t border-gray-50 hover:bg-gray-50 transition">
      <td class="px-4 py-3 font-semibold text-gray-400 text-xs">
        <a href="/admin/deals/${d.id}#overview" class="hover:text-blue-600 transition">${escapeHtml(d.id)}</a>
      </td>
      <td class="px-4 py-3 font-semibold text-gray-900">
        <a href="/admin/deals/${d.id}#overview" class="hover:text-blue-600 transition">${escapeHtml(d.name)}</a>
      </td>
      <td class="px-4 py-3">
        <select class="stage-select"
                style="background-color:${STAGE_COLORS[d.stage]}15;color:${STAGE_COLORS[d.stage]}"
                onchange="handleStageChange('${d.id}', this.value, this)">
          ${stageOptions}
        </select>
      </td>
      <td class="px-4 py-3 text-gray-500">${escapeHtml(d.city || '')}${d.state ? ', ' + escapeHtml(d.state) : (d.city ? '' : '—')}</td>
      <td class="px-4 py-3 text-gray-500 text-xs">${escapeHtml(d.owner || '—')}</td>
      <td class="px-4 py-3">${formatActivity(d)}</td>
      <td class="px-4 py-3 text-gray-400 text-xs">${d.updated_at ? new Date(d.updated_at).toLocaleDateString() : '—'}</td>
      <td class="px-4 py-3">
        <button onclick="deleteDeal('${d.id}', '${escapeHtml(d.name).replace(/'/g, "\\'")}')"
                class="text-gray-300 hover:text-red-500 transition" title="Delete deal">
          <svg width="16" height="16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/>
          </svg>
        </button>
      </td>
    </tr>
  `;}).join('');
}

async function deleteDeal(id, name) {
  if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
  const res = await fetch(`/api/deals/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to delete deal' }));
    alert(err.error);
    return;
  }
  await fetchDeals();
}

// WHY: Handles dropdown change — updates the deal stage via API and refreshes, with color feedback
async function handleStageChange(dealId, newStage, selectEl) {
  const origColor = selectEl.style.color;
  selectEl.style.opacity = '0.5';
  try {
    await updateDealStage(dealId, newStage);
    // WHY: Celebrate closing a deal from table view too
    if (newStage === 'won' && typeof fireConfetti === 'function') {
      fireConfetti(document.getElementById('confettiCanvas'));
    }
  } catch {
    selectEl.style.opacity = '1';
    selectEl.style.color = origColor;
  }
}

// ── Map view ──────────────────────────────────────────────────────
// WHY: Hardcoded coordinates for known deal cities — avoids external geocoding
// API calls. Covers all current deal locations plus common US hotel markets.
const CITY_COORDS = {
  'miami_fl': [25.7617, -80.1918],
  'sarasota_fl': [27.3364, -82.5307],
  'san ramon_ca': [37.7799, -121.9780],
  'lafayette_ca': [37.8858, -122.1180],
  'berkeley_ca': [37.8716, -122.2727],
  'sacramento_ca': [38.5816, -121.4944],
  'los angeles_ca': [34.0522, -118.2437],
  'san francisco_ca': [37.7749, -122.4194],
  'new york_ny': [40.7128, -74.0060],
  'chicago_il': [41.8781, -87.6298],
  'houston_tx': [29.7604, -95.3698],
  'dallas_tx': [32.7767, -96.7970],
  'atlanta_ga': [33.7490, -84.3880],
  'orlando_fl': [28.5383, -81.3792],
  'denver_co': [39.7392, -104.9903],
  'seattle_wa': [47.6062, -122.3321],
  'boston_ma': [42.3601, -71.0589],
  'nashville_tn': [36.1627, -86.7816],
  'las vegas_nv': [36.1699, -115.1398],
  'phoenix_az': [33.4484, -112.0740],
  'san diego_ca': [32.7157, -117.1611],
  'tampa_fl': [27.9506, -82.4572],
  'fort lauderdale_fl': [26.1224, -80.1373],
  'charlotte_nc': [35.2271, -80.8431],
  'minneapolis_mn': [44.9778, -93.2650],
  'portland_or': [45.5152, -122.6784],
  'austin_tx': [30.2672, -97.7431],
  'san jose_ca': [37.3382, -121.8863],
  'washington_dc': [38.9072, -77.0369],
  'philadelphia_pa': [39.9526, -75.1652],
};

function getCityKey(city, state) {
  return (city + '_' + state).toLowerCase().trim();
}

function createStageIcon(stage) {
  const color = STAGE_COLORS[stage] || '#64748b';
  // WHY: Custom SVG map pin with drop shadow — bold colors pop on the Voyager tiles.
  return L.divIcon({
    className: 'deal-marker',
    html: `<svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <filter id="ds-${stage}" x="-20%" y="-10%" width="140%" height="130%">
          <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="#000" flood-opacity="0.25"/>
        </filter>
      </defs>
      <path d="M16 1C7.72 1 1 7.72 1 16c0 12 15 25 15 25s15-13 15-25C31 7.72 24.28 1 16 1z"
            fill="${color}" filter="url(#ds-${stage})" stroke="white" stroke-width="1.5"/>
      <circle cx="16" cy="16" r="6" fill="white"/>
    </svg>`,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -38],
  });
}

function renderMap(filtered) {
  const container = document.getElementById('deal-map');
  if (!container) return;

  // WHY: Leaflet is loaded from CDN — guard against it not being ready yet
  if (typeof L === 'undefined') {
    container.innerHTML = '<p style="padding:40px;text-align:center;color:#9ca3af">Loading map library…</p>';
    return;
  }

  // WHY: Leaflet needs a visible container with real dimensions to render tiles.
  // Use requestAnimationFrame to ensure the browser has reflowed after removing
  // the 'hidden' class, THEN initialize. Without this, the container reports 0×0
  // and tiles never load.
  requestAnimationFrame(() => {
    initMap(container, filtered);
  });
}

function initMap(container, filtered) {
  if (!dealMap) {
    // WHY: Center on continental US with zoom level that shows all 48 states
    dealMap = L.map('deal-map', { scrollWheelZoom: true }).setView([39.5, -98.5], 4);
    // WHY: CartoDB Voyager tiles — clean, colorful, modern map style with vibrant colors.
    // Free, no API key, no referer issues.
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '&copy; <a href="https://openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/attributions">CARTO</a>',
    }).addTo(dealMap);
  }

  // WHY: Force Leaflet to recalculate container size — critical after unhiding
  dealMap.invalidateSize();

  // Clear existing markers
  dealMap.eachLayer(layer => {
    if (layer instanceof L.Marker) dealMap.removeLayer(layer);
  });

  // WHY: Group deals at the same city so we can offset overlapping markers
  const locationGroups = {};

  for (const d of filtered) {
    if (!d.city || !d.state) continue;
    const key = getCityKey(d.city, d.state);
    const coords = CITY_COORDS[key];
    if (!coords) continue;
    if (!locationGroups[key]) locationGroups[key] = { coords, deals: [] };
    locationGroups[key].deals.push(d);
  }

  const allCoords = [];

  for (const [, group] of Object.entries(locationGroups)) {
    const { coords, deals: groupDeals } = group;
    groupDeals.forEach((d, i) => {
      // WHY: Offset multiple deals at same location so pins don't stack directly on top of each other
      const offsetLat = i * 0.008;
      const offsetLng = i * 0.012;
      const pos = [coords[0] + offsetLat, coords[1] + offsetLng];
      allCoords.push(pos);

      const marker = L.marker(pos, { icon: createStageIcon(d.stage) }).addTo(dealMap);
      const stageColor = STAGE_COLORS[d.stage] || '#64748b';
      marker.bindPopup(`
        <div class="map-popup">
          <div class="popup-name">${escapeHtml(d.name)}</div>
          <div class="popup-meta">${escapeHtml(d.facility_type || 'Hotel')} &middot; ${escapeHtml(d.city || '')}${d.state ? ', ' + escapeHtml(d.state) : ''}</div>
          <span class="popup-stage" style="background:${stageColor}20;color:${stageColor}">${STAGE_LABELS[d.stage] || d.stage}</span>
          ${d.value_monthly ? `<div class="popup-meta">$${Number(d.value_monthly).toLocaleString()}/mo</div>` : ''}
          <div class="popup-meta">${escapeHtml(d.owner || 'Unassigned')}</div>
          <a href="/admin/deals/${d.id}#overview" class="popup-link">View Deal &rarr;</a>
        </div>
      `);
    });
  }

  // WHY: Auto-fit map bounds to show all deal markers with padding
  if (allCoords.length > 0) {
    dealMap.fitBounds(allCoords, { padding: [50, 50], maxZoom: 12 });
  }

  // WHY: Second invalidateSize after markers/bounds are set — Leaflet
  // sometimes miscalculates tile positions on first paint
  setTimeout(() => dealMap.invalidateSize(), 250);
}

// ── Escape helper ───────────────────────────────────────────────
// WHY: User-supplied data (deal names, cities, owners) goes into innerHTML — must escape to prevent XSS
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// ── Modal ──────────────────────────────────────────────────────
function openNewDealModal() {
  document.getElementById('new-deal-modal').classList.remove('hidden');
}
function closeNewDealModal() {
  document.getElementById('new-deal-modal').classList.add('hidden');
  document.getElementById('new-deal-form').reset();
}

// ── Init ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  // WHY: Show dashboard immediately — auth is disabled server-side, so
  // checkAuth() returns null on stale/missing JWT cookies. Guarding on
  // it blocks all event listeners and leaves the page dead.
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');

  const user = typeof checkAuth === 'function' ? await checkAuth() : null;
  if (user?.email) {
    document.getElementById('adminEmail').textContent = user.email;
  }

  // WHY: Read stage filter from URL — used by the Deploy tab as well as the
  // Command Center stat tiles + bottleneck callouts that link to ?stage=lead,
  // ?stage=proposed, etc. We adapt the heading to whatever stages were passed
  // instead of hard-coding "Deployments" for every filter.
  const urlStages = new URLSearchParams(window.location.search).getAll('stage')
    .filter(s => STAGES.includes(s));
  if (urlStages.length > 0) {
    stageFilter = urlStages;
    view = 'table'; // Table view reads better for a flat filtered list
    const heading = document.querySelector('h1.headline');
    const subtitle = document.querySelector('h1.headline + p');
    // Specific aliases for known multi-stage groupings; otherwise derive
    // from the stage labels. These mirror the Command Center stat tiles —
    // each tile counts a stage bundle and links here with the matching ?stage= set.
    const has = s => urlStages.includes(s);
    const isDeployBundle = urlStages.length >= 2 && has('won') && has('deploying') && has('active');
    const isQualifiedBundle = urlStages.length >= 2 && has('qualified') && has('site_walk') && has('configured');
    const isProposedBundle = urlStages.length >= 2 && has('proposed') && has('negotiation');
    if (isDeployBundle) {
      if (heading) heading.textContent = 'Deployments';
      if (subtitle) subtitle.textContent = 'Won deals, active deployments, and go-live tracking';
    } else if (isQualifiedBundle) {
      if (heading) heading.textContent = 'Qualified deals';
      if (subtitle) subtitle.textContent = 'Qualified, site walk, and configured stages';
    } else if (isProposedBundle) {
      if (heading) heading.textContent = 'Proposed deals';
      if (subtitle) subtitle.textContent = 'Proposed and negotiation stages';
    } else if (urlStages.length === 1) {
      const label = STAGE_LABELS[urlStages[0]] || urlStages[0];
      if (heading) heading.textContent = `${label} deals`;
      if (subtitle) subtitle.textContent = `All deals currently in the ${label.toLowerCase()} stage`;
    } else {
      const labels = urlStages.map(s => STAGE_LABELS[s] || s).join(' · ');
      if (heading) heading.textContent = `Filtered: ${labels}`;
      if (subtitle) subtitle.textContent = `Deals across ${urlStages.length} stages`;
    }
  }

  // WHY: Register event listeners BEFORE async data loading so they're
  // always wired up even if fetchDeals() fails
  document.getElementById('deal-search')?.addEventListener('input', render);
  document.getElementById('view-kanban')?.addEventListener('click', () => { view = 'kanban'; render(); });
  document.getElementById('view-table')?.addEventListener('click', () => { view = 'table'; render(); });
  document.getElementById('view-map')?.addEventListener('click', () => { view = 'map'; render(); });

  document.getElementById('new-deal-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating…';
    const data = {
      name: form.name.value,
      source: form.source.value || null,
      owner: form.owner.value || null,
      notes: form.notes.value || null,
    };
    try {
      await createDeal(data);
      closeNewDealModal();
    } catch (err) {
      alert(err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Create Deal';
    }
  });

  try {
    await fetchDeals();
  } catch (e) {
    console.error('Failed to load deals:', e);
    // WHY: Still call render() so the user sees empty columns + stats instead of a blank page
    render();
  }
});
