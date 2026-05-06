# 40 — Deployments

Real-world rollouts. Each deployment gets its own subfolder with site survey, phase plans, risks, and a checklist.

| Folder / file | What it covers |
|---|---|
| [`playbook.md`](playbook.md) | Reusable deployment playbook (works for any site) |
| [`thesis-hotel/`](thesis-hotel/) | **First deployment** — 10-story Miami property, C30 pilot + elevator integration |

## Adding a new deployment

1. Copy [`thesis-hotel/`](thesis-hotel/) as a template.
2. Fill in `site-survey.md` — floor plans, pile heights, thresholds, WiFi.
3. Draft `phase-1-*.md` plans for each initial robot.
4. Build a `risk-register.md` up front.
5. Derive a `checklist.md` from the playbook.
