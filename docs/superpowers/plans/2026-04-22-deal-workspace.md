# Deal Workspace — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Transform `admin-deal-detail.html` into a tabbed workspace where users can switch between deal tools (Overview, Assessment, Fleet Design, Proposal, Contacts, Notes) without leaving the page or losing context.

**Architecture:** Client-side tab switching within a single HTML page. A workspace bar sits below the primary branded nav, showing deal identity, tool tabs with status dots, a deal switcher dropdown, and an auto-save indicator. Heavyweight tools (Assessment, Fleet Design) load in iframes to preserve their existing 4000+ line codebases without refactoring. Lightweight panels (Overview, Contacts, Notes) render inline. URL hash tracks the active tab for deep linking.

**Tech Stack:** Vanilla HTML/CSS/JS, existing Express API (`/api/deals`), existing `brand.css` design system

**Spec:** `docs/superpowers/specs/2026-04-22-dashboard-brand-overhaul-design.md` Section 3

---

## File Structure

| File | Responsibility |
|---|---|
| `public/css/brand.css` | ADD: workspace bar styles (`.ws-bar`, `.ws-tab`, `.ws-deal-id`, `.ws-save`, `.ws-switcher`) |
| `public/js/workspace.js` | NEW: tab switching, hash routing, deal switcher dropdown, auto-save indicator |
| `public/admin-deal-detail.html` | REWRITE: becomes workspace host with tab panel containers |
| `public/js/deal-detail.js` | REFACTOR: renders into `#panel-overview` only; remove contacts/notes (moved to own panels) |

---

### Task 1: Add workspace bar CSS to `public/css/brand.css`

**Files:**
- Modify: `public/css/brand.css`

- [ ] **Step 1: Add workspace bar styles at the end of brand.css (before the print overrides)**

Find the line `/* ── Print Overrides` and insert this block before it:

