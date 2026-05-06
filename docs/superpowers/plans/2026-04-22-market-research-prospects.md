# Market Research & Prospect Pipeline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the hardcoded prospect pipeline to a database, add market management with AI-powered research, a staging area for review, and strategic CRM connection scanning.

**Architecture:** New `markets` and `prospects` SQLite tables with Express CRUD routes following the existing deals/facilities pattern. AI research calls Claude API with web_search tool server-side, inserts results as `staged` prospects. CRM data extracted to shared JSON for connection scanning. Pipeline page switches from hardcoded array to API-driven with new staging/form UI.

**Tech Stack:** better-sqlite3, Express, Anthropic SDK (`@anthropic-ai/sdk`), vanilla JS frontend

**Spec:** `docs/superpowers/specs/2026-04-22-market-research-prospects-design.md`

---

## File Structure

| File | Action | Responsibility |
|---|---|---|
| `src/db/database.js` | Modify | Add `markets` + `prospects` CREATE TABLE statements |
| `data/seed-prospects.json` | Create | 66 existing prospects + 14 markets extracted from HTML |
| `src/db/seed-prospects.js` | Create | Boot-time seeder: populate tables if empty |
| `data/crm-contacts.json` | Create | Investor/contact data extracted from CRM HTML |
| `src/routes/markets.js` | Create | Markets CRUD + research trigger endpoint |
| `src/routes/prospects.js` | Create | Prospects CRUD + bulk confirm/delete |
| `src/services/market-research.js` | Create | Claude API + web search, prompt, parsing, CRM scanning |
| `src/server.js` | Modify | Mount new routes, run seeder on boot |
| `pages/pipeline-prospects.html` | Modify | Switch to API, add market form, staging area, manual add, connections |
| `pages/investor-crm.html` | Modify | Switch to loading from shared JSON |
| `.env.example` | Modify | Add ANTHROPIC_API_KEY placeholder |

---

### Task 1: Add markets and prospects tables to database schema

**Files:**
- Modify: `src/db/database.js`

- [ ] **Step 1: Add markets table after the assessment_photos table**

Find the closing `);` of the `db.exec(` block (after the last CREATE TABLE statement) and add the markets and prospects tables BEFORE that closing `);`:

```sql
  -- WHY: Markets define geographic areas where Accelerate targets hotel prospects.
  -- Prospects in the pipeline directly shape operational footprint and hiring pools.
  CREATE TABLE IF NOT EXISTS markets (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    cluster TEXT,
    color TEXT,
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS prospects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    market_id TEXT REFERENCES markets(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'staged' CHECK(status IN ('staged', 'confirmed')),
    name TEXT NOT NULL,
    address TEXT,
    brand TEXT,
    brand_class TEXT CHECK(brand_class IN ('luxury', 'soft', 'chain', 'independent')),
    keys INTEGER,
    floors INTEGER,
    stars INTEGER CHECK(stars BETWEEN 1 AND 5),
    signal TEXT,
    operator TEXT,
    portfolio TEXT,
    monogram TEXT,
    mono_color TEXT,
    source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('ai_research', 'manual')),
    research_date TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_prospects_market ON prospects(market_id);
  CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
```

- [ ] **Step 2: Verify the schema loads**

Run: `node -e "require('./src/db/database'); console.log('OK')"`
Expected: `OK` (no errors)

- [ ] **Step 3: Commit**

```bash
git add src/db/database.js
git commit -m "feat(prospects): add markets and prospects tables to schema

Problem: Prospect pipeline data is hardcoded in HTML with no database
persistence, making it impossible to add markets or prospects dynamically.

Solution: Added markets table (id, name, cluster, color, notes) and
prospects table (market_id FK, status staged/confirmed, hotel fields,
source ai_research/manual) with ON DELETE CASCADE and indexes."
```

---

### Task 2: Extract seed data and create seeder

**Files:**
- Create: `data/seed-prospects.json`
- Create: `src/db/seed-prospects.js`

- [ ] **Step 1: Extract the 66 prospects and 14 markets into seed JSON**

Run the pipeline-prospects.html page data extraction. The seed file needs two arrays: `markets` and `prospects`.

Create `data/seed-prospects.json`. Extract the data by reading the PROSPECTS array from `pages/pipeline-prospects.html` (lines 194-261) and the CLUSTER_LABELS object (line 263).

The markets array should be derived from unique `market` + `cluster` combinations in the prospect data. Generate slugified IDs (e.g., "San Francisco" → "san-francisco"). Assign colors based on cluster:
- sf-bay: `#2563eb`
- sacramento: `#d97706`
- la-west: `#7c3aed`
- san-diego: `#0891b2`
- south-fl: `#f59e0b`
- gulf-fl: `#16a34a`
- dallas: `#dc2626`

Each prospect maps `market` → `market_id` (the slug), and all fields carry over with `status: "confirmed"` and `source: "manual"`.

Write a node script to extract this data:

```javascript
// Run: node scripts/extract-seed-data.js > data/seed-prospects.json
// This is a one-time extraction script, not committed to the repo.

const fs = require('fs');
const html = fs.readFileSync('pages/pipeline-prospects.html', 'utf8');

// Extract the PROSPECTS array from the HTML
const match = html.match(/const PROSPECTS = \[([\s\S]*?)\];/);
if (!match) { console.error('Could not find PROSPECTS array'); process.exit(1); }

// Evaluate the array (safe — it's our own data)
const prospects = eval('[' + match[1] + ']');

// Derive markets from unique market+cluster pairs
const clusterColors = {
  'sf-bay': '#2563eb', 'sacramento': '#d97706', 'la-west': '#7c3aed',
  'san-diego': '#0891b2', 'south-fl': '#f59e0b', 'gulf-fl': '#16a34a', 'dallas': '#dc2626',
};

const marketMap = new Map();
prospects.forEach(p => {
  if (!marketMap.has(p.market)) {
    const id = p.market.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
    marketMap.set(p.market, { id, name: p.market, cluster: p.cluster, color: clusterColors[p.cluster] || '#64748b' });
  }
});

const markets = Array.from(marketMap.values());
const seedProspects = prospects.map(p => ({
  market_id: marketMap.get(p.market).id,
  status: 'confirmed',
  name: p.name,
  address: p.address || null,
  brand: p.brand || null,
  brand_class: p.brandClass || null,
  keys: p.keys || null,
  floors: p.floors || null,
  stars: p.stars || null,
  signal: p.signal || null,
  operator: p.operator || null,
  portfolio: p.portfolio || null,
  monogram: p.monogram || null,
  mono_color: p.monoColor || null,
  source: 'manual',
}));

console.log(JSON.stringify({ markets, prospects: seedProspects }, null, 2));
```

Run the script and save the output to `data/seed-prospects.json`.

- [ ] **Step 2: Create the seeder module**

Create `src/db/seed-prospects.js`:

