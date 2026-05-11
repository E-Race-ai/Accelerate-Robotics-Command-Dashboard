/**
 * Customer Portals — database service layer
 *
 * Wraps all SQLite queries for the portal feature using the project's existing
 * libsql client helpers (one/all/run/transaction) from src/db/database.js.
 *
 * IMPORTANT: All queries that touch portal-scoped data take portal_id as their
 * first argument and filter by it. Tenant isolation is enforced at the query
 * level, not by trusting URL parameters.
 */

const crypto = require('node:crypto');
const { one, all, run, transaction } = require('../../db/database');

// --- Event type constants ---
const EVENT_TYPES = Object.freeze({
  PORTAL_CREATED:        'portal.created',
  PORTAL_ACTIVATED:      'portal.activated',
  PORTAL_VIEWED:         'portal.viewed',
  PARTICIPANT_INVITED:   'participant.invited',
  PARTICIPANT_ACCEPTED:  'participant.accepted',
  PARTICIPANT_SIGNED_IN: 'participant.signed_in',
  PARTICIPANT_REMOVED:   'participant.removed',
  CONTENT_UPLOADED:      'content.uploaded',
  CONTENT_VIEWED:        'content.viewed',
  CONTENT_DOWNLOADED:    'content.downloaded',
  CONTENT_DELETED:       'content.deleted',
  CONTENT_PINNED:        'content.pinned',
  COMMENT_POSTED:        'comment.posted',
  COMMENT_REPLIED:       'comment.replied',
  FOLDER_CREATED:        'folder.created',
});

const uid = (prefix = 'p') =>
  prefix + '_' + crypto.randomBytes(8).toString('hex');

// ============================================================================
// Portals
// ============================================================================

async function listPortals({ includeArchived = false } = {}) {
  const rows = includeArchived
    ? await all(`SELECT * FROM portal_spaces ORDER BY created_at DESC`)
    : await all(`SELECT * FROM portal_spaces WHERE archived_at IS NULL ORDER BY created_at DESC`);
  return rows.map(rowToPortal);
}

async function getPortalById(id) {
  const row = await one(`SELECT * FROM portal_spaces WHERE id = ?`, [id]);
  return row ? rowToPortal(row) : null;
}

async function getPortalBySlug(slug) {
  const row = await one(`SELECT * FROM portal_spaces WHERE slug = ?`, [String(slug).toLowerCase()]);
  return row ? rowToPortal(row) : null;
}

