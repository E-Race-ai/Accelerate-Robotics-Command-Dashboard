# On-Call

Who responds when something breaks, how they get notified, and what's expected of them.

## Current rotation

**Eric is on-call 24/7 for everything.** That's the reality of a one-person company.

As the team grows, this document formalizes into a real rotation.

## What counts as an on-call incident

### Software (this repo)

- Production site is down or returning 5xx
- Admin cannot log in
- Inquiry form submissions are failing
- Email notifications stopped arriving
- DB file corrupted or inaccessible

### Robot fleet (physical)

- Deployed robot is stuck, lost, or broken
- Elevator integration (button emulator) misbehaves
- WiFi / network-level outage at a customer site
- Any safety incident — caller, injury, guest complaint

### Hard rule

**Any safety incident involving a robot and a person is an immediate page** — no triage, no waiting. Stop the robot, secure the area, call the site's facility lead, then Eric.

## Escalation order

1. **Eric** — primary on-call, all incidents
2. **Atlas Mobility** — if Eric is unavailable and a hospital safety question arises
3. **Keenon support** (`global@keenon.com`) — robot-specific issues that require OEM help
4. **Site's elevator service contractor** — elevator-specific issues; always coordinate through the site's GM first

## How to reach Eric

- Phone (primary)
- Text
- Email (secondary)

Customers at Thesis Hotel and future sites get a single point of contact — Eric — for all post-deployment issues. No customer routes a robot issue to Keenon directly; everything goes through us so we learn from each incident.

## Response time targets

| Severity | Response target | Resolution target |
|---|---|---|
| Safety incident | Immediate (< 5 min) | Stop & secure < 10 min; full resolution when safe |
| Production outage | < 30 min | < 2 hours |
| Site robot stuck | < 1 hour | < 4 hours (may require site visit) |
| Email notifications broken | < 2 hours | < 24 hours |
| Non-critical (stocks widget, etc.) | < 1 day | As available |

## During an incident

See [`runbooks/incident-response.md`](runbooks/incident-response.md) for the step-by-step playbook. Short version:

1. **Stabilize** — stop the bleeding; roll back a release, disable a feature, mute an alert
2. **Communicate** — tell the customer what's happening, what we know, and when you'll update them next
3. **Triage** — understand what broke and why
4. **Fix** — the right fix, not the fastest patch, unless bleeding continues
5. **Document** — incident note in `docs/50-operations/incidents/` (create the folder when we have our first)
6. **Retrospective** — what do we change so this doesn't happen again?

## Related

- [`monitoring.md`](monitoring.md)
- [`runbooks/incident-response.md`](runbooks/incident-response.md)
- [`runbooks/rollback-release.md`](runbooks/rollback-release.md)
