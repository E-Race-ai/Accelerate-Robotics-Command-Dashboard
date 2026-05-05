#!/usr/bin/env node
// Brand-based rooms estimator. For every saved hotel where `rooms` is
// NULL but the name/brand matches a known chain, write a median-of-chain
// estimate and stamp `rooms_source = 'estimated'` so the UI can hedge
// the number when displaying it.
//
// Run: node scripts/estimate-rooms.mjs
//
// Estimates use brand medians published by the chains' annual reports
// + hospitality industry data. Not perfect — local properties vary —
// but better than NULL for fit-score calculation + cold-call planning.

const BASE = process.env.BASE_URL || 'http://localhost:3000';

// ── Brand → median rooms / range ────────────────────────────────────
//
// Median is the rough typical-property size. Useful for fit scoring +
// "this property is probably in the X-key range" for cold calls.
//
// Patterns are matched case-insensitively against name + brand + operator.
// Order matters — more specific brands first (e.g. "Hyatt Regency" before
// "Hyatt").
const CHAIN_MEDIANS = [
  // Luxury (200-400 keys typical)
  [/\b(?:ritz[\s-]?carlton|the ritz)\b/i,        250],
  [/\bst\.?\s*regis\b/i,                          180],
  [/\bfour seasons\b/i,                           230],
  [/\bedition\b/i,                                200],
  [/\b(?:w hotels?|w south beach|w\s+miami)\b/i,  280],
  [/\bmandarin oriental\b/i,                      170],
  [/\brosewood\b/i,                               150],
  [/\bfairmont\b/i,                               350],
  [/\bwaldorf astoria\b/i,                        250],
  [/\bconrad\b/i,                                 280],
  [/\bpark hyatt\b/i,                             200],
  [/\bgrand hyatt\b/i,                            500],
  [/\bandaz\b/i,                                  180],
  [/\b1 hotel(?:s)?\b/i,                          250],
  [/\bnobu hotel\b/i,                             150],
  [/\bsoho house\b/i,                             100],
  [/\bdelano\b/i,                                 200],
  [/\bfontainebleau\b/i,                          1500], // unique mega-property
  [/\beden roc\b/i,                               350],
  [/\bloews\b/i,                                  400],
  [/\bjw marriott\b/i,                            350],

  // Upper-upscale (200-400 keys)
  [/\bsheraton\b/i,                               380],
  [/\bwestin\b/i,                                 350],
  [/\brenaissance\b/i,                            290],
  [/\bsofitel\b/i,                                250],
  [/\bdoubletree\b/i,                             230],
  [/\bembassy suites\b/i,                         220],
  [/\bhyatt regency\b/i,                          380],
  [/\bhilton (?:hotel|hotels)?\b/i,               320],
  [/\bcrowne plaza\b/i,                           260],
  [/\bintercontinental\b/i,                       270],
  [/\bautograph collection\b/i,                   180],
  [/\bcurio collection\b/i,                       180],
  [/\btribute portfolio\b/i,                      180],
  [/\bkimpton\b/i,                                170],

  // Upscale (130-250 keys)
  [/\bmarriott (?:hotel|hotels)?\b/i,             350],
  [/\bhilton garden inn\b/i,                      130],
  [/\bcourtyard(?: by marriott)?\b/i,             130],
  [/\bac hotels?\b/i,                             180],
  [/\baloft\b/i,                                  150],
  [/\bcambria hotels?\b/i,                        140],
  [/\bhyatt place\b/i,                            130],
  [/\bfour points\b/i,                            220],
  [/\bspringhill suites\b/i,                      120],
  [/\bresidence inn\b/i,                          100],
  [/\belement (?:hotel|hotels|by westin)?\b/i,    130],
  [/\bhomewood suites\b/i,                        110],
  [/\bhome2 suites\b/i,                           110],
  [/\bhyatt house\b/i,                            130],
  [/\bcitizenm\b/i,                               180],

  // Upper-midscale + midscale (90-160 keys)
  [/\bholiday inn express\b/i,                    110],
  [/\bholiday inn\b/i,                            200],
  [/\bhampton inn\b/i,                            110],
  [/\bbest western plus\b/i,                      100],
  [/\bbest western\b/i,                           90],
  [/\bla quinta\b/i,                              130],
  [/\bquality inn\b/i,                            80],
  [/\bcomfort suites\b/i,                         90],
  [/\bcomfort inn\b/i,                            90],
  [/\bsleep inn\b/i,                              80],
  [/\bramada\b/i,                                 110],
  [/\bbaymont\b/i,                                90],
  [/\bcountry inn (?:and|&) suites\b/i,           90],
  [/\bcandlewood suites\b/i,                      90],
  [/\bavid hotel\b/i,                             90],
  [/\btownplace suites\b/i,                       110],
  [/\bfairfield (?:inn|by marriott)\b/i,          110],
  [/\bwingate\b/i,                                90],
  [/\bbluegreen\b/i,                              100],

  // Economy (60-110 keys)
  [/\bdays inn\b/i,                               90],
  [/\bsuper 8\b/i,                                70],
  [/\btravelodge\b/i,                             70],
  [/\beconolodge\b/i,                             60],
  [/\beconlodge\b/i,                              60],
  [/\becono lodge\b/i,                            60],
  [/\bred roof\b/i,                               80],
  [/\bmotel 6\b/i,                                90],
  [/\bdays hotel\b/i,                             100],

  // Generic suffix matches (lower priority)
  [/\bhampton(?: by hilton)?\b/i,                 110],
  [/\bmarriott\b/i,                               300],
  [/\bhilton\b/i,                                 320],
  [/\bhyatt\b/i,                                  280],
];

