"""AVCast — FastAPI control plane."""
from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, BackgroundTasks, Header
import threading
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from discovery import discover_all
import controllers
import hue as hue_lib
import printers as printer_lib
import security_audit
import security_report_pdf
import sample_devices
import atv_client
from fastapi import UploadFile, File, Form
from fastapi.responses import StreamingResponse
import io


HERE = Path(__file__).parent
STATIC = HERE / "static"
CACHE_FILE = HERE / "devices_cache.json"

app = FastAPI(title="AVCast", version="1.0")

# in-memory device registry — keyed by id
_state: dict = {
    "devices": {},
    "last_scan": None,
    "scanning": False,
}


def _load_cache():
    if CACHE_FILE.exists():
        try:
            data = json.loads(CACHE_FILE.read_text())
            _state["devices"] = {d["id"]: d for d in data.get("devices", [])}
            _state["last_scan"] = data.get("last_scan")
        except Exception:
            pass


def _save_cache():
    try:
        CACHE_FILE.write_text(json.dumps({
            "devices": list(_state["devices"].values()),
            "last_scan": _state["last_scan"],
        }, indent=2, default=str))
    except Exception:
        pass


_load_cache()
# WHY: first-install / fresh-cache UX — populate with sample devices so a
# new operator opening the dashboard immediately sees what the tool produces
# instead of an empty "no devices yet" screen. The amber SAMPLE DATA banner
# makes the demo state obvious; a Live Cast scan or the Clear button
# replaces it with real data (or nothing).
if not _state["devices"]:
    _state["devices"] = sample_devices.as_registry()
    _state["last_scan"] = sample_devices.last_scan_timestamp()


# ---------- API ----------

_APPLE_TYPES = ("appletv", "airplay", "homekit")


@app.get("/api/devices")
def list_devices():
    paired = atv_client.list_paired()
    devs = []
    for d in _state["devices"].values():
        d2 = dict(d)
        is_apple = d2.get("type") in _APPLE_TYPES and not d2.get("is_sample")
        if is_apple:
            # HomePod detection — model is "AudioAccessory<x>,<y>" for HomePods
            # (Original / mini / 2nd gen). Used by the frontend to pick the right
            # pairing-modal copy (HomePod has no screen — PIN is spoken aloud) and
            # to skip the D-pad in the remote panel.
            mdl = (d2.get("model") or "").lower()
            d2["is_homepod"] = "audioaccessory" in mdl or "homepod" in mdl
            if d2.get("host") in paired:
                # Paired → real control via pyatv. Use granular cap names that
                # match the per-button checks in renderCard (hasPlay/hasNext/...
                # — without these, paired HomePods showed the volume slider but
                # no transport buttons).
                d2["paired"] = True
                d2["capabilities"] = ["volume", "play", "pause", "stop", "next", "previous"]
            else:
                # Unpaired real Apple device → mDNS may have announced caps
                # like "volume"/"play"/"pause" but the device won't accept
                # commands without pairing. Strip them so the frontend shows
                # the prominent "🔗 Pair to control" button instead of fake
                # controls that error on click.
                d2["capabilities"] = []
                d2["needs_pair"] = True
        devs.append(d2)
    return {
        "devices": devs,
        "last_scan": _state["last_scan"],
        "scanning": _state["scanning"],
    }


def _discovery_worker():
    try:
        devs = discover_all(mdns_timeout=4.0, ssdp_timeout=2.5)
        _state["devices"] = {d.id: d.to_dict() for d in devs}
        _state["last_scan"] = time.time()
        _save_cache()
    except Exception as e:
        print(f"[avcast] discovery error: {e}", flush=True)
    finally:
        _state["scanning"] = False


RESCAN_PASSWORD = "Atl@$"


@app.get("/api/network")
def network_info():
    """Auto-detected local network info — subnets the machine is attached to
    and the primary IPv4 the scanner uses. The WiFi Audit hero reads this so
    the page always reflects the CURRENT network, not whatever was hardcoded
    when the tool was first installed."""
    import socket
    from discovery import default_subnets
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        scanner_ip = s.getsockname()[0]
        s.close()
    except Exception:
        scanner_ip = None
    return {
        "subnets": default_subnets(),
        "scanner": scanner_ip,
        "hostname": socket.gethostname(),
    }


