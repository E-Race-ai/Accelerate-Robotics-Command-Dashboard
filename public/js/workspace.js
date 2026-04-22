/* ═══════════════════════════════════════════════════════
   workspace.js — Deal Workspace tab switching + deal switcher
   Import via: <script src="/js/workspace.js"></script>
   Requires: brand.js, escapeHtml (from deal-detail.js or self-defined)
   ═══════════════════════════════════════════════════════ */

/* WHY: escapeHtml is defined in deal-detail.js but workspace.js should be
   self-contained. This guard provides a local definition if not already available. */
if (typeof escapeHtml === 'undefined') {
  function escapeHtml(str) {
    if (str == null) return '';
    var div = document.createElement('div');
    div.textContent = String(str);
    return div.innerHTML;
  }
}

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
/* WHY: Store the last save function so wsFlushSave and wsRetrySave can
   invoke it outside the debounce closure */
var wsLastSaveFn = null;
var wsHashChangeHandler = null;
var wsClickHandler = null;

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
  /* WHY: Remove previous listener to prevent double-fire if initWorkspace is called again */
  if (wsHashChangeHandler) window.removeEventListener('hashchange', wsHashChangeHandler);
  wsHashChangeHandler = function() {
    var h = window.location.hash.replace('#', '');
    if (h && h !== wsCurrentTab && WS_TABS.some(function(t) { return t.id === h; })) {
      switchTab(h);
    }
  };
  window.addEventListener('hashchange', wsHashChangeHandler);

  /* WHY: Close switcher on outside click — standard dropdown UX.
     Registered in initWorkspace so it can be cleaned up on re-init. */
  if (wsClickHandler) document.removeEventListener('click', wsClickHandler);
  wsClickHandler = function(e) {
    if (wsSwitcherOpen && !e.target.closest('.ws-switcher-dropdown') && !e.target.closest('.ws-switcher-btn')) {
      wsSwitcherOpen = false;
      var dropdown = document.getElementById('ws-switcher');
      if (dropdown) dropdown.classList.remove('open');
    }
  };
  document.addEventListener('click', wsClickHandler);
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
          '<span class="ws-deal-arr">' + escapeHtml(arr) + '</span>' +
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
      '<span class="ws-save-text" id="ws-save-text" onclick="wsRetrySave()">Saved</span>' +
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
          (arr ? ' · <span style="color:var(--blue);font-weight:700">' + escapeHtml(arr) + '</span>' : '') +
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

/**
 * Switch to a tab by id. Hides all panels, shows the target.
 * Loads iframe content on first visit (lazy).
 */
function switchTab(tabId) {
  /* WHY: Flush pending auto-save before leaving current tab — prevents data loss
     if user types and immediately clicks another tab */
  wsFlushSave();

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

/* WHY: Force-flush any pending auto-save — used before tab switches to prevent data loss */
async function wsFlushSave() {
  if (wsSaveTimer && wsLastSaveFn) {
    clearTimeout(wsSaveTimer);
    wsSaveTimer = null;
    try {
      await wsLastSaveFn();
      wsSetSaveState('saved');
    } catch (e) {
      wsSetSaveState('error');
    }
    wsLastSaveFn = null;
  }
}

function wsRetrySave() {
  if (wsLastSaveFn) {
    wsAutoSave(wsLastSaveFn);
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
  wsLastSaveFn = saveFn;
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
