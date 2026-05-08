/* AVCast — frontend logic */

const TYPE_META = {
  sonos:           { icon: "♫",  label: "Sonos",            order: 1 },
  chromecast:      { icon: "▣",  label: "Chromecast",       order: 2 },
  appletv:         { icon: "",  label: "Apple TVs",        order: 3 },
  airplay:         { icon: "✈",  label: "AirPlay receivers",order: 4 },
  "personal-airplay":{icon:"⌬",  label: "Personal devices (AirPlay)", order: 20 },
  roku:            { icon: "▶",  label: "Roku TVs",         order: 5 },
  smarttv:         { icon: "▤",  label: "Smart TVs",        order: 6 },
  "spotify-connect":{icon: "♪",  label: "Spotify Connect",  order: 7 },
  homekit:         { icon: "⌂",  label: "HomeKit",          order: 8 },
  hue:             { icon: "✦",  label: "Philips Hue",      order: 9 },
  bluetooth:       { icon: "ᙙ",  label: "Bluetooth (paired)",order: 10 },
  "upnp-renderer": { icon: "◊",  label: "UPnP renderers",   order: 11 },
  upnp:            { icon: "◊",  label: "UPnP devices",     order: 12 },
  printer:         { icon: "⎙",  label: "Printers",         order: 99 },
};

const state = {
  devices: [],
  lastScan: null,
  scanning: false,
  filterTypes: new Set(),
  filterOnline: true,
  filterOffline: true,
  filterPlayingOnly: true,
};

// ---------- API ----------

async function api(path, opts = {}) {
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res.json();
}

// Stable hash of device-list view fields, used to skip no-op re-renders.
function _devicesHash(devs) {
  return JSON.stringify(devs.map(d => ({
    id: d.id, name: d.name, type: d.type, host: d.host,
    online: d.state?.online,
    playing: d.state?.playing,
    muted: d.state?.muted,
    vol: d.state?.volume,
    np: d.state?.now_playing,
    track: d.state?.track || null,
    queue: (d.state?.queue_next || []).length,
  })));
}
let _lastDevicesHash = null;

async function loadDevices() {
  try {
    const data = await api("/api/devices");
    state.devices = data.devices || [];
    state.lastScan = data.last_scan;
    state.scanning = data.scanning;
    const h = _devicesHash(state.devices);
    if (h !== _lastDevicesHash) {
      _lastDevicesHash = h;
      render();
    } else {
      // Nothing actually changed — only refresh the KPI timestamp.
      const t = document.getElementById("kpi-time");
      if (t && state.lastScan) t.textContent = new Date(state.lastScan * 1000).toLocaleTimeString();
    }
  } catch (e) {
    toast(`Failed to load devices: ${e.message}`, "error");
  }
}

// ---------- Live Cast (replaces one-shot rescan) ----------
// ON  → kicks off an immediate discovery scan + sets up auto-rescan every 60s.
// OFF → clears the auto-rescan loop. Periodic device polling stays on either way.
let _liveCastTimer = null;
const LIVECAST_INTERVAL_MS = 60_000;

function _setLiveCastUI(isOn) {
  const g = document.getElementById("livecast-btn");
  const lbl = document.getElementById("livecast-label");
  if (g) g.classList.toggle("is-live", isOn);
  if (lbl) lbl.textContent = isOn ? "● LIVE CAST ON" : "LIVE CAST OFF";
}

async function _doLiveCastScan(pw) {
  try {
    const r = await fetch("/api/discover", {
      method: "POST",
      headers: { "X-Rescan-Password": pw },
    });
    if (r.status === 401) {
      sessionStorage.removeItem("avcast_rescan_pw");
      return { ok: false, auth: false };
    }
    return { ok: r.ok, auth: true };
  } catch {
    return { ok: false, auth: true };
  }
}

async function toggleLiveCast() {
  // Currently ON → turn OFF
  if (_liveCastTimer) {
    clearInterval(_liveCastTimer);
    _liveCastTimer = null;
    _setLiveCastUI(false);
    toast("Live Cast paused");
    return;
  }
  // Currently OFF → turn ON (gated by password — auto-rescan triggers real scans)
  let pw = sessionStorage.getItem("avcast_rescan_pw");
  if (!pw) {
    pw = prompt("Live Cast password:");
    if (!pw) return;
  }
  const lbl = document.getElementById("livecast-label");
  const orig = lbl?.textContent;
  if (lbl) lbl.textContent = "⌛ STARTING";
  const res = await _doLiveCastScan(pw);
  if (!res.auth) { if (lbl) lbl.textContent = orig; toast("Wrong password", "error"); return; }
  if (!res.ok)   { if (lbl) lbl.textContent = orig; toast("Failed to start scan", "error"); return; }
  sessionStorage.setItem("avcast_rescan_pw", pw);
  _setLiveCastUI(true);
  toast(`Live Cast active — auto-rescan every ${LIVECAST_INTERVAL_MS / 1000}s`, "success");
  setTimeout(loadDevices, 8000);
  _liveCastTimer = setInterval(() => _doLiveCastScan(pw), LIVECAST_INTERVAL_MS);
}

async function setVolume(deviceId, level, sliderEl) {
  const numEl = sliderEl.parentElement.querySelector(".volume-num");
  numEl.textContent = level;
  try {
    const r = await api(`/api/device/${encodeURIComponent(deviceId)}/volume?level=${level}`, { method: "POST" });
    if (!r.ok) toast(r.error || "Volume set failed", "error");
  } catch (e) {
    toast(e.message, "error");
  }
}

async function toggleMute(deviceId, currentlyMuted, btnEl) {
  btnEl.disabled = true;
  try {
    const r = await api(`/api/device/${encodeURIComponent(deviceId)}/mute?on=${!currentlyMuted}`, { method: "POST" });
    if (r.ok) {
      btnEl.classList.toggle("muted", !currentlyMuted);
      btnEl.textContent = !currentlyMuted ? "🔇 Muted" : "🔊 Mute";
      const dev = state.devices.find(d => d.id === deviceId);
      if (dev) dev.state.muted = !currentlyMuted;
    } else toast(r.error, "error");
  } catch (e) { toast(e.message, "error"); }
  finally { btnEl.disabled = false; }
}