```css
/* ── Workspace Bar ─────────────────────────────────────── */
.ws-bar {
  background: var(--surface);
  border-bottom: 1px solid var(--border);
  padding: 0 28px;
  display: flex;
  align-items: center;
  height: 48px;
  position: sticky;
  /* WHY: 56px = height of brand-nav above; workspace bar sticks directly below */
  top: 56px;
  z-index: 49;
  gap: 0;
}

/* ── Deal identity (left side of workspace bar) ────────── */
.ws-deal-id {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-right: 16px;
  margin-right: 8px;
  border-right: 1px solid var(--border);
  flex-shrink: 0;
}
.ws-deal-stripe {
  width: 4px;
  height: 28px;
  border-radius: 2px;
  flex-shrink: 0;
}
.ws-deal-name {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.88rem;
  font-weight: 700;
  color: var(--text);
  white-space: nowrap;
  max-width: 200px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ws-deal-opp {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--text-faint);
}
.ws-deal-arr {
  font-family: 'Space Grotesk', sans-serif;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--blue);
}

/* ── Deal switcher button ──────────────────────────────── */
.ws-switcher-btn {
  background: none;
  border: none;
  cursor: pointer;
  padding: 4px;
  border-radius: 6px;
  color: var(--text-faint);
  transition: background 0.15s, color 0.15s;
  display: flex;
  align-items: center;
}
.ws-switcher-btn:hover {
  background: var(--badge-blue-bg);
  color: var(--blue);
}

/* ── Deal switcher dropdown ────────────────────────────── */
.ws-switcher-dropdown {
  position: absolute;
  top: 48px;
  left: 0;
  width: 320px;
  max-height: 400px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.12);
  z-index: 100;
  overflow: hidden;
  display: none;
}
.ws-switcher-dropdown.open { display: block; }
.ws-switcher-search {
  width: 100%;
  padding: 10px 14px;
  border: none;
  border-bottom: 1px solid var(--border);
  font-size: 0.82rem;
  outline: none;
  font-family: 'Inter', sans-serif;
}
.ws-switcher-search:focus {
  box-shadow: inset 0 -2px 0 var(--blue);
}
.ws-switcher-list {
  max-height: 340px;
  overflow-y: auto;
}
.ws-switcher-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  cursor: pointer;
  transition: background 0.1s;
  text-decoration: none;
  color: inherit;
}
.ws-switcher-item:hover { background: #f8fafc; }
.ws-switcher-item.current { background: var(--badge-blue-bg); }
.ws-switcher-item .ws-deal-stripe { height: 22px; }

/* ── Tool tabs (center of workspace bar) ───────────────── */
.ws-tabs {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: 8px;
  flex: 1;
}
.ws-tab {
  font-size: 0.78rem;
  font-weight: 600;
  color: var(--text-dim);
  padding: 6px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
  display: flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
  text-decoration: none;
  border: none;
  background: none;
}
.ws-tab:hover { color: var(--blue); background: var(--badge-blue-bg); }
.ws-tab.active {
  color: var(--blue);
  background: var(--badge-blue-bg);
  font-weight: 700;
}
.ws-tab-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

/* ── Auto-save indicator (right side) ──────────────────── */
.ws-save {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  font-size: 0.72rem;
  font-weight: 600;
  flex-shrink: 0;
}
.ws-save-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  transition: background 0.3s;
}
.ws-save-dot.saved { background: var(--green); }
.ws-save-dot.saving { background: var(--blue); animation: ws-pulse 1s ease-in-out infinite; }
.ws-save-dot.error { background: #dc2626; }
.ws-save-text { color: var(--text-faint); }
.ws-save-text.saving { color: var(--blue); }
.ws-save-text.error { color: #dc2626; cursor: pointer; }

@keyframes ws-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

/* ── Tab panels ────────────────────────────────────────── */
.ws-panel { display: none; }
.ws-panel.active { display: block; }
.ws-panel-iframe {
  width: 100%;
  border: none;
  /* WHY: 104px = brand-nav (56px) + workspace bar (48px); iframe fills remaining viewport */
  min-height: calc(100vh - 104px);
}
```

- [ ] **Step 2: Update print overrides to hide workspace bar**

Find the existing `@media print {` block and add inside it:

```css
  .ws-bar { display: none; }
  .ws-panel-iframe { min-height: auto; height: auto; }
```

- [ ] **Step 3: Verify the CSS is valid**

Run: `head -5 public/css/brand.css && tail -5 public/css/brand.css`
Expected: File starts with comment block, ends with closing `}` of print block

- [ ] **Step 4: Commit**

```bash
git add public/css/brand.css
git commit -m "feat(workspace): add workspace bar CSS to design system

Problem: No styles exist for the deal workspace two-level navigation.

Solution: Added workspace bar (.ws-bar), deal identity (.ws-deal-id),
deal switcher dropdown (.ws-switcher-*), tool tabs (.ws-tab) with status
dots, auto-save indicator (.ws-save), tab panels (.ws-panel), and iframe
container (.ws-panel-iframe) to brand.css. Includes print overrides."
```

---

### Task 2: Create `public/js/workspace.js` — Tab switching, deal switcher, hash routing

**Files:**
- Create: `public/js/workspace.js`

- [ ] **Step 1: Create the workspace JS file**