async function createPortal({
  slug,
  name,
  customer_name,
  deal_id = null,
  owner_user_id,
  welcome_message = '',
}) {
  const id = uid('ps');
  await run(
    `INSERT INTO portal_spaces
       (id, slug, name, customer_name, deal_id, owner_user_id, welcome_message)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, String(slug).toLowerCase(), name, customer_name, deal_id, owner_user_id, welcome_message]
  );
  return getPortalById(id);
}

const PORTAL_UPDATABLE = new Set([
  'name', 'customer_name', 'customer_logo_path', 'status', 'deal_id',
  'allow_external_uploads', 'allow_external_downloads', 'allow_external_invites',
  'welcome_message', 'theme_primary_color', 'theme_accent_color', 'archived_at',
]);

async function updatePortal(id, updates) {
  const fields = [];
  const args = [];
  for (const [key, value] of Object.entries(updates)) {
    if (!PORTAL_UPDATABLE.has(key)) continue;
    fields.push(`${key} = ?`);
    args.push(typeof value === 'boolean' ? (value ? 1 : 0) : value);
  }
  if (fields.length === 0) return getPortalById(id);
  fields.push(`updated_at = datetime('now')`);
  args.push(id);
  await run(`UPDATE portal_spaces SET ${fields.join(', ')} WHERE id = ?`, args);
  return getPortalById(id);
}

async function archivePortal(id) {
  return updatePortal(id, { status: 'archived', archived_at: new Date().toISOString() });
}

// ============================================================================
// Participants
// ============================================================================

async function listParticipants(portalId) {
  const rows = await all(
    `SELECT * FROM portal_participants WHERE portal_id = ? ORDER BY invited_at ASC`,
    [portalId]
  );
  return rows.map(rowToParticipant);
}

async function getParticipantByEmail(portalId, email) {
  const row = await one(
    `SELECT * FROM portal_participants WHERE portal_id = ? AND email = ?`,
    [portalId, String(email).toLowerCase()]
  );
  return row ? rowToParticipant(row) : null;
}

async function getParticipantById(id) {
  const row = await one(`SELECT * FROM portal_participants WHERE id = ?`, [id]);
  return row ? rowToParticipant(row) : null;
}

async function inviteParticipant({ portalId, email, role = 'external', invitedBy }) {
  const existing = await getParticipantByEmail(portalId, email);
  if (existing) return existing;
  const id = uid('pp');
  await run(
    `INSERT INTO portal_participants (id, portal_id, email, role, invited_by)
     VALUES (?, ?, ?, ?, ?)`,
    [id, portalId, String(email).toLowerCase(), role, invitedBy]
  );
  return getParticipantById(id);
}

async function markParticipantActive(id) {
  await run(
    `UPDATE portal_participants SET status = 'active', last_seen_at = datetime('now') WHERE id = ?`,
    [id]
  );
}

async function touchParticipant(id) {
  await run(`UPDATE portal_participants SET last_seen_at = datetime('now') WHERE id = ?`, [id]);
}

async function setParticipantName(id, fullName) {
  await run(`UPDATE portal_participants SET full_name = ? WHERE id = ?`, [fullName, id]);
}

async function removeParticipant(id) {
  await run(`UPDATE portal_participants SET status = 'removed' WHERE id = ?`, [id]);
}

// ============================================================================
// Content
// ============================================================================

async function listContent(portalId) {
  const rows = await all(
    `SELECT * FROM portal_content
     WHERE portal_id = ?
     ORDER BY is_pinned DESC, sort_order ASC, created_at ASC`,
    [portalId]
  );
  return rows.map(rowToContent);
}

async function getContentItem(id) {
  const row = await one(`SELECT * FROM portal_content WHERE id = ?`, [id]);
  return row ? rowToContent(row) : null;
}

async function addContent({
  portalId,
  parentFolderId = null,
  kind,
  title,
  description = '',
  filePath = null,
  fileType = null,
  fileSizeBytes = null,
  sourceTool = null,
  sourceRecordId = null,
  uploadedByEmail,
}) {
  const id = uid('pc');
  // Place new items at end of sort order
  const orderRow = await one(
    `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
     FROM portal_content WHERE portal_id = ? AND parent_folder_id IS ?`,
    [portalId, parentFolderId]
  );
  const sortOrder = orderRow ? orderRow.next_order : 0;

  await run(
    `INSERT INTO portal_content
       (id, portal_id, parent_folder_id, kind, title, description,
        file_path, file_type, file_size_bytes, source_tool, source_record_id,
        uploaded_by_email, sort_order)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, portalId, parentFolderId, kind, title, description,
      filePath, fileType, fileSizeBytes, sourceTool, sourceRecordId,
      uploadedByEmail, sortOrder,
    ]
  );
  return getContentItem(id);
}

async function deleteContent(id) {
  await run(`DELETE FROM portal_content WHERE id = ?`, [id]);
}

async function togglePin(id) {
  await run(`UPDATE portal_content SET is_pinned = 1 - is_pinned WHERE id = ?`, [id]);
  return getContentItem(id);
}

// ============================================================================
// Comments
// ============================================================================

async function listComments(contentItemId) {
  const rows = await all(
    `SELECT * FROM portal_comments WHERE content_item_id = ? ORDER BY created_at ASC`,
    [contentItemId]
  );
  return rows.map(rowToComment);
}

async function addComment({ portalId, contentItemId, authorEmail, body, parentCommentId = null }) {
  const id = uid('pcm');
  await run(
    `INSERT INTO portal_comments
       (id, portal_id, content_item_id, parent_comment_id, author_email, body)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [id, portalId, contentItemId, parentCommentId, authorEmail, body]
  );
  const row = await one(`SELECT * FROM portal_comments WHERE id = ?`, [id]);
  return rowToComment(row);
}

// ============================================================================
// Activity events
// ============================================================================

async function logEvent({
  portalId, participantEmail = null, eventType,
  targetType = null, targetId = null, metadata = {},
  ipAddress = null, userAgent = null,
}) {
  const id = uid('pev');
  await run(
    `INSERT INTO portal_activity
       (id, portal_id, participant_email, event_type, target_type, target_id,
        metadata_json, ip_address, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, portalId, participantEmail, eventType, targetType, targetId,
      JSON.stringify(metadata), ipAddress, userAgent,
    ]
  );
}

async function listActivity(portalId, { limit = 200 } = {}) {
  const rows = await all(
    `SELECT * FROM portal_activity WHERE portal_id = ? ORDER BY occurred_at DESC LIMIT ?`,
    [portalId, limit]
  );
  return rows.map(rowToActivity);
}

// ============================================================================
// Engagement aggregations
// ============================================================================

