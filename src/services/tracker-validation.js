const LEVELS = ['project', 'task', 'subtask'];
const STATUSES = ['not_started', 'in_progress', 'blocked', 'complete'];

// WHY: ISO 8601 date format YYYY-MM-DD is unambiguous and naturally sortable.
// We validate format strictly to catch typos early.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validates that start and end dates are in ISO format and start <= end.
 * Returns true if valid, false if either date is malformed or chronologically reversed.
 */
function isValidDateRange(start, end) {
  if (!ISO_DATE.test(start) || !ISO_DATE.test(end)) return false;
  return start <= end;
}

/**
 * Validates that the level is one of: project, task, subtask.
 * Returns true if valid, false otherwise.
 */
function isValidLevel(level) {
  return LEVELS.includes(level);
}

/**
 * Validates that the status is one of: not_started, in_progress, blocked, complete.
 * Returns true if valid, false otherwise.
 */
function isValidStatus(status) {
  return STATUSES.includes(status);
}

/**
 * Validates the parent hierarchy constraint for a given level.
 * parentRow is the full row from tracker_items (needs `level` field), or null for top-level.
 *
 * Returns { ok: true } on success, or { ok: false, reason: "..." } on failure.
 *
 * Rules:
 *   - project must have null parent
 *   - task parent must be a project
 *   - subtask parent must be a task
 */
function validateParentForLevel(level, parentRow) {
  if (level === 'project') {
    return parentRow === null
      ? { ok: true }
      : { ok: false, reason: 'projects must have no parent' };
  }
  if (level === 'task') {
    if (!parentRow) return { ok: false, reason: 'task requires a project parent' };
    return parentRow.level === 'project'
      ? { ok: true }
      : { ok: false, reason: `task parent must be a project, got ${parentRow.level}` };
  }
  if (level === 'subtask') {
    if (!parentRow) return { ok: false, reason: 'subtask requires a task parent' };
    return parentRow.level === 'task'
      ? { ok: true }
      : { ok: false, reason: `subtask parent must be a task, got ${parentRow.level}` };
  }
  return { ok: false, reason: `unknown level: ${level}` };
}

/**
 * Trims whitespace and validates length cap.
 * Returns:
 *   null if input is undefined/null
 *   the trimmed string if within the cap
 *   false if the trimmed string exceeds maxLen (signal to caller to return 400)
 *
 * WHY: This helper unifies the pattern of "trim, validate cap, return signal"
 * across all string fields, making it easier to spot over-cap fields and respond with 400.
 */
function trimBounded(value, maxLen) {
  if (value === undefined || value === null) return null;
  const trimmed = String(value).trim();
  if (trimmed.length > maxLen) return false;
  return trimmed;
}

module.exports = {
  LEVELS,
  STATUSES,
  isValidDateRange,
  isValidLevel,
  isValidStatus,
  validateParentForLevel,
  trimBounded,
};