```javascript
const db = require('./database');
const fs = require('fs');
const path = require('path');

/**
 * Seed markets and prospects tables from seed data if they are empty.
 * WHY: Idempotent — only runs when tables have no data (fresh install or reset).
 * Called from server.js on boot.
 */
function seedProspects() {
  const count = db.prepare('SELECT COUNT(*) as n FROM prospects').get().n;
  if (count > 0) return; // Already seeded

  const seedPath = path.join(__dirname, '..', '..', 'data', 'seed-prospects.json');
  if (!fs.existsSync(seedPath)) {
    console.warn('[seed] No seed-prospects.json found — skipping prospect seeding');
    return;
  }

  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

  const insertMarket = db.prepare(`
    INSERT OR IGNORE INTO markets (id, name, cluster, color)
    VALUES (?, ?, ?, ?)
  `);

  const insertProspect = db.prepare(`
    INSERT INTO prospects (market_id, status, name, address, brand, brand_class,
      keys, floors, stars, signal, operator, portfolio, monogram, mono_color, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seedAll = db.transaction(() => {
    for (const m of seed.markets) {
      insertMarket.run(m.id, m.name, m.cluster, m.color);
    }
    for (const p of seed.prospects) {
      insertProspect.run(
        p.market_id, p.status, p.name, p.address, p.brand, p.brand_class,
        p.keys, p.floors, p.stars, p.signal, p.operator, p.portfolio,
        p.monogram, p.mono_color, p.source
      );
    }
    console.log(`[seed] Inserted ${seed.markets.length} markets and ${seed.prospects.length} prospects`);
  });

  seedAll();
}

module.exports = { seedProspects };
```

- [ ] **Step 3: Verify the seeder works**

Run: `node -e "const { seedProspects } = require('./src/db/seed-prospects'); seedProspects(); console.log('OK')"`
Expected: `[seed] Inserted 14 markets and 66 prospects` then `OK`

Verify data: `node -e "const db = require('./src/db/database'); console.log(db.prepare('SELECT COUNT(*) as n FROM markets').get(), db.prepare('SELECT COUNT(*) as n FROM prospects').get())"`
Expected: `{ n: 14 } { n: 66 }`

- [ ] **Step 4: Commit**

```bash
git add data/seed-prospects.json src/db/seed-prospects.js
git commit -m "feat(prospects): add seed data and boot-time seeder

Problem: Need to migrate 66 hardcoded prospects and 14 markets into
the new database tables on first boot.

Solution: seed-prospects.json contains extracted prospect/market data.
seed-prospects.js checks if tables are empty, inserts seed data in a
transaction. Idempotent — skips if data already exists."
```

---

### Task 3: Create markets API routes

**Files:**
- Create: `src/routes/markets.js`

- [ ] **Step 1: Create the markets route file**

```javascript
const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── List all markets ──────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const markets = db.prepare(`
    SELECT m.*, COUNT(p.id) as prospect_count
    FROM markets m
    LEFT JOIN prospects p ON p.market_id = m.id AND p.status = 'confirmed'
    GROUP BY m.id
    ORDER BY m.name
  `).all();
  res.json(markets);
});

// ── Create a market ──────────────────────────────────────────
router.post('/', requireAuth, (req, res) => {
  const { id, name, cluster, color, notes } = req.body;

  if (!id || !name) {
    return res.status(400).json({ error: 'id and name are required' });
  }

  // WHY: Slugify the id to prevent spaces/special chars in URLs
  const slug = id.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');

  const existing = db.prepare('SELECT id FROM markets WHERE id = ?').get(slug);
  if (existing) {
    return res.status(409).json({ error: 'Market already exists' });
  }

  db.prepare(`
    INSERT INTO markets (id, name, cluster, color, notes)
    VALUES (?, ?, ?, ?, ?)
  `).run(slug, name, cluster || null, color || null, notes || null);

  const market = db.prepare('SELECT * FROM markets WHERE id = ?').get(slug);
  res.status(201).json(market);
});

// ── Update a market ──────────────────────────────────────────
router.patch('/:id', requireAuth, (req, res) => {
  const market = db.prepare('SELECT * FROM markets WHERE id = ?').get(req.params.id);
  if (!market) return res.status(404).json({ error: 'Market not found' });

  const { name, cluster, color, notes } = req.body;
  db.prepare(`
    UPDATE markets SET
      name = COALESCE(?, name),
      cluster = COALESCE(?, cluster),
      color = COALESCE(?, color),
      notes = COALESCE(?, notes)
    WHERE id = ?
  `).run(name, cluster, color, notes, req.params.id);

  const updated = db.prepare('SELECT * FROM markets WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// ── Delete a market and its prospects ─────────────────────────
router.delete('/:id', requireAuth, (req, res) => {
  const market = db.prepare('SELECT * FROM markets WHERE id = ?').get(req.params.id);
  if (!market) return res.status(404).json({ error: 'Market not found' });

  // WHY: ON DELETE CASCADE handles prospects, but be explicit for clarity
  db.prepare('DELETE FROM markets WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/markets.js
git commit -m "feat(prospects): create markets CRUD API routes

Problem: No API exists to manage geographic markets for the prospect pipeline.

Solution: GET/POST/PATCH/DELETE /api/markets with prospect_count in list,
slug validation, conflict detection, and cascade delete."
```

---

### Task 4: Create prospects API routes

**Files:**
- Create: `src/routes/prospects.js`

- [ ] **Step 1: Create the prospects route file**

```javascript
const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── List prospects ────────────────────────────────────────────
router.get('/', requireAuth, (req, res) => {
  const { market_id, status, brand_class } = req.query;
  let sql = 'SELECT p.*, m.name as market_name, m.cluster FROM prospects p LEFT JOIN markets m ON p.market_id = m.id';
  const conditions = [];
  const params = [];

  if (market_id) {
    conditions.push('p.market_id = ?');
    params.push(market_id);
  }
  if (status) {
    conditions.push('p.status = ?');
    params.push(status);
  }
  if (brand_class) {
    conditions.push('p.brand_class = ?');
    params.push(brand_class);
  }

  if (conditions.length) sql += ' WHERE ' + conditions.join(' AND ');
  sql += ' ORDER BY p.keys DESC';

  const prospects = db.prepare(sql).all(...params);
  res.json(prospects);
});

// ── Get single prospect ──────────────────────────────────────
router.get('/:id', requireAuth, (req, res) => {
  const prospect = db.prepare(`
    SELECT p.*, m.name as market_name, m.cluster
    FROM prospects p LEFT JOIN markets m ON p.market_id = m.id
    WHERE p.id = ?
  `).get(req.params.id);
  if (!prospect) return res.status(404).json({ error: 'Prospect not found' });
  res.json(prospect);
});

// ── Create a prospect (manual entry) ─────────────────────────
router.post('/', requireAuth, (req, res) => {
  const { market_id, name, address, brand, brand_class, keys, floors, stars,
          signal, operator, portfolio, monogram, mono_color } = req.body;

  if (!market_id || !name) {
    return res.status(400).json({ error: 'market_id and name are required' });
  }

  const market = db.prepare('SELECT id FROM markets WHERE id = ?').get(market_id);
  if (!market) return res.status(400).json({ error: 'Market not found' });

  const result = db.prepare(`
    INSERT INTO prospects (market_id, status, name, address, brand, brand_class,
      keys, floors, stars, signal, operator, portfolio, monogram, mono_color, source)
    VALUES (?, 'confirmed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')
  `).run(market_id, name, address || null, brand || null, brand_class || null,
    keys || null, floors || null, stars || null, signal || null,
    operator || null, portfolio || null, monogram || null, mono_color || null);

  const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(prospect);
});

// ── Update a prospect ────────────────────────────────────────
router.patch('/:id', requireAuth, (req, res) => {
  const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(req.params.id);
  if (!prospect) return res.status(404).json({ error: 'Prospect not found' });

  const fields = ['name', 'address', 'brand', 'brand_class', 'keys', 'floors',
    'stars', 'signal', 'operator', 'portfolio', 'monogram', 'mono_color', 'status'];
  const updates = [];
  const params = [];

  for (const f of fields) {
    if (req.body[f] !== undefined) {
      updates.push(`${f} = ?`);
      params.push(req.body[f]);
    }
  }

  if (!updates.length) return res.json(prospect);

  updates.push("updated_at = datetime('now')");
  params.push(req.params.id);

  db.prepare(`UPDATE prospects SET ${updates.join(', ')} WHERE id = ?`).run(...params);
  const updated = db.prepare('SELECT * FROM prospects WHERE id = ?').get(req.params.id);
  res.json(updated);
});

// ── Delete a prospect ────────────────────────────────────────
router.delete('/:id', requireAuth, (req, res) => {
  const prospect = db.prepare('SELECT * FROM prospects WHERE id = ?').get(req.params.id);
  if (!prospect) return res.status(404).json({ error: 'Prospect not found' });

  db.prepare('DELETE FROM prospects WHERE id = ?').run(req.params.id);
  res.json({ deleted: true });
});

// ── Bulk confirm (staged → confirmed) ────────────────────────
router.post('/bulk-confirm', requireAuth, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: 'ids array is required' });
  }

  const placeholders = ids.map(() => '?').join(',');
  const result = db.prepare(`
    UPDATE prospects SET status = 'confirmed', updated_at = datetime('now')
    WHERE id IN (${placeholders}) AND status = 'staged'
  `).run(...ids);

  res.json({ confirmed: result.changes });
});

// ── Bulk delete ──────────────────────────────────────────────
router.post('/bulk-delete', requireAuth, (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: 'ids array is required' });
  }

  const placeholders = ids.map(() => '?').join(',');
  const result = db.prepare(`DELETE FROM prospects WHERE id IN (${placeholders})`).run(...ids);
  res.json({ deleted: result.changes });
});