```javascript
/* ═══════════════════════════════════════════════════════
   workspace.js — Deal Workspace tab switching + deal switcher
   Import via: <script src="/js/workspace.js"></script>
   Requires: brand.js (for initCounters, initRevealAnimations)
   ═══════════════════════════════════════════════════════ */

/* WHY: Default tabs define the workspace structure. Each tab has an id,
   label, and optional iframe src pattern. Tabs without iframeSrc render
   inline content in their panel div. */
var WS_TABS = [
  { id: 'overview',   label: 'Overview',      icon: '📋' },
  { id: 'assessment', label: 'Assessment',    icon: '🔍', iframeSrc: '/pages/assessment.html?id={assessmentId}' },
  { id: 'fleet',      label: 'Fleet Design',  icon: '🤖', iframeSrc: '/pages/fleet-designer.html' },
  { id: 'proposal',   label: 'Proposals',     icon: '📄' },
  { id: 'contacts',   label: 'Contacts',      icon: '👥' },
  { id: 'notes',      label: 'Notes',         icon: '📝' },
];

/* WHY: Stage colors match STAGE_COLORS in deal-detail.js — duplicated here
   so workspace.js is self-contained and doesn't depend on load order */
var WS_STAGE_COLORS = {
  lead: '#64748b', qualified: '#0891b2', site_walk: '#7c3aed',
  configured: '#0055ff', proposed: '#d97706', negotiation: '#f59e0b',
  won: '#16a34a', deploying: '#22c55e', active: '#059669', lost: '#dc2626',
};

var wsCurrentTab = 'overview';
var wsDeal = null;
var wsAllDeals = [];
var wsSwitcherOpen = false;
var wsLoadedTabs = {};
/* WHY: Track save state so the indicator can show Saved/Saving/Error */
var wsSaveTimer = null;

/**
 * Initialize the workspace. Called after deal data is loaded.
 * @param {Object} deal — the deal object from the API
 * @param {Array} allDeals — all deals for the switcher dropdown
 */
function initWorkspace(deal, allDeals) {
  wsDeal = deal;
  wsAllDeals = allDeals || [];

  renderWorkspaceBar();
  renderDealSwitcher();

  /* WHY: Read hash from URL to restore tab state on page load / bookmark */
  var hash = window.location.hash.replace('#', '');
  if (hash && WS_TABS.some(function(t) { return t.id === hash; })) {
    wsCurrentTab = hash;
  }

  switchTab(wsCurrentTab);

  /* WHY: Listen for hash changes so browser back/forward navigates tabs */
  window.addEventListener('hashchange', function() {
    var h = window.location.hash.replace('#', '');
    if (h && h !== wsCurrentTab && WS_TABS.some(function(t) { return t.id === h; })) {
      switchTab(h);
    }
  });
}

/**
 * Render the workspace bar HTML into #workspace-bar.
 */
function renderWorkspaceBar() {
  var bar = document.getElementById('workspace-bar');
  if (!bar) return;

  var stageColor = WS_STAGE_COLORS[wsDeal.stage] || '#64748b';
  var arr = wsDeal.value_monthly
    ? '$' + Number(wsDeal.value_monthly).toLocaleString() + '/mo'
    : '';

  bar.innerHTML =
    '<div class="ws-deal-id">' +
      '<div class="ws-deal-stripe" style="background:' + stageColor + '"></div>' +
      '<div>' +
        '<div class="ws-deal-name">' + escapeHtml(wsDeal.name) + '</div>' +
        '<div class="ws-deal-opp">' + escapeHtml(wsDeal.id) + (arr ? ' · ' : '') +
          '<span class="ws-deal-arr">' + arr + '</span>' +
        '</div>' +
      '</div>' +
      '<button class="ws-switcher-btn" onclick="toggleDealSwitcher()" title="Switch deal">' +
        '<svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor"><path d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"/></svg>' +
      '</button>' +
    '</div>' +
    '<div class="ws-tabs">' +
      WS_TABS.map(function(t) {
        return '<button class="ws-tab' + (t.id === wsCurrentTab ? ' active' : '') + '" ' +
          'data-tab="' + t.id + '" onclick="switchTab(\'' + t.id + '\')">' +
          '<span style="font-size:0.85rem">' + t.icon + '</span> ' + t.label +
          '<span class="ws-tab-dot" id="ws-dot-' + t.id + '"></span>' +
        '</button>';
      }).join('') +
    '</div>' +
    '<div class="ws-save">' +
      '<div class="ws-save-dot saved" id="ws-save-dot"></div>' +
      '<span class="ws-save-text" id="ws-save-text">Saved</span>' +
    '</div>';
}

/**
 * Render the deal switcher dropdown into #ws-switcher.
 */
function renderDealSwitcher() {
  var container = document.getElementById('ws-switcher');
  if (!container) return;

  container.innerHTML =
    '<input class="ws-switcher-search" placeholder="Search deals..." oninput="filterDealSwitcher(this.value)">' +
    '<div class="ws-switcher-list" id="ws-switcher-list"></div>';

  renderDealSwitcherList('');
}

function renderDealSwitcherList(query) {
  var list = document.getElementById('ws-switcher-list');
  if (!list) return;

  var q = (query || '').toLowerCase();
  var filtered = wsAllDeals.filter(function(d) {
    if (!q) return true;
    return (d.name || '').toLowerCase().indexOf(q) !== -1 ||
           (d.id || '').toLowerCase().indexOf(q) !== -1;
  });

  list.innerHTML = filtered.map(function(d) {
    var color = WS_STAGE_COLORS[d.stage] || '#64748b';
    var isCurrent = d.id === wsDeal.id;
    var arr = d.value_monthly ? '$' + Number(d.value_monthly).toLocaleString() + '/mo' : '';
    return '<a class="ws-switcher-item' + (isCurrent ? ' current' : '') + '" ' +
      'href="/admin/deals/' + encodeURIComponent(d.id) + '#' + wsCurrentTab + '">' +
      '<div class="ws-deal-stripe" style="background:' + color + '"></div>' +
      '<div>' +
        '<div style="font-weight:700;font-size:0.82rem;color:var(--text)">' + escapeHtml(d.name) + '</div>' +
        '<div style="font-size:0.65rem;color:var(--text-faint)">' + escapeHtml(d.id) +
          (arr ? ' · <span style="color:var(--blue);font-weight:700">' + arr + '</span>' : '') +
        '</div>' +
      '</div>' +
    '</a>';
  }).join('');
}

function toggleDealSwitcher() {
  var dropdown = document.getElementById('ws-switcher');
  if (!dropdown) return;
  wsSwitcherOpen = !wsSwitcherOpen;
  dropdown.classList.toggle('open', wsSwitcherOpen);
  if (wsSwitcherOpen) {
    var input = dropdown.querySelector('.ws-switcher-search');
    if (input) { input.value = ''; input.focus(); }
    renderDealSwitcherList('');
  }
}

function filterDealSwitcher(query) {
  renderDealSwitcherList(query);
}

/* WHY: Close switcher on outside click — standard dropdown UX */
document.addEventListener('click', function(e) {
  if (wsSwitcherOpen && !e.target.closest('.ws-switcher-dropdown') && !e.target.closest('.ws-switcher-btn')) {
    wsSwitcherOpen = false;
    var dropdown = document.getElementById('ws-switcher');
    if (dropdown) dropdown.classList.remove('open');
  }
});

/**
 * Switch to a tab by id. Hides all panels, shows the target.
 * Loads iframe content on first visit (lazy).
 */
function switchTab(tabId) {
  wsCurrentTab = tabId;

  /* Update URL hash without triggering hashchange listener */
  if (window.location.hash !== '#' + tabId) {
    history.replaceState(null, '', '#' + tabId);
  }

  /* Update tab button active states */
  document.querySelectorAll('.ws-tab').forEach(function(btn) {
    btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
  });

  /* Hide all panels, show target */
  document.querySelectorAll('.ws-panel').forEach(function(panel) {
    panel.classList.remove('active');
  });
  var target = document.getElementById('panel-' + tabId);
  if (target) target.classList.add('active');

  /* Lazy-load iframe tabs on first visit */
  var tabDef = WS_TABS.find(function(t) { return t.id === tabId; });
  if (tabDef && tabDef.iframeSrc && !wsLoadedTabs[tabId]) {
    var iframe = target ? target.querySelector('iframe') : null;
    if (iframe) {
      var src = tabDef.iframeSrc;
      /* WHY: Replace {assessmentId} placeholder with the deal's linked assessment ID */
      if (wsDeal._assessmentId) {
        src = src.replace('{assessmentId}', wsDeal._assessmentId);
      } else {
        /* No assessment yet — pass deal_id so assessment page can create one linked to this deal */
        src = src.replace('?id={assessmentId}', '?deal_id=' + encodeURIComponent(wsDeal.id));
      }
      iframe.src = src;
      wsLoadedTabs[tabId] = true;
    }
  }
}

/**
 * Update the auto-save indicator.
 * @param {'saved'|'saving'|'error'} state
 * @param {string} [message] — optional override text
 */
function wsSetSaveState(state, message) {
  var dot = document.getElementById('ws-save-dot');
  var text = document.getElementById('ws-save-text');
  if (!dot || !text) return;

  dot.className = 'ws-save-dot ' + state;
  text.className = 'ws-save-text' + (state !== 'saved' ? ' ' + state : '');

  if (message) {
    text.textContent = message;
  } else if (state === 'saved') {
    text.textContent = 'Saved';
  } else if (state === 'saving') {
    text.textContent = 'Saving…';
  } else if (state === 'error') {
    text.textContent = 'Save failed — click to retry';
  }
}

/**
 * Debounced auto-save. Call on every form change.
 * @param {Function} saveFn — async function that performs the save
 */
function wsAutoSave(saveFn) {
  if (wsSaveTimer) clearTimeout(wsSaveTimer);
  wsSetSaveState('saving');
  /* WHY: 500ms debounce — spec requirement. Fires after last keystroke settles. */
  wsSaveTimer = setTimeout(async function() {
    try {
      await saveFn();
      wsSetSaveState('saved');
    } catch (e) {
      wsSetSaveState('error');
    }
  }, 500);
}

/**
 * Update tab status dots based on deal data.
 * @param {Object} statuses — { assessment: 'complete'|'in_progress'|'not_started', ... }
 */
function wsUpdateTabDots(statuses) {
  var colorMap = {
    complete: '#16a34a',      /* green */
    in_progress: '#f59e0b',   /* amber */
    not_started: '#e5e7eb',   /* gray */
  };

  Object.keys(statuses).forEach(function(tabId) {
    var dot = document.getElementById('ws-dot-' + tabId);
    if (dot) {
      dot.style.background = colorMap[statuses[tabId]] || 'transparent';
    }
  });
}
```

