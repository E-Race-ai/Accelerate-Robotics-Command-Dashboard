# Accelerate Robotics — Financial Analysis

**Working draft · Q2 2026**

A detailed look at the economics of Accelerate Robotics — unit economics, revenue model, cost structure, three-year forecast, capital requirements, financing strategy, and sensitivity analysis.

This document goes deeper than the financial section of [`business-plan.md`](business-plan.md). The business plan is the narrative; this is the numbers. Use this when you're sizing a raise, modeling a scenario, or explaining the economics to an investor, a banker, or a lender.

All figures are planning numbers in 2026 USD. They are defensible but not guaranteed. Every assumption is called out in Section 11 so you can change one and re-run.

---

## 1. Executive summary

**The business model works on one robot and gets better with every one we add.**

- **Gross margin is ~50% starting at the first robot.** Revenue of $2,850/month per robot against a fully-loaded cost of $1,422/month leaves $1,428/month of gross profit. That 50% margin holds from robot #1 and improves with scale.
- **Cash-flow positive at ~20 robots under management.** That is where fixed overhead (management labor, G&A, software, insurance) is covered by gross profit. At Thesis Hotel alone we're at 7 robots; two reference sites behind it and the business is net-positive without another dollar of outside capital.
- **Capital need through the first 18 months is ~$1.2M.** Fleet capex ($572K), implementation ($110K), and G&A/payroll/reserve ($555K). This is the Seed-stage raise that gets us to signed healthcare pilot and ~25 robots under management — enough revenue and references to support a Series A on substantially better terms.
- **Revenue scales from ~$50K ARR to ~$2.7M ARR over three years** under the base-case plan, with gross profit scaling from $25K to $1.5M and net income crossing zero in late 2027.
- **The story is fleet leverage.** Every new robot adds $17K/year of gross profit once it clears the ramp. The game is volume and utilization.

### One-page summary table

| Metric | Today (Q2 2026) | End 2026 | End 2027 | End 2028 |
|---|---|---|---|---|
| Robots under management | 1 | ~10 | ~35 | ~80 |
| Annual recurring revenue | ~$28K | ~$340K | ~$1.2M | ~$2.7M |
| Gross margin | ~40% (pilot) | ~50% | ~52% | ~55% |
| Gross profit | ~$11K | ~$170K | ~$620K | ~$1.5M |
| Operating expense | ~$50K/mo | ~$65K/mo | ~$90K/mo | ~$125K/mo |
| EBITDA | (~$560K) | (~$610K) | (~$460K) | +$40K |
| Cumulative cash burn | $560K | $1.17M | $1.63M | $1.59M |

**Read that last row carefully.** Cumulative burn *peaks* in 2027 at ~$1.63M and then starts coming down. That's the shape of a capital-efficient business — not one that needs successive mega-rounds.

---

## 2. Unit economics — the engine

Everything in this business comes out of the per-robot unit economics. Get this right and the rest is execution.

### Cost buildup — per robot per month

| Category | Monthly cost | Basis |
|---|---|---|
| Hardware depreciation / lease | $403 | $14,500 avg acquisition ÷ 36 months |
| Consumables (brushes, filters, solution, mop pads) | $135 | Replace cycles per manufacturer spec |
| Maintenance & repair reserve | $121 | 10% of acquisition cost / year |
| Software & connectivity | $50 | Cellular SIM + fleet management platform |
| Electricity | $25 | ~0.5 kWh/charge × 1–2 charges/day × $0.15 |
| Allocated management labor | $625 | $2,500/mo ops ÷ 4-robot cluster |
| Insurance allocation | $63 | $3,000/yr ÷ 12 ÷ 4 robots |
| **Total cost per robot per month** | **$1,422** | |

See [`../../public/pricing-model.html`](../../public/pricing-model.html) for the underlying build-up.

### Revenue — per robot per month

| Rate | Monthly revenue | Notes |
|---|---|---|
| **Standard RaaS** | **$2,850** | Flat monthly, all-inclusive |
| Pilot rate (first 30 days only) | $2,300 | 19% discount to reduce adoption friction |

### Gross profit per robot

| Metric | Standard | Pilot |
|---|---|---|
| Revenue | $2,850 | $2,300 |
| Cost | ($1,422) | ($1,422) |
| **Gross profit** | **$1,428** | **$878** |
| **Gross margin** | **50.1%** | **38.2%** |
| Annualized gross profit | $17,136 | — |