module.exports = router;
```

- [ ] **Step 2: Commit**

```bash
git add src/routes/prospects.js
git commit -m "feat(prospects): create prospects CRUD + bulk API routes

Problem: No API exists to manage individual hotel prospects or bulk
confirm/delete staged research results.

Solution: GET/POST/PATCH/DELETE /api/prospects with market_id/status/
brand_class filters, manual entry (auto-confirmed), inline field updates,
bulk-confirm (staged→confirmed), and bulk-delete."
```

---

### Task 5: Extract CRM data to shared JSON

**Files:**
- Create: `data/crm-contacts.json`

- [ ] **Step 1: Extract investor/contact data from the CRM HTML**

Write a one-time extraction script to pull the investor data from `pages/investor-crm.html`. The data lives in an inline JS array starting around line 450.

```javascript
// Run: node scripts/extract-crm-data.js > data/crm-contacts.json
const fs = require('fs');
const html = fs.readFileSync('pages/investor-crm.html', 'utf8');

// Find the investors array — starts after "Add new investors below this line"
// and the referral contacts array — starts after "Referral contacts"
const investorMatch = html.match(/const investors = \[([\s\S]*?)\];\s*\/\//);
// WHY: The CRM page has two arrays — investors and referral contacts
// We need both for connection scanning

// Extract using a more robust approach — eval in a sandboxed context
const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
if (!scriptMatch) { console.error('No script block found'); process.exit(1); }

// Write just the data portion for manual extraction
// The structure is complex (nested objects with multi-line strings)
// so manual extraction + validation is safer than eval
console.log('Extract manually — the CRM data structure is complex.');
console.log('Copy the investors array from investor-crm.html into data/crm-contacts.json');
console.log('Format: { "investors": [...], "referrals": [...] }');
```

Actually, since the CRM data has complex multi-line strings with embedded quotes, manually extract by:

1. Open `pages/investor-crm.html`
2. Copy the `investors` array (from `const investors = [` to the matching `];`)
3. Copy the referral contacts array
4. Format as valid JSON in `data/crm-contacts.json`

The JSON structure:
```json
{
  "investors": [
    {
      "name": "...",
      "company": "...",
      "background": "...",
      "whyAccelerate": "...",
      "fundingPath": "...",
      "notes": "...",
      "fundSize": "...",
      "sectors": ["..."]
    }
  ],
  "referrals": [
    {
      "name": "...",
      "company": "...",
      "background": "...",
      "whyAccelerate": "...",
      "fundingPath": "...",
      "notes": "..."
    }
  ]
}
```

The engineer should write a Node script that reads the HTML, uses a regex to extract the JS arrays, evaluates them, and writes the JSON. This is a one-time data extraction.

- [ ] **Step 2: Verify the JSON is valid**

Run: `node -e "const d = require('./data/crm-contacts.json'); console.log(d.investors.length + ' investors, ' + d.referrals.length + ' referrals')"`
Expected: investor count + referral count matching the HTML

- [ ] **Step 3: Commit**

```bash
git add data/crm-contacts.json
git commit -m "feat(prospects): extract CRM contacts to shared JSON

Problem: Investor/contact data is hardcoded in investor-crm.html,
inaccessible to server-side connection scanning.

Solution: Extracted all investors and referral contacts into
data/crm-contacts.json for shared access by CRM page and
market research service."
```

---

### Task 6: Create market research service

**Files:**
- Create: `src/services/market-research.js`

- [ ] **Step 1: Create the research service**

```javascript
const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');

/* WHY: Default monogram colors by brand class — matches the existing prospect
   card design. AI research results use these as fallback colors. */
const DEFAULT_MONO_COLORS = {
  luxury: '#8b7340',
  soft: '#0e7490',
  chain: '#1e40af',
  independent: '#1a6b3a',
};

/**
 * Run AI market research for a given market.
 * @param {string} marketId — the market slug
 * @param {number} count — number of prospects to find (5, 8, or 10)
 * @returns {{ prospects: Array, connections: Array }}
 */
async function runResearch(marketId, count) {
  const market = db.prepare('SELECT * FROM markets WHERE id = ?').get(marketId);
  if (!market) throw new Error('Market not found');

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'sk-ant-your-key-here') {
    throw new Error('ANTHROPIC_API_KEY not configured — add it to .env');
  }

  const client = new Anthropic({ apiKey });

  const systemPrompt = `You are a market research analyst for Accelerate Robotics, a hotel robotics company that deploys autonomous robots (cleaning, delivery, transport) in hotels.

Research the top ${count} hotel prospects in ${market.name} for robotics deployment.

CRITERIA (in priority order):
1. Hotels with 100+ keys (below that, robotics ROI doesn't work)
2. Properties with multiple F&B outlets, event/meeting space, multi-floor layouts
3. Prefer luxury and soft-brand properties (higher willingness to pay for robotics)
4. Include 1-2 chain flagships if they have high floor counts and key volume
5. Flag operator/portfolio relationships (e.g., "Aimbridge manages 3 others in-market")

FOR EACH HOTEL, return this exact JSON structure:
{
  "name": "Official hotel name",
  "address": "Street address, City",
  "brand": "BRAND NAME / PARENT (e.g., WALDORF ASTORIA / HILTON)",
  "brand_class": "luxury|soft|chain|independent",
  "keys": 342,
  "floors": 12,
  "stars": 4,
  "signal": "1-2 sentences on WHY this is a robotics opportunity — not a description, a strategic signal",
  "operator": "Management company name",
  "portfolio": "Portfolio play notes or empty string",
  "monogram": "XX (2-letter abbreviation)",
  "mono_color": "#hex"
}

Return ONLY verifiable data. Do not fabricate key counts or floor counts — if you are unsure, use your best estimate and note it in the signal.

Return your answer as a JSON array wrapped in a markdown code block:
\`\`\`json
[...]
\`\`\``;

  const response = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 4096,
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 10 }],
    messages: [{ role: 'user', content: `Research the top ${count} hotels in ${market.name} for robotics deployment. Use web search to find real, current data.` }],
    system: systemPrompt,
  });

  // WHY: Extract JSON from the response — Claude returns it in a markdown code block
  const textBlocks = response.content.filter(b => b.type === 'text');
  const fullText = textBlocks.map(b => b.text).join('\n');

  const jsonMatch = fullText.match(/```json\s*([\s\S]*?)```/) || fullText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Research returned no structured data — try again');
  }

  let hotels;
  try {
    const raw = jsonMatch[1] || jsonMatch[0];
    hotels = JSON.parse(raw);
  } catch (e) {
    throw new Error('Research returned invalid JSON — try again');
  }

  if (!Array.isArray(hotels) || hotels.length === 0) {
    return { prospects: [], connections: [] };
  }

  // Insert as staged prospects
  const insertProspect = db.prepare(`
    INSERT INTO prospects (market_id, status, name, address, brand, brand_class,
      keys, floors, stars, signal, operator, portfolio, monogram, mono_color,
      source, research_date)
    VALUES (?, 'staged', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ai_research', datetime('now'))
  `);

  const inserted = [];
  const insertAll = db.transaction(() => {
    for (const h of hotels) {
      if (!h.name) continue; // Skip entries without a name
      const monoColor = h.mono_color || DEFAULT_MONO_COLORS[h.brand_class] || '#64748b';
      const monogram = h.monogram || h.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase();

      const result = insertProspect.run(
        marketId, h.name, h.address || null, h.brand || null, h.brand_class || null,
        h.keys || null, h.floors || null, h.stars || null, h.signal || null,
        h.operator || null, h.portfolio || '', monogram, monoColor
      );
      inserted.push({ id: result.lastInsertRowid, ...h, monogram, mono_color: monoColor });
    }
  });
  insertAll();

  // Scan for CRM connections
  const connections = scanConnections(hotels, market.name);

  return { prospects: inserted, connections };
}