async function doPlayback(deviceId, action, btnEl) {
  btnEl.disabled = true;
  try {
    const r = await api(`/api/device/${encodeURIComponent(deviceId)}/playback?action=${action}`, { method: "POST" });
    if (!r.ok) toast(r.error, "error");
    else toast(`${action} → ${deviceId.split(":")[1].slice(0,8)}`, "success");
    setTimeout(loadDevices, 800);
  } catch (e) { toast(e.message, "error"); }
  finally { btnEl.disabled = false; }
}

async function pingDevice(deviceId) {
  try {
    const r = await api(`/api/device/${encodeURIComponent(deviceId)}/ping`, { method: "POST" });
    return r;
  } catch (e) { return { online: false }; }
}

// Browser-side internet speed check using Cloudflare's anycast download endpoint.
// Measures latency (single small probe) + sustained download throughput on a ~25MB payload.
async function runSpeedCheck() {
  const btn = document.getElementById("speed-check-btn");
  const resultEl = document.getElementById("speed-check-result");
  if (!btn || !resultEl) return;
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = "⏳ Testing…";
  resultEl.innerHTML = `<div class="sc-status">Measuring latency…</div>`;
  try {
    // Latency: 3 small probes, take the best to avoid one-off jitter.
    const pings = [];
    for (let i = 0; i < 3; i++) {
      const t0 = performance.now();
      await fetch("https://speed.cloudflare.com/__down?bytes=1", { cache: "no-store" });
      pings.push(performance.now() - t0);
    }
    const latency = Math.round(Math.min(...pings));
    resultEl.innerHTML = `
      <div class="sc-row"><span class="sc-label">Latency</span><span class="sc-val">${latency} ms</span></div>
      <div class="sc-status">Measuring download…</div>`;

    // Download: ~25MB payload. Cap at 8s so a slow connection still returns a number.
    const sizeMB = 25;
    const url = `https://speed.cloudflare.com/__down?bytes=${sizeMB * 1024 * 1024}`;
    const ctrl = new AbortController();
    const tCap = setTimeout(() => ctrl.abort(), 8000);
    const dlStart = performance.now();
    let received = 0;
    const r = await fetch(url, { cache: "no-store", signal: ctrl.signal });
    const reader = r.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.length;
    }
    clearTimeout(tCap);
    const dlMs = performance.now() - dlStart;
    const mbps = ((received * 8) / 1_000_000) / (dlMs / 1000);
    resultEl.innerHTML = `
      <div class="sc-row"><span class="sc-label">Latency</span><span class="sc-val">${latency} ms</span></div>
      <div class="sc-row"><span class="sc-label">Download</span><span class="sc-val sc-accent">${mbps.toFixed(1)} Mbps</span></div>
      <div class="sc-time">tested ${new Date().toLocaleTimeString()}</div>`;
  } catch (e) {
    resultEl.innerHTML = `<div class="sc-error">Test failed: ${e.message || "network error"}</div>`;
  }
  btn.disabled = false;
  btn.textContent = orig;
}

async function testPingAll() {
  toast(`Pinging ${state.devices.filter(d => d.host).length} hosts…`);
  const results = await Promise.all(
    state.devices.filter(d => d.host).map(d => pingDevice(d.id))
  );
  const up = results.filter(r => r.online).length;
  toast(`Health check: ${up}/${results.length} online`, "success");
  loadDevices();
}

// ---------- Rendering ----------

function render() {
  renderKpis();
  renderTypeFilters();
  renderGroups();
}

