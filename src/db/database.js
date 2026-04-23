const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcrypt');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || './data/accelerate.db';

// WHY: Ensure the data directory exists before SQLite tries to create the file
const dbDir = path.dirname(path.resolve(DB_PATH));
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(path.resolve(DB_PATH));

// WHY: WAL mode gives better concurrent read performance and crash resilience
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ──────────────────────────────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS inquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    company TEXT,
    phone TEXT,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'new' CHECK(status IN ('new', 'reviewed', 'contacted', 'archived')),
    created_at TEXT DEFAULT (datetime('now')),
    reviewed_at TEXT
  );

  CREATE TABLE IF NOT EXISTS notification_recipients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    name TEXT,
    active INTEGER DEFAULT 1 CHECK(active IN (0, 1)),
    created_at TEXT DEFAULT (datetime('now'))
  );

  -- Phase 1: Operations Platform tables

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
    surfaces TEXT,  -- WHY: JSON array of surface types, e.g. ["carpet","tile","hardwood"]
    wifi_available INTEGER DEFAULT 1,
    operator TEXT,
    brand TEXT,
    gm_name TEXT,
    gm_email TEXT,
    gm_phone TEXT,
    eng_name TEXT,
    eng_email TEXT,
    notes TEXT,
    photos TEXT,  -- WHY: JSON array of photo paths/URLs
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
    floors_affected TEXT,  -- WHY: JSON array of floor numbers
    schedule TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS activities (
    id TEXT PRIMARY KEY,
    deal_id TEXT REFERENCES deals(id),
    actor TEXT NOT NULL,
    action TEXT NOT NULL,
    detail TEXT,  -- WHY: JSON with action-specific data, keeps schema stable as action types grow
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

  -- WHY: Indexes on foreign keys and common query patterns
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

  -- WHY: Markets define geographic areas where Accelerate targets hotel prospects.
  -- Prospects in the pipeline directly shape operational footprint and hiring pools.
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

  -- WHY: Role-level default permissions per module — defines what each role can do out of the box.
  -- User-level overrides live in user_permissions.
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

  CREATE INDEX IF NOT EXISTS idx_prospects_market ON prospects(market_id);
  CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
`);

// WHY: Add role column for role-based access control. ALTER TABLE ADD COLUMN is safe with IF NOT EXISTS guard.
try {
  db.exec("ALTER TABLE admin_users ADD COLUMN role TEXT DEFAULT 'admin' CHECK(role IN ('super_admin', 'admin', 'module_owner', 'sales', 'ops', 'viewer'))");
} catch (e) {
  // WHY: SQLite throws "duplicate column name" if column already exists — safe to ignore
  if (!e.message.includes('duplicate column')) throw e;
}

// WHY: Multi-user auth columns — name, invite workflow, status, last login tracking
const userColumns = [
  { sql: "ALTER TABLE admin_users ADD COLUMN name TEXT DEFAULT ''", col: 'name' },
  { sql: "ALTER TABLE admin_users ADD COLUMN invited_by INTEGER REFERENCES admin_users(id)", col: 'invited_by' },
  { sql: "ALTER TABLE admin_users ADD COLUMN invite_token TEXT", col: 'invite_token' },
  { sql: "ALTER TABLE admin_users ADD COLUMN invite_expires_at TEXT", col: 'invite_expires_at' },
  { sql: "ALTER TABLE admin_users ADD COLUMN status TEXT DEFAULT 'active'", col: 'status' },
  { sql: "ALTER TABLE admin_users ADD COLUMN last_login_at TEXT", col: 'last_login_at' },
];
for (const { sql } of userColumns) {
  try { db.exec(sql); } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
  }
}

// WHY: Add lat/lng for map view — market-level geocoding is sufficient for territory visualization
try {
  db.exec("ALTER TABLE markets ADD COLUMN lat REAL");
} catch (e) {
  if (!e.message.includes('duplicate column')) throw e;
}
try {
  db.exec("ALTER TABLE markets ADD COLUMN lng REAL");
} catch (e) {
  if (!e.message.includes('duplicate column')) throw e;
}

// WHY: Migration — remove old CHECK constraint on role column that blocks 'super_admin' and 'module_owner'.
// SQLite can't ALTER CHECK constraints, so we recreate the table if the old constraint is detected.
try {
  // Test if the new roles work — if this fails, we need to migrate
  db.exec("INSERT INTO admin_users (email, password_hash, role) VALUES ('__check_test__', 'x', 'super_admin')");
  db.exec("DELETE FROM admin_users WHERE email = '__check_test__'");
} catch (e) {
  if (e.message.includes('CHECK constraint failed')) {
    console.log('[db] Migrating admin_users table to support new roles...');
    db.exec(`
      CREATE TABLE admin_users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TEXT DEFAULT (datetime('now')),
        role TEXT DEFAULT 'admin' CHECK(role IN ('super_admin', 'admin', 'module_owner', 'sales', 'ops', 'viewer')),
        name TEXT DEFAULT '',
        invited_by INTEGER REFERENCES admin_users_new(id),
        invite_token TEXT,
        invite_expires_at TEXT,
        status TEXT DEFAULT 'active',
        last_login_at TEXT
      );
      INSERT INTO admin_users_new SELECT id, email, password_hash, created_at,
        COALESCE(role, 'admin'), COALESCE(name, ''), invited_by, invite_token,
        invite_expires_at, COALESCE(status, 'active'), last_login_at
        FROM admin_users;
      DROP TABLE admin_users;
      ALTER TABLE admin_users_new RENAME TO admin_users;
    `);
    console.log('[db] Migration complete — admin_users now supports super_admin/module_owner roles');
  }
}

// ── Seed admin user ─────────────────────────────────────────────
// WHY: Only seed if ADMIN_EMAIL + ADMIN_PASSWORD are set AND no admin exists yet — prevents overwriting changed passwords on restart
function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) return;

  const BCRYPT_ROUNDS = 12; // Balances security vs. login latency (~250ms on modern hardware)

  const existing = db.prepare('SELECT id, password_hash FROM admin_users WHERE email = ?').get(email);
  if (existing) {
    // WHY: Sync password on every boot — if ADMIN_PASSWORD env var changed, update the hash.
    // bcrypt.compareSync is ~250ms but only runs once at boot, acceptable cost.
    const matches = bcrypt.compareSync(password, existing.password_hash);
    if (!matches) {
      const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
      db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(hash, existing.id);
      console.log(`[db] Updated admin password for: ${email}`);
    }
    // WHY: Ensure the seed admin is always super_admin — handles upgrades from older schemas
    db.prepare("UPDATE admin_users SET role = 'super_admin' WHERE id = ? AND (role IS NULL OR role = 'admin')").run(existing.id);
    return;
  }

  // WHY: If ADMIN_EMAIL changed but a super_admin already exists, update their email
  // instead of creating a duplicate. This handles env var email changes on redeploy.
  const existingSuperAdmin = db.prepare("SELECT id, password_hash FROM admin_users WHERE role = 'super_admin' LIMIT 1").get();
  if (existingSuperAdmin) {
    const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
    db.prepare('UPDATE admin_users SET email = ?, password_hash = ? WHERE id = ?').run(email, hash, existingSuperAdmin.id);
    console.log(`[db] Updated super admin email to: ${email}`);
    return;
  }

  const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  db.prepare("INSERT INTO admin_users (email, password_hash, role, status, name) VALUES (?, ?, 'super_admin', 'active', 'Eric Race')").run(email, hash);
  console.log(`[db] Seeded admin user: ${email}`);

  // WHY: Also add admin as a notification recipient so they get inquiry emails by default
  const recipientExists = db.prepare('SELECT id FROM notification_recipients WHERE email = ?').get(email);
  if (!recipientExists) {
    db.prepare('INSERT INTO notification_recipients (email, name, active) VALUES (?, ?, 1)').run(email, 'Admin');
    console.log(`[db] Added admin as notification recipient`);
  }
}

seedAdmin();

// ── Seed role permissions ───────────────────────────────────────
// WHY: Pre-populate default permissions so every role has a known baseline.
// Admins can customize later; this avoids a blank permissions table on first boot.
// Also backfills new modules into existing databases that were seeded before the module list grew.
function seedRolePermissions() {
  const { ALL_MODULES } = require('../services/permissions');
  const defaults = {
    // WHY: admin gets full edit on everything; module_owner/viewer get view on toolkit pages, none on settings
    admin: Object.fromEntries(ALL_MODULES.map(m => [m, 'edit'])),
    module_owner: Object.fromEntries(ALL_MODULES.map(m => [m, m === 'settings' ? 'none' : 'view'])),
    viewer: Object.fromEntries(ALL_MODULES.map(m => [m, m === 'settings' ? 'none' : 'view'])),
  };
  // WHY: Use INSERT OR IGNORE so new modules get seeded without overwriting admin-customized values
  const insert = db.prepare('INSERT OR IGNORE INTO role_permissions (role, module, permission) VALUES (?, ?, ?)');
  const seed = db.transaction(() => {
    for (const [role, perms] of Object.entries(defaults)) {
      for (const mod of ALL_MODULES) { insert.run(role, mod, perms[mod]); }
    }
  });
  seed();
}

seedRolePermissions();

// ── Seed deals ──────────────────────────────────────────────────
// WHY: Pre-populate with existing hotel pipeline. Idempotent — skips if deals exist.
try {
  const { seedDeals } = require('./seed-deals');
  seedDeals(db);
} catch (e) {
  // WHY: seed-deals may not exist yet during early development
  if (!e.message.includes('Cannot find module')) throw e;
}

module.exports = db;
