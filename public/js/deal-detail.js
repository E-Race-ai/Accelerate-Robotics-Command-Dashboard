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

// WHY: Map deal IDs to their repo slugs so we can link to proposal pages served from /repos/{slug}/pages/
const DEAL_REPO_MAP = {
  'OPP-001': 'accelerate-thesis-hotel',
  'OPP-002': 'accelerate-moore-miami',
  'OPP-003': 'accelerate-art-ovation',
  'OPP-004': 'accelerate-san-ramon-marriott',
  'OPP-005': 'accelerate-lafayette-park',
  'OPP-006': 'accelerate-claremont-resort',
  'OPP-007': 'accelerate-kimpton-sawyer',
  'OPP-008': 'accelerate-citizen-hotel',
  'OPP-009': 'accelerate-westin-sacramento',
};

// WHY: Each proposal type has an icon, label, and description for the card grid
const PROPOSAL_TYPES = [
  { file: 'proposal-interactive.html', label: 'Interactive Proposal', desc: 'Fleet configurator with ROI calculator', icon: '⚡', color: '#7c3aed' },
  { file: 'proposal.html', label: 'Full Proposal', desc: 'Print-ready executive proposal', icon: '📄', color: '#0055ff' },
  { file: 'onepager.html', label: 'One-Pager', desc: 'Single-page overview for decision makers', icon: '📋', color: '#0891b2' },
  { file: 'site-profile.html', label: 'Site Profile', desc: 'Facility assessment and floor plans', icon: '🏢', color: '#16a34a' },
];

// WHY: Moore Miami has extra pages beyond the standard set
const EXTRA_PAGES = {
  'accelerate-moore-miami': [
    { file: 'intelligence-platform.html', label: 'Intelligence Platform', desc: 'AI-powered operations brain', icon: '🧠', color: '#d97706' },
    { file: 'member-intel.html', label: 'Member Intelligence', desc: 'VIP recognition and personalization', icon: '👤', color: '#db2777' },
    { file: 'ops-chatbot.html', label: 'Ops Chatbot', desc: 'Staff command interface', icon: '💬', color: '#059669' },
  ],
  'accelerate-thesis-hotel': [
    { file: 'playbook.html', label: 'Deployment Playbook', desc: 'Phase-by-phase rollout guide', icon: '📘', color: '#d97706' },
    { file: 'robot-solutions.html', label: 'Robot Solutions', desc: 'Solution comparison matrix', icon: '🤖', color: '#db2777' },
    { file: 'carpet-robot-comparison.html', label: 'Carpet Robot Eval', desc: 'Cleaning robot head-to-head', icon: '🔬', color: '#059669' },
  ],
};

let deal = null;
let facility = null;
let activities = [];
let availableProposals = [];
let wsInitialized = false;

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

  await discoverProposals();

  /* WHY: Check if deal has a linked assessment for the workspace tab */
  try {
    const asmRes = await fetch(`/api/assessments?deal_id=${id}`);
    if (asmRes.ok) {
      const assessments = await asmRes.json();
      if (assessments.length > 0) {
        deal._assessmentId = assessments[0].id;
      }
    }
  } catch (e) { /* No assessment endpoint or no assessment — OK */ }

  renderAll();

  if (typeof initWorkspace === 'function' && !wsInitialized) {
    /* WHY: Fetch all deals for the deal switcher dropdown — only on first load */
    let allDeals = [];
    try {
      const allRes = await fetch('/api/deals');
      if (allRes.ok) allDeals = await allRes.json();
    } catch (e) { /* Switcher will just be empty */ }

    initWorkspace(deal, allDeals);
    wsInitialized = true;
  }

  /* WHY: Update tab dots on every load — data changes after mutations */
  if (typeof wsUpdateTabDots === 'function') {
    wsUpdateTabDots({
      assessment: deal._assessmentId ? 'in_progress' : 'not_started',
      fleet: 'not_started',
      proposal: availableProposals.length > 0 ? 'complete' : 'not_started',
    });
  }
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
  if (!facility) {
    alert('This deal has no facility linked. Add a facility first.');
    return;
  }
  const res = await fetch(`/api/facilities/${facility.id}/challenges`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to add challenge' }));
    throw new Error(err.error);
  }
  await loadDeal();
}

