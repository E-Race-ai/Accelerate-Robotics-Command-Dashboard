const { createClient } = require('@libsql/client');
const bcrypt = require('bcrypt');

// WHY: DATABASE_URL is required. For local dev, set it to `file:./data/accelerate.db`
// so libsql opens a local SQLite file (auth token not needed). For Turso/remote, use
// `libsql://...` plus DATABASE_AUTH_TOKEN.
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required — see .env.example');
}

const client = createClient({
  url: process.env.DATABASE_URL,
  authToken: process.env.DATABASE_AUTH_TOKEN,
  // WHY: return bigints as numbers for JSON-friendliness; IDs stay within 2^53 range for our scale
  intMode: 'number',
});

// ── Query helpers ───────────────────────────────────────────────
// Callers use these in place of better-sqlite3's db.prepare(...).get()/all()/run().
async function one(sql, args = []) {
  const rs = await client.execute({ sql, args });
  return rs.rows[0] || null;
}
async function all(sql, args = []) {
  const rs = await client.execute({ sql, args });
  return rs.rows;
}
async function run(sql, args = []) {
  const rs = await client.execute({ sql, args });
  return {
    changes: Number(rs.rowsAffected || 0),
    lastInsertRowid: rs.lastInsertRowid != null ? Number(rs.lastInsertRowid) : null,
  };
}

// WHY: Transactions in libsql use tx.execute(). This helper mirrors the pattern better-sqlite3
// callers used with db.transaction(() => { ... }).
async function transaction(fn) {
  const tx = await client.transaction('write');
  try {
    const txHelpers = {
      one: async (sql, args = []) => {
        const rs = await tx.execute({ sql, args });
        return rs.rows[0] || null;
      },
      all: async (sql, args = []) => {
        const rs = await tx.execute({ sql, args });
        return rs.rows;
      },
      run: async (sql, args = []) => {
        const rs = await tx.execute({ sql, args });
        return {
          changes: Number(rs.rowsAffected || 0),
          lastInsertRowid: rs.lastInsertRowid != null ? Number(rs.lastInsertRowid) : null,
        };
      },
    };
    const result = await fn(txHelpers);
    await tx.commit();
    return result;
  } catch (err) {
    try { await tx.rollback(); } catch {}
    throw err;
  }
}