/**
 * Scan CRM contacts for strategic connections to the researched prospects.
 * @param {Array} hotels — the research results
 * @param {string} marketName — the market name
 * @returns {Array} connections
 */
function scanConnections(hotels, marketName) {
  const crmPath = path.join(__dirname, '..', '..', 'data', 'crm-contacts.json');
  if (!fs.existsSync(crmPath)) return [];

  let crm;
  try {
    crm = JSON.parse(fs.readFileSync(crmPath, 'utf8'));
  } catch { return []; }

  const allContacts = [...(crm.investors || []), ...(crm.referrals || [])];
  if (!allContacts.length) return [];

  // WHY: Build a set of keywords to search for — brand parents, operators, and market name
  const keywords = new Map();

  // Extract brand parent names (e.g., "HILTON" from "WALDORF ASTORIA / HILTON")
  for (const h of hotels) {
    if (h.brand) {
      const parts = h.brand.split('/').map(s => s.trim());
      for (const part of parts) {
        const clean = part.replace(/\s+/g, ' ').trim();
        if (clean.length >= 3) {
          const key = clean.toLowerCase();
          if (!keywords.has(key)) keywords.set(key, { keyword: clean, type: 'brand', prospects: [] });
          keywords.get(key).prospects.push(h.name);
        }
      }
    }
    if (h.operator) {
      const key = h.operator.toLowerCase();
      if (!keywords.has(key)) keywords.set(key, { keyword: h.operator, type: 'operator', prospects: [] });
      keywords.get(key).prospects.push(h.name);
    }
  }

  // Add market name
  const marketKey = marketName.toLowerCase();
  keywords.set(marketKey, { keyword: marketName, type: 'market', prospects: hotels.map(h => h.name) });

  // Scan contacts
  const connections = [];
  const searchFields = ['background', 'whyAccelerate', 'fundingPath', 'notes'];

  for (const [key, kwData] of keywords) {
    const matchingContacts = [];

    for (const contact of allContacts) {
      const haystack = searchFields.map(f => contact[f] || '').join(' ').toLowerCase();
      if (haystack.includes(key)) {
        // WHY: Extract a short snippet around the match for context
        const fullText = searchFields.map(f => contact[f] || '').join(' ');
        const idx = fullText.toLowerCase().indexOf(key);
        const start = Math.max(0, idx - 40);
        const end = Math.min(fullText.length, idx + key.length + 80);
        let snippet = fullText.slice(start, end).trim();
        if (start > 0) snippet = '...' + snippet;
        if (end < fullText.length) snippet += '...';

        matchingContacts.push({ name: contact.name, company: contact.company, snippet });
      }
    }

    if (matchingContacts.length > 0) {
      connections.push({
        keyword: kwData.keyword,
        matchType: kwData.type,
        prospectCount: kwData.prospects.length,
        contacts: matchingContacts,
      });
    }
  }

  return connections;
}

module.exports = { runResearch, scanConnections };
```

- [ ] **Step 2: Install the Anthropic SDK**

Run: `cd /Users/ericrace/Code/accelerate-robotics && npm install @anthropic-ai/sdk`

- [ ] **Step 3: Add ANTHROPIC_API_KEY to .env.example**

Append to `.env.example`:
```
# WHY: Required for AI-powered market research in the prospect pipeline
ANTHROPIC_API_KEY=sk-ant-your-key-here
```

- [ ] **Step 4: Commit**

```bash
git add src/services/market-research.js .env.example package.json package-lock.json
git commit -m "feat(prospects): create market research service with Claude API

Problem: No way to automatically research hotel prospects in new markets.

Solution: market-research.js calls Claude API with web_search tool using
a structured prompt targeting 100+ key hotels with robotics opportunity
signals. Parses JSON response, inserts as staged prospects, scans CRM
contacts for brand/operator/market keyword matches."
```

---

### Task 7: Wire research endpoint into markets route and mount everything in server.js

**Files:**
- Modify: `src/routes/markets.js`
- Modify: `src/server.js`

- [ ] **Step 1: Add research endpoint to markets route**

Add to the bottom of `src/routes/markets.js`, before `module.exports`:

```javascript
// ── Trigger AI market research ───────────────────────────────
const { runResearch } = require('../services/market-research');

