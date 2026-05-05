// Hotel enrichment — pulls a richer hotel profile (photo, description, rating)
// from public sources so BDRs see a real card instead of "—" placeholders.
//
// Sources, in order of preference:
//   1. Wikipedia REST summary  → photo + bio + canonical link
//   2. Hotel website OpenGraph → photo + description fallback
//
// All sources are free and key-less. Each step is independently best-effort —
// if Wikipedia fails we still try the website, and a failed enrichment leaves
// the row's existing data untouched (we only write fields we actually got).

// WHY 7s timeout: enrichment is fired per-hotel and we're doing 30+ in a row.
// 7s is long enough for slow corporate sites (some marriotts are real pokes)
// but short enough that one bad host can't stall the queue.
const FETCH_TIMEOUT_MS = 7000;

// WHY this UA string: Wikipedia's API politely asks crawlers to identify
// themselves and provide a contact path. This identifies our app and points
// at the site so a Wikimedia admin can reach us if anything looks off.
const USER_AGENT = 'AccelerateRoboticsHotelResearch/1.0 (https://acceleraterobotics.ai; ops@acceleraterobotics.ai)';

async function fetchWithTimeout(url, opts = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, {
      ...opts,
      signal: ctrl.signal,
      headers: { 'User-Agent': USER_AGENT, ...(opts.headers || {}) },
    });
  } finally {
    clearTimeout(t);
  }
}

// ── Wikipedia ────────────────────────────────────────────────────────
// Search the Wikipedia API for the hotel name (city included to disambiguate
// chains like "Hyatt Centric"). Returns the top hit's title or null.
// Generic words that appear in nearly every hotel name — matching against
// these alone would false-positive "AC Hotel" → "Loews Hotels" because both
// contain "hotel". Require a non-generic word to overlap.
const HOTEL_STOPWORDS = new Set([
  'hotel', 'hotels', 'inn', 'inns', 'resort', 'resorts', 'motel', 'motels',
  'suites', 'suite', 'lodge', 'plaza', 'house', 'bnb', 'b&b', 'guest',
  'guesthouse', 'place', 'stay', 'club', 'tower', 'towers', 'and', 'the',
  'at', 'on', 'of', 'by', 'a', 'an', 'fl', 'florida', 'miami',
]);

async function searchWikipedia(name, city) {
  const q = [name, city].filter(Boolean).join(' ');
  const url = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(q)}&format=json&srlimit=5`;
  const r = await fetchWithTimeout(url);
  if (!r.ok) return null;
  const j = await r.json();
  const hits = j?.query?.search || [];
  if (hits.length === 0) return null;

  // Extract significant words from the hotel name — anything 4+ chars that
  // isn't a generic hospitality term. "AC Hotel" → ['ac'] is too short;
  // "Hampton Inn Brickell" → ['hampton', 'brickell']; "Doral Resort" → ['doral'].
  const significantWords = name.toLowerCase()
    .replace(/[^\p{L}\s]+/gu, ' ')   // strip punctuation
    .split(/\s+/)
    .filter(w => w.length >= 4 && !HOTEL_STOPWORDS.has(w));

  // Bail entirely if the name has no significant words — better to show no
  // description than a hallucinated one. This is what fixes "AC Hotel" =>
  // "Loews Hotels" (only stopword overlap).
  if (significantWords.length === 0) return null;

  // Score each candidate by how many significant words it contains, then
  // return the highest-scoring one with at least one match.
  const scored = hits.map(h => {
    const t = h.title.toLowerCase();
    const matches = significantWords.filter(w => t.includes(w)).length;
    return { title: h.title, matches };
  });
  scored.sort((a, b) => b.matches - a.matches);
  return scored[0].matches > 0 ? scored[0].title : null;
}

// Fetch the page summary REST endpoint. Returns shape:
//   { description, photo_url, wikipedia_url } or null on miss.
async function fetchWikipediaSummary(title) {
  const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`;
  const r = await fetchWithTimeout(url);
  if (!r.ok) return null;
  const j = await r.json();
  // Wikipedia disambiguation pages are not real hotel articles
  if (j.type === 'disambiguation') return null;
  const out = {};
  if (j.extract && j.extract.length > 30) out.description = j.extract;
  // Prefer original (full-res) over thumbnail when available — the card
  // displays at ~400px wide so original gives a crisper render on Retina.
  const photo = j.originalimage?.source || j.thumbnail?.source;
  if (photo) out.photo_url = photo;
  const wikiLink = j.content_urls?.desktop?.page;
  if (wikiLink) out.wikipedia_url = wikiLink;
  return Object.keys(out).length > 0 ? out : null;
}

