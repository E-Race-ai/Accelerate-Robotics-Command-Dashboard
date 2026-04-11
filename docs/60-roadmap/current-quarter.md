# Current Quarter — 2026 Q2

What we're committing to ship this quarter. Refresh at the start of each quarter. Stale items are a sign we're not updating this doc, not that we're failing.

## Theme

**Prove the wedge at Thesis Hotel and ship button emulator v1.** Every item below either directly serves the Thesis Hotel pilot or makes the next pilot faster.

## Must-ship

### 1. Thesis Hotel Phase 1 — C30 cleaning pilot

- [ ] Complete site survey (2026-03-23 meeting output + follow-up walk)
- [ ] Finalize floor-by-floor carpet/threshold measurements
- [ ] Get WiFi sign-off from hotel IT (2.4 GHz SSID confirmed end-to-end)
- [ ] Install charging dock
- [ ] Robot commissioning with Keenon technician
- [ ] 30-day pilot begins
- [ ] Mid-pilot review at day 15
- [ ] Day-30 retrospective + go/no-go on Phase 2

See [`../40-deployments/thesis-hotel/phase-1-c30.md`](../40-deployments/thesis-hotel/phase-1-c30.md).

### 2. Button emulator v1 — bench-ready

- [ ] BOM finalized (6 boards for Thesis Hotel scale)
- [ ] PCB design reviewed and sent to fab
- [ ] Firmware: BLE GATT + LoRa fallback working
- [ ] Watchdog + safety timers implemented
- [ ] Bench test: 1000 consecutive cycles with no false triggers
- [ ] Install procedure documented + rehearsed

See [`../30-integrations/elevator/button-emulator.md`](../30-integrations/elevator/button-emulator.md).

### 3. Platform layer MVP (web dashboard)

- [ ] Read-only fleet status view (robots online/offline, battery, task)
- [ ] Inquiry-to-deployment funnel visualization
- [ ] Fleet map overlay (robots on a floor plan, one site at a time)

Scope here is deliberately tight — no multi-vendor orchestration yet, just a basic monitoring UI to prove we own the platform surface.

### 4. Patent (provisional)

- [ ] Engage patent attorney (see FON Advisory reference)
- [ ] File provisional on the button emulator's relay-parallel technique
- [ ] Do NOT publish BOM or technique publicly until provisional is filed

## Should-ship

### 5. Site survey template

A reusable document we hand to every new site. Shortens time-to-qualification for the next customer.

### 6. Keenon relationship

- [ ] Schedule a partnership conversation with Keenon global
- [ ] Clarify any E-Box vs our button emulator tension up front

### 7. Second site pipeline

- [ ] Identify 3–5 target customers for Phase 2 of the year (hospitals and hotels in the Southeast)
- [ ] Initial contact with each

## Can-defer

- Automated monitoring + alerting (target Q3)
- Structured logging (target Q3)
- Migration framework (target Q3 or later)
- Admin 2FA (target Q3)
- Multi-robot orchestration UI (target Q4+)

## Done this quarter (update as you ship)

_Roll completed items into [`done/`](done/) with a date and short note._

## Related

- [`backlog.md`](backlog.md)
- [`open-questions.md`](open-questions.md)
- [`../00-overview/project-snapshot.md`](../00-overview/project-snapshot.md)
