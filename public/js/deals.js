// public/js/deals.js

// ── State ──────────────────────────────────────────────────────
let deals = [];
let view = 'kanban'; // 'kanban' or 'table'

const STAGES = ['lead', 'qualified', 'site_walk', 'configured', 'proposed', 'negotiation', 'won', 'deploying', 'active', 'lost'];
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
  if (!res.ok) throw new Error('Failed to fetch deals');
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

// ── Render ──────────────────────────────────────────────────────
function render() {
  const q = document.getElementById('deal-search')?.value?.toLowerCase() || '';
  const filtered = deals.filter(d => {
    if (!q) return true;
    return [d.name, d.facility_name, d.city, d.state, d.owner].filter(Boolean).join(' ').toLowerCase().includes(q);
  });

  renderStats(filtered);
  if (view === 'kanban') {
    document.getElementById('deal-kanban').classList.remove('hidden');
    document.getElementById('deal-table-wrap')?.classList.add('hidden');
    renderKanban(filtered);
  } else {
    document.getElementById('deal-kanban').classList.add('hidden');
    document.getElementById('deal-table-wrap')?.classList.remove('hidden');
    renderTable(filtered);
  }

  // Update toggle button states
  document.getElementById('view-kanban')?.classList.toggle('bg-blue-600', view === 'kanban');
  document.getElementById('view-kanban')?.classList.toggle('text-white', view === 'kanban');
  document.getElementById('view-kanban')?.classList.toggle('text-gray-500', view !== 'kanban');
  document.getElementById('view-table')?.classList.toggle('bg-blue-600', view === 'table');
  document.getElementById('view-table')?.classList.toggle('text-white', view === 'table');
  document.getElementById('view-table')?.classList.toggle('text-gray-500', view !== 'table');
}

function renderStats(filtered) {
  const el = document.getElementById('deal-stats');
  if (!el) return;
  const stageCounts = {};
  STAGES.forEach(s => stageCounts[s] = 0);
  filtered.forEach(d => { if (stageCounts[d.stage] !== undefined) stageCounts[d.stage]++; });

  el.innerHTML = `
    <div class="stat"><span class="stat-value">${filtered.length}</span><span class="stat-label">Total</span></div>
    ${['lead', 'qualified', 'proposed', 'won', 'active'].map(s =>
      `<div class="stat"><span class="stat-value" style="color:${STAGE_COLORS[s]}">${stageCounts[s]}</span><span class="stat-label">${STAGE_LABELS[s]}</span></div>`
    ).join('')}
  `;
}

function renderKanban(filtered) {
  const el = document.getElementById('deal-kanban');
  if (!el) return;
  // WHY: Only show active pipeline stages in kanban — won/deploying/active/lost are outcomes, not pipeline
  const pipelineStages = ['lead', 'qualified', 'site_walk', 'configured', 'proposed', 'negotiation'];
  el.innerHTML = pipelineStages.map(stage => {
    const stageDeals = filtered.filter(d => d.stage === stage);
    return `
      <div class="kanban-col">
        <div class="kanban-header" style="border-top: 3px solid ${STAGE_COLORS[stage]}">
          <span>${STAGE_LABELS[stage]}</span>
          <span class="kanban-count">${stageDeals.length}</span>
        </div>
        <div class="kanban-cards">
          ${stageDeals.map(d => `
            <a href="/admin/deals/${d.id}" class="deal-card">
              <div class="deal-name">${escapeHtml(d.name)}</div>
              <div class="deal-meta">${escapeHtml(d.facility_type || '')}${d.facility_type && (d.city || d.state) ? ' &middot; ' : ''}${escapeHtml(d.city || '')}${d.state ? ', ' + escapeHtml(d.state) : ''}</div>
              ${d.value_monthly ? `<div class="deal-value">$${Number(d.value_monthly).toLocaleString()}/mo</div>` : ''}
              <div class="deal-owner">${escapeHtml(d.owner || 'Unassigned')}</div>
            </a>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
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

  el.innerHTML = filtered.map(d => `
    <tr onclick="window.location='/admin/deals/${d.id}'" style="cursor:pointer" class="border-t border-gray-50 hover:bg-gray-50 transition">
      <td class="px-4 py-3 font-semibold text-gray-400 text-xs">${escapeHtml(d.id)}</td>
      <td class="px-4 py-3 font-semibold text-gray-900">${escapeHtml(d.name)}</td>
      <td class="px-4 py-3"><span style="background:${STAGE_COLORS[d.stage]}20;color:${STAGE_COLORS[d.stage]};padding:2px 8px;border-radius:6px;font-size:0.75rem;font-weight:600;white-space:nowrap">${STAGE_LABELS[d.stage] || d.stage}</span></td>
      <td class="px-4 py-3 text-gray-500">${escapeHtml(d.facility_type || '—')}</td>
      <td class="px-4 py-3 text-gray-500">${escapeHtml(d.city || '')}${d.state ? ', ' + escapeHtml(d.state) : (d.city ? '' : '—')}</td>
      <td class="px-4 py-3 text-gray-500">${escapeHtml(d.owner || '—')}</td>
      <td class="px-4 py-3 font-semibold text-blue-600">${d.value_monthly ? '$' + Number(d.value_monthly).toLocaleString() : '—'}</td>
      <td class="px-4 py-3 text-gray-400 text-xs">${d.updated_at ? new Date(d.updated_at).toLocaleDateString() : '—'}</td>
    </tr>
  `).join('');
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
  const user = await checkAuth();
  if (!user) return window.location.href = '/admin-login';

  document.getElementById('loading').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  document.getElementById('adminEmail').textContent = user.email;

  await fetchDeals();

  document.getElementById('deal-search')?.addEventListener('input', render);
  document.getElementById('view-kanban')?.addEventListener('click', () => { view = 'kanban'; render(); });
  document.getElementById('view-table')?.addEventListener('click', () => { view = 'table'; render(); });

  document.getElementById('new-deal-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const form = e.target;
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
    }
  });
});
