"""AVCast — control adapters per protocol."""
from __future__ import annotations
import requests


# ── UPnP MediaRenderer SOAP helper ──────────────────────────────────────
# Used for any device that exposes AVTransport (play/pause/stop/next/prev)
# or RenderingControl (SetVolume/SetMute) — discovered via SSDP and stashed
# on raw.upnp by discovery.enrich_upnp_renderer().

_RC_TYPE = "urn:schemas-upnp-org:service:RenderingControl:1"
_AV_TYPE = "urn:schemas-upnp-org:service:AVTransport:1"


def _upnp_soap(url: str, service_type: str, action: str, args: dict) -> tuple[bool, str]:
    """POST a SOAP envelope to a UPnP service control URL. Returns (ok, body)."""
    arg_xml = "".join(f"<{k}>{v}</{k}>" for k, v in args.items())
    envelope = (
        '<?xml version="1.0" encoding="utf-8"?>'
        '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"'
        ' s:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">'
        '<s:Body>'
        f'<u:{action} xmlns:u="{service_type}">{arg_xml}</u:{action}>'
        '</s:Body>'
        '</s:Envelope>'
    )
    headers = {
        "Content-Type": 'text/xml; charset="utf-8"',
        "SOAPAction": f'"{service_type}#{action}"',
    }
    try:
        r = requests.post(url, data=envelope, headers=headers, timeout=4)
        return (r.status_code == 200, r.text or "")
    except Exception as e:
        return (False, str(e))


def _upnp_get_rc_url(device: dict) -> str | None:
    return ((device.get("raw") or {}).get("upnp") or {}).get("rc_url")

def _upnp_get_av_url(device: dict) -> str | None:
    return ((device.get("raw") or {}).get("upnp") or {}).get("av_url")


def _sonos_by_uid(uid: str):
    import soco
    for sp in soco.discover(timeout=2) or []:
        if sp.uid.lower() == uid.lower():
            return sp
    return None


def _chromecast_by_uuid(uuid: str, host: str | None = None, port: int | None = None):
    """Resolve a Chromecast by UUID. Uses the `known_hosts` direct-probe path
    when an IP is known — this bypasses pychromecast's zeroconf discovery
    entirely, which is critical inside the long-running uvicorn process where
    zeroconf state from earlier discovery scans can leak and silently break
    subsequent get_chromecasts() calls. Falls back to a full scan if no host."""
    import pychromecast
    target_uuid_str = uuid.lower()
    # Primary path: known_hosts direct probe. ~5s, deterministic, no zeroconf.
    if host:
        try:
            casts, browser = pychromecast.get_chromecasts(known_hosts=[host], timeout=6)
            try:
                for cc in casts:
                    if str(cc.uuid).lower() == target_uuid_str:
                        cc.wait(timeout=3)
                        return cc
                # Single-host scan returned a Chromecast at this IP but UUID
                # didn't match — surface it anyway (better than failing).
                if casts:
                    cc = casts[0]
                    cc.wait(timeout=3)
                    return cc
            finally:
                try: browser.stop_discovery()
                except Exception: pass
        except Exception:
            pass
    # Fallback: full multicast scan. Slower + flaky inside uvicorn but kept
    # for completeness in case host got dropped from the device record.
    try:
        casts, browser = pychromecast.get_chromecasts(timeout=8)
        try:
            for cc in casts:
                if str(cc.uuid).lower() == target_uuid_str:
                    cc.wait(timeout=3)
                    return cc
        finally:
            try: browser.stop_discovery()
            except Exception: pass
    except Exception:
        pass
    return None


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
        cc = _chromecast_by_uuid(uuid, host=device.get("host"), port=device.get("port"))
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

    if t == "upnp-renderer":
        rc_url = _upnp_get_rc_url(device)
        if not rc_url:
            return {"ok": False, "error": "device has no RenderingControl service URL"}
        ok, body = _upnp_soap(rc_url, _RC_TYPE, "SetVolume",
                              {"InstanceID": 0, "Channel": "Master", "DesiredVolume": level})
        if ok:
            return {"ok": True, "volume": level}
        return {"ok": False, "error": f"UPnP SetVolume failed: {body[:120]}"}

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
        cc = _chromecast_by_uuid(uuid, host=device.get("host"), port=device.get("port"))
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

    if t == "upnp-renderer":
        rc_url = _upnp_get_rc_url(device)
        if not rc_url:
            return {"ok": False, "error": "device has no RenderingControl service URL"}
        ok, body = _upnp_soap(rc_url, _RC_TYPE, "SetMute",
                              {"InstanceID": 0, "Channel": "Master", "DesiredMute": "1" if muted else "0"})
        if ok:
            return {"ok": True, "muted": muted}
        return {"ok": False, "error": f"UPnP SetMute failed: {body[:120]}"}

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
        if not sp: return {"ok": False, "error": "Sonos not found on the network — try a fresh Live Cast scan"}
        try:
            if action == "play": sp.play()
            elif action == "pause": sp.pause()
            elif action == "stop": sp.stop()
            elif action == "next": sp.next()
            elif action == "previous": sp.previous()
            else: return {"ok": False, "error": f"unknown action {action}"}
            return {"ok": True, "action": action}
        except Exception as e:
            # Sonos returns SOAP error 701 ("Transition not available") when the
            # action doesn't make sense in the current transport state — the most
            # common case is hitting Play/Pause/Next when no track is queued.
            msg = str(e)
            if "701" in msg or "Transition not available" in msg:
                return {"ok": False, "error": (
                    f"Sonos can't {action} right now — nothing is queued. "
                    "Start music from the Sonos app, then this will work."
                )}
            return {"ok": False, "error": f"Sonos {action}: {msg}"}

    if t == "chromecast":
        uuid = raw.get("uuid") or device["id"].split(":", 1)[1]
        cc = _chromecast_by_uuid(uuid, host=device.get("host"), port=device.get("port"))
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

    if t == "upnp-renderer":
        av_url = _upnp_get_av_url(device)
        if not av_url:
            return {"ok": False, "error": "device has no AVTransport service URL"}
        upnp_actions = {
            "play":     ("Play",     {"InstanceID": 0, "Speed": "1"}),
            "pause":    ("Pause",    {"InstanceID": 0}),
            "stop":     ("Stop",     {"InstanceID": 0}),
            "next":     ("Next",     {"InstanceID": 0}),
            "previous": ("Previous", {"InstanceID": 0}),
        }
        if action not in upnp_actions:
            return {"ok": False, "error": f"upnp-renderer: unknown action {action}"}
        soap_action, args = upnp_actions[action]
        ok, body = _upnp_soap(av_url, _AV_TYPE, soap_action, args)
        if ok:
            return {"ok": True, "action": action}
        return {"ok": False, "error": f"UPnP {soap_action} failed: {body[:120]}"}

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
