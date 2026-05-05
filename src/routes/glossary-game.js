// Glossary Game — gamification of the team glossary.
//
// Design goals:
//   • Fun: levels, streaks, badges, confetti-worthy moments.
//   • Cheat-resistant: clients never tell the server how many points to award.
//     Every award is keyed off an activity the server can validate (e.g.
//     "I answered question Q7 with choice C" → server checks the stored
//     correct answer and awards 10 pts iff right).
//   • Future-extensible: activity log makes it trivial to webhook to
//     Axomo / Nectar later (thresholds → swag).

const express = require('express');
const crypto = require('crypto');
const db = require('../db/database');
const { requireAuth } = require('../middleware/auth');
const { SECTIONS, FLAT_BY_KEY, ALL_TERM_KEYS } = require('../data/glossary-terms');
const {
  POINTS, LEVELS, BADGES, BADGE_BY_CODE,
  levelForPoints, todayUtcDate, yesterdayUtcDate, shuffle, parseBadges, friendlyName,
} = require('../services/glossary-game-utils');

const router = express.Router();

// ── Quiz session store ───────────────────────────────────────────
// In-memory; sessions live for a few minutes. Session IDs are random so a
// client can't fish for somebody else's quiz answers.
const QUIZ_SESSIONS = new Map(); // session_id → { user_email, questions: [{ q_id, term_key, correct_choice_id, choices, answered, was_correct }], created_at }
const SESSION_TTL_MS = 10 * 60 * 1000; // 10 minutes; quizzes take 1-2 mins normally

function gcSessions() {
  const cutoff = Date.now() - SESSION_TTL_MS;
  for (const [id, s] of QUIZ_SESSIONS) if (s.created_at < cutoff) QUIZ_SESSIONS.delete(id);
}
setInterval(gcSessions, 60 * 1000).unref();

// ── Helpers ──────────────────────────────────────────────────────
async function getOrCreateProgress(email, displayName) {
  const row = await db.one('SELECT * FROM glossary_user_progress WHERE user_email = ?', [email]);
  if (row) return row;
  await db.run(
    'INSERT INTO glossary_user_progress (user_email, display_name) VALUES (?, ?)',
    [email, displayName || email],
  );
  return db.one('SELECT * FROM glossary_user_progress WHERE user_email = ?', [email]);
}

async function logActivity(email, activity, points, metadata) {
  await db.run(
    'INSERT INTO glossary_activities (user_email, activity, points, metadata) VALUES (?, ?, ?, ?)',
    [email, activity, points, metadata ? JSON.stringify(metadata) : null],
  );
}

// Apply a streak update and return the streak-day bonus points (0 if already
// counted today). Also updates last_active_date and the streaks themselves.
async function applyStreak(email) {
  const row = await db.one('SELECT current_streak, longest_streak, last_active_date FROM glossary_user_progress WHERE user_email = ?', [email]);
  const today = todayUtcDate();
  if (row.last_active_date === today) return 0; // already counted today
  let newStreak;
  if (!row.last_active_date) {
    newStreak = 1;
  } else {
    newStreak = row.last_active_date === yesterdayUtcDate() ? (row.current_streak + 1) : 1;
  }
  const newLongest = Math.max(row.longest_streak, newStreak);
  await db.run(
    `UPDATE glossary_user_progress
       SET current_streak = ?, longest_streak = ?, last_active_date = ?, updated_at = datetime('now')
     WHERE user_email = ?`,
    [newStreak, newLongest, today, email],
  );
  return POINTS.STREAK_DAY;
}

