#!/usr/bin/env node
// Overnight deep-research worker.
//
// Phases:
//   A. WEBSITE SCRAPE — for every saved hotel with a website, fetch the
//      homepage + /about + /accommodations / /rooms paths, extract room
//      count via regex ("X rooms / X keys / X guest rooms"). Writes
//      hotels_saved.rooms when found.
//   B. WIKIPEDIA + WIKIDATA — for the top 100 by AI fit, query
//      Wikipedia search → Wikidata SPARQL for structured data
//      (rooms, floors, year_opened, operator). Updates rows.
//   C. RE-SCORE — after data lands, recompute ai_fit_score for everyone.
//
// Polite by default: 3 concurrent, 1.2s delay between batches, 8s
// per-request timeout. Logs to /tmp/overnight-research.log.
//
// Run via: node scripts/overnight-research.mjs

import { writeFileSync, appendFileSync } from 'fs';

const BASE = process.env.RESEARCH_BASE_URL || 'http://localhost:3000';
const LOG  = '/tmp/overnight-research.log';
const CONCURRENCY = 3;
const POLITE_DELAY_MS = 1200;
const FETCH_TIMEOUT_MS = 8000;
const TOP_N_DEEP = 100;

const startedAt = new Date();
let totalScraped = 0, totalRoomsFound = 0, totalErrors = 0;

function log(line) {
  const stamp = new Date().toISOString();
  const msg = `[${stamp}] ${line}\n`;
  process.stdout.write(msg);
  try { appendFileSync(LOG, msg); } catch {}
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = FETCH_TIMEOUT_MS) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const r = await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'AccelerateRoboticsResearch/1.0 (overnight; admin@acceleraterobotics.ai)',
        'Accept-Language': 'en-US,en;q=0.9',
        ...(opts.headers || {}),
      },
    });
    return r;
  } finally {
    clearTimeout(t);
  }
}

// Strip HTML tags + collapse whitespace
function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#?\w+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Strict room-count extractor. ONLY matches phrases explicitly mentioning
// "guest rooms", "rooms and suites", or chain-property descriptions —
// generic "5 rooms" anywhere in the text is too noisy (matches breadcrumbs,
// nav, footer copy). Plausibility floor is 30 (smallest realistic chain
// hotel) so single-digit bleed-through is rejected outright.
function extractRoomCount(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  // Each pattern requires a STRONG context phrase. Single-token "rooms"
  // matches are not allowed.
  const patterns = [
    // Tight: "300 guest rooms" / "300 guestrooms" — most reliable
    /(\d{2,4})\s+(?:guest[\s\-]?rooms?)/g,
    // "300 rooms and suites"
    /(\d{2,4})\s+rooms?\s+(?:and|&)\s+suites?/g,
    // "X-key" / "X keys" with hotel/property/hotel-name context
    /(\d{2,4})[\s\-]+key(?:s)?\b/g,
    // Marketing copy: "300 well-appointed rooms" / "300 luxurious rooms"
    /(\d{2,4})\s+(?:well[\s\-]appointed|luxurious|stylish|elegantly[\s\-]appointed|spacious|newly[\s\-]renovated)\s+(?:guest[\s\-]?)?rooms?/g,
    // Verb-anchored: "the hotel offers/features/has 300 rooms"
    /(?:hotel|property|resort|inn)\s+(?:features?|offers?|has|boasts?|presents?)\s+(\d{2,4})\s+(?:guest[\s\-]?)?rooms?/g,
    // "300 accommodations" / "300 suites"
    /(\d{2,4})\s+(?:accommodations|all[\s\-]suite\s+rooms?)/g,
    // Inverted: "rooms: 300" / "total rooms: 300"
    /(?:rooms?|keys|guest[\s\-]?rooms?)\s*:\s*(\d{2,4})\b/g,
  ];
  const candidates = [];
  for (const rx of patterns) {
    let m;
    while ((m = rx.exec(lower)) !== null) {
      const n = parseInt(m[1], 10);
      // Plausibility floor 30 — knocks out the "9" noise. Real chain
      // hotels are 30+ keys. Boutiques < 30 are rare; we'd rather miss
      // them than mis-tag La Quinta as 9 rooms.
      if (n >= 30 && n <= 2500) candidates.push(n);
    }
  }
  if (candidates.length === 0) return null;
  // Confidence threshold: at least 1 hit from a tight pattern. If only
  // weak patterns match, require 2+ hits agreeing.
  const counts = new Map();
  for (const n of candidates) counts.set(n, (counts.get(n) || 0) + 1);
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  return sorted[0][0];
}

// Extract restaurant / event-space hints
function extractRestaurantCount(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  // Look for explicit numeric mentions
  const m = lower.match(/(\d+)\s+(?:on[\s\-]site\s+)?(?:restaurants?|dining\s+(?:options?|outlets?|venues?)|food\s+&\s+beverage\s+outlets?)/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 1 && n <= 20) return n;
  }
  return null;
}