async function enrichFromWikipedia(name, city) {
  if (!name) return null;
  try {
    const title = await searchWikipedia(name, city);
    if (!title) return null;
    return await fetchWikipediaSummary(title);
  } catch (err) {
    // Network blips are normal in a 30-hotel sweep — just log + move on
    console.warn(`[enrich] wikipedia failed for "${name}": ${err.message}`);
    return null;
  }
}

// ── Website OpenGraph fallback ───────────────────────────────────────
// Pull og:image / og:description / <meta name="description"> from the hotel's
// own homepage. Most hotel sites set these well because Booking.com / Google
// rely on them.
function parseOgTags(html) {
  if (!html) return {};
  // Cap at first 200KB — homepages with embedded video can be many MB and we
  // only need the <head>.
  const head = html.slice(0, 200_000);
  const out = {};
  const grab = (re) => {
    const m = head.match(re);
    return m ? m[1].trim() : null;
  };
  // og:image / twitter:image
  out.photo_url =
    grab(/<meta[^>]+property=["']og:image["'][^>]*content=["']([^"']+)["']/i) ||
    grab(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:image["']/i) ||
    grab(/<meta[^>]+name=["']twitter:image["'][^>]*content=["']([^"']+)["']/i);
  // Description: og:description preferred, else <meta name="description">
  out.description =
    grab(/<meta[^>]+property=["']og:description["'][^>]*content=["']([^"']+)["']/i) ||
    grab(/<meta[^>]+content=["']([^"']+)["'][^>]*property=["']og:description["']/i) ||
    grab(/<meta[^>]+name=["']description["'][^>]*content=["']([^"']+)["']/i);
  // Decode HTML entities in description (& -> & etc.) — minimal pass.
  if (out.description) out.description = decodeBasicEntities(out.description);
  // Strip empties so the merge step doesn't overwrite Wikipedia hits with ""
  for (const k of Object.keys(out)) if (!out[k]) delete out[k];
  return out;
}

function decodeBasicEntities(s) {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');
}

// Resolve relative og:image URLs (e.g. "/img/hero.jpg") against the page URL.
function absolutizeUrl(maybeRel, baseUrl) {
  if (!maybeRel) return maybeRel;
  try {
    return new URL(maybeRel, baseUrl).toString();
  } catch {
    return maybeRel;
  }
}

async function enrichFromWebsite(websiteUrl) {
  if (!websiteUrl) return null;
  try {
    const r = await fetchWithTimeout(websiteUrl, {
      headers: {
        'Accept': 'text/html,application/xhtml+xml',
        // Some hotel sites serve different content to bots — ask for a
        // browser-shaped response.
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });
    if (!r.ok) return null;
    const ct = r.headers.get('content-type') || '';
    if (!ct.includes('text/html')) return null;
    const html = await r.text();
    const tags = parseOgTags(html);
    if (tags.photo_url) tags.photo_url = absolutizeUrl(tags.photo_url, websiteUrl);
    return Object.keys(tags).length > 0 ? tags : null;
  } catch (err) {
    console.warn(`[enrich] website failed for ${websiteUrl}: ${err.message}`);
    return null;
  }
}

// ── Public API ───────────────────────────────────────────────────────
// Returns a partial-update object containing only the fields we successfully
// pulled. Keys: photo_url, description, wikipedia_url. Caller decides what
// to write to the DB.
async function enrichHotel(hotel) {
  if (!hotel || !hotel.name) return {};
  const out = {};
  // Step 1: Wikipedia
  const wiki = await enrichFromWikipedia(hotel.name, hotel.city);
  if (wiki) Object.assign(out, wiki);
  // Step 2: Website OG fallback for any field still missing
  if (hotel.website && (!out.photo_url || !out.description)) {
    const og = await enrichFromWebsite(hotel.website);
    if (og) {
      if (!out.photo_url && og.photo_url) out.photo_url = og.photo_url;
      if (!out.description && og.description) out.description = og.description;
    }
  }
  // Truncate descriptions to a reasonable length — multi-paragraph entries
  // bloat the card. 600 chars ≈ 4-5 sentences which fits comfortably.
  if (out.description && out.description.length > 600) {
    out.description = out.description.slice(0, 597).replace(/\s+\S*$/, '') + '…';
  }
  return out;
}

// ── Brand / chain enrichment ─────────────────────────────────────────
//
// For deep-research hotels (top fit-score targets), pull the chain's own
// Wikipedia article. This gives sales reps a bullet-proof talking point
// even when the individual property has no Wikipedia entry: "Did you know
// AC Hotels by Marriott is the European-flagged design line that Marriott
// acquired in 2011?" — that's instant credibility.

// Chain alias map — keys are normalized substrings to look for in the hotel
// name/brand/operator; values are the Wikipedia article title to query.
// Pulled by hand from the chains we know matter; expand as targeting evolves.
const CHAIN_WIKIPEDIA_TITLES = [
  ['ritz-carlton',        'The Ritz-Carlton Hotel Company'],
  ['ritz carlton',        'The Ritz-Carlton Hotel Company'],
  ['st. regis',           'St. Regis Hotels & Resorts'],
  ['st regis',            'St. Regis Hotels & Resorts'],
  ['four seasons',        'Four Seasons Hotels and Resorts'],
  ['fontainebleau',       'Fontainebleau Miami Beach'],
  ['ac hotels',           'AC Hotels by Marriott'],
  ['edition',             'Edition Hotels'],
  ['w hotel',             'W Hotels'],
  ['kimpton',             'Kimpton Hotels & Restaurants'],
  ['westin',              'Westin Hotels & Resorts'],
  ['sheraton',            'Sheraton Hotels and Resorts'],
  ['marriott',            'Marriott International'],
  ['hilton',              'Hilton Hotels & Resorts'],
  ['hyatt',               'Hyatt'],
  ['1 hotel',             '1 Hotels'],
  ['loews',               'Loews Hotels'],
  ['fairmont',            'Fairmont Hotels and Resorts'],
  ['eden roc',            'Eden Roc Hotel (Miami Beach)'],
  ['delano',              'Delano Hotel'],
  ['mondrian',            'Mondrian Hotel'],
  ['conrad',              'Conrad Hotels'],
  ['waldorf',             'Waldorf Astoria Hotels & Resorts'],
  ['embassy suites',      'Embassy Suites by Hilton'],
  ['hampton inn',         'Hampton by Hilton'],
  ['holiday inn',         'Holiday Inn'],
  ['courtyard',           'Courtyard by Marriott'],
  ['residence inn',       'Residence Inn by Marriott'],
  ['doubletree',          'DoubleTree'],
  ['hampton by hilton',   'Hampton by Hilton'],
  ['intercontinental',    'InterContinental Hotels Group'],
  ['rosewood',            'Rosewood Hotels & Resorts'],
  ['mandarin oriental',   'Mandarin Oriental Hotel Group'],
  ['standard',            'Standard Hotels'],
  ['nobu',                'Nobu Hotels'],
];

function findChainTitle(hotel) {
  const blob = `${hotel.name || ''} ${hotel.brand || ''} ${hotel.operator || ''}`.toLowerCase();
  for (const [key, title] of CHAIN_WIKIPEDIA_TITLES) {
    if (blob.includes(key)) return title;
  }
  return null;
}

async function fetchChainSummary(hotel) {
  const title = findChainTitle(hotel);
  if (!title) return null;
  try {
    const summary = await fetchWikipediaSummary(title);
    if (!summary) return null;
    return {
      chain_description: summary.description || null,
      chain_url: summary.wikipedia_url || null,
      // Reuse the chain photo as a backup if we can't find a property photo
      chain_photo_url: summary.photo_url || null,
    };
  } catch (err) {
    console.warn(`[enrich] chain "${title}" failed:`, err.message);
    return null;
  }
}

// Deep enrichment — top-fit hotels get this treatment. In addition to the
// standard property-level enrichment, we pull the brand's Wikipedia article
// so the rep can talk about the chain's history and parent company even
// for properties without their own Wikipedia presence.
async function deepEnrichHotel(hotel) {
  const [propertyEnrich, chainEnrich] = await Promise.all([
    enrichHotel(hotel),
    fetchChainSummary(hotel),
  ]);
  const out = { ...propertyEnrich };
  if (chainEnrich) {
    out.chain_description = chainEnrich.chain_description;
    out.chain_url = chainEnrich.chain_url;
    // Backfill photo_url from the chain logo if the property has nothing
    if (!out.photo_url && chainEnrich.chain_photo_url) {
      out.photo_url = chainEnrich.chain_photo_url;
    }
  }
  return out;
}

module.exports = {
  enrichHotel,
  deepEnrichHotel,
  fetchChainSummary,
  findChainTitle,
  // Exported for unit tests
  parseOgTags,
  absolutizeUrl,
  decodeBasicEntities,
  searchWikipedia,
  fetchWikipediaSummary,
};
