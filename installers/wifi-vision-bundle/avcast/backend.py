"""AVCast — FastAPI control plane."""
from __future__ import annotations

import asyncio
import json
import time
from pathlib import Path

from fastapi import FastAPI, HTTPException, BackgroundTasks, Header
import threading
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from discovery import discover_all
import controllers
import hue as hue_lib
import printers as printer_lib
import security_audit
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


# ---------- API ----------

@app.get("/api/devices")
def list_devices():
    return {
        "devices": list(_state["devices"].values()),
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


@app.post("/api/device/{device_id}/volume")
def post_volume(device_id: str, level: int):
    d = _state["devices"].get(device_id)
    if not d:
        raise HTTPException(404, f"device {device_id} not found")
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
    result = controllers.set_mute(d, on)
    if result.get("ok") and "muted" in result:
        d["state"]["muted"] = result["muted"]
        _save_cache()
    return result


@app.post("/api/device/{device_id}/playback")
def post_playback(device_id: str, action: str):
    d = _state["devices"].get(device_id)
    if not d:
        raise HTTPException(404, f"device {device_id} not found")
    result = controllers.playback(d, action)
    return result


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
def security_report():
    f = HERE.parent / "report.html"
    if not f.exists():
        raise HTTPException(404, "security audit report not found")
    return FileResponse(f, headers=_NO_CACHE)


@app.get("/data.js")
def security_report_data():
    f = HERE.parent / "data.js"
    if not f.exists():
        raise HTTPException(404, "data.js not found")
    return FileResponse(f, media_type="application/javascript")
