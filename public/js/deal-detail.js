// public/js/deal-detail.js
// Deal detail page — loads a single deal, its facility, activities, and renders
// the full detail view with stage bar, facility profile, challenges, contacts, and timeline.

const STAGES = ['lead', 'qualified', 'site_walk', 'configured', 'proposed', 'negotiation', 'won', 'deploying', 'active', 'lost'];
const STAGE_LABELS = {
  lead: 'Lead', qualified: 'Qualified', site_walk: 'Site Walk',
  configured: 'Configured', proposed: 'Proposed', negotiation: 'Negotiation',
  won: 'Won', deploying: 'Deploying', active: 'Active', lost: 'Lost',
};
const STAGE_COLORS = {
  lead: '#64748b', qualified: '#0891b2', site_walk: '#7c3aed',
  configured: '#0055ff', proposed: '#d97706', negotiation: '#f59e0b',
  won: '#16a34a', deploying: '#22c55e', active: '#059669', lost: '#dc2626',
};
const CHALLENGE_COLORS = {
  cleaning: '#0891b2', delivery: '#7c3aed', transport: '#d97706',
  security: '#dc2626', disinfection: '#059669', mobility: '#0055ff',
  guidance: '#f59e0b', outdoor: '#16a34a', inventory: '#64748b',
};