// One-shot count-up animation for KPI numbers — fires once on first render,
// subsequent renders update text directly so the gentle 12s refresh doesn't
// re-trigger the animation. Easing matches the WiFi Audit page (ease-out cubic).
let _kpiAnimated = false;
function animateNum(el, to, dur = 1800, fmt = v => Math.round(v)) {
  if (!el) return;
  const start = performance.now();
  function tick(t) {
    const p = Math.min(1, (t - start) / dur);
    const eased = 1 - Math.pow(1 - p, 3);
    el.textContent = fmt(to * eased);
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
function _setKpi(el, value) {
  if (!el) return;
  if (_kpiAnimated) el.textContent = value;
  else animateNum(el, value);
}

function renderKpis() {
  const total = state.devices.length;
  const controllable = state.devices.filter(d => (d.capabilities || []).includes("volume")).length;
  const online = state.devices.filter(d => d.state?.online !== false).length;
  const playing = state.devices.filter(d => d.state?.playing === true).length;
  const offline = total - online;

  _setKpi(document.getElementById("kpi-total"), total);
  _setKpi(document.getElementById("kpi-controllable"), controllable);
  _setKpi(document.getElementById("kpi-online"), online);
  document.getElementById("kpi-time").textContent = state.lastScan
    ? new Date(state.lastScan * 1000).toLocaleTimeString()
    : "never";

  const typeCounts = {};
  for (const d of state.devices) typeCounts[d.type] = (typeCounts[d.type] || 0) + 1;

  const tiles = [
    { label: "Total devices", value: total, sub: `${Object.keys(typeCounts).length} unique types` },
    { label: "Controllable", value: controllable, sub: "Volume + playback API" },
    { label: "Online", value: online, sub: `${offline} offline` },
    { label: "Playing now", value: playing, sub: playing ? "Active streams" : "Idle" },
  ];

  // top types
  const top = Object.entries(typeCounts).sort((a,b) => b[1]-a[1]).slice(0, 2);
  for (const [t, n] of top) {
    tiles.push({
      label: TYPE_META[t]?.label || t,
      value: n,
      sub: `${TYPE_META[t]?.icon || "•"} on network`,
    });
  }

  const grid = document.getElementById("kpi-grid");
  grid.innerHTML = tiles.map(t => `
    <div class="kpi">
      <div class="kpi-label">${t.label}</div>
      <div class="kpi-value" data-target="${t.value}">${_kpiAnimated ? t.value : 0}</div>
      <div class="kpi-sub">${t.sub || ""}</div>
    </div>
  `).join("");

  if (!_kpiAnimated) {
    grid.querySelectorAll(".kpi-value").forEach(el => {
      animateNum(el, parseInt(el.dataset.target, 10) || 0);
    });
    _kpiAnimated = true;
  }
}

// `state.filterTypes` is the set of types HIDDEN by the user.
// Empty = nothing hidden = show all. Checkbox checked = visible.
function renderTypeFilters() {
  const counts = {};
  for (const d of state.devices) counts[d.type] = (counts[d.type] || 0) + 1;
  const types = Object.keys(counts).sort((a, b) =>
    (TYPE_META[a]?.order || 99) - (TYPE_META[b]?.order || 99));

  const container = document.getElementById("type-filters");
  container.innerHTML = types.map(t => {
    const m = TYPE_META[t] || { icon: "•", label: t };
    const visible = !state.filterTypes.has(t);
    return `<label class="chip ${visible ? "active" : ""}">
      <input type="checkbox" data-type="${t}" ${visible ? "checked" : ""}>
      ${m.icon} ${m.label} <span style="opacity:.6">(${counts[t]})</span>
    </label>`;
  }).join("");

  container.querySelectorAll("input").forEach(inp => {
    inp.addEventListener("change", () => {
      const t = inp.dataset.type;
      // checked = visible → remove from hidden set; unchecked = hide → add to hidden set
      if (inp.checked) state.filterTypes.delete(t); else state.filterTypes.add(t);
      renderGroups();
      renderTypeFilters();
    });
  });
}

function passesFilter(d) {
  if (state.filterTypes.has(d.type)) return false;
  const online = d.state?.online !== false;
  if (online && !state.filterOnline) return false;
  if (!online && !state.filterOffline) return false;
  // "Playing now" is now a spotlight toggle, not a restrictive filter — see body.playing-spotlight CSS.
  return true;
}

function renderGroups() {
  document.body.classList.toggle("playing-spotlight", state.filterPlayingOnly);
  const visible = state.devices.filter(passesFilter);
  const empty = document.getElementById("empty");
  const groups = document.getElementById("device-groups");

  // Preserve hydrated special panels across device-list refreshes so they don't flicker.
  const preservedPrinter = document.getElementById("printer-panel");
  const preservedPrinterHTML = (preservedPrinter && !preservedPrinter.querySelector(".hue-loading"))
    ? preservedPrinter.innerHTML : null;
  const preservedHue = document.getElementById("hue-panel");
  const preservedHueHTML = (preservedHue && !preservedHue.querySelector(".hue-loading"))
    ? preservedHue.innerHTML : null;

  if (visible.length === 0) {
    groups.innerHTML = "";
    empty.classList.remove("hidden");
    return;
  }
  empty.classList.add("hidden");

  // group by type
  const byType = {};
  for (const d of visible) {
    (byType[d.type] = byType[d.type] || []).push(d);
  }
  const sortedTypes = Object.keys(byType).sort((a, b) =>
    (TYPE_META[a]?.order || 99) - (TYPE_META[b]?.order || 99));

  groups.innerHTML = sortedTypes.map(t => {
    const m = TYPE_META[t] || { icon: "•", label: t };
    // Special panel for Hue — full control surface, not a basic card
    if (t === "printer") {
      return `
        <section class="group">
          <header class="group-header">
            <div class="group-title"><span class="group-icon">${m.icon}</span> ${m.label}</div>
            <div class="group-count">${byType[t].length} device${byType[t].length === 1 ? "" : "s"}</div>
          </header>
          <div id="printer-panel" class="printer-panel">
            <div class="hue-loading">Querying SNMP for live printer status…</div>
          </div>
        </section>
      `;
    }
    if (t === "hue") {
      return `
        <section class="group">
          <header class="group-header">
            <div class="group-title"><span class="group-icon">${m.icon}</span> ${m.label}</div>
            <div class="group-count">${byType[t].length} bridge${byType[t].length === 1 ? "" : "s"}</div>
          </header>
          <div id="hue-panel" class="hue-panel">
            <div class="hue-loading">Loading Hue control surface…</div>
          </div>
        </section>
      `;
    }
    const cards = byType[t].map(renderCard).join("");
    return `
      <section class="group">
        <header class="group-header">
          <div class="group-title"><span class="group-icon">${m.icon}</span> ${m.label}</div>
          <div class="group-count">${byType[t].length} ${byType[t].length === 1 ? "device" : "devices"}</div>
        </header>
        <div class="cards">${cards}</div>
      </section>
    `;
  }).join("");

  // Restore preserved special-panel content (avoids flicker during device-list refresh)
  const newPrinter = document.getElementById("printer-panel");
  if (newPrinter && preservedPrinterHTML) newPrinter.innerHTML = preservedPrinterHTML;
  const newHue = document.getElementById("hue-panel");
  if (newHue && preservedHueHTML) newHue.innerHTML = preservedHueHTML;

  // First-load hydration only. Subsequent updates happen on their own timers.
  if (newHue && !preservedHueHTML) renderHuePanel();
  if (newPrinter && !preservedPrinterHTML) renderPrinterPanel();

  // wire up controls
  groups.querySelectorAll(".volume-slider").forEach(sl => {
    sl.addEventListener("input", e => {
      e.target.parentElement.querySelector(".volume-num").textContent = e.target.value;
    });
    let timer;
    sl.addEventListener("change", e => {
      clearTimeout(timer);
      timer = setTimeout(() => setVolume(e.target.dataset.id, parseInt(e.target.value, 10), e.target), 50);
    });
  });

  groups.querySelectorAll("[data-action]").forEach(btn => {
    btn.addEventListener("click", e => {
      const id = btn.dataset.id;
      const action = btn.dataset.action;
      if (action === "mute") {
        toggleMute(id, btn.dataset.muted === "true", btn);
      } else {
        doPlayback(id, action, btn);
      }
    });
  });
}

function _hmsToSec(hms) {
  if (!hms || typeof hms !== "string") return null;
  const parts = hms.split(":").map(Number);
  if (parts.some(isNaN)) return null;
  let s = 0;
  for (const p of parts) s = s * 60 + p;
  return s;
}
function _secToHMS(s) {
  if (s == null || isNaN(s)) return "—";
  s = Math.max(0, Math.floor(s));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
  return `${m}:${String(sec).padStart(2,"0")}`;
}

function renderCard(d) {
  const online = d.state?.online !== false;
  const playing = d.state?.playing === true;
  const muted = d.state?.muted === true;
  const vol = d.state?.volume;
  const np = d.state?.now_playing;
  const tr = d.state?.track || {};
  const queueNext = d.state?.queue_next || [];
  const caps = d.capabilities || [];
  const hasVolume = caps.includes("volume");
  const hasPlay = caps.includes("play");
  const hasMute = caps.includes("mute");
  const hasNext = caps.includes("next");
  const hasPrev = caps.includes("previous");
  const hasStop = caps.includes("stop");

  const meta = [];
  if (d.host) meta.push(d.host);
  if (d.model) meta.push(d.model);
  if (d.state?.latency_ms != null) meta.push(`${d.state.latency_ms}ms`);
  if (d.state?.group && d.state.group !== d.name) meta.push(`group: ${d.state.group}`);

  const badges = [];
  if (hasVolume) badges.push(`<span class="badge controllable">Controllable</span>`);
  else if (d.type === "appletv") badges.push(`<span class="badge warn" title="Apple TV control needs pyatv pairing — not yet implemented">View only · Pairing required</span>`);
  else if (d.type === "personal-airplay") badges.push(`<span class="badge">Personal device</span>`);
  if (d.manufacturer) badges.push(`<span class="badge">${escapeHtml(d.manufacturer)}</span>`);
  if (d.state?.app) badges.push(`<span class="badge">${escapeHtml(d.state.app)}</span>`);
  if (d.raw?.discovered_via) badges.push(`<span class="badge" title="Found via ${d.raw.discovered_via}">${d.raw.discovered_via.includes("probe") ? "Direct probe" : "mDNS"}</span>`);

  // Position / duration handling — Sonos gives "h:mm:ss", Chromecast gives seconds.
  const posSec = tr.position_sec != null ? tr.position_sec : _hmsToSec(tr.position);
  const durSec = tr.duration != null && typeof tr.duration === "number"
    ? tr.duration
    : _hmsToSec(tr.duration);
  const pct = (posSec != null && durSec && durSec > 0) ? Math.min(100, (posSec / durSec) * 100) : 0;

  const hasTrack = !!(tr.title || tr.artist || np);
  const albumArt = tr.album_art && /^https?:\/\//i.test(tr.album_art) ? tr.album_art : null;

  // Build now-playing block
  let nowPlayingBlock = "";
  if (hasTrack) {
    const title = tr.title || np || "—";
    const artist = tr.artist || "";
    const album = tr.album || "";
    nowPlayingBlock = `
      <div class="np-block ${playing ? "is-playing" : "is-paused"}">
        ${albumArt ? `<img class="np-art" src="${escapeHtml(albumArt)}" alt="" onerror="this.style.display='none'">` : `<div class="np-art np-art-placeholder">♪</div>`}
        <div class="np-text">
          <div class="np-label">${playing ? "Now playing" : "Paused"}</div>
          <div class="np-title" title="${escapeHtml(title)}">${escapeHtml(title)}</div>
          ${artist ? `<div class="np-artist">${escapeHtml(artist)}</div>` : ""}
          ${album ? `<div class="np-album">${escapeHtml(album)}</div>` : ""}
        </div>
      </div>
      ${(durSec || posSec != null) ? `
        <div class="progress" data-id="${d.id}" data-pos="${posSec ?? 0}" data-dur="${durSec ?? 0}" data-playing="${playing}">
          <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
          <div class="progress-times">
            <span class="progress-elapsed">${_secToHMS(posSec)}</span>
            <span class="progress-total">${_secToHMS(durSec)}</span>
          </div>
        </div>` : ""}
    `;
  }

  // Up-next (Sonos queue)
  let queueBlock = "";
  if (queueNext.length > 0) {
    queueBlock = `
      <details class="queue-block">
        <summary>Up next · ${queueNext.length}</summary>
        <ol class="queue-list">
          ${queueNext.map(q => `<li>${escapeHtml(q)}</li>`).join("")}
        </ol>
      </details>
    `;
  }

  return `
    <div class="card ${online ? "" : "offline"} ${playing ? "playing" : ""}">
      <div class="card-head">
        <div style="flex:1; min-width:0;">
          <div class="card-name" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</div>
          <div class="card-meta">${meta.map(escapeHtml).join(" · ")}</div>
          <div style="margin-top:6px;">${badges.join(" ")}</div>
        </div>
        <span class="status-dot ${online ? "online" : "offline"}" title="${online ? "online" : "offline"}"></span>
      </div>
      ${nowPlayingBlock}
      ${queueBlock}
      ${hasVolume ? `
        <div class="volume-row">
          <span class="volume-icon">${muted ? "🔇" : "🔉"}</span>
          <input type="range" class="volume-slider" min="0" max="100"
                 value="${vol ?? 50}" data-id="${d.id}" ${online ? "" : "disabled"}>
          <span class="volume-num">${vol ?? "—"}</span>
          ${hasMute ? `
            <button class="act-btn act-mini ${muted ? "muted" : ""}" data-id="${d.id}" data-action="mute" data-muted="${muted}" ${online ? "" : "disabled"} title="${muted ? "Unmute" : "Mute"}">
              ${muted ? "🔇" : "🔊"}
            </button>` : ""}
        </div>` : ""}
      ${(hasPlay || hasNext || hasPrev || hasStop) ? `
        <div class="transport">
          ${hasPrev ? `<button class="trans-btn" data-id="${d.id}" data-action="previous" ${online ? "" : "disabled"} title="Previous">⏮</button>` : ""}
          ${hasPlay ? `<button class="trans-btn play-btn ${playing ? "playing" : ""}" data-id="${d.id}" data-action="${playing ? "pause" : "play"}" ${online ? "" : "disabled"} title="${playing ? "Pause" : "Play"}">${playing ? "⏸" : "▶"}</button>` : ""}
          ${hasNext ? `<button class="trans-btn" data-id="${d.id}" data-action="next" ${online ? "" : "disabled"} title="Next">⏭</button>` : ""}
          ${hasStop ? `<button class="trans-btn small" data-id="${d.id}" data-action="stop" ${online ? "" : "disabled"} title="Stop">⏹</button>` : ""}
        </div>` : ""}
    </div>
  `;
}

function escapeHtml(s) {
  if (s == null) return "";
  return String(s).replace(/[&<>"']/g, c => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;",
  }[c]));
}

// ---------- Toast ----------

let toastTimer;
function toast(msg, kind = "") {
  const el = document.getElementById("toast");
  el.textContent = msg;
  el.className = `toast ${kind}`;
  el.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add("hidden"), 3500);
}