// Award points + return what badges/level changes happened so the client can celebrate.
async function awardPoints(email, points, activity, metadata) {
  if (points <= 0) return { points, level_changed: false, new_badges: [] };

  const before = await db.one('SELECT total_points, level, quizzes_completed, perfect_quizzes, badges, current_streak FROM glossary_user_progress WHERE user_email = ?', [email]);
  const beforePoints = before.total_points;
  const beforeLevel = levelForPoints(beforePoints).level;
  const afterPoints = beforePoints + points;
  const afterLevel  = levelForPoints(afterPoints).level;

  await db.run(
    `UPDATE glossary_user_progress
       SET total_points = ?, level = ?, updated_at = datetime('now')
     WHERE user_email = ?`,
    [afterPoints, afterLevel, email],
  );
  await logActivity(email, activity, points, metadata);

  // Each level crossed grants a one-time bonus.
  let bonusFromLevelUps = 0;
  for (let lv = beforeLevel + 1; lv <= afterLevel; lv++) bonusFromLevelUps += POINTS.LEVEL_UP_BONUS;
  if (bonusFromLevelUps > 0) {
    const finalTotal = afterPoints + bonusFromLevelUps;
    await db.run('UPDATE glossary_user_progress SET total_points = ? WHERE user_email = ?', [finalTotal, email]);
    await logActivity(email, 'level_up_bonus', bonusFromLevelUps, { from: beforeLevel, to: afterLevel });
  }

  return {
    awarded: points + bonusFromLevelUps,
    level_changed: afterLevel !== beforeLevel,
    from_level: beforeLevel,
    to_level: afterLevel,
  };
}

async function maybeGrantBadges(email, ctx) {
  const row = await db.one('SELECT total_points, level, current_streak, quizzes_completed, perfect_quizzes, badges FROM glossary_user_progress WHERE user_email = ?', [email]);
  const have = new Set(parseBadges(row.badges));
  const newly = [];

  const grant = (code) => { if (!have.has(code)) { have.add(code); newly.push(code); } };

  if (ctx.justFinishedQuiz)                       grant('first_steps');
  if (ctx.justScoredPerfect)                      grant('perfect_score');
  if (row.current_streak >= 5)                    grant('on_fire');
  if ((row.perfect_quizzes || 0) >= 3 && ctx.recentEightPlus) grant('sharpshooter'); // approximation: any 3 perfects covers it
  if (row.level >= 5)                             grant('all_star');
  if (row.level >= 8)                             grant('glossary_goat');

  if (newly.length) {
    await db.run(
      `UPDATE glossary_user_progress SET badges = ?, updated_at = datetime('now') WHERE user_email = ?`,
      [JSON.stringify(Array.from(have)), email],
    );
    for (const code of newly) await logActivity(email, 'badge_earned', 0, { code });
  }
  return newly.map(c => BADGE_BY_CODE[c]).filter(Boolean);
}

// ── Routes ───────────────────────────────────────────────────────

// GET /me — my stats. Lazily creates a progress row for first-time users.
router.get('/me', requireAuth, async (req, res) => {
  try {
    const email = req.admin?.email || 'anon@local';
    await getOrCreateProgress(email, req.admin?.email);
    const row = await db.one('SELECT * FROM glossary_user_progress WHERE user_email = ?', [email]);
    const lvl = levelForPoints(row.total_points);
    const recent = await db.all(
      `SELECT activity, points, metadata, created_at FROM glossary_activities
       WHERE user_email = ? ORDER BY created_at DESC LIMIT 8`,
      [email],
    );
    res.json({
      me: {
        email: row.user_email,
        display_name: friendlyName(row.display_name || row.user_email),
        total_points: row.total_points,
        ...lvl,
        current_streak: row.current_streak,
        longest_streak: row.longest_streak,
        last_active_date: row.last_active_date,
        quizzes_completed: row.quizzes_completed,
        perfect_quizzes: row.perfect_quizzes,
        badges: parseBadges(row.badges).map(c => BADGE_BY_CODE[c]).filter(Boolean),
        recent: recent.map(r => ({ ...r, metadata: r.metadata ? JSON.parse(r.metadata) : null })),
      },
      badges_catalog: BADGES,
      levels: LEVELS,
      points_table: POINTS,
    });
  } catch (err) {
    console.error('[glossary-game] /me failed:', err);
    res.status(500).json({ error: 'Failed to load progress' });
  }
});

