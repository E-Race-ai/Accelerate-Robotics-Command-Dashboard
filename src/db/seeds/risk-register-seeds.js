// Baseline Enterprise Risk Management register for Accelerate Robotics.
//
// Sourced from: ERM Matrix v5 (the CEO's living document), the risks
// that became visible during the Thesis Hotel pilot + Miami outreach,
// and the 2026-Q2 deep-research audit (covering competitive landscape,
// Chinese-vendor regulatory exposure, healthcare regulatory, labor
// flashpoints, and legal/insurance/patent landscape).
//
// Reviewed every 30 days unless flagged as high-velocity (cash,
// security, key-customer concentration, patent clock → 7-14 days).
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
      'A delayed raise or a slow Q would force layoffs / fire-sale. ' +
      '$1.5M Seed → ~28 months base case; bear case (financial-' +
      'analysis §9.1) requires an $800K bridge.',
    inherent_likelihood: 4, inherent_impact: 5,
    residual_likelihood: 3, residual_impact: 5,
    mitigation:
      'Tracking weekly cash burn. RaaS deposits offset hardware capex. ' +
      'Two warm investor leads. Fallback: bridge from existing investors. ' +
      'Bear case: $800K bridge plan documented.',
    owner: 'Eric Race',
    review_cadence_days: 14,
    trend: 'stable',
    linked_metrics: ['cash_runway_months', 'monthly_burn'],
    tags: ['board-level', 'critical-watch'],
  },
  {
    category: 'strategic',
    title: 'Customer concentration — Thesis Hotel ~100% of revenue through 2026',
    description:
      'Thesis Hotel is the only signed customer through 2026 per ' +
      'financial-analysis.md §10. Pilot has 90-day minimum + 30-day ' +
      'cancellation (proposal §5). A single deployment failure or ' +
      'churn would reset the whole commercial story, distort the ' +
      'investor narrative, and force re-pricing.',
    inherent_likelihood: 5, inherent_impact: 5,
    residual_likelihood: 4, residual_impact: 4,
    mitigation:
      'Active outreach in 5 additional Miami properties (Bal Harbour, ' +
      'Eden Roc, 1 Hotel South Beach, Fontainebleau in pre-pilot). ' +
      'Goldilocks fit-score targeting accelerates qualified pilots. ' +
      'Atlas Mobility hospital channel as Phase 1.5 wedge.',
    owner: 'Eric Race',
    review_cadence_days: 14,
    trend: 'falling',
    linked_metrics: ['top_customer_revenue_pct', 'signed_customers_count'],
    tags: ['concentration', 'board-level', 'critical-watch'],
  },
  {
    category: 'strategic',
    title: 'Platform competitor builds hospital orchestration first',
    description:
      'The "one brain, many bots" thesis is under direct attack from ' +
      'multiple well-funded platform plays: InOrbit.AI ($10M Series A ' +
      'Sept 2025, multi-vendor orchestration with Genentech foothold), ' +
      'Aethon-Oracle integration (Sept 2025, Oracle Health controls ' +
      '22.9% of acute-care hospitals), Serve Robotics acquiring ' +
      'Diligent Q1 2026 ("Expanding Physical AI Platform"), Bear-LG ' +
      '($600M valuation, chaebol capital), Workday-Pipedream (Nov ' +
      '2025). Bear/Servi in Miami hotels is the secondary tactical ' +
      'threat; the platform-layer race is the primary one.',
    inherent_likelihood: 4, inherent_impact: 4,
    residual_likelihood: 3, residual_impact: 4,
    mitigation:
      'Differentiation: elevator-integration wedge + hospital-specific ' +
      'compliance (HIPAA, GHX, HITRUST). Atlas Mobility as inside-' +
      'hospital channel competitors do not have. Move-fast on Phase 1 ' +
      'reference deployments. Track funding announcements weekly.',
    owner: 'Eric Race',
    trend: 'rising',
    linked_metrics: [
      'news:inorbit-ai',
      'news:aethon-oracle',
      'news:serve-diligent',
      'news:hospital-robotics-platform',
    ],
    tags: ['competitive', 'platform', 'thesis-critical', 'board-level'],
  },
  {
    category: 'strategic',
    title: 'Multi-vendor adapter not signed despite "one brain, many bots" thesis',
    description:
      'The investor pitch and product thesis depend on AR being the ' +
      'orchestration layer across robot vendors. As of May 2026 the ' +
      'deployed fleet is 100% Keenon, no signed integration agreement ' +
      'with Pudu, Bear, Yujin, or any other vendor. Single-vendor ' +
      'dependency is a credibility gap at Series A diligence.',
    inherent_likelihood: 4, inherent_impact: 4,
    residual_likelihood: 3, residual_impact: 4,
    mitigation:
      'Bear Robotics + Pudu evaluations in flight. Yujin Robot (Korean) ' +
      'considered as Phase 1.5 hospital-grade option. Target one signed ' +
      'adapter by Q4 2026. Architecture designed vendor-agnostic from ' +
      'day one (per ADR-0005).',
    owner: 'Eric Race',
    trend: 'stable',
    linked_metrics: ['signed_vendor_adapters', 'fleet_vendor_diversity_pct'],
    tags: ['thesis-critical', 'platform', 'concentration'],
  },
  {
    category: 'strategic',
    title: 'Phase-sequencing slippage — Phase 1 exit criterion not met by date',
    description:
      'phased-approach.md gates each phase on the prior phase exit. ' +
      'Phase 1 exit = three reference deployments + one elevator-' +
      'integrated multi-floor workflow. As of May 2026: zero ref ' +
      'deployments in production, one elevator wedge in pre-build. ' +
      'Slipping Phase 1 exit by 6+ months delays Phase 1.5/2/3 and ' +
      'the entire investor narrative.',
    inherent_likelihood: 3, inherent_impact: 4,
    residual_likelihood: 3, residual_impact: 3,
    mitigation:
      'Cold-call queue + Goldilocks fit-score targeting. Atlas Mobility ' +
      'channel for hospital Phase 1.5 entry. Quarterly phase-gate ' +
      'review. Service-van model standardizes onboarding to compress ' +
      'time-to-deployment per site.',
    owner: 'Eric Race',
    trend: 'stable',
    linked_metrics: ['ref_deployments_count', 'phase_1_exit_pct'],
    tags: ['roadmap', 'phase-gate'],
  },
  {
    category: 'strategic',
    title: 'Wedge TAM shrinks — destination-dispatch elevators are new-construction norm',
    description:
      'Destination-dispatch elevators (Otis Compass, Schindler PORT, ' +
      'KONE Polaris) are the new-construction norm in Class A ' +
      'buildings. Our relay-parallel button emulator does not work on ' +
      'them — there are no buttons to emulate. Per open-questions.md ' +
      'the destination-dispatch strategy is unresolved. Total ' +
      'addressable elevator universe shrinks year-over-year as ' +
      'buildings modernize.',
    inherent_likelihood: 3, inherent_impact: 3,
    residual_likelihood: 3, residual_impact: 2,
    mitigation:
      'API-first integration path planned for destination-dispatch ' +
      '(Otis Integrated Dispatch SDK, Schindler BuilT-In). Wedge ' +
      'product positioned for retrofit + older-building segment first. ' +
      'Roadmap ADR pending: destination-dispatch SDK as Phase 2 work.',
    owner: 'Eric Race',
    review_cadence_days: 90,
    trend: 'rising',
    linked_metrics: ['destination_dispatch_buildings_pct'],
    tags: ['tam', 'wedge', 'product-strategy'],
  },

  // ─── Operational ────────────────────────────────────────────────
  {
    category: 'operational',
    title: 'Geopolitical escalation disrupts Pacific shipping or vendor support',
    description:
      'Taiwan Strait tensions, Red Sea routing disruptions, or broader ' +
      'US-China decoupling could halt or delay shipments of ' +
      'replacement units, spare parts, and firmware updates from our ' +
      'Chinese vendors. Service continuity at deployed sites is the ' +
      'first casualty. Distinct from the regulatory tariff/ban risk: ' +
      'this fires from logistics + supply-chain failure modes alone.',
    inherent_likelihood: 3, inherent_impact: 4,
    residual_likelihood: 2, residual_impact: 4,
    mitigation:
      '90-day spare-unit inventory at flagship sites. Critical-parts ' +
      'cache (LiDAR module, drive wheels, batteries) staged with ' +
      'customers. Service-van runbook with field-replaceable units. ' +
      'Vendor SLAs cover 72-hour replacement under normal trade ' +
      'conditions.',
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
      'pilot would damage the customer relationship and brand. ' +
      'Real-time telemetry path (ADB-over-WiFi) is a vendor-TOS gray ' +
      'area per open-questions.md and tracked separately.',
    inherent_likelihood: 4, inherent_impact: 4,
    residual_likelihood: 3, residual_impact: 3,
    mitigation:
      'Spare units on-site at Thesis. Service-van runbook. Multi-' +
      'vendor roadmap: Pudu + Bear Robotics + Yujin evaluations ' +
      'underway.',
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
      'When we land 3+ pilots simultaneously, install + training ' +
      'capacity becomes the bottleneck. Quality slips, customers churn.',
    inherent_likelihood: 3, inherent_impact: 3,
    residual_likelihood: 3, residual_impact: 3,
    mitigation:
      'Service-van model standardizing onboarding. Hiring senior ops ' +
      'in Q3.',
    owner: 'Eric Race',
    trend: 'rising',
    tags: ['scaling'],
  },
  {
    category: 'operational',
    title: 'Field service capacity — contractors-only with 15-min SLA but no monitoring',
    description:
      'Thesis Hotel SLA commits to 15-minute incident acknowledgment ' +
      'but the company has no FT engineers, contractors only for ' +
      'field service, and per backlog.md no health endpoint or ' +
      'structured logging. The first 2 AM incident tests whether ' +
      'commitments can be met.',
    inherent_likelihood: 4, inherent_impact: 4,
    residual_likelihood: 3, residual_impact: 3,
    mitigation:
      'Service-van runbook + service contractor on retainer. Planned: ' +
      'health endpoint + Sentry/PagerDuty by end of Phase 1. FT field ' +
      'ops hire planned for Q3 2026. PagerDuty rotation including ' +
      'second admin needed.',
    owner: 'Eric Race',
    review_cadence_days: 14,
    trend: 'rising',
    linked_metrics: ['mttr_minutes', 'sla_hit_rate', 'health_endpoint_status'],
    tags: ['ops-capacity', 'sla', 'monitoring-gap', 'critical-watch'],
  },
  {
    category: 'operational',
    title: 'Vendor-TOS gray area — ADB-over-WiFi for real-time robot data',
    description:
      'Real-time robot telemetry currently relies on ADB-over-WiFi ' +
      'against the Keenon Android-based PEANUT app. Per open-' +
      'questions.md this is a "gray area." If Keenon enforces its ' +
      'TOS, our distribution evaporates — the platform layer would ' +
      'have no real-time signal from the deployed fleet.',
    inherent_likelihood: 3, inherent_impact: 4,
    residual_likelihood: 2, residual_impact: 4,
    mitigation:
      'Keenon partnership negotiation in flight to legitimize data ' +
      'access. Backup path: official Keenon Robot Command API (higher ' +
      'latency but legal). Avoid public marketing of the data-collection ' +
      'mechanism. Document fallback architecture before Phase 1.5.',
    owner: 'Eric Race',
    trend: 'stable',
    linked_metrics: ['vendor_tos_compliance', 'official_api_coverage_pct'],
    tags: ['vendor', 'platform', 'distribution'],
  },
  {
    category: 'operational',
    title: 'Single-custodian secrets — JWT/ADMIN/RESEND keys held only by Eric',
    description:
      'JWT_SECRET, ADMIN_PASSWORD, RESEND_API_KEY, Turso credentials ' +
      'are held only by Eric. If Eric is unavailable for >24h during ' +
      'an incident, no one can rotate secrets, restart the server, or ' +
      'access customer data. Continuity gap independent of the broader ' +
      'key-person risk.',
    inherent_likelihood: 3, inherent_impact: 4,
    residual_likelihood: 2, residual_impact: 3,
    mitigation:
      'Add second admin recipient on notification_recipients. Document ' +
      'secret-rotation runbook in docs/50-operations/runbooks/. ' +
      'Shared 1Password vault for designated successor (CTO hire). ' +
      'Quarterly access-control audit.',
    owner: 'Eric Race',
    review_cadence_days: 14,
    trend: 'stable',
    tags: ['continuity', 'secrets', 'security'],
  },

  // ─── Financial ──────────────────────────────────────────────────
  {
    category: 'financial',
    title: 'AR collection delays from hotel ops finance teams',
    description:
      'Hotel finance is 60-90 day net by default; our standard contract ' +
      'is Net-15. Bear case in financial-analysis.md assumes no terms ' +
      'drift — one large customer pushing Net-90 alone could trigger ' +
      'the $800K bridge.',
    inherent_likelihood: 4, inherent_impact: 3,
    residual_likelihood: 3, residual_impact: 3,
    mitigation:
      'Net-15 terms in standard contract. Up-front deposit on long ' +
      'pilots. Auto-reminders to AP contacts. Escalation to GM at ' +
      'day 30. Factor critical AR if drift hits 60+ days.',
    owner: 'Eric Race',
    trend: 'stable',
    linked_metrics: ['ar_aging_days', 'overdue_invoices', 'avg_dso'],
    tags: ['cash-cycle'],
  },
  {
    category: 'financial',
    title: 'Unit economics: bot cost per month vs RaaS revenue',
    description:
      'Bot capex + service costs need to clear ARR per bot. If unit ' +
      'economics flip negative we cannot scale without re-pricing. ' +
      '$2,850/mo RaaS commitment is flat all-inclusive (hardware, ' +
      'consumables, repairs, loaner robots, extended warranty, 24/7 ' +
      'on-call) per business-plan.md §6.',
    inherent_likelihood: 2, inherent_impact: 4,
    residual_likelihood: 2, residual_impact: 3,
    mitigation:
      '$1500-2500/mo per bot pricing tested. Goldilocks fit-score ' +
      'targets properties where the unit econ works. Quarterly cohort ' +
      'review.',
    owner: 'Eric Race',
    trend: 'stable',
    linked_metrics: ['avg_arr_per_bot', 'bot_lifetime_value', 'gross_margin_pct'],
    tags: ['unit-econ'],
  },
  {
    category: 'financial',
    title: 'Lease-financing dependency from Month 18 — failure forces early raise',
    description:
      'Per financial-analysis §6.2, equipment lessors are assumed to ' +
      'fund fleet capex from Month 18 at 7-10% all-in once 10 robots ' +
      'are deployed. If lessors do not materialize (robotics is a ' +
      'young asset class in lessor underwriting), the equity round ' +
      'must come 12 months earlier, with deal size ~30% larger and ' +
      'proportional dilution.',
    inherent_likelihood: 4, inherent_impact: 4,
    residual_likelihood: 3, residual_impact: 4,
    mitigation:
      'Pre-commit lessor relationships (Crest Capital, Ascentium, ' +
      'North Mill) in Phase 1. Goldilocks deployment criteria support ' +
      'lessor underwriting (revenue per bot). Plan B: revenue-based ' +
      'financing (Lighter Capital, Capchase) as bridge. Document term ' +
      'sheets with 2+ lessors before Month 12.',
    owner: 'Eric Race',
    trend: 'stable',
    linked_metrics: ['committed_lease_lines_usd', 'months_to_lease_dependency'],
    tags: ['capital-structure', 'fleet-finance', 'dilution', 'board-level'],
  },
  {
    category: 'financial',
    title: 'Insurance premium 3-5x spike post-incident',
    description:
      'Robotics liability insurance is a young market. Per Koop / ' +
      'Founder Shield / AXIS benchmarks, premiums spike 3-5x at ' +
      'renewal after any bodily-injury claim, cyber breach involving ' +
      'PHI, fleet expansion >2x, or CISA advisory naming the stack. ' +
      'A single incident at fleet of 7-15 robots could move annual ' +
      'premium from ~$25K to $75-125K.',
    inherent_likelihood: 3, inherent_impact: 4,
    residual_likelihood: 2, residual_impact: 4,
    mitigation:
      'Robotics-specific stack ($5M CGL + tech E&O + standalone cyber-' +
      'physical) bound before non-pilot deployment. Brokered through ' +
      'Founder Shield or Embroker. Customers named additional insureds ' +
      'with waiver of subrogation. Annual premium review.',
    owner: 'Eric Race',
    trend: 'stable',
    linked_metrics: ['annual_insurance_premium_usd'],
    tags: ['insurance', 'liability'],
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
      'Auto re-mapping on confidence-threshold breach. LiDAR scanner ' +
      'kit for site-walk re-baselines.',
    owner: 'Eric Race',
    trend: 'falling',
    linked_metrics: ['slam_confidence_avg', 'navigation_failures_24h'],
    tags: ['robotics-stack'],
  },
  {
    category: 'technology',
    title: 'Platform / orchestration availability — fleet-side coupling',
    description:
      'The orchestration platform going down would brick fleets at ' +
      'every customer site simultaneously. Render-hosted single ' +
      'point of failure. Robot-side autonomy needs to keep dispatching ' +
      'safe defaults during platform outage so customers do not see ' +
      'an immediate fleet halt.',
    inherent_likelihood: 3, inherent_impact: 3,
    residual_likelihood: 2, residual_impact: 2,
    mitigation:
      'Render deploy hook + manual deploy capability. Turso DB hosted ' +
      'externally so server restart is non-destructive. Robot-side ' +
      'fail-safe: continue last-known dispatch, refuse new tasks, ' +
      'alert local staff. Health endpoint + uptime monitor planned.',
    owner: 'Eric Race',
    trend: 'stable',
    linked_metrics: ['uptime_30d_pct', 'platform_outage_minutes_30d'],
    tags: ['infra', 'platform-availability'],
  },
  {
    category: 'technology',
    title: 'Hotel decision-maker PII exposure',
    description:
      'We collect hotel staff and decision-maker contacts in the ' +
      'inquiry + CRM tables. A leak would torch trust + trigger ' +
      'GDPR/CCPA exposure. Distinct from PHI/HIPAA exposure (Phase ' +
      '1.5+) which has its own regime.',
    inherent_likelihood: 2, inherent_impact: 4,
    residual_likelihood: 2, residual_impact: 3,
    mitigation:
      'JWT in httpOnly cookies, bcrypt 12 rounds, HTTPS-only, helmet ' +
      'CSP. No PII in logs. SOC 2 prep budgeted for next round.',
    owner: 'Eric Race',
    review_cadence_days: 14,
    trend: 'stable',
    tags: ['security', 'pii', 'compliance'],
  },
  {
    category: 'technology',
    title: 'Multi-vendor robot integration breakage from firmware updates',
    description:
      'When Keenon, Pudu, or Bear ship firmware updates, our ' +
      'orchestration layer can break silently — task dispatch fails, ' +
      'telemetry parsing breaks, status reporting drifts. This is ' +
      'THE risk for "one brain, many bots." Today the integration is ' +
      'unidirectional (we read Keenon state) and lightly tested.',
    inherent_likelihood: 4, inherent_impact: 4,
    residual_likelihood: 3, residual_impact: 3,
    mitigation:
      'Integration test harness with vendor firmware versions in CI. ' +
      'Canary fleet (1 robot per vendor) tracks firmware updates 1 ' +
      'week before fleet rollout. Vendor partnership tier provides ' +
      'firmware preview access. Versioned contract layer between ' +
      'platform and vendor adapters.',
    owner: 'Eric Race',
    review_cadence_days: 14,
    trend: 'rising',
    linked_metrics: ['vendor_firmware_lag_days', 'integration_test_pass_rate'],
    tags: ['thesis-critical', 'platform', 'integration'],
  },
  {
    category: 'technology',
    title: 'Hospital network / VLAN integration friction at every site',
    description:
      'Getting robots onto hospital VLANs is non-trivial and is Phase ' +
      '1 of every hospital deployment. IT review can take 6-12 weeks ' +
      'per site. Without a documented network-integration playbook + ' +
      'reference architecture (segmentation, certs, allow-listing), ' +
      'Phase 1.5 + Phase 2 deployments stall.',
    inherent_likelihood: 4, inherent_impact: 3,
    residual_likelihood: 3, residual_impact: 3,
    mitigation:
      'Network-integration playbook in docs/30-integrations/facilities/ ' +
      'targeted for Phase 1.5 readiness. Reference VLAN diagram for ' +
      'IT review. Pre-built CLI for cert + allow-list rollout. SOC 2 ' +
      'evidence pack expedites IT sign-off.',
    owner: 'Eric Race',
    trend: 'stable',
    linked_metrics: ['avg_hospital_it_review_weeks'],
    tags: ['hospital', 'network', 'phase-1.5'],
  },
  {
    category: 'technology',
    title: 'Turso (managed libsql) vendor survival',
    description:
      'ADR-0006 commits the customer/inquiry/admin DB to Turso ' +
      '(libsql managed). Turso is a Series A YC-backed startup; if ' +
      'they fail or change pricing materially, AR migrates the data ' +
      'layer. ADR-0006 itself acknowledges "if Turso disappears we\'d ' +
      'need to migrate."',
    inherent_likelihood: 3, inherent_impact: 3,
    residual_likelihood: 2, residual_impact: 3,
    mitigation:
      'Weekly DB export to S3-compatible storage. libsql is open-' +
      'source — escape hatch is self-hosted libsql or SQLite. Schema ' +
      'portable to Postgres if needed. Turso financial-health watch ' +
      'quarterly.',
    owner: 'Eric Race',
    trend: 'stable',
    tags: ['vendor-dependency', 'data', 'continuity'],
  },

  // ─── Regulatory ─────────────────────────────────────────────────
  {
    category: 'regulatory',
    title: 'UNITE HERE 165-day master-contract tech clause',
    description:
      'UNITE HERE master contracts with Marriott / Hilton / Hyatt ' +
      '(2018 round, preserved through 2024) require 30-day notice ' +
      'before changing existing tech and 165-day notice + right-to-' +
      'bargain before introducing new tech. Local 355 covers ~7,000 ' +
      'S. Florida workers (Fontainebleau, Loews, Eden Roc, Diplomat) ' +
      'and is litigious — multiple active NLRB cases against ' +
      'Fontainebleau. Any unionized property is a 165-day-lead ' +
      'deployment, not a feasibility question.',
    inherent_likelihood: 3, inherent_impact: 4,
    residual_likelihood: 3, residual_impact: 3,
    mitigation:
      'Position as labor augmentation (HAPI prevention, EVS heavy-' +
      'lift) not replacement. Lead with non-union boutique + limited-' +
      'service properties for Phase 1. Pre-screen GM on master tech ' +
      'clause before sales effort. Reserve 165-day lead time when a ' +
      'union shop signs.',
    owner: 'Eric Race',
    trend: 'stable',
    linked_metrics: ['news:unite-here-tech-clause', 'union_property_pct'],
    tags: ['labor', 'positioning', 'unite-here'],
  },
  {
    category: 'regulatory',
    title: 'SEIU 32BJ "robots replace janitors" South Florida campaign',
    description:
      '32BJ has an active S. Florida campaign explicitly against ' +
      'robot replacement of janitors. June 24, 2025: ~250 janitors ' +
      'rallied at Nova Southeastern University (Davie, FL) — district ' +
      'leader Andy Cabrera. Strike authorized June 28, 2025. August ' +
      '2025: University of Miami janitors strike auth. Most major ' +
      'Miami hospitals subcontract EVS to firms 32BJ organizes — ' +
      'direct conduit to Phase 1.5. "Robots replacing janitors at ' +
      'Jackson Memorial" is the most likely 2026 viral-incident ' +
      'scenario for our space.',
    inherent_likelihood: 3, inherent_impact: 4,
    residual_likelihood: 3, residual_impact: 3,
    mitigation:
      'Position as labor augmentation (carry burden, free EVS for ' +
      'high-touch surfaces) not replacement. Co-announce with EVS ' +
      'contractor BU where possible. Avoid 32BJ-organized properties ' +
      'for early Phase 1.5 pilots until proof points are public. ' +
      'Track 32BJ media + NLRB cases monthly.',
    owner: 'Eric Race',
    review_cadence_days: 14,
    trend: 'rising',
    linked_metrics: ['news:32bj-robot-campaign', 'news:seiu-32bj-fl'],
    tags: ['labor', 'florida', 'positioning', 'pr', '32bj'],
  },
  {
    category: 'regulatory',
    title: 'Tariffs, import bans, or covered-list designation on Chinese robotics vendors',
    description:
      'Date-anchored cliffs in 2026: DoD 1260H direct-procurement ' +
      'prohibition June 30, 2026 (Keenon/Pudu/Yunji not on list yet ' +
      'but ratchet ongoing); Affiliates Rule (50%) auto-resumes Nov ' +
      '10, 2026 after one-year suspension; US-China trade deal ' +
      'expires Nov 10, 2026. SCOTUS Feb 20, 2026 ruling lowered ' +
      'IEEPA tariff exposure but Section 301 unaffected. BIS Entity ' +
      'List had 3,163 entities Sept 2025 — Keenon/Pudu/Yunji not ' +
      'currently listed.',
    inherent_likelihood: 4, inherent_impact: 4,
    residual_likelihood: 4, residual_impact: 3,
    mitigation:
      'Active eval of Bear Robotics (S. Korean, LG-controlled — ' +
      'politically clean) + Yujin Robot (S. Korean, hospital fleet ' +
      'product). 90-day spare-unit inventory at flagship deployments. ' +
      'Customer contract substitution language allows platform swap ' +
      'if vendor becomes restricted. Diversify to non-PRC AMR before ' +
      'Q4 2026.',
    owner: 'Eric Race',
    review_cadence_days: 14,
    trend: 'rising',
    linked_metrics: [
      'news:china-robotics-tariff',
      'news:bis-entity-list-keenon-pudu',
      'news:section-1260h-robotics',
      'news:section-301-robotics',
      'news:affiliates-rule-resumption',
    ],
    tags: ['geopolitical', 'import-export', 'china', 'supply-chain', 'board-level'],
  },
  {
    category: 'regulatory',
    title: 'American Security Robotics Act (S. 4235 / H.R. 8189) federal procurement ban',
    description:
      'Bipartisan ASRA introduced March 2026 by Cotton (R-AR) + ' +
      'Schumer (D-NY) bans federal procurement of Chinese-made ' +
      'unmanned ground vehicles including humanoids. Federal funds ' +
      'blocked from supporting such tech. Agencies have 1 year to ' +
      'phase out existing systems. Senate Minority Leader as ' +
      'co-sponsor → high enactment probability. Initial scope is ' +
      'federal procurement only, but VA hospitals + military hospitals ' +
      'are in scope, and CMS-funded providers are the likely next ' +
      'ratchet.',
    inherent_likelihood: 3, inherent_impact: 4,
    residual_likelihood: 3, residual_impact: 3,
    mitigation:
      'Multi-vendor diversification (Bear, Yujin) reduces Chinese-' +
      'vendor exposure. Track Senate/House Committee markup + ' +
      'amendments weekly. Customer contract substitution language. ' +
      'Pivot non-federal markets initially; revisit federal channel ' +
      'after platform swap is provable.',
    owner: 'Eric Race',
    review_cadence_days: 14,
    trend: 'rising',
    linked_metrics: [
      'news:asra-enactment-status',
      'congress:s4235',
      'congress:hr8189',
    ],
    tags: ['geopolitical', 'china', 'legislation', 'board-level'],
  },
  {
    category: 'regulatory',
    title: 'Florida-state Chinese-tech ban — Texas precedent + Contec/Epsimed FL AG action',
    description:
      'Texas June 2025 enacted Cyber Command + ban on CCP-affiliated ' +
      'tech in state systems incl healthcare. FL AG James Uthmeier ' +
      'sued Contec (Chinese patient-monitor mfr) + Miami-based ' +
      'reseller Epsimed in 2025 over backdoored devices transmitting ' +
      'to a China IP. DeSantis admin shows appetite for China-tech ' +
      'actions (AI Bill of Rights Dec 2025). A Florida bill mirroring ' +
      'Texas is plausible by 2027 session and would specifically ' +
      'affect a Miami-based Chinese-vendor robotics integrator.',
    inherent_likelihood: 3, inherent_impact: 4,
    residual_likelihood: 3, residual_impact: 3,
    mitigation:
      'Multi-vendor diversification reduces FL-state exposure. ' +
      'Florida-state legislative tracking (LegiScan FL bills). ' +
      'Public messaging on supply-chain transparency. Customer ' +
      'contract platform-swap language. Engage FL state-affairs ' +
      'consultant before Phase 1.5.',
    owner: 'Eric Race',
    trend: 'rising',
    linked_metrics: [
      'news:florida-china-tech-ban',
      'news:contec-epsimed-flag',
      'news:florida-foreign-countries-of-concern',
    ],
    tags: ['geopolitical', 'florida', 'china', 'state-action'],
  },
  {
    category: 'regulatory',
    title: 'Robot safety certification (ANSI/ISO) gap',
    description:
      'Deploying without ANSI R15.08 / ISO 13482 certification opens ' +
      'liability if a robot causes injury. ANSI R15.08 explicitly ' +
      'EXCLUDES medical/surgical/rehabilitative mobile robots but is ' +
      'still used as procurement floor for non-clinical AMRs. ISO ' +
      '13482 voluntary today, effectively required at Phase 2/3. IEC ' +
      '63310 (Jan 2025) coming for humanoids.',
    inherent_likelihood: 2, inherent_impact: 4,
    residual_likelihood: 2, residual_impact: 3,
    mitigation:
      'Keenon units carry CE mark + UL listing. Q3 effort to add ' +
      'R15.08-1 conformance attestation. ISO 13482 risk-assessment ' +
      'process baked into Phase 2 design. Pilz / SICK consultancy ' +
      'engagement for Phase 2 gates.',
    owner: 'Eric Race',
    trend: 'stable',
    tags: ['compliance', 'safety', 'ansi-iso'],
  },
  {
    category: 'regulatory',
    title: 'HIPAA BAA exposure on first hospital task',
    description:
      'The moment a robot dispatches a task tied to room number + ' +
      'patient context, the orchestration backend ingests PHI. Without ' +
      'an executed BAA, this is the canonical fact pattern that ' +
      'produces six-figure OCR settlements (Solara $3M Jan 2025; MMG ' +
      'Fusion $10K + 3-yr CAP; BST $175K). Penalty band $137-' +
      '$2,134,831 per violation/year. A breach without BAA + 3-yr CAP ' +
      'is fatal for a seed/Series A startup.',
    inherent_likelihood: 4, inherent_impact: 5,
    residual_likelihood: 3, residual_impact: 4,
    mitigation:
      'BAA template adopted before any clinical-site MOU. SOC 2 Type ' +
      'II observation window starts Q3 2026. HITRUST r2 readiness ' +
      'budgeted for Phase 1.5. Architecture splits PHI / non-PHI in ' +
      'data model. No-PHI-on-device default; blur faces / room signs ' +
      'at the edge.',
    owner: 'Eric Race',
    review_cadence_days: 14,
    trend: 'rising',
    linked_metrics: ['news:ocr-baa-enforcement', 'soc2_type2_status'],
    tags: ['hipaa', 'phi', 'phase-1.5', 'compliance', 'board-level'],
  },
  {
    category: 'regulatory',
    title: 'GHX / SOC 2 Type II / HITRUST r2 procurement gates',
    description:
      'Hospital procurement is gated by GHX Vendormate (90%+ of US ' +
      'hospitals), SOC 2 Type II (Premier/Vizient minimum), and ' +
      'HITRUST r2 (HCA, Ascension, CommonSpirit, Kaiser tier IDNs). ' +
      'Cycle is 9-18 months. SOC 2 requires ~6-month observation ' +
      'window. HITRUST r2 = $50-150K. Not starting now means losing ' +
      'the first hospital deal to a competitor that is already gated ' +
      'through.',
    inherent_likelihood: 4, inherent_impact: 4,
    residual_likelihood: 3, residual_impact: 4,
    mitigation:
      'Begin SOC 2 Type II observation window Q3 2026. GHX Vendormate ' +
      'registration Q2 2026. HITRUST r2 readiness assessment when ' +
      'Atlas Mobility hospital channel confirmed. Joint Commission ' +
      'AI standards / CHAI guidelines monitored quarterly.',
    owner: 'Eric Race',
    trend: 'rising',
    linked_metrics: [
      'ghx_vendormate_registered',
      'soc2_type2_obs_pct',
      'hitrust_r2_score',
    ],
    tags: ['procurement', 'compliance', 'phase-1.5', 'board-level'],
  },
  {
    category: 'regulatory',
    title: 'FDA pathway — Phase 2 patient transport (Class II) / Phase 3 humanoid',
    description:
      'Phase 2 (autonomous patient transport) likely classifies as ' +
      'Class II under 21 CFR 890.3860 — 510(k) pathway 6-12 months ' +
      'once predicate identified. Phase 3 (patient-touching humanoids) ' +
      'likely Class II/III; PMA cost $5M+ and 2-4 years. As of May ' +
      '2026 no humanoid in the Figure/1X/Apptronik/Tesla family has ' +
      'an active 510(k) or de novo. The orchestration platform itself ' +
      'becomes implicated when dispatching transport tasks tied to ' +
      'patient context (potential SaMD).',
    inherent_likelihood: 2, inherent_impact: 4,
    residual_likelihood: 2, residual_impact: 3,
    mitigation:
      'Phase 1 marketing claims strictly "logistics / non-patient-' +
      'contact" through 2026. FDA regulatory strategy memo before ' +
      'Phase 2 design freeze. Q-Submission (Pre-Sub) 18 months before ' +
      'any humanoid pilot. Predicate hunt is the long pole.',
    owner: 'Eric Race',
    review_cadence_days: 90,
    trend: 'stable',
    linked_metrics: ['news:fda-robot-510k-clearances'],
    tags: ['fda', 'phase-2', 'phase-3', 'samd'],
  },

  // ─── People ─────────────────────────────────────────────────────
  {
    category: 'people',
    title: 'Eric Race key-person risk',
    description:
      'Eric is single point of knowledge for elevator integration ' +
      'logic, investor relationships, and pilot deployment runbooks. ' +
      'Loss or extended unavailability would stall every workstream.',
    inherent_likelihood: 2, inherent_impact: 5,
    residual_likelihood: 2, residual_impact: 4,
    mitigation:
      'Documentation push: every elevator install has a written ' +
      'runbook in docs/. Investor warm intros documented. CTO hire in ' +
      'next-round plan. Second admin recipient + secret-rotation runbook.',
    owner: 'Eric Race',
    trend: 'falling',
    tags: ['key-person', 'continuity'],
  },
  {
    category: 'people',
    title: 'Senior engineering hiring pipeline thin',
    description:
      'Pre-Series-A pulls senior talent slowly. Without a CTO + 2 ' +
      'senior engineers in 6 months, scaling beyond Miami stalls.',
    inherent_likelihood: 4, inherent_impact: 3,
    residual_likelihood: 3, residual_impact: 3,
    mitigation:
      'Active outreach to robotics + hospitality-tech veterans. KOL ' +
      'network (Cem Ersoz at Simbe). Founder-led recruiting until ' +
      'first hire. FL CHOICE Act non-competes at hire (effective July ' +
      '3, 2025) maximize retention enforceability.',
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
      'Hiring will redistribute load. Friday recap meetings track ' +
      'velocity vs sustainable cadence.',
    owner: 'Eric Race',
    trend: 'stable',
    tags: ['velocity', 'culture'],
  },
  {
    category: 'people',
    title: 'No clinical / hospital-ops leader on the team',
    description:
      'Per team.md, team is Eric (founder) + field service contractors. ' +
      'No hospital-domain leadership: no nurse, no EVS director, no ' +
      'hospital CIO, no clinical informaticist. The thesis is hospital ' +
      'orchestration; absence of clinical credibility is a fatal gap ' +
      'for the first hospital sale and Atlas Mobility channel handoff.',
    inherent_likelihood: 4, inherent_impact: 4,
    residual_likelihood: 3, residual_impact: 4,
    mitigation:
      'Active outreach to Atlas Mobility hospital relationships for ' +
      'advisor / first-hire conversion. Cem Ersoz (Simbe) KOL channel. ' +
      'Target: clinical advisor (paid + equity) by Q4 2026; full-time ' +
      'clinical lead by Phase 1.5 sale.',
    owner: 'Eric Race',
    trend: 'stable',
    linked_metrics: ['clinical_advisor_signed', 'clinical_leader_hired'],
    tags: ['hiring', 'clinical', 'thesis-critical'],
  },
  {
    category: 'people',
    title: 'Atlas Mobility CEO time allocation conflict',
    description:
      'Eric runs both Atlas Mobility (Phase 1.5 component, separate ' +
      'company) and Accelerate Robotics. financial-analysis.md assumes ' +
      'Eric full-time on AR. Atlas team context lives in Eric\'s ' +
      'personal notes per team.md, not this repo. No documented time-' +
      'allocation framework, no CEO-day-share agreement. Diligence ' +
      'risk at Series A.',
    inherent_likelihood: 3, inherent_impact: 4,
    residual_likelihood: 2, residual_impact: 4,
    mitigation:
      'Quarterly time-share log to AR board. Documented CEO-services ' +
      'agreement between AR and Atlas. Prioritization framework: AR ' +
      'first during Phase 1 push. Eventual full-time decision when one ' +
      'company hits Series A.',
    owner: 'Eric Race',
    trend: 'stable',
    tags: ['key-person', 'related-party', 'atlas-mobility'],
  },

  // ─── Legal ──────────────────────────────────────────────────────
  {
    category: 'legal',
    title: 'Provisional patent on button emulator NOT YET FILED — public BOM disclosure',
    description:
      'Per current-quarter.md the provisional on the button emulator ' +
      'relay-parallel technique remains a must-ship — UNFILED. ' +
      'Meanwhile docs/30-integrations/elevator/button-emulator.md ' +
      'publishes the BOM down to part numbers and is on the live ' +
      'public site. Public disclosure before filing potentially ' +
      'compromises novelty under 35 USC 102. Every day the timestamp ' +
      'walks further into prior-art territory.',
    inherent_likelihood: 5, inherent_impact: 4,
    residual_likelihood: 4, residual_impact: 4,
    mitigation:
      'URGENT — file provisional within 30 days. Patent counsel ' +
      'engaged. Concurrent FTO opinion specifically against Mitsubishi ' +
      'US12428262B2 (separate risk). Pull or paywall the public BOM ' +
      'documentation pending filing. Document disclosure-date ' +
      'timeline in case priority must be argued.',
    owner: 'Eric Race',
    review_cadence_days: 7,
    trend: 'rising',
    linked_metrics: ['provisional_filed_date', 'days_since_public_disclosure'],
    tags: ['patent', 'ip', 'urgent', 'board-level', 'critical-watch'],
  },
  {
    category: 'legal',
    title: 'Mitsubishi US12428262B2 prior-art read on relay-parallel button emulation',
    description:
      'Mitsubishi Electric Research Labs received US patent ' +
      '12,428,262 B2 on Sept 30, 2025 (priority Oct 4, 2020) claiming ' +
      '"isolation relay cards [providing] an isolated dry contact as a ' +
      'simulated human input, i.e. button presses, that are interpreted ' +
      'by an elevator group controller (EGC) unit as floor dispatch ' +
      'requests." Direct read on AR\'s wedge mechanism. Without an FTO ' +
      'opinion, AR risks an obviousness rejection on its own non-' +
      'provisional and infringement claims when commercializing.',
    inherent_likelihood: 4, inherent_impact: 4,
    residual_likelihood: 3, residual_impact: 4,
    mitigation:
      'FTO opinion in flight ($5-10K with patent counsel, Mitsubishi ' +
      'spec on the desk). Non-provisional claims drafted to ' +
      'distinguish — mobile-robot-triggered, RF-link from robot to ' +
      'wedge, retrofit-without-rewiring, $23 BOM. Trade-secret ' +
      'protection on install procedure as patent complement.',
    owner: 'Eric Race',
    trend: 'stable',
    linked_metrics: ['fto_opinion_status'],
    tags: ['patent', 'ip', 'prior-art', 'wedge'],
  },
  {
    category: 'legal',
    title: 'Keenon vendor liability cap absorbs by AR as integrator',
    description:
      'Industry-standard Chinese-OEM contracts cap liability at ' +
      'price paid in trailing 12 months (~$20-50K per robot), ' +
      'disclaim CISG, set forum to HKIAC arbitration, exclude IP ' +
      'indemnity for embedded firmware. As integrator, AR sits in the ' +
      'most-exposed seat — when a Keenon robot causes injury, AR ' +
      'absorbs everything above the cap. Plaintiff demand of $1-5M ' +
      'against Keenon\'s ~$30K firewall puts AR on the hook.',
    inherent_likelihood: 4, inherent_impact: 4,
    residual_likelihood: 3, residual_impact: 4,
    mitigation:
      'Side letter with Keenon (negotiate before next robot order ' +
      'while leverage is fresh): uncapped indemnity for personal ' +
      'injury + IP infringement; AR named additional insured on ' +
      'Keenon\'s product-liability policy with $5M limit; US forum + ' +
      'US law clause; firmware-IP indemnity carved back in. ' +
      'Robotics-specific liability stack for AR layered on top.',
    owner: 'Eric Race',
    trend: 'stable',
    tags: ['vendor', 'liability', 'contracts', 'keenon'],
  },
  {
    category: 'legal',
    title: 'Atlas Mobility ↔ Accelerate Robotics related-party governance',
    description:
      'Eric runs both companies. Atlas is positioned as Phase 1.5 ' +
      'inside AR\'s roadmap. No documented IP assignment, no services ' +
      'agreement, no non-compete, no reimbursement structure visible ' +
      'in this repo. VC diligence kills deals over related-party ' +
      'messes more often than over technology — and Atlas (existing) ' +
      'feeding into AR (new) Phase 1.5 is a textbook flag.',
    inherent_likelihood: 4, inherent_impact: 4,
    residual_likelihood: 3, residual_impact: 3,
    mitigation:
      'Related-party memo from deal counsel ($5-10K) catalogues every ' +
      'Atlas↔AR touchpoint with arm\'s-length analysis. Intercompany ' +
      'services agreement before next raise. Explicit IP allocation ' +
      'for any pre-incorporation work. Independent counsel on each ' +
      'cross-deal. Annual related-party disclosure to board.',
    owner: 'Eric Race',
    trend: 'rising',
    tags: ['related-party', 'governance', 'series-a', 'atlas-mobility', 'board-level'],
  },
  {
    category: 'legal',
    title: 'UL listing absence on button emulator (UL 508A / ASME A17.7)',
    description:
      'Per docs/30-integrations/elevator/button-emulator.md the wedge ' +
      'will need its own UL listing for commercial install (target UL ' +
      '508A). ASME A17.7 / CSA B44.7 governs elevator components. ' +
      'Without UL, no major hospital or hotel facilities team will ' +
      'sign off post-pilot. UL component cert ~$22-30K and 6 months. ' +
      'Commercial sale legality uncertain in jurisdictions requiring ' +
      'listed components.',
    inherent_likelihood: 3, inherent_impact: 4,
    residual_likelihood: 3, residual_impact: 3,
    mitigation:
      'UL component certification engagement to start by Q3 2026 ' +
      '(6-9 month lead). Field-replaceable, fail-safe-open design ' +
      '(failure = wedge disconnects, original button still works). ' +
      'Firmware signing + secure boot. Installer certification program ' +
      'so AR (not customer\'s electrician) bears install risk. ' +
      'Product-liability policy with $5M minimum specifically scheduling ' +
      'the wedge SKU.',
    owner: 'Eric Race',
    trend: 'rising',
    linked_metrics: ['ul_certification_status', 'asme_a17_7_compliance'],
    tags: ['ul', 'compliance', 'wedge', 'commercial'],
  },
  {
    category: 'legal',
    title: 'Field service contractor classification (1099 → W-2 reclassification)',
    description:
      'Field service techs install wedges, monitor robot fleets at ' +
      'single customers for weeks at a time, in AR-branded gear, with ' +
      'AR-issued tools, on AR\'s schedule — these are employees under ' +
      'any IRS or DOL test. Misclassification penalties: back wages, ' +
      'overtime, employer-side payroll tax, ACA penalties, plus FL ' +
      'state-level. Silent until a state DOL letter arrives.',
    inherent_likelihood: 3, inherent_impact: 3,
    residual_likelihood: 2, residual_impact: 2,
    mitigation:
      'Reclassify all current 1099 field service to W-2 by Q3 2026. ' +
      'Engineering hires onto FL CHOICE Act non-competes (effective ' +
      'July 3, 2025) at hire to maximize enforceability with garden-' +
      'leave option. Annual classification audit. Employment counsel ' +
      'review of contractor-vs-employee tests.',
    owner: 'Eric Race',
    review_cadence_days: 90,
    trend: 'rising',
    tags: ['employment', 'classification', 'florida'],
  },

  // ─── Reputation ─────────────────────────────────────────────────
  {
    category: 'reputation',
    title: 'Robot incident at a flagship deployment goes viral',
    description:
      'A robot collision, fall, or guest-injury video at Fontainebleau ' +
      'or Thesis Hotel would dominate hospitality news for a week. ' +
      'Benchmark: Figure AI whistleblower lawsuit Nov 2025 alleged ' +
      'humanoids "could fracture human skull" with 20× pain-threshold ' +
      'forces. Texas restaurant Servi malfunction (2024-25) went ' +
      'viral. The space is "one bad video away from policy attention."',
    inherent_likelihood: 2, inherent_impact: 5,
    residual_likelihood: 2, residual_impact: 4,
    mitigation:
      'Speed-limited robots in guest areas. Fail-safe stop on obstacle ' +
      'within 50cm. Incident-response playbook (legal, comms, ops) ' +
      'ready. Insurance with cyber-physical coverage. Pre-recorded ' +
      'on-camera response from CEO ready in 2 hours of incident.',
    owner: 'Eric Race',
    review_cadence_days: 14,
    trend: 'stable',
    linked_metrics: ['news:figure-ai-incidents', 'news:service-robot-incidents'],
    tags: ['incident', 'pr'],
  },
  {
    category: 'reputation',
    title: 'Negative customer review on hospitality + hospital channels',
    description:
      'Hotelier forums (Hotelmanagement.net, HotelTechReport) move ' +
      'opinion in hospitality. Per the hospital thesis, hospital ' +
      'channels (Becker\'s Hospital Review, Modern Healthcare, AHA ' +
      'News, KevinMD, AONL) move opinion in healthcare — different ' +
      'audience, different velocity. A negative story closes ' +
      'category-specific doors. Older patient demo skews Gen X / ' +
      'Boomer = least receptive cohort per hotel-guest data.',
    inherent_likelihood: 2, inherent_impact: 3,
    residual_likelihood: 2, residual_impact: 2,
    mitigation:
      'Weekly check-ins with deployed customers. Net Promoter survey ' +
      'after 30 days. Issue escalation to Eric for any score below 7. ' +
      'Hospital-channel earned-media plan as Phase 1.5 nears. Visible-' +
      'deployment policy: signage, staff endorsement, clinical advisor ' +
      'by-line on Phase 1.5 launch piece.',
    owner: 'Eric Race',
    trend: 'stable',
    linked_metrics: [
      'news:hotelmanagement-net',
      'news:beckers-hospital-review',
      'news:modern-healthcare',
      'news:aha-news',
    ],
    tags: ['customer-success', 'pr', 'hospital'],
  },
];