function extractEventSqft(text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  // Match "50,000 sq ft of event/meeting space"
  const m = lower.match(/(\d{1,3}(?:,\d{3})*)\s*(?:sq(?:uare)?\.?\s*(?:ft|feet))\s+of\s+(?:event|meeting|function|conference|flexible)/);
  if (m) {
    const n = parseInt(m[1].replace(/,/g, ''), 10);
    if (n >= 1000 && n <= 1000000) return n;
  }
  return null;
}

// Fetch one URL, return text content (capped 200KB)
async function fetchAndStrip(url) {
  try {
    const r = await fetchWithTimeout(url);
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return null;
    const html = await r.text();
    return stripHtml(html.slice(0, 250_000));
  } catch (err) {
    return null;
  }
}

// Walk the hotel's site for room data — try homepage, /rooms, /accommodations,
// /about. Stop at the first hit so we don't hammer.
async function scrapeHotelWebsite(websiteUrl) {
  if (!websiteUrl) return null;
  const candidates = [
    websiteUrl,
    websiteUrl.replace(/\/?$/, '/rooms'),
    websiteUrl.replace(/\/?$/, '/accommodations'),
    websiteUrl.replace(/\/?$/, '/about'),
  ];
  const result = {};
  for (const url of candidates) {
    const text = await fetchAndStrip(url);
    if (!text) continue;
    const rooms = extractRoomCount(text);
    if (rooms && !result.rooms) result.rooms = rooms;
    const rest = extractRestaurantCount(text);
    if (rest && !result.restaurant_count) result.restaurant_count = rest;
    const ev = extractEventSqft(text);
    if (ev && !result.event_sqft) result.event_sqft = ev;
    if (result.rooms) break; // found the headline number, stop
    await new Promise(r => setTimeout(r, 400));
  }
  return Object.keys(result).length > 0 ? result : null;
}

// Worker pool — process N concurrent hotels
async function runPool(items, concurrency, worker) {
  let cursor = 0;
  const results = [];
  async function next() {
    while (cursor < items.length) {
      const i = cursor++;
      try { results[i] = await worker(items[i], i); }
      catch (err) { results[i] = { error: err.message }; totalErrors++; }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, () => next()));
  return results;
}