**Each robot added to the fleet after the pilot clears ~$17K of gross profit per year, every year it operates.** That is the math that makes the whole business work.

### How unit economics improve with scale

Three levers compress cost per robot as the fleet grows:

1. **Management labor dilution.** At 4 robots, $2,500/month of ops labor = $625/robot. At 40 robots covered by 2 ops people ($5,000/month), it drops to $125/robot. **Saves ~$500/robot/month.**
2. **Hardware wholesale.** First-site pricing is distributor-based (~$14,500 avg). A direct Keenon wholesale agreement, likely available once we pass ~20 robots under management, cuts hardware by 20–40% — **saves ~$80–$160/robot/month** on depreciation.
3. **Consumables and insurance procurement.** Negotiated bulk pricing and portfolio-level insurance policies save roughly **$40/robot/month** at 50+ robots.

Combined effect at ~50 robots: cost drops from $1,422 to ~$750–$850/month, lifting gross margin from 50% to ~70% at the same $2,850 price. That is the compound curve investors care about.

---

## 3. Revenue model and streams

Six revenue streams, in order of current importance.

### 3.1 Robot-as-a-Service (RaaS) — primary

Flat monthly per robot, all-inclusive, billed on a 90-day minimum with 30-day cancellation.

- **Standard rate:** $2,850/robot/month
- **Pilot rate:** $2,300/robot/month (30-day only)
- **Multi-robot discount:** None in Year 1. As the fleet grows, volume discounts become a selling tool — but for now, we sell at full rate to protect margin on the smallest deployments.
- **Monitoring add-on:** Flat monthly fee per monitored corridor, TBD — not modeled in base case. First test is the Thesis Hotel residences use case.

**Characteristics:** Predictable, sticky, high-gross-margin. Net revenue retention target is 110%+ (customers grow their fleet after Phase 1).

### 3.2 Implementation services

One-time fees charged at deployment.

| Scope | Fee | Included |
|---|---|---|
| Site survey | $2,500 | 1-day on-site walk, photo documentation, Wi-Fi survey, elevator assessment, written report |
| SLAM mapping + route design (per robot) | $1,500 | Facility map, route creation, testing |
| 3-day on-site commissioning training | $3,750 | Day 1 setup, Day 2 staff training, Day 3 launch |
| Elevator integration (button emulator install) | $4,500 + $250/floor | Hardware BOM, labor, commissioning |

**Characteristics:** Margin around 60–70% (primarily labor), one-time, front-loaded to each deployment. In early revenue, implementation fees are a meaningful portion of recognized revenue but **aren't** included in the ARR projections in Section 5 — they're added separately.

### 3.3 Universal Button Emulator (hardware product)

Our own-IP hardware product. Sold either as part of a RaaS deployment or standalone to buildings that only need elevator integration.

- **BOM:** ~$23/floor (ESP32-C3 + OMRON SSRs + Pololu buck + housing)
- **Installed price:** $500–$1,500 per floor, depending on complexity
- **Gross margin:** 85%+ at volume

Standalone sales start in 2027 once the reference install is proven. See [`../30-integrations/elevator/button-emulator.md`](../30-integrations/elevator/button-emulator.md) and ADR-0005.

### 3.4 Orchestration software (SaaS)

Future revenue line that separates when a customer wants to run multi-vendor fleets without RaaS — i.e., they own or lease robots from other sources but want our platform to manage them.

- **Target pricing:** $100–$250/robot/month for software-only
- **Launch target:** 2027, once platform V2 ships and we have a multi-vendor reference

### 3.5 Managed operations (remote fleet supervision)

For customers with internal robotics or separate lease financing who want our ops team to run the fleet. Priced on a per-robot-month basis with a minimum, overlapping RaaS economics without the hardware. Launches when the first non-RaaS customer asks for it.

### 3.6 Future high-margin streams

- **Robot-screen advertising** — pharma messaging in hospital fleets, brand messaging in hotel fleets. High-margin, requires scale. Not in the base-case forecast.
- **De-identified data insights** — operational data to insurers, vendors, researchers. Long-horizon, requires scale and regulatory clearance.

---

## 4. Cost structure

Two categories: **COGS** (direct cost of the fleet) and **OpEx** (everything else).

### 4.1 COGS — fleet operating cost

