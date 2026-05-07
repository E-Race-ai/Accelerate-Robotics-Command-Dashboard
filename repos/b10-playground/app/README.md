# B10 Patient Position Monitor — Application

The working Minew B10 BLE sensor application from the **LTC Monitor** R&D
project. Captures live accelerometer data from a B10 worn on the sternum,
infers patient body position (Supine / Prone / Lateral / Upright / etc.),
and serves a real-time dashboard with daily and weekly position-time
distributions.

This is the application layer that complements the in-browser Sensor Lab
research tools: those run BLE in the browser; this runs a Python BLE
scanner against macOS CoreBluetooth for high-fidelity continuous capture.

## Files

| File | What it does |
|---|---|
| `b10_web.py` | **Main app.** BLE scanner + threaded HTTP server with a position-monitoring dashboard at `http://localhost:8765`. Persists daily position-time totals to `data/position_YYYY-MM-DD.json`. |
| `b10_live.py` | Terminal live view (no HTTP server). Useful for debugging frame parsing. |
| `scan_b10.py` | One-shot BLE scanner that identifies B10 beacons and parses iBeacon, Eddystone, and accelerometer broadcast frames. |
| `parse_b10.py` | Standalone frame-decoder — reverse-engineers the proprietary 0xA1 0x15 accel/gyro frame. |
| `find_b10.py` | Scanner that walks a Minew B10 through every advertised mode and surfaces which one carries motion data. |
| `connect_candidates.py` | Tries GATT-connected reads on devices that look like B10s (alternative to passive scanning). |
| `gatt_connect.py`, `gatt_sensor.py` | GATT connection paths if/when the B10 exposes notifications instead of advertisements. |

## Setup

```bash
# 1. Create and activate a Python venv (Python 3.12+)
python3.12 -m venv .venv
source .venv/bin/activate

# 2. Install BLE dependency
pip install -r requirements.txt
```

macOS will prompt for Bluetooth permission on first run.

## Run the dashboard

```bash
python b10_web.py
```

This starts the BLE scanner + dashboard at <http://localhost:8765>.
Browser opens automatically. Position-time data accumulates per day
under `data/`.

## Other handy commands

```bash
# Quick scan to confirm the B10 is reachable
python scan_b10.py 15        # scan for 15 seconds

# Live terminal view (no HTTP)
python b10_live.py

# One-shot exhaustive search across all advertised modes
python find_b10.py
```

## Reference hardware

| | |
|---|---|
| Sensor | Minew B10 (IP66, 60-day battery, 3-axis accel + 3-axis gyro) |
| Radio  | BLE 5.0 advertisement (Eddystone + iBeacon + proprietary accel frame) |
| Frame  | 14 bytes, big-endian: `A1 15 [ax_h ax_l ay_h ay_l az_h az_l] [gx_h gx_l gy_h gy_l gz_h gz_l]` |
| Scale  | Accelerometer counts ÷ 256 = g |

See `parse_b10.py` for the complete frame map.

## Position model

Sensor mounts on the patient's sternum, Y axis pointing toward the head.
The dashboard classifies orientation against the gravity vector:

| Body axis | At rest | Position |
|---|---|---|
| Y = -1g | gravity through feet | Standing / Upright |
| Z = +1g | gravity through back | Supine |
| Z = -1g | gravity through chest | Prone |
| X = +1g | gravity through right side | Left Lateral |
| X = -1g | gravity through left side | Right Lateral |

Lateral detection threshold: 20° tilt = "tilted", 25° = full lateral turn,
45° = primary supine/prone/upright. Tunable in
`orientation_from_accel()` in `b10_web.py`.

## Known limits

- macOS CoreBluetooth caches advertisements aggressively. The scanner
  uses 1-second restart cycles and adaptive back-off (see `ble_loop()`)
  to maximize update rate.
- Daily JSON files persist only the *time-in-position* totals — not the
  raw stream. Raw frames live only in memory for the current session.
- Excluded from this folder: `.venv/` (generate locally), `data/` (your
  recorded sessions), and `__pycache__/`.
