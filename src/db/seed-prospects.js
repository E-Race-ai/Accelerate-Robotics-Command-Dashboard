const fs = require('fs');
const path = require('path');

/**
 * Seed markets and prospects tables from seed data if they are empty.
 * Idempotent — only runs INSERTs when the prospects table is empty.
 * Accepts the db helper object ({ pool, one, all, run }) to avoid circular requires.
 */
async function seedProspects(db) {
  const seedPath = path.join(__dirname, '..', '..', 'data', 'seed-prospects.json');
  if (!fs.existsSync(seedPath)) {
    console.warn('[seed] No seed-prospects.json found — skipping prospect seeding');
    return;
  }

  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

  const countRow = await db.one('SELECT COUNT(*)::int AS n FROM prospects');
  if (countRow && countRow.n === 0) {
    const client = await db.pool.connect();
    try {
      await client.query('BEGIN');
      for (const m of seed.markets) {
        await client.query(
          `INSERT INTO markets (id, name, cluster, color, lat, lng)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING`,
          [m.id, m.name, m.cluster, m.color, m.lat || null, m.lng || null],
        );
      }
      for (const p of seed.prospects) {
        await client.query(
          `INSERT INTO prospects (market_id, status, name, address, brand, brand_class,
             keys, floors, stars, signal, operator, portfolio, monogram, mono_color, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
          [p.market_id, p.status, p.name, p.address, p.brand, p.brand_class,
           p.keys, p.floors, p.stars, p.signal, p.operator, p.portfolio,
           p.monogram, p.mono_color, p.source],
        );
      }
      await client.query('COMMIT');
      console.log(`[seed] Inserted ${seed.markets.length} markets and ${seed.prospects.length} prospects`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // Backfill lat/lng for markets seeded before coordinates existed.
  for (const m of seed.markets) {
    if (m.lat != null && m.lng != null) {
      await db.run('UPDATE markets SET lat = $1, lng = $2 WHERE id = $3 AND lat IS NULL', [m.lat, m.lng, m.id]);
    }
  }
}

module.exports = { seedProspects };