Per the unit economics in Section 2, COGS is $1,422/robot/month at today's scale. Scales as a function of the fleet:

| Fleet size | COGS / mo | COGS / yr |
|---|---|---|
| 7 robots (Thesis Hotel) | $9,954 | $119,448 |
| 20 robots (5 properties) | $28,440 | $341,280 |
| 50 robots | ~$50,000 | ~$600,000 |
| 140 robots (35 properties) | ~$165,000 | ~$2.0M |

Note COGS compresses per-unit at the 50+ robot mark as management labor and procurement dilute. The table above uses a conservative straight-line assumption; see Section 9 for the optimistic case.

### 4.2 OpEx — everything not direct COGS

OpEx ramps with team growth. The plan is conservative: hire only when a customer payload or sales pipeline requires it.

| Category | 2026 (annual) | 2027 (annual) | 2028 (annual) |
|---|---|---|---|
| **Payroll — founder + ops** | $180,000 | $280,000 | $380,000 |
| **Payroll — engineering** | $60,000 (contract) | $160,000 (1 FTE) | $320,000 (2 FTE) |
| **Payroll — sales / CS** | $0 | $110,000 (1 FTE) | $220,000 (2 FTE) |
| **Payroll — field service** | $0 | $80,000 | $180,000 |
| **Contractors / advisors** | $40,000 | $40,000 | $40,000 |
| **G&A — legal, accounting, insurance, compliance** | $60,000 | $80,000 | $100,000 |
| **SaaS and infra** | $15,000 | $25,000 | $40,000 |
| **Marketing, website, content** | $25,000 | $45,000 | $70,000 |
| **Travel and site visits** | $25,000 | $40,000 | $60,000 |
| **Office, equipment, misc** | $20,000 | $30,000 | $50,000 |
| **Total OpEx** | **$425,000** | **$890,000** | **$1,460,000** |

Founder salary is conservative — $180K in 2026 is a working market rate for a founder/CEO. The line is flexible in a tight cash scenario.

### 4.3 Customer acquisition cost

Today's CAC is low because the founder sells directly and every deal is warm-introduction. Early assumption:

- **Blended CAC (Year 1–2):** ~$8,000 per property, covering founder time, travel, site survey, proposal prep, and any marketing attribution
- **LTV per property (3-year):** ~$300K revenue × 50% GM × 80% retention = ~$120K gross profit
- **LTV / CAC:** 15x — healthy by any SaaS benchmark

CAC will rise as we move to paid outbound and channel partners in 2027. Model a $20K CAC by 2028 and the LTV/CAC is still 6x+.

---

## 5. Three-year financial forecast

Base-case forecast. Assumptions in Section 11. Sensitivity scenarios in Section 9.

### 5.1 Fleet growth

