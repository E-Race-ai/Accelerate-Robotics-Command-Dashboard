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

module.exports = router;