@app.post("/api/auth/check")
def auth_check(x_rescan_password: str | None = Header(default=None)):
    """Side-effect-free password validator. Used by the password-challenge modal
    to verify credentials BEFORE kicking off any real scan, so we can keep the
    modal open + show inline error on a wrong PIN instead of closing it."""
    if x_rescan_password != RESCAN_PASSWORD:
        raise HTTPException(401, "wrong password")
    return {"ok": True}


@app.post("/api/discover")
def trigger_discover(x_rescan_password: str | None = Header(default=None)):
    if x_rescan_password != RESCAN_PASSWORD:
        raise HTTPException(401, "rescan password required")
    if _state["scanning"]:
        return {"ok": False, "error": "scan already in progress"}
    _state["scanning"] = True
    threading.Thread(target=_discovery_worker, daemon=True).start()
    return {"ok": True, "started": True}


@app.get("/api/device/{device_id}")
def get_device(device_id: str):
    d = _state["devices"].get(device_id)
    if not d:
        raise HTTPException(404, f"device {device_id} not found")
    return d


def _is_apple_device(d: dict) -> bool:
    """Apple TV / HomePod / generic AirPlay receiver — controlled via pyatv."""
    return d.get("type") in ("appletv", "airplay", "homekit") and bool(d.get("host"))


# ── Sample-device control helpers ─────────────────────────────────────
# Sample devices have no real hardware behind them, but the demo needs
# every button to feel responsive. These helpers mutate the in-memory
# device state so the dashboard's polling re-renders with the change.

_SAMPLE_TRACKS = [
    {"title": "Sample Track One",   "artist": "Demo Artist",   "album": "Example Album", "duration": 192},
    {"title": "Sample Track Two",   "artist": "Demo Artist",   "album": "Example Album", "duration": 215},
    {"title": "Sample Focus Mix",   "artist": "Sample Artist", "album": "Sample Mix",    "duration": 3600},
    {"title": "Sample Lo-fi Beats", "artist": "Sample Artist", "album": "Lo-fi Sample",  "duration": 5400},
    {"title": "Sample Podcast Ep",  "artist": "Sample Show",   "album": "Demo Podcast",  "duration": 2700},
]


_REMOTE_NAV_ACTIONS = {
    "up", "down", "left", "right", "select",
    "menu", "home", "home_hold", "top_menu", "screensaver",
    "skip_forward", "skip_backward", "volume_up", "volume_down", "play_pause",
}


def _sample_playback(d: dict, action: str) -> dict:
    """Mutate sample-device state to fake a transport action — for demos."""
    st = d["state"]
    # Apple TV remote actions (D-pad, menu, etc.) — no state mutation, just
    # return success so the demo button shows a toast and doesn't error.
    if action in _REMOTE_NAV_ACTIONS:
        return {"ok": True, "action": action, "demo": True}
    if action == "play":
        st["playing"] = True
        if not st.get("track"):
            t = dict(_SAMPLE_TRACKS[0])
            t["position"] = 0
            t["art"] = ""
            st["track"] = t
            st["now_playing"] = f"{t['artist']} — {t['title']}"
    elif action == "pause":
        st["playing"] = False
    elif action == "stop":
        st["playing"] = False
        st["track"] = {}
        st["now_playing"] = None
    elif action in ("next", "previous"):
        # Cycle the simulated track list. Hash the device id to keep it
        # deterministic per-card so repeated clicks feel sequential.
        seed = sum(ord(c) for c in d.get("id", "")) + (1 if action == "next" else -1)
        idx = abs(seed) % len(_SAMPLE_TRACKS)
        # Stash an index so subsequent clicks advance from there.
        idx = (st.get("_sample_track_idx", idx) + (1 if action == "next" else -1)) % len(_SAMPLE_TRACKS)
        st["_sample_track_idx"] = idx
        t = dict(_SAMPLE_TRACKS[idx])
        t["position"] = 0
        t["art"] = ""
        st["track"] = t
        st["now_playing"] = f"{t['artist']} — {t['title']}"
        st["playing"] = True
    return {"ok": True, "action": action, "demo": True, "state": {"playing": st.get("playing"), "track": st.get("track")}}


