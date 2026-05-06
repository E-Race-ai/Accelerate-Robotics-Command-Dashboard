# Thesis Hotel — Risk Register

Living list of known risks. Update when status changes, when a new risk is discovered, or when a mitigation is validated. Severity: `blocker` | `high` | `medium` | `low`.

## Phase 1 (C30 cleaning)

| ID | Risk | Severity | Owner | Mitigation | Status |
|---|---|---|---|---|---|
| P1-01 | 5 GHz-only AP on a guest floor blocks robot connectivity | blocker | IT admin | Pre-deployment WiFi survey; deploy 2.4 GHz IoT SSID if needed | Open |
| P1-02 | Carpet pile > 10 mm on any corridor | blocker | Site survey | Measure every corridor with a ruler; mark off-limits zones | Open |
| P1-03 | Transition strip > 20 mm between corridor and room | high | Site survey | Route around; install beveled transition strip if necessary | Open |
| P1-04 | Captive portal re-auth logs robot off nightly | high | IT admin | Bypass captive portal on robot VLAN; use MAC allowlist | Open |
| P1-05 | Housekeeping team resists deployment | high | GM / Ops | Frame as helper; include team in pilot planning; share baseline data | Open |
| P1-06 | Charging dock outlet is overloaded | medium | Facilities | Electrician verifies 15A circuit; log amp draw first week | Open |
| P1-07 | Guest interacts with robot unsafely (kicks, rides, covers) | medium | Ops | Floor signage; staff briefing; escalation SOP | Open |
| P1-08 | Unexpected thermal environment (direct sun in lobby, etc.) | low | Site survey | C30 operating range 0–40 °C — hotel corridors are within range | Open |
| P1-09 | Dust/debris fouls LiDAR or RGB-D camera faster than daily wipe | low | Housekeeping | Add a midday wipe if week-1 sensor errors correlate with grit | Open |
| P1-10 | Baseline metrics never captured → success unfalsifiable | high | Product | Pre-deployment audit of labor hours and complaints before day 1 | Open |

## Phase 2 (elevator integration)

| ID | Risk | Severity | Owner | Mitigation | Status |
|---|---|---|---|---|---|
| P2-01 | ThyssenKrupp service contract blocks third-party panel work | blocker | Ops / Legal | Coordinate install with authorized TK mechanic on the clock | Open |
| P2-02 | Miami-Dade elevator inspector rejects installation | blocker | Ops / Compliance | Pre-submit the design, emphasize no safety-string modification | Open |
| P2-03 | Button emulator BLE range insufficient inside cab (Faraday cage) | high | Engineering | LoRa fallback; cab-mounted BLE relay if needed | Open |
| P2-04 | SSR fails closed → button stuck pressed, elevator misbehaves | high | Engineering | Dual-redundant SSRs; watchdog timer; field-replaceable boards | Open |
| P2-05 | RF interference with cab door sensors | high | Engineering | Pre-flight RF survey; verify with TK mechanic during install | Open |
| P2-06 | Panel layout differs from spec photo → rewiring needed on-site | medium | Field service | Photograph every panel during site survey; service kit includes extra wire | Open |
| P2-07 | Install window runs over 2 hours → guest complaints | medium | Ops / GM | Rehearse install on bench; have fallback elevator path | Open |
| P2-08 | Robot can't reliably find the call button location | medium | Engineering | Pre-map hall call locations in SLAM map; manual override in PEANUT | Open |
| P2-09 | Power supply from 24V panel tap is noisy | low | Engineering | Pololu D24V5F3 has filtering; add bulk cap if needed | Open |
| P2-10 | Elevator service metrics degrade post-install | medium | Ops | Weekly metric review with TK service; remove install if correlated | Open |

## Cross-phase

| ID | Risk | Severity | Owner | Mitigation | Status |
|---|---|---|---|---|---|
| X-01 | Loss of access (change in ownership, change in GM) | high | Eric | Keep deployment documentation separate from relationship documentation | Open |
| X-02 | Hotel's insurer requires additional coverage | high | Legal | Confirm scope before install; update our GL if needed | Open |
| X-03 | Failure becomes public (press, Twitter) | medium | GM / Eric | Clear escalation path; no statements without GM approval | Open |
| X-04 | Robot is physically damaged by staff or guest | medium | Ops | Standard insurance; incident log; replacement plan | Open |
| X-05 | Hotel WiFi upgrade silently disables 2.4 GHz | medium | IT admin | Change-management policy; quarterly RSSI re-survey | Open |

## Closed risks

_None yet — Phase 1 hasn't started. Close risks as they're resolved or become irrelevant._

## Related

- [`phase-1-c30.md`](phase-1-c30.md)
- [`phase-2-elevator.md`](phase-2-elevator.md)
- [`checklist.md`](checklist.md)
