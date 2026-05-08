"""AVCast — control adapters per protocol."""
from __future__ import annotations
import requests


def _sonos_by_uid(uid: str):
    import soco
    for sp in soco.discover(timeout=2) or []:
        if sp.uid.lower() == uid.lower():
            return sp
    return None


def _chromecast_by_uuid(uuid: str):
    import pychromecast
    casts, browser = pychromecast.get_chromecasts(timeout=4)
    target = None
    for cc in casts:
        if str(cc.uuid).lower() == uuid.lower():
            target = cc
            target.wait(timeout=3)
            break
    try: browser.stop_discovery()
    except Exception: pass
    return target


# ---------- Volume ----------

def set_volume(device: dict, level: int) -> dict:
    """level is 0-100"""
    level = max(0, min(100, int(level)))
    t = device["type"]
    raw = device.get("raw", {})
    host = device.get("host")

    if t == "sonos":
        uid = raw.get("uid") or device["id"].split(":", 1)[1]
        sp = _sonos_by_uid(uid)
        if not sp: return {"ok": False, "error": "sonos device not found on network"}
        sp.volume = level
        return {"ok": True, "volume": sp.volume}

    if t == "chromecast":
        uuid = raw.get("uuid") or device["id"].split(":", 1)[1]
        cc = _chromecast_by_uuid(uuid)
        if not cc: return {"ok": False, "error": "chromecast not found"}
        try:
            cc.set_volume(level / 100.0)
            return {"ok": True, "volume": level}
        finally:
            try: cc.disconnect()
            except Exception: pass

    if t == "roku" and host:
        # Roku ECP: no absolute volume — only relative VolumeUp/VolumeDown.
        # We approximate by sending VolumeUp/Down a number of steps based on delta.
        current = device.get("state", {}).get("volume")
        if current is None:
            return {"ok": False, "error": "roku has no absolute volume API; use mute/up/down via /playback"}
        delta = level - int(current)
        key = "VolumeUp" if delta > 0 else "VolumeDown"
        for _ in range(min(abs(delta), 30)):
            requests.post(f"http://{host}:8060/keypress/{key}", timeout=2)
        return {"ok": True, "volume": level, "note": "approximated via keypress"}

    return {"ok": False, "error": f"volume control not supported for type={t}"}


# ---------- Mute ----------

def set_mute(device: dict, muted: bool) -> dict:
    t = device["type"]
    raw = device.get("raw", {})
    host = device.get("host")

    if t == "sonos":
        uid = raw.get("uid") or device["id"].split(":", 1)[1]
        sp = _sonos_by_uid(uid)
        if not sp: return {"ok": False, "error": "sonos not found"}
        sp.mute = muted
        return {"ok": True, "muted": sp.mute}

    if t == "chromecast":
        uuid = raw.get("uuid") or device["id"].split(":", 1)[1]
        cc = _chromecast_by_uuid(uuid)
        if not cc: return {"ok": False, "error": "chromecast not found"}
        try:
            cc.set_volume_muted(muted)
            return {"ok": True, "muted": muted}
        finally:
            try: cc.disconnect()
            except Exception: pass

    if t == "roku" and host:
        requests.post(f"http://{host}:8060/keypress/VolumeMute", timeout=2)
        return {"ok": True, "muted": muted, "note": "Roku mute is a toggle"}

    return {"ok": False, "error": f"mute not supported for type={t}"}


# ---------- Playback ----------

def playback(device: dict, action: str) -> dict:
    """action: play | pause | stop | next | previous"""
    t = device["type"]
    raw = device.get("raw", {})
    host = device.get("host")
    action = action.lower()

    if t == "sonos":
        uid = raw.get("uid") or device["id"].split(":", 1)[1]
        sp = _sonos_by_uid(uid)
        if not sp: return {"ok": False, "error": "sonos not found"}
        try:
            if action == "play": sp.play()
            elif action == "pause": sp.pause()
            elif action == "stop": sp.stop()
            elif action == "next": sp.next()
            elif action == "previous": sp.previous()
            else: return {"ok": False, "error": f"unknown action {action}"}
            return {"ok": True, "action": action}
        except Exception as e:
            return {"ok": False, "error": str(e)}

    if t == "chromecast":
        uuid = raw.get("uuid") or device["id"].split(":", 1)[1]
        cc = _chromecast_by_uuid(uuid)
        if not cc: return {"ok": False, "error": "chromecast not found"}
        try:
            mc = cc.media_controller
            if action == "play": mc.play()
            elif action == "pause": mc.pause()
            elif action == "stop": mc.stop()
            elif action == "next": mc.queue_next()
            elif action == "previous": mc.queue_prev()
            else: return {"ok": False, "error": f"unknown action {action}"}
            return {"ok": True, "action": action}
        finally:
            try: cc.disconnect()
            except Exception: pass

    if t == "roku" and host:
        keymap = {"play": "Play", "pause": "Play", "stop": "Back",
                  "next": "Right", "previous": "Left", "home": "Home", "back": "Back",
                  "volumeup": "VolumeUp", "volumedown": "VolumeDown", "mute": "VolumeMute"}
        key = keymap.get(action)
        if not key: return {"ok": False, "error": f"roku: unknown action {action}"}
        requests.post(f"http://{host}:8060/keypress/{key}", timeout=2)
        return {"ok": True, "action": action, "key": key}

    return {"ok": False, "error": f"playback not supported for type={t}"}


# ---------- Health probe ----------

def ping_host(host: str, port: int | None = None, timeout: float = 1.5) -> dict:
    """Quick TCP-connect or ICMP-style probe. Returns latency_ms or None."""
    import socket, time
    if not host:
        return {"online": False, "latency_ms": None}
    candidates = [port] if port else [80, 8060, 1400, 8009, 7000, 5000, 443]
    for p in candidates:
        if not p: continue
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        start = time.time()
        try:
            s.connect((host, p))
            latency = round((time.time() - start) * 1000, 1)
            s.close()
            return {"online": True, "latency_ms": latency, "probe_port": p}
        except Exception:
            continue
        finally:
            try: s.close()
            except Exception: pass
    return {"online": False, "latency_ms": None}