@app.post("/api/device/{device_id}/volume")
async def post_volume(device_id: str, level: int):
    d = _state["devices"].get(device_id)
    if not d:
        raise HTTPException(404, f"device {device_id} not found")
    if d.get("is_sample"):
        d["state"]["volume"] = max(0, min(100, level))
        return {"ok": True, "volume": d["state"]["volume"], "demo": True}
    if _is_apple_device(d) and atv_client.is_paired(d["host"]):
        try:
            await atv_client.set_volume(d["host"], level)
            d["state"]["volume"] = level
            _save_cache()
            return {"ok": True, "volume": level}
        except Exception as e:
            return {"ok": False, "error": f"apple device control failed: {e}"}
    result = controllers.set_volume(d, level)
    if result.get("ok") and "volume" in result:
        d["state"]["volume"] = result["volume"]
        _save_cache()
    return result


@app.post("/api/device/{device_id}/mute")
def post_mute(device_id: str, on: bool = True):
    d = _state["devices"].get(device_id)
    if not d:
        raise HTTPException(404, f"device {device_id} not found")
    if d.get("is_sample"):
        d["state"]["muted"] = bool(on)
        return {"ok": True, "muted": d["state"]["muted"], "demo": True}
    result = controllers.set_mute(d, on)
    if result.get("ok") and "muted" in result:
        d["state"]["muted"] = result["muted"]
        _save_cache()
    return result


@app.post("/api/device/{device_id}/playback")
async def post_playback(device_id: str, action: str):
    d = _state["devices"].get(device_id)
    if not d:
        raise HTTPException(404, f"device {device_id} not found")
    if d.get("is_sample"):
        return _sample_playback(d, action)
    if _is_apple_device(d) and atv_client.is_paired(d["host"]):
        try:
            await atv_client.playback(d["host"], action)
            return {"ok": True, "action": action}
        except Exception as e:
            return {"ok": False, "error": f"apple device control failed: {e}"}
    result = controllers.playback(d, action)
    return result


@app.post("/api/device/{device_id}/atv/keyboard")
async def atv_keyboard(device_id: str, text: str = "", clear: bool = False):
    """Type into a paired Apple TV's focused text field — search bars, login
    screens, etc. Saves the user from pecking with the Siri Remote."""
    d = _state["devices"].get(device_id)
    if not d:
        raise HTTPException(404, f"device {device_id} not found")
    if d.get("is_sample"):
        return {"ok": True, "demo": True, "echoed": text}
    if not _is_apple_device(d) or not atv_client.is_paired(d.get("host", "")):
        return {"ok": False, "error": "device must be a paired Apple TV"}
    try:
        await atv_client.keyboard_text(d["host"], text, clear=clear)
        return {"ok": True, "sent": text, "cleared": bool(clear)}
    except Exception as e:
        return {"ok": False, "error": f"keyboard send failed: {e}"}


# ── Apple TV / HomePod pairing ──────────────────────────────────────

@app.post("/api/device/{device_id}/pair/start")
async def atv_pair_start(device_id: str, protocol: str = "airplay"):
    d = _state["devices"].get(device_id)
    if not d:
        raise HTTPException(404, f"device {device_id} not found")
    if d.get("is_sample"):
        return {"ok": False, "error": "this is a demo device — load a real network scan to pair"}
    if not d.get("host"):
        raise HTTPException(400, "device has no IP address")
    try:
        return await atv_client.start_pair(d["host"], protocol)
    except Exception as e:
        raise HTTPException(500, f"start pair failed: {e}")


@app.post("/api/atv/pair/finish")
async def atv_pair_finish(session_id: str, pin: str = ""):
    return await atv_client.submit_pin(session_id, pin)


@app.post("/api/atv/pair/cancel")
async def atv_pair_cancel(session_id: str):
    await atv_client.cancel_pair(session_id)
    return {"ok": True}


@app.post("/api/device/{device_id}/unpair")
def atv_unpair(device_id: str):
    d = _state["devices"].get(device_id)
    if not d:
        raise HTTPException(404, f"device {device_id} not found")
    if not d.get("host"):
        raise HTTPException(400, "device has no IP address")
    removed = atv_client.unpair(d["host"])
    return {"ok": True, "removed": removed}


@app.get("/api/atv/paired")
def atv_list_paired():
    return atv_client.list_paired()


@app.post("/api/device/{device_id}/ping")
def post_ping(device_id: str):
    d = _state["devices"].get(device_id)
    if not d:
        raise HTTPException(404, f"device {device_id} not found")
    probe = controllers.ping_host(d.get("host"), d.get("port"))
    d["state"]["online"] = probe["online"]
    d["state"]["latency_ms"] = probe.get("latency_ms")
    _save_cache()
    return probe


