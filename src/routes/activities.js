// Global activity feed — powers the Command Center's air-traffic-control view.
// Writers across the app (deals, inquiries, feedback, ...) all INSERT into the
// same `activities` table; this endpoint reads them back, joined with deal
// names so the UI doesn't need a second roundtrip.

const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// ── GET / — Recent activity, newest first ────────────────────
router.get('/', requireAuth, async (req, res) => {
  // Cap explicitly — feed is rendered as a flat list, no point paginating
  // until the DB has hundreds of rows. 60 covers ~a day of busy use.
  const limit = Math.min(parseInt(req.query.limit, 10) || 60, 200);

  try {
    const rows = await db.all(
      `SELECT a.id, a.deal_id, a.actor, a.action, a.detail, a.created_at,
              d.name AS deal_name, d.stage AS deal_stage
       FROM activities a
       LEFT JOIN deals d ON d.id = a.deal_id
       ORDER BY a.created_at DESC
       LIMIT ?`,
      [limit],
    );
    res.json(rows);
  } catch (e) {
    console.error('[activities] list failed:', e);
    res.status(500).json({ error: 'Failed to load activities' });
  }
});

module.exports = router;
