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
      `SELECT id, name, description, category, invite_url, group_chat_url, member_count,
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
  const { name, description, category, invite_url, group_chat_url, member_count, notes, pinned } = req.body || {};

  const cleanName = clipString(name, MAX_NAME_LEN);
  if (!cleanName) return res.status(400).json({ error: 'name is required' });

  const cat = ALLOWED_CATEGORY.has(category) ? category : 'team';

  const inviteCheck = sanitizeInviteUrl(invite_url);
  if (inviteCheck && inviteCheck.error) return res.status(400).json({ error: inviteCheck.error });
  const cleanInvite = inviteCheck ? inviteCheck.value : null;

  const cleanChatUrl = clipString(group_chat_url, MAX_URL_LEN);

  const memberNum = Number.isFinite(Number(member_count)) ? Math.max(0, Math.floor(Number(member_count))) : 0;

  try {
    const r = await db.run(
      `INSERT INTO whatsapp_groups (name, description, category, invite_url, group_chat_url, member_count, notes, pinned, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        cleanName,
        clipString(description, MAX_DESCRIPTION_LEN),
        cat,
        cleanInvite,
        cleanChatUrl,
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

  const { name, description, category, invite_url, group_chat_url, member_count, notes, pinned } = req.body || {};

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
  if (group_chat_url !== undefined) {
    fields.push('group_chat_url = ?'); args.push(clipString(group_chat_url, MAX_URL_LEN));
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

// ══════════════════════════════════════════════════════════════
// ── Message Templates CRUD ────────────────────────────────────
// ══════════════════════════════════════════════════════════════

const ALLOWED_TEMPLATE_CATEGORY = new Set(['general', 'follow_up', 'proposal', 'scheduling', 'introduction']);
const MAX_TEMPLATE_NAME_LEN = 100;
const MAX_TEMPLATE_BODY_LEN = 2000;

// ── GET /templates — list all templates ───────────────────────
router.get('/templates', requireAuth, async (_req, res) => {
  try {
    const rows = await db.all(
      'SELECT * FROM whatsapp_templates ORDER BY category, name',
      [],
    );
    res.json(rows);
  } catch (e) {
    console.error('[whatsapp] templates list failed:', e);
    res.status(500).json({ error: 'Failed to load templates' });
  }
});

// ── POST /templates — create a template ───────────────────────
router.post('/templates', requireAuth, async (req, res) => {
  const { name, body, category } = req.body || {};
  const cleanName = clipString(name, MAX_TEMPLATE_NAME_LEN);
  if (!cleanName) return res.status(400).json({ error: 'name is required' });
  const cleanBody = clipString(body, MAX_TEMPLATE_BODY_LEN);
  if (!cleanBody) return res.status(400).json({ error: 'body is required' });
  const cat = ALLOWED_TEMPLATE_CATEGORY.has(category) ? category : 'general';

  try {
    const r = await db.run(
      `INSERT INTO whatsapp_templates (name, body, category, created_by)
       VALUES (?, ?, ?, ?)`,
      [cleanName, cleanBody, cat, req.admin?.email || null],
    );
    res.status(201).json({ ok: true, id: r.lastInsertRowid });
  } catch (e) {
    console.error('[whatsapp] template create failed:', e);
    res.status(500).json({ error: 'Failed to save template' });
  }
});

// ── PATCH /templates/:id — update a template ──────────────────
router.patch('/templates/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });

  const { name, body, category } = req.body || {};
  const sets = [];
  const args = [];

  if (name !== undefined) {
    const clean = clipString(name, MAX_TEMPLATE_NAME_LEN);
    if (!clean) return res.status(400).json({ error: 'name cannot be empty' });
    sets.push('name = ?'); args.push(clean);
  }
  if (body !== undefined) {
    const clean = clipString(body, MAX_TEMPLATE_BODY_LEN);
    if (!clean) return res.status(400).json({ error: 'body cannot be empty' });
    sets.push('body = ?'); args.push(clean);
  }
  if (category !== undefined) {
    if (!ALLOWED_TEMPLATE_CATEGORY.has(category)) return res.status(400).json({ error: 'invalid category' });
    sets.push('category = ?'); args.push(category);
  }

  if (sets.length === 0) return res.status(400).json({ error: 'no fields to update' });
  sets.push("updated_at = datetime('now')");
  args.push(id);

  try {
    const r = await db.run(
      `UPDATE whatsapp_templates SET ${sets.join(', ')} WHERE id = ?`,
      args,
    );
    if (!r.changes) return res.status(404).json({ error: 'template not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[whatsapp] template update failed:', e);
    res.status(500).json({ error: 'Failed to update template' });
  }
});

// ── DELETE /templates/:id — remove a template ─────────────────
router.delete('/templates/:id', requireAuth, async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
  try {
    const r = await db.run('DELETE FROM whatsapp_templates WHERE id = ?', [id]);
    if (!r.changes) return res.status(404).json({ error: 'template not found' });
    res.json({ ok: true });
  } catch (e) {
    console.error('[whatsapp] template delete failed:', e);
    res.status(500).json({ error: 'Failed to delete template' });
  }
});

// ── GET /contacts/search — unified contact search ─────────────
// WHY: The compose bar needs to search across facility contacts, deal facility
// GMs, and prospect hotel contacts by name or phone. Returns only results that
// have a phone number, de-duplicated by phone.
router.get('/contacts/search', requireAuth, async (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q || q.length < 2) return res.json([]);

  const pattern = `%${q}%`;
  try {
    // 1. Facility contacts (contacts table)
    const contacts = await db.all(
      `SELECT c.name, c.phone, c.email, c.role, f.name AS context
       FROM contacts c
       LEFT JOIN facilities f ON f.id = c.facility_id
       WHERE c.phone IS NOT NULL AND c.phone != ''
         AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)
       LIMIT 20`,
      [pattern, pattern, pattern],
    );

    // 2. Facility contacts — GM phone and property phone from ALL facilities
    // WHY: Facilities store both the GM's direct number (gm_phone) and the
    // property front-desk number (phone). Both are useful for outreach, and
    // not all facilities are linked to a deal yet.
    const facilityGMs = await db.all(
      `SELECT f.gm_name AS name, f.gm_phone AS phone, f.name AS context
       FROM facilities f
       WHERE f.gm_phone IS NOT NULL AND f.gm_phone != ''
         AND (f.gm_name LIKE ? OR f.gm_phone LIKE ? OR f.name LIKE ?)
       LIMIT 10`,
      [pattern, pattern, pattern],
    );
    const facilityPhones = await db.all(
      `SELECT f.name AS name, f.phone, f.name AS context
       FROM facilities f
       WHERE f.phone IS NOT NULL AND f.phone != ''
         AND (f.name LIKE ? OR f.phone LIKE ?)
       LIMIT 10`,
      [pattern, pattern],
    );

    // 3. Prospect hotel contacts (hotels_saved with dm_phone or phone)
    // WHY: Sales reps capture decision-maker phone numbers during research;
    // these should be reachable from the compose bar too.
    const prospectContacts = await db.all(
      `SELECT name, phone, context FROM (
         SELECT
           COALESCE(dm_name, name) AS name,
           COALESCE(dm_phone, phone) AS phone,
           name AS context
         FROM hotels_saved
         WHERE (dm_phone IS NOT NULL AND dm_phone != '')
            OR (phone IS NOT NULL AND phone != '')
       )
       WHERE phone IS NOT NULL AND phone != ''
         AND (name LIKE ? OR phone LIKE ? OR context LIKE ?)
       LIMIT 10`,
      [pattern, pattern, pattern],
    );

    // 4. Assessment GM contacts (gm_phone on assessments table)
    // WHY: Site assessments capture the property GM's direct number — often
    // the freshest contact info the team has.
    const assessmentGMs = await db.all(
      `SELECT gm_name AS name, gm_phone AS phone, property_name AS context
       FROM assessments
       WHERE gm_phone IS NOT NULL AND gm_phone != ''
         AND (gm_name LIKE ? OR gm_phone LIKE ? OR property_name LIKE ?)
       LIMIT 10`,
      [pattern, pattern, pattern],
    );

    // 5. Assessment stakeholders (phone on assessment_stakeholders table)
    // WHY: Stakeholders captured during site walks — decision makers, champions,
    // engineering contacts — are prime WhatsApp outreach targets.
    const assessmentStakeholders = await db.all(
      `SELECT s.name, s.phone, a.property_name AS context, s.role
       FROM assessment_stakeholders s
       INNER JOIN assessments a ON a.id = s.assessment_id
       WHERE s.phone IS NOT NULL AND s.phone != ''
         AND (s.name LIKE ? OR s.phone LIKE ? OR a.property_name LIKE ?)
       LIMIT 10`,
      [pattern, pattern, pattern],
    );

    // 6. Inbound inquiries that left a phone number
    // WHY: People who reached out through the website are warm leads —
    // having their number in the compose bar makes follow-up easy.
    const inquiryContacts = await db.all(
      `SELECT name, phone, company AS context
       FROM inquiries
       WHERE phone IS NOT NULL AND phone != ''
         AND (name LIKE ? OR phone LIKE ? OR company LIKE ?)
       LIMIT 10`,
      [pattern, pattern, pattern],
    );

    // WHY: De-duplicate by normalized phone so the same number doesn't
    // appear twice. Priority: contacts > facilities > prospects > assessments > inquiries.
    const seen = new Set();
    const results = [];

    for (const c of contacts) {
      const key = c.phone.replace(/\D/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ name: c.name, phone: c.phone, source: 'contact', context: c.context || null, role: c.role || null });
    }
    for (const c of facilityGMs) {
      const key = c.phone.replace(/\D/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ name: c.name, phone: c.phone, source: 'facility', context: c.context || null, role: 'GM' });
    }
    for (const c of facilityPhones) {
      const key = c.phone.replace(/\D/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ name: c.name, phone: c.phone, source: 'facility', context: c.context || null, role: 'Front Desk' });
    }
    for (const c of prospectContacts) {
      const key = c.phone.replace(/\D/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ name: c.name, phone: c.phone, source: 'prospect', context: c.context || null, role: null });
    }
    for (const c of assessmentGMs) {
      const key = c.phone.replace(/\D/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ name: c.name, phone: c.phone, source: 'assessment', context: c.context || null, role: 'GM' });
    }
    for (const c of assessmentStakeholders) {
      const key = c.phone.replace(/\D/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ name: c.name, phone: c.phone, source: 'assessment', context: c.context || null, role: c.role || null });
    }
    for (const c of inquiryContacts) {
      const key = c.phone.replace(/\D/g, '');
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ name: c.name, phone: c.phone, source: 'inquiry', context: c.context || null, role: null });
    }

    res.json(results);
  } catch (e) {
    console.error('[whatsapp] contact search failed:', e);
    res.status(500).json({ error: 'Search failed' });
  }
});