# ---------- Hue ----------

def _hue_bridge_ip() -> str | None:
    """Find the Hue bridge IP from our discovered devices."""
    for d in _state["devices"].values():
        if d.get("type") == "hue" and d.get("host"):
            return d["host"]
    return None


@app.get("/api/hue/status")
def hue_status():
    ip = _hue_bridge_ip()
    if not ip:
        return {"bridge_found": False, "paired": False}
    bridge = hue_lib.HueBridge(ip)
    return {
        "bridge_found": True,
        "bridge_ip": ip,
        "paired": bridge.is_paired(),
        "scene": hue_lib.runner.status,
        "scenes_available": [
            {"id": k, **hue_lib.SCENE_META[k]} for k in hue_lib.SCENES
        ],
    }


@app.post("/api/hue/pair")
def hue_pair():
    ip = _hue_bridge_ip()
    if not ip: raise HTTPException(404, "no Hue bridge discovered yet — run a rescan")
    bridge = hue_lib.HueBridge(ip)
    return bridge.pair()


@app.get("/api/hue/lights")
def hue_lights():
    ip = _hue_bridge_ip()
    if not ip: raise HTTPException(404, "no Hue bridge")
    bridge = hue_lib.HueBridge(ip)
    if not bridge.username:
        return {"error": "not paired", "lights": {}, "groups": {}}
    try:
        return {
            "lights": bridge.list_lights(),
            "groups": bridge.list_groups(),
        }
    except Exception as e:
        return {"error": str(e), "lights": {}, "groups": {}}


@app.put("/api/hue/light/{light_id}")
def hue_set_light(light_id: str, on: bool | None = None, bri: int | None = None,
                   hue: int | None = None, sat: int | None = None, ct: int | None = None):
    ip = _hue_bridge_ip()
    if not ip: raise HTTPException(404, "no Hue bridge")
    bridge = hue_lib.HueBridge(ip)
    payload = {k: v for k, v in {"on": on, "bri": bri, "hue": hue, "sat": sat, "ct": ct}.items() if v is not None}
    if not payload: return {"ok": False, "error": "no fields to set"}
    return bridge.set_light_state(light_id, **payload)


@app.put("/api/hue/group/{group_id}")
def hue_set_group(group_id: str, on: bool | None = None, bri: int | None = None,
                   hue: int | None = None, sat: int | None = None, ct: int | None = None):
    ip = _hue_bridge_ip()
    if not ip: raise HTTPException(404, "no Hue bridge")
    bridge = hue_lib.HueBridge(ip)
    payload = {k: v for k, v in {"on": on, "bri": bri, "hue": hue, "sat": sat, "ct": ct}.items() if v is not None}
    if not payload: return {"ok": False, "error": "no fields to set"}
    return bridge.set_group_action(group_id, **payload)


@app.post("/api/hue/scene/{scene_name}")
def hue_start_scene(scene_name: str, lights: str = "all"):
    ip = _hue_bridge_ip()
    if not ip: raise HTTPException(404, "no Hue bridge")
    bridge = hue_lib.HueBridge(ip)
    if not bridge.username: return {"ok": False, "error": "bridge not paired"}
    if lights == "all":
        try:
            light_ids = list(bridge.list_lights().keys())
        except Exception as e:
            return {"ok": False, "error": str(e)}
    else:
        light_ids = [l.strip() for l in lights.split(",") if l.strip()]
    if not light_ids: return {"ok": False, "error": "no lights selected"}
    return hue_lib.runner.start(scene_name, bridge, light_ids)


@app.post("/api/hue/scene-stop")
def hue_stop_scene():
    hue_lib.runner.stop()
    return {"ok": True, "stopped": True}


# ---------- Printers ----------

def _printer_hosts() -> list[str]:
    return [d["host"] for d in _state["devices"].values()
            if d.get("type") == "printer" and d.get("host")]


# Server-side TTL cache for SNMP results — prevents the SNMP probes from being
# re-run on every frontend poll. Frontend can request fresh data with ?force=1.
_printer_cache = {"data": None, "fetched_at": 0.0, "lock": asyncio.Lock()}
PRINTER_CACHE_TTL = 60.0  # seconds