router.post('/:id/research', requireAuth, async (req, res) => {
  const { count } = req.body;
  const validCounts = [5, 8, 10];
  const targetCount = validCounts.includes(count) ? count : 10;

  try {
    const result = await runResearch(req.params.id, targetCount);
    res.json(result);
  } catch (err) {
    // WHY: Distinguish between config errors (503) and API errors (502)
    if (err.message.includes('not configured')) {
      return res.status(503).json({ error: err.message });
    }
    if (err.message.includes('not found')) {
      return res.status(404).json({ error: err.message });
    }
    console.error('[research]', err);
    res.status(502).json({ error: err.message || 'Research failed — try again' });
  }
});
```

- [ ] **Step 2: Mount routes and seeder in server.js**

Add imports near the top of `src/server.js` (after the existing route requires):

```javascript
const marketRoutes = require('./routes/markets');
const prospectRoutes = require('./routes/prospects');
const { seedProspects } = require('./db/seed-prospects');
```

Add route mounting (after the existing `app.use('/api/...')` lines):

```javascript
app.use('/api/markets', marketRoutes);
app.use('/api/prospects', prospectRoutes);
```

Add seeder call at server startup. Find the `app.listen` block and add `seedProspects()` before it:

```javascript
// WHY: Seed prospect data on first boot — idempotent, skips if data exists
seedProspects();
```

- [ ] **Step 3: Restart the server and verify**

Run: `npm run dev` (restart if already running)

Test the APIs:
```bash
curl -s http://localhost:3000/api/markets | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).length+' markets'))"
curl -s http://localhost:3000/api/prospects?status=confirmed | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).length+' prospects'))"
```
Expected: `14 markets`, `66 prospects`

- [ ] **Step 4: Commit**

```bash
git add src/routes/markets.js src/server.js
git commit -m "feat(prospects): mount market/prospect routes and seeder in server

Problem: New routes and seeder need to be wired into the Express server.

Solution: Mounted /api/markets (with /research sub-route) and /api/prospects
routes. Seeder runs on boot before app.listen — idempotent."
```

---

### Task 8: Rewrite pipeline page — switch to API data source

**Files:**
- Modify: `pages/pipeline-prospects.html`

This is the largest UI task. The page currently has a hardcoded `PROSPECTS` array (lines 194-261) and `CLUSTER_LABELS` (line 263). Replace these with API-fetched data.

- [ ] **Step 1: Replace the hardcoded data with API fetch**

Delete the entire `const PROSPECTS = [...]` array (lines 194-261) and `const CLUSTER_LABELS = {...}` (line 263).

Replace with:

```javascript
// ── Data (loaded from API) ─────────────────────────────────────
let PROSPECTS = [];
let MARKETS = [];
let STAGED_PROSPECTS = [];
let STAGED_CONNECTIONS = {};

async function loadData() {
  const [prospectsRes, marketsRes, stagedRes] = await Promise.all([
    fetch('/api/prospects?status=confirmed'),
    fetch('/api/markets'),
    fetch('/api/prospects?status=staged'),
  ]);

  PROSPECTS = prospectsRes.ok ? await prospectsRes.json() : [];
  MARKETS = marketsRes.ok ? await marketsRes.json() : [];
  STAGED_PROSPECTS = stagedRes.ok ? await stagedRes.json() : [];

  // WHY: Build cluster labels from market data (replaces hardcoded CLUSTER_LABELS)
  buildClusterLabels();
  renderAll();
  renderMarketChips();
  renderStagingArea();
}
```

- [ ] **Step 2: Add cluster label builder and update filter chip rendering**

Replace the hardcoded `CLUSTER_LABELS` usage with a dynamic builder:

```javascript
let CLUSTER_LABELS = {};

function buildClusterLabels() {
  CLUSTER_LABELS = {};
  for (const m of MARKETS) {
    if (m.cluster && !CLUSTER_LABELS[m.cluster]) {
      // WHY: Capitalize cluster slug for display (sf-bay → SF Bay)
      CLUSTER_LABELS[m.cluster] = m.cluster
        .split('-')
        .map(w => w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))
        .join(' ');
    }
  }
}
```

- [ ] **Step 3: Add dynamic market chip rendering**

Find the market filter chip HTML in the template (the row with `MARKET` label and chip buttons) and give the container an id `marketChips`. Then add the rendering function:

```javascript
function renderMarketChips() {
  const container = document.getElementById('marketChips');
  if (!container) return;

  const clusters = Object.entries(CLUSTER_LABELS);
  container.innerHTML =
    `<span class="chip active" data-filter="cluster" data-val="all" onclick="toggleFilter('cluster','all')" style="color:#111;border-color:#d1d5db">All</span>` +
    clusters.map(([slug, label]) =>
      `<span class="chip" data-filter="cluster" data-val="${slug}" onclick="toggleFilter('cluster','${slug}')" style="color:${getClusterColor(slug)}">${label}</span>`
    ).join('') +
    `<button onclick="openAddMarketForm()" class="chip" style="color:var(--blue);border:1.5px dashed var(--blue);font-weight:700" title="Add Market">+</button>`;
}

function getClusterColor(cluster) {
  // WHY: Find the first market in this cluster to get its color
  const m = MARKETS.find(mk => mk.cluster === cluster);
  return m?.color || '#64748b';
}
```

- [ ] **Step 4: Update getFiltered to use PROSPECTS variable**

The `getFiltered()` function (line ~277) already references `PROSPECTS` — since we changed it from `const` to `let` and load via API, the filtering logic works as-is. But update the `openDealModal` calls in `renderCards` and `renderTable` to use prospect `id` instead of array index:

In `renderCards`, change:
```javascript
<button onclick="openDealModal(${PROSPECTS.indexOf(p)})"
```
To:
```javascript
<button onclick="openDealModal(${p.id})"
```

Similarly update the same pattern in `renderTable`.

Update `openDealModal` to find by id instead of index:

```javascript
function openDealModal(prospectId) {
  const p = PROSPECTS.find(pr => pr.id === prospectId) || STAGED_PROSPECTS.find(pr => pr.id === prospectId);
  if (!p) return;
  document.getElementById('dealModal').classList.remove('hidden');
  document.getElementById('modalSubtitle').textContent = `${p.name} — ${p.market_name || ''} (${p.keys} keys, ${p.floors} floors)`;
  document.getElementById('dealName').value = p.name;
  document.getElementById('dealFacilityName').value = p.name;
  document.getElementById('dealCity').value = p.market_name || '';
  document.getElementById('dealKeys').value = p.keys || '';
  document.getElementById('dealFloors').value = p.floors || '';
  document.getElementById('dealBrand').value = p.brand || '';
  document.getElementById('dealError').classList.add('hidden');
}
```

- [ ] **Step 5: Update the init block**

Replace the init block at the bottom (lines ~491-492):
```javascript
setSort('keys');
renderAll();
```

With:
```javascript
setSort('keys');
loadData();
```

- [ ] **Step 6: Add prospect card source badge**

In `renderCards`, after the signal line, add an AI research badge if the prospect was AI-sourced:

```javascript
${p.source === 'ai_research' ? `<div class="text-[0.6rem] text-purple-500 font-semibold mt-1" style="padding-left:8px;">🔬 AI Researched${p.research_date ? ' — ' + new Date(p.research_date).toLocaleDateString() : ''}</div>` : ''}
```

- [ ] **Step 7: Update field name references**

The API returns `brand_class` (snake_case) but the old data used `brandClass` (camelCase). Update all references in the filtering and rendering functions:
- `p.brandClass` → `p.brand_class`
- `p.monoColor` → `p.mono_color`
- `p.market` → `p.market_name`

Use find-and-replace across the `<script>` block. Key locations:
- `getFiltered()`: `p.brandClass` → `p.brand_class`
- `renderCards()`: `p.brandClass` → `p.brand_class`, `p.monoColor` → `p.mono_color`, `p.market` → `p.market_name`
- `renderTable()`: same field renames
- `BRAND_CLASS_COLORS`, `BRAND_CLASS_BG`, `STRIPE_GRADIENTS` — these use the brand_class value as keys, so the keys stay the same, but the lookup changes from `p.brandClass` to `p.brand_class`

Also add the `cluster` field mapping — the API returns `cluster` on each prospect (from the JOIN), so `p.cluster` works as-is for filtering.

- [ ] **Step 8: Commit**

```bash
git add pages/pipeline-prospects.html
git commit -m "feat(prospects): switch pipeline page to API data source

