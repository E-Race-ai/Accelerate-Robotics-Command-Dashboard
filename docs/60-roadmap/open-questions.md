# Open Questions

Decisions we haven't made yet. Track them here so they don't get lost and so the team can see what's uncertain. When a question gets answered, either delete it or promote it to an ADR.

## Product / strategy

### Keenon partnership — partner or compete?

The Keenon robot fleet is our Phase 1 hardware. But Keenon offers their own elevator integration (E-Box) and their own fleet management (DynaSky Cloud). Our platform thesis is "one brain, many bots" — explicitly vendor-neutral. How close do we get to Keenon without becoming their reseller?

**Considered:**
- Straight partnership — we resell Keenon, Keenon gives us developer access
- Neutral integration — we support Keenon as one vendor among many, no special relationship
- Competitive — we bypass Keenon's software entirely and use the robots as dumb hardware

**Current lean:** neutral integration, but test Keenon's willingness to partner without locking us in.

### Destination dispatch elevators — separate product or feature?

Our button emulator assumes classic push-button controllers. Destination dispatch elevators (where you enter your floor at the lobby) are now the norm in new construction. Do we:

- Build a separate destination-dispatch integration product
- License KONE/Otis APIs for DD buildings
- Skip DD buildings for now

**Current lean:** skip for v1, revisit when we hit our first DD-only customer.

### Pricing model — per-robot, per-building, per-seat?

- Per-robot: easy to explain, tracks hardware cost
- Per-building: simpler enterprise sale
- Per-active-user: hard to define "active user" in an operator-team context
- Flat platform fee + hardware pass-through: closest to how we're thinking today

**Current lean:** flat platform fee + per-robot usage metering, but TBD at first paid contract.

### Hospitals first or hotels first?

Hotels (Thesis Hotel) are where we're starting because of proximity and ease. Hospitals are the stated long-term target because of Atlas Mobility relationships and larger per-site revenue. When do we pivot from hotel-first to hospital-first?

**Current lean:** land 2–3 hotel sites, then begin hospital pilot conversations in parallel.

## Technical

### Migration framework — when and which?

We're running without a migration tool today. The schema is stable enough for now, but Phase 2 (platform layer) will add tables. When the next table lands, adopt a framework.

**Candidates:** drizzle-kit (needs Drizzle ORM first), plain SQL files in `migrations/` run by a boot script, `better-sqlite3-migrations` package.

### Structured logging — pino? winston? something else?

We're on `console.log` today. Needs to change before we have real traffic or a real on-call rotation.

**Current lean:** pino for its performance and small footprint.

### Hosting — stay on Railway or move?

Railway is fine today. Concerns: single-region, no compliance certifications, pricing at scale. When does this become a problem?

**Current lean:** stay on Railway through 2026. Re-evaluate if we have multi-region needs or if a customer requires specific compliance.

### Real-time robot data — how do we ingest it?

Keenon's DynaSky Cloud has robot telemetry, but no public API. Options:
- Scrape the DynaSky web app (fragile)
- Wait for Keenon to open an API (slow)
- Build our own telemetry via ADB over WiFi into the robot's Android layer (gray area)
- Subscribe to in-network traffic from the robot directly (requires network control)

**Current lean:** start with ADB-over-WiFi where we control the network, advocate for API access via partnership conversations.

## Legal / IP

### Provisional or full patent on the button emulator?

File provisional now (before public disclosure), then full within 12 months? Or skip provisional and go straight to full? Budget and attorney advice pending.

**Current lean:** provisional first, full after FTO opinion.

### Who owns the SLAM map at a customer site?

When we map a customer's building, who owns the map? The customer? Us? Keenon (whose tech builds the map)? This matters if a customer wants to switch robot vendors but keep their platform deployment.

**Current lean:** assert we own the map as part of the platform, customer has perpetual-use rights.

### UL / elevator inspector requirements

Does our button emulator need UL listing before commercial sale? Does Miami-Dade require an inspector sign-off on every install? Need a lawyer + certified elevator mechanic to confirm.

## Organizational

### Remote-first engineering, Miami-only ops?

We anchored the company in Miami. Should engineering hires be Miami-based too, or remote OK? See [`../20-architecture/adr/0004-anchor-in-miami.md`](../20-architecture/adr/0004-anchor-in-miami.md).

**Current lean:** engineering remote-OK, field service and ops Miami-based.

### First real hire — who?

See [`backlog.md`](backlog.md) hiring priorities. Embedded/hardware engineer vs field service tech vs full-stack engineer — which comes first depends on whether Thesis Hotel Phase 2 goes well.

## Related

- [`current-quarter.md`](current-quarter.md)
- [`backlog.md`](backlog.md)
- [`../20-architecture/adr/`](../20-architecture/adr/) — where answered questions land