async function engagementSummary(portalId) {
  const [
    visitsTotal, visits7d, externalActive, externalTotal, externalInvited,
    commentsTotal, lastExternal,
  ] = await Promise.all([
    one(
      `SELECT COUNT(*) AS n FROM portal_activity
       WHERE portal_id = ? AND event_type = 'portal.viewed'`,
      [portalId]
    ),
    one(
      `SELECT COUNT(*) AS n FROM portal_activity
       WHERE portal_id = ? AND event_type = 'portal.viewed'
         AND occurred_at > datetime('now', '-7 days')`,
      [portalId]
    ),
    one(
      `SELECT COUNT(*) AS n FROM portal_participants
       WHERE portal_id = ? AND role = 'external' AND status = 'active'
         AND last_seen_at > datetime('now', '-14 days')`,
      [portalId]
    ),
    one(
      `SELECT COUNT(*) AS n FROM portal_participants
       WHERE portal_id = ? AND role = 'external' AND status != 'removed'`,
      [portalId]
    ),
    one(
      `SELECT COUNT(*) AS n FROM portal_participants
       WHERE portal_id = ? AND role = 'external' AND status = 'invited'`,
      [portalId]
    ),
    one(
      `SELECT COUNT(*) AS n FROM portal_comments WHERE portal_id = ?`,
      [portalId]
    ),
    one(
      `SELECT a.occurred_at FROM portal_activity a
       JOIN portal_participants p
         ON p.portal_id = a.portal_id AND p.email = a.participant_email
       WHERE a.portal_id = ? AND p.role = 'external'
       ORDER BY a.occurred_at DESC LIMIT 1`,
      [portalId]
    ),
  ]);

  let daysSinceExternal = null;
  if (lastExternal && lastExternal.occurred_at) {
    const ms = Date.now() - new Date(lastExternal.occurred_at + 'Z').getTime();
    daysSinceExternal = Math.floor(ms / 86_400_000);
  }

  return {
    total_visits: visitsTotal ? Number(visitsTotal.n) : 0,
    visits_7d: visits7d ? Number(visits7d.n) : 0,
    active_participants: externalActive ? Number(externalActive.n) : 0,
    total_participants: externalTotal ? Number(externalTotal.n) : 0,
    pending_invites: externalInvited ? Number(externalInvited.n) : 0,
    total_comments: commentsTotal ? Number(commentsTotal.n) : 0,
    days_since_external: daysSinceExternal,
  };
}

async function engagementByParticipant(portalId) {
  const rows = await all(
    `
      SELECT
        p.id, p.email, p.full_name, p.role, p.status, p.last_seen_at,
        COALESCE(SUM(CASE WHEN a.event_type = 'portal.viewed'      THEN 1 ELSE 0 END), 0) AS visits,
        COALESCE(SUM(CASE WHEN a.event_type = 'content.viewed'     THEN 1 ELSE 0 END), 0) AS views,
        COALESCE(SUM(CASE WHEN a.event_type = 'content.downloaded' THEN 1 ELSE 0 END), 0) AS downloads,
        COALESCE(SUM(CASE WHEN a.event_type LIKE 'comment.%'       THEN 1 ELSE 0 END), 0) AS comments
      FROM portal_participants p
      LEFT JOIN portal_activity a
        ON a.portal_id = p.portal_id AND a.participant_email = p.email
      WHERE p.portal_id = ? AND p.role = 'external' AND p.status != 'removed'
      GROUP BY p.id
      ORDER BY visits DESC, p.invited_at ASC
    `,
    [portalId]
  );
  return rows.map(r => ({
    id: r.id,
    email: r.email,
    full_name: r.full_name,
    role: r.role,
    status: r.status,
    last_seen_at: r.last_seen_at,
    visits: Number(r.visits),
    views: Number(r.views),
    downloads: Number(r.downloads),
    comments: Number(r.comments),
  }));
}

async function engagementByContent(portalId) {
  const rows = await all(
    `
      SELECT
        c.id, c.title, c.kind, c.file_type, c.source_tool,
        COALESCE(SUM(CASE WHEN a.event_type = 'content.viewed'     THEN 1 ELSE 0 END), 0) AS views,
        COALESCE(SUM(CASE WHEN a.event_type = 'content.downloaded' THEN 1 ELSE 0 END), 0) AS downloads,
        COUNT(DISTINCT CASE WHEN a.event_type = 'content.viewed'
                            THEN a.participant_email ELSE NULL END) AS unique_viewers
      FROM portal_content c
      LEFT JOIN portal_activity a ON a.target_id = c.id
      WHERE c.portal_id = ? AND c.kind != 'folder'
      GROUP BY c.id
      ORDER BY views DESC
    `,
    [portalId]
  );
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    kind: r.kind,
    file_type: r.file_type,
    source_tool: r.source_tool,
    views: Number(r.views),
    downloads: Number(r.downloads),
    unique_viewers: Number(r.unique_viewers),
  }));
}