// WHY: XSS safety — all user-supplied content is passed through escapeHtml before
// being injected into innerHTML. This matches the pattern in src/services/email.js.
function escapeHtml(str) {
  if (str == null) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

let deal = null;
let facility = null;
let activities = [];

// ── Data loading ───────────────────────────────────────────────
async function loadDeal() {
  const id = window.location.pathname.split('/').pop();
  const res = await fetch(`/api/deals/${id}`);
  if (!res.ok) return (window.location.href = '/admin/deals');
  deal = await res.json();

  if (deal.facility_id) {
    const fRes = await fetch(`/api/facilities/${deal.facility_id}`);
    if (fRes.ok) facility = await fRes.json();
  }

  const actRes = await fetch(`/api/deals/${id}/activities`);
  // WHY: activities endpoint may 404 if deal has no activity yet — treat failure as empty
  activities = actRes.ok ? await actRes.json() : [];

  renderAll();
}

// ── Mutations ──────────────────────────────────────────────────
async function advanceStage(newStage) {
  await fetch(`/api/deals/${deal.id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stage: newStage }),
  });
  await loadDeal();
}

async function addChallenge(data) {
  if (!facility) return;
  await fetch(`/api/facilities/${facility.id}/challenges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  await loadDeal();
}

async function addContact(data) {
  if (!facility) return;
  await fetch(`/api/facilities/${facility.id}/contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  await loadDeal();
}

// ── Render orchestration ───────────────────────────────────────
function renderAll() {
  renderHeader();
  renderStageBar();
  renderFacility();
  renderChallenges();
  renderContacts();
  renderTimeline();
  renderNotes();
}

// ── Header ─────────────────────────────────────────────────────
function renderHeader() {
  const el = document.getElementById('deal-header');
  if (!el) return;
  el.innerHTML = `
    <div class="flex items-center gap-4 flex-wrap">
      <h1 class="text-2xl font-bold headline text-gray-900">${escapeHtml(deal.name)}</h1>
      <span class="px-3 py-1 rounded-lg text-xs font-bold bg-gray-100 text-gray-500">${escapeHtml(deal.id)}</span>
      <span class="px-3 py-1 rounded-lg text-xs font-bold"
            style="background:${STAGE_COLORS[deal.stage]}20;color:${STAGE_COLORS[deal.stage]}">
        ${STAGE_LABELS[deal.stage] || escapeHtml(deal.stage)}
      </span>
    </div>
    <p class="text-sm text-gray-400 mt-1">
      ${escapeHtml(deal.owner || 'Unassigned')}
      ${deal.source ? ' &middot; ' + escapeHtml(deal.source) : ''}
      ${deal.value_monthly ? ' &middot; $' + Number(deal.value_monthly).toLocaleString() + '/mo' : ''}
    </p>
  `;
}

// ── Stage bar ──────────────────────────────────────────────────
function renderStageBar() {
  const el = document.getElementById('stage-bar');
  if (!el) return;

  // WHY: Show pipeline stages only; 'lost' is an outcome reachable from any stage
  // and doesn't fit linearly. A separate 'Mark Lost' action would be the right UI
  // for that — the bar shows forward progression only.
  const pipelineStages = ['lead', 'qualified', 'site_walk', 'configured', 'proposed', 'negotiation', 'won', 'deploying', 'active'];
  const currentIdx = pipelineStages.indexOf(deal.stage);

  el.innerHTML = pipelineStages.map((s, i) => {
    const isCurrent = s === deal.stage;
    const isPast = currentIdx >= 0 && i < currentIdx;
    const dotColor = isCurrent ? STAGE_COLORS[s] : (isPast ? '#16a34a' : '#e2e8f0');
    const textColor = isCurrent || isPast ? (isCurrent ? STAGE_COLORS[s] : '#16a34a') : '#94a3b8';
    // WHY: Only allow advancing one step at a time — skipping stages loses audit trail
    const clickable = i === currentIdx + 1 && deal.stage !== 'lost';

    return `
      <div class="stage-step ${clickable ? 'cursor-pointer hover:opacity-80' : ''}"
           ${clickable ? `onclick="advanceStage('${s}')" title="Advance to ${STAGE_LABELS[s]}"` : ''}>
        <div class="stage-dot"
             style="background:${dotColor};${isCurrent ? 'box-shadow:0 0 0 4px ' + STAGE_COLORS[s] + '30' : ''}"></div>
        <span class="stage-label" style="color:${textColor}">${STAGE_LABELS[s]}</span>
      </div>
      ${i < pipelineStages.length - 1
        ? `<div class="stage-line" style="background:${isPast ? '#16a34a' : '#e2e8f0'}"></div>`
        : ''}
    `;
  }).join('');
}

// ── Facility profile ───────────────────────────────────────────
function renderFacility() {
  const el = document.getElementById('facility-card');
  if (!el) return;

  if (!facility) {
    el.innerHTML = '<p class="text-gray-400 text-sm">No facility linked to this deal</p>';
    return;
  }

  // WHY: surfaces is stored as a JSON string in SQLite — parse before display
  let surfaceList = '-';
  if (facility.surfaces) {
    try { surfaceList = JSON.parse(facility.surfaces).join(', '); } catch { surfaceList = facility.surfaces; }
  }

  const fields = [
    ['Type', facility.type],
    ['Location', [facility.city, facility.state].filter(Boolean).join(', ') || '-'],
    ['Floors', facility.floors || '-'],
    ['Rooms / Units', facility.rooms_or_units || '-'],
    ['Total Sqft', facility.sqft_total ? Number(facility.sqft_total).toLocaleString() : '-'],
    ['Elevators', [facility.elevator_count, facility.elevator_brand].filter(Boolean).join(' ') || '-'],
    ['Elevator Type', facility.elevator_type || '-'],
    ['Surfaces', surfaceList],
    ['WiFi', facility.wifi_available ? 'Yes' : 'No'],
    ['Operator', facility.operator || '-'],
    ['Brand', facility.brand || '-'],
    ['GM', facility.gm_name || '-'],
    ['GM Email', facility.gm_email
      ? `<a href="mailto:${escapeHtml(facility.gm_email)}" class="text-blue-600 hover:underline">${escapeHtml(facility.gm_email)}</a>`
      : '-'],
    ['Engineering Contact', facility.eng_name || '-'],
  ];

  el.innerHTML = `
    <h4 class="text-base font-bold text-gray-900 mb-4">${escapeHtml(facility.name)}</h4>
    <div class="facility-grid">
      ${fields.map(([label, val]) => `
        <div>
          <span class="text-xs text-gray-400 uppercase tracking-wide font-semibold">${label}</span>
          <span class="block text-sm font-medium text-gray-700 mt-0.5">${val}</span>
        </div>
      `).join('')}
    </div>
  `;
}

// ── Challenges ─────────────────────────────────────────────────
function renderChallenges() {
  const el = document.getElementById('challenges-list');
  if (!el) return;
  const challenges = facility?.challenges || [];

  if (!challenges.length) {
    el.innerHTML = '<p class="text-gray-400 text-sm">No operational challenges defined yet</p>';
    return;
  }

  el.innerHTML = challenges.map(c => `
    <div class="challenge-item">
      <span class="category-badge"
            style="background:${CHALLENGE_COLORS[c.category] || '#64748b'}20;color:${CHALLENGE_COLORS[c.category] || '#64748b'}">
        ${escapeHtml(c.category)}
      </span>
      <p class="text-sm text-gray-700 mt-1">${escapeHtml(c.description)}</p>
      <div class="flex flex-wrap gap-4 mt-2 text-xs text-gray-400">
        ${c.priority ? `<span>Priority: <strong class="text-gray-600">${escapeHtml(c.priority)}</strong></span>` : ''}
        ${c.current_cost_monthly ? `<span>Cost: <strong class="text-gray-600">$${Number(c.current_cost_monthly).toLocaleString()}/mo</strong></span>` : ''}
        ${c.area_sqft ? `<span>Area: <strong class="text-gray-600">${Number(c.area_sqft).toLocaleString()} sqft</strong></span>` : ''}
      </div>
    </div>
  `).join('');
}

// ── Contacts ───────────────────────────────────────────────────
function renderContacts() {
  const el = document.getElementById('contacts-list');
  if (!el) return;
  const contacts = facility?.contacts || [];

  if (!contacts.length) {
    el.innerHTML = '<p class="text-gray-400 text-sm">No contacts yet</p>';
    return;
  }

  el.innerHTML = contacts.map(c => `
    <div class="contact-item">
      <div class="flex items-center flex-wrap gap-2">
        <strong class="text-sm text-gray-900">${escapeHtml(c.name)}</strong>
        ${c.title ? `<span class="text-xs text-gray-400">— ${escapeHtml(c.title)}</span>` : ''}
        ${c.role ? `<span class="contact-role">${escapeHtml(c.role.replace(/_/g, ' '))}</span>` : ''}
      </div>
      <div class="flex flex-wrap items-center gap-3 mt-1">
        ${c.email ? `<a href="mailto:${escapeHtml(c.email)}" class="text-xs text-blue-600 hover:underline">${escapeHtml(c.email)}</a>` : ''}
        ${c.phone ? `<span class="text-xs text-gray-400">${escapeHtml(c.phone)}</span>` : ''}
      </div>
    </div>
  `).join('');
}

// ── Activity timeline ──────────────────────────────────────────
function renderTimeline() {
  const el = document.getElementById('activity-timeline');
  if (!el) return;

  if (!activities.length) {
    el.innerHTML = '<p class="text-gray-400 text-sm">No activity yet</p>';
    return;
  }

  el.innerHTML = activities.map(a => {
    // WHY: detail may be a JSON string (from server) or a plain string — handle both
    let detailText = '';
    if (a.detail) {
      try {
        const parsed = JSON.parse(a.detail);
        if (parsed.from && parsed.to) {
          detailText = `${STAGE_LABELS[parsed.from] || parsed.from} → ${STAGE_LABELS[parsed.to] || parsed.to}`;
        } else {
          detailText = JSON.stringify(parsed);
        }
      } catch {
        detailText = a.detail;
      }
    }

    return `
      <div class="activity-item">
        <div class="activity-dot"></div>
        <div>
          <span class="text-xs text-gray-400">${new Date(a.created_at).toLocaleString()}</span>
          <p class="text-sm text-gray-700">
            <strong>${escapeHtml(a.actor)}</strong>
            ${escapeHtml(a.action.replace(/_/g, ' '))}
          </p>
          ${detailText ? `<p class="text-xs text-gray-400 mt-0.5">${escapeHtml(detailText)}</p>` : ''}
        </div>
      </div>
    `;
  }).join('');
}

// ── Notes ──────────────────────────────────────────────────────
function renderNotes() {
  const el = document.getElementById('notes-content');
  if (!el) return;
  el.textContent = deal.notes || 'No notes';
}

// ── Modals ─────────────────────────────────────────────────────
function openChallengeModal() {
  document.getElementById('challenge-modal').classList.remove('hidden');
}
function closeChallengeModal() {
  document.getElementById('challenge-modal').classList.add('hidden');
  document.getElementById('challenge-form').reset();
}
function openContactModal() {
  document.getElementById('contact-modal').classList.remove('hidden');
}
function closeContactModal() {
  document.getElementById('contact-modal').classList.add('hidden');
  document.getElementById('contact-form').reset();
}

// ── Init ───────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const user = await checkAuth();
  if (!user) return (window.location.href = '/admin-login');

  document.getElementById('loading').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  document.getElementById('adminEmail').textContent = user.email;

  await loadDeal();

  document.getElementById('challenge-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    await addChallenge({
      category: form.category.value,
      description: form.description.value,
      priority: form.priority.value || 'medium',
      current_cost_monthly: form.current_cost_monthly.value ? Number(form.current_cost_monthly.value) : null,
      area_sqft: form.area_sqft.value ? Number(form.area_sqft.value) : null,
    });
    closeChallengeModal();
  });

  document.getElementById('contact-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    await addContact({
      name: form.contact_name.value,
      title: form.title.value || null,
      email: form.email.value || null,
      phone: form.phone.value || null,
      role: form.role.value || null,
    });
    closeContactModal();
  });
});
