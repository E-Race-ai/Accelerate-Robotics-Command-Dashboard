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
`);

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