// ---------- Theme + Atlas Command Bar ----------
// Shared with /report.html via the `atlas.theme` localStorage key — flipping
// the theme on either page carries to the other. Default: light.

function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  document.body.classList.toggle("light", theme === "light");
  document.body.classList.toggle("dark",  theme === "dark");
  const sw = document.getElementById("cmd-theme-toggle");
  if (sw) sw.checked = theme === "dark";
  try { localStorage.setItem("atlas.theme", theme); } catch {}
}
applyTheme(localStorage.getItem("atlas.theme") || "light");

document.getElementById("cmd-theme-toggle")?.addEventListener("change", e => {
  applyTheme(e.target.checked ? "dark" : "light");
});

// Sliding gradient pill behind the active page-tab.
function _cmdUpdateGlow() {
  const glow = document.getElementById("cmd-glow");
  const active = document.querySelector(".cmd-bar-tab.is-active");
  if (!glow || !active) return;
  const parent = active.parentElement.getBoundingClientRect();
  const r = active.getBoundingClientRect();
  glow.style.width = r.width + "px";
  glow.style.transform = `translateX(${r.left - parent.left - 4}px)`;
}
requestAnimationFrame(_cmdUpdateGlow);
window.addEventListener("load",   _cmdUpdateGlow);
window.addEventListener("resize", _cmdUpdateGlow);
document.fonts?.ready?.then(_cmdUpdateGlow);

