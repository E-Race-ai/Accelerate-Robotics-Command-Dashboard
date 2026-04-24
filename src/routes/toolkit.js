// Toolkit ownership endpoint — computes owner + collaborators for each
// dashboard card from real `git log` author data, not hardcoded guesses.
const express = require('express');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Module → file path(s) that define the feature. Used by `git log` to find
// authors. External-repo tools (sibling repos served via /repos/) have empty
// arrays; the client falls back gracefully and shows no roster for them.
// WHY: These paths are relative to the repo root.
const MODULE_FILES = {
  deals:              ['src/routes/deals.js', 'public/admin-deals.html', 'public/admin-deal-detail.html'],
  prospects:          ['pages/pipeline-prospects.html', 'src/routes/prospects.js'],
  assessments:        ['pages/assessments.html', 'src/routes/assessments.js', 'src/routes/assessment-photos.js', 'src/routes/assessment-pdf.js'],
  robot_command:      [],
  robot_catalog:      ['pages/robot-catalog.html'],
  investors:          ['pages/investor-crm.html'],
  national_rollout:   ['pages/national-rollout-strategy.html'],
  financial_analysis: ['public/financial-analysis.html'],
  robots_dossier:     [],
  service_van:        [],
  lidar_scanner:      ['pages/slam-lidar-scanner.html', 'docs/20-architecture/slam-lidar-wheel-stick.md'],
  sensor_lab:         [],
  elevator_sim:       ['public/elevator-button-emulator.html'],
  elevator_install:   ['public/elevator-install-guide.html'],
  elevator_bom:       [],
  inquiries:          ['src/routes/inquiries.js', 'public/admin.html'],
  project_tracker:    ['public/admin-project-tracker.html', 'src/routes/tracker.js'],
  public_website:     ['public/index.html'],
};

// In-memory cache. TTL is 1 hour — `git log` costs are trivial but no point
// re-running on every page load.
let cached = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — tool ownership rarely changes

// Repo root = two levels up from this file (src/routes/toolkit.js → repo).
const REPO_ROOT = path.resolve(__dirname, '..', '..');

function gitLogAuthors(paths) {
  const existing = paths.filter(p => fs.existsSync(path.join(REPO_ROOT, p)));
  if (existing.length === 0) return [];
  try {
    const args = ['log', '--no-merges', '--format=%aN|%aE', '--', ...existing];
    const out = execFileSync('git', args, { cwd: REPO_ROOT, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    const counts = new Map();
    out.split('\n').filter(Boolean).forEach(line => {
      const idx = line.lastIndexOf('|');
      if (idx < 0) return;
      const name = line.slice(0, idx).trim();
      const email = line.slice(idx + 1).trim().toLowerCase();
      const existing = counts.get(email);
      if (existing) existing.count++;
      else counts.set(email, { name, email, count: 1 });
    });
    return Array.from(counts.values()).sort((a, b) => b.count - a.count);
  } catch (err) {
    console.error('git log failed:', err.message);
    return [];
  }
}

router.get('/ownership', (_req, res) => {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) {
    return res.json({ cached: true, modules: cached });
  }
  const modules = {};
  for (const [mod, paths] of Object.entries(MODULE_FILES)) {
    modules[mod] = gitLogAuthors(paths);
  }
  cached = modules;
  cachedAt = Date.now();
  res.json({ cached: false, modules });
});

// WHY: exposed so tests can clear between cases.
router.post('/ownership/refresh', (_req, res) => {
  cached = null;
  cachedAt = 0;
  res.json({ ok: true });
});

module.exports = router;
