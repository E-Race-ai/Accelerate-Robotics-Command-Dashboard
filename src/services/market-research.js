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
