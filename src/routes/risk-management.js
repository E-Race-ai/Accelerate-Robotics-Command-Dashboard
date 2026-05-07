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

    res.json({
      generated_at: new Date().toISOString(),
      stats: { total, critical, high, overdue, avg_score: avgScore, mitigation_value: totalMitigationValue },
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

module.exports = router;
