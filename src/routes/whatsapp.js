// WhatsApp Hub — directory of company WhatsApp groups + communities.
//
// Why this is a directory and not a feed: WhatsApp doesn't expose a "read all
// my groups" API, and the Business API requires per-group opt-in plus paid
// templates for outbound messages. A curated directory (name + invite URL +
// notes for "what's being discussed lately") gives the heads-up view we need
// without fragile scraping. Click-through opens the actual chat in WhatsApp.

const express = require('express');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const ALLOWED_CATEGORY = new Set(['team', 'project', 'customer', 'community', 'other']);

// Limits chosen to fit comfortably in a card UI without truncating common content.
const MAX_NAME_LEN = 100;        // group names are short by convention; 100 is generous
const MAX_DESCRIPTION_LEN = 500; // one-paragraph "what is this group for"
const MAX_NOTES_LEN = 2000;      // "currently discussing X, Y, Z" — multi-line
const MAX_URL_LEN = 500;         // chat invite URLs are ~50 chars; 500 is paranoia

// WHY: WhatsApp invite URLs always live on these two hosts. Whitelisting the
// host (instead of free-form URLs) keeps the page from accidentally turning
// into a redirector for arbitrary external links.
const ALLOWED_INVITE_HOSTS = new Set(['chat.whatsapp.com', 'wa.me']);

function sanitizeInviteUrl(raw) {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  let url;
  try { url = new URL(trimmed); } catch { return { error: 'invite_url is not a valid URL' }; }
  if (url.protocol !== 'https:') return { error: 'invite_url must use https://' };
  if (!ALLOWED_INVITE_HOSTS.has(url.hostname)) {
    return { error: `invite_url host must be one of: ${Array.from(ALLOWED_INVITE_HOSTS).join(', ')}` };
  }
  return { value: trimmed.slice(0, MAX_URL_LEN) };
}

function clipString(raw, max) {
  if (raw === undefined || raw === null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

// ── GET / — list groups (admin) ─────────────────────────────────
router.get('/', requireAuth, async (_req, res) => {
  try {
    const rows = await db.all(
      `SELECT id, name, description, category, invite_url, member_count,
              notes, pinned, created_by, created_at, updated_at
       FROM whatsapp_groups
       ORDER BY pinned DESC, updated_at DESC, name ASC`,
      [],
    );
    res.json({ groups: rows.map(r => ({ ...r, pinned: !!r.pinned })) });
  } catch (e) {
    console.error('[whatsapp] list failed:', e);
    res.status(500).json({ error: 'Failed to load groups' });
  }
});

// ── POST / — create a group (admin) ─────────────────────────────
router.post('/', requireAuth, async (req, res) => {
  const { name, description, category, invite_url, member_count, notes, pinned } = req.body || {};

  const cleanName = clipString(name, MAX_NAME_LEN);
  if (!cleanName) return res.status(400).json({ error: 'name is required' });

  const cat = ALLOWED_CATEGORY.has(category) ? category : 'team';

  const inviteCheck = sanitizeInviteUrl(invite_url);
  if (inviteCheck && inviteCheck.error) return res.status(400).json({ error: inviteCheck.error });
  const cleanInvite = inviteCheck ? inviteCheck.value : null;

  const memberNum = Number.isFinite(Number(member_count)) ? Math.max(0, Math.floor(Number(member_count))) : 0;

  try {
    const r = await db.run(
      `INSERT INTO whatsapp_groups (name, description, category, invite_url, member_count, notes, pinned, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cleanName,
        clipString(description, MAX_DESCRIPTION_LEN),
        cat,
        cleanInvite,
        memberNum,
        clipString(notes, MAX_NOTES_LEN),
        pinned ? 1 : 0,
        req.admin?.email || null,
      ],
    );
    res.status(201).json({ ok: true, id: r.lastInsertRowid });
  } catch (e) {
    console.error('[whatsapp] create failed:', e);
    res.status(500).json({ error: 'Failed to save group' });
  }
});

// ── PATCH /:id — update fields (admin) ──────────────────────────
router.patch('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });

  const { name, description, category, invite_url, member_count, notes, pinned } = req.body || {};

  const fields = [];
  const args = [];

  if (name !== undefined) {
    const cleanName = clipString(name, MAX_NAME_LEN);
    if (!cleanName) return res.status(400).json({ error: 'name cannot be empty' });
    fields.push('name = ?'); args.push(cleanName);
  }
  if (description !== undefined) {
    fields.push('description = ?'); args.push(clipString(description, MAX_DESCRIPTION_LEN));
  }
  if (category !== undefined) {
    if (!ALLOWED_CATEGORY.has(category)) return res.status(400).json({ error: 'invalid category' });
    fields.push('category = ?'); args.push(category);
  }
  if (invite_url !== undefined) {
    const inviteCheck = sanitizeInviteUrl(invite_url);
    if (inviteCheck && inviteCheck.error) return res.status(400).json({ error: inviteCheck.error });
    fields.push('invite_url = ?'); args.push(inviteCheck ? inviteCheck.value : null);
  }
  if (member_count !== undefined) {
    const n = Number(member_count);
    if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: 'member_count must be a non-negative number' });
    fields.push('member_count = ?'); args.push(Math.floor(n));
  }
  if (notes !== undefined) {
    fields.push('notes = ?'); args.push(clipString(notes, MAX_NOTES_LEN));
  }
  if (pinned !== undefined) {
    fields.push('pinned = ?'); args.push(pinned ? 1 : 0);
  }

  if (fields.length === 0) return res.status(400).json({ error: 'no fields to update' });
  fields.push("updated_at = datetime('now')");
  args.push(id);

  try {
    const r = await db.run(
      `UPDATE whatsapp_groups SET ${fields.join(', ')} WHERE id = ?`,
      args,
    );
    if (!r.changes) return res.status(404).json({ error: 'group not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[whatsapp] update failed:', e);
    res.status(500).json({ error: 'Failed to update group' });
  }
});

// ── DELETE /:id — remove a group (admin) ────────────────────────
router.delete('/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
  try {
    const r = await db.run(`DELETE FROM whatsapp_groups WHERE id = ?`, [id]);
    if (!r.changes) return res.status(404).json({ error: 'group not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[whatsapp] delete failed:', e);
    res.status(500).json({ error: 'Failed to delete group' });
  }
});

module.exports = router;