async function addContact(data) {
  if (!facility) {
    alert('This deal has no facility linked. Add a facility first.');
    return;
  }
  const res = await fetch(`/api/facilities/${facility.id}/contacts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Failed to add contact' }));
    throw new Error(err.error);
  }
  await loadDeal();
}

// ── Proposal discovery ────────────────────────────────────────
async function discoverProposals() {
  const repo = DEAL_REPO_MAP[deal.id];
  if (!repo) {
    availableProposals = [];
    return;
  }

  const allTypes = [...PROPOSAL_TYPES, ...(EXTRA_PAGES[repo] || [])];
  const checks = allTypes.map(async (t) => {
    const url = `/repos/${repo}/pages/${t.file}`;
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      // WHY: Some hotel repos still have raw template files with {{PLACEHOLDER}} tokens.
      // Check for any unresolved {{...}} markers so we don't show broken proposals.
      const html = await res.text();
      if (/\{\{[A-Z_]{3,}\}\}/.test(html)) return null;
      return { ...t, url };
    } catch { return null; }
  });

  availableProposals = (await Promise.all(checks)).filter(Boolean);
}

// ── Render orchestration ───────────────────────────────────────
function renderAll() {
  renderHeader();
  renderStageBar();
  renderProposals();
  renderFacility();
  renderChallenges();
  renderContacts();
  renderTimeline();
  renderNotes();
  /* WHY: Workspace panels need their own render calls */
  renderContactsPanel();
  renderProposalsPanel();
  initNotesEditor();
}

// ── Header ─────────────────────────────────────────────────────
function renderHeader() {
  const el = document.getElementById('deal-header');
  if (!el) return;
  el.innerHTML = `
    <div class="flex items-center gap-4 flex-wrap">
      <h1 class="text-2xl font-bold headline text-gray-900">${escapeHtml(deal.name)}</h1>
      <span class="px-3 py-1 rounded-lg text-xs font-bold bg-gray-100 text-gray-500">${escapeHtml(deal.id)}</span>
      <span class="brand-badge" style="background:${STAGE_COLORS[deal.stage]}20;color:${STAGE_COLORS[deal.stage]}">
        ${STAGE_LABELS[deal.stage] || escapeHtml(deal.stage)}
      </span>
    </div>
    <p class="text-sm text-gray-400 mt-1">
      ${escapeHtml(deal.owner || 'Unassigned')}
      ${deal.source ? ' &middot; ' + escapeHtml(deal.source) : ''}
      ${deal.value_monthly ? ' &middot; <span class="gradient-text" style="font-weight:700">$' + Number(deal.value_monthly).toLocaleString() + '/mo</span>' : ''}
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
    const isFuture = currentIdx >= 0 && i > currentIdx;
    const dotColor = isCurrent ? STAGE_COLORS[s] : (isPast ? '#16a34a' : '#e2e8f0');
    const textColor = isCurrent || isPast ? (isCurrent ? STAGE_COLORS[s] : '#16a34a') : '#94a3b8';
    // WHY: Any non-current stage is clickable — Eric wants chess-piece movement along the pipeline
    const clickable = !isCurrent && deal.stage !== 'lost';

    return `
      <div class="stage-step ${clickable ? 'stage-clickable' : ''}"
           ${clickable ? `onclick="advanceStage('${s}')" title="Move to ${STAGE_LABELS[s]}"` : ''}>
        <div class="stage-dot ${isCurrent ? 'stage-dot-current' : ''}"
             style="background:${dotColor};${isCurrent ? 'box-shadow:0 0 0 4px ' + STAGE_COLORS[s] + '30' : ''}"></div>
        <span class="stage-label" style="color:${textColor}">${STAGE_LABELS[s]}</span>
      </div>
      ${i < pipelineStages.length - 1
        ? `<div class="stage-line" style="background:${isPast ? '#16a34a' : '#e2e8f0'}"></div>`
        : ''}
    `;
  }).join('');
}

// ── Proposals ─────────────────────────────────────────────────
function renderProposals() {
  const el = document.getElementById('proposals-grid');
  if (!el) return;

  if (!availableProposals.length) {
    el.innerHTML = '<p class="text-gray-400 text-sm">No proposals generated yet for this deal</p>';
    return;
  }

  el.innerHTML = availableProposals.map(p => `
    <a href="${p.url}" target="_blank" class="proposal-card" style="border-top: 3px solid ${p.color}">
      <div class="proposal-icon">${p.icon}</div>
      <div class="proposal-label">${escapeHtml(p.label)}</div>
      <div class="proposal-desc">${escapeHtml(p.desc)}</div>
      <div class="proposal-open">Open &rarr;</div>
    </a>
  `).join('');
}


