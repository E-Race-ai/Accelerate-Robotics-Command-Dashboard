// Enterprise Risk Management — CEO's living register.
//
// Endpoints:
//   GET    /api/risk-management/risks               list all risks
//   GET    /api/risk-management/risks/:id           single risk + history
//   POST   /api/risk-management/risks               create
//   PATCH  /api/risk-management/risks/:id           partial update
//   DELETE /api/risk-management/risks/:id           soft = status='closed'
//   POST   /api/risk-management/risks/:id/review    log a review touchpoint
//   GET    /api/risk-management/dashboard           dashboard rollup (heat
//                                                   map cells + top risks +
//                                                   alerts)
//
// Score = likelihood × impact. We compute server-side so the client always
// gets a consistent value. Threshold bands:
//    1–4   low      ░  monitor
//    5–9   moderate ▒  own + mitigate
//    10–15 high     ▓  active mitigation, weekly review
//    16–25 critical █  daily watch
//
// The history table records every score change; we use it to surface
// trend arrows (rising / stable / falling) and the per-risk sparkline.

const express = require('express');
const db = require('../db/database');
const router = express.Router();

const ALLOWED_CATEGORY = new Set([
  'strategic','operational','financial','technology',
  'regulatory','people','legal','reputation',
]);
const ALLOWED_STATUS = new Set(['open','mitigating','monitored','closed']);
const ALLOWED_TREND  = new Set(['rising','stable','falling']);

function clampScore(n) {
  const v = Number(n);
  return Math.max(1, Math.min(5, Math.round(v)));
}

function bandForScore(score) {
  if (score >= 16) return 'critical';
  if (score >= 10) return 'high';
  if (score >= 5)  return 'moderate';
  return 'low';
}