// ── Schema ──────────────────────────────────────────────────────
// Note: SQLite-compatible. Turso is LibSQL, a SQLite fork.
async function initSchema() {
  // WHY: client.batch lets us run multiple statements atomically in one round-trip.
  // Using individual execute calls instead for simpler error surfaces.
  const statements = [
    `CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS inquiries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      company TEXT,
      phone TEXT,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'new' CHECK(status IN ('new', 'reviewed', 'contacted', 'archived')),
      created_at TEXT DEFAULT (datetime('now')),
      reviewed_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS notification_recipients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      active INTEGER DEFAULT 1 CHECK(active IN (0, 1)),
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS facilities (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'hotel'
        CHECK(type IN ('hotel','hospital','grocery','theater','office','warehouse','other')),
      address TEXT,
      city TEXT,
      state TEXT,
      country TEXT DEFAULT 'United States',
      floors INTEGER,
      rooms_or_units INTEGER,
      sqft_total INTEGER,
      elevator_count INTEGER,
      elevator_brand TEXT,
      elevator_type TEXT,
      surfaces TEXT,
      wifi_available INTEGER DEFAULT 1,
      operator TEXT,
      brand TEXT,
      gm_name TEXT,
      gm_email TEXT,
      gm_phone TEXT,
      eng_name TEXT,
      eng_email TEXT,
      notes TEXT,
      photos TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS deals (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      facility_id TEXT REFERENCES facilities(id),
      stage TEXT NOT NULL DEFAULT 'lead'
        CHECK(stage IN ('lead','qualified','site_walk','configured','proposed','negotiation','won','deploying','active','lost')),
      owner TEXT,
      source TEXT CHECK(source IN ('inbound','referral','outbound','event')),
      value_monthly REAL,
      value_total REAL,
      close_probability INTEGER DEFAULT 0,
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      closed_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      facility_id TEXT REFERENCES facilities(id),
      name TEXT NOT NULL,
      title TEXT,
      email TEXT,
      phone TEXT,
      role TEXT CHECK(role IN ('decision_maker','champion','influencer','end_user','blocker')),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS operational_challenges (
      id TEXT PRIMARY KEY,
      facility_id TEXT REFERENCES facilities(id),
      category TEXT NOT NULL
        CHECK(category IN ('cleaning','delivery','transport','security','disinfection','mobility','guidance','outdoor','inventory')),
      description TEXT NOT NULL,
      priority TEXT DEFAULT 'medium' CHECK(priority IN ('critical','high','medium','low')),
      current_cost_monthly REAL,
      current_staff_count INTEGER,
      area_sqft INTEGER,
      floors_affected TEXT,
      schedule TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      deal_id TEXT REFERENCES deals(id),
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS assessments (
      id TEXT PRIMARY KEY,
      deal_id TEXT REFERENCES deals(id),
      facility_type TEXT NOT NULL DEFAULT 'hotel',
      property_name TEXT NOT NULL,
      property_address TEXT,
      property_type TEXT,
      rooms INTEGER,
      floors INTEGER,
      elevators INTEGER,
      elevator_make TEXT,
      year_built INTEGER,
      last_renovation INTEGER,
      gm_name TEXT,
      gm_email TEXT,
      gm_phone TEXT,
      engineering_contact TEXT,
      engineering_email TEXT,
      fb_director TEXT,
      fb_outlets INTEGER,
      event_space_sqft INTEGER,
      union_status TEXT CHECK(union_status IN ('union', 'non_union', 'mixed')),
      union_details TEXT,
      assigned_to TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK(status IN ('draft', 'in_progress', 'completed', 'synced')),
      operations_data TEXT,
      infrastructure_data TEXT,
      notes TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      synced_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS assessment_zones (
      id TEXT PRIMARY KEY,
      assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
      zone_type TEXT NOT NULL CHECK(zone_type IN ('lobby', 'restaurant', 'guest_floor', 'pool_deck', 'kitchen', 'laundry', 'boh_corridor', 'parking_garage', 'event_space', 'fitness_center', 'spa', 'exterior', 'other')),
      zone_name TEXT NOT NULL,
      floor_number INTEGER,
      floor_surfaces TEXT,
      corridor_width_ft REAL,
      ceiling_height_ft REAL,
      door_width_min_ft REAL,
      wifi_strength TEXT CHECK(wifi_strength IN ('strong', 'moderate', 'weak', 'none')),
      wifi_network TEXT,
      lighting TEXT CHECK(lighting IN ('bright', 'moderate', 'dim')),
      foot_traffic TEXT CHECK(foot_traffic IN ('high', 'moderate', 'low')),
      current_cleaning_method TEXT,
      cleaning_frequency TEXT,
      cleaning_contractor TEXT,
      cleaning_shift TEXT,
      delivery_method TEXT,
      staffing_notes TEXT,
      pain_points TEXT,
      robot_readiness TEXT CHECK(robot_readiness IN ('ready', 'minor_work', 'major_work', 'not_feasible')),
      readiness_notes TEXT,
      template_data TEXT,
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS assessment_stakeholders (
      id TEXT PRIMARY KEY,
      assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      title TEXT,
      department TEXT,
      role TEXT NOT NULL CHECK(role IN ('decision_maker', 'influencer', 'champion', 'blocker', 'technical')),
      email TEXT,
      phone TEXT,
      notes TEXT,
      sort_order INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS assessment_photos (
      id TEXT PRIMARY KEY,
      assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
      zone_id TEXT REFERENCES assessment_zones(id) ON DELETE SET NULL,
      checklist_item TEXT,
      photo_data BLOB,
      thumbnail TEXT,
      annotations TEXT,
      caption TEXT,
      taken_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage)`,
    `CREATE INDEX IF NOT EXISTS idx_deals_owner ON deals(owner)`,
    `CREATE INDEX IF NOT EXISTS idx_facilities_type ON facilities(type)`,
    `CREATE INDEX IF NOT EXISTS idx_activities_deal ON activities(deal_id)`,
    `CREATE INDEX IF NOT EXISTS idx_challenges_facility ON operational_challenges(facility_id)`,
    `CREATE INDEX IF NOT EXISTS idx_contacts_facility ON contacts(facility_id)`,
    `CREATE INDEX IF NOT EXISTS idx_assessments_deal ON assessments(deal_id)`,
    `CREATE INDEX IF NOT EXISTS idx_assessments_assigned ON assessments(assigned_to)`,
    `CREATE INDEX IF NOT EXISTS idx_assessments_status ON assessments(status)`,
    `CREATE INDEX IF NOT EXISTS idx_assessment_zones_assessment ON assessment_zones(assessment_id)`,
    `CREATE INDEX IF NOT EXISTS idx_assessment_stakeholders_assessment ON assessment_stakeholders(assessment_id)`,
    `CREATE INDEX IF NOT EXISTS idx_assessment_photos_assessment ON assessment_photos(assessment_id)`,
    `CREATE INDEX IF NOT EXISTS idx_assessment_photos_zone ON assessment_photos(zone_id)`,
    `CREATE TABLE IF NOT EXISTS markets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cluster TEXT,
      color TEXT,
      notes TEXT,
      lat REAL,
      lng REAL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS prospects (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      market_id TEXT REFERENCES markets(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'staged' CHECK(status IN ('staged', 'confirmed')),
      name TEXT NOT NULL,
      address TEXT,
      brand TEXT,
      brand_class TEXT CHECK(brand_class IN ('luxury', 'soft', 'chain', 'independent')),
      keys INTEGER,
      floors INTEGER,
      stars INTEGER CHECK(stars BETWEEN 1 AND 5),
      signal TEXT,
      operator TEXT,
      portfolio TEXT,
      monogram TEXT,
      mono_color TEXT,
      source TEXT NOT NULL DEFAULT 'manual' CHECK(source IN ('ai_research', 'manual')),
      research_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_prospects_market ON prospects(market_id)`,
    `CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status)`,

    // WHY: Default permission matrix per role. Editable by Super Admin / Admin via Settings UI.
    `CREATE TABLE IF NOT EXISTS role_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      module TEXT NOT NULL,
      permission TEXT NOT NULL DEFAULT 'none' CHECK(permission IN ('edit', 'view', 'none')),
      UNIQUE(role, module)
    )`,
    // WHY: Per-user overrides that take precedence over role defaults.
    `CREATE TABLE IF NOT EXISTS user_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
      module TEXT NOT NULL,
      permission TEXT NOT NULL CHECK(permission IN ('edit', 'view', 'none')),
      UNIQUE(user_id, module)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_user_permissions_user ON user_permissions(user_id)`,

    // ── Project tracker (sprint-based multi-project planner) ────────
    `CREATE TABLE IF NOT EXISTS tracker_sprints (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS tracker_people (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      initials TEXT NOT NULL,
      full_name TEXT,
      notes TEXT,
      active INTEGER NOT NULL DEFAULT 1 CHECK(active IN (0, 1)),
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    // WHY: Single table for projects + tasks + subtasks — they share 95% of columns.
    // The level CHECK + parent_id FK enforce the 4-level hierarchy (sprint → project → task → subtask).
    // parent_id level-matching is enforced in src/services/tracker-validation.js, not here.
    `CREATE TABLE IF NOT EXISTS tracker_items (
      id TEXT PRIMARY KEY,
      sprint_id TEXT NOT NULL REFERENCES tracker_sprints(id) ON DELETE CASCADE,
      parent_id TEXT REFERENCES tracker_items(id) ON DELETE CASCADE,
      level TEXT NOT NULL CHECK(level IN ('project', 'task', 'subtask')),
      name TEXT NOT NULL,
      description TEXT,
      owner_id INTEGER REFERENCES tracker_people(id),
      color TEXT,
      start_date TEXT NOT NULL,
      end_date TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'not_started'
        CHECK(status IN ('not_started', 'in_progress', 'blocked', 'complete')),
      needs_verification INTEGER NOT NULL DEFAULT 0 CHECK(needs_verification IN (0, 1)),
      verification_note TEXT,
      is_milestone INTEGER NOT NULL DEFAULT 0 CHECK(is_milestone IN (0, 1)),
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS tracker_item_support (
      item_id TEXT NOT NULL REFERENCES tracker_items(id) ON DELETE CASCADE,
      person_id INTEGER NOT NULL REFERENCES tracker_people(id) ON DELETE CASCADE,
      PRIMARY KEY (item_id, person_id)
    )`,
    // ── Bug reports + feature requests from end users (toolkit feedback form)
    `CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('bug', 'feature')),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      severity TEXT CHECK(severity IN ('low', 'medium', 'high', 'critical')),
      page_url TEXT,
      user_email TEXT,
      user_name TEXT,
      status TEXT NOT NULL DEFAULT 'new'
        CHECK(status IN ('new', 'triaged', 'in_progress', 'resolved', 'wontfix')),
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT
    )`,
    // Screenshots are stored as BLOBs (same pattern as assessment_photos) so a
    // bug report is fully self-contained — no external file storage to manage.
    `CREATE TABLE IF NOT EXISTS feedback_screenshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      feedback_id INTEGER NOT NULL REFERENCES feedback(id) ON DELETE CASCADE,
      filename TEXT,
      mime TEXT NOT NULL,
      bytes INTEGER NOT NULL,
      data BLOB NOT NULL,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_feedback_status_created ON feedback(status, created_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_feedback_screenshots_feedback ON feedback_screenshots(feedback_id)`,
    // ── Collab Bulletin Board: cross-team help requests
    // Type covers what kind of help is being asked for; target_user is set
    // when one specific person is being tagged, NULL = open call to the team.
    `CREATE TABLE IF NOT EXISTS collab_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('feature', 'tool', 'integration', 'doc', 'design', 'other')),
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      skills TEXT,
      requester_email TEXT,
      requester_name TEXT,
      target_user TEXT,
      priority TEXT NOT NULL DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
      status TEXT NOT NULL DEFAULT 'open'
        CHECK(status IN ('open', 'claimed', 'in_progress', 'done', 'archived')),
      claimed_by TEXT,
      claimed_at TEXT,
      due_date TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT,
      archived_at TEXT,
      is_security INTEGER NOT NULL DEFAULT 0 CHECK(is_security IN (0, 1))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_collab_status_created ON collab_requests(status, created_at DESC)`,
    // ── Improvement Requests — public submit + public tracking board
    // WHY: Separate from feedback (bug/feature) so improvement ideas have their
    // own pipeline with request numbers, categories, and a public tracking view.
    `CREATE TABLE IF NOT EXISTS improvement_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'other'
        CHECK(category IN ('ui', 'workflow', 'performance', 'integration', 'documentation', 'other')),
      priority TEXT NOT NULL DEFAULT 'medium'
        CHECK(priority IN ('low', 'medium', 'high', 'critical')),
      user_name TEXT,
      user_email TEXT,
      assigned_to TEXT,
      status TEXT NOT NULL DEFAULT 'new'
        CHECK(status IN ('new', 'under_review', 'planned', 'in_progress', 'completed', 'declined')),
      created_at TEXT DEFAULT (datetime('now')),
      resolved_at TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS idx_improvement_status_created ON improvement_requests(status, created_at DESC)`,

    // WHY: Generic key-value store for runtime-editable settings that don't warrant a
    // dedicated table. First user is the Creative Labs tunnel URL — Eric pastes
    // a fresh cloudflared quick-tunnel URL here when it rotates, and the
    // robot-command/beam-feed embed pages read it from /api/public/system-settings.
    `CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT DEFAULT (datetime('now')),
      updated_by TEXT
    )`,
  ];

  for (const sql of statements) {
    await client.execute(sql);
  }

  // ── Migrate stale CHECK constraint on role column ─────────────
  // WHY: Early production databases have role CHECK('admin','sales','ops','viewer')
  // which rejects 'module_owner' and 'super_admin'. SQLite can't ALTER a CHECK,
  // so we rebuild the table if the old constraint is detected.
  try {
    // Probe: try inserting then rolling back a module_owner row
    await client.execute("INSERT INTO admin_users (email, password_hash, role) VALUES ('__probe__', '', 'module_owner')");
    await client.execute("DELETE FROM admin_users WHERE email = '__probe__'");
  } catch (probeErr) {
    if (/CHECK constraint failed/i.test(probeErr.message)) {
      console.log('[db] Detected stale role CHECK constraint — rebuilding admin_users table');
      // WHY: Discover which columns actually exist in the old table so the
      // INSERT only references real columns — avoids "no such column" errors.
      const colInfo = await client.execute("PRAGMA table_info(admin_users)");
      const oldCols = new Set(colInfo.rows.map(r => r.name || r[1]));

      await client.execute(`CREATE TABLE admin_users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        role TEXT DEFAULT 'admin' CHECK(role IN ('super_admin', 'admin', 'module_owner', 'viewer', 'sales', 'ops')),
        name TEXT DEFAULT '',
        invited_by INTEGER,
        invite_token TEXT,
        invite_expires_at TEXT,
        status TEXT DEFAULT 'active',
        last_login_at TEXT,
        reset_token TEXT,
        reset_expires_at TEXT
      )`);
      // WHY: Only copy columns that exist in both old and new tables
      const newCols = ['id', 'email', 'password_hash', 'created_at', 'role',
        'name', 'invited_by', 'invite_token', 'invite_expires_at',
        'status', 'last_login_at', 'reset_token', 'reset_expires_at'];
      const shared = newCols.filter(c => oldCols.has(c));
      const selectExprs = shared.map(c =>
        c === 'role' ? `CASE WHEN role IN ('super_admin','admin','module_owner','viewer','sales','ops') THEN role ELSE 'admin' END` : c
      );
      await client.execute(`INSERT INTO admin_users_new (${shared.join(', ')}) SELECT ${selectExprs.join(', ')} FROM admin_users`);
      await client.execute("DROP TABLE admin_users");
      await client.execute("ALTER TABLE admin_users_new RENAME TO admin_users");
      console.log('[db] admin_users table rebuilt with updated role CHECK constraint');
    }
  }

  // Additive columns — safe to try, catch duplicate-column errors.
  const additiveAlterIfMissing = async (sql) => {
    try {
      await client.execute(sql);
    } catch (e) {
      if (!/duplicate column/i.test(e.message)) throw e;
    }
  };
  // WHY: super_admin / admin / module_owner / viewer. Old 'sales'/'ops' kept for existing rows' tolerance.
  await additiveAlterIfMissing("ALTER TABLE admin_users ADD COLUMN role TEXT DEFAULT 'admin' CHECK(role IN ('super_admin', 'admin', 'module_owner', 'viewer', 'sales', 'ops'))");
  await additiveAlterIfMissing("ALTER TABLE admin_users ADD COLUMN name TEXT DEFAULT ''");
  await additiveAlterIfMissing("ALTER TABLE admin_users ADD COLUMN invited_by INTEGER");
  await additiveAlterIfMissing("ALTER TABLE admin_users ADD COLUMN invite_token TEXT");
  await additiveAlterIfMissing("ALTER TABLE admin_users ADD COLUMN invite_expires_at TEXT");
  await additiveAlterIfMissing("ALTER TABLE admin_users ADD COLUMN status TEXT DEFAULT 'active'");
  await additiveAlterIfMissing("ALTER TABLE admin_users ADD COLUMN last_login_at TEXT");
  // WHY: Forgot-password flow. Separate from invite_token so an active user can
  // reset their password without their status flipping back to 'invited'.
  await additiveAlterIfMissing("ALTER TABLE admin_users ADD COLUMN reset_token TEXT");
  await additiveAlterIfMissing("ALTER TABLE admin_users ADD COLUMN reset_expires_at TEXT");
  await additiveAlterIfMissing("ALTER TABLE markets ADD COLUMN lat REAL");
  await additiveAlterIfMissing("ALTER TABLE markets ADD COLUMN lng REAL");
  // WHY: Allow assigning improvement requests to portal users
  await additiveAlterIfMissing("ALTER TABLE improvement_requests ADD COLUMN assigned_to TEXT");
  // WHY: Security-flagged tickets get hazard styling on the board so the
  // technical team sees them immediately. Default 0 so existing rows are unflagged.
  await additiveAlterIfMissing("ALTER TABLE collab_requests ADD COLUMN is_security INTEGER NOT NULL DEFAULT 0");
  // WHY: archived_at and updated_at power the stale-ticket cleanup pass —
  // archived_at lets us hide soft-deleted rows; updated_at lets the auto-archive
  // sweep find tickets with no activity in N days.
  await additiveAlterIfMissing("ALTER TABLE collab_requests ADD COLUMN archived_at TEXT");
  await additiveAlterIfMissing("ALTER TABLE collab_requests ADD COLUMN updated_at TEXT");
}

// ── Seeds ───────────────────────────────────────────────────────
async function seedAdmin() {
  // WHY: Seed all configured admin accounts on boot. ADMIN_EMAIL is the primary;
  // ADMIN2_EMAIL is an optional second super admin (e.g. a co-founder or ops lead).
  const admins = [
    { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD, name: 'Admin' },
    { email: process.env.ADMIN2_EMAIL, password: process.env.ADMIN2_PASSWORD, name: 'Admin 2' },
  ].filter(a => a.email && a.password);

  const BCRYPT_ROUNDS = 12;
  for (const admin of admins) {
    const existing = await one('SELECT id FROM admin_users WHERE email = ?', [admin.email]);
    if (existing) continue;

    const hash = bcrypt.hashSync(admin.password, BCRYPT_ROUNDS);
    await run('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)', [admin.email, hash]);
    console.log(`[db] Seeded admin user: ${admin.email}`);

    const recipientExists = await one('SELECT id FROM notification_recipients WHERE email = ?', [admin.email]);
    if (!recipientExists) {
      await run('INSERT INTO notification_recipients (email, name, active) VALUES (?, ?, 1)', [admin.email, admin.name]);
      console.log(`[db] Added ${admin.email} as notification recipient`);
    }
  }
}

async function bootstrapAdminRoles() {
  const raw = process.env.BOOTSTRAP_ADMIN_EMAILS;
  if (!raw) return;
  // WHY: Listed emails become super_admin — the one protected role with full access that can invite others.
  const emails = raw.split(',').map(e => e.trim()).filter(Boolean);
  for (const email of emails) {
    const result = await run(
      "UPDATE admin_users SET role = 'super_admin' WHERE email = ? AND (role IS NULL OR role != 'super_admin')",
      [email],
    );
    if (result.changes > 0) console.log(`[db] Promoted ${email} to super_admin role`);
  }
}

async function seedRolePermissions() {
  // WHY: Default permission matrix per role — only seeds when empty, so manual edits to the matrix survive boots.
  const existing = await one('SELECT COUNT(*) as c FROM role_permissions');
  if (existing && Number(existing.c) > 0) return;

  const modules = require('../services/permissions').ALL_MODULES;
  // Defaults per design spec: admin edits everything; viewer sees everything read-only; module_owner gets per-assignment overrides.
  const matrix = {
    admin:        modules.reduce((acc, m) => ({ ...acc, [m]: 'edit' }), {}),
    viewer:       modules.reduce((acc, m) => ({ ...acc, [m]: m === 'settings' ? 'none' : 'view' }), {}),
    module_owner: modules.reduce((acc, m) => ({ ...acc, [m]: m === 'settings' ? 'none' : 'view' }), {}),
  };

  await transaction(async (tx) => {
    for (const [role, perms] of Object.entries(matrix)) {
      for (const [mod, perm] of Object.entries(perms)) {
        await tx.run(
          'INSERT OR IGNORE INTO role_permissions (role, module, permission) VALUES (?, ?, ?)',
          [role, mod, perm],
        );
      }
    }
  });
  console.log('[db] Seeded default role_permissions matrix');
}

// ── Bootstrap on import ─────────────────────────────────────────
// WHY: server.js must `await require('./db/database').ready` before app.listen() so that
// routes never race schema init / seeds.
// WHY: integration tests use better-sqlite3 directly (see tests/helpers/setup.js) and
// don't need the libsql client's schema/seed bootstrap. Skipping under vitest avoids
// parallel workers racing on the same `file::memory:` path and producing unhandled
// "no such table: deals" rejections during seedDeals.
const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';

const ready = isTestEnv ? Promise.resolve() : (async () => {
  await initSchema();
  await seedAdmin();
  await bootstrapAdminRoles();
  await seedRolePermissions();

  try {
    const { seedDeals } = require('./seed-deals');
    await seedDeals({ client, one, all, run, transaction });
  } catch (e) {
    if (!e.message.includes('Cannot find module')) throw e;
  }

  try {
    const { seedProspects } = require('./seed-prospects');
    await seedProspects({ client, one, all, run, transaction });
  } catch (e) {
    if (!e.message.includes('Cannot find module')) throw e;
  }

  try {
    const { seedTracker } = require('./tracker-seed');
    await seedTracker({ client, one, all, run, transaction });
  } catch (e) {
    if (!e.message.includes('Cannot find module')) throw e;
  }
})().catch((err) => {
  console.error('[db] Initialization failed:', err);
  throw err;
});

module.exports = { client, one, all, run, transaction, ready };