// Live backend connectivity dot.
async function _cmdStatusPing() {
  const dot = document.getElementById("cmd-status-dot");
  if (!dot) return;
  try {
    const r = await fetch("/api/devices", { cache: "no-store" });
    dot.classList.toggle("is-down", !r.ok);
    dot.title = r.ok ? "Backend connected" : "Backend error";
  } catch {
    dot.classList.add("is-down");
    dot.title = "Backend unreachable";
  }
}
_cmdStatusPing();
setInterval(_cmdStatusPing, 30000);

// ---------- Filters ----------

document.getElementById("filter-online").addEventListener("change", e => {
  state.filterOnline = e.target.checked; renderGroups();
});
document.getElementById("filter-offline").addEventListener("change", e => {
  state.filterOffline = e.target.checked; renderGroups();
});
document.getElementById("filter-playing").addEventListener("change", e => {
  state.filterPlayingOnly = e.target.checked; renderGroups();
});

// ---------- Hue ----------

const hueState = { status: null, lights: null, groups: null };

async function renderHuePanel() {
  const panel = document.getElementById("hue-panel");
  if (!panel) return;
  try {
    hueState.status = await api("/api/hue/status");
  } catch (e) {
    panel.innerHTML = `<div class="hue-empty">Could not reach Hue API: ${escapeHtml(e.message)}</div>`;
    return;
  }
  if (!hueState.status.bridge_found) {
    panel.innerHTML = `<div class="hue-empty">No Hue bridge found yet — try a rescan.</div>`;
    return;
  }
  if (!hueState.status.paired) {
    panel.innerHTML = `
      <div class="hue-pair">
        <h3>Pair the Hue Bridge (${escapeHtml(hueState.status.bridge_ip)})</h3>
        <ol>
          <li>Walk to the Hue bridge in the server room.</li>
          <li>Press the round button on top of the bridge.</li>
          <li>Within 30 seconds, click <strong>Pair Now</strong> below.</li>
        </ol>
        <button class="btn-pair" onclick="huePair()">🔗 Pair Now</button>
        <div id="hue-pair-result" class="hue-pair-result"></div>
      </div>
    `;
    return;
  }

  // Paired — load lights
  try {
    const data = await api("/api/hue/lights");
    hueState.lights = data.lights || {};
    hueState.groups = data.groups || {};
  } catch (e) {
    panel.innerHTML = `<div class="hue-empty">Failed to fetch lights: ${escapeHtml(e.message)}</div>`;
    return;
  }

  const lights = hueState.lights;
  const lightIds = Object.keys(lights);
  const sceneStatus = hueState.status.scene || {};
  const isRunning = sceneStatus.running;

  // Scene buttons
  const sceneButtons = (hueState.status.scenes_available || []).map(s => `
    <button class="scene-btn ${isRunning && sceneStatus.scene === s.id ? "running" : ""}"
            data-scene="${s.id}"
            ${s.warning ? `data-warn="${escapeHtml(s.warning)}"` : ""}
            onclick="hueStartScene('${s.id}', this)">
      <span class="scene-icon">${s.icon}</span>
      <span class="scene-label">${escapeHtml(s.label)}</span>
      ${s.warning ? `<span class="scene-warn-flag" title="${escapeHtml(s.warning)}">⚠</span>` : ""}
    </button>
  `).join("");

  const lightCards = lightIds.map(id => {
    const l = lights[id];
    const s = l.state || {};
    const reachable = s.reachable !== false;
    const on = s.on === true;
    const bri = s.bri ?? 0;
    const briPct = Math.round((bri / 254) * 100);
    const hueVal = s.hue ?? 0;
    const sat = s.sat ?? 0;
    const colorPreview = on ? hueToRgbCss(hueVal, sat, bri) : "var(--bg-elev)";
    return `
      <div class="hue-light ${reachable ? "" : "unreachable"} ${on ? "is-on" : "is-off"}">
        <div class="hue-light-head">
          <div class="hue-color-chip" style="background: ${colorPreview}"></div>
          <div class="hue-light-name">
            <div class="hue-name">${escapeHtml(l.name || `Light ${id}`)}</div>
            <div class="hue-meta">${escapeHtml(l.productname || l.modelid || "")}</div>
          </div>
          <label class="switch">
            <input type="checkbox" ${on ? "checked" : ""} ${reachable ? "" : "disabled"}
                   onchange="hueSetLight('${id}', { on: this.checked })">
            <span class="slider"></span>
          </label>
        </div>
        <div class="hue-controls">
          <div class="hue-row">
            <span class="hue-row-label">☀ Brightness</span>
            <input type="range" min="1" max="254" value="${bri}" ${on && reachable ? "" : "disabled"}
                   oninput="this.nextElementSibling.textContent=Math.round(this.value/254*100)+'%'"
                   onchange="hueSetLight('${id}', { bri: parseInt(this.value, 10) })">
            <span class="hue-row-num">${briPct}%</span>
          </div>
          <div class="hue-row">
            <span class="hue-row-label">🎨 Color</span>
            <input type="color" value="${rgbToHexFromHueSat(hueVal, sat)}"
                   ${on && reachable ? "" : "disabled"}
                   onchange="hueSetColor('${id}', this.value)">
            <span class="hue-row-num">hue ${hueVal}</span>
          </div>
        </div>
        ${!reachable ? `<div class="hue-unreachable-hint">⚠ Light unreachable</div>` : ""}
      </div>
    `;
  }).join("");

  panel.innerHTML = `
    <div class="hue-header">
      <div>
        <div class="hue-title">Server Room Lights</div>
        <div class="hue-subtitle">${lightIds.length} light${lightIds.length === 1 ? "" : "s"} · Bridge ${escapeHtml(hueState.status.bridge_ip)}</div>
      </div>
      <div class="hue-master">
        <button class="btn-secondary" onclick="hueAll(true)">All On</button>
        <button class="btn-secondary" onclick="hueAll(false)">All Off</button>
      </div>
    </div>

    <div class="hue-section-label">Scenes</div>
    <div class="scene-grid">
      ${sceneButtons}
      <button class="scene-btn scene-stop ${isRunning ? "" : "disabled"}" onclick="hueStopScene()" ${isRunning ? "" : "disabled"}>
        <span class="scene-icon">⏹</span>
        <span class="scene-label">Stop ${isRunning ? `(${escapeHtml(sceneStatus.scene)})` : ""}</span>
      </button>
    </div>

    <div class="hue-section-label">Lights</div>
    <div class="hue-light-grid">${lightCards}</div>
  `;
}