function shapeRisk(row) {
  if (!row) return null;
  const inherentScore = row.inherent_likelihood * row.inherent_impact;
  const residualScore = row.residual_likelihood * row.residual_impact;
  return {
    id: row.id,
    category: row.category,
    title: row.title,
    description: row.description,
    inherent: {
      likelihood: row.inherent_likelihood,
      impact: row.inherent_impact,
      score: inherentScore,
      band: bandForScore(inherentScore),
    },
    residual: {
      likelihood: row.residual_likelihood,
      impact: row.residual_impact,
      score: residualScore,
      band: bandForScore(residualScore),
    },
    delta: inherentScore - residualScore, // value of mitigations
    mitigation: row.mitigation,
    owner: row.owner,
    status: row.status,
    trend: row.trend,
    review_cadence_days: row.review_cadence_days,
    last_reviewed_at: row.last_reviewed_at,
    next_review_due: row.next_review_due,
    is_overdue: row.next_review_due
      ? new Date(row.next_review_due) < new Date()
      : false,
    linked_metrics: safeJSON(row.linked_metrics) || [],
    tags: safeJSON(row.tags) || [],
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function safeJSON(s) {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

// ── List + dashboard ──────────────────────────────────────────────
router.get('/risks', async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT * FROM risk_register
       ORDER BY (residual_likelihood * residual_impact) DESC, updated_at DESC`,
      [],
    );
    res.json({ risks: rows.map(shapeRisk) });
  } catch (err) {
    console.error('[risk] list failed:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/risks/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
  try {
    const risk = await db.one('SELECT * FROM risk_register WHERE id = ?', [id]);
    if (!risk) return res.status(404).json({ error: 'risk not found' });
    const history = await db.all(
      'SELECT residual_likelihood, residual_impact, residual_score, note, changed_by, changed_at FROM risk_history WHERE risk_id = ? ORDER BY changed_at DESC LIMIT 50',
      [id],
    );
    res.json({ risk: shapeRisk(risk), history });
  } catch (err) {
    console.error('[risk] get failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Dashboard rollup — heat-map cells + alerts in one fetch ──────
// WHY one endpoint: the dashboard renders all of this at once, and a
// single SQL pass means we don't ship 19+ rows of risk data three
// times for three separate panels.
router.get('/dashboard', async (req, res) => {
  try {
    const rows = await db.all('SELECT * FROM risk_register WHERE status != \'closed\'', []);
    const risks = rows.map(shapeRisk);

    // 5×5 heat-map cells, keyed by `${likelihood}-${impact}` → array of risks
    const heatmap = {};
    for (const r of risks) {
      const key = `${r.residual.likelihood}-${r.residual.impact}`;
      if (!heatmap[key]) heatmap[key] = [];
      heatmap[key].push({ id: r.id, title: r.title, category: r.category, score: r.residual.score, band: r.residual.band });
    }

    // Top 5 by residual score
    const top = [...risks].sort((a, b) => b.residual.score - a.residual.score).slice(0, 5);

    // Alerts: anything overdue for review, anything rising trend, anything critical band
    const alerts = [];
    for (const r of risks) {
      if (r.is_overdue) alerts.push({ kind: 'overdue', risk_id: r.id, title: r.title, due: r.next_review_due });
      if (r.trend === 'rising' && r.residual.score >= 10) alerts.push({ kind: 'escalating', risk_id: r.id, title: r.title, score: r.residual.score });
      if (r.residual.band === 'critical') alerts.push({ kind: 'critical', risk_id: r.id, title: r.title, score: r.residual.score });
    }

    // Category rollup
    const byCategory = {};
    for (const r of risks) {
      if (!byCategory[r.category]) byCategory[r.category] = { count: 0, sum: 0, max: 0 };
      byCategory[r.category].count++;
      byCategory[r.category].sum += r.residual.score;
      byCategory[r.category].max = Math.max(byCategory[r.category].max, r.residual.score);
    }
    for (const k of Object.keys(byCategory)) {
      byCategory[k].avg = +(byCategory[k].sum / byCategory[k].count).toFixed(1);
    }

    // Stats
    const total = risks.length;
    const critical = risks.filter(r => r.residual.band === 'critical').length;
    const high = risks.filter(r => r.residual.band === 'high').length;
    const overdue = risks.filter(r => r.is_overdue).length;
    const avgScore = total ? +(risks.reduce((s, r) => s + r.residual.score, 0) / total).toFixed(1) : 0;
    const totalMitigationValue = risks.reduce((s, r) => s + r.delta, 0);

    // Action rollup — joined in so the dashboard can render the action
    // strip + per-risk action counts without a second fetch.
    let actionStats = { open_total: 0, in_progress: 0, overdue: 0, due_this_week: 0, high_priority: 0 };
    let actionsByRisk = {};
    try {
      const today = new Date().toISOString().slice(0, 10);
      const weekOut = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
      const aRows = await db.all(
        `SELECT id, risk_id, status, priority, due_date FROM risk_mitigation_actions WHERE status != 'done'`,
        [],
      );
      for (const a of aRows) {
        actionStats.open_total++;
        if (a.status === 'in_progress') actionStats.in_progress++;
        if (a.priority === 'high') actionStats.high_priority++;
        if (a.due_date && a.due_date < today) actionStats.overdue++;
        else if (a.due_date && a.due_date <= weekOut) actionStats.due_this_week++;
        if (!actionsByRisk[a.risk_id]) actionsByRisk[a.risk_id] = { open: 0, overdue: 0 };
        actionsByRisk[a.risk_id].open++;
        if (a.due_date && a.due_date < today) actionsByRisk[a.risk_id].overdue++;
      }
    } catch (e) {
      // table might not exist yet on first boot — silent fallback to zeroes
      console.warn('[risk] action stats fallback:', e.message);
    }
    // Attach per-risk action counts to the risks array
    for (const r of risks) {
      r.actions = actionsByRisk[r.id] || { open: 0, overdue: 0 };
    }

    res.json({
      generated_at: new Date().toISOString(),
      stats: { total, critical, high, overdue, avg_score: avgScore, mitigation_value: totalMitigationValue },
      action_stats: actionStats,
      heatmap,
      top,
      alerts,
      by_category: byCategory,
      risks, // full list — page can filter client-side
    });
  } catch (err) {
    console.error('[risk] dashboard failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Create ────────────────────────────────────────────────────────
router.post('/risks', async (req, res) => {
  const b = req.body || {};
  if (!b.title || typeof b.title !== 'string') return res.status(400).json({ error: 'title required' });
  if (!ALLOWED_CATEGORY.has(b.category)) return res.status(400).json({ error: 'invalid category' });

  try {
    const r = await db.run(
      `INSERT INTO risk_register
        (category, title, description,
         inherent_likelihood, inherent_impact,
         residual_likelihood, residual_impact,
         mitigation, owner, status, trend,
         review_cadence_days, last_reviewed_at, next_review_due,
         linked_metrics, tags)
       VALUES (?,?,?, ?,?, ?,?, ?,?,?,?, ?,?,?, ?,?)`,
      [
        b.category, b.title.slice(0, 200), b.description ? String(b.description).slice(0, 4000) : null,
        clampScore(b.inherent_likelihood ?? 3), clampScore(b.inherent_impact ?? 3),
        clampScore(b.residual_likelihood ?? b.inherent_likelihood ?? 3),
        clampScore(b.residual_impact ?? b.inherent_impact ?? 3),
        b.mitigation ? String(b.mitigation).slice(0, 4000) : null,
        b.owner ? String(b.owner).slice(0, 120) : null,
        ALLOWED_STATUS.has(b.status) ? b.status : 'open',
        ALLOWED_TREND.has(b.trend) ? b.trend : 'stable',
        Number.isFinite(Number(b.review_cadence_days)) ? Number(b.review_cadence_days) : 30,
        new Date().toISOString(),
        b.next_review_due || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
        b.linked_metrics ? JSON.stringify(b.linked_metrics) : null,
        b.tags ? JSON.stringify(b.tags) : null,
      ],
    );
    const created = await db.one('SELECT * FROM risk_register WHERE id = ?', [r.lastInsertRowid]);
    res.status(201).json({ risk: shapeRisk(created) });
  } catch (err) {
    console.error('[risk] create failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── Patch — partial update with history logging when score changes ─
router.patch('/risks/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
  const b = req.body || {};
  const current = await db.one('SELECT * FROM risk_register WHERE id = ?', [id]);
  if (!current) return res.status(404).json({ error: 'risk not found' });

  const fields = []; const args = [];
  const push = (col, val) => { fields.push(`${col} = ?`); args.push(val); };

  if (b.title !== undefined)        push('title', String(b.title).slice(0, 200));
  if (b.description !== undefined)  push('description', b.description ? String(b.description).slice(0, 4000) : null);
  if (b.category !== undefined && ALLOWED_CATEGORY.has(b.category)) push('category', b.category);
  if (b.mitigation !== undefined)   push('mitigation', b.mitigation ? String(b.mitigation).slice(0, 4000) : null);
  if (b.owner !== undefined)        push('owner', b.owner ? String(b.owner).slice(0, 120) : null);
  if (b.status !== undefined && ALLOWED_STATUS.has(b.status)) push('status', b.status);
  if (b.trend !== undefined && ALLOWED_TREND.has(b.trend))    push('trend', b.trend);
  if (b.review_cadence_days !== undefined) push('review_cadence_days', Number(b.review_cadence_days) || 30);
  if (b.next_review_due !== undefined) push('next_review_due', b.next_review_due);
  if (b.linked_metrics !== undefined) push('linked_metrics', b.linked_metrics ? JSON.stringify(b.linked_metrics) : null);
  if (b.tags !== undefined)         push('tags', b.tags ? JSON.stringify(b.tags) : null);

  let scoreChanged = false;
  if (b.inherent_likelihood !== undefined) push('inherent_likelihood', clampScore(b.inherent_likelihood));
  if (b.inherent_impact !== undefined)     push('inherent_impact', clampScore(b.inherent_impact));
  if (b.residual_likelihood !== undefined) {
    const v = clampScore(b.residual_likelihood);
    if (v !== current.residual_likelihood) scoreChanged = true;
    push('residual_likelihood', v);
  }
  if (b.residual_impact !== undefined) {
    const v = clampScore(b.residual_impact);
    if (v !== current.residual_impact) scoreChanged = true;
    push('residual_impact', v);
  }

  if (fields.length === 0) return res.status(400).json({ error: 'no fields to update' });
  push('updated_at', new Date().toISOString());

  args.push(id);
  await db.run(`UPDATE risk_register SET ${fields.join(', ')} WHERE id = ?`, args);

  // Log a history entry when residual score moved
  if (scoreChanged) {
    const newRow = await db.one('SELECT residual_likelihood, residual_impact FROM risk_register WHERE id = ?', [id]);
    await db.run(
      `INSERT INTO risk_history (risk_id, residual_likelihood, residual_impact, residual_score, note, changed_by)
       VALUES (?,?,?,?,?,?)`,
      [
        id,
        newRow.residual_likelihood,
        newRow.residual_impact,
        newRow.residual_likelihood * newRow.residual_impact,
        b.note || null,
        b.changed_by || req.admin?.email || null,
      ],
    );
  }

  const updated = await db.one('SELECT * FROM risk_register WHERE id = ?', [id]);
  res.json({ risk: shapeRisk(updated) });
});

// ── Mark a review as completed — refreshes the next_review_due clock ─
router.post('/risks/:id/review', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
  const current = await db.one('SELECT * FROM risk_register WHERE id = ?', [id]);
  if (!current) return res.status(404).json({ error: 'risk not found' });
  const cadence = current.review_cadence_days || 30;
  const next = new Date(Date.now() + cadence * 86400000).toISOString().slice(0, 10);
  await db.run(
    `UPDATE risk_register SET last_reviewed_at = ?, next_review_due = ?, updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), next, new Date().toISOString(), id],
  );
  const updated = await db.one('SELECT * FROM risk_register WHERE id = ?', [id]);
  res.json({ risk: shapeRisk(updated) });
});