- [ ] **Step 2: Verify file created correctly**

Run: `wc -l public/js/workspace.js && head -3 public/js/workspace.js`
Expected: ~230 lines, starts with comment block

- [ ] **Step 3: Commit**

```bash
git add public/js/workspace.js
git commit -m "feat(workspace): create workspace.js — tab switching, deal switcher, hash routing

Problem: No client-side logic exists for workspace tab navigation,
deal switching, or auto-save indication.

Solution: workspace.js with initWorkspace (bar render + hash restore),
switchTab (panel show/hide + lazy iframe load), deal switcher dropdown
(search, filter, navigate), wsAutoSave (debounced with indicator),
and wsUpdateTabDots (status dot colors)."
```

---

### Task 3: Restructure `admin-deal-detail.html` into workspace host

**Files:**
- Modify: `public/admin-deal-detail.html`

This is the biggest task — the page gets restructured from a single-view deal page into a tabbed workspace host.

- [ ] **Step 1: Add workspace.js import**

After the `brand.js` script tag (line 470), add:

```html
<script src="/js/workspace.js"></script>
```

- [ ] **Step 2: Add workspace bar HTML after the branded nav**

Find `</nav>` (end of brand-nav, around line 243) and add immediately after:

```html
    <!-- Workspace bar -->
    <div class="ws-bar" id="workspace-bar">
      <!-- Populated by workspace.js -->
    </div>
    <div class="ws-switcher-dropdown" id="ws-switcher">
      <!-- Populated by workspace.js -->
    </div>
```