async function huePair() {
  const result = document.getElementById("hue-pair-result");
  result.textContent = "Asking the bridge…";
  try {
    const r = await api("/api/hue/pair", { method: "POST" });
    if (r.ok) {
      result.textContent = "✓ Paired! Loading lights…";
      result.style.color = "var(--good)";
      setTimeout(renderHuePanel, 800);
    } else {
      result.textContent = `✗ ${r.error || "pairing failed"}`;
      result.style.color = "var(--bad)";
    }
  } catch (e) {
    result.textContent = `✗ ${e.message}`;
    result.style.color = "var(--bad)";
  }
}

async function hueSetLight(id, body) {
  try {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) params.set(k, v);
    await api(`/api/hue/light/${id}?${params}`, { method: "PUT" });
  } catch (e) { toast(e.message, "error"); }
}

async function hueSetColor(id, hexColor) {
  // Convert hex → HSV → Hue's hue/sat scale
  const { h, s, v } = hexToHsv(hexColor);
  const hueVal = Math.round((h / 360) * 65535);
  const satVal = Math.round(s * 254);
  await hueSetLight(id, { hue: hueVal, sat: satVal });
}

async function hueAll(on) {
  try {
    await api(`/api/hue/group/0?on=${on}`, { method: "PUT" });
    toast(`All lights ${on ? "on" : "off"}`, "success");
    setTimeout(renderHuePanel, 600);
  } catch (e) { toast(e.message, "error"); }
}

async function hueStartScene(sceneId, btn) {
  const warn = btn.dataset.warn;
  if (warn && !confirm(`⚠ ${warn}\n\nLaunch scene anyway?`)) return;
  try {
    const r = await api(`/api/hue/scene/${sceneId}`, { method: "POST" });
    if (r.ok) {
      toast(`▶ ${sceneId} running`, "success");
      setTimeout(renderHuePanel, 600);
    } else toast(r.error || "scene failed", "error");
  } catch (e) { toast(e.message, "error"); }
}

async function hueStopScene() {
  try {
    await api("/api/hue/scene-stop", { method: "POST" });
    toast("Scene stopped");
    setTimeout(renderHuePanel, 600);
  } catch (e) { toast(e.message, "error"); }
}

// ---------- Color helpers ----------

function hueToRgbCss(hue, sat, bri) {
  const h = (hue / 65535) * 360;
  const s = sat / 254;
  const v = Math.max(0.3, (bri || 0) / 254);
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let [r, g, b] = [0,0,0];
  if (h < 60) [r,g,b] = [c,x,0];
  else if (h < 120) [r,g,b] = [x,c,0];
  else if (h < 180) [r,g,b] = [0,c,x];
  else if (h < 240) [r,g,b] = [0,x,c];
  else if (h < 300) [r,g,b] = [x,0,c];
  else [r,g,b] = [c,0,x];
  const R = Math.round((r + m) * 255), G = Math.round((g + m) * 255), B = Math.round((b + m) * 255);
  return `rgb(${R},${G},${B})`;
}

