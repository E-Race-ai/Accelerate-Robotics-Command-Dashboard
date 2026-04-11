# Runbook: Incident Response

What to do when something is broken. Follow this exactly when you're stressed and your judgment is degraded.

## Step 0 — Is anyone hurt?

**If a robot is involved in a safety incident (guest, patient, or staff injury — or close call):**

1. **Stop the robot.** Physical e-stop if necessary.
2. **Secure the area.** Clear bystanders if needed.
3. **Call the site's facility lead immediately.**
4. **Call Eric.**
5. Everything else — software, data, business impact — is lower priority.

Document the incident thoroughly after the fact. Photos of the scene. Witness statements. Robot logs from PEANUT APP and DynaSky. See [`on-call.md`](../on-call.md).

## Step 1 — Stabilize

Stop the bleeding before you understand the cause.

- **Site is down or returning 5xx** → try rolling back the last deploy ([`rollback-release.md`](rollback-release.md))
- **Inquiry form rejecting valid submissions** → confirm it's not a rate limit (429); if not, rollback
- **Email notifications failing** → check Resend dashboard for quota or sender reputation issues
- **DB corruption** → restore from the most recent verified backup ([`backup-database.md`](backup-database.md))
- **Robot stuck on site** → tell the facility lead to route around it; dispatch a human if the robot is blocking traffic

**Don't try to "quickly fix forward."** A rollback is almost always faster and safer than a hot patch.

## Step 2 — Communicate

Tell affected stakeholders what's happening. Even if you don't know the root cause yet.

Templates:

### To a customer (Thesis Hotel, future sites)

> Hi [name], we've detected an issue with [the robot / the platform / the dashboard] and are investigating now. We'll update you by [time — 30 min out is a good default]. For now, [what we're asking them to do — "please keep guests clear of the robot" or "please use the manual call panel"].

### To the team (when we have a team)

> Incident at [time]: [one-line symptom]. Severity: [low/medium/high/critical]. Commander: [name]. Status channel: [link].

## Step 3 — Triage

Once stable, understand what broke.

- Pull logs from Railway
- Check recent commits and deploys — any correlation?
- Check DB state — did a bad query or migration land?
- Check external dependencies — Resend, Yahoo Finance, Railway edge
- Check the customer site's WiFi, power, or elevator service logs if physical
- Write down what you find as you go — you'll need it for the retro

## Step 4 — Fix

The right fix, not the fast one. Write a test that would have caught the bug. Deploy via the normal path ([`deploy-production.md`](deploy-production.md)), not a shortcut.

## Step 5 — Verify

Smoke-test production after the fix ships. Confirm with the customer that their original report is resolved. Give it 30 minutes and check again.

## Step 6 — Document

Create `docs/50-operations/incidents/YYYY-MM-DD-short-title.md`:

```markdown
# Incident YYYY-MM-DD — <title>

## Summary
One paragraph: what happened, who was affected, how long, how bad.

## Timeline
- HH:MM — Detection
- HH:MM — First response
- HH:MM — Stabilized (rollback / fix / workaround)
- HH:MM — Root cause identified
- HH:MM — Permanent fix deployed
- HH:MM — Incident closed

## Root cause
What actually broke and why.

## Impact
Users affected, data affected, revenue impact, trust impact.

## What went well
Things to keep doing.

## What went poorly
Things to change.

## Action items
- [ ] Concrete change with owner and date
- [ ] …
```

## Step 7 — Retro

If it was a real incident (not a dev-env fumble), schedule a retrospective within a week. Blameless. Focus on systems, not individuals. Every action item gets owned and tracked in the roadmap.

## Severity guide

| Severity | Definition | Examples |
|---|---|---|
| **Critical** | Safety incident or full production outage | Robot-guest contact; site down > 5 min |
| **High** | Major feature broken, customer-visible | Admin login broken; email notifications dead |
| **Medium** | Degraded experience | Stock widget shows stale data; slow response times |
| **Low** | Minor bug | Typo on marketing page; cosmetic issue |

## Never

- Never skip the documentation step, even for a 2-minute rollback
- Never declare "fixed" without verifying with the customer (if one was affected)
- Never blame an individual in an incident doc — focus on the system

## Related

- [`on-call.md`](../on-call.md)
- [`rollback-release.md`](rollback-release.md)
- [`backup-database.md`](backup-database.md)
- [`../monitoring.md`](../monitoring.md)
