# AVCast — Atlas IT Operations Dashboard

Self-hosted control plane for A/V devices, Hue lights, and Konica bizhub printers across the office network (10.1.10.0/24 + 10.1.11.0/24).

Started 2026-04-22.

## Quick start

```bash
cd /Users/kayliemurphey/Code/netscan/avcast
./start.sh
# Dashboard opens at http://127.0.0.1:8765/
```

To use a different port: `AVCAST_PORT=9000 ./start.sh`.
To scan different subnets: `AVCAST_SUBNETS=10.0.0.0/24,10.0.1.0/24 ./start.sh`.

## What it does

- **A/V discovery** — every Sonos, Chromecast, AirPlay receiver, Apple TV, Roku TV, Spotify Connect endpoint, HomeKit accessory, Hue bridge, smart TV, and printer on the network. mDNS + SSDP + per-protocol enrichment + cross-subnet unicast probe (so devices on the other VLAN aren't missed when multicast is blocked).
- **Sonos / Chromecast / Roku control** — volume, mute, play/pause/next/previous/stop, with album art, artist/album/track, ticking progress bar, and the upcoming queue.
- **Hue lights** — pair the bridge once, then control each light (on/off, brightness, color picker) plus 8 named scene engines (Rainbow, Fire, Sunrise, Ocean, Alert, Party, Twinkle, Strobe).
- **Konica bizhub printers** — live SNMP status (CMYK toner gauges, paper trays, drums/developers/fuser/ITB/transfer roller/staples/saddle-staples), IPP print submission with finishing options, and a saddle-stitch booklet wizard (client-side 2-up imposition → tabloid duplex-short → finishings=saddle-stitch + fold-half → saddle-folder output bin).

## Project layout

| File | What it is |
|---|---|
| `backend.py` | FastAPI app — all endpoints, state, TTL cache, file uploads |
| `discovery.py` | mDNS + SSDP + Sonos/Chromecast/Bluetooth enrichment + subnet probes + reclassification |
| `controllers.py` | Sonos / Chromecast / Roku control adapters (volume, mute, playback) |
| `hue.py` | Hue bridge client + scene engine (`SceneRunner` thread, 8 scene functions) |
| `printers.py` | SNMP status + raw IPP print submission + booklet imposition (pypdf) |
| `static/index.html` | The dashboard shell with inline SVG banner |
| `static/style.css` | Theme (dark + light), all panel/card styles |
| `static/app.js` | All frontend logic — device rendering, Hue panel, printer panel, dialog, theme switch |
| `start.sh` | Launches uvicorn on port 8765, opens browser |
| `requirements.txt` | Python deps (zeroconf, soco, pychromecast, fastapi, pysnmp, pypdf, reportlab, playwright) |

## Endpoints

```
GET  /                                — dashboard
GET  /api/devices                      — all discovered devices + scan state
POST /api/discover                     — trigger a fresh scan (background thread)
POST /api/device/{id}/volume?level=N
POST /api/device/{id}/mute?on=bool
POST /api/device/{id}/playback?action=play|pause|stop|next|previous

GET  /api/hue/status                   — bridge state + paired? + scene status
POST /api/hue/pair                     — request a username (press button first)
GET  /api/hue/lights                   — all lights + groups
PUT  /api/hue/light/{id}?on=&bri=&hue=&sat=&ct=
PUT  /api/hue/group/{id}               — same fields, applies to all lights in the group
POST /api/hue/scene/{name}?lights=all  — start a scene
POST /api/hue/scene-stop

GET  /api/printers                     — all printers w/ live SNMP status (60s server-cached)
GET  /api/printer/{host}/status        — single printer
POST /api/printer/{host}/print         — multipart PDF upload, finishing flags, booklet=true triggers wizard
POST /api/printer/booklet-preview      — returns the imposed PDF without sending to print
GET  /api/printer/{host}/jobs          — current/recent jobs (uses pyipp; brittle on Konica)
```

## Known printer fleet

| IP | Model | Saddle-stitch | Notes |
|---|---|---|---|
| 10.1.10.200 | bizhub C458 | ✗ | Staple + 2/3-hole punch only |
| 10.1.10.201 | **bizhub C458** | **✓** | FS-535SD booklet finisher (saddle-stitch + fold) |
| 10.1.11.207 | bizhub C3350i | ✗ | A4 desktop, requires IPPS (TLS, port 443) |

Hue bridge: **10.1.10.170** (server room).

## Engineering notes

- **pyipp's response parser is broken against Konica firmware** (`'dict' object has no attribute 'value'`). The `printers.submit_print_job` function sidesteps this with a hand-rolled raw IPP request via `requests` — the hand-rolled path is the canonical one, do not reintroduce pyipp for submission.
- **SnmpEngine must be shared.** Creating a new `SnmpEngine()` per call leaks heavily — backend was hitting 78% CPU and 1 GB RAM. `printers._get_engine()` returns a singleton.
- **Server-side TTL cache** (`backend.py: _printer_cache`, 60 s) prevents the frontend's status polling from triggering SNMP storms.
- **Frontend skip-on-no-change.** `loadDevices` and `renderPrinterPanel` both hash their data and skip re-render when nothing meaningful changed — avoids the panel flicker that `innerHTML` replacement caused.
- **Special panels survive group re-renders.** `renderGroups` preserves & restores the existing innerHTML of `#printer-panel` and `#hue-panel` so the device-list refresh doesn't wipe their hydrated state.

## Files that should never be committed

- `.venv/` — the virtualenv
- `devices_cache.json` — last discovery snapshot, regenerated every scan
- `hue_credentials.json` — **sensitive!** Hue bridge API token
- `__pycache__/`

These are in `.gitignore`.

## Sensitive data to remember

- **Hue API token** in `hue_credentials.json` — anyone with this token + network access to the bridge can control every light in the building. Treat like a password.
- **Print job content** — PDFs are streamed straight through to the printer and not persisted. If you ever add a job-history feature with stored payloads, treat it as PHI-adjacent (Atlas is HIPAA).

## Adding a new device type or panel

The pattern used by Hue and Printer panels:

1. In `discovery.py`, make sure the device gets a stable type (e.g. `"hue"`, `"printer"`).
2. In `static/app.js`, add an entry to `TYPE_META`.
3. In `renderGroups`, add a special-case branch that renders `<div id="X-panel">…</div>` instead of normal cards.
4. Write a `renderXPanel()` that hydrates that div on demand from a backend endpoint, with its own slow refresh timer (60–120 s for status data).
5. In `backend.py`, add a TTL cache around any expensive backend probe so frontend polling doesn't translate into device storm.
