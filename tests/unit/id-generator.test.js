// NOTE: Use ESM imports for vitest, use createRequire for CJS modules
import { describe, it, expect, afterEach } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { createTestDb } = require('../helpers/setup');

describe('id-generator', () => {
  let db, cleanup;

  afterEach(() => { if (cleanup) cleanup(); });

  it('generates OPP-001 for first deal', () => {
    ({ db, cleanup } = createTestDb());
    const { generateDealId } = require('../../src/services/id-generator');
    expect(generateDealId(db)).toBe('OPP-001');
  });

  it('increments sequentially', () => {
    ({ db, cleanup } = createTestDb());
    const { generateDealId } = require('../../src/services/id-generator');
    db.prepare("INSERT INTO deals (id, name, stage) VALUES ('OPP-001', 'First', 'lead')").run();
    expect(generateDealId(db)).toBe('OPP-002');
  });

  it('handles gaps in sequence', () => {
    ({ db, cleanup } = createTestDb());
    const { generateDealId } = require('../../src/services/id-generator');
    db.prepare("INSERT INTO deals (id, name, stage) VALUES ('OPP-005', 'Fifth', 'lead')").run();
    expect(generateDealId(db)).toBe('OPP-006');
  });

  it('generates UUIDs for other entities', () => {
    const { generateId } = require('../../src/services/id-generator');
    const id = generateId();
    expect(id).toMatch(/^[a-f0-9-]{36}$/);
  });
});