- [ ] **Step 3: Wrap existing main content as the Overview panel**

Find `<main class="max-w-7xl mx-auto px-6 py-8">` and replace with:

```html
    <!-- ═══ Tab Panels ═══ -->

    <!-- Overview panel (existing deal detail content) -->
    <div class="ws-panel active" id="panel-overview">
      <main class="max-w-7xl mx-auto px-6 py-8">
```

Find the closing `</main>` before the modals and add after it:

```html
      </main>
    </div>

    <!-- Assessment panel (iframe) -->
    <div class="ws-panel" id="panel-assessment">
      <iframe class="ws-panel-iframe" id="iframe-assessment" title="Property Assessment"></iframe>
    </div>

    <!-- Fleet Design panel (iframe) -->
    <div class="ws-panel" id="panel-fleet">
      <iframe class="ws-panel-iframe" id="iframe-fleet" title="Fleet Designer"></iframe>
    </div>

    <!-- Proposals panel -->
    <div class="ws-panel" id="panel-proposal">
      <main class="max-w-7xl mx-auto px-6 py-8">
        <h2 class="headline text-xl font-bold text-gray-900 mb-6">Proposals & Documents</h2>
        <div id="proposals-panel-grid" class="proposals-grid"></div>
      </main>
    </div>

    <!-- Contacts panel -->
    <div class="ws-panel" id="panel-contacts">
      <main class="max-w-7xl mx-auto px-6 py-8">
        <div class="flex items-center justify-between mb-6">
          <h2 class="headline text-xl font-bold text-gray-900">Contacts</h2>
          <button onclick="openContactModal()" class="brand-btn-primary">+ Add Contact</button>
        </div>
        <div id="contacts-panel-list" class="grid grid-cols-1 md:grid-cols-2 gap-4"></div>
      </main>
    </div>

    <!-- Notes panel -->
    <div class="ws-panel" id="panel-notes">
      <main class="max-w-7xl mx-auto px-6 py-8">
        <h2 class="headline text-xl font-bold text-gray-900 mb-6">Notes</h2>
        <textarea id="notes-editor"
                  class="w-full min-h-[300px] p-4 rounded-xl border border-gray-200 text-sm resize-y"
                  style="font-family:'Inter',sans-serif;"
                  placeholder="Meeting notes, call logs, site visit observations..."
                  oninput="onNotesChange()"></textarea>
        <p class="text-xs text-gray-400 mt-2">Changes auto-save after 500ms</p>
      </main>
    </div>
```

