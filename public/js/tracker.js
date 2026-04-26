// WHY: Single-file client module — no bundler in this repo. Tailwind + fetch only.

const state = {
  sprints: [],        // { id, name, start_date, end_date }
  currentSprint: null, // full hydrated sprint { ...sprint, projects: [...], people: [...] }
  peopleById: new Map(),
  // WHY: item IDs whose descendants are hidden. Projects collapse their tasks; tasks collapse their subtasks.
  collapsed: new Set(),
};

// ── Fetch helpers ─────────────────────────────────────────────
async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${path} → ${res.status}: ${text}`);
  }
  return res.json();
}

async function loadSprintList() {
  state.sprints = await api('GET', '/api/tracker/sprints');
}

async function loadSprint(id) {
  // WHY: clear collapse state on sprint switch — stale IDs from a previous sprint would never match anyway.
  if (!state.currentSprint || state.currentSprint.id !== id) {
    state.collapsed.clear();
  }
  state.currentSprint = await api('GET', `/api/tracker/sprints/${id}`);
  state.peopleById = new Map(state.currentSprint.people.map(p => [p.id, p]));
}

// ── DOM helpers ───────────────────────────────────────────────
function el(id) { return document.getElementById(id); }

function renderSprintSelector() {
  const sel = el('sprint-selector');
  sel.innerHTML = state.sprints
    .map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`)
    .join('');
  if (state.currentSprint) sel.value = state.currentSprint.id;
}