function renderProposalsPanel() {
  const el = document.getElementById('proposals-panel-grid');
  if (!el) return;

  if (!availableProposals.length) {
    el.innerHTML = '<p class="text-gray-400 text-sm">No proposals generated yet for this deal.</p>';
    return;
  }

  el.innerHTML = availableProposals.map(p => `
    <a href="${p.url}" target="_blank" class="proposal-card" style="border-top: 3px solid ${p.color}">
      <div class="proposal-icon">${p.icon}</div>
      <div class="proposal-label">${escapeHtml(p.label)}</div>
      <div class="proposal-desc">${escapeHtml(p.desc)}</div>
      <div class="proposal-open">Open &rarr;</div>
    </a>
  `).join('');
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
    <div class="contact-item brand-glass">
      <div class="flex items-center flex-wrap gap-2">
        <strong class="text-sm text-gray-900">${escapeHtml(c.name)}</strong>
        ${c.title ? `<span class="text-xs text-gray-400">— ${escapeHtml(c.title)}</span>` : ''}
        ${c.role ? `<span class="brand-badge brand-badge-purple">${escapeHtml(c.role.replace(/_/g, ' '))}</span>` : ''}
      </div>
      <div class="flex flex-wrap items-center gap-3 mt-1">
        ${c.email ? `<a href="mailto:${escapeHtml(c.email)}" class="text-xs text-blue-600 hover:underline">${escapeHtml(c.email)}</a>` : ''}
        ${c.phone ? `<span class="text-xs text-gray-400">${escapeHtml(c.phone)}</span>` : ''}
      </div>
    </div>
  `).join('');
}


function renderContactsPanel() {
  const el = document.getElementById('contacts-panel-list');
  if (!el) return;
  const contacts = facility?.contacts || [];

  if (!contacts.length) {
    el.innerHTML = '<p class="text-gray-400 text-sm">No contacts yet. Click "+ Add Contact" to add the first one.</p>';
    return;
  }

  el.innerHTML = contacts.map(c => `
    <div class="brand-glass" style="padding:16px;">
      <div class="flex items-center flex-wrap gap-2 mb-2">
        <strong class="text-sm text-gray-900">${escapeHtml(c.name)}</strong>
        ${c.role ? `<span class="brand-badge brand-badge-purple">${escapeHtml(c.role.replace(/_/g, ' '))}</span>` : ''}
      </div>
      ${c.title ? `<p class="text-xs text-gray-500 mb-2">${escapeHtml(c.title)}</p>` : ''}
      <div class="flex flex-wrap items-center gap-3">
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


function initNotesEditor() {
  const editor = document.getElementById('notes-editor');
  if (!editor || !deal) return;
  editor.value = deal.notes || '';
}

function onNotesChange() {
  if (typeof wsAutoSave !== 'function') return;
  wsAutoSave(async function() {
    const editor = document.getElementById('notes-editor');
    if (!editor || !deal) return;
    const res = await fetch(`/api/deals/${deal.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes: editor.value }),
    });
    if (!res.ok) throw new Error('Save failed');
    deal.notes = editor.value;
    /* WHY: Also update the notes display in the overview panel */
    renderNotes();
  });
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

  // WHY: Register event listeners BEFORE async data loading so they're
  // always wired up even if loadDeal() fails
  document.getElementById('challenge-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding…';
    try {
      await addChallenge({
        category: form.category.value,
        description: form.description.value,
        priority: form.priority.value || 'medium',
        current_cost_monthly: form.current_cost_monthly.value ? Number(form.current_cost_monthly.value) : null,
        area_sqft: form.area_sqft.value ? Number(form.area_sqft.value) : null,
      });
      closeChallengeModal();
    } catch (err) {
      alert(err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add Challenge';
    }
  });

  document.getElementById('contact-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Adding…';
    try {
      await addContact({
        name: form.contact_name.value,
        title: form.title.value || null,
        email: form.email.value || null,
        phone: form.phone.value || null,
        role: form.role.value || null,
      });
      closeContactModal();
    } catch (err) {
      alert(err.message);
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Add Contact';
    }
  });

  await loadDeal();
});