Problem: Pipeline page used a hardcoded 66-prospect JS array with no
ability to add or modify prospects dynamically.

Solution: Page now fetches from GET /api/prospects and /api/markets on
load. Market chips rendered dynamically with '+' add button. Field names
updated to match API snake_case. Source badge shows AI-researched prospects."
```

---

### Task 9: Add market form and research trigger

**Files:**
- Modify: `pages/pipeline-prospects.html`

- [ ] **Step 1: Add the market form HTML**

After the market chip row, add a collapsible form container:

```html
<div id="addMarketForm" class="hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
  <h3 class="headline text-sm font-bold text-gray-900 mb-4">Add New Market</h3>
  <div class="grid grid-cols-2 gap-4">
    <div>
      <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Market Name <span class="text-red-400">*</span></label>
      <input type="text" id="mktName" placeholder="e.g. Austin" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm">
    </div>
    <div>
      <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Cluster</label>
      <select id="mktCluster" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white">
        <option value="">— Existing cluster or new —</option>
      </select>
      <input type="text" id="mktClusterNew" placeholder="New cluster name" class="hidden w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm mt-2">
    </div>
    <div>
      <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Color</label>
      <div class="flex gap-2" id="mktColorSwatches"></div>
    </div>
    <div>
      <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Strategic Notes</label>
      <textarea id="mktNotes" rows="2" placeholder="Why this market? Hiring pool, operational footprint..." class="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm resize-none"></textarea>
    </div>
  </div>
  <div class="flex items-center gap-4 mt-4">
    <label class="flex items-center gap-2 text-sm cursor-pointer">
      <input type="checkbox" id="mktResearch" class="rounded"> Run AI Research
    </label>
    <select id="mktResearchCount" class="hidden px-3 py-1.5 rounded-lg border border-gray-200 text-sm">
      <option value="5">5 hotels</option>
      <option value="8" selected>8 hotels</option>
      <option value="10">10 hotels</option>
    </select>
  </div>
  <div class="flex gap-3 mt-4">
    <button onclick="submitMarket()" class="brand-btn-primary px-5 py-2 text-sm">Add Market</button>
    <button onclick="closeAddMarketForm()" class="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold rounded-xl transition text-sm">Cancel</button>
  </div>
  <div id="mktLoading" class="hidden mt-4 flex items-center gap-3 text-sm text-blue-600">
    <div class="animate-spin w-5 h-5 border-2 border-blue-600 border-t-transparent rounded-full"></div>
    <span id="mktLoadingText">Researching hotels...</span>
  </div>
  <p id="mktError" class="hidden text-red-600 text-xs font-medium mt-3"></p>
</div>
```

- [ ] **Step 2: Add the form JS logic**

```javascript
const SWATCH_COLORS = ['#2563eb', '#7c3aed', '#0891b2', '#d97706', '#16a34a', '#dc2626', '#f59e0b', '#64748b'];
let selectedColor = SWATCH_COLORS[0];

function openAddMarketForm() {
  const form = document.getElementById('addMarketForm');
  form.classList.remove('hidden');

  // Populate cluster dropdown
  const sel = document.getElementById('mktCluster');
  const clusters = [...new Set(MARKETS.map(m => m.cluster).filter(Boolean))];
  sel.innerHTML = `<option value="">— Select cluster —</option>` +
    clusters.map(c => `<option value="${c}">${CLUSTER_LABELS[c] || c}</option>`).join('') +
    `<option value="__new__">+ New cluster</option>`;

  // Color swatches
  document.getElementById('mktColorSwatches').innerHTML = SWATCH_COLORS.map(c =>
    `<button onclick="selectColor('${c}')" class="w-7 h-7 rounded-full border-2 transition" style="background:${c};border-color:${c === selectedColor ? '#111' : 'transparent'}" data-color="${c}"></button>`
  ).join('');

  // Research toggle
  document.getElementById('mktResearch').addEventListener('change', e => {
    document.getElementById('mktResearchCount').classList.toggle('hidden', !e.target.checked);
  });

  // Cluster new toggle
  sel.addEventListener('change', () => {
    document.getElementById('mktClusterNew').classList.toggle('hidden', sel.value !== '__new__');
  });
}

function closeAddMarketForm() {
  document.getElementById('addMarketForm').classList.add('hidden');
  document.getElementById('mktError').classList.add('hidden');
  document.getElementById('mktLoading').classList.add('hidden');
}

function selectColor(c) {
  selectedColor = c;
  document.querySelectorAll('#mktColorSwatches button').forEach(b => {
    b.style.borderColor = b.dataset.color === c ? '#111' : 'transparent';
  });
}

