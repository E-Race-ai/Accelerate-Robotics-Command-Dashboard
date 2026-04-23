const { Pool } = require('pg');
const bcrypt = require('bcrypt');

// WHY: DATABASE_URL is injected by Render / set locally for dev. Fail loudly if missing —
// silent fallback to a different DB would mask misconfiguration in production.
if (!process.env.DATABASE_URL) {
  throw new Error('DATABASE_URL is required — see .env.example');
}

// WHY: Render Postgres requires SSL. Detect via the hostname rather than NODE_ENV so a local
// dev pointing at the hosted Render DB (e.g. for real-time local/cloud sync) also negotiates SSL.
const needsSSL = /render\.com|amazonaws\.com|supabase\.com|neon\.tech/.test(process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: needsSSL ? { rejectUnauthorized: false } : false,
});

// ── Query helpers ───────────────────────────────────────────────
// Callers use these instead of raw pool.query() to match the ergonomics the codebase had with
// better-sqlite3's .get() / .all() / .run() methods.
async function one(text, params) {
  const r = await pool.query(text, params);
  return r.rows[0] || null;
}
async function all(text, params) {
  const r = await pool.query(text, params);
  return r.rows;
}
async function run(text, params) {
  const r = await pool.query(text, params);
  return { changes: r.rowCount, rows: r.rows };
}

// ── Schema ──────────────────────────────────────────────────────
// Idempotent: every CREATE TABLE uses IF NOT EXISTS. Ordering respects foreign keys.
async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'admin' CHECK(role IN ('admin', 'sales', 'ops', 'viewer')),
      name TEXT DEFAULT '',
      invited_by INTEGER,
      invite_token TEXT,
      invite_expires_at TIMESTAMPTZ,
      status TEXT DEFAULT 'active',
      last_login_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS inquiries (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      company TEXT,
      phone TEXT,
      message TEXT NOT NULL,
      status TEXT DEFAULT 'new' CHECK(status IN ('new', 'reviewed', 'contacted', 'archived')),
      created_at TIMESTAMPTZ DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ
    );

    CREATE TABLE IF NOT EXISTS notification_recipients (
      id SERIAL PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      name TEXT,
      active SMALLINT DEFAULT 1 CHECK(active IN (0, 1)),
      created_at TIMESTAMPTZ DEFAULT NOW()
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
      wifi_available SMALLINT DEFAULT 1,
      operator TEXT,
      brand TEXT,
      gm_name TEXT,
      gm_email TEXT,
      gm_phone TEXT,
      eng_name TEXT,
      eng_email TEXT,
      notes TEXT,
      photos TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
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
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW(),
      closed_at TIMESTAMPTZ
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
      created_at TIMESTAMPTZ DEFAULT NOW()
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
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS activities (
      id TEXT PRIMARY KEY,
      deal_id TEXT REFERENCES deals(id),
      actor TEXT NOT NULL,
      action TEXT NOT NULL,
      detail TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

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
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      synced_at TIMESTAMPTZ
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
      photo_data BYTEA,
      thumbnail TEXT,
      annotations TEXT,
      caption TEXT,
      taken_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

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

    CREATE TABLE IF NOT EXISTS markets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      cluster TEXT,
      color TEXT,
      notes TEXT,
      lat REAL,
      lng REAL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS prospects (
      id SERIAL PRIMARY KEY,
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
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE INDEX IF NOT EXISTS idx_prospects_market ON prospects(market_id);
    CREATE INDEX IF NOT EXISTS idx_prospects_status ON prospects(status);
  `);
}

// ── Seeds ───────────────────────────────────────────────────────
async function seedAdmin() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password) return;

  const existing = await one('SELECT id FROM admin_users WHERE email = $1', [email]);
  if (existing) return;

  const BCRYPT_ROUNDS = 12;
  const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  await run('INSERT INTO admin_users (email, password_hash) VALUES ($1, $2)', [email, hash]);
  console.log(`[db] Seeded admin user: ${email}`);

  const recipientExists = await one('SELECT id FROM notification_recipients WHERE email = $1', [email]);
  if (!recipientExists) {
    await run('INSERT INTO notification_recipients (email, name, active) VALUES ($1, $2, 1)', [email, 'Admin']);
    console.log(`[db] Added admin as notification recipient`);
  }
}

async function bootstrapAdminRoles() {
  const raw = process.env.BOOTSTRAP_ADMIN_EMAILS;
  if (!raw) return;
  const emails = raw.split(',').map(e => e.trim()).filter(Boolean);
  for (const email of emails) {
    const result = await run(
      "UPDATE admin_users SET role = 'admin' WHERE email = $1 AND (role IS NULL OR role != 'admin')",
      [email],
    );
    if (result.changes > 0) console.log(`[db] Promoted ${email} to admin role`);
  }
}

// ── Bootstrap on import ─────────────────────────────────────────
// WHY: Top-level await isn't supported in CommonJS, so we export a ready promise that
// server.js awaits before binding routes. Callers importing the db during module init
// (routes do) only use the query helpers, which resolve once the pool is up regardless
// of schema state — but any code that runs queries before ready() resolves risks hitting
// missing tables. server.js must await ready() before app.listen().
const ready = (async () => {
  await initSchema();
  await seedAdmin();
  await bootstrapAdminRoles();

  try {
    const { seedDeals } = require('./seed-deals');
    await seedDeals({ pool, one, all, run });
  } catch (e) {
    if (!e.message.includes('Cannot find module')) throw e;
  }

  try {
    const { seedProspects } = require('./seed-prospects');
    await seedProspects({ pool, one, all, run });
  } catch (e) {
    if (!e.message.includes('Cannot find module')) throw e;
  }
})();

module.exports = { pool, one, all, run, ready };
