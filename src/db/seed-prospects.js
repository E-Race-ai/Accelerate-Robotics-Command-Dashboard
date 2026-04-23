const fs = require('fs');
const path = require('path');

/**
 * Seed markets and prospects tables from seed data if they are empty.
 * Idempotent — only runs INSERTs when the prospects table is empty.
 * db is the { client, one, all, run, transaction } helper bag from database.js.
 */
async function seedProspects(db) {
  const seedPath = path.join(__dirname, '..', '..', 'data', 'seed-prospects.json');
  if (!fs.existsSync(seedPath)) {
    console.warn('[seed] No seed-prospects.json found — skipping prospect seeding');
    return;
  }

  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

  const countRow = await db.one('SELECT COUNT(*) as n FROM prospects');
  const n = Number(countRow?.n ?? 0);
  if (n === 0) {
    await db.transaction(async (tx) => {
      for (const m of seed.markets) {
        await tx.run(
          `INSERT OR IGNORE INTO markets (id, name, cluster, color, lat, lng)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [m.id, m.name, m.cluster, m.color, m.lat || null, m.lng || null],
        );
      }
      for (const p of seed.prospects) {
        await tx.run(
          `INSERT INTO prospects (market_id, status, name, address, brand, brand_class,
             keys, floors, stars, signal, operator, portfolio, monogram, mono_color, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [p.market_id, p.status, p.name, p.address, p.brand, p.brand_class,
           p.keys, p.floors, p.stars, p.signal, p.operator, p.portfolio,
           p.monogram, p.mono_color, p.source],
        );
      }
    });
    console.log(`[seed] Inserted ${seed.markets.length} markets and ${seed.prospects.length} prospects`);
  }

  // Backfill coordinates for markets seeded before lat/lng existed. Only updates where lat IS NULL.
  for (const m of seed.markets) {
    if (m.lat != null && m.lng != null) {
      await db.run('UPDATE markets SET lat = ?, lng = ? WHERE id = ? AND lat IS NULL', [m.lat, m.lng, m.id]);
    }
  }
}

module.exports = { seedProspects };
