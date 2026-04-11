# Deployment Playbook

The reusable playbook for taking Accelerate Robotics into a new site. Every deployment — hotel, hospital, office — follows this sequence. The site-specific details live under [`<site>/`](thesis-hotel/).

## Guiding principles

1. **Walk before you roll.** Physically visit the site before promising anything.
2. **Measure, don't assume.** Every carpet pile height, threshold gap, door width, slope, WiFi band, and elevator model gets measured or captured from the site — never assumed from a datasheet or a marketing deck.
3. **One phase at a time.** First phase proves the site works. Later phases add capability. A failed Phase 1 kills trust for every future phase, so design Phase 1 to succeed.
4. **Leave the site better.** When we pull out a robot for maintenance, nothing is left disconnected, ugly, or staff-blocking.

## The seven phases

### Phase 0 — Qualification

Is this site a good fit? Before you drive a robot anywhere, answer:

- What's the use case? (Cleaning, delivery, room service, linens, pharmacy…)
- Who signs off? (GM, Facility Ops, IT, Ownership)
- What's the budget and procurement path? (Capex, opex, pilot, RaaS)
- What's the success metric? (Labor hours returned, rooms cleaned, incidents avoided)
- What's the blocker we'll hit first? (WiFi, elevators, thresholds, staff skepticism)

Output: a one-page site brief. If we can't write that brief, we're not ready.

### Phase 1 — Site survey

See [`thesis-hotel/site-survey.md`](thesis-hotel/site-survey.md) for the worked example. Capture:

- **Floor plans** — every level the robot will operate on
- **Carpet pile height** — with a ruler, at every transition
- **Thresholds and gaps** — door frames, elevator sills, floor transitions, loading docks
- **Slopes** — ramps, lobbies, ADA ramps
- **WiFi survey** — band (2.4 vs 5 GHz), SSID count, captive portals, roaming behavior, RSSI at planned dwell points
- **Elevator inventory** — OEM, controller model, button layout, shaft access, machine room access
- **Power** — where charging docks can live, how many amps available, outlet type
- **Photo walk** — every odd transition, every weird corner, every door with a threshold gap

### Phase 2 — Risk register + go/no-go

Every measured risk lands in the [risk register](thesis-hotel/risk-register.md). For each:

- Severity (blocker / high / medium / low)
- Owner
- Mitigation or workaround
- Go/no-go decision

No deployment proceeds with open blockers.

### Phase 3 — Network prep

- WiFi: verify 2.4 GHz SSID exists, no captive portal on the robot VLAN, DHCP reservations for each robot
- Pre-shared key or device cert on the robot
- VLAN / firewall carve-out documented in [`../30-integrations/facilities/network-topology.md`](../30-integrations/facilities/network-topology.md)
- Cellular SIM as fallback (W3 only) — tested before deployment day

### Phase 4 — Physical prep

- Charging dock install (power, cable management, floor protection)
- Threshold fixes where feasible (bevels, transition strips)
- Staging area for the robot and its accessories
- Signage / floor marking if needed

### Phase 5 — Mapping and commissioning

- Keenon technician (or equivalent for other OEMs) runs the initial SLAM map
- Verify the map covers every point the robot will service
- Create each route / task in the robot's PEANUT APP and the fleet app
- Test each route end-to-end with no payload first, then with payload
- Edge cases: what happens at a shut fire door? A mop bucket in the path? A stack of luggage?

### Phase 6 — Pilot and metrics

- Defined pilot window (e.g., 30 days for Thesis Hotel Phase 1)
- Success metrics captured before day one (baseline labor, baseline cleaning time, baseline complaints)
- Daily check-ins during week 1, weekly during weeks 2–4
- On-site primary contact + remote backup
- Clear escalation path (who to call when)

### Phase 7 — Review and roll

- Pilot retrospective meeting
- Go/no-go on expansion (more robots, more phases, more floors)
- Handover to steady-state operations

## Checklist

Every deployment uses the full checklist in [`thesis-hotel/checklist.md`](thesis-hotel/checklist.md). Print it, tick every item, sign your name, file it.

## Related

- [`thesis-hotel/`](thesis-hotel/) — first worked example
- [`../30-integrations/facilities/wifi-requirements.md`](../30-integrations/facilities/wifi-requirements.md) — WiFi survey details
- [`../50-operations/runbooks/`](../50-operations/runbooks/) — steady-state operations
