// Brand-based rooms estimator. For every saved hotel where `rooms` is
// NULL but the name/brand matches a known chain, write a median-of-chain
// estimate and stamp `rooms_source = 'estimated'` so the UI can hedge
// the number when displaying it ("~250 rooms est.").
//
// Used by:
//   • Boot-time pass in src/db/database.js — runs on every server start
//     so a fresh deploy populates rooms data without any manual trigger.
//   • scripts/estimate-rooms.mjs — same logic, runnable as a one-shot.

// ── Brand → median rooms ─────────────────────────────────────────────
// Order matters: more specific brand patterns first (e.g. "Hyatt
// Regency" must match before generic "Hyatt"). Numbers are rough
// industry medians from chain reports + STR data.
const CHAIN_MEDIANS = [
  // Luxury
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
  [/\bfontainebleau\b/i,                          1500],
  [/\beden roc\b/i,                               350],
  [/\bloews\b/i,                                  400],
  [/\bjw marriott\b/i,                            350],

  // Upper-upscale
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

  // Upscale
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

  // Upper-midscale + midscale
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

  // Economy
  [/\bdays inn\b/i,                               90],
  [/\bsuper 8\b/i,                                70],
  [/\btravelodge\b/i,                             70],
  [/\b(?:econo[\s\-]?lodge|econlodge)\b/i,        60],
  [/\bred roof\b/i,                               80],
  [/\bmotel 6\b/i,                                90],
  [/\bdays hotel\b/i,                             100],

  // Generic suffix matches (lowest priority)
  [/\bhampton(?: by hilton)?\b/i,                 110],
  [/\bmarriott\b/i,                               300],
  [/\bhilton\b/i,                                 320],
  [/\bhyatt\b/i,                                  280],
];

function applyNameModifiers(baseMedian, name) {
  const n = (name || '').toLowerCase();
  let est = baseMedian;
  if (/\b(?:resort|spa|tower|grand|gala|palace)\b/.test(n))    est = Math.round(est * 1.15);
  if (/\b(?:beach|oceanfront|harbor|harbour)\b/.test(n))       est = Math.round(est * 1.05);
  if (/\b(?:boutique|inn|small|cottages?)\b/.test(n))          est = Math.round(est * 0.6);
  if (/\b(?:airport|airpark|terminal)\b/.test(n))              est = Math.round(est * 0.8);
  return Math.max(40, Math.min(2500, est));
}

// Returns { rooms, matched_pattern } or null if no chain match.
function estimateRoomsForHotel(hotel) {
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

module.exports = { estimateRoomsForHotel, CHAIN_MEDIANS };