// GET /leaderboard — top 10 by points. Returns lightweight rows; no PII beyond email.
router.get('/leaderboard', requireAuth, async (_req, res) => {
  try {
    const rows = await db.all(
      `SELECT user_email, display_name, total_points, level, current_streak, longest_streak, badges
       FROM glossary_user_progress
       WHERE total_points > 0
       ORDER BY total_points DESC, longest_streak DESC, user_email ASC
       LIMIT 10`,
      [],
    );
    // Team-wide stats for the game header — shows momentum even when only a
    // few players are on the board.
    const team = await db.one(
      `SELECT COUNT(*) AS players, COALESCE(SUM(total_points), 0) AS total_points
       FROM glossary_user_progress WHERE total_points > 0`,
      [],
    );
    res.json({
      players: rows.map((r, i) => {
        const lvl = levelForPoints(r.total_points);
        return {
          rank: i + 1,
          email: r.user_email,
          display_name: friendlyName(r.display_name || r.user_email),
          total_points: r.total_points,
          level: lvl.level,
          title: lvl.title,
          current_streak: r.current_streak,
          longest_streak: r.longest_streak,
          badge_count: parseBadges(r.badges).length,
        };
      }),
      team: {
        players: Number(team?.players || 0),
        total_points: Number(team?.total_points || 0),
      },
    });
  } catch (err) {
    console.error('[glossary-game] leaderboard failed:', err);
    res.status(500).json({ error: 'Failed to load leaderboard' });
  }
});

// POST /quiz/start — body: { count?: 10, sectionId?: 'git' | null }
// Returns { session_id, questions: [{ q_id, prompt_term, choices: [{ id, text }] }] }
router.post('/quiz/start', requireAuth, async (req, res) => {
  const email = req.admin?.email || 'anon@local';
  await getOrCreateProgress(email, req.admin?.email);

  const requestedCount = Number(req.body?.count) || 10;
  const count = Math.max(3, Math.min(15, requestedCount));
  const sectionId = req.body?.sectionId || null;

  // Pool of term keys to draw from.
  const pool = sectionId
    ? (SECTIONS.find(s => s.id === sectionId)?.terms || []).map(t => t.term.toLowerCase().trim())
    : ALL_TERM_KEYS;

  if (pool.length < 4) return res.status(400).json({ error: 'Not enough terms in this section to run a quiz' });

  const picked = shuffle(pool).slice(0, Math.min(count, pool.length));
  const questions = picked.map((termKey, i) => {
    const correct = FLAT_BY_KEY[termKey];
    // 3 distractors: pull random other terms (preferring same section if possible).
    const candidates = ALL_TERM_KEYS.filter(k => k !== termKey);
    const distractorKeys = shuffle(candidates).slice(0, 3);
    const choices = shuffle([
      { id: 'c1', text: correct.body, _correct: true,  _termKey: termKey },
      ...distractorKeys.map((k, idx) => ({ id: `d${idx + 1}`, text: FLAT_BY_KEY[k].body, _correct: false, _termKey: k })),
    ]).map((c, idx) => ({ ...c, id: ['c1', 'c2', 'c3', 'c4'][idx] }));

    return {
      q_id: `q${i + 1}`,
      term: correct.term,
      term_alias: correct.alias || null,
      section_label: correct.sectionLabel,
      choices,
    };
  });

  // Snapshot the user's total at session start so /finish can precisely
  // compute "what did this run award me, including level-up bonuses?"
  // without us having to itemize every cascade by hand.
  const startSnap = await db.one('SELECT total_points, level FROM glossary_user_progress WHERE user_email = ?', [email]);
  const session_id = crypto.randomBytes(16).toString('hex');
  QUIZ_SESSIONS.set(session_id, {
    user_email: email,
    questions: questions.map(q => ({ q_id: q.q_id, term: q.term, correct_id: q.choices.find(c => c._correct).id, answered: false, was_correct: false })),
    points_at_start: startSnap?.total_points || 0,
    level_at_start: startSnap?.level || 1,
    created_at: Date.now(),
  });

  // Strip the _correct hint before sending.
  const safeQuestions = questions.map(q => ({
    q_id: q.q_id,
    term: q.term,
    term_alias: q.term_alias,
    section_label: q.section_label,
    choices: q.choices.map(c => ({ id: c.id, text: c.text })),
  }));

  res.json({ session_id, questions: safeQuestions, count: safeQuestions.length });
});

