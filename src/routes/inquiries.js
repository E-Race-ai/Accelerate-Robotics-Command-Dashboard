const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { notifyNewInquiry } = require('../services/email');

const router = express.Router();

// ── PUBLIC: Submit an inquiry ───────────────────────────────────
router.post('/', async (req, res) => {
  const { name, email, company, phone, message } = req.body;

  if (!name || !email || !message) {
    return res.status(400).json({ error: 'Name, email, and message are required' });
  }

  // WHY: Basic email format check to catch typos — not a full RFC 5322 validator
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const MAX_MESSAGE_LENGTH = 5000; // Prevent abuse — 5k chars is generous for an inquiry
  if (message.length > MAX_MESSAGE_LENGTH) {
    return res.status(400).json({ error: `Message must be under ${MAX_MESSAGE_LENGTH} characters` });
  }

  try {
    const inserted = await db.one(
      `INSERT INTO inquiries (name, email, company, phone, message)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [name, email, company || null, phone || null, message],
    );
    const inquiryId = inserted.id;

    // Fire-and-forget email notification — don't block the response
    notifyNewInquiry({ name, email, company, phone, message }).catch(() => {});

    // WHY: Auto-create a deal from each inquiry so no lead falls through the cracks
    try {
      const { generateDealId, generateId } = require('../services/id-generator');
      const dealId = await generateDealId(db);
      await db.run(
        `INSERT INTO deals (id, name, stage, source, notes)
         VALUES ($1, $2, 'lead', 'inbound', $3)`,
        [dealId, `Inquiry: ${company || name}`, `Auto-created from inquiry #${inquiryId}. Contact: ${name} <${email}>`],
      );

      await db.run(
        `INSERT INTO activities (id, deal_id, actor, action, detail)
         VALUES ($1, $2, 'system', 'deal_created', $3)`,
        [generateId(), dealId, JSON.stringify({ source: 'inquiry', inquiry_id: inquiryId, name, email, company })],
      );
    } catch (dealErr) {
      // WHY: Don't fail the inquiry submission if deal creation fails
      console.error('[inquiries] Auto-deal creation failed:', dealErr.message);
    }

    res.status(201).json({ id: inquiryId, message: 'Inquiry submitted successfully' });
  } catch (err) {
    console.error('[inquiries] Insert error:', err.message);
    res.status(500).json({ error: 'Failed to submit inquiry' });
  }
});

// ── ADMIN: List inquiries ───────────────────────────────────────
router.get('/', requireAuth, async (req, res) => {
  const { status } = req.query;
  let sql = 'SELECT * FROM inquiries';
  const params = [];

  if (status) {
    sql += ' WHERE status = $1';
    params.push(status);
  }

  sql += ' ORDER BY created_at DESC';

  const rows = await db.all(sql, params);
  res.json(rows);
});

// ── ADMIN: Get single inquiry ───────────────────────────────────
router.get('/:id', requireAuth, async (req, res) => {
  const row = await db.one('SELECT * FROM inquiries WHERE id = $1', [req.params.id]);
  if (!row) return res.status(404).json({ error: 'Inquiry not found' });
  res.json(row);
});

// ── ADMIN: Update inquiry status ────────────────────────────────
router.patch('/:id', requireAuth, async (req, res) => {
  const { status } = req.body;
  const VALID_STATUSES = ['new', 'reviewed', 'contacted', 'archived'];

  if (!status || !VALID_STATUSES.includes(status)) {
    return res.status(400).json({ error: `Status must be one of: ${VALID_STATUSES.join(', ')}` });
  }

  const result = await db.run(
    `UPDATE inquiries SET status = $1, reviewed_at = NOW() WHERE id = $2`,
    [status, req.params.id],
  );

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Inquiry not found' });
  }

  res.json({ ok: true });
});

module.exports = router;