async function submitMarket() {
  const name = document.getElementById('mktName').value.trim();
  if (!name) {
    showMktError('Market name is required');
    return;
  }

  const clusterSel = document.getElementById('mktCluster').value;
  const cluster = clusterSel === '__new__'
    ? document.getElementById('mktClusterNew').value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-')
    : clusterSel || null;

  const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
  const notes = document.getElementById('mktNotes').value.trim() || null;
  const doResearch = document.getElementById('mktResearch').checked;
  const count = parseInt(document.getElementById('mktResearchCount').value, 10);

  const errEl = document.getElementById('mktError');
  errEl.classList.add('hidden');

  try {
    // Create market
    const res = await fetch('/api/markets', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, name, cluster, color: selectedColor, notes }),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to create market');
    }

    if (doResearch) {
      // Show loading state
      document.getElementById('mktLoading').classList.remove('hidden');
      document.getElementById('mktLoadingText').textContent = `Researching ${name} hotels... this takes 15–30 seconds`;

      const rRes = await fetch(`/api/markets/${id}/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count }),
      });
      document.getElementById('mktLoading').classList.add('hidden');

      if (!rRes.ok) {
        const err = await rRes.json();
        // WHY: Market was created even if research fails — still show it
        await loadData();
        closeAddMarketForm();
        showMktError(err.error || 'Research failed — market created but no prospects added');
        return;
      }

      const result = await rRes.json();
      // Store connections for this market's staging area
      if (result.connections?.length) {
        STAGED_CONNECTIONS[id] = result.connections;
      }
    }

    await loadData();
    closeAddMarketForm();
  } catch (err) {
    document.getElementById('mktLoading').classList.add('hidden');
    showMktError(err.message);
  }
}

function showMktError(msg) {
  const el = document.getElementById('mktError');
  el.textContent = msg;
  el.classList.remove('hidden');
}
```

- [ ] **Step 3: Commit**

```bash
git add pages/pipeline-prospects.html
git commit -m "feat(prospects): add market creation form with AI research trigger

Problem: No UI to add new geographic markets or trigger AI research.

Solution: Inline form with market name, cluster (existing or new), color
swatches, strategic notes, and optional AI research toggle with count
selector (5/8/10). Loading spinner during research. Error handling
preserves created market even if research fails."
```

---

### Task 10: Add staging area to pipeline page

**Files:**
- Modify: `pages/pipeline-prospects.html`

- [ ] **Step 1: Add the staging area HTML container**

Add a container div right below the stats row and above the search bar:

```html
<div id="stagingArea"></div>
```

- [ ] **Step 2: Add staging area render function**

```javascript
function renderStagingArea() {
  const container = document.getElementById('stagingArea');
  if (!container) return;

  if (!STAGED_PROSPECTS.length) {
    container.innerHTML = '';
    return;
  }

  // Group staged prospects by market
  const byMarket = {};
  for (const p of STAGED_PROSPECTS) {
    const key = p.market_id || 'unknown';
    if (!byMarket[key]) byMarket[key] = { name: p.market_name || key, prospects: [] };
    byMarket[key].prospects.push(p);
  }

  container.innerHTML = Object.entries(byMarket).map(([mktId, group]) => {
    const connections = STAGED_CONNECTIONS[mktId] || [];
    return `
    <div class="bg-white rounded-2xl shadow-sm border border-blue-100 p-5 mb-4">
      <div class="flex items-center justify-between mb-3">
        <div>
          <h3 class="headline text-sm font-bold text-gray-900">🔬 Research Results — ${esc(group.name)}</h3>
          <p class="text-xs text-gray-400 mt-0.5">${group.prospects.length} hotels found · AI Researched — ${new Date().toLocaleDateString()}</p>
        </div>
        <div class="flex gap-2">
          <button onclick="selectAllStaged('${mktId}')" class="text-xs font-semibold text-blue-600 hover:underline">Select All</button>
          <button onclick="confirmStaged('${mktId}')" class="brand-btn-primary px-4 py-1.5 text-xs">Add Selected to Pipeline</button>
          <button onclick="discardStaged('${mktId}')" class="px-4 py-1.5 bg-red-50 hover:bg-red-100 text-red-600 font-semibold rounded-xl transition text-xs">Discard All</button>
        </div>
      </div>
      <div class="space-y-2">
        ${group.prospects.map(p => `
          <div class="flex items-start gap-3 p-3 rounded-xl border border-gray-100 hover:border-blue-200 transition" data-staged-id="${p.id}">
            <input type="checkbox" checked class="mt-1 rounded staged-check" data-id="${p.id}" data-market="${mktId}">
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 flex-wrap">
                <strong class="text-sm text-gray-900">${esc(p.name)}</strong>
                <span class="text-xs text-gray-400">${p.keys || '?'} keys · ${p.floors || '?'} fl</span>
                <span class="inline-block text-[0.6rem] font-semibold px-2 py-0.5 rounded ${BRAND_CLASS_BG[p.brand_class] || 'bg-gray-100 text-gray-600'}">${esc(p.brand || '')}</span>
              </div>
              <p class="text-xs text-gray-500 mt-1">${esc(p.signal || '')}</p>
              <p class="text-[0.6rem] text-gray-400 mt-0.5">${esc(p.operator || '')}${p.portfolio ? ' · ' + esc(p.portfolio) : ''}</p>
            </div>
            <button onclick="editStagedProspect(${p.id})" class="text-xs text-blue-600 hover:underline flex-shrink-0">Edit</button>
          </div>
        `).join('')}
      </div>
      ${connections.length ? `
        <div class="mt-4 pt-4 border-t border-gray-100">
          <h4 class="text-xs font-bold text-gray-500 uppercase tracking-wide mb-2">Strategic Connections</h4>
          ${connections.map(c => `
            <div class="flex items-start gap-2 mb-2">
              <span class="inline-block text-[0.6rem] font-semibold px-2 py-0.5 rounded bg-purple-50 text-purple-700">${esc(c.keyword)}</span>
              <span class="text-xs text-gray-400">(${c.prospectCount} prospect${c.prospectCount > 1 ? 's' : ''})</span>
              <span class="text-xs text-gray-600">—</span>
              ${c.contacts.map(ct => `<span class="text-xs"><strong class="text-gray-700">${esc(ct.name)}</strong>: <span class="text-gray-500">${esc(ct.snippet)}</span></span>`).join(', ')}
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>`;
  }).join('');
}

function selectAllStaged(marketId) {
  document.querySelectorAll(`.staged-check[data-market="${marketId}"]`).forEach(cb => { cb.checked = true; });
}

async function confirmStaged(marketId) {
  const ids = Array.from(document.querySelectorAll(`.staged-check[data-market="${marketId}"]:checked`))
    .map(cb => parseInt(cb.dataset.id, 10));

  if (!ids.length) return;

  const res = await fetch('/api/prospects/bulk-confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });

  if (res.ok) {
    delete STAGED_CONNECTIONS[marketId];
    await loadData();
  }
}

async function discardStaged(marketId) {
  const ids = STAGED_PROSPECTS.filter(p => p.market_id === marketId).map(p => p.id);
  if (!ids.length) return;

  if (!confirm(`Discard all ${ids.length} research results for this market?`)) return;

  const res = await fetch('/api/prospects/bulk-delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids }),
  });

  if (res.ok) {
    delete STAGED_CONNECTIONS[marketId];
    await loadData();
  }
}

function editStagedProspect(id) {
  // WHY: Simple inline edit — prompt for each field
  const p = STAGED_PROSPECTS.find(pr => pr.id === id);
  if (!p) return;

  const name = prompt('Hotel name:', p.name);
  if (name === null) return;
  const keys = prompt('Keys (room count):', p.keys);
  const signal = prompt('Signal (opportunity reason):', p.signal);

  fetch(`/api/prospects/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: name || p.name,
      keys: keys ? parseInt(keys, 10) : p.keys,
      signal: signal || p.signal,
    }),
  }).then(() => loadData());
}
```

- [ ] **Step 3: Commit**

```bash
git add pages/pipeline-prospects.html
git commit -m "feat(prospects): add staging area for AI research results

Problem: No way to review, edit, and selectively approve AI-researched
prospects before they enter the pipeline.

Solution: Staging area appears at top of pipeline page when staged
prospects exist. Grouped by market with select-all, bulk-confirm,
bulk-discard, and inline edit. Shows strategic CRM connections panel
below staged prospects."
```

---

### Task 11: Add manual prospect form

**Files:**
- Modify: `pages/pipeline-prospects.html`

- [ ] **Step 1: Add manual prospect form HTML**

Add below the Add Market form:

```html
<div id="addProspectForm" class="hidden bg-white rounded-2xl shadow-sm border border-gray-100 p-5 mb-4">
  <h3 class="headline text-sm font-bold text-gray-900 mb-4">Add Prospect Manually</h3>
  <div class="grid grid-cols-3 gap-4">
    <div>
      <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Market <span class="text-red-400">*</span></label>
      <select id="prpMarket" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white"></select>
    </div>
    <div>
      <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Hotel Name <span class="text-red-400">*</span></label>
      <input type="text" id="prpName" placeholder="e.g. JW Marriott Austin" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm">
    </div>
    <div>
      <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Address</label>
      <input type="text" id="prpAddress" placeholder="110 E 2nd St" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm">
    </div>
    <div>
      <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Brand</label>
      <input type="text" id="prpBrand" placeholder="JW MARRIOTT / MARRIOTT" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm">
    </div>
    <div>
      <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Brand Class</label>
      <select id="prpBrandClass" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm bg-white">
        <option value="">— Select —</option>
        <option value="luxury">Luxury</option>
        <option value="soft">Soft Brand</option>
        <option value="chain">Chain</option>
        <option value="independent">Independent</option>
      </select>
    </div>
    <div class="grid grid-cols-3 gap-2">
      <div>
        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Keys</label>
        <input type="number" id="prpKeys" placeholder="342" class="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm">
      </div>
      <div>
        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Floors</label>
        <input type="number" id="prpFloors" placeholder="12" class="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm">
      </div>
      <div>
        <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Stars</label>
        <input type="number" id="prpStars" min="1" max="5" placeholder="4" class="w-full px-3 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm">
      </div>
    </div>
    <div class="col-span-2">
      <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Signal</label>
      <input type="text" id="prpSignal" placeholder="Why is this a robotics opportunity?" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm">
    </div>
    <div>
      <label class="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Operator</label>
      <input type="text" id="prpOperator" placeholder="Marriott International" class="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:ring-2 focus:ring-blue-500 outline-none text-sm">
    </div>
  </div>
  <div class="flex gap-3 mt-4">
    <button onclick="submitProspect()" class="brand-btn-primary px-5 py-2 text-sm">Add Prospect</button>
    <button onclick="closeAddProspectForm()" class="px-5 py-2 bg-gray-100 hover:bg-gray-200 text-gray-600 font-semibold rounded-xl transition text-sm">Cancel</button>
  </div>
  <p id="prpError" class="hidden text-red-600 text-xs font-medium mt-3"></p>