// Property-name signal modifiers — adjust the median up/down based on
// what the name itself implies about scale.
function applyNameModifiers(baseMedian, name) {
  const n = (name || '').toLowerCase();
  let est = baseMedian;
  if (/\b(?:resort|spa|tower|grand|gala|palace)\b/.test(n))    est = Math.round(est * 1.15);
  if (/\b(?:beach|oceanfront|harbor|harbour)\b/.test(n))       est = Math.round(est * 1.05);
  if (/\b(?:boutique|inn|small|cottages?)\b/.test(n))          est = Math.round(est * 0.6);
  if (/\b(?:airport|airpark|terminal)\b/.test(n))              est = Math.round(est * 0.8);
  // Cap reasonable range
  return Math.max(40, Math.min(2500, est));
}

function estimateRooms(hotel) {
  const blob = `${hotel.name || ''} ${hotel.brand || ''} ${hotel.operator || ''}`;
  for (const [rx, median] of CHAIN_MEDIANS) {
    if (rx.test(blob)) {
      return {
        rooms: applyNameModifiers(median, hotel.name),
        matched_pattern: rx.source,
      };
    }
  }
  return null;
}

async function main() {
  console.log(`Pulling saved hotels from ${BASE}…`);
  const r = await fetch(`${BASE}/api/hotel-research/saved`);
  const data = await r.json();
  const all = data.hotels || [];
  // Only target hotels with rooms IS NULL — never overwrite real data.
  const targets = all.filter(h => !h.rooms);
  console.log(`Targets (no rooms set): ${targets.length} of ${all.length}`);

  let estimated = 0, skipped = 0, errors = 0;
  const dist = { tiny: 0, small: 0, mid: 0, large: 0, xl: 0 };
  for (const h of targets) {
    const guess = estimateRooms(h);
    if (!guess) { skipped++; continue; }
    try {
      const res = await fetch(`${BASE}/api/hotel-research/saved/${h.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rooms: guess.rooms, rooms_source: 'estimated' }),
      });
      if (!res.ok) { errors++; continue; }
      estimated++;
      if (guess.rooms < 60) dist.tiny++;
      else if (guess.rooms < 120) dist.small++;
      else if (guess.rooms < 250) dist.mid++;
      else if (guess.rooms < 500) dist.large++;
      else dist.xl++;
      if (estimated % 50 === 0) process.stdout.write(`.`);
    } catch (err) {
      errors++;
    }
  }
  console.log(`\n\n=== ROOMS ESTIMATION DONE ===`);
  console.log(`Estimated: ${estimated} hotels`);
  console.log(`Skipped (no chain match): ${skipped}`);
  console.log(`Errors: ${errors}`);
  console.log(`Distribution: tiny<60: ${dist.tiny}, small<120: ${dist.small}, mid<250: ${dist.mid}, large<500: ${dist.large}, xl: ${dist.xl}`);

  // Re-score everyone since rooms is a major fit-score input
  console.log(`\nTriggering /score-all?force=1 to re-rank with new room data…`);
  try {
    const sr = await fetch(`${BASE}/api/hotel-research/score-all?force=1`, { method: 'POST' });
    const sj = await sr.json();
    console.log(`Re-scored: ${sj.scored} hotels. Tiers:`, sj.tier_counts);
  } catch (err) {
    console.log('Score-all failed:', err.message);
  }
}

main().catch(err => { console.error(err); process.exit(1); });