// POST /quiz/answer — body: { session_id, q_id, choice_id }
// Returns { correct, correct_choice_id, awarded_points, progress_so_far }
router.post('/quiz/answer', requireAuth, async (req, res) => {
  const email = req.admin?.email || 'anon@local';
  const { session_id, q_id, choice_id } = req.body || {};
  const session = QUIZ_SESSIONS.get(session_id);
  if (!session)                          return res.status(404).json({ error: 'Quiz session not found or expired' });
  if (session.user_email !== email)      return res.status(403).json({ error: 'Not your quiz session' });

  const q = session.questions.find(x => x.q_id === q_id);
  if (!q)        return res.status(404).json({ error: 'question not found in session' });
  if (q.answered) return res.status(400).json({ error: 'question already answered' });

  q.answered = true;
  q.was_correct = (choice_id === q.correct_id);

  let awarded = 0;
  if (q.was_correct) {
    awarded = POINTS.QUIZ_CORRECT;
    await awardPoints(email, awarded, 'quiz_correct', { session_id, q_id, term: q.term });
  }

  const answered_count = session.questions.filter(x => x.answered).length;
  const correct_count  = session.questions.filter(x => x.was_correct).length;

  res.json({
    correct: q.was_correct,
    correct_choice_id: q.correct_id,
    awarded_points: awarded,
    answered: answered_count,
    correct_so_far: correct_count,
    total: session.questions.length,
  });
});

// POST /quiz/finish — body: { session_id }
// Awards completion + perfect bonuses, updates streak, grants badges.
router.post('/quiz/finish', requireAuth, async (req, res) => {
  const email = req.admin?.email || 'anon@local';
  const { session_id } = req.body || {};
  const session = QUIZ_SESSIONS.get(session_id);
  if (!session)                     return res.status(404).json({ error: 'Quiz session not found or expired' });
  if (session.user_email !== email) return res.status(403).json({ error: 'Not your quiz session' });

  const total = session.questions.length;
  const correct = session.questions.filter(q => q.was_correct).length;
  const isPerfect = correct === total && total > 0;

  // Completion bonus (always).
  const completion = await awardPoints(email, POINTS.QUIZ_COMPLETED, 'quiz_completed', { session_id, correct, total });
  let perfect = null;
  if (isPerfect) perfect = await awardPoints(email, POINTS.QUIZ_PERFECT, 'quiz_perfect', { session_id });

  // Counter bumps.
  await db.run(
    `UPDATE glossary_user_progress
       SET quizzes_completed = quizzes_completed + 1,
           perfect_quizzes = perfect_quizzes + ?,
           updated_at = datetime('now')
     WHERE user_email = ?`,
    [isPerfect ? 1 : 0, email],
  );

  // Daily streak bonus (only on first quiz of the day).
  const streakAwarded = await applyStreak(email);
  if (streakAwarded > 0) await awardPoints(email, streakAwarded, 'streak_day', { date: todayUtcDate() });

  const newBadges = await maybeGrantBadges(email, {
    justFinishedQuiz: true,
    justScoredPerfect: isPerfect,
    recentEightPlus: correct >= 8,
  });

  // Fresh stats for the result screen.
  const final = await db.one('SELECT total_points, current_streak, longest_streak FROM glossary_user_progress WHERE user_email = ?', [email]);
  const lvl = levelForPoints(final.total_points);

  // Whole-run accounting: by snapshotting points_at_start in /quiz/start, we
  // can compute exactly what this run awarded — including any level-up
  // bonuses that cascaded from per-correct, completion, perfect, or streak
  // awards. Anything not categorized falls into level_up_bonus.
  const totalAwarded = final.total_points - (session.points_at_start || 0);
  const perCorrectTotal = correct * POINTS.QUIZ_CORRECT;
  const completionAmt = POINTS.QUIZ_COMPLETED;
  const perfectAmt = isPerfect ? POINTS.QUIZ_PERFECT : 0;
  const streakAmt = streakAwarded;
  const itemized = perCorrectTotal + completionAmt + perfectAmt + streakAmt;
  const levelUpBonus = Math.max(0, totalAwarded - itemized);
  const leveledUp = lvl.level !== (session.level_at_start || 1);

  // Cleanup the session — quiz is over.
  QUIZ_SESSIONS.delete(session_id);

  res.json({
    correct,
    total,
    perfect: isPerfect,
    awarded: {
      per_correct_total: perCorrectTotal,
      completion: completionAmt,
      perfect_bonus: perfectAmt,
      streak: streakAmt,
      level_up_bonus: levelUpBonus,
      total: totalAwarded,
    },
    new_badges: newBadges,
    leveled_up: leveledUp,
    from_level: session.level_at_start || 1,
    me: {
      total_points: final.total_points,
      ...lvl,
      current_streak: final.current_streak,
      longest_streak: final.longest_streak,
    },
  });
});

module.exports = router;