function renderSprintContext() {
  if (!state.currentSprint) return;
  el('sprint-name').textContent = state.currentSprint.name;
  el('sprint-dates').textContent = `${state.currentSprint.start_date} → ${state.currentSprint.end_date}`;

  const counts = { not_started: 0, in_progress: 0, blocked: 0, complete: 0 };
  const walk = (node) => {
    if (node.status) counts[node.status] = (counts[node.status] || 0) + 1;
    (node.tasks || []).forEach(walk);
    (node.subtasks || []).forEach(walk);
  };
  state.currentSprint.projects.forEach(walk);
  el('sprint-summary').textContent =
    `${counts.blocked} blocked · ${counts.in_progress} in progress · ${counts.complete} complete`;
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ── Color palette (v2 doc §4.5) ─────────────────────────────
const COLOR_MAP = {
  purple: { fill: '#EEEDFE', text: '#26215C' },
  amber:  { fill: '#FAEEDA', text: '#412402' },
  teal:   { fill: '#E1F5EE', text: '#04342C' },
  coral:  { fill: '#FAECE7', text: '#4A1B0C' },
  pink:   { fill: '#FBEAF0', text: '#4B1528' },
  blue:   { fill: '#E6F1FB', text: '#042C53' },
  green:  { fill: '#EAF3DE', text: '#173404' },
  gray:   { fill: '#F3F4F6', text: '#1F2937' },
  red:    { fill: '#A32D2D', text: '#FFFFFF' },
};
function colorFor(key) { return COLOR_MAP[key] || COLOR_MAP.gray; }

// ── Date math ───────────────────────────────────────────────
function daysBetween(aIso, bIso) {
  const a = new Date(aIso + 'T00:00:00Z').getTime();
  const b = new Date(bIso + 'T00:00:00Z').getTime();
  return Math.round((b - a) / 86400000);
}

function positionFor(start, end, sprintStart, sprintEnd) {
  const total = daysBetween(sprintStart, sprintEnd) || 1;
  const leftDays = Math.max(0, daysBetween(sprintStart, start));
  const widthDays = Math.max(0, daysBetween(start, end));
  return {
    left: (leftDays / total) * 100,
    width: Math.max(0.5, (widthDays / total) * 100),
  };
}

// WHY: Format an ISO yyyy-mm-dd as "M/D" (no zero-padding) using UTC so a
// browser in any timezone shows the same calendar date as stored in the DB.
function fmtMD(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return `${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

function addDaysIso(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function dayHeaders(sprintStart, sprintEnd) {
  // WHY: One column per day so the header aligns with the per-day gridlines drawn on
  // each row's .gantt-right background. Labels are shown only on Mondays — prefixed
  // "Mon" so the cadence is obvious. Other days render blank but still hold their
  // column width so the gridlines stay aligned. Long sprints (>60 days) fall back to
  // a single span label to avoid an unreadably narrow grid.
  const totalDays = daysBetween(sprintStart, sprintEnd) + 1;
  if (totalDays > 60) return [`${fmtMD(sprintStart)} – ${fmtMD(sprintEnd)}`];
  return Array.from({ length: totalDays }, (_, i) => {
    const iso = addDaysIso(sprintStart, i);
    const dow = new Date(iso + 'T00:00:00Z').getUTCDay(); // 0=Sun … 1=Mon …
    return dow === 1 ? `Mon ${fmtMD(iso)}` : '';
  });
}

// ── Gantt render ────────────────────────────────────────────
function renderGantt() {
  const root = el('gantt-root');
  const s = state.currentSprint;
  if (!s) { root.innerHTML = ''; return; }

  const headers = dayHeaders(s.start_date, s.end_date);
  // WHY: Set --day-count so .gantt-right's per-day gridline gradient matches the header columns.
  const dayCount = daysBetween(s.start_date, s.end_date) + 1;
  const headerCols = headers.map(h => `<div class="text-center whitespace-nowrap" style="font-size:0.65rem;">${escapeHtml(h)}</div>`).join('');

  // WHY: Render nested .sortable-list > .item-wrap > .gantt-row structure so SortableJS
  //      can drag each item (and its descendants) as a unit. A project wrap contains its
  //      tasks-list; a task wrap contains its subtasks-list. No cross-container group
  //      name means siblings are islands — dragging is same-parent only.
  const html = [];
  html.push(`<div class="sortable-list" data-sortable="projects">`);
  for (const proj of s.projects) {
    html.push(`<div class="item-wrap" data-item-id="${proj.id}">`);
    html.push(renderRow(proj, 0, s, proj));
    if (!state.collapsed.has(proj.id)) {
      html.push(`<div class="sortable-list" data-sortable="tasks" data-parent-id="${proj.id}">`);
      for (const task of proj.tasks || []) {
        html.push(`<div class="item-wrap" data-item-id="${task.id}">`);
        html.push(renderRow(task, 1, s, proj));
        if (!state.collapsed.has(task.id)) {
          html.push(`<div class="sortable-list" data-sortable="subtasks" data-parent-id="${task.id}">`);
          for (const sub of task.subtasks || []) {
            html.push(`<div class="item-wrap" data-item-id="${sub.id}">`);
            html.push(renderRow(sub, 2, s, proj));
            html.push(`</div>`); // subtask wrap
          }
          html.push(`</div>`); // subtasks list
        }
        html.push(`</div>`); // task wrap
      }
      html.push(`</div>`); // tasks list
    }
    html.push(`</div>`); // project wrap
  }
  html.push(`</div>`); // projects list

  root.innerHTML = `
    <div class="gantt" style="--day-count:${dayCount};">
      <div class="gantt-header">
        <div>Name / Owner / Support / Status</div>
        <div style="display:grid; grid-template-columns: repeat(${headers.length}, 1fr);">${headerCols}</div>
      </div>
      ${html.join('')}
    </div>
  `;

  initSortables();
}

// WHY: Called after every Gantt re-render. Creates a fresh Sortable per container
//      (projects, tasks, subtasks). No shared `group` name = strictly same-parent reorder.
function initSortables() {
  if (typeof window.Sortable === 'undefined') {
    console.warn('[tracker] SortableJS not loaded — drag reorder disabled');
    return;
  }
  el('gantt-root').querySelectorAll('[data-sortable]').forEach(container => {
    new window.Sortable(container, {
      handle: '.drag-handle',
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      onEnd: async (evt) => {
        if (evt.from !== evt.to) return; // defense — no cross-container allowed
        const ids = Array.from(container.children)
          .filter(n => n.classList && n.classList.contains('item-wrap'))
          .map(n => n.dataset.itemId);
        if (ids.length === 0 || evt.oldIndex === evt.newIndex) return;
        try {
          await api('POST', '/api/tracker/items/reorder', { ordered_ids: ids });
          await loadSprint(state.currentSprint.id);
          renderAll();
        } catch (err) {
          alert('Reorder failed: ' + err.message);
          await loadSprint(state.currentSprint.id);
          renderAll();
        }
      },
    });
  });
}

function renderRow(node, level, sprint, ancestorProject) {
  const owner = node.owner_id ? state.peopleById.get(node.owner_id)?.initials ?? '—' : '—';
  const supportCount = (node.support_ids || []).length;
  const supportBadge = supportCount > 0 ? `+${supportCount}` : '—';

  const verifyDot = node.needs_verification ? `<span class="verify-dot" title="${escapeHtml(node.verification_note || 'Needs verification')}"></span>` : '';
  const hasChildren = (level === 0 && (node.tasks || []).length > 0)
                   || (level === 1 && (node.subtasks || []).length > 0);
  const isCollapsed = state.collapsed.has(node.id);
  const caretGlyph = hasChildren ? (isCollapsed ? '▸' : '▾') : '';

  const color = colorFor(ancestorProject.color);
  const isGoNoGo = node.is_milestone && node.color === 'red' && level === 0;

  const { left, width } = positionFor(node.start_date, node.end_date, sprint.start_date, sprint.end_date);
  let bar;
  if (node.is_milestone) {
    const diamondClass = isGoNoGo ? 'milestone gonogo' : 'milestone';
    const line = isGoNoGo ? `<span class="milestone gonogo-line" style="left:${left}%;"></span>` : '';
    bar = `${line}<span class="${diamondClass}" style="left:${left}%; background:${color.fill};"></span>`;
  } else {
    bar = `<div class="bar" style="left:${left}%; width:${width}%; background:${color.fill};"></div>`;
  }

  return `
    <div class="gantt-row" data-item-id="${node.id}">
      <div class="gantt-left">
        <div class="row-name level-${level}" title="${escapeHtml(node.name)}">
          <span class="drag-handle" title="Drag to reorder">⋮⋮</span>
          <span class="caret" data-toggle-id="${node.id}">${caretGlyph}</span>${verifyDot}<span class="row-name-text">${escapeHtml(node.name)}</span>
        </div>
        <div class="owner-cell" data-item-id="${node.id}" data-field="owner_id">${escapeHtml(owner)}</div>
        <div class="text-xs text-slate-500">${supportBadge}</div>
        <div class="status-cell" data-item-id="${node.id}" data-field="status">
          <span class="pill pill-${node.status}">${escapeHtml(statusLabel(node.status))}</span>
        </div>
      </div>
      <div class="gantt-right">${bar}</div>
    </div>
  `;
}

function statusLabel(s) {
  return {
    not_started: 'Not Started',
    in_progress: 'In Progress',
    blocked: 'Blocked',
    complete: 'Complete',
  }[s] || s;
}

// ── Render pipeline ──────────────────────────────────────────
function renderAll() {
  renderSprintSelector();
  renderSprintContext();
  renderGantt();
}

// ── Wire-up ───────────────────────────────────────────────────
el('sprint-selector').addEventListener('change', async (e) => {
  await loadSprint(e.target.value);
  renderAll();
});

(async function init() {
  try {
    await loadSprintList();
    if (state.sprints.length === 0) {
      el('sprint-name').textContent = 'No sprints yet — click "+ New Sprint"';
      return;
    }
    await loadSprint(state.sprints[0].id);
    renderAll();
  } catch (err) {
    console.error(err);
    el('sprint-name').textContent = 'Error loading tracker — check console';
  }
})();

// ── Inline edits ──────────────────────────────────────────────
// WHY: Event delegation from gantt-root — rows are re-rendered each change,
// so per-row listeners would leak. One listener catches clicks on status and owner cells.
el('gantt-root').addEventListener('click', (e) => {
  const statusCell = e.target.closest('.status-cell');
  const ownerCell = e.target.closest('.owner-cell');
  if (statusCell) {
    openStatusPicker(statusCell);
  } else if (ownerCell) {
    openOwnerPicker(ownerCell);
  }
});

function openStatusPicker(cell) {
  const id = cell.dataset.itemId;
  const options = ['not_started', 'in_progress', 'blocked', 'complete'];
  const select = document.createElement('select');
  select.className = 'text-xs border border-slate-300 rounded px-1 py-0.5';
  select.innerHTML = options.map(o => `<option value="${o}">${escapeHtml(statusLabel(o))}</option>`).join('');
  select.value = findNode(id).status;
  cell.innerHTML = '';
  cell.appendChild(select);
  select.focus();
  select.addEventListener('change', async () => {
    await patchItem(id, { status: select.value });
    await loadSprint(state.currentSprint.id);
    renderAll();
  });
  select.addEventListener('blur', async () => {
    // WHY: blur without change — re-render to restore the pill.
    renderAll();
  });
}

function openOwnerPicker(cell) {
  const id = cell.dataset.itemId;
  const select = document.createElement('select');
  select.className = 'text-xs border border-slate-300 rounded px-1 py-0.5';
  const opts = ['<option value="">—</option>'].concat(
    state.currentSprint.people.map(p => `<option value="${p.id}">${escapeHtml(p.initials)}</option>`)
  );
  select.innerHTML = opts.join('');
  const node = findNode(id);
  if (node.owner_id) select.value = String(node.owner_id);
  cell.innerHTML = '';
  cell.appendChild(select);
  select.focus();
  select.addEventListener('change', async () => {
    const v = select.value ? Number(select.value) : null;
    await patchItem(id, { owner_id: v });
    await loadSprint(state.currentSprint.id);
    renderAll();
  });
  select.addEventListener('blur', () => {
    renderAll();
  });
}

async function patchItem(id, body) {
  return api('PATCH', `/api/tracker/items/${id}`, body);
}

// WHY: Flat search over the tree — small enough we don't need an index.
function findNode(id) {
  for (const p of state.currentSprint.projects) {
    if (p.id === id) return p;
    for (const t of p.tasks || []) {
      if (t.id === id) return t;
      for (const s of t.subtasks || []) if (s.id === id) return s;
    }
  }
  return null;
}

// ── Drawer ────────────────────────────────────────────────────
// WHY: The drawer handles both edit (existing item) and create (empty form).
// The `mode` controls button visibility (delete only on edit) and save endpoint.
let drawerMode = null; // { kind: 'item', mode: 'create' | 'edit', level, sprint_id, parent_id?, id? }

function openDrawer(config) {
  drawerMode = config;
  renderDrawerForm();
  el('drawer').classList.add('open');
  el('drawer-backdrop').classList.add('open');
}

function closeDrawer() {
  drawerMode = null;
  el('drawer').classList.remove('open');
  el('drawer-backdrop').classList.remove('open');
}

el('drawer-backdrop').addEventListener('click', closeDrawer);

// WHY: <form id="drawer-form"> is a persistent element; only its innerHTML is swapped per render.
// Attaching the submit listener inside renderDrawerForm() stacked one listener per open, causing
// duplicate POSTs and queued alerts on save. Bind once here.
el('drawer-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  await submitDrawer(e.currentTarget);
});

function renderDrawerForm() {
  const title = el('drawer-title');
  const form = el('drawer-form');
  if (!drawerMode) { form.innerHTML = ''; return; }

  const isEdit = drawerMode.mode === 'edit';
  const existing = isEdit ? findNode(drawerMode.id) : null;
  const level = drawerMode.level;
  title.textContent = `${isEdit ? 'Edit' : 'New'} ${level}`;

  const peopleOpts = (selectedId) => [
    '<option value="">—</option>',
    ...state.currentSprint.people.map(p =>
      `<option value="${p.id}" ${selectedId == p.id ? 'selected' : ''}>${escapeHtml(p.initials)}</option>`
    ),
  ].join('');

  const supportCheckboxes = () => state.currentSprint.people.map(p => {
    const checked = existing?.support_ids?.includes(p.id) ? 'checked' : '';
    return `<label class="inline-flex items-center gap-1 text-xs mr-2"><input type="checkbox" name="support" value="${p.id}" ${checked}> ${escapeHtml(p.initials)}</label>`;
  }).join('');

  const colorOptions = ['purple','amber','teal','coral','pink','blue','green','gray']
    .map(c => `<option value="${c}" ${existing?.color === c ? 'selected' : ''}>${c}</option>`).join('');

  form.innerHTML = `
    <label class="block text-xs font-semibold text-slate-600">Name
      <input name="name" value="${escapeHtml(existing?.name || '')}" required maxlength="200"
             class="mt-1 w-full border border-slate-300 rounded px-2 py-1 text-sm">
    </label>

    <label class="block text-xs font-semibold text-slate-600">Description
      <textarea name="description" rows="2" maxlength="5000"
                class="mt-1 w-full border border-slate-300 rounded px-2 py-1 text-sm">${escapeHtml(existing?.description || '')}</textarea>
    </label>

    <label class="block text-xs font-semibold text-slate-600">${level === 'project' ? 'Owner' : 'Lead'}
      <select name="owner_id" class="mt-1 w-full border border-slate-300 rounded px-2 py-1 text-sm">
        ${peopleOpts(existing?.owner_id)}
      </select>
    </label>

    ${level === 'project' ? `
      <div class="text-xs font-semibold text-slate-600">Support
        <div class="mt-1 flex flex-wrap gap-1">${supportCheckboxes()}</div>
      </div>
      <label class="block text-xs font-semibold text-slate-600">Color
        <select name="color" class="mt-1 w-full border border-slate-300 rounded px-2 py-1 text-sm">
          <option value="">(none)</option>${colorOptions}
        </select>
      </label>
    ` : ''}

    <div class="grid grid-cols-2 gap-3">
      <label class="block text-xs font-semibold text-slate-600">Start date
        <input type="date" name="start_date" required value="${escapeHtml(existing?.start_date || state.currentSprint.start_date)}"
               class="mt-1 w-full border border-slate-300 rounded px-2 py-1 text-sm">
      </label>
      <label class="block text-xs font-semibold text-slate-600">End date
        <input type="date" name="end_date" required value="${escapeHtml(existing?.end_date || state.currentSprint.end_date)}"
               class="mt-1 w-full border border-slate-300 rounded px-2 py-1 text-sm">
      </label>
    </div>

    <label class="block text-xs font-semibold text-slate-600">Status
      <select name="status" class="mt-1 w-full border border-slate-300 rounded px-2 py-1 text-sm">
        ${['not_started','in_progress','blocked','complete'].map(s =>
          `<option value="${s}" ${existing?.status === s ? 'selected' : ''}>${statusLabel(s)}</option>`).join('')}
      </select>
    </label>

    <label class="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
      <input type="checkbox" name="is_milestone" ${existing?.is_milestone ? 'checked' : ''}> Milestone (zero-duration)
    </label>

    <label class="inline-flex items-center gap-2 text-xs font-semibold text-slate-600">
      <input type="checkbox" name="needs_verification" ${existing?.needs_verification ? 'checked' : ''}> Needs verification
    </label>

    <label class="block text-xs font-semibold text-slate-600">Verification note
      <textarea name="verification_note" rows="2" maxlength="5000"
                class="mt-1 w-full border border-slate-300 rounded px-2 py-1 text-sm">${escapeHtml(existing?.verification_note || '')}</textarea>
    </label>

    <div class="flex items-center justify-between pt-4 border-t border-slate-200">
      <button type="button" id="drawer-cancel" class="text-sm text-slate-500">Cancel</button>
      <div class="flex gap-2 items-center">
        ${isEdit && level === 'project' ? '<button type="button" id="drawer-add-task" class="text-sm text-slate-700 hover:text-slate-900 border border-slate-300 rounded px-3 py-1">+ Add Task</button>' : ''}
        ${isEdit && level === 'task' ? '<button type="button" id="drawer-add-subtask" class="text-sm text-slate-700 hover:text-slate-900 border border-slate-300 rounded px-3 py-1">+ Add Subtask</button>' : ''}
        ${isEdit ? '<button type="button" id="drawer-delete" class="text-sm text-red-600 hover:text-red-800">Delete</button>' : ''}
        <button type="submit" class="bg-slate-900 text-white text-sm font-semibold px-4 py-1.5 rounded">Save</button>
      </div>
    </div>
  `;

  el('drawer-cancel').addEventListener('click', closeDrawer);
  if (isEdit) {
    el('drawer-delete').addEventListener('click', async () => {
      if (!confirm(`Delete "${existing.name}"? This cascades to children.`)) return;
      await api('DELETE', `/api/tracker/items/${existing.id}`);
      await loadSprint(state.currentSprint.id);
      renderAll();
      closeDrawer();
    });
  }
  if (isEdit && level === 'project') {
    el('drawer-add-task').addEventListener('click', () => {
      // WHY: Flip the same drawer into create-task mode with this project as the parent.
      const parentProjectId = drawerMode.id;
      openDrawer({ kind: 'item', mode: 'create', level: 'task', parent_id: parentProjectId });
    });
  }
  if (isEdit && level === 'task') {
    el('drawer-add-subtask').addEventListener('click', () => {
      // WHY: Flip the same drawer into create-subtask mode with this task as the parent.
      const parentTaskId = drawerMode.id;
      openDrawer({ kind: 'item', mode: 'create', level: 'subtask', parent_id: parentTaskId });
    });
  }
}

async function submitDrawer(form) {
  const fd = new FormData(form);
  const body = {
    name: fd.get('name'),
    description: fd.get('description') || null,
    owner_id: fd.get('owner_id') ? Number(fd.get('owner_id')) : null,
    start_date: fd.get('start_date'),
    end_date: fd.get('end_date'),
    status: fd.get('status'),
    is_milestone: fd.has('is_milestone'),
    needs_verification: fd.has('needs_verification'),
    verification_note: fd.get('verification_note') || null,
  };
  if (drawerMode.level === 'project') {
    body.color = fd.get('color') || null;
  }

  const supportIds = fd.getAll('support').map(Number);

  try {
    if (drawerMode.mode === 'edit') {
      await api('PATCH', `/api/tracker/items/${drawerMode.id}`, body);
      if (drawerMode.level === 'project') {
        await api('PUT', `/api/tracker/items/${drawerMode.id}/support`, { person_ids: supportIds });
      }
    } else {
      const created = await api('POST', '/api/tracker/items', {
        sprint_id: state.currentSprint.id,
        parent_id: drawerMode.parent_id || null,
        level: drawerMode.level,
        ...body,
      });
      if (drawerMode.level === 'project' && supportIds.length > 0) {
        await api('PUT', `/api/tracker/items/${created.id}/support`, { person_ids: supportIds });
      }
    }
    await loadSprint(state.currentSprint.id);
    renderAll();
    closeDrawer();
  } catch (err) {
    alert('Save failed: ' + err.message);
  }
}

// Row click → caret toggle or edit drawer.
// WHY: Second delegated listener on gantt-root. The existing inline-edit listener matches
// .status-cell / .owner-cell. They coexist because they target different elements.
// "+ Add Task" and "+ Add Subtask" are now buttons inside the project / task edit drawer,
// not Gantt rows.
el('gantt-root').addEventListener('click', (e) => {
  const caret = e.target.closest('.caret[data-toggle-id]');
  if (caret && caret.textContent.trim()) {
    e.stopPropagation();
    const id = caret.dataset.toggleId;
    if (state.collapsed.has(id)) state.collapsed.delete(id);
    else state.collapsed.add(id);
    renderGantt();
    return;
  }
  const rowName = e.target.closest('.row-name');
  if (!rowName) return;
  const row = e.target.closest('.gantt-row');
  const id = row?.dataset?.itemId;
  if (!id) return;
  const node = findNode(id);
  if (!node) return;
  openDrawer({ kind: 'item', mode: 'edit', level: node.level, id });
});

// + Add Project button
el('btn-add-project').addEventListener('click', () => {
  openDrawer({ kind: 'item', mode: 'create', level: 'project' });
});

// + New Sprint button (opens a lightweight prompt trio for MVP)
el('btn-new-sprint').addEventListener('click', async () => {
  const name = prompt('Sprint name?');
  if (!name) return;
  const start = prompt('Start date (YYYY-MM-DD)?', new Date().toISOString().slice(0, 10));
  if (!start) return;
  const end = prompt('End date (YYYY-MM-DD)?');
  if (!end) return;
  try {
    const created = await api('POST', '/api/tracker/sprints', { name, start_date: start, end_date: end });
    await loadSprintList();
    await loadSprint(created.id);
    renderAll();
  } catch (err) {
    alert('Create failed: ' + err.message);
  }
});

// ── Manage People modal ───────────────────────────────────────
function openPeopleModal() {
  renderPeopleList();
  el('people-modal-backdrop').classList.add('open');
}
function closePeopleModal() {
  el('people-modal-backdrop').classList.remove('open');
}

async function refreshPeople() {
  // WHY: Full sprint reload hydrates people via GET /sprints/:id
  await loadSprint(state.currentSprint.id);
  renderAll();
  renderPeopleList();
}

function renderPeopleList() {
  const list = el('people-list');
  list.innerHTML = state.currentSprint.people.map(p => `
    <div class="flex items-center justify-between border border-slate-200 rounded px-3 py-1.5">
      <div class="text-sm"><span class="font-semibold">${escapeHtml(p.initials)}</span>
        ${p.full_name ? `<span class="text-slate-500"> — ${escapeHtml(p.full_name)}</span>` : ''}
      </div>
      <button class="text-xs text-red-600 hover:text-red-800 del-person-btn" data-id="${p.id}">Remove</button>
    </div>
  `).join('') || '<div class="text-xs text-slate-500">No people yet.</div>';
}

el('btn-manage-people').addEventListener('click', openPeopleModal);
el('people-modal-close').addEventListener('click', closePeopleModal);
el('people-modal-backdrop').addEventListener('click', (e) => {
  if (e.target === el('people-modal-backdrop')) closePeopleModal();
});

el('people-list').addEventListener('click', async (e) => {
  const btn = e.target.closest('.del-person-btn');
  if (!btn) return;
  if (!confirm('Deactivate this person? Historical assignments keep resolving.')) return;
  await api('DELETE', `/api/tracker/people/${btn.dataset.id}`);
  await refreshPeople();
});

el('person-add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const initials = el('person-initials').value.trim();
  const fullName = el('person-fullname').value.trim();
  if (!initials) return;
  try {
    await api('POST', '/api/tracker/people', { initials, full_name: fullName || null });
    el('person-initials').value = '';
    el('person-fullname').value = '';
    await refreshPeople();
  } catch (err) {
    alert('Add failed: ' + err.message);
  }
});

// Exported for later tasks (inline edits, drawer, etc.)
export { state, api, loadSprint, renderAll, escapeHtml, findNode, patchItem };
