const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// All routes require admin auth
router.use(requireAuth);

// ── List recipients ─────────────────────────────────────────────
router.get('/', async (req, res) => {
  const rows = await db.all('SELECT * FROM notification_recipients ORDER BY created_at DESC');
  res.json(rows);
});

// ── Add recipient ───────────────────────────────────────────────
router.post('/', async (req, res) => {
  const { email, name } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    const inserted = await db.one(
      'INSERT INTO notification_recipients (email, name) VALUES ($1, $2) RETURNING id',
      [email, name || null],
    );
    res.status(201).json({ id: inserted.id, email, name, active: 1 });
  } catch (err) {
    // WHY: Postgres unique-violation SQLSTATE is 23505 (distinct from SQLite's text message)
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Recipient already exists' });
    }
    console.error('[recipients] Insert error:', err.message);
    res.status(500).json({ error: 'Failed to add recipient' });
  }
});

// ── Update recipient ────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  const { email, name, active } = req.body;
  const sets = [];
  const values = [];
  let n = 1;

  if (email !== undefined) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    sets.push(`email = $${n++}`);
    values.push(email);
  }
  if (name !== undefined) { sets.push(`name = $${n++}`); values.push(name); }
  if (active !== undefined) { sets.push(`active = $${n++}`); values.push(active ? 1 : 0); }

  if (sets.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(req.params.id);
  const result = await db.run(
    `UPDATE notification_recipients SET ${sets.join(', ')} WHERE id = $${n}`,
    values,
  );

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Recipient not found' });
  }
  res.json({ ok: true });
});

// ── Delete recipient ────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const result = await db.run(
    'DELETE FROM notification_recipients WHERE id = $1',
    [req.params.id],
  );
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Recipient not found' });
  }
  res.json({ ok: true });
});

module.exports = router;