function hexToHsv(hex) {
  const r = parseInt(hex.slice(1,3), 16) / 255;
  const g = parseInt(hex.slice(3,5), 16) / 255;
  const b = parseInt(hex.slice(5,7), 16) / 255;
  const max = Math.max(r,g,b), min = Math.min(r,g,b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = h * 60;
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : d / max;
  return { h, s, v: max };
}

function rgbToHexFromHueSat(hueVal, sat) {
  const css = hueToRgbCss(hueVal, sat || 254, 254);
  const m = css.match(/rgb\((\d+),(\d+),(\d+)\)/);
  if (!m) return "#ffffff";
  return "#" + ["1","2","3"].map(i => parseInt(m[i],10).toString(16).padStart(2,"0")).join("");
}

// ---------- Printers ----------

const printerState = {
  list: [],
  byHost: new Map(),       // last-good per host
  lastRenderHash: null,    // skip re-renders when nothing changed
};

// Stable JSON hash of the rendered data (ignores volatile fields).
function _printerHash(list) {
  return JSON.stringify(list.map(p => ({
    host: p.host, online: p.online,
    model: p.model, location: p.location, serial: p.serial,
    caps: p.capabilities,
    supplies: (p.supplies || []).map(s => ({ k: s.kind, c: s.color, p: s.pct, pr: s.present })),
    trays: (p.trays || []).map(t => ({ n: t.name, l: t.level, m: t.max, p: t.pct })),
  })));
}

const COLOR_HEX = { cyan:"#00CFFF", magenta:"#E83E8C", yellow:"#FFD428", black:"#1a1a1a" };

let _printerInflight = false;
async function renderPrinterPanel() {
  if (_printerInflight) return;
  _printerInflight = true;

  // Capture references AFTER the in-flight check; re-grab after await as well.
  let panel = document.getElementById("printer-panel");
  if (!panel) { _printerInflight = false; return; }
  const isFirstLoad = printerState.list.length === 0;
  if (isFirstLoad) {
    panel.innerHTML = `<div class="hue-loading">Querying SNMP for live printer status…</div>`;
  }

  try {
    const data = await api("/api/printers");
    const fresh = data.printers || [];

    // Last-good per host — don't flip a card offline on a transient SNMP miss.
    for (const p of fresh) {
      const cached = printerState.byHost.get(p.host);
      if (p.online || !cached) {
        printerState.byHost.set(p.host, p);
      }
    }
    printerState.list = Array.from(printerState.byHost.values());

    // Re-grab the panel — it may have been replaced while we were awaiting.
    panel = document.getElementById("printer-panel");
    if (!panel) return;

    if (printerState.list.length) {
      const hash = _printerHash(printerState.list);
      const looksEmpty = panel.querySelector(".hue-loading") || !panel.firstElementChild;
      if (hash !== printerState.lastRenderHash || looksEmpty) {
        panel.innerHTML = printerState.list.map(renderPrinterCard).join("");
        printerState.lastRenderHash = hash;
      }
    } else if (isFirstLoad) {
      panel.innerHTML = `<div class="hue-empty">No printers found.</div>`;
    }
  } catch (e) {
    panel = document.getElementById("printer-panel");
    if (panel && isFirstLoad) panel.innerHTML = `<div class="hue-empty">Could not query printers: ${escapeHtml(e.message)}</div>`;
  } finally {
    _printerInflight = false;
  }
}

// Slow background refresh of printer status. Toner/paper don't change quickly
// and the 30s cadence was triggering visible flicker for no real benefit.
setInterval(() => {
  if (document.getElementById("printer-panel")) renderPrinterPanel();
}, 90000);

function renderPrinterCard(p) {
  if (!p.online) {
    return `<div class="printer-card offline">
      <div class="printer-head">
        <div>
          <div class="printer-name">${escapeHtml(p.host)}</div>
          <div class="printer-meta">SNMP unreachable: ${escapeHtml(p.error || "no response")}</div>
        </div>
        <span class="status-dot offline"></span>
      </div>
    </div>`;
  }

  const supplies = p.supplies || [];
  const trays = p.trays || [];
  const caps = p.capabilities || {};

  // Toner gauges (always show CMYK)
  const toners = ["cyan","magenta","yellow","black"].map(c => {
    const s = supplies.find(s => s.kind === "toner" && s.color === c);
    const pct = s?.pct ?? 0;
    const low = pct != null && pct <= 20;
    return `
      <div class="toner-tile ${low ? "low" : ""}">
        <div class="toner-bar-track">
          <div class="toner-bar-fill" style="height: ${pct}%; background: ${COLOR_HEX[c]}"></div>
        </div>
        <div class="toner-pct">${pct ?? "?"}%</div>
        <div class="toner-label">${c.toUpperCase()[0]}</div>
        ${low ? `<div class="toner-warn">LOW</div>` : ""}
      </div>
    `;
  }).join("");

  // Trays
  const trayRows = trays.map(t => {
    const pct = t.pct ?? 0;
    const low = t.max > 0 && pct <= 10;
    return `
      <div class="tray-row">
        <span class="tray-name">${escapeHtml(t.name)}</span>
        <div class="tray-bar"><div class="tray-fill ${low ? "low" : ""}" style="width:${pct}%"></div></div>
        <span class="tray-num">${t.level ?? "?"}/${t.max ?? "?"}</span>
      </div>
    `;
  }).join("");

  // Consumables / finisher (drum, developer, fuser, ITB, transfer roller, filter, staples)
  const consumables = supplies.filter(s =>
    ["drum","developer","service","finisher","waste"].includes(s.category) && s.present);
  const consumableRows = consumables.map(s => {
    const pctStr = s.pct == null ? "—" : `${s.pct}%`;
    const low = s.pct != null && s.pct <= 20;
    return `
      <div class="consumable-row ${low ? "low" : ""}">
        <span class="consumable-icon" style="background: ${s.color ? COLOR_HEX[s.color] : 'var(--ink-faint)'}"></span>
        <span class="consumable-name" title="${escapeHtml(s.name)}">${escapeHtml(s.name)}</span>
        <span class="consumable-pct">${pctStr}</span>
      </div>
    `;
  }).join("");

  const capBadges = [];
  if (caps.color) capBadges.push(`<span class="badge controllable">Color</span>`);
  if (caps.duplex) capBadges.push(`<span class="badge">Duplex</span>`);
  if (caps.staple) capBadges.push(`<span class="badge">Staple</span>`);
  if (caps.punch) capBadges.push(`<span class="badge">Punch</span>`);
  if (caps.saddle_stitch) capBadges.push(`<span class="badge controllable">Saddle-stitch ✓</span>`);

  // Toner low alert summary
  const lowToners = ["cyan","magenta","yellow","black"]
    .map(c => ({c, s: supplies.find(s => s.kind === "toner" && s.color === c)}))
    .filter(x => x.s && x.s.pct != null && x.s.pct <= 20);

  return `
    <div class="printer-card">
      <div class="printer-head">
        <div style="flex:1; min-width:0;">
          <div class="printer-name">${escapeHtml(p.model || p.host)}</div>
          <div class="printer-meta">${escapeHtml(p.location || "")}${p.serial ? ` · S/N ${escapeHtml(p.serial)}` : ""} · ${escapeHtml(p.host)}</div>
          <div style="margin-top:6px;">${capBadges.join(" ")}</div>
        </div>
        <span class="status-dot online" title="online"></span>
      </div>

      ${lowToners.length ? `<div class="alert-strip">⚠ Low toner: ${lowToners.map(x => `${x.c[0].toUpperCase()} ${x.s.pct}%`).join(", ")}</div>` : ""}

      <div class="printer-grid">
        <div class="printer-col">
          <div class="col-label">Toner</div>
          <div class="toner-row">${toners}</div>
        </div>
        <div class="printer-col">
          <div class="col-label">Paper Trays</div>
          <div class="tray-list">${trayRows || '<div class="hue-empty" style="padding:0">No trays reported</div>'}</div>
        </div>
        <div class="printer-col wide">
          <div class="col-label">Consumables &amp; Finisher</div>
          <div class="consumable-grid">${consumableRows || '<div class="hue-empty" style="padding:0">No detailed consumable data</div>'}</div>
        </div>
      </div>

      <div class="printer-actions">
        <button class="btn-primary" onclick="openPrintDialog('${p.host}', ${JSON.stringify(caps).replaceAll('"', "&quot;")})">📄 Print PDF</button>
        ${caps.saddle_stitch ? `<button class="btn-primary booklet" onclick="openPrintDialog('${p.host}', ${JSON.stringify(caps).replaceAll('"', "&quot;")}, true)">📚 Booklet Wizard</button>` : ""}
        <a class="btn-secondary" href="http://${p.host}/" target="_blank">⤴ Web Console</a>
      </div>
    </div>
  `;
}

// Print dialog
function openPrintDialog(host, caps, bookletMode = false) {
  const isC3350i = host === "10.1.11.207"; // requires TLS
  const dlg = document.createElement("div");
  dlg.className = "print-dialog-backdrop";
  dlg.innerHTML = `
    <div class="print-dialog">
      <div class="print-dialog-head">
        <h2>${bookletMode ? "📚 Booklet Wizard" : "📄 Print to"} ${escapeHtml(host)}</h2>
        <button class="btn-close" onclick="this.closest('.print-dialog-backdrop').remove()">✕</button>
      </div>
      <form id="print-form" onsubmit="return submitPrint(event, '${host}', ${bookletMode}, ${isC3350i})">
        <label class="field">
          <span>PDF file</span>
          <input type="file" name="pdf" accept="application/pdf" required>
        </label>
        <label class="field">
          <span>Job name</span>
          <input type="text" name="job_name" value="${bookletMode ? "Booklet" : "AVCast Print"}">
        </label>

        ${bookletMode ? `
          <div class="booklet-info">
            ✦ Booklet mode: PDF will be re-imposed (2-up landscape signature),
            sent as <strong>tabloid</strong> with <strong>saddle-stitch + center fold</strong>.
            Pads to multiple of 4 with blanks.
          </div>` : ""}

        <div class="field-row">
          <label class="field">
            <span>Copies</span>
            <input type="number" name="copies" value="1" min="1" max="999">
          </label>
          <label class="field">
            <span>Paper size</span>
            <select name="media" ${bookletMode ? "disabled" : ""}>
              <option value="letter">Letter (8.5×11")</option>
              <option value="legal">Legal (8.5×14")</option>
              <option value="tabloid" ${bookletMode ? "selected" : ""}>Tabloid (11×17")</option>
              <option value="a4">A4</option>
              <option value="a3">A3</option>
            </select>
          </label>
          <label class="field">
            <span>Sides</span>
            <select name="sides" ${bookletMode ? "disabled" : ""}>
              <option value="one-sided">Simplex (one-sided)</option>
              <option value="duplex-long">Duplex (long edge)</option>
              <option value="duplex-short" ${bookletMode ? "selected" : ""}>Duplex (short edge)</option>
            </select>
          </label>
          <label class="field">
            <span>Color</span>
            <select name="color">
              <option value="true">Color</option>
              <option value="false">B&amp;W</option>
            </select>
          </label>
        </div>

        ${!bookletMode ? `
          <div class="field">
            <span>Finishing</span>
            <div class="finishing-chips">
              ${caps.staple ? `
                <label class="chip"><input type="checkbox" name="fin" value="staple-top-left"> Staple TL</label>
                <label class="chip"><input type="checkbox" name="fin" value="staple-top-right"> Staple TR</label>
                <label class="chip"><input type="checkbox" name="fin" value="staple-dual-left"> Dual-staple L</label>
                <label class="chip"><input type="checkbox" name="fin" value="staple-dual-top"> Dual-staple T</label>` : ""}
              ${caps.punch ? `
                <label class="chip"><input type="checkbox" name="fin" value="punch-2-hole"> Punch 2H</label>
                <label class="chip"><input type="checkbox" name="fin" value="punch-3-hole"> Punch 3H</label>` : ""}
              ${caps.saddle_stitch ? `
                <label class="chip"><input type="checkbox" name="fin" value="fold-half"> Half fold</label>
                <label class="chip"><input type="checkbox" name="fin" value="saddle-stitch"> Saddle-stitch</label>` : ""}
            </div>
          </div>` : ""}

        ${isC3350i ? `<div class="booklet-info" style="border-color:var(--warn);color:var(--warn);">
          ⚠ This printer requires TLS (IPPS). Will attempt over port 443.
        </div>` : ""}

        <div class="dialog-actions">
          <button type="button" class="btn-secondary" onclick="this.closest('.print-dialog-backdrop').remove()">Cancel</button>
          <button type="submit" class="btn-primary">${bookletMode ? "📚 Print Booklet" : "📄 Send to Printer"}</button>
        </div>
        <div id="print-result" class="print-result"></div>
      </form>
    </div>
  `;
  document.body.appendChild(dlg);
}

async function submitPrint(ev, host, bookletMode, useTls) {
  ev.preventDefault();
  const form = ev.target;
  const fd = new FormData(form);

  // Collect finishing checkboxes into single comma-separated string
  const fins = Array.from(form.querySelectorAll('input[name="fin"]:checked')).map(c => c.value);
  fd.set("finishings", fins.join(","));
  fd.delete("fin");
  fd.set("booklet", bookletMode);
  fd.set("tls", useTls);

  const result = document.getElementById("print-result");
  result.textContent = "📤 Submitting…";
  result.style.color = "var(--ink-dim)";

  try {
    const r = await fetch(`/api/printer/${host}/print`, { method: "POST", body: fd });
    const data = await r.json();
    if (data.ok) {
      result.innerHTML = `✓ Job submitted${data.job_id ? ` — ID ${data.job_id}` : ""}${data.booklet ? ` · Booklet: ${data.booklet.source_pages}p → ${data.booklet.padded_pages}p (${data.booklet.output_sheets} sheets)` : ""}`;
      result.style.color = "var(--good)";
      toast("Print job sent", "success");
    } else {
      result.textContent = `✗ ${data.error || "submission failed"}`;
      result.style.color = "var(--bad)";
    }
  } catch (e) {
    result.textContent = `✗ ${e.message}`;
    result.style.color = "var(--bad)";
  }
  return false;
}

// ---------- Local progress ticker ----------
// Walks the .progress bars forward locally so they don't appear frozen between polls.
setInterval(() => {
  document.querySelectorAll(".progress").forEach(p => {
    if (p.dataset.playing !== "true") return;
    const dur = parseFloat(p.dataset.dur) || 0;
    if (!dur) return;
    let pos = parseFloat(p.dataset.pos) || 0;
    pos = Math.min(dur, pos + 1);
    p.dataset.pos = pos;
    const pct = (pos / dur) * 100;
    const fill = p.querySelector(".progress-fill");
    const elapsed = p.querySelector(".progress-elapsed");
    if (fill) fill.style.width = pct + "%";
    if (elapsed) elapsed.textContent = _secToHMS(pos);
  });
}, 1000);

// ---------- Boot ----------

loadDevices();
setInterval(loadDevices, 12000); // gentle auto-refresh
