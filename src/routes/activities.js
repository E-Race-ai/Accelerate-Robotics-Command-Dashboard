// Global activity feed — powers the Command Center's air-traffic-control view.
// Writers across the app (deals, inquiries, feedback, ...) all INSERT into the
// same `activities` table; this endpoint reads them back, joined with deal
// names so the UI doesn't need a second roundtrip.

const express = require('express');
const db = require('../db/database');
const { requireAuth, softAuth } = require('../middleware/auth');
const { generateId } = require('../services/id-generator');

const router = express.Router();

// Free-form team update text limit. 2000 chars is enough for a paragraph
// of context without letting the activities feed turn into a doc store.
const UPDATE_MAX = 2000;
const ALLOWED_TEAM_ACTIONS = new Set(['team_update', 'standup', 'shoutout']);

// ── POST / — Post a team update (public via softAuth) ─────────
// Anyone can post; if a JWT cookie is present the actor comes from req.admin,
// otherwise we accept actor from the body and fall back to 'anonymous'.
router.post('/', softAuth, async (req, res) => {
  const { action = 'team_update', body, actor: bodyActor, deal_id, item_id } = req.body || {};
  if (!ALLOWED_TEAM_ACTIONS.has(action)) {
    return res.status(400).json({ error: `action must be one of: ${[...ALLOWED_TEAM_ACTIONS].join(', ')}` });
  }
  if (!body || !String(body).trim()) {
    return res.status(400).json({ error: 'body is required' });
  }
  const text = String(body).trim().slice(0, UPDATE_MAX);
  const actor = (req.admin && req.admin.email)
    || (bodyActor ? String(bodyActor).slice(0, 100) : null)
    || 'anonymous';

  // Stash text + optional tracker reference in the detail JSON so existing
  // GET / consumers can pick it up without a schema change.
  const detail = JSON.stringify({
    body: text,
    ...(item_id ? { item_id: String(item_id).slice(0, 64) } : {}),
  });

  try {
    await db.run(
      `INSERT INTO activities (id, deal_id, actor, action, detail) VALUES (?, ?, ?, ?, ?)`,
      [generateId(), deal_id ? String(deal_id).slice(0, 64) : null, actor, action, detail],
    );
    res.status(201).json({ ok: true });
  } catch (e) {
    console.error('[activities] post failed:', e);
    res.status(500).json({ error: 'Failed to post update' });
  }
});

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
