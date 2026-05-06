# Backlog

Ideas, tasks, and investments we've said yes to but haven't scheduled. Ordered loosely by priority. Promote to [`current-quarter.md`](current-quarter.md) when we commit to shipping.

## Platform / engineering

- **Automated monitoring + alerting** — uptime, error rate, response time, DB size
- **Structured logging** — pino or similar; replace `console.log` in `src/`
- **Health check endpoint** (`/api/health`) for uptime monitors
- **Error aggregation** — Sentry or equivalent
- **Database migration framework** — drizzle-kit or plain SQL files
- **CI pipeline** — lint, test, `npm audit` on every PR
- **Admin 2FA** — TOTP via authenticator app
- **Mid-session token invalidation** — server-side blocklist for stolen JWTs
- **Admin password change UI** — avoid needing the runbook for routine rotation
- **Audit log table** — track admin actions beyond `reviewed_at`
- **Stocks endpoint fallback** — if Yahoo Finance is down for > cache window
- **Multi-site dashboard** — once we have 2+ live sites, the platform dashboard needs per-site views

## Button emulator / elevator

- **UL listing for the board** — required for broad commercial sale
- **Destination dispatch variant** — separate product for modern elevators
- **Hall call panel board** — expands Phase 2 coverage without per-floor boards
- **OTA firmware updates** — for deployed boards
- **Manufacturing partner** — move from hand-assembled prototypes to a pick-and-place run
- **Enclosure** — not just a bare PCB zip-tied to a panel
- **Design patent** — cheap defensive filing on the enclosure form factor
- **Cross-OEM test rig** — validate on Otis, KONE, Schindler, Mitsubishi

## Robots / fleet

- **Non-Keenon adapter** — prove the "one brain, many bots" thesis with a second vendor
- **PEANUT APP automation** — scripted PIN + settings for faster commissioning
- **Fleet app for operators** — our UI wrapping Keenon's, bridging into our platform
- **Real-time location ingestion** — subscribe to DynaSky events if API allows, screen-scrape if not
- **Incident log pipeline** — every robot stall, e-stop, collision into our DB

## Deployments / customers

- **Second site contract** — post Thesis Hotel Phase 1 success
- **Hospital pilot** — leverage Atlas Mobility relationships
- **Reusable site survey template** — docx or PDF handout
- **Operator training kit** — 15-min briefing + quick reference card
- **Customer success dashboard** — metrics package per site

## Business / org

- **Hire embedded engineer** — productionize button emulator
- **Hire field service tech** — travel for installs
- **Hire full-stack engineer** — platform layer
- **Hire customer success / ops lead** — site management
- **Office / lab space in Miami** — room for robots, benches, staging
- **Incorporation polish** — standard docs, cap table, bank, insurance
- **Fundraising prep** — pitch deck, data room, target list

## Legal / compliance

- **FTO opinion from patent attorney** — before commercial button emulator launch
- **Insurance** — GL, product liability, elevator work rider
- **Privacy policy + terms** — on accelerate-robotics.com before any paying customer
- **Data processing addendum** — for hospitals if we handle any PHI
- **Elevator inspector relationships** — Miami-Dade first, then SE region

## Marketing / content

- **Case study: Thesis Hotel Phase 1** — publish post-pilot with hotel's approval
- **Demo videos** — C30 cleaning, W3 delivery, button emulator install
- **Blog / newsletter** — cadence TBD
- **Conference presence** — HIMSS, robotics trade shows, hospitality tech

## Research / exploration

- **Humanoid robot partner program** — Phase 3 of the phased approach
- **Atlas Mobility integration** — sensors + robots in the same ward
- **ADB-over-WiFi robot control** — rootless debugging without opening the shell
- **SLAM map sharing** — robots on the same floor using the same map
- **Multi-vendor robot coordination protocol** — MQTT? gRPC? our own?

## Related

- [`current-quarter.md`](current-quarter.md) — what we're committing to now
- [`open-questions.md`](open-questions.md) — things we haven't decided
