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
    // ── WhatsApp Hub — directory of company WhatsApp groups
    // WHY: WhatsApp doesn't expose a "feed" of all groups via any free API and
    // the Business API requires per-group opt-in. Keeping a simple directory
    // (name + invite link + curated notes) gives the team a single landing
    // page to discover and jump into every internal chat.
    `CREATE TABLE IF NOT EXISTS whatsapp_groups (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      category TEXT NOT NULL DEFAULT 'team'
        CHECK(category IN ('team', 'project', 'customer', 'community', 'other')),
      invite_url TEXT,
      member_count INTEGER NOT NULL DEFAULT 0,
      notes TEXT,
      pinned INTEGER NOT NULL DEFAULT 0,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_category ON whatsapp_groups(category)`,
    `CREATE INDEX IF NOT EXISTS idx_whatsapp_groups_pinned_updated ON whatsapp_groups(pinned DESC, updated_at DESC)`,
    // ── Hotel Research Tool — saved prospects from OSM lookups
    // WHY: Sales reps run city/zip searches against OpenStreetMap Overpass
    // (free, no key) and bookmark the candidates into this table. We persist
    // the OSM snapshot at the time of save (name, address, brand, stars,
    // rooms) PLUS the rep's own captured intel (actual nightly rate, deal
    // status, notes). Real-time pricing isn't included — that needs a paid
    // partner API (Amadeus, Booking) and is intentionally deferred.
    `CREATE TABLE IF NOT EXISTS hotels_saved (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      address TEXT,
      city TEXT,
      state TEXT,
      zip TEXT,
      country TEXT,
      lat REAL,
      lng REAL,
      brand TEXT,
      stars INTEGER,
      rooms INTEGER,
      phone TEXT,
      website TEXT,
      osm_id TEXT,
      submarket TEXT,
      est_adr_dollars INTEGER,
      status TEXT NOT NULL DEFAULT 'lead'
        CHECK(status IN ('lead', 'contacted', 'qualified', 'proposed', 'won', 'lost', 'archived')),
      notes TEXT,
      saved_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_hotels_saved_status ON hotels_saved(status, updated_at DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_hotels_saved_city ON hotels_saved(city)`,
    // WHY: idx_hotels_saved_submarket lives below in the additive section —
    // existing prod DBs got the table before the submarket column was added,
    // so the index can't run until ALTER TABLE has appended the column.

    // ── Hotel visits — drop-in / drive-by log per saved hotel
    // WHY: BDRs do live property visits as part of pre-prospecting research.
    // Each row is one visit: who you talked to, what you learned, what's next.
    // Surfaces as a timeline on the saved-hotel detail view and as evidence
    // when graduating to a prospect.
    `CREATE TABLE IF NOT EXISTS hotel_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      hotel_saved_id INTEGER NOT NULL REFERENCES hotels_saved(id) ON DELETE CASCADE,
      visit_date TEXT NOT NULL,
      visit_type TEXT NOT NULL DEFAULT 'drop_in'
        CHECK(visit_type IN ('drop_in', 'drive_by', 'scheduled_meeting', 'phone_call', 'email')),
      contact_name TEXT,
      contact_role TEXT,
      summary TEXT,
      next_step TEXT,
      next_step_due TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_hotel_visits_hotel ON hotel_visits(hotel_saved_id, visit_date DESC)`,

    // ── BDR scheduled routes — one row per planned day OR per named saved route
    // WHY: BDRs work zones on a weekly cadence (e.g. "Coral Gables Monday,
    // Brickell Tuesday, South Beach Wednesday"). Each row here is either a
    // dated day-plan or an undated saved template that can be cloned. Stops
    // live in bdr_route_stops with explicit ordering so the rep can drive
    // them in sequence and check each one off as they go.
    `CREATE TABLE IF NOT EXISTS bdr_routes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      scheduled_date TEXT,
      zone TEXT,
      notes TEXT,
      created_by TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS bdr_route_stops (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route_id INTEGER NOT NULL REFERENCES bdr_routes(id) ON DELETE CASCADE,
      hotel_saved_id INTEGER NOT NULL REFERENCES hotels_saved(id) ON DELETE CASCADE,
      sort_order INTEGER NOT NULL DEFAULT 0,
      done INTEGER NOT NULL DEFAULT 0,
      visit_id INTEGER,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_bdr_routes_date ON bdr_routes(scheduled_date)`,
    `CREATE INDEX IF NOT EXISTS idx_bdr_route_stops_route ON bdr_route_stops(route_id, sort_order)`,

    // ── Glossary game — gamification of /pages/team-glossary.html
    // WHY: Per-user progress (points, level, streak) plus an activity log so
    // teammates can earn points by quizzing and eventually swap them for swag
    // via Axomo / Nectar. All point awards happen server-side based on
    // validated activities — clients never tell the server how many points
    // they earned, only what they did (so the system can't be cheated by
    // posting fake totals).
    `CREATE TABLE IF NOT EXISTS glossary_user_progress (
      user_email TEXT PRIMARY KEY,
      display_name TEXT,
      total_points INTEGER NOT NULL DEFAULT 0,
      level INTEGER NOT NULL DEFAULT 1,
      current_streak INTEGER NOT NULL DEFAULT 0,
      longest_streak INTEGER NOT NULL DEFAULT 0,
      last_active_date TEXT,
      quizzes_completed INTEGER NOT NULL DEFAULT 0,
      perfect_quizzes INTEGER NOT NULL DEFAULT 0,
      badges TEXT NOT NULL DEFAULT '[]',
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE TABLE IF NOT EXISTS glossary_activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_email TEXT NOT NULL,
      activity TEXT NOT NULL,
      points INTEGER NOT NULL DEFAULT 0,
      metadata TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_glossary_user_points ON glossary_user_progress(total_points DESC)`,
    `CREATE INDEX IF NOT EXISTS idx_glossary_activities_user ON glossary_activities(user_email, created_at DESC)`,
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

  // WHY: Hotel Research preset markets (Miami-Dade submarkets, etc.) tag each saved
  // hotel with which submarket it came from so the rep can filter "show me only Brickell."
  // ALTER must come BEFORE the index since existing prod DBs created hotels_saved
  // without the submarket column. additiveAlterIfMissing catches the duplicate-column
  // race on subsequent boots.
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN submarket TEXT");
  await client.execute("CREATE INDEX IF NOT EXISTS idx_hotels_saved_submarket ON hotels_saved(submarket)");

  // WHY: prospect_id links a saved-hotel research record to its graduated
  // prospect row once a BDR confirms the property is qualified. Set by the
  // /graduate endpoint; preserves the research trail (visits, notes) while
  // letting the deal-pipeline code pick up where research left off.
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN prospect_id INTEGER");
  await client.execute("CREATE INDEX IF NOT EXISTS idx_hotels_saved_prospect ON hotels_saved(prospect_id)");

  // WHY sales-intel + property data columns: turn the saved hotel into a
  // BDR's full property card. Operator/ownership/year_opened/total_floors
  // come from OSM enrichment when present; the rest is rep-captured intel
  // they fill in as they work the territory. Opportunity score is a 1-5
  // gut check; tags are a free-form taxonomy ("renovation 2025", "owner
  // operator", "loud lobby"); amenities is the JSON of OSM amenity flags.
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN operator TEXT");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN ownership TEXT");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN year_opened INTEGER");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN total_floors INTEGER");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN amenities TEXT");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN tags TEXT");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN dm_name TEXT");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN dm_title TEXT");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN dm_email TEXT");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN dm_phone TEXT");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN dm_linkedin TEXT");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN existing_vendor TEXT");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN opportunity_score INTEGER");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN photo_url TEXT");

  // WHY F&B + event-space intel: BDRs sort prospects by deal size, and a
  // hotel with 4 restaurants + 50,000 sqft of event space is a meaningfully
  // bigger software opportunity than a 200-key limited-service property
  // with no F&B. Captured manually by reps as they research; surfaced as
  // first-class sort/filter dimensions on the map + saved list.
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN restaurant_count INTEGER");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN bar_count INTEGER");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN event_sqft INTEGER");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN meeting_room_count INTEGER");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN ballroom_capacity INTEGER");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN spa_count INTEGER");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN pool_count INTEGER");

  // WHY enrichment columns: critical-market BDRs (Miami-Dade) need a richer
  // hotel snapshot than OSM alone provides — photo, brief description, public
  // rating, review count, and a Wikipedia link when one exists. Pulled by
  // src/services/hotel-enrichment.js from Wikipedia REST + the hotel website's
  // OpenGraph tags. enriched_at is a timestamp the enrichment service stamps
  // on success so we don't repeat work for the same row.
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN description TEXT");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN rating REAL");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN review_count INTEGER");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN wikipedia_url TEXT");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN enriched_at TEXT");
  await client.execute("CREATE INDEX IF NOT EXISTS idx_hotels_saved_enriched_at ON hotels_saved(enriched_at)");

  // WHY ai_fit columns: pre-sort the triage queue by best-fit-first so reps
  // spend their first hour on the highest-value targets. Score is a 0-100
  // integer set by src/services/fit-score.js. Reasoning is a JSON array of
  // short strings shown on the triage card. scored_at lets us re-run the
  // scorer on demand without redoing already-scored rows.
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN ai_fit_score INTEGER");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN ai_fit_reasoning TEXT");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN ai_fit_tier TEXT");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN ai_fit_scored_at TEXT");
  await client.execute("CREATE INDEX IF NOT EXISTS idx_hotels_saved_fit_score ON hotels_saved(ai_fit_score DESC)");

  // WHY enrichment_depth: token + API budget gate. Top-fit hotels (top 100)
  // get deep research treatment; mid-fit get standard; low-fit get only the
  // basic OSM data we already saved. Reps shouldn't waste research time on
  // hotels they likely won't target. chain_description holds the brand-level
  // summary (pulled from Wikipedia of the chain) so independent properties
  // of a known chain still get useful context even when their own page
  // doesn't exist.
  // WHY: routes can be driven (Tesla / car) or walked (e.g. South Beach
  // hotel-row tours). The mode flag changes the optimizer + the icon shown
  // in the schedule panel + how stops are ordered (linear-along-corridor
  // for walking vs nearest-neighbor TSP for driving).
  await additiveAlterIfMissing("ALTER TABLE bdr_routes ADD COLUMN mode TEXT DEFAULT 'driving'");

  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN enrichment_depth TEXT");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN chain_description TEXT");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN chain_url TEXT");
  await client.execute("CREATE INDEX IF NOT EXISTS idx_hotels_saved_depth ON hotels_saved(enrichment_depth)");

  // ── Facility master record — the unified record per real-world property ─
  // WHY: BDR research, prospect graduation, deals, assessments, and CRM
  // activity all describe the same physical hotel — but until now lived in
  // separate tables with no shared link. This binds them via facility_id
  // so a single property carries its full lifecycle history.
  //
  // facilities is the canonical master (deals already FK to it). We extend
  // it with location + the OSM dedupe key, then teach hotels_saved + prospects
  // to FK into it on creation.
  await additiveAlterIfMissing("ALTER TABLE facilities ADD COLUMN lat REAL");
  await additiveAlterIfMissing("ALTER TABLE facilities ADD COLUMN lng REAL");
  await additiveAlterIfMissing("ALTER TABLE facilities ADD COLUMN zip TEXT");
  await additiveAlterIfMissing("ALTER TABLE facilities ADD COLUMN submarket TEXT");
  await additiveAlterIfMissing("ALTER TABLE facilities ADD COLUMN osm_id TEXT");
  await additiveAlterIfMissing("ALTER TABLE facilities ADD COLUMN stars INTEGER");
  await additiveAlterIfMissing("ALTER TABLE facilities ADD COLUMN year_opened INTEGER");
  await additiveAlterIfMissing("ALTER TABLE facilities ADD COLUMN est_adr_dollars INTEGER");
  await additiveAlterIfMissing("ALTER TABLE facilities ADD COLUMN website TEXT");
  await additiveAlterIfMissing("ALTER TABLE facilities ADD COLUMN phone TEXT");
  await client.execute("CREATE INDEX IF NOT EXISTS idx_facilities_osm_id ON facilities(osm_id)");
  await client.execute("CREATE INDEX IF NOT EXISTS idx_facilities_name_city ON facilities(LOWER(name), LOWER(city))");

  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN facility_id TEXT");
  await client.execute("CREATE INDEX IF NOT EXISTS idx_hotels_saved_facility ON hotels_saved(facility_id)");

  await additiveAlterIfMissing("ALTER TABLE prospects ADD COLUMN facility_id TEXT");
  await client.execute("CREATE INDEX IF NOT EXISTS idx_prospects_facility ON prospects(facility_id)");

  // WHY triage: BDR fast-pass over a search-result list. One-click pills
  // (yes / no / maybe / needs_research) so Ben can sweep 346 cards in a
  // morning. Validation happens in the route layer — SQLite ALTER TABLE
  // can't add a CHECK constraint mid-stream.
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN triage TEXT");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN triage_by TEXT");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN triage_player TEXT");
  await additiveAlterIfMissing("ALTER TABLE hotels_saved ADD COLUMN triage_at TEXT");
  await client.execute("CREATE INDEX IF NOT EXISTS idx_hotels_saved_triage ON hotels_saved(triage)");
  await client.execute("CREATE INDEX IF NOT EXISTS idx_hotels_saved_triage_player ON hotels_saved(triage_player)");
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