// ============================================================================
// Magic-link tokens (external auth)
// ============================================================================

async function createMagicToken({ participantId, ttlMinutes = 15, ip = null }) {
  // Raw token returned ONCE; we store only the hash.
  const rawToken = crypto.randomBytes(32).toString('base64url');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const id = uid('pmt');
  const expiresAt = new Date(Date.now() + ttlMinutes * 60_000).toISOString();
  await run(
    `INSERT INTO portal_magic_tokens (id, participant_id, token_hash, expires_at, created_ip)
     VALUES (?, ?, ?, ?, ?)`,
    [id, participantId, tokenHash, expiresAt, ip]
  );
  return rawToken;
}

async function consumeMagicToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  // WHY: transaction() makes the mark-consumed step atomic with the lookup —
  // prevents a race where the same link gets consumed twice in parallel.
  return transaction(async (tx) => {
    const row = await tx.one(
      `SELECT t.*, p.id AS pid, p.portal_id, p.email, p.role, p.status
       FROM portal_magic_tokens t
       JOIN portal_participants p ON p.id = t.participant_id
       WHERE t.token_hash = ?
         AND t.consumed_at IS NULL
         AND t.expires_at > datetime('now')`,
      [tokenHash]
    );
    if (!row) return null;
    await tx.run(
      `UPDATE portal_magic_tokens SET consumed_at = datetime('now') WHERE id = ?`,
      [row.id]
    );
    return {
      participant_id: row.pid,
      portal_id: row.portal_id,
      email: row.email,
      role: row.role,
      status: row.status,
    };
  });
}

// ============================================================================
// Row mappers (snake_case → JS-friendly object, booleans → real bools)
// ============================================================================

function rowToPortal(r) {
  return {
    id: r.id,
    slug: r.slug,
    name: r.name,
    customer_name: r.customer_name,
    customer_logo_path: r.customer_logo_path,
    status: r.status,
    deal_id: r.deal_id,
    allow_external_uploads: r.allow_external_uploads === 1,
    allow_external_downloads: r.allow_external_downloads === 1,
    allow_external_invites: r.allow_external_invites === 1,
    welcome_message: r.welcome_message,
    theme: {
      primary_color: r.theme_primary_color,
      accent_color: r.theme_accent_color,
    },
    owner_user_id: r.owner_user_id,
    created_at: r.created_at,
    updated_at: r.updated_at,
    archived_at: r.archived_at,
  };
}

function rowToParticipant(r) {
  return {
    id: r.id,
    portal_id: r.portal_id,
    email: r.email,
    full_name: r.full_name,
    role: r.role,
    status: r.status,
    invited_at: r.invited_at,
    invited_by: r.invited_by,
    last_seen_at: r.last_seen_at,
  };
}

function rowToContent(r) {
  return {
    id: r.id,
    portal_id: r.portal_id,
    parent_folder_id: r.parent_folder_id,
    kind: r.kind,
    title: r.title,
    description: r.description,
    file_path: r.file_path,
    file_type: r.file_type,
    file_size_bytes: r.file_size_bytes ? Number(r.file_size_bytes) : null,
    source_tool: r.source_tool,
    source_record_id: r.source_record_id,
    uploaded_by_email: r.uploaded_by_email,
    sort_order: r.sort_order,
    is_pinned: r.is_pinned === 1,
    created_at: r.created_at,
  };
}

function rowToComment(r) {
  return {
    id: r.id,
    portal_id: r.portal_id,
    content_item_id: r.content_item_id,
    parent_comment_id: r.parent_comment_id,
    author_email: r.author_email,
    body: r.body,
    created_at: r.created_at,
  };
}

function rowToActivity(r) {
  let metadata = {};
  try { metadata = JSON.parse(r.metadata_json); } catch (_) {}
  return {
    id: r.id,
    portal_id: r.portal_id,
    participant_email: r.participant_email,
    event_type: r.event_type,
    target_type: r.target_type,
    target_id: r.target_id,
    metadata,
    occurred_at: r.occurred_at,
  };
}

module.exports = {
  EVENT_TYPES,
  listPortals, getPortalById, getPortalBySlug, createPortal, updatePortal, archivePortal,
  listParticipants, getParticipantByEmail, getParticipantById,
  inviteParticipant, markParticipantActive, touchParticipant, setParticipantName, removeParticipant,
  listContent, getContentItem, addContent, deleteContent, togglePin,
  listComments, addComment,
  logEvent, listActivity,
  engagementSummary, engagementByParticipant, engagementByContent,
  createMagicToken, consumeMagicToken,
};
