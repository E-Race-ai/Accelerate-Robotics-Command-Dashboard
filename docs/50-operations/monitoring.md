# Monitoring

What we watch, how we watch it, and what triggers a human response. Minimal by design — we're a small team with a small surface.

## Current state

Today, monitoring is:

- **Railway dashboard** — CPU, memory, request rate, error logs
- **Resend dashboard** — email delivery status
- **Manual inquiry check** — admin dashboard at `/admin`
- **DNS / uptime** — not yet automated

There is **no alerting** today. Everything is pull-based — you have to go look. That's acceptable while the site is pre-revenue and the blast radius of an outage is small. It won't be acceptable once we have paying customers or critical integrations.

## What to watch (manual today, automated later)

### App health

- Process up/down
- Error log rate
- Response times (p50, p95)
- Rate-limit rejections on `/api/inquiries`

### Database

- File size growth
- Disk free on the Railway volume
- WAL file size (shouldn't grow unbounded)

### Email

- Resend delivery success rate
- Bounces and complaints
- `notifyNewInquiry` errors in app logs

### Stock widget

- Yahoo Finance API errors
- Cache hit rate
- Stale cache fallbacks (means upstream is struggling)

## Alert thresholds (when we add alerting)

| Condition | Severity | Action |
|---|---|---|
| Process down > 2 min | Critical | Page on-call |
| Error log rate > 5/min | High | Page on-call |
| DB volume > 80% full | High | Investigate growth, clean archived inquiries |
| Resend delivery < 95% | High | Investigate Resend config + sender reputation |
| Rate-limit rejections spike | Medium | Possible spam attack; log and review |
| Yahoo Finance errors > 10/hour | Low | Log; cache handles it |

## Observability roadmap

See [`../60-roadmap/backlog.md`](../60-roadmap/backlog.md):

1. Structured logging (pino or similar)
2. Health check endpoint (`/api/health`)
3. Uptime monitoring (Better Stack, Uptime Robot)
4. Error aggregation (Sentry)
5. Request tracing (only if latency becomes a problem)

## Incident response

See [`runbooks/incident-response.md`](runbooks/incident-response.md) for what to do when something breaks.

## Related

- [`on-call.md`](on-call.md) — who responds
- [`runbooks/`](runbooks/)
- [`../60-roadmap/backlog.md`](../60-roadmap/backlog.md)
