const crypto = require('crypto');

/**
 * Generates the next sequential deal ID (OPP-001, OPP-002, etc.)
 * Reads the highest existing OPP-XXX from the deals table.
 *
 * WHY: OPP- prefix (opportunity) matches the Accelerate CRM convention
 * used in existing deal docs (OPP-001 = Thesis Hotel, OPP-002 = Moore Miami, etc.)
 * Zero-padded to 3 digits so lexicographic and numeric sort agree up to OPP-999.
 */
function generateDealId(db) {
  const row = db.prepare(
    "SELECT id FROM deals WHERE id LIKE 'OPP-%' ORDER BY CAST(SUBSTR(id, 5) AS INTEGER) DESC LIMIT 1"
  ).get();

  if (!row) return 'OPP-001';

  const num = parseInt(row.id.substring(4), 10);
  return `OPP-${String(num + 1).padStart(3, '0')}`;
}

/**
 * Generates a random UUID v4 for facilities, contacts, challenges, activities.
 *
 * WHY: UUID v4 for non-deal entities avoids sequential IDs that leak record counts
 * and lets us create IDs client-side without a DB round-trip if needed in future.
 */
function generateId() {
  return crypto.randomUUID();
}

module.exports = { generateDealId, generateId };
