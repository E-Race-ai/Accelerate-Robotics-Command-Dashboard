import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  isValidDateRange,
  isValidLevel,
  isValidStatus,
  validateParentForLevel,
  trimBounded,
} = require('../../src/services/tracker-validation');

describe('tracker-validation', () => {
  describe('isValidDateRange', () => {
    it('accepts equal dates', () => {
      expect(isValidDateRange('2026-04-22', '2026-04-22')).toBe(true);
    });
    it('accepts start before end', () => {
      expect(isValidDateRange('2026-04-22', '2026-05-13')).toBe(true);
    });
    it('rejects end before start', () => {
      expect(isValidDateRange('2026-05-13', '2026-04-22')).toBe(false);
    });
    it('rejects non-date strings', () => {
      expect(isValidDateRange('not-a-date', '2026-04-22')).toBe(false);
    });
  });

  describe('isValidLevel', () => {
    it('accepts project, task, subtask', () => {
      expect(isValidLevel('project')).toBe(true);
      expect(isValidLevel('task')).toBe(true);
      expect(isValidLevel('subtask')).toBe(true);
    });
    it('rejects anything else', () => {
      expect(isValidLevel('sprint')).toBe(false);
      expect(isValidLevel('')).toBe(false);
      expect(isValidLevel(undefined)).toBe(false);
    });
  });

  describe('isValidStatus', () => {
    it('accepts the four statuses', () => {
      expect(isValidStatus('not_started')).toBe(true);
      expect(isValidStatus('in_progress')).toBe(true);
      expect(isValidStatus('blocked')).toBe(true);
      expect(isValidStatus('complete')).toBe(true);
    });
    it('rejects done (we renamed it)', () => {
      expect(isValidStatus('done')).toBe(false);
    });
  });

  describe('validateParentForLevel', () => {
    it('project must have null parent', () => {
      expect(validateParentForLevel('project', null)).toEqual({ ok: true });
      expect(validateParentForLevel('project', { level: 'project' }).ok).toBe(false);
    });
    it('task parent must be project', () => {
      expect(validateParentForLevel('task', { level: 'project' })).toEqual({ ok: true });
      expect(validateParentForLevel('task', null).ok).toBe(false);
      expect(validateParentForLevel('task', { level: 'task' }).ok).toBe(false);
    });
    it('subtask parent must be task', () => {
      expect(validateParentForLevel('subtask', { level: 'task' })).toEqual({ ok: true });
      expect(validateParentForLevel('subtask', { level: 'project' }).ok).toBe(false);
      expect(validateParentForLevel('subtask', null).ok).toBe(false);
    });
  });

  describe('trimBounded', () => {
    it('returns null for undefined', () => {
      expect(trimBounded(undefined, 10)).toBeNull();
    });
    it('trims whitespace', () => {
      expect(trimBounded('  hi  ', 10)).toBe('hi');
    });
    it('rejects strings over the cap', () => {
      expect(trimBounded('a'.repeat(11), 10)).toBe(false);
    });
  });
});
