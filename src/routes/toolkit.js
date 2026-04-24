// Toolkit ownership endpoint — computes owner + collaborators for each
// dashboard card from real `git log` author data, not hardcoded guesses.
const express = require('express');
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const router = express.Router();

// Module → list of source-of-truth file references. Each entry is either:
//   - a string like "pages/foo.html" → path relative to THIS repo
//   - an object { repo: 'accelerate-carts', paths: ['pages/dossier.html'] }
//     → path inside a SIBLING repo at ~/Code/<repo>
//
// Sibling-repo entries let us attribute tools whose code lives in a
// different repo (e.g. Sensor Lab is in b10-playground, Elevator BOM is in
// accelerate-elevator). The endpoint runs `git log` in whichever repo owns
// each entry, then merges results into a single author list per module.
const MODULE_FILES = {
  deals:              ['src/routes/deals.js', 'public/admin-deals.html', 'public/admin-deal-detail.html'],
  prospects:          ['pages/pipeline-prospects.html', 'src/routes/prospects.js'],
  assessments:        ['pages/assessments.html', 'src/routes/assessments.js', 'src/routes/assessment-photos.js', 'src/routes/assessment-pdf.js'],
  robot_command:      [], // external URL (localhost:3100 — home-dashboard), no repo to inspect
  robot_catalog:      ['pages/robot-catalog.html'],
  investors:          ['pages/investor-crm.html'],
  national_rollout:   ['pages/national-rollout-strategy.html'],
  financial_analysis: ['public/financial-analysis.html'],
  robots_dossier:     [{ repo: 'accelerate-carts',        paths: ['pages/robots-dossier.html'] }],
  service_van:        [{ repo: 'accelerate-thesis-hotel', paths: ['pages/service-van.html'] }],
  lidar_scanner:      ['pages/slam-lidar-scanner.html', 'docs/20-architecture/slam-lidar-wheel-stick.md'],
  sensor_lab:         [{ repo: 'b10-playground',          paths: ['index.html'] }],
  elevator_sim:       [
    { repo: 'accelerate-elevator', paths: ['pages/button-emulator-sim.html'] },
    'public/elevator-button-emulator.html',
  ],
  elevator_install:   [
    { repo: 'accelerate-elevator', paths: ['pages/install-guide.html'] },
    'public/elevator-install-guide.html',
  ],
  elevator_bom:       [{ repo: 'accelerate-elevator',     paths: ['pages/bom-order-guide.html'] }],
  inquiries:          ['src/routes/inquiries.js', 'public/admin.html'],
  project_tracker:    ['public/admin-project-tracker.html', 'src/routes/tracker.js'],
  public_website:     ['public/index.html'],
};

// Fallback assignments when `git log` turns up nothing real (external URLs
// with no source files, or files whose entire history was written by a
// filtered test/bot account). Keyed by module; values are author records.
// Empty = no fallback, no roster.
//
// WHY: When every commit on a file comes from the Claude Test bot account,
// "git authorship" fails to identify a human. The fallback maps to whoever
// is responsible for the tool IRL. As the team commits real work under
// personal git identities, these auto-override the fallback.
//
// To hand over: edit an entry here, or just make the next commit on the
// tool's files — whichever has higher commit count wins.
// Emails to drop from author attribution entirely (test accounts, bots,
// sync accounts). Mirrors the client's GIT_ALIASES null entries but filters
// server-side so override fallback triggers when only filtered identities
// contributed.
const HIDDEN_EMAILS = new Set([
  'acceleraterobotics@gmail.com', // Claude Test bot account
]);

const ERIC = { name: 'Eric Race', email: 'claude.e.race@atlasmobility.com', count: 0 };
const MODULE_OVERRIDES = {
  robot_command:    [ERIC], // home-dashboard embed, no source in any tracked repo
  robots_dossier:   [ERIC], // accelerate-carts commits are all bot so far
  service_van:      [ERIC], // accelerate-thesis-hotel
  robot_catalog:    [ERIC],
  investors:        [ERIC],
  national_rollout: [ERIC],
  elevator_sim:     [ERIC],
  elevator_install: [ERIC],
  elevator_bom:     [ERIC],
};

