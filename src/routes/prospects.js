const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── List prospects ────────────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
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

  const prospects = await db.all(sql, params);
  res.json(prospects);
});

// ── Get single prospect ──────────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  const prospect = await db.one(`
    SELECT p.*, m.name as market_name, m.cluster
    FROM prospects p LEFT JOIN markets m ON p.market_id = m.id
    WHERE p.id = ?
  `, [req.params.id]);
  if (!prospect) return res.status(404).json({ error: 'Prospect not found' });
  res.json(prospect);
});

// ── Create a prospect (manual entry) ─────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const { market_id, name, address, brand, brand_class, keys, floors, stars,
          signal, operator, portfolio, monogram, mono_color } = req.body;

  if (!market_id || !name) {
    return res.status(400).json({ error: 'market_id and name are required' });
  }

  const market = await db.one('SELECT id FROM markets WHERE id = ?', [market_id]);
  if (!market) return res.status(400).json({ error: 'Market not found' });

  const result = await db.run(`
    INSERT INTO prospects (market_id, status, name, address, brand, brand_class,
      keys, floors, stars, signal, operator, portfolio, monogram, mono_color, source)
    VALUES (?, 'confirmed', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'manual')
  `, [market_id, name, address || null, brand || null, brand_class || null,
    keys || null, floors || null, stars || null, signal || null,
    operator || null, portfolio || null, monogram || null, mono_color || null]);

  const prospect = await db.one('SELECT * FROM prospects WHERE id = ?', [result.lastInsertRowid]);
  res.status(201).json(prospect);
});

// ── Update a prospect ────────────────────────────────────────
router.patch('/:id', requireAuth, async (req, res) => {
  const prospect = await db.one('SELECT * FROM prospects WHERE id = ?', [req.params.id]);
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

  await db.run(`UPDATE prospects SET ${updates.join(', ')} WHERE id = ?`, params);
  const updated = await db.one('SELECT * FROM prospects WHERE id = ?', [req.params.id]);
  res.json(updated);
});

// ── Delete a prospect ────────────────────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  const prospect = await db.one('SELECT * FROM prospects WHERE id = ?', [req.params.id]);
  if (!prospect) return res.status(404).json({ error: 'Prospect not found' });

  await db.run('DELETE FROM prospects WHERE id = ?', [req.params.id]);
  res.json({ deleted: true });
});

// ── Bulk confirm (staged → confirmed) ────────────────────────
router.post('/bulk-confirm', requireAuth, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: 'ids array is required' });
  }

  const placeholders = ids.map(() => '?').join(',');
  const result = await db.run(`
    UPDATE prospects SET status = 'confirmed', updated_at = datetime('now')
    WHERE id IN (${placeholders}) AND status = 'staged'
  `, ids);

  res.json({ confirmed: result.changes });
});

// ── Bulk delete ──────────────────────────────────────────────
router.post('/bulk-delete', requireAuth, async (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ error: 'ids array is required' });
  }

  const placeholders = ids.map(() => '?').join(',');
  const result = await db.run(`DELETE FROM prospects WHERE id IN (${placeholders})`, ids);
  res.json({ deleted: result.changes });
});

module.exports = router;