// ── Delete (soft — set status='closed') ───────────────────────────
router.delete('/risks/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid id' });
  await db.run(`UPDATE risk_register SET status = 'closed', updated_at = ? WHERE id = ?`,
    [new Date().toISOString(), id]);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════
// Mitigation actions — concrete tasks tied to each risk
// ═══════════════════════════════════════════════════════════════════

const ACTION_STATUS   = new Set(['open', 'in_progress', 'done', 'blocked']);
const ACTION_PRIORITY = new Set(['low', 'medium', 'high']);

function shapeAction(row) {
  if (!row) return null;
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: row.id,
    risk_id: row.risk_id,
    title: row.title,
    description: row.description,
    owner: row.owner,
    status: row.status,
    priority: row.priority,
    due_date: row.due_date,
    completed_at: row.completed_at,
    notes: row.notes,
    is_overdue: row.due_date && row.status !== 'done' && row.due_date < today,
    is_due_soon: row.due_date && row.status !== 'done'
      && row.due_date >= today
      && row.due_date <= new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

// List actions for a single risk
router.get('/risks/:id/actions', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid risk id' });
  try {
    const rows = await db.all(
      `SELECT * FROM risk_mitigation_actions
       WHERE risk_id = ?
       ORDER BY
         CASE status WHEN 'done' THEN 1 ELSE 0 END,
         CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END,
         due_date IS NULL, due_date,
         id DESC`,
      [id],
    );
    res.json({ actions: rows.map(shapeAction) });
  } catch (err) {
    console.error('[risk] actions list failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Create an action under a risk
router.post('/risks/:id/actions', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'invalid risk id' });
  const b = req.body || {};
  if (!b.title || typeof b.title !== 'string') return res.status(400).json({ error: 'title required' });
  // Validate the parent risk exists so we don't orphan rows.
  const risk = await db.one('SELECT id FROM risk_register WHERE id = ?', [id]);
  if (!risk) return res.status(404).json({ error: 'risk not found' });

  try {
    const r = await db.run(
      `INSERT INTO risk_mitigation_actions
         (risk_id, title, description, owner, status, priority, due_date, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        b.title.slice(0, 200),
        b.description ? String(b.description).slice(0, 4000) : null,
        b.owner ? String(b.owner).slice(0, 120) : null,
        ACTION_STATUS.has(b.status) ? b.status : 'open',
        ACTION_PRIORITY.has(b.priority) ? b.priority : 'medium',
        b.due_date || null,
        b.notes ? String(b.notes).slice(0, 4000) : null,
      ],
    );
    const created = await db.one('SELECT * FROM risk_mitigation_actions WHERE id = ?', [r.lastInsertRowid]);
    res.status(201).json({ action: shapeAction(created) });
  } catch (err) {
    console.error('[risk] action create failed:', err);
    res.status(500).json({ error: err.message });
  }
});

// Update an action — partial. Status transition to 'done' stamps
// completed_at automatically; reverting clears it.
router.patch('/actions/:actionId', async (req, res) => {
  const aid = Number(req.params.actionId);
  if (!Number.isInteger(aid) || aid <= 0) return res.status(400).json({ error: 'invalid action id' });
  const b = req.body || {};
  const current = await db.one('SELECT * FROM risk_mitigation_actions WHERE id = ?', [aid]);
  if (!current) return res.status(404).json({ error: 'action not found' });

  const fields = []; const args = [];
  const push = (col, val) => { fields.push(`${col} = ?`); args.push(val); };

  if (b.title !== undefined)       push('title', String(b.title).slice(0, 200));
  if (b.description !== undefined) push('description', b.description ? String(b.description).slice(0, 4000) : null);
  if (b.owner !== undefined)       push('owner', b.owner ? String(b.owner).slice(0, 120) : null);
  if (b.notes !== undefined)       push('notes', b.notes ? String(b.notes).slice(0, 4000) : null);
  if (b.due_date !== undefined)    push('due_date', b.due_date || null);
  if (b.priority !== undefined && ACTION_PRIORITY.has(b.priority)) push('priority', b.priority);

  if (b.status !== undefined && ACTION_STATUS.has(b.status)) {
    push('status', b.status);
    if (b.status === 'done' && current.status !== 'done') {
      push('completed_at', new Date().toISOString());
    } else if (b.status !== 'done' && current.status === 'done') {
      push('completed_at', null);
    }
  }

  if (fields.length === 0) return res.status(400).json({ error: 'no fields to update' });
  push('updated_at', new Date().toISOString());
  args.push(aid);
  await db.run(`UPDATE risk_mitigation_actions SET ${fields.join(', ')} WHERE id = ?`, args);
  const updated = await db.one('SELECT * FROM risk_mitigation_actions WHERE id = ?', [aid]);
  res.json({ action: shapeAction(updated) });
});

// Hard delete (vs soft because actions are cheap and reps want them gone)
router.delete('/actions/:actionId', async (req, res) => {
  const aid = Number(req.params.actionId);
  if (!Number.isInteger(aid) || aid <= 0) return res.status(400).json({ error: 'invalid action id' });
  await db.run('DELETE FROM risk_mitigation_actions WHERE id = ?', [aid]);
  res.json({ ok: true });
});

// Action board — overdue + due-this-week + later, with parent-risk
// title joined in so the UI doesn't need a second fetch.
router.get('/actions/board', async (req, res) => {
  try {
    const rows = await db.all(
      `SELECT a.*, r.title AS risk_title, r.category AS risk_category
       FROM risk_mitigation_actions a
       JOIN risk_register r ON r.id = a.risk_id
       WHERE a.status != 'done'
       ORDER BY a.due_date IS NULL, a.due_date,
         CASE a.priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END`,
      [],
    );
    const weekOut = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    const overdue = []; const dueSoon = []; const later = [];
    for (const r of rows) {
      const a = shapeAction(r);
      a.risk = { id: r.risk_id, title: r.risk_title, category: r.risk_category };
      if (a.is_overdue) overdue.push(a);
      else if (a.due_date && a.due_date <= weekOut) dueSoon.push(a);
      else later.push(a);
    }
    res.json({
      overdue,
      due_this_week: dueSoon,
      later,
      stats: {
        open_total: rows.length,
        overdue: overdue.length,
        due_this_week: dueSoon.length,
        high_priority: rows.filter(r => r.priority === 'high').length,
      },
    });
  } catch (err) {
    console.error('[risk] action board failed:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
