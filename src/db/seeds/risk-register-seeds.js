// Baseline Enterprise Risk Management register for Accelerate Robotics.
//
// Sourced from: ERM Matrix v5 (the CEO's living document) plus the
// risks that became visible during the Thesis Hotel pilot + Miami
// outreach. Reviewed every 30 days unless flagged as high-velocity
// (cash, security, key-customer concentration → 14 days).
//
// Score scale: likelihood × impact, 1–5 each → 1–25.
//   1–4   ░ low — monitor only
//   5–9   ▒ moderate — own + mitigate
//   10–15 ▓ high — active mitigation, weekly review
//   16–25 █ critical — board-level, daily watch
//
// Inherent = the risk with NO controls. Residual = the risk WITH the
// mitigations we have in place today. The delta is the value our
// controls produce.

module.exports = [
  // ─── Strategic ──────────────────────────────────────────────────
  {
    category: 'strategic',
    title: 'Cash runway runs out before next round',
    description:
      'Burn rate vs current bank balance leaves <6 months runway. ' +
      'A delayed raise or a slow Q would force layoffs / fire-sale.',
    inherent_likelihood: 4, inherent_impact: 5,
    residual_likelihood: 3, residual_impact: 5,
    mitigation:
      'Tracking weekly cash burn. RaaS deposits offset hardware capex. ' +
      'Two warm investor leads. Fallback: bridge from existing investors.',
    owner: 'Eric Race',
    review_cadence_days: 14,
    trend: 'stable',
    linked_metrics: ['cash_runway_months', 'monthly_burn'],
    tags: ['board-level', 'critical-watch'],
  },
  {
    category: 'strategic',
    title: 'Customer concentration — Thesis Hotel >40% of pipeline',
    description:
      'A single deployment failure or churn would reset the whole ' +
      'commercial story. Limits leverage on terms, distorts roadmap.',
    inherent_likelihood: 4, inherent_impact: 4,
    residual_likelihood: 3, residual_impact: 4,
    mitigation:
      'Active outreach in 5 additional Miami properties. Bal Harbour, ' +
      'Eden Roc, 1 Hotel South Beach, Fontainebleau in pre-pilot.',
    owner: 'Eric Race',
    trend: 'falling',
    linked_metrics: ['top_customer_pipeline_pct'],
    tags: ['concentration'],
  },
  {
    category: 'strategic',
    title: 'Bear Robotics / Servi takes Miami market before we scale',
    description:
      'Larger competitors with VC-funded sales motions could lock up ' +
      'flagship Miami hotels before our pilots prove out.',
    inherent_likelihood: 3, inherent_impact: 4,
    residual_likelihood: 3, residual_impact: 3,
    mitigation:
      'Differentiation: elevator integration + multi-vendor robot OS. ' +
      'Flagship pilot at Thesis Hotel. Cold-call queue accelerating reach.',
    owner: 'Eric Race',
    trend: 'rising',
    tags: ['competitive'],
  },

  // ─── Operational ────────────────────────────────────────────────
  {
    category: 'operational',
    title: 'Geopolitical escalation disrupts Pacific shipping or vendor support',
    description:
      'Taiwan Strait tensions, Red Sea routing disruptions, or broader ' +
      'US-China decoupling could halt or delay shipments of replacement ' +
      'units, spare parts, and firmware updates from our Chinese vendors. ' +
      'Service continuity at deployed sites is the first casualty. ' +
      'Distinct from the regulatory tariff/ban risk: this fires even when ' +
      'no policy lever is pulled, just from logistics + supply-chain ' +
      'failure modes. Wired to geopolitical shipping headlines.',
    inherent_likelihood: 3, inherent_impact: 4,
    residual_likelihood: 2, residual_impact: 4,
    mitigation:
      '90-day spare-unit inventory at flagship sites. Critical-parts cache ' +
      '(LiDAR module, drive wheels, batteries) staged with customers. ' +
      'Service-van runbook with field-replaceable units. Vendor SLAs ' +
      'cover 72-hour replacement under normal trade conditions.',
    owner: 'Eric Race',
    trend: 'stable',
    linked_metrics: [
      'news:taiwan-strait-shipping',
      'news:red-sea-shipping',
      'news:china-export-controls-robotics',
    ],
    tags: ['geopolitical', 'supply-chain', 'continuity'],
  },
  {
    category: 'operational',
    title: 'Keenon vendor reliability — robots fail mid-deployment',
    description:
      'Single-vendor dependency. Hardware failures during a paid ' +
      'pilot would damage the customer relationship and brand.',
    inherent_likelihood: 4, inherent_impact: 4,
    residual_likelihood: 3, residual_impact: 3,
    mitigation:
      'Spare units on-site at Thesis. Service-van runbook. Multi-vendor ' +
      'roadmap: Pudu + Bear Robotics evaluations underway.',
    owner: 'Eric Race',
    trend: 'stable',
    linked_metrics: ['robot_uptime_pct', 'mtbf_hours'],
    tags: ['vendor', 'pilot-risk'],
  },
  {
    category: 'operational',
    title: 'Elevator E-Box failure at deployed sites',
    description:
      'Custom hardware wedge between robots and elevators. A failure ' +
      'leaves the robot stranded; multi-floor deployments halt.',
    inherent_likelihood: 3, inherent_impact: 4,
    residual_likelihood: 2, residual_impact: 3,
    mitigation:
      'Two redundant E-Boxes per elevator bank. Remote diagnostics. ' +
      'Field-replaceable — service van carries 2 spare LoRa modules.',
    owner: 'Eric Race',
    trend: 'falling',
    tags: ['hardware', 'thesis-hotel'],
  },
  {
    category: 'operational',
    title: 'Concurrent-deployment scaling — too many sites at once',
    description:
      'When we land 3+ pilots simultaneously, install + training capacity ' +
      'becomes the bottleneck. Quality slips, customers churn.',
    inherent_likelihood: 3, inherent_impact: 3,
    residual_likelihood: 3, residual_impact: 3,
    mitigation:
      'Service-van model standardizing onboarding. Hiring senior ops in Q3.',
    owner: 'Eric Race',
    trend: 'rising',
    tags: ['scaling'],
  },

  // ─── Financial ──────────────────────────────────────────────────
  {
    category: 'financial',
    title: 'AR collection delays from hotel ops finance teams',
    description:
      'Hotel finance is 60-90 day net. RaaS revenue lumpy. Delayed ' +
      'collection compounds the burn risk above.',
    inherent_likelihood: 4, inherent_impact: 3,
    residual_likelihood: 3, residual_impact: 3,
    mitigation:
      'Net-15 terms in standard contract. Up-front deposit on long pilots. ' +
      'Auto-reminders to AP contacts.',
    owner: 'Eric Race',
    trend: 'stable',
    linked_metrics: ['ar_aging_days', 'overdue_invoices'],
    tags: ['cash-cycle'],
  },
  {
    category: 'financial',
    title: 'Unit economics: bot cost per month vs RaaS revenue',
    description:
      'Bot capex + service costs need to clear ARR per bot. If unit ' +
      'economics flip negative we cannot scale without re-pricing.',
    inherent_likelihood: 2, inherent_impact: 4,
    residual_likelihood: 2, residual_impact: 3,
    mitigation:
      '$1500-2500/mo per bot pricing tested. Goldilocks fit-score targets ' +
      'properties where the unit econ works. Quarterly cohort review.',
    owner: 'Eric Race',
    trend: 'stable',
    linked_metrics: ['avg_arr_per_bot', 'bot_lifetime_value'],
    tags: ['unit-econ'],
  },

  // ─── Technology ─────────────────────────────────────────────────
  {
    category: 'technology',
    title: 'SLAM map drift — robot navigation failures',
    description:
      'Multi-floor SLAM maps degrade over time as hotels rearrange ' +
      'furniture. Robot gets lost, deliveries fail.',
    inherent_likelihood: 4, inherent_impact: 3,
    residual_likelihood: 3, residual_impact: 2,
    mitigation:
      'Auto re-mapping on confidence-threshold breach. LiDAR scanner kit ' +
      'for site-walk re-baselines.',
    owner: 'Eric Race',
    trend: 'falling',
    linked_metrics: ['slam_confidence_avg', 'navigation_failures_24h'],
    tags: ['robotics-stack'],
  },
  {
    category: 'technology',
    title: 'Production server outage — acceleraterobotics.ai down',
    description:
      'Render-hosted single point of failure. An outage takes down the ' +
      'team toolkit, customer-facing dashboards, and the deal pipeline.',
    inherent_likelihood: 3, inherent_impact: 3,
    residual_likelihood: 2, residual_impact: 2,
    mitigation:
      'Render deploy hook + manual deploy capability. Turso DB is hosted ' +
      'externally so server restart is non-destructive.',
    owner: 'Eric Race',
    trend: 'stable',
    linked_metrics: ['uptime_30d_pct'],
    tags: ['infra'],
  },
  {
    category: 'technology',
    title: 'Customer PII exposure or breach',
    description:
      'We collect hotel staff PII + decision-maker contacts. A leak ' +
      'would torch trust + trigger GDPR/CCPA exposure.',
    inherent_likelihood: 2, inherent_impact: 5,
    residual_likelihood: 2, residual_impact: 4,
    mitigation:
      'JWT in httpOnly cookies, bcrypt 12 rounds, HTTPS-only, helmet CSP. ' +
      'No PII in logs. SOC2 prep budgeted for next round.',
    owner: 'Eric Race',
    review_cadence_days: 14,
    trend: 'stable',
    tags: ['security', 'compliance'],
  },

  // ─── Regulatory ─────────────────────────────────────────────────
  {
    category: 'regulatory',
    title: 'Hospitality union pushback on robot deployments',
    description:
      'UNITE HERE has fought robot deployments at union hotels. A public ' +
      'campaign would block urban-market expansion.',
    inherent_likelihood: 3, inherent_impact: 4,
    residual_likelihood: 3, residual_impact: 3,
    mitigation:
      'Positioning as labor augmentation (HAPI prevention, EVS heavy-lift) ' +
      'not replacement. Avoid union-property pilots until proof points ' +
      'in non-union deployments are public.',
    owner: 'Eric Race',
    trend: 'stable',
    tags: ['labor', 'positioning'],
  },
  {
    category: 'regulatory',
    title: 'Tariffs, import bans, or covered-list designation on Chinese robotics vendors',
    description:
      'Our entire deployed fleet (Keenon) and most evaluated alternatives ' +
      '(Pudu) are Chinese-built. A US tariff escalation, BIS Entity List ' +
      'addition, Section 1260H designation, or outright import ban would ' +
      'suspend the supply chain overnight and force migration to ' +
      'non-Chinese platforms (Bear, Cobot, ROG) on a compressed timeline. ' +
      'Score is intended to wire to a Reuters / Bloomberg / USTR / BIS ' +
      'headline feed once the news ingestion service is live.',
    inherent_likelihood: 4, inherent_impact: 4,
    residual_likelihood: 4, residual_impact: 3,
    mitigation:
      'Active eval of Bear Robotics (S. Korea) + Cobot (US) as non-Chinese ' +
      'platforms. 90-day spare-unit inventory at flagship deployments. ' +
      'Vendor diversification roadmap. Customer contract language allows ' +
      'platform substitution if a vendor becomes restricted.',
    owner: 'Eric Race',
    review_cadence_days: 14,
    trend: 'rising',
    linked_metrics: [
      'news:china-robotics-tariff',
      'news:bis-entity-list-keenon-pudu',
      'news:section-1260h-robotics',
      'news:section-301-robotics',
    ],
    tags: ['geopolitical', 'import-export', 'china', 'supply-chain', 'board-level'],
  },
  {
    category: 'regulatory',
    title: 'Robot safety certification (ANSI/ISO) gap',
    description:
      'Deploying without ANSI R15.08 / ISO 13482 certification opens ' +
      'liability if a robot causes injury. Some chains require certs ' +
      'before deployment approval.',
    inherent_likelihood: 2, inherent_impact: 4,
    residual_likelihood: 2, residual_impact: 3,
    mitigation:
      'Keenon units carry CE mark + UL listing. Q3 effort to add ANSI R15.08 ' +
      'compliance review to the deployment playbook.',
    owner: 'Eric Race',
    trend: 'stable',
    tags: ['compliance', 'safety'],
  },

  // ─── People ─────────────────────────────────────────────────────
  {
    category: 'people',
    title: 'Eric Race key-person risk',
    description:
      'Eric is single point of knowledge for elevator integration logic, ' +
      'investor relationships, and pilot deployment runbooks. Loss or ' +
      'extended unavailability would stall every workstream.',
    inherent_likelihood: 2, inherent_impact: 5,
    residual_likelihood: 2, residual_impact: 4,
    mitigation:
      'Documentation push: every elevator install has a written runbook in ' +
      'docs/. Investor warm intros documented. CTO hire in next-round plan.',
    owner: 'Eric Race',
    trend: 'falling',
    tags: ['key-person', 'continuity'],
  },
  {
    category: 'people',
    title: 'Senior engineering hiring pipeline thin',
    description:
      'Pre-Series-A pulls senior talent slowly. Without a CTO + 2 senior ' +
      'engineers in 6 months, scaling beyond Miami stalls.',
    inherent_likelihood: 4, inherent_impact: 3,
    residual_likelihood: 3, residual_impact: 3,
    mitigation:
      'Active outreach to robotics + hospitality-tech veterans. KOL network ' +
      '(Cem Ersoz at Simbe). Founder-led recruiting until first hire.',
    owner: 'Eric Race',
    trend: 'rising',
    tags: ['hiring'],
  },
  {
    category: 'people',
    title: 'Team burnout from long-form push cycles',
    description:
      '40+ commits in a single overnight push (May 5) is unsustainable. ' +
      'Burnout reduces quality + raises voluntary departure risk.',
    inherent_likelihood: 3, inherent_impact: 3,
    residual_likelihood: 3, residual_impact: 2,
    mitigation:
      'GSD leaderboard celebrates high-output without normalizing it. ' +
      'Hiring will redistribute load. Friday recap meetings track velocity ' +
      'vs sustainable cadence.',
    owner: 'Eric Race',
    trend: 'stable',
    tags: ['velocity', 'culture'],
  },

  // ─── Reputation ─────────────────────────────────────────────────
  {
    category: 'reputation',
    title: 'Robot incident at a flagship deployment goes viral',
    description:
      'A robot collision, fall, or guest-injury video at Fontainebleau ' +
      'or Thesis Hotel would dominate hospitality news for a week.',
    inherent_likelihood: 2, inherent_impact: 5,
    residual_likelihood: 2, residual_impact: 4,
    mitigation:
      'Speed-limited robots in guest areas. Fail-safe stop on obstacle ' +
      'within 50cm. Incident-response playbook (legal, comms, ops) ready.',
    owner: 'Eric Race',
    review_cadence_days: 14,
    trend: 'stable',
    tags: ['incident', 'pr'],
  },
  {
    category: 'reputation',
    title: 'Negative customer review goes viral on hospitality forums',
    description:
      'Hotelier forums (Hotelmanagement.net, HotelTechReport) move opinion. ' +
      'A "Accelerate ruined our F&B service" post would close future doors.',
    inherent_likelihood: 2, inherent_impact: 3,
    residual_likelihood: 2, residual_impact: 2,
    mitigation:
      'Weekly check-ins with deployed customers. Net Promoter survey ' +
      'after 30 days. Issue escalation to Eric for any score below 7.',
    owner: 'Eric Race',
    trend: 'stable',
    tags: ['customer-success'],
  },
];