// ── Seed starter templates (runs once) ────────────────────────
// WHY: Pre-populate templates so the feature is useful on first load.
async function seedTemplates() {
  try {
    const count = await db.one('SELECT COUNT(*) AS n FROM whatsapp_templates');
    if (count && count.n > 0) return;

    const seeds = [
      { name: 'Follow-Up After Meeting', category: 'follow_up', body: 'Hi {name}, great meeting with you today. I wanted to follow up on what we discussed regarding the robotics deployment. Let me know if you have any questions.' },
      { name: 'Proposal Sent', category: 'proposal', body: 'Hi {name}, I just sent over the proposal for your review. Take a look when you get a chance and let me know your thoughts.' },
      { name: 'Site Walk Scheduling', category: 'scheduling', body: 'Hi {name}, I\'d like to schedule a site walk at your facility. What dates work best for you this week?' },
      { name: 'Introduction', category: 'introduction', body: 'Hi {name}, this is {sender} from Accelerate Robotics. We specialize in autonomous robot deployment for hospitality and healthcare. I\'d love to discuss how we can help your operations.' },
      { name: 'Check-In', category: 'follow_up', body: 'Hi {name}, just checking in to see how things are going. Let me know if there\'s anything you need from our side.' },
    ];

    for (const s of seeds) {
      await db.run(
        'INSERT INTO whatsapp_templates (name, body, category, created_by) VALUES (?, ?, ?, ?)',
        [s.name, s.body, s.category, 'system'],
      );
    }
    console.log(`[whatsapp] seeded ${seeds.length} starter templates`);
  } catch (e) {
    console.warn('[whatsapp] template seed failed (non-fatal):', e.message);
  }
}

// Run seed after DB is ready
db.ready.then(() => seedTemplates());

module.exports = router;
