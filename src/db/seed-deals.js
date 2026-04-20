const { generateId } = require('../services/id-generator');

/**
 * Seeds the database with existing hotel deals if they don't already exist.
 * Idempotent — safe to run on every boot.
 *
 * WHY: db is passed in rather than required here to avoid a circular dependency —
 * database.js calls seedDeals(), and if seed-deals.js required database.js at
 * module load time, Node would return the partially-constructed module (before
 * module.exports = db runs), making db undefined.
 */
function seedDeals(db) {
  const existingCount = db.prepare('SELECT COUNT(*) as c FROM deals').get().c;
  if (existingCount > 0) {
    console.log(`[seed] ${existingCount} deals already exist, skipping seed`);
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

  const insertFacility = db.prepare(`
    INSERT INTO facilities (id, name, type, address, city, state, country, floors, rooms_or_units,
      elevator_count, elevator_brand, elevator_type, surfaces, operator, brand, gm_name)
    VALUES (?, ?, ?, ?, ?, ?, 'United States', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertDeal = db.prepare(`
    INSERT INTO deals (id, name, facility_id, stage, source, owner)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertActivity = db.prepare(`
    INSERT INTO activities (id, deal_id, actor, action, detail)
    VALUES (?, ?, 'system', 'deal_created', '{"source":"seed"}')
  `);

  const seedAll = db.transaction(() => {
    for (const d of deals) {
      const fid = generateId();
      const f = d.facility;
      insertFacility.run(
        fid, f.name, f.type, f.address || null, f.city || null, f.state || null,
        f.floors || null, f.rooms_or_units || null, f.elevator_count || null,
        f.elevator_brand || null, f.elevator_type || null,
        f.surfaces ? JSON.stringify(f.surfaces) : null,
        f.operator || null, f.brand || null, f.gm_name || null
      );
      insertDeal.run(d.id, d.name, fid, d.stage, d.source, d.owner);
      insertActivity.run(generateId(), d.id);
    }
  });

  seedAll();
  console.log(`[seed] Created ${deals.length} deals with facilities`);
}

module.exports = { seedDeals };