- [ ] **Step 4: Remove the "Back to Deals" link**

Find and remove the back link block (the `<a href="/admin/deals" class="inline-flex...">Back to Deals</a>` element). The workspace bar replaces this navigation.

- [ ] **Step 5: Verify the HTML structure is valid**

Run: `grep -c "ws-panel" public/admin-deal-detail.html`
Expected: At least 12 (6 panel divs × 2 for open/close tags)

- [ ] **Step 6: Commit**

```bash
git add public/admin-deal-detail.html
git commit -m "feat(workspace): restructure deal detail into tabbed workspace host

Problem: Deal detail was a single-scroll page with no way to switch
between tools (assessment, fleet, proposals) without navigating away.

Solution: Added workspace bar container, deal switcher dropdown, and
6 tab panel containers (overview, assessment iframe, fleet iframe,
proposals, contacts, notes with editable textarea)."
```

---

### Task 4: Refactor `deal-detail.js` to initialize workspace and render panels

**Files:**
- Modify: `public/js/deal-detail.js`

- [ ] **Step 1: Update `loadDeal()` to fetch all deals and init workspace**

Find the `loadDeal()` function and update it. After the existing deal data loading (after `renderAll()`), add workspace initialization:

```javascript
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

  /* WHY: Fetch all deals for the deal switcher dropdown */
  let allDeals = [];
  try {
    const allRes = await fetch('/api/deals');
    if (allRes.ok) allDeals = await allRes.json();
  } catch (e) { /* Switcher will just be empty */ }

  /* Initialize workspace if workspace.js is loaded */
  if (typeof initWorkspace === 'function') {
    initWorkspace(deal, allDeals);

    /* Set tab status dots based on available data */
    wsUpdateTabDots({
      assessment: deal._assessmentId ? 'in_progress' : 'not_started',
      fleet: 'not_started',
      proposal: availableProposals.length > 0 ? 'complete' : 'not_started',
    });
  }
}
```

