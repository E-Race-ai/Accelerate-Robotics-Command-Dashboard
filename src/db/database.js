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

  -- WHY: Indexes on foreign keys and common query patterns
  CREATE INDEX IF NOT EXISTS idx_deals_stage ON deals(stage);
  CREATE INDEX IF NOT EXISTS idx_deals_owner ON deals(owner);
  CREATE INDEX IF NOT EXISTS idx_facilities_type ON facilities(type);
  CREATE INDEX IF NOT EXISTS idx_activities_deal ON activities(deal_id);
  CREATE INDEX IF NOT EXISTS idx_challenges_facility ON operational_challenges(facility_id);
  CREATE INDEX IF NOT EXISTS idx_contacts_facility ON contacts(facility_id);
`);

// WHY: Add role column for role-based access control. ALTER TABLE ADD COLUMN is safe with IF NOT EXISTS guard.
try {
  db.exec("ALTER TABLE admin_users ADD COLUMN role TEXT DEFAULT 'admin' CHECK(role IN ('admin', 'sales', 'ops', 'viewer'))");
} catch (e) {
  // WHY: SQLite throws "duplicate column name" if column already exists — safe to ignore
  if (!e.message.includes('duplicate column')) throw e;
}

// ── Seed admin user ─────────────────────────────────────────────
// WHY: Only seed if ADMIN_EMAIL + ADMIN_PASSWORD are set AND no admin exists yet — prevents overwriting changed passwords on restart
function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;

  if (!email || !password) return;

  const existing = db.prepare('SELECT id FROM admin_users WHERE email = ?').get(email);
  if (existing) return;

  const BCRYPT_ROUNDS = 12; // Balances security vs. login latency (~250ms on modern hardware)
  const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  db.prepare('INSERT INTO admin_users (email, password_hash) VALUES (?, ?)').run(email, hash);
  console.log(`[db] Seeded admin user: ${email}`);

  // WHY: Also add admin as a notification recipient so they get inquiry emails by default
  const recipientExists = db.prepare('SELECT id FROM notification_recipients WHERE email = ?').get(email);
  if (!recipientExists) {
    db.prepare('INSERT INTO notification_recipients (email, name, active) VALUES (?, ?, 1)').run(email, 'Admin');
    console.log(`[db] Added admin as notification recipient`);
  }
}

seedAdmin();

module.exports = db;
