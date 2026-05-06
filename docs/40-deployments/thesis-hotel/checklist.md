# Thesis Hotel — Deployment Checklist

Printable, sign-off checklist for the full Thesis Hotel deployment. Every box gets ticked, initials go next to each, and the completed sheet is filed in the deployment log.

## Phase 0 — Qualification

- [ ] One-page site brief written and approved by Eric
- [ ] Primary use case defined (cleaning → delivery → room service progression)
- [ ] Decision-makers identified (GM, Head of Engineering, Facility Ops)
- [ ] Success metrics agreed
- [ ] Commercial terms drafted (paid pilot vs free pilot)

## Phase 1 prep — Site survey

- [ ] Site walk completed with Head of Engineering + Facility Ops
- [ ] Floor plan captured for levels 4–10
- [ ] Carpet pile height measured — every corridor — ≤ 10 mm everywhere
- [ ] Every transition strip measured — ≤ 20 mm everywhere
- [ ] Every fire door sill measured — ≤ 20 mm everywhere
- [ ] Slope checked at lobby transitions — ≤ 7°
- [ ] Photo walk completed and archived in `assets/site-plans/thesis-hotel/`
- [ ] WiFi survey completed — 2.4 GHz confirmed, captive portal mitigated, RSSI logged
- [ ] Elevator inventory — TAC32T confirmed, panel layout photographed
- [ ] Power location for charging dock identified
- [ ] Staging area identified
- [ ] Insurance requirements confirmed

## Phase 1 — Network prep

- [ ] IoT/robot SSID provisioned by hotel IT
- [ ] DHCP reservation for robot MAC
- [ ] Firewall rules allow egress to DynaSky Cloud
- [ ] Test robot connection from target corridor — ping + DNS + HTTPS
- [ ] Captive portal bypass validated
- [ ] Cellular SIM NOT required for C30 (skip)

## Phase 1 — Physical prep

- [ ] Charging dock installed + tested
- [ ] Outlet load-tested
- [ ] Cable management complete, no trip hazards
- [ ] Staging area set up
- [ ] Floor protection installed if required by facilities

## Phase 1 — Robot commissioning

- [ ] Keenon technician on site
- [ ] PEANUT APP PIN changed from `0000`
- [ ] Firmware up to date
- [ ] SLAM map built for every floor in scope
- [ ] Cleaning routes created for every floor
- [ ] Routes tested end-to-end with no payload
- [ ] Emergency stop tested
- [ ] Safety strip + cliff sensors tested
- [ ] Sensors wiped — LiDAR, RGB-D, image module

## Phase 1 — People

- [ ] Housekeeping team briefed (15-min session)
- [ ] Pause-and-call procedure posted near charging dock
- [ ] On-call escalation path documented
- [ ] GM signed off on deployment start
- [ ] Baseline metrics captured (labor hours, rooms/shift, complaints, safety incidents)

## Phase 1 — Pilot go-live

- [ ] Day 0 photo of routes + robot in situ
- [ ] Robot runs first shift under supervision
- [ ] Daily check-ins for week 1
- [ ] Daily sensor wipe + bin empty
- [ ] Incident log started (and stays empty, ideally)
- [ ] Weekly review with Facility Ops

## Phase 1 — Day 30 review

- [ ] Uptime metric calculated (target ≥ 90%)
- [ ] Safety incident count (target 0)
- [ ] Housekeeping sentiment survey
- [ ] Labor hours reclaimed
- [ ] Guest complaints
- [ ] Retrospective meeting held
- [ ] Go/no-go decision on Phase 2 documented
- [ ] Pilot report shared with hotel leadership

## Phase 2 prep — Elevator

- [ ] ADR 0005 reviewed with field service team
- [ ] TK mechanic booked for install window
- [ ] Miami-Dade elevator inspector notified (if required)
- [ ] Insurance coverage confirmed for elevator work
- [ ] 6 button emulator boards ordered + pre-tested on bench
- [ ] Panel layout photos reviewed — wiring plan confirmed
- [ ] Fallback plan (remove and revert) documented

## Phase 2 — Install day

- [ ] Meet TK mechanic at loading dock
- [ ] Elevator in service mode before work starts
- [ ] Guest signage posted ("Elevator Car #1 out of service 10–12")
- [ ] Boards installed one at a time, tested after each
- [ ] Zero modifications to safety string — confirmed with mechanic
- [ ] Photos of every installed board for the install log
- [ ] End-to-end test: W3 calls, boards, rides, exits, returns
- [ ] Elevator returned to normal service
- [ ] Install log signed by Eric + TK mechanic

## Phase 2 — Post-install

- [ ] 20 consecutive clean rides in supervised mode
- [ ] Weekly check-in with TK service on elevator metrics
- [ ] Install retro → update button-emulator.md
- [ ] Phase 3 scope drafted

## Sign-off

| Phase | Signed by | Date |
|---|---|---|
| Phase 1 prep complete | | |
| Phase 1 go-live approved | | |
| Phase 1 day-30 review complete | | |
| Phase 2 install complete | | |
| Phase 2 ride-test complete | | |

## Related

- [`../playbook.md`](../playbook.md)
- [`site-survey.md`](site-survey.md)
- [`phase-1-c30.md`](phase-1-c30.md)
- [`phase-2-elevator.md`](phase-2-elevator.md)
- [`risk-register.md`](risk-register.md)