| Quarter | Robots added | Fleet size (end) | Cumulative customers |
|---|---|---|---|
| **2026 Q2** | +1 (Thesis pilot) | 1 | 1 |
| **2026 Q3** | +4 (Thesis Phase 2) | 5 | 1 |
| **2026 Q4** | +2 (Thesis Phase 3) + 3 (new property) | 10 | 2 |
| **2027 Q1** | +5 (property #3) | 15 | 3 |
| **2027 Q2** | +5 (property #4) | 20 | 4 |
| **2027 Q3** | +7 (first hospital pilot) | 27 | 5 |
| **2027 Q4** | +8 (property #5 + hospital expansion) | 35 | 6 |
| **2028 Q1** | +10 | 45 | 7 |
| **2028 Q2** | +10 | 55 | 8 |
| **2028 Q3** | +12 | 67 | 9 |
| **2028 Q4** | +13 (hospital system contract) | 80 | 10 |

### 5.2 Revenue build (by year)

All figures in USD. ARR = exit-quarter annualized; recognized revenue is quarterly-weighted average.

| Line | 2026 | 2027 | 2028 |
|---|---|---|---|
| Robots under management (end of year) | 10 | 35 | 80 |
| Exit ARR | $342,000 | $1,197,000 | $2,736,000 |
| **Recognized RaaS revenue** | **$95,000** | **$690,000** | **$1,800,000** |
| Implementation services revenue | $35,000 | $90,000 | $180,000 |
| Button emulator revenue | $0 | $40,000 | $120,000 |
| **Total recognized revenue** | **$130,000** | **$820,000** | **$2,100,000** |

**Why recognized revenue lags exit ARR:** a robot added in Q3 only generates 6 months of billing by year-end. The 2026 year-in-view of $95K is built on 7 months of Thesis + 2–3 months of customer #2.

### 5.3 P&L — three-year base case

| Line | 2026 | 2027 | 2028 |
|---|---|---|---|
| **Recognized revenue** | $130,000 | $820,000 | $2,100,000 |
| COGS (fleet operating) | ($55,000) | ($390,000) | ($920,000) |
| **Gross profit** | **$75,000** | **$430,000** | **$1,180,000** |
| Gross margin % | 58% | 52% | 56% |
| Operating expense | ($425,000) | ($890,000) | ($1,460,000) |
| **EBITDA** | **($350,000)** | **($460,000)** | **($280,000)** |
| D&A (fleet depreciation, already in COGS) | — | — | — |
| Interest (lease financing) | ($15,000) | ($45,000) | ($90,000) |
| **Net income** | **($365,000)** | **($505,000)** | **($370,000)** |

Gross margin % is inflated in 2026 because implementation revenue (higher margin) is a larger portion of total revenue; it normalizes as RaaS takes over.

### 5.4 Cash flow — capital use and burn

| Line | 2026 | 2027 | 2028 |
|---|---|---|---|
| Cash from operations (EBITDA) | ($350,000) | ($460,000) | ($280,000) |
| Fleet capex (cash-paid, not leased) | ($180,000) | ($120,000) | ($80,000) |
| Working capital | ($20,000) | ($40,000) | ($60,000) |
| **Cash burn** | **($550,000)** | **($620,000)** | **($420,000)** |
| Cumulative burn | $550,000 | $1,170,000 | $1,590,000 |

Net cash need over 3 years is $1.59M. With ~20% cash buffer and lease financing for new fleet from Month 18 on, a $1.5M Seed round covers the business to cash-flow positive by late 2028.

---

## 6. Capital requirements and use of funds

### 6.1 Seed round — $1.5M (Q3 2026)

**Use of funds (18-month deployment):**

| Bucket | $ | % | Purpose |
|---|---|---|---|
| Fleet capex | $450,000 | 30% | ~30 robots at distributor pricing. Purchased outright or down-payment for lease financing. |
| Implementation and commissioning | $120,000 | 8% | Site survey, mapping, training, elevator installs across first 5–6 sites |
| Payroll — engineering | $260,000 | 17% | First full-time platform engineer + contract support |
| Payroll — field service | $120,000 | 8% | First field ops hire to cover 10+ robots under management |
| Payroll — founder | $270,000 | 18% | 18 months founder/CEO compensation |
| Sales, marketing, travel | $90,000 | 6% | Pipeline development beyond founder's warm network |
| G&A, legal, insurance | $130,000 | 9% | Corporate formation (done), ongoing legal, D&O, general liability |
| **Operating reserve / runway buffer** | **$60,000** | **4%** | ~4 weeks of OpEx |
| **Total** | **$1,500,000** | **100%** | |

**Milestones the round buys:**

- 25–30 robots under management
- 5–6 hospitality reference sites operating
- First hospital pilot signed
- Platform V2 (multi-tenant, multi-vendor) shipped
- Credible Series A metrics (~$1M ARR, 50%+ GM, 110%+ NRR)

### 6.2 Post-Seed capital needs

**Series A — $8–12M (early 2028):**

Raised on the back of the first hospital system reference and $1M+ ARR. Funds a 3–4x expansion of the fleet, first sales team, and real marketing spend. Equity-efficient because valuation is supported by hospital contract and recurring revenue.

**Fleet lease financing — $2–5M (ongoing from Q4 2026):**

Robots are a financeable asset. A $15K robot earning $2,850/month of revenue has clean lease math — most equipment lessors will finance at 7–10% all-in over 36 months against the underlying residual. Using lease financing for fleet capex from Month 18 forward preserves equity capital for team and product, which is where the multiple lives.

---

## 7. Financing strategy

Three capital sources, in order of preference.

### 7.1 Equity (Seed, then Series A)

**Preferred for: team, product, G&A, runway.** Equity capital pays for the non-asset build — the software platform, the team that operates it, the brand and pipeline. The 2026 Seed ($1.5M) and 2028 Series A ($8–12M) are the two equity checkpoints in the base case.

**Target investors:**

- Hospitality operator-investors (hotel groups, hospitality-focused funds)
- Robotics and platform investors (Bedrock's investor list is a target roster)
- Atlas Mobility network (existing Eric relationships that already understand the healthcare play)
- Miami / Florida ecosystem funds (geography-aligned)

### 7.2 Equipment lease financing

**Preferred for: fleet capex at scale.** Once there's a track record of deployments (target: after 10 robots under management), equipment lessors will finance the fleet at reasonable rates. This is capital-efficient because:

1. **The asset is the collateral.** We don't need to personally guarantee or tie up equity.
2. **Cash flow matches obligation.** $2,850/month revenue per robot covers a ~$400/month lease payment comfortably.
3. **Equity is preserved for OpEx** — the highest-leverage use of dilutive capital.

Target lessors: Crest Capital, Balboa Capital, TIAA Equipment Finance, Dimension Funding. Keenon's distributor (ROTA Robotics) offers an in-house lease program worth exploring.

### 7.3 Revenue-based financing (optional, situational)

Once MRR is steady (target: $30K+/month, late 2027), revenue-based financing providers like Pipe, Capchase, or Clearco will advance 6–12 months of recurring revenue in exchange for 4–8% of revenue. Useful for non-dilutive working capital during a growth sprint but not the primary strategy — cost of capital is effectively higher than equipment lease.

### 7.4 What we are explicitly NOT doing

- **No mega-round to "accelerate."** The business is a cash-disciplined operating play, not a hardware-race story. Raising $20M pre-revenue would dilute the founder, raise the bar for Series A, and put pressure on the team to deploy capital before the platform is ready.
- **No hospital-system prepay structures** — they distort the revenue curve and create dependency on a single customer.
- **No SBIR/government grants as primary funding.** Grants can supplement for R&D (Section 8.2 in [`business-plan.md`](business-plan.md) touches on the FON Advisory GovCon angle) but are too slow and conditional to fund the operating ramp.

---

## 8. Path to profitability

Three profitability milestones, in order:

### 8.1 Gross-margin breakeven — already hit

Gross margin is positive at the first robot (50.1% at standard pricing, 38.2% at pilot). There is no gross-margin hurdle; every incremental robot is accretive to gross profit from Day 1 of Phase 2 pricing.

### 8.2 Cash-flow breakeven — ~20 robots under management

Fixed overhead in 2027 averages ~$75K/month. At $1,428 gross profit per robot per month:

> $75,000 / $1,428 = **~53 robots**

…to cover OpEx in full. But in the base case OpEx in late 2028 is ~$120K/month against ~80 robots × $1,500 gross profit = $120K. **Cash-flow positive in Q4 2028** under the base-case plan.

Under the optimistic scenario where management labor dilutes to $250/robot and gross profit per robot rises to $1,700, cash-flow breakeven happens ~6 months earlier.

### 8.3 Net-profit breakeven — Q1 2029

Adding interest (fleet lease) and depreciation (already in COGS for accounting purposes but reconsidered in a GAAP P&L view) pushes net-profit breakeven approximately one quarter past cash-flow breakeven.

### 8.4 Payback on the Seed round

| Metric | Value |
|---|---|
| Seed raise | $1.5M |
| Cumulative burn at breakeven | ~$1.6M |
| First cash-flow positive quarter | Q4 2028 |
| Months from Seed close to breakeven | ~28 months |
| Gross profit run rate at breakeven | ~$1.4M/yr |

$1.5M of equity capital buys 28 months of runway to a business generating $1.4M/year of gross profit, growing at ~60%+. On any reasonable benchmark that is an attractive use of Seed capital.

---

## 9. Sensitivity analysis

Three scenarios — bear, base, bull — varying the two variables with the largest impact on the model: **fleet growth rate** and **gross profit per robot**.

### 9.1 Bear case — slow sales, rising costs

**Changes from base:**
- Fleet growth 50% of plan (40 robots end of 2028, not 80)
- Gross profit per robot stuck at $1,200 (hardware wholesale never lands, consumables inflate)
- One deployment fails, customer churns within 12 months

**Result:**

| Line | 2026 | 2027 | 2028 |
|---|---|---|---|
| Recognized revenue | $100,000 | $500,000 | $1,150,000 |
| Gross profit | $55,000 | $260,000 | $620,000 |
| OpEx | ($400,000) | ($780,000) | ($1,200,000) |
| EBITDA | ($345,000) | ($520,000) | ($580,000) |
| Cumulative burn | $345,000 | $865,000 | $1,445,000 |

**Interpretation:** The bear case is survivable on the Seed round but still-burning at end of 2028. This scenario requires either a bridge (~$800K) or a cost-out (reduce OpEx by 25%, delay field ops hire, delay sales hire). Not catastrophic but it moves the Series A timeline to 2029.

### 9.2 Base case — as modeled above

See Section 5. Cash-flow positive Q4 2028.

### 9.3 Bull case — hospital system lands early, scale economics deliver

**Changes from base:**
- Fleet reaches 120 robots by end of 2028 (vs. 80) on early hospital system contract
- Gross profit per robot rises to $1,700 by end of 2028 (hardware wholesale + management dilution)
- Implementation revenue higher due to larger deployments

**Result:**

| Line | 2026 | 2027 | 2028 |
|---|---|---|---|
| Recognized revenue | $160,000 | $1,100,000 | $3,100,000 |
| Gross profit | $95,000 | $620,000 | $1,900,000 |
| OpEx | ($460,000) | ($970,000) | ($1,640,000) |
| EBITDA | ($365,000) | ($350,000) | $260,000 |
| Cumulative burn | $365,000 | $715,000 | $455,000 |

**Interpretation:** The bull case reaches profitability in mid-2028 and the business starts paying back the Seed round before Series A closes. This is the scenario where a $10M+ Series A lands at a premium valuation because the metrics are genuinely good.

### 9.4 What moves the needle

Ranked by sensitivity (largest impact first):

1. **Fleet growth rate.** Revenue is linear to fleet size. A 30% miss on the sales plan costs ~$400K of cumulative gross profit by end of Year 3. **This is the #1 variable to protect.**
2. **Management labor dilution.** Cost drops from $625/robot to $250/robot as the fleet grows. If we never hit this scaling, margin stays at 50% instead of climbing to 60%+ — costs ~$400K of cumulative gross profit.
3. **Hardware wholesale.** A direct Keenon wholesale agreement cuts hardware cost by 20–40%. That's ~$150/robot/month of margin — worth ~$200K by end of Year 3.
4. **Implementation revenue.** One-time services are ~15% of recognized revenue and carry 60–70% margin. A shortfall here is noticeable but not existential.
5. **Churn.** Model assumes 5% annual churn after Year 1. A 10% rate costs ~$150K cumulative.

---

## 10. Key financial risks

Separated from strategic/operational risks (those live in [`business-plan.md`](business-plan.md) Section 10). These are risks to the financial plan specifically.

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Fleet growth slower than plan** | Medium | High | Warm-intro pipeline, aggressive site-visit cadence, ROTA Robotics referral pipe as backup channel. Track monthly against plan; replan at any 2-quarter miss. |
| **Hardware wholesale never materializes** | Medium | Medium | Model does not depend on it for base case. Without it, gross margin stays at ~50% (still a fine business) but never reaches the 60%+ that powers the bull case. |
| **One deployment fails publicly, destroys reference value** | Medium | High | Conservative Phase 1 scope at every new site, rollback plans, emergency loaner robot. See risk register per deployment. |
| **Customer concentration** | High (early) | High | Thesis Hotel is ~100% of revenue through 2026. Property #2 by Q1 2027 at the latest — hard gate. |
| **Lease financing unavailable when needed** | Low–Medium | Medium | Equipment lessors have a mature market for robotics. Keenon distributor lease program is a fallback. Worst case, equity round comes ~12 months earlier than plan. |
| **Runway misread (cash runs out before raise)** | Low | Catastrophic | 4-week operating reserve built into the Seed use-of-funds; monthly cash forecast reviewed by founder; Series A conversation starts 9 months before projected cash-out. |
| **Working-capital squeeze from implementation revenue billing** | Low | Medium | Implementation invoices are front-loaded (50% at contract, 50% at go-live); covers the commissioning labor. Watch for customers pushing for NET 90 — enforce NET 30. |
| **Regulatory surprise (e.g., FDA reclassification of orchestration software)** | Low | High | Hospitality-first strategy insulates us for 18+ months. Any healthcare move is non-clinical logistics only until we have regulatory certainty. |

---

## 11. Key assumptions and methodology

Every number in this document derives from one of the assumptions below. Change one, re-run the model.

### 11.1 Pricing and revenue

- **Standard RaaS rate:** $2,850/robot/month flat. Set to match the $10.50/hour × 270 billable hours math from [`../../public/pricing-model.html`](../../public/pricing-model.html).
- **Pilot rate:** $2,300/robot/month (30-day only). 19% discount chosen to be "meaningful but not painful."
- **Billable days per month:** 30 days (robots operate 7 days/week).
- **Utilization:** 75% (accounts for charging, maintenance, downtime).
- **Billable hours per month:** 270 (12 hours/day × 30 days × 75%).
- **Price increases:** None modeled. All figures in 2026 USD, no inflation adjustment.
- **Net revenue retention:** 110% target, not modeled explicitly in the forecast (conservative).
- **Churn:** 5% annual after Year 1. Not modeled in Year 1 because deployments are too new.

### 11.2 Costs

- **Hardware acquisition:** $14,500 average (blended across C30 $12K, C40 $15K, W3 $12K, S100 $19K). Distributor pricing.
- **Lifecycle:** 36 months (conservative; real life is 4–5 years).
- **Management labor allocation:** $2,500/month per 4-robot cluster. Scales down to $125/robot at 40+ robots.
- **Software & connectivity:** $50/robot/month flat.
- **Consumables:** $135/robot/month (brushes, filters, cleaning solution, mop pads, squeegee).
- **Maintenance reserve:** 10% of acquisition cost per year.
- **Insurance:** $3,000/year total fleet, allocated per robot.

### 11.3 Financing

- **Seed close:** Q3 2026, $1.5M equity.
- **Series A:** Q1–Q2 2028, $8–12M equity.
- **Lease financing begins:** Month 18 from today, 36-month terms at ~8.5% all-in.
- **No debt before Series A.**

### 11.4 Operating assumptions

- **Founder salary:** $180K in 2026, rising to $220K in 2028. Conservative for a CEO.
- **Engineering first hire:** Late 2026, $150K all-in.
- **Sales first hire:** Q2 2027, $120K base + variable.
- **Field service first hire:** Q3 2027, $100K all-in.
- **No international expansion in the forecast window.**

### 11.5 What the model does NOT yet include

- **Button emulator standalone sales.** Treated as incremental revenue but conservatively modeled at $40K in 2027 and $120K in 2028. Could be meaningfully larger.
- **Robot-screen advertising revenue.** Not in the forecast at all.
- **De-identified data insights.** Not in the forecast.
- **Monitoring add-on for residences.** First test at Thesis Hotel, pricing not yet locked.
- **Humanoid partnership revenue.** 2028+ horizon, outside the three-year plan window.
- **Government contracts (SBIR, VA, DHA).** Explored through FON Advisory but not scored in the base case.

**Each of these is upside to the plan, not downside.** The base case is deliberately conservative.

---

## 12. Conclusion

Three things to take away from this analysis:

1. **The economics are real today.** At $2,850/month per robot and $1,422/month cost, we make $17K per robot per year of gross profit starting with robot number one. The business is not "someday when we scale" — it is viable on a small fleet.

2. **$1.5M gets us to a Series A-ready business.** Seed capital funds the 18-month run to ~25 robots under management, five reference sites, first hospital pilot, platform V2 shipped, and credible metrics. That is the kind of capital efficiency investors reward.

3. **The upside lives in the scaling of unit economics.** The story isn't "we'll sell more robots." It's "we'll sell more robots *and* they'll each generate more gross profit as the fleet grows." Management labor dilution, hardware wholesale, and procurement leverage compound together. By 2028, a robot that costs $1,422 today costs ~$800 to operate, and the same $2,850 of revenue becomes $2,050 of gross profit instead of $1,428.

That compound curve is the entire reason to build this business as a platform rather than a robot manufacturer or a single-vendor reseller. Every number in this document is a version of that thesis expressed in dollars.

---

## Related

- [`business-plan.md`](business-plan.md) — master business plan and narrative
- [`business-model.md`](business-model.md) — detailed revenue stream breakdown
- [`../../public/pricing-model.html`](../../public/pricing-model.html) — underlying unit economics model
- [`../40-deployments/thesis-hotel/proposal.md`](../40-deployments/thesis-hotel/proposal.md) — the anchor customer proposal
- [`../60-roadmap/current-quarter.md`](../60-roadmap/current-quarter.md) — what's actually happening this quarter
