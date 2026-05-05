// Pure helpers for the Glossary Game route — no DB dependency, so unit tests
// can require them directly without bootstrapping libsql/Turso.

// Tunable game economy. Changes here affect saved totals — agree with the
// team before shipping.
const POINTS = {
  QUIZ_CORRECT:    10,    // each correct answer
  QUIZ_COMPLETED:  20,    // for finishing a quiz at all
  QUIZ_PERFECT:    50,    // bonus on top of the 10/answer for 10/10
  STREAK_DAY:      25,    // awarded once per day on first activity
  LEVEL_UP_BONUS: 100,    // extra each time a level threshold is crossed
};

// Levels — cumulative point thresholds, ~2x growth so progression is fast
// early and slows for long-haul engagement. Titles are intentionally playful.
const LEVELS = [
  { level: 1, title: 'Newbie Hacker',     min: 0    },
  { level: 2, title: 'Code Curious',      min: 50   },
  { level: 3, title: 'Branch Explorer',   min: 150  },
  { level: 4, title: 'Pull Request Pal',  min: 350  },
  { level: 5, title: 'Commit Crafter',    min: 700  },
  { level: 6, title: 'Merge Master',      min: 1500 },
  { level: 7, title: 'DevOps Wizard',     min: 3000 },
  { level: 8, title: 'Code Sensei',       min: 6000 },
];

const BADGES = [
  { code: 'first_steps',   label: 'First Steps',   emoji: '🆕', desc: 'Completed your first quiz' },
  { code: 'perfect_score', label: 'Perfect Score', emoji: '💯', desc: 'Got 10/10 on a quiz' },
  { code: 'on_fire',       label: 'On Fire',       emoji: '🔥', desc: 'Hit a 5-day streak' },
  { code: 'sharpshooter',  label: 'Sharpshooter',  emoji: '🎯', desc: '3 quizzes in a row with 8+/10' },
  { code: 'all_star',      label: 'All-Star',      emoji: '🌟', desc: 'Reached level 5' },
  { code: 'glossary_goat', label: 'Glossary GOAT', emoji: '👑', desc: 'Reached level 8' },
];
const BADGE_BY_CODE = Object.fromEntries(BADGES.map(b => [b.code, b]));

function levelForPoints(points) {
  let current = LEVELS[0];
  for (const l of LEVELS) if (points >= l.min) current = l;
  const next = LEVELS.find(l => l.min > points);
  return {
    level: current.level,
    title: current.title,
    points_total: points,
    next_title: next ? next.title : null,
    next_level_at: next ? next.min : null,
    progress_to_next: next ? Math.max(0, Math.min(1, (points - current.min) / (next.min - current.min))) : 1,
  };
}

function todayUtcDate() {
  // YYYY-MM-DD, server-UTC. Streak granularity is 1 day; we accept the small
  // late-night/timezone fuzziness in exchange for not needing per-user timezones.
  return new Date().toISOString().slice(0, 10);
}

function yesterdayUtcDate() {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// Fisher-Yates. Avoids the bias of arr.sort(() => Math.random() - 0.5).
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function parseBadges(json) {
  try { const arr = JSON.parse(json || '[]'); return Array.isArray(arr) ? arr : []; }
  catch { return []; }
}

// Friendly-name parser. Turns "claude.e.race@atlasmobility.com" → "Claude R.",
// "eric@accelerate.com" → "Eric", "dev@accelerate.com" → "Dev". Used when the
// user hasn't set an explicit display_name — keeps the leaderboard human.
//
// WHY this and not just the local-part: leaderboard rows of "claude.e.race"
// next to "eric.race" look spammy. First-name-plus-last-initial is the
// convention people read effortlessly.
function friendlyName(emailOrName) {
  if (!emailOrName) return 'Anonymous';
  const raw = String(emailOrName).trim();
  // Already a real name (has a space, no @): pass through.
  if (raw.includes(' ') && !raw.includes('@')) return raw;
  const local = raw.split('@')[0] || raw;
  const parts = local.split(/[._\-]+/).filter(Boolean);
  if (parts.length === 0) return 'Anonymous';
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
  if (parts.length === 1) return cap(parts[0]);
  // First + last-initial. Skip middle tokens (initials, etc.).
  return `${cap(parts[0])} ${cap(parts[parts.length - 1]).charAt(0)}.`;
}

module.exports = {
  POINTS, LEVELS, BADGES, BADGE_BY_CODE,
  levelForPoints, todayUtcDate, yesterdayUtcDate, shuffle, parseBadges, friendlyName,
};
