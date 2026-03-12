/**
 * Admin dashboard logic — inquiries + recipients management.
 */

let currentFilter = '';

// ── Init ────────────────────────────────────────────────────────
(async function init() {
  const user = await checkAuth();
  if (!user) {
    window.location.href = '/admin-login';
    return;
  }

  document.getElementById('adminEmail').textContent = user.email;
  document.getElementById('loading').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');

  loadInquiries();
  setupRecipientForm();
})();

// ── Tabs ────────────────────────────────────────────────────────
function switchTab(tab) {
  document.getElementById('panel-inquiries').classList.toggle('hidden', tab !== 'inquiries');
  document.getElementById('panel-recipients').classList.toggle('hidden', tab !== 'recipients');

  document.getElementById('tab-inquiries').className = tab === 'inquiries'
    ? 'px-5 py-2.5 rounded-xl text-sm font-semibold transition bg-blue-600 text-white shadow-md'
    : 'px-5 py-2.5 rounded-xl text-sm font-semibold transition bg-white text-gray-500 hover:bg-gray-50';

  document.getElementById('tab-recipients').className = tab === 'recipients'
    ? 'px-5 py-2.5 rounded-xl text-sm font-semibold transition bg-blue-600 text-white shadow-md'
    : 'px-5 py-2.5 rounded-xl text-sm font-semibold transition bg-white text-gray-500 hover:bg-gray-50';

  if (tab === 'recipients') loadRecipients();
}

// ── Inquiries ───────────────────────────────────────────────────
async function loadInquiries() {
  const url = currentFilter ? `/api/inquiries?status=${currentFilter}` : '/api/inquiries';
  const res = await fetch(url);
  if (!res.ok) return;
  const data = await res.json();
  renderInquiries(data);
}

function filterInquiries(status) {
  currentFilter = status;

  document.querySelectorAll('.filter-btn').forEach(btn => {
    const isActive = btn.dataset.status === status;
    btn.className = `filter-btn px-4 py-2 rounded-lg text-sm font-medium transition ${
      isActive ? 'bg-blue-600 text-white shadow-md' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
    }`;
  });

  loadInquiries();
}

const STATUS_COLORS = {
  new: 'bg-blue-100 text-blue-700',
  reviewed: 'bg-yellow-100 text-yellow-700',
  contacted: 'bg-emerald-100 text-emerald-700',
  archived: 'bg-gray-100 text-gray-500',
};

function renderInquiries(inquiries) {
  const list = document.getElementById('inquiriesList');
  const empty = document.getElementById('noInquiries');

  if (inquiries.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = inquiries.map(inq => `
    <div class="bg-white rounded-2xl shadow-sm p-6 hover:shadow-md transition">
      <div class="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
        <div>
          <h3 class="font-bold text-lg">${esc(inq.name)}</h3>
          <p class="text-sm text-gray-400">
            <a href="mailto:${esc(inq.email)}" class="text-blue-600 hover:underline">${esc(inq.email)}</a>
            ${inq.company ? ` &middot; ${esc(inq.company)}` : ''}
            ${inq.phone ? ` &middot; ${esc(inq.phone)}` : ''}
          </p>
        </div>
        <div class="flex items-center gap-3 flex-shrink-0">
          <span class="px-3 py-1 rounded-full text-xs font-bold ${STATUS_COLORS[inq.status] || ''}">${inq.status}</span>
          <select onchange="updateStatus(${inq.id}, this.value)" class="text-sm border border-gray-200 rounded-lg px-3 py-1.5 outline-none focus:ring-2 focus:ring-blue-500">
            ${['new', 'reviewed', 'contacted', 'archived'].map(s =>
              `<option value="${s}" ${s === inq.status ? 'selected' : ''}>${s}</option>`
            ).join('')}
          </select>
        </div>
      </div>
      <p class="text-gray-600 text-sm whitespace-pre-wrap">${esc(inq.message)}</p>
      <p class="text-xs text-gray-300 mt-4">${new Date(inq.created_at + 'Z').toLocaleString()}</p>
    </div>
  `).join('');
}

async function updateStatus(id, status) {
  const res = await fetch(`/api/inquiries/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (res.ok) loadInquiries();
}

// ── Recipients ──────────────────────────────────────────────────
async function loadRecipients() {
  const res = await fetch('/api/recipients');
  if (!res.ok) return;
  const data = await res.json();
  renderRecipients(data);
}

function renderRecipients(recipients) {
  const list = document.getElementById('recipientsList');
  const empty = document.getElementById('noRecipients');

  if (recipients.length === 0) {
    list.innerHTML = '';
    empty.classList.remove('hidden');
    return;
  }
  empty.classList.add('hidden');

  list.innerHTML = recipients.map(r => `
    <div class="bg-white rounded-xl shadow-sm p-4 flex items-center justify-between gap-4">
      <div class="flex items-center gap-3 min-w-0">
        <div class="w-10 h-10 rounded-full ${r.active ? 'bg-emerald-100 text-emerald-600' : 'bg-gray-100 text-gray-400'} flex items-center justify-center font-bold text-sm flex-shrink-0">
          ${(r.name || r.email).charAt(0).toUpperCase()}
        </div>
        <div class="min-w-0">
          <p class="font-semibold text-sm truncate">${esc(r.name || 'Unnamed')}</p>
          <p class="text-xs text-gray-400 truncate">${esc(r.email)}</p>
        </div>
      </div>
      <div class="flex items-center gap-3 flex-shrink-0">
        <button onclick="toggleRecipient(${r.id}, ${r.active ? 0 : 1})"
                class="text-xs font-medium px-3 py-1.5 rounded-lg transition ${
                  r.active
                    ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }">
          ${r.active ? 'Active' : 'Paused'}
        </button>
        <button onclick="deleteRecipient(${r.id})"
                class="text-xs text-red-400 hover:text-red-600 transition font-medium">
          Remove
        </button>
      </div>
    </div>
  `).join('');
}

function setupRecipientForm() {
  document.getElementById('addRecipientForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('recipientError');
    errEl.classList.add('hidden');

    const form = e.target;
    const res = await fetch('/api/recipients', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: form.name.value.trim(),
        email: form.email.value.trim(),
      }),
    });

    if (res.ok) {
      form.reset();
      loadRecipients();
    } else {
      const data = await res.json();
      errEl.textContent = data.error || 'Failed to add recipient';
      errEl.classList.remove('hidden');
    }
  });
}

async function toggleRecipient(id, active) {
  await fetch(`/api/recipients/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ active: !!active }),
  });
  loadRecipients();
}

async function deleteRecipient(id) {
  if (!confirm('Remove this notification recipient?')) return;
  await fetch(`/api/recipients/${id}`, { method: 'DELETE' });
  loadRecipients();
}

// ── Helpers ─────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}