- [ ] **Step 2: Add `renderContactsPanel()` for the standalone contacts tab**

After the existing `renderContacts()` function, add a new function that renders contacts into the workspace contacts panel:

```javascript
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
```

- [ ] **Step 3: Add `renderProposalsPanel()` for the standalone proposals tab**

After `renderProposals()`, add:

```javascript
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
```

- [ ] **Step 4: Add notes editor initialization and auto-save**

After `renderNotes()`, add:

```javascript
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
```

- [ ] **Step 5: Update `renderAll()` to also render workspace panels**

Update the `renderAll()` function to call the new panel renderers:

```javascript
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
```

- [ ] **Step 6: Commit**

```bash
git add public/js/deal-detail.js
git commit -m "feat(workspace): wire deal-detail.js to workspace tabs + panel renderers

Problem: deal-detail.js only rendered the single-page view with no
workspace integration.

Solution: loadDeal fetches all deals for switcher + finds linked assessment,
calls initWorkspace. Added renderContactsPanel, renderProposalsPanel,
initNotesEditor with auto-save via wsAutoSave, and wsUpdateTabDots for
assessment/fleet/proposal status indicators."
```

---

### Task 5: Add assessment API endpoint for deal lookup

**Files:**
- Modify: `src/routes/assessments.js` (or create if it doesn't exist)
- Modify: `src/server.js` (mount route if new)

The workspace needs to find a deal's linked assessment to populate the Assessment tab iframe.

- [ ] **Step 1: Check if assessment routes exist**

Run: `ls src/routes/assessment*`

If `src/routes/assessments.js` exists, check if it has a `GET /` with `deal_id` query support. If not, add it:

```javascript
// GET /api/assessments?deal_id=OPP-001
router.get('/', requireAuth, (req, res) => {
  const { deal_id } = req.query;
  let sql = 'SELECT * FROM assessments';
  const params = [];

  if (deal_id) {
    sql += ' WHERE deal_id = ?';
    params.push(deal_id);
  }

  sql += ' ORDER BY updated_at DESC';
  const assessments = db.prepare(sql).all(...params);
  res.json(assessments);
});
```

If the file doesn't exist, create `src/routes/assessments.js` with:

```javascript
const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// WHY: Workspace needs to find a deal's linked assessment to populate the Assessment tab
router.get('/', requireAuth, (req, res) => {
  const { deal_id } = req.query;
  let sql = 'SELECT * FROM assessments';
  const params = [];

  if (deal_id) {
    sql += ' WHERE deal_id = ?';
    params.push(deal_id);
  }

  sql += ' ORDER BY updated_at DESC';
  const assessments = db.prepare(sql).all(...params);
  res.json(assessments);
});

module.exports = router;
```

And mount it in `src/server.js`:

```javascript
app.use('/api/assessments', require('./routes/assessments'));
```

- [ ] **Step 2: Test the endpoint**

Run: `curl -s http://localhost:3000/api/assessments | head -c 200`
Expected: JSON array (may be empty `[]` if no assessments exist)

- [ ] **Step 3: Commit**

```bash
git add src/routes/assessments.js src/server.js
git commit -m "feat(workspace): add GET /api/assessments endpoint for deal lookup

Problem: Workspace Assessment tab needs to find a deal's linked assessment
to pass the correct ID to the assessment iframe.

Solution: GET /api/assessments with optional deal_id query param. Returns
assessments ordered by updated_at DESC."
```

---

### Task 6: Update deal links across the app to use workspace URLs

**Files:**
- Modify: `public/admin-command-center.html`
- Modify: `public/admin-deals.html`
- Modify: `public/js/deals.js`

Deal links currently go to `/admin/deals/OPP-001`. They should go to `/admin/deals/OPP-001#overview` so the workspace opens to the overview tab.

- [ ] **Step 1: Update deal card links in Command Center**

Search `admin-command-center.html` for links to `/admin/deals/${` and append `#overview`:

Find: `href="/admin/deals/${deal.id}"`
Replace with: `href="/admin/deals/${deal.id}#overview"`

- [ ] **Step 2: Update deal card links in Deals page**

In `public/js/deals.js`, find where deal cards link to individual deals and append `#overview`.

- [ ] **Step 3: Commit**

```bash
git add public/admin-command-center.html public/admin-deals.html public/js/deals.js
git commit -m "feat(workspace): update deal links to open workspace with #overview hash

Problem: Deal links opened the old single-page view without a hash,
so the workspace didn't know which tab to show.

Solution: All deal links now append #overview so the workspace opens
to the Overview tab by default."
```

---

### Task 7: Test the full workspace flow

**Files:** None (verification only)

- [ ] **Step 1: Start the dev server**

Run: `npm run dev` (if not already running)

- [ ] **Step 2: Navigate to a deal**

Open: `http://localhost:3000/admin/deals/OPP-001#overview`

Verify:
- Branded nav appears at top with "Deals" active
- Workspace bar appears below with: deal name, OPP ID, ARR, deal switcher arrow, 6 tabs, "Saved" indicator
- Overview tab is active and shows the existing deal detail content (stage bar, facility, challenges, contacts, activity, notes)

- [ ] **Step 3: Test tab switching**

Click each tab and verify:
- **Assessment**: iframe loads the assessment page
- **Fleet Design**: iframe loads the fleet designer
- **Proposals**: shows proposal cards (if deal has proposals)
- **Contacts**: shows contact cards with "+ Add Contact" button
- **Notes**: shows editable textarea with deal notes

- [ ] **Step 4: Test URL hash updates**

After clicking a tab, verify the URL hash changes (e.g., `#contacts`). Reload the page — it should open to the same tab.

- [ ] **Step 5: Test deal switcher**

Click the down-arrow next to the deal name. Verify:
- Dropdown opens with all deals
- Search filters the list
- Current deal is highlighted
- Clicking a different deal navigates to it

- [ ] **Step 6: Test notes auto-save**

On the Notes tab, type some text. Verify:
- "Saving..." appears briefly
- "Saved" appears after save completes
- Refresh the page — notes persist

- [ ] **Step 7: Commit any fixes**

```bash
git add -A
git commit -m "fix(workspace): QA fixes from workspace testing"
```

---

### Task 8: Final integration commit

**Files:** None (git only)

- [ ] **Step 1: Verify all workspace commits**

Run: `git log --oneline | head -10`
Verify the workspace-related commits are clean.

- [ ] **Step 2: Verify no broken pages**

Quick-check each admin page still loads:
- `http://localhost:3000/admin` — Command Center
- `http://localhost:3000/admin/deals` — Deals list
- `http://localhost:3000/admin/deals/OPP-001#overview` — Workspace

- [ ] **Step 3: Done**

The Deal Workspace is complete. Users can now:
- See all deal tools in a tabbed interface
- Switch between Overview, Assessment, Fleet Design, Proposals, Contacts, and Notes
- Switch between deals without leaving the current tool
- Deep-link to specific tabs via URL hash
- Auto-save notes with visual feedback