// In-memory cache. TTL is 1 hour — `git log` costs are trivial but no point
// re-running on every page load.
let cached = null;
let cachedAt = 0;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour — tool ownership rarely changes

// Repo root = two levels up from this file (src/routes/toolkit.js → repo).
const REPO_ROOT = path.resolve(__dirname, '..', '..');
// WHY: Sibling repos are assumed to live next to this one under ~/Code.
// Mirrors the /repos/ static-mount convention in src/server.js.
const SIBLING_ROOT = path.resolve(REPO_ROOT, '..');

function isGitRepo(dir) {
  return fs.existsSync(path.join(dir, '.git'));
}

// Run `git log` on a set of paths inside a specific repo root. Populates two
// accumulators: one for author counts, one for recent commits. External-repo
// safety: silently no-ops if the repo isn't on disk (prod deploys without
// siblings).
// WHY: %x01 = 0x01 field separator, unlikely to appear in commit messages.
const COMMIT_FORMAT = '%H%x01%s%x01%aN%x01%aE%x01%at';

function addGitDataFromRepo(authorAcc, commitAcc, repoDir, paths) {
  if (!isGitRepo(repoDir)) return;
  const existing = paths.filter(p => fs.existsSync(path.join(repoDir, p)));
  if (existing.length === 0) return;
  try {
    const args = ['log', '--no-merges', `--format=${COMMIT_FORMAT}`, '--', ...existing];
    const out = execFileSync('git', args, { cwd: repoDir, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
    out.split('\n').filter(Boolean).forEach(line => {
      const [sha, subject, name, rawEmail, ts] = line.split('\x01');
      if (!sha || !rawEmail) return;
      const email = rawEmail.trim().toLowerCase();
      // Author tally
      const prev = authorAcc.get(email);
      if (prev) prev.count++;
      else authorAcc.set(email, { name: (name || '').trim(), email, count: 1 });
      // Recent commits
      commitAcc.push({
        sha: sha.slice(0, 7),
        subject: (subject || '').trim(),
        author: (name || '').trim(),
        email,
        ts: Number(ts) || 0,
      });
    });
  } catch (err) {
    console.error(`git log failed in ${repoDir}:`, err.message);
  }
}

function gitDataForModule(entries) {
  const authorCounts = new Map();
  const allCommits = [];
  const inRepoPaths = [];
  const siblingGroups = new Map();
  for (const e of entries) {
    if (typeof e === 'string') {
      inRepoPaths.push(e);
    } else if (e && typeof e === 'object' && e.repo && Array.isArray(e.paths)) {
      if (!siblingGroups.has(e.repo)) siblingGroups.set(e.repo, []);
      siblingGroups.get(e.repo).push(...e.paths);
    }
  }
  if (inRepoPaths.length) addGitDataFromRepo(authorCounts, allCommits, REPO_ROOT, inRepoPaths);
  for (const [repo, paths] of siblingGroups) {
    addGitDataFromRepo(authorCounts, allCommits, path.join(SIBLING_ROOT, repo), paths);
  }
  // WHY: Drop hidden identities server-side so downstream empty-check
  // (→ override fallback) works when only bots committed.
  const authors = Array.from(authorCounts.values())
    .filter(a => !HIDDEN_EMAILS.has(a.email))
    .sort((a, b) => b.count - a.count);
  // Recent commits across all repos for this module: top 3 by timestamp,
  // with bot commits filtered out too so the hover preview only shows real work.
  const recent = allCommits
    .filter(c => !HIDDEN_EMAILS.has(c.email))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 3);
  return { authors, recent };
}

router.get('/ownership', (_req, res) => {
  if (cached && Date.now() - cachedAt < CACHE_TTL_MS) {
    return res.json({ cached: true, modules: cached });
  }
  const modules = {};
  for (const [mod, entries] of Object.entries(MODULE_FILES)) {
    const { authors, recent } = gitDataForModule(entries);
    let finalAuthors = authors;
    if (finalAuthors.length === 0 && MODULE_OVERRIDES[mod]) {
      finalAuthors = MODULE_OVERRIDES[mod].map(a => ({ ...a, email: (a.email || '').toLowerCase() }));
    }
    modules[mod] = { authors: finalAuthors, recent };
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