async function patchHotel(id, patch) {
  try {
    const r = await fetch(`${BASE}/api/hotel-research/saved/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    });
    return r.ok;
  } catch (err) {
    return false;
  }
}

// ─── Phase A — website scrape ───────────────────────────────────────
async function phaseA() {
  log('--- PHASE A — website scrape ---');
  const allRes = await fetch(`${BASE}/api/hotel-research/saved`);
  const data = await allRes.json();
  const all = data.hotels || [];
  // Target: hotels missing rooms but with a website
  const targets = all.filter(h => !h.rooms && h.website);
  log(`Phase A targets: ${targets.length} hotels (missing rooms + has website)`);

  await runPool(targets, CONCURRENCY, async (h, i) => {
    if (i % 25 === 0) log(`  Phase A progress: ${i}/${targets.length} (rooms found so far: ${totalRoomsFound})`);
    const out = await scrapeHotelWebsite(h.website);
    totalScraped++;
    if (!out) return;
    const patch = {};
    if (out.rooms) { patch.rooms = out.rooms; totalRoomsFound++; }
    if (out.restaurant_count && !h.restaurant_count) patch.restaurant_count = out.restaurant_count;
    if (out.event_sqft && !h.event_sqft) patch.event_sqft = out.event_sqft;
    if (Object.keys(patch).length === 0) return;
    const ok = await patchHotel(h.id, patch);
    if (ok) {
      const summary = Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(' ');
      log(`  ✓ ${h.name.slice(0, 60)} — ${summary}`);
    }
    await new Promise(r => setTimeout(r, POLITE_DELAY_MS / CONCURRENCY));
  });

  log(`Phase A done. Scraped: ${totalScraped}. Rooms found: ${totalRoomsFound}. Errors: ${totalErrors}.`);
}

// ─── Phase B — top 100 Wikipedia + Wikidata enrichment ───────────────
async function phaseB() {
  log('--- PHASE B — top 100 deep enrichment ---');
  // Re-fetch since Phase A may have updated rooms, which feeds the score
  const allRes = await fetch(`${BASE}/api/hotel-research/saved`);
  const data = await allRes.json();
  const all = data.hotels || [];
  const top = all
    .filter(h => h.ai_fit_score != null)
    .sort((a, b) => (b.ai_fit_score || 0) - (a.ai_fit_score || 0))
    .slice(0, TOP_N_DEEP);
  log(`Phase B targets: ${top.length} top-fit hotels`);

  let bWiki = 0, bData = 0;
  for (let i = 0; i < top.length; i++) {
    const h = top[i];
    if (i % 10 === 0) log(`  Phase B progress: ${i}/${top.length}`);
    // Wikipedia search — already wired through /enrich/:id but we want
    // FORCE refresh since Phase A may have improved the data.
    try {
      const r = await fetch(`${BASE}/api/hotel-research/saved/${h.id}/enrich`, { method: 'POST' });
      if (r.ok) bWiki++;
    } catch { /* ignore */ }
    // Wikidata SPARQL for structured data — query for rooms / floors / year
    if (!h.rooms || !h.total_floors || !h.year_opened) {
      const wiki = await fetchWikidataForHotel(h.name, h.city);
      if (wiki) {
        const patch = {};
        if (wiki.rooms && !h.rooms) patch.rooms = wiki.rooms;
        if (wiki.floors && !h.total_floors) patch.total_floors = wiki.floors;
        if (wiki.year && !h.year_opened) patch.year_opened = wiki.year;
        if (Object.keys(patch).length > 0 && await patchHotel(h.id, patch)) {
          bData++;
          log(`  ✓ wikidata ${h.name.slice(0, 50)} — ${Object.entries(patch).map(([k,v])=>`${k}=${v}`).join(' ')}`);
        }
      }
    }
    await new Promise(r => setTimeout(r, 800));
  }
  log(`Phase B done. Wikipedia enriched: ${bWiki}. Wikidata data found: ${bData}.`);
}

// SPARQL for hotel structured data via Wikidata
async function fetchWikidataForHotel(name, city) {
  if (!name) return null;
  // Wikidata search to get a Q-id
  const searchUrl = `https://www.wikidata.org/w/api.php?action=wbsearchentities&search=${encodeURIComponent(name + (city ? ' ' + city : ''))}&language=en&format=json&limit=3&type=item`;
  let entityId = null;
  try {
    const r = await fetchWithTimeout(searchUrl);
    if (!r.ok) return null;
    const j = await r.json();
    const hits = j.search || [];
    // Pick first hit whose label closely matches name
    const nameLower = name.toLowerCase();
    const match = hits.find(h => h.label && nameLower.includes(h.label.toLowerCase().split(' ')[0]));
    entityId = match?.id || hits[0]?.id;
  } catch { return null; }
  if (!entityId) return null;
  // Fetch claims
  const claimsUrl = `https://www.wikidata.org/wiki/Special:EntityData/${entityId}.json`;
  try {
    const r = await fetchWithTimeout(claimsUrl);
    if (!r.ok) return null;
    const j = await r.json();
    const ent = j.entities?.[entityId];
    if (!ent) return null;
    const out = {};
    // P1098 = number of rooms (some hotels)
    const roomsClaim = ent.claims?.P1098?.[0]?.mainsnak?.datavalue?.value?.amount;
    if (roomsClaim) out.rooms = parseInt(String(roomsClaim).replace(/^\+/, ''), 10);
    // P1101 = number of floors
    const floorsClaim = ent.claims?.P1101?.[0]?.mainsnak?.datavalue?.value?.amount;
    if (floorsClaim) out.floors = parseInt(String(floorsClaim).replace(/^\+/, ''), 10);
    // P1619 = date of official opening
    const openClaim = ent.claims?.P1619?.[0]?.mainsnak?.datavalue?.value?.time;
    if (openClaim) {
      const ym = openClaim.match(/^[+-]?(\d{4})/);
      if (ym) out.year = parseInt(ym[1], 10);
    }
    // P571 = inception date (fallback)
    if (!out.year) {
      const incClaim = ent.claims?.P571?.[0]?.mainsnak?.datavalue?.value?.time;
      if (incClaim) {
        const ym = incClaim.match(/^[+-]?(\d{4})/);
        if (ym) out.year = parseInt(ym[1], 10);
      }
    }
    return Object.keys(out).length > 0 ? out : null;
  } catch { return null; }
}

// ─── Phase C — re-score everyone ─────────────────────────────────────
async function phaseC() {
  log('--- PHASE C — re-score everyone with new data ---');
  try {
    const r = await fetch(`${BASE}/api/hotel-research/score-all?force=1`, { method: 'POST' });
    const j = await r.json();
    log(`Phase C done. Scored ${j.scored} hotels. Tier counts: ${JSON.stringify(j.tier_counts)}`);
  } catch (err) {
    log(`Phase C failed: ${err.message}`);
  }
}

// ─── Main ────────────────────────────────────────────────────────────
async function main() {
  writeFileSync(LOG, ''); // clear log
  log(`Overnight research started. Base=${BASE}. Concurrency=${CONCURRENCY}.`);
  await phaseA();
  await phaseB();
  await phaseC();
  const elapsedMin = ((Date.now() - startedAt.getTime()) / 60000).toFixed(1);
  log(`========== DONE ==========`);
  log(`Elapsed: ${elapsedMin} min · scraped: ${totalScraped} · rooms found: ${totalRoomsFound} · errors: ${totalErrors}`);
}

main().catch(err => { log('FATAL: ' + err.message); process.exit(1); });