async def _refresh_printer_cache():
    hosts = _printer_hosts()
    if not hosts:
        _printer_cache["data"] = []
        _printer_cache["fetched_at"] = time.time()
        return
    statuses = await asyncio.gather(*(printer_lib.get_status(h) for h in hosts), return_exceptions=True)
    out = []
    for h, s in zip(hosts, statuses):
        if isinstance(s, Exception):
            out.append({"host": h, "online": False, "error": str(s)})
        else:
            out.append(s)
    _printer_cache["data"] = out
    _printer_cache["fetched_at"] = time.time()


@app.get("/api/printers")
async def printers_list(force: bool = False):
    now = time.time()
    cached = _printer_cache["data"]
    age = now - _printer_cache["fetched_at"]
    if cached is not None and not force and age < PRINTER_CACHE_TTL:
        return {"printers": cached, "cache_age_s": round(age, 1), "cached": True}
    async with _printer_cache["lock"]:
        # double-check inside the lock — another caller may have refreshed already
        if _printer_cache["data"] is None or force or (time.time() - _printer_cache["fetched_at"]) >= PRINTER_CACHE_TTL:
            await _refresh_printer_cache()
    return {"printers": _printer_cache["data"], "cache_age_s": 0, "cached": False}


@app.get("/api/printer/{host}/status")
async def printer_status(host: str):
    if host not in _printer_hosts():
        raise HTTPException(404, f"unknown printer host {host}")
    return await printer_lib.get_status(host)


@app.get("/api/printer/{host}/jobs")
async def printer_jobs(host: str, tls: bool = False):
    return {"jobs": await printer_lib.get_jobs(host, use_tls=tls)}


@app.post("/api/printer/{host}/print")
async def printer_print(
    host: str,
    pdf: UploadFile = File(...),
    job_name: str = Form("AVCast Print"),
    copies: int = Form(1),
    sides: str = Form("one-sided"),
    media: str = Form("letter"),
    color: bool = Form(True),
    finishings: str = Form(""),
    booklet: bool = Form(False),
    tls: bool = Form(False),
):
    pdf_bytes = await pdf.read()
    fin_list = [f.strip() for f in finishings.split(",") if f.strip()] if finishings else None

    # Booklet mode: re-impose the PDF and force saddle-stitch + landscape tabloid
    booklet_info = None
    if booklet:
        try:
            pdf_bytes, booklet_info = printer_lib.make_booklet_pdf(pdf_bytes)
            fin_list = ["saddle-stitch"]
            media = "tabloid"  # 2-up letter → tabloid
            sides = "duplex-short"
        except Exception as e:
            return {"ok": False, "error": f"booklet imposition failed: {e}"}

    result = await printer_lib.submit_print_job(
        host, pdf_bytes,
        job_name=job_name, copies=copies, sides=sides, media=media,
        color=color, finishings=fin_list, use_tls=tls,
    )
    if booklet_info:
        result["booklet"] = booklet_info
    return result


@app.post("/api/printer/booklet-preview")
async def booklet_preview(pdf: UploadFile = File(...)):
    """Return the imposed booklet PDF for download/preview without sending to printer."""
    pdf_bytes = await pdf.read()
    try:
        out, info = printer_lib.make_booklet_pdf(pdf_bytes)
    except Exception as e:
        raise HTTPException(400, f"booklet imposition failed: {e}")
    return StreamingResponse(io.BytesIO(out), media_type="application/pdf",
                              headers={"Content-Disposition": 'inline; filename="booklet.pdf"',
                                       "X-Booklet-Info": str(info)})


# ---------- Static frontend ----------

if STATIC.exists():
    app.mount("/static", StaticFiles(directory=str(STATIC)), name="static")


# ---------- Security audit pipeline ----------

@app.post("/api/security/rescan")
def security_rescan(x_rescan_password: str | None = Header(default=None)):
    if x_rescan_password != RESCAN_PASSWORD:
        raise HTTPException(401, "rescan password required")
    started = security_audit.start_pipeline()
    if not started:
        return {"ok": False, "error": "scan already in progress",
                "status": security_audit.get_status()}
    return {"ok": True, "started": True, "status": security_audit.get_status()}


@app.get("/api/security/status")
def security_status():
    return security_audit.get_status()