</div>
```

- [ ] **Step 2: Add the form JS**

```javascript
function openAddProspectForm() {
  document.getElementById('addProspectForm').classList.remove('hidden');
  const sel = document.getElementById('prpMarket');
  sel.innerHTML = `<option value="">— Select market —</option>` +
    MARKETS.map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('');
}

function closeAddProspectForm() {
  document.getElementById('addProspectForm').classList.add('hidden');
}

async function submitProspect() {
  const market_id = document.getElementById('prpMarket').value;
  const name = document.getElementById('prpName').value.trim();
  if (!market_id || !name) {
    document.getElementById('prpError').textContent = 'Market and name are required';
    document.getElementById('prpError').classList.remove('hidden');
    return;
  }

  const body = {
    market_id, name,
    address: document.getElementById('prpAddress').value || null,
    brand: document.getElementById('prpBrand').value || null,
    brand_class: document.getElementById('prpBrandClass').value || null,
    keys: document.getElementById('prpKeys').value ? parseInt(document.getElementById('prpKeys').value, 10) : null,
    floors: document.getElementById('prpFloors').value ? parseInt(document.getElementById('prpFloors').value, 10) : null,
    stars: document.getElementById('prpStars').value ? parseInt(document.getElementById('prpStars').value, 10) : null,
    signal: document.getElementById('prpSignal').value || null,
    operator: document.getElementById('prpOperator').value || null,
    monogram: name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase(),
  };

  try {
    const res = await fetch('/api/prospects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Failed to add prospect');
    }
    closeAddProspectForm();
    await loadData();
  } catch (err) {
    document.getElementById('prpError').textContent = err.message;
    document.getElementById('prpError').classList.remove('hidden');
  }
}
```

- [ ] **Step 3: Add the "+ Add Prospect" button next to the "+" market chip**

In the `renderMarketChips` function, add after the "+" market button:

```javascript
`<button onclick="openAddProspectForm()" class="chip" style="color:var(--green);border:1.5px dashed var(--green);font-weight:700" title="Add Prospect">+ Prospect</button>`;
```

- [ ] **Step 4: Commit**

```bash
git add pages/pipeline-prospects.html
git commit -m "feat(prospects): add manual prospect entry form

Problem: No way to manually add individual hotel prospects to the pipeline.

Solution: Inline form with all prospect fields (market, name, address,
brand, keys, floors, stars, signal, operator). Auto-generates monogram.
Inserts as confirmed/manual source."
```

---

### Task 12: Update investor CRM page to load from shared JSON

**Files:**
- Modify: `pages/investor-crm.html`

- [ ] **Step 1: Replace the inline investor array with a fetch**

In `pages/investor-crm.html`, find the `const investors = [` array (around line 450) and the referral contacts array. Replace both with:

```javascript
let investors = [];
let referrals = [];

async function loadCRMData() {
  try {
    const res = await fetch('/data/crm-contacts.json');
    if (res.ok) {
      const data = await res.json();
      investors = data.investors || [];
      referrals = data.referrals || [];
    }
  } catch (e) {
    console.error('[CRM] Failed to load contacts:', e);
  }
  renderInvestors();
}
```

Note: The JSON file is at `data/crm-contacts.json` — it needs to be served. Add a static mount in server.js:

```javascript
app.use('/data', express.static(path.join(__dirname, '..', 'data')));
```

Update the init block to call `loadCRMData()` instead of directly rendering.

- [ ] **Step 2: Add the static mount to server.js**

In `src/server.js`, add after the existing static mounts:

```javascript
// WHY: Serve data/ directory for shared JSON files (CRM contacts, seed data)
app.use('/data', express.static(path.join(__dirname, '..', 'data')));
```

- [ ] **Step 3: Commit**

```bash
git add pages/investor-crm.html src/server.js
git commit -m "feat(prospects): switch CRM page to shared JSON data source

Problem: Investor CRM data was hardcoded in HTML, inaccessible to
server-side connection scanning.

Solution: CRM page now fetches from /data/crm-contacts.json. Added
/data static mount in server.js for shared JSON access."
```

---

### Task 13: Test the full flow

**Files:** None (verification only)

- [ ] **Step 1: Verify server starts and seeds data**

Run: `npm run dev`
Expected: Console shows `[seed] Inserted 14 markets and 66 prospects` on first boot (or nothing if already seeded)

- [ ] **Step 2: Verify APIs**

```bash
curl -s http://localhost:3000/api/markets | node -e "process.stdin.on('data',d=>{const m=JSON.parse(d);console.log(m.length+' markets');console.log(m[0])})"
curl -s "http://localhost:3000/api/prospects?status=confirmed" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).length+' confirmed prospects'))"
curl -s "http://localhost:3000/api/prospects?status=staged" | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).length+' staged prospects'))"
```
Expected: 14 markets, 66 confirmed, 0 staged

- [ ] **Step 3: Open pipeline page in browser**

Open: `http://localhost:3000/pages/pipeline-prospects.html`
Verify:
- 66 prospects load and display (cards and table)
- Market filter chips appear dynamically with "+" button
- Stats show correct counts
- Search and sort still work

- [ ] **Step 4: Test adding a market (without research)**

Click "+" on market chips. Fill in:
- Name: "Test Market"
- Leave research unchecked
Click "Add Market"
Verify: New chip appears in filter row

- [ ] **Step 5: Test adding a market with research (if API key is set)**

Click "+". Fill in:
- Name: "Austin"
- Check "Run AI Research"
- Count: 5
Click "Add Market"
Verify: Loading spinner appears, then staging area shows results

- [ ] **Step 6: Test staging area actions**

- Uncheck 2 prospects, click "Add Selected to Pipeline" — verify they move to confirmed
- For remaining staged prospects, click "Discard All" — verify they disappear

- [ ] **Step 7: Test manual prospect add**

Click "+ Prospect". Fill in required fields. Submit.
Verify: New prospect appears in the pipeline.

- [ ] **Step 8: Test CRM page still works**

Open: `http://localhost:3000/pages/investor-crm.html`
Verify: Investor cards load correctly from JSON

- [ ] **Step 9: Commit any fixes**

```bash
git add -p
git commit -m "fix(prospects): QA fixes from full flow testing"
```
