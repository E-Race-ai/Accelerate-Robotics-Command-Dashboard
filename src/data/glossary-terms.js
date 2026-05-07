// Glossary terms — single source of truth for the team-glossary page AND the
// quiz engine. The HTML page renders mostly verbatim from this list (so adding
// a term shows up everywhere — the page, the quiz, the search), and the
// game-mode route uses these definitions to validate quiz answers server-side.
//
// Adding a term: just push to the right section. Order matters for the page
// layout. Keep `term` short and `body` ≤ 240 chars so quiz cards stay scannable.

const SECTIONS = [
  {
    id: 'git',
    label: 'Git & GitHub',
    blurb: 'Git tracks every change to our code. GitHub is the website where the history lives so the team can collaborate.',
    terms: [
      { term: 'Repository',      alias: 'aka "repo"', body: 'The folder of code for one project, plus its full change history. We have several — accelerate-robotics, accelerate-elevator, accelerate-thesis-hotel, accelerate-carts.' },
      { term: 'Clone',           body: 'Download a full copy of a repo to your laptop so you can read or change the code locally.' },
      { term: 'Fork',            body: 'Make your own copy of someone else\'s repo on GitHub. Used mostly for open-source. Internally we work on branches in the same repo, not forks.' },
      { term: 'Branch',          body: 'A named lane of changes running parallel to the main code. You start a branch, make changes there, then merge it back. Multiple people can work on different branches at once.' },
      { term: 'main',            body: 'The single branch that represents what\'s actually live. Production deploys from here. We never commit directly to main — every change first lives on its own branch and gets reviewed before merging in.' },
      { term: 'Fresh branch',    body: 'A brand-new branch started from the latest main. A clean slate for one specific piece of work, so changes don\'t conflict with what\'s already shipped.' },
      { term: 'Commit',          body: 'A single saved snapshot of changes, with a short message explaining what changed and why. The Activity Calendar on the Command Center counts commits.' },
      { term: 'Push',            body: 'Send your local commits up to GitHub so others can see them and so they\'re backed up off your laptop.' },
      { term: 'Pull',            body: 'Download new commits from GitHub onto your laptop, so your local copy is up to date with what teammates have shipped.' },
      { term: 'Pull request',    alias: 'aka "PR"', body: 'A formal proposal on GitHub: "please merge my branch into main." It shows the diff, lets reviewers comment, runs the test suite. Once approved and tests pass, it merges.' },
      { term: 'Merge',           body: 'Combine the changes from one branch into another. The most common merge is feature-branch into main at the end of a PR.' },
      { term: 'Squash',          body: 'When merging a PR, collapse all of its commits into one tidy commit on main. Keeps the history readable. We squash-merge by default.' },
      { term: 'Rebase',          body: 'Replay your branch\'s commits on top of the latest main, so the branch is "current" before merging. Useful when main has moved while you were working.' },
      { term: 'Conflict',        alias: '"merge conflict"', body: 'When two branches changed the same line of the same file and Git can\'t decide which wins. A human resolves it by picking which version to keep.' },
      { term: 'Stash',           body: 'Temporarily set aside uncommitted changes so you can switch branches, then bring them back later. Like a pocket for unfinished work.' },
      { term: 'Diff',            body: 'The line-by-line view of what changed — red lines were removed, green lines were added. PRs and code reviews are mostly about reading diffs.' },
      { term: 'HEAD',            body: 'Git\'s word for "where you are right now" — the most recent commit on the branch you\'re currently on.' },
      { term: 'Origin',          body: 'The default name for the GitHub copy of the repo your laptop talks to when you push or pull.' },
      { term: 'Tag / release',   body: 'A stable label stuck on a specific commit, usually a version number like v1.4.0. Used for cutting versions and for rollbacks.' },
    ],
  },
  {
    id: 'process',
    label: 'Code review & deploys',
    blurb: 'How code gets from a teammate\'s laptop to the live site.',
    terms: [
      { term: 'Code review', body: 'Another teammate reads your PR\'s diff and either approves it or asks for changes. Required before anything merges to main.' },
      { term: 'CI',          alias: 'Continuous Integration', body: 'The automated test/lint runner that fires on every PR. Green checkmark = safe to merge. Red X = something broke; fix before merging.' },
      { term: 'CD',          alias: 'Continuous Deployment', body: 'Auto-deploy to production whenever main advances. No manual "push to prod" step.' },
      { term: 'Deploy',      body: 'Push the new code out to where users can see it. Usually triggered automatically by a merge to main.' },
      { term: 'Production',  alias: '"prod"', body: 'The live site real users hit. Most cautious changes go through staging first.' },
      { term: 'Staging',     body: 'A near-identical copy of production used for last-mile testing — same code paths, but no real users yet.' },
      { term: 'Dev / development', body: 'Your laptop — where work-in-progress lives before going to staging or prod.' },
      { term: 'Hotfix',      body: 'An urgent fix that goes straight to main and prod, skipping the usual rhythm because something is on fire.' },
      { term: 'Rollback',    body: 'Re-deploy the previous version because the current one is broken. The fastest way out of a bad release.' },
      { term: 'Lint',        body: 'An auto-checker that flags risky or stylistically inconsistent code patterns. Runs in CI alongside tests.' },
      { term: 'Tests',       alias: 'unit / integration / E2E', body: 'Unit tests one function in isolation. Integration tests a few pieces working together. End-to-End tests the whole app like a real user.' },
      { term: 'Build',       body: 'The step that bundles, compiles, or minifies code for shipping. We have a minimal build — most of our code ships as written.' },
      { term: 'Auto-merge',  body: 'Tell GitHub: "merge this PR automatically the moment CI passes and reviewers approve." Saves babysitting.' },
    ],
  },
  {
    id: 'types',
    label: 'Commit message types',
    blurb: 'Every commit message starts with a type so you can scan history at a glance.',
    terms: [
      { term: 'feat',     body: 'A new capability for users — a feature being added.' },
      { term: 'fix',      body: 'A bug fix.' },
      { term: 'refactor', body: 'Internal restructure with no behavior change. Same outcome, cleaner code.' },
      { term: 'docs',     body: 'Documentation only — no code change.' },
      { term: 'test',     body: 'Adding or fixing tests.' },
      { term: 'chore',    body: 'Housekeeping — dependency bumps, config tweaks, file renames.' },
    ],
  },
  {
    id: 'stack',
    label: 'Software & data',
    blurb: 'Pieces of the app you\'ll hear named.',
    terms: [
      { term: 'API',       body: 'The set of URLs the front-end (and other tools) call to read or change data on the server. Each URL is an "endpoint."' },
      { term: 'Endpoint',  body: 'One specific URL on the server, like /api/deals. Each endpoint does one thing — list deals, create a deal, etc.' },
      { term: 'Frontend',  body: 'The part that runs in your browser — what users see and click.' },
      { term: 'Backend',   body: 'The part that runs on a server. It stores data, sends emails, and serves the frontend.' },
      { term: 'Database',  body: 'Where data is stored permanently. We use SQLite — a single file on disk that the backend reads from and writes to.' },
      { term: 'Schema',    body: 'The shape of the database — which tables exist, what columns each has, and which fields are required.' },
      { term: 'Migration', body: 'A script that updates the database schema (adds a column, renames a table, etc.) without losing existing data.' },
      { term: 'Cache',     body: 'Saved-aside data so we don\'t have to recompute or re-fetch it. Faster, but can go stale — gets refreshed on a timer.' },
      { term: 'JWT',       alias: 'JSON Web Token', body: 'The signed token that proves you\'re logged in as an admin. Lives in a secure browser cookie, expires after 24 hours.' },
      { term: 'Edge case', body: 'A rare or unusual scenario that often breaks code if it isn\'t explicitly handled (empty inputs, two users editing at once, etc.).' },
    ],
  },
  {
    id: 'robotics',
    label: 'Robots & elevators',
    blurb: 'Selected terms from the broader domain glossary.',
    terms: [
      { term: 'AMR',              body: 'Autonomous Mobile Robot — any wheeled floor-going robot that localizes and navigates on its own.' },
      { term: 'Button emulator',  alias: '"the wedge"', body: 'Our universal elevator-integration product — a small board that wires in parallel to existing push-buttons and lets a robot "press" them over BLE/LoRa.' },
      { term: 'E-Box',            body: 'Keenon\'s proprietary robot-elevator bridge hardware. Master + slave + RFID tags. Vendor-locked.' },
      { term: 'LiDAR',            body: 'Light Detection and Ranging — a laser scanner robots use to map their surroundings and avoid obstacles.' },
      { term: 'LoRa',             body: 'Long Range, low-power radio in the 850–930 MHz band. Penetrates elevator shafts where Bluetooth can\'t.' },
      { term: 'SLAM',             body: 'Simultaneous Localization and Mapping — how robots build internal floor plans while figuring out where they are inside them.' },
      { term: 'Hall call / Car call', body: 'Hall call = pressing the up/down button at the elevator lobby. Car call = pressing a floor number from inside the cab.' },
      { term: 'RaaS',             body: 'Robot-as-a-Service — leasing robots bundled with management and support, instead of selling them outright.' },
    ],
  },
  {
    id: 'business',
    label: 'Business',
    blurb: 'The acronyms you\'ll see in pipeline notes and proposals.',
    terms: [
      { term: 'ARR / MRR',   body: 'Annual / Monthly Recurring Revenue. The portion of revenue that repeats predictably (subscriptions, RaaS).' },
      { term: 'Capex / Opex', body: 'Capex = capital expenditure (one-time hardware buys, build-outs). Opex = ongoing operational expenditure (service, maintenance).' },
      { term: 'KOL',         body: 'Key Opinion Leader — a respected expert whose endorsement drives industry adoption.' },
      { term: 'LOI',         body: 'Letter of Intent — a non-binding signal that someone plans to do business with us.' },
      { term: 'POC',         body: 'Proof of Concept — a small deployment to demonstrate the idea works before committing to the full project.' },
      { term: 'SLA',         body: 'Service Level Agreement — the contract clause specifying how fast we respond and how often the system is up.' },
      { term: 'TAM',         body: 'Total Addressable Market — the maximum revenue if we captured 100% of every potential customer.' },
    ],
  },
];

// Flat lookup: { 'fork': { term: 'Fork', body: '...', sectionId: 'git', sectionLabel: 'Git & GitHub' } }
// Used by the quiz engine for O(1) term lookup.
const FLAT_BY_KEY = {};
for (const sec of SECTIONS) {
  for (const t of sec.terms) {
    const key = t.term.toLowerCase().trim();
    FLAT_BY_KEY[key] = { ...t, sectionId: sec.id, sectionLabel: sec.label };
  }
}

// All term keys, for picking random questions and distractors.
const ALL_TERM_KEYS = Object.keys(FLAT_BY_KEY);

module.exports = { SECTIONS, FLAT_BY_KEY, ALL_TERM_KEYS };