@app.post("/api/security/stop")
def security_stop(x_rescan_password: str | None = Header(default=None)):
    """Cancel a running scan. Reuses the rescan password — you only get to
    stop a scan if you know how to start one. The pipeline sees the flag
    between stages and the running nmap subprocess is terminated, so the
    cancellation is immediate. No partial data is written; the page returns
    to whatever state it was in before the scan started."""
    if x_rescan_password != RESCAN_PASSWORD:
        raise HTTPException(401, "password required")
    return security_audit.request_stop()


# ── Demo / reset endpoints (no password — purely cosmetic, no network touched) ──

@app.post("/api/devices/clear")
def clear_devices():
    """Wipe the on-screen device list. No real scan is touched."""
    _state["devices"] = {}
    _state["last_scan"] = None
    if CACHE_FILE.exists():
        try: CACHE_FILE.unlink()
        except Exception: pass
    return {"ok": True, "cleared": True}


@app.post("/api/devices/sample")
def load_sample_devices():
    """Load curated sample devices so the dashboard can be demoed without scanning."""
    _state["devices"] = sample_devices.as_registry()
    _state["last_scan"] = sample_devices.last_scan_timestamp()
    _save_cache()
    return {"ok": True, "loaded": len(_state["devices"])}


_EMPTY_SECURITY_DATA = {
    "hosts": [], "vulns": [],
    "risk": {"score": 0, "grade": "—",
             "verdict": "No scan data — load sample data or run a scan to populate this report.",
             "raw": 0},
    "meta": {"subnets": [], "scanner": "—", "date": "—", "live": 0},
    "recommendations": [], "methodology": [],
}


@app.post("/api/security/clear")
def clear_security():
    """Replace data.js with an empty-but-renderable structure."""
    data_file = HERE.parent / "data.js"
    data_file.write_text("window.SCAN = " + json.dumps(_EMPTY_SECURITY_DATA) + ";\n")
    return {"ok": True, "cleared": True}


@app.post("/api/security/sample")
def load_security_sample():
    """Swap data.js with the bundled sample audit dataset."""
    sample_file = HERE.parent / "sample_data.js"
    if not sample_file.exists():
        raise HTTPException(404, "sample_data.js not bundled")
    data_file = HERE.parent / "data.js"
    data_file.write_text(sample_file.read_text())
    return {"ok": True, "loaded": True}


_NO_CACHE = {"Cache-Control": "no-cache, must-revalidate"}


@app.get("/")
def index():
    f = STATIC / "index.html"
    if not f.exists():
        return JSONResponse({"error": "frontend not built yet"}, status_code=503)
    return FileResponse(f, headers=_NO_CACHE)


# Security audit report lives in the parent netscan dir — surface it here
# so the dashboard's "← Security Audit" link works.
@app.get("/report.html")
def security_report(scan: str = ""):
    """Serve the report. By default, every navigation gets the empty
    placeholder — fresh visits should always show the 'no scan data' state.
    The single exception is `?scan=current`: the auto-reload after a
    successful scan navigates there so the user sees their just-completed
    results. Manual reloads on that URL keep showing the data; closing the
    tab and re-opening goes back to empty."""
    f = HERE.parent / "report.html"
    if not f.exists():
        raise HTTPException(404, "security audit report not found")
    data_file = HERE.parent / "data.js"
    if scan != "current":
        data_file.write_text("window.SCAN = " + json.dumps(_EMPTY_SECURITY_DATA) + ";\n")
    return FileResponse(f, headers=_NO_CACHE)


@app.get("/data.js")
def security_report_data():
    f = HERE.parent / "data.js"
    if not f.exists():
        raise HTTPException(404, "data.js not found")
    return FileResponse(f, media_type="application/javascript")


@app.get("/sample_data.js")
def security_report_sample():
    f = HERE.parent / "sample_data.js"
    if not f.exists():
        raise HTTPException(404, "sample_data.js not bundled")
    return FileResponse(f, media_type="application/javascript")


@app.get("/api/security/report.pdf")
def security_report_pdf_endpoint():
    """Server-side rendered PDF of the audit. Identical bytes on every browser."""
    data_file = HERE.parent / "data.js"
    if not data_file.exists():
        raise HTTPException(404, "no audit data yet — run a scan first")
    try:
        pdf_bytes = security_report_pdf.build_pdf(data_file)
    except Exception as e:
        raise HTTPException(500, f"PDF generation failed: {e}")
    fname = f"wifi-audit-report-{int(time.time())}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{fname}"',
            "Cache-Control": "no-store",
        },
    )
