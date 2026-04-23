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
    const result = await db.run(
      'INSERT INTO notification_recipients (email, name) VALUES (?, ?)',
      [email, name || null]
    );

    res.status(201).json({ id: result.lastInsertRowid, email, name, active: 1 });
  } catch (err) {
    if (err.message.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Recipient already exists' });
    }
    console.error('[recipients] Insert error:', err.message);
    res.status(500).json({ error: 'Failed to add recipient' });
  }
});

// ── Update recipient ────────────────────────────────────────────
router.patch('/:id', async (req, res) => {
  const { email, name, active } = req.body;
  const fields = [];
  const values = [];

  if (email !== undefined) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }
    fields.push('email = ?');
    values.push(email);
  }
  if (name !== undefined) { fields.push('name = ?'); values.push(name); }
  if (active !== undefined) { fields.push('active = ?'); values.push(active ? 1 : 0); }

  if (fields.length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  values.push(req.params.id);
  const result = await db.run(`UPDATE notification_recipients SET ${fields.join(', ')} WHERE id = ?`, values);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Recipient not found' });
  }
  res.json({ ok: true });
});

// ── Delete recipient ────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  const result = await db.run('DELETE FROM notification_recipients WHERE id = ?', [req.params.id]);
  if (result.changes === 0) {
    return res.status(404).json({ error: 'Recipient not found' });
  }
  res.json({ ok: true });
});

module.exports = router;
