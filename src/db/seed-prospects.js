const db = require('./database');
const fs = require('fs');
const path = require('path');

/**
 * Seed markets and prospects tables from seed data if they are empty.
 * WHY: Idempotent — only runs when tables have no data (fresh install or reset).
 * Called from server.js on boot.
 */
function seedProspects() {
  const count = db.prepare('SELECT COUNT(*) as n FROM prospects').get().n;
  if (count > 0) return; // Already seeded

  const seedPath = path.join(__dirname, '..', '..', 'data', 'seed-prospects.json');
  if (!fs.existsSync(seedPath)) {
    console.warn('[seed] No seed-prospects.json found — skipping prospect seeding');
    return;
  }

  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

  const insertMarket = db.prepare(`
    INSERT OR IGNORE INTO markets (id, name, cluster, color)
    VALUES (?, ?, ?, ?)
  `);

  const insertProspect = db.prepare(`
    INSERT INTO prospects (market_id, status, name, address, brand, brand_class,
      keys, floors, stars, signal, operator, portfolio, monogram, mono_color, source)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const seedAll = db.transaction(() => {
    for (const m of seed.markets) {
      insertMarket.run(m.id, m.name, m.cluster, m.color);
    }
    for (const p of seed.prospects) {
      insertProspect.run(
        p.market_id, p.status, p.name, p.address, p.brand, p.brand_class,
        p.keys, p.floors, p.stars, p.signal, p.operator, p.portfolio,
        p.monogram, p.mono_color, p.source
      );
    }
    console.log(`[seed] Inserted ${seed.markets.length} markets and ${seed.prospects.length} prospects`);
  });

  seedAll();
}

module.exports = { seedProspects };
