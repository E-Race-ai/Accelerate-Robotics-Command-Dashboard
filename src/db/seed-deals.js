const { generateId } = require('../services/id-generator');

/**
 * Seeds the database with existing hotel deals if they don't already exist.
 * Idempotent — safe to run on every boot.
 *
 * db is the { client, one, all, run, transaction } helper bag from database.js.
 */
async function seedDeals(db) {
  const existing = await db.one('SELECT COUNT(*) as c FROM deals');
  const c = Number(existing?.c ?? 0);
  if (c > 0) {
    console.log(`[seed] ${c} deals already exist, skipping seed`);
    return;
  }

  const deals = [
    {
      id: 'OPP-001', name: 'Thesis Hotel Miami',
      facility: { name: 'Thesis Hotel', type: 'hotel', city: 'Miami', state: 'FL', floors: 10, rooms_or_units: 88, elevator_count: 2, elevator_brand: 'ThyssenKrupp', elevator_type: 'traction', surfaces: ['carpet', 'tile'], operator: 'Independent', gm_name: 'Brent Reynolds' },
      stage: 'deploying', source: 'outbound', owner: 'eric@accelerate.com',
    },
    {
      id: 'OPP-002', name: 'Moore Miami',
      facility: { name: 'Moore Miami', type: 'hotel', city: 'Miami', state: 'FL', floors: null, rooms_or_units: null, surfaces: ['hardwood', 'tile'], operator: 'Independent' },
      stage: 'proposed', source: 'referral', owner: 'eric@accelerate.com',
    },
    {
      id: 'OPP-003', name: 'Art Ovation Sarasota',
      facility: { name: 'Art Ovation Hotel', type: 'hotel', city: 'Sarasota', state: 'FL', floors: null, rooms_or_units: 162, surfaces: ['carpet', 'tile'], operator: 'Shaner Hotels', brand: 'Autograph Collection' },
      stage: 'qualified', source: 'outbound', owner: 'eric@accelerate.com',
    },
    {
      id: 'OPP-004', name: 'San Ramon Marriott',
      facility: { name: 'San Ramon Marriott', type: 'hotel', city: 'San Ramon', state: 'CA', surfaces: ['carpet', 'tile'], operator: 'Marriott', brand: 'Marriott' },
      stage: 'lead', source: 'outbound', owner: 'eric@accelerate.com',
    },
    {
      id: 'OPP-005', name: 'Lafayette Park Hotel',
      facility: { name: 'Lafayette Park Hotel', type: 'hotel', city: 'Lafayette', state: 'CA', surfaces: ['carpet', 'hardwood'], operator: 'Independent' },
      stage: 'lead', source: 'outbound', owner: 'eric@accelerate.com',
    },
    {
      id: 'OPP-006', name: 'Claremont Resort',
      facility: { name: 'Claremont Club & Spa', type: 'hotel', city: 'Berkeley', state: 'CA', surfaces: ['carpet', 'tile', 'hardwood'], operator: 'Fairmont' },
      stage: 'lead', source: 'outbound', owner: 'eric@accelerate.com',
    },
    {
      id: 'OPP-007', name: 'Kimpton Sawyer Sacramento',
      facility: { name: 'Kimpton Sawyer Hotel', type: 'hotel', city: 'Sacramento', state: 'CA', address: '500 J St', elevator_type: 'traction', surfaces: ['carpet', 'tile'], operator: 'IHG', brand: 'Kimpton' },
      stage: 'site_walk', source: 'outbound', owner: 'eric@accelerate.com',
    },
    {
      id: 'OPP-008', name: 'Citizen Hotel Sacramento',
      facility: { name: 'The Citizen Hotel', type: 'hotel', city: 'Sacramento', state: 'CA', surfaces: ['carpet', 'tile'], operator: 'Joie de Vivre' },
      stage: 'lead', source: 'outbound', owner: 'eric@accelerate.com',
    },
    {
      id: 'OPP-009', name: 'Westin Sacramento',
      facility: { name: 'The Westin Sacramento', type: 'hotel', city: 'Sacramento', state: 'CA', surfaces: ['carpet', 'tile'], operator: 'HHM', brand: 'Westin' },
      stage: 'lead', source: 'outbound', owner: 'eric@accelerate.com',
    },
  ];

  await db.transaction(async (tx) => {
    for (const d of deals) {
      const fid = generateId();
      const f = d.facility;
      await tx.run(
        `INSERT INTO facilities (id, name, type, address, city, state, country, floors, rooms_or_units,
          elevator_count, elevator_brand, elevator_type, surfaces, operator, brand, gm_name)
         VALUES (?, ?, ?, ?, ?, ?, 'United States', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          fid, f.name, f.type, f.address || null, f.city || null, f.state || null,
          f.floors || null, f.rooms_or_units || null, f.elevator_count || null,
          f.elevator_brand || null, f.elevator_type || null,
          f.surfaces ? JSON.stringify(f.surfaces) : null,
          f.operator || null, f.brand || null, f.gm_name || null,
        ],
      );
      await tx.run(
        'INSERT INTO deals (id, name, facility_id, stage, source, owner) VALUES (?, ?, ?, ?, ?, ?)',
        [d.id, d.name, fid, d.stage, d.source, d.owner],
      );
      await tx.run(
        `INSERT INTO activities (id, deal_id, actor, action, detail)
         VALUES (?, ?, 'system', 'deal_created', '{"source":"seed"}')`,
        [generateId(), d.id],
      );
    }
  });

  console.log(`[seed] Created ${deals.length} deals with facilities`);
}

module.exports = { seedDeals };
