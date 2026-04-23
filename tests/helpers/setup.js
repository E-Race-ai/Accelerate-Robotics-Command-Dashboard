const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');

// WHY: Fixed secret for tests only — never used outside the test environment.
// A predictable value makes token verification deterministic across test runs.
const JWT_SECRET = 'test-secret';

/**
 * Creates a fresh in-memory SQLite database with the full schema.
 * Returns { db, cleanup } — call cleanup() when done.
 *
 * WHY: In-memory DB over a file DB so each test suite starts clean
 * with zero setup/teardown cost on disk, and tests never interfere
 * with each other or the development database.
 */
function createTestDb() {
  const db = new Database(':memory:');
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  db.exec(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin' CHECK(role IN ('super_admin', 'admin', 'module_owner', 'viewer', 'sales', 'ops')),
      name TEXT DEFAULT '',
      invited_by INTEGER,
      invite_token TEXT,
      invite_expires_at TEXT,
      status TEXT DEFAULT 'active',
      last_login_at TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS deals (
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
    );

    CREATE TABLE IF NOT EXISTS facilities (
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
    );

    CREATE TABLE IF NOT EXISTS contacts (
      id TEXT PRIMARY KEY,
      facility_id TEXT REFERENCES facilities(id),
      name TEXT NOT NULL,
      title TEXT,
      email TEXT,
      phone TEXT,
      role TEXT CHECK(role IN ('decision_maker','champion','influencer','end_user','blocker')),
      notes TEXT,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS operational_challenges (
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
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      deal_id TEXT REFERENCES deals(id),
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- WHY: Facility assessment captures site-walk data that feeds into Fleet Designer.
    -- UUIDs are generated client-side so assessments can be created offline.
    CREATE TABLE IF NOT EXISTS assessments (
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
    );

    CREATE TABLE IF NOT EXISTS assessment_zones (
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
    );

    CREATE TABLE IF NOT EXISTS assessment_stakeholders (
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
    );

    CREATE TABLE IF NOT EXISTS assessment_photos (
      id TEXT PRIMARY KEY,
      assessment_id TEXT NOT NULL REFERENCES assessments(id) ON DELETE CASCADE,
      zone_id TEXT REFERENCES assessment_zones(id) ON DELETE SET NULL,
      checklist_item TEXT,
      photo_data BLOB,
      thumbnail TEXT,
      annotations TEXT,
      caption TEXT,
      taken_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- WHY: Markets define geographic areas where Accelerate targets hotel prospects.
    CREATE TABLE IF NOT EXISTS markets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cluster TEXT,
      color TEXT,
      notes TEXT,
      lat REAL,
      lng REAL,
      created_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS prospects (
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
    );

    CREATE INDEX IF NOT EXISTS idx_prospects_market ON prospects(market_id);
    CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
    CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
    CREATE INDEX IF NOT EXISTS idx_deals_owner ON deals(owner);
    CREATE INDEX IF NOT EXISTS idx_facilities_type ON facilities(type);
    CREATE INDEX IF NOT EXISTS idx_activities_deal ON activities(deal_id);
    CREATE INDEX IF NOT EXISTS idx_challenges_facility ON operational_challenges(facility_id);
    CREATE INDEX IF NOT EXISTS idx_contacts_facility ON contacts(facility_id);
    CREATE INDEX IF NOT EXISTS idx_assessments_deal ON assessments(deal_id);
    CREATE INDEX IF NOT EXISTS idx_assessments_assigned ON assessments(assigned_to);
    CREATE INDEX IF NOT EXISTS idx_assessments_status ON assessments(status);
    CREATE INDEX IF NOT EXISTS idx_assessment_zones_assessment ON assessment_zones(assessment_id);
    CREATE INDEX IF NOT EXISTS idx_assessment_stakeholders_assessment ON assessment_stakeholders(assessment_id);
    CREATE INDEX IF NOT EXISTS idx_assessment_photos_assessment ON assessment_photos(assessment_id);
    CREATE INDEX IF NOT EXISTS idx_assessment_photos_zone ON assessment_photos(zone_id);

    CREATE TABLE IF NOT EXISTS role_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      role TEXT NOT NULL,
      module TEXT NOT NULL,
      permission TEXT NOT NULL DEFAULT 'none' CHECK(permission IN ('edit', 'view', 'none')),
      UNIQUE(role, module)
    );

    CREATE TABLE IF NOT EXISTS user_permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES admin_users(id) ON DELETE CASCADE,
      module TEXT NOT NULL,
      permission TEXT NOT NULL CHECK(permission IN ('edit', 'view', 'none')),
      UNIQUE(user_id, module)
    );
  `);

  return {
    db,
    cleanup: () => db.close(),
  };
}

/**
 * Creates a mock auth cookie value for testing protected routes.
 * Defaults to admin role so tests that just need "any valid user" work out of the box.
 */
function makeAuthToken(overrides = {}) {
  const payload = { id: 1, email: 'test@accelerate.com', role: 'admin', ...overrides };
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1h' });
}

/**
 * Wraps a better-sqlite3 instance in the async { one, all, run, transaction } API that
 * production code in src/ now expects (libsql-style). Lets us keep in-memory SQLite
 * for tests while the app talks to Turso in prod.
 */
function wrapAsLibsqlHelper(db) {
  return {
    one: async (sql, args = []) => db.prepare(sql).get(...args) || null,
    all: async (sql, args = []) => db.prepare(sql).all(...args),
    run: async (sql, args = []) => {
      const r = db.prepare(sql).run(...args);
      return { changes: r.changes, lastInsertRowid: Number(r.lastInsertRowid ?? 0) };
    },
    transaction: async (fn) => {
      const txFn = db.transaction((innerFn) => innerFn());
      let result;
      txFn(() => {
        // WHY: the libsql-style tx passed to fn must expose the same async helpers.
        // better-sqlite3's transaction runs sync — we await at the boundary.
        const tx = {
          one: (sql, args = []) => Promise.resolve(db.prepare(sql).get(...args) || null),
          all: (sql, args = []) => Promise.resolve(db.prepare(sql).all(...args)),
          run: (sql, args = []) => {
            const r = db.prepare(sql).run(...args);
            return Promise.resolve({ changes: r.changes, lastInsertRowid: Number(r.lastInsertRowid ?? 0) });
          },
        };
        result = fn(tx);
      });
      return result;
    },
  };
}

module.exports = { createTestDb, makeAuthToken, JWT_SECRET, wrapAsLibsqlHelper };
