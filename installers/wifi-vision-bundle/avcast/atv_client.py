"""Real Apple TV / HomePod / AirPlay-receiver control via pyatv.

Each Apple device requires a one-time pairing handshake before it accepts
control commands. The user clicks "Pair" in the dashboard → backend kicks
off pyatv.pair → device displays a 4-digit PIN → user types it in →
credentials get saved to disk. Subsequent connects are silent.

Public surface:
    is_paired(host) -> bool
    list_paired() -> dict[host, ProtocolName]
    discover() -> list[dict]  (scan results enriched with paired flag)

    start_pair(host, protocol="airplay") -> session_id  (async)
    submit_pin(session_id, pin) -> dict {ok, error}     (async)
    cancel_pair(session_id) -> None                     (async)

    set_volume(host, level: int) -> None                (async)
    playback(host, action: str) -> None                 (async)
    now_playing(host) -> dict                           (async)

The AirPlay protocol is the broadest (works for HomePod, Apple TV, third-
party AirPlay receivers). MRP / Companion are richer but Apple TV-specific
and have separate pairing flows; we stick to AirPlay for now.
"""
from __future__ import annotations

import asyncio
import json
import secrets
from pathlib import Path
from typing import Optional

try:
    import pyatv
    from pyatv.const import Protocol
    PYATV_AVAILABLE = True
except Exception:  # pyatv not installed yet (pre-bundle install) — degrade gracefully
    pyatv = None
    Protocol = None
    PYATV_AVAILABLE = False


# ── Credential storage ───────────────────────────────────────────────
APP_SUPPORT = Path.home() / "Library" / "Application Support" / "WiFiVisionExtreme"
CREDS_FILE  = APP_SUPPORT / "atv-creds.json"


def _read_creds() -> dict:
    if not CREDS_FILE.exists():
        return {}
    try:
        return json.loads(CREDS_FILE.read_text())
    except Exception:
        return {}


def _write_creds(d: dict) -> None:
    APP_SUPPORT.mkdir(parents=True, exist_ok=True)
    CREDS_FILE.write_text(json.dumps(d, indent=2))


def is_paired(host: str) -> bool:
    return bool(_read_creds().get(host))


def list_paired() -> dict:
    return {host: entry.get("protocol", "airplay") for host, entry in _read_creds().items()}


# ── Pairing session bookkeeping ──────────────────────────────────────
# pyatv pairing is stateful — the same `pairing` object handles begin →
# pin → finish. We keep them alive across HTTP requests in this dict
# keyed by an opaque session id we hand to the client.
_pairing_sessions: dict = {}  # session_id -> {pairing, atv_config, host, protocol}


# ── Internals ────────────────────────────────────────────────────────

async def _scan_one(host: str, timeout: float = 4.0):
    """Find a single Apple device by IP. Returns the AppleTV config or None."""
    if not PYATV_AVAILABLE:
        return None
    loop = asyncio.get_event_loop()
    found = await pyatv.scan(loop, hosts=[host], timeout=timeout)
    return found[0] if found else None


async def _connect(host: str):
    """Connect to a paired device. Raises RuntimeError if not paired."""
    if not PYATV_AVAILABLE:
        raise RuntimeError("pyatv is not installed in this venv")
    creds = _read_creds().get(host)
    if not creds:
        raise RuntimeError(f"{host} is not paired yet")
    config = await _scan_one(host)
    if not config:
        raise RuntimeError(f"{host} not reachable on the network")
    proto_name = creds.get("protocol", "airplay")
    proto = getattr(Protocol, proto_name.capitalize(), Protocol.AirPlay)
    config.set_credentials(proto, creds["credentials"])
    loop = asyncio.get_event_loop()
    return await pyatv.connect(config, loop, protocol=proto)


# ── Discovery ────────────────────────────────────────────────────────

async def discover(timeout: float = 4.0) -> list:
    """Discover Apple devices, marking paired ones."""
    if not PYATV_AVAILABLE:
        return []
    loop = asyncio.get_event_loop()
    found = await pyatv.scan(loop, timeout=timeout)
    paired = _read_creds()
    out = []
    for c in found:
        host = str(c.address)
        out.append({
            "host": host,
            "name": c.name,
            "model": str(c.device_info.model) if c.device_info else "",
            "paired": host in paired,
            "services": [s.protocol.name.lower() for s in c.services],
        })
    return out


# ── Pairing flow ─────────────────────────────────────────────────────

async def start_pair(host: str, protocol: str = "airplay") -> dict:
    """Begin pairing. Caller shows the PIN displayed on the device, then
    posts it to submit_pin with the returned session_id."""
    if not PYATV_AVAILABLE:
        raise RuntimeError("pyatv is not installed in this venv")
    config = await _scan_one(host)
    if not config:
        raise RuntimeError(f"{host} not reachable")
    proto = getattr(Protocol, protocol.capitalize(), Protocol.AirPlay)
    loop = asyncio.get_event_loop()
    pairing = await pyatv.pair(config, proto, loop)
    await pairing.begin()
    sid = secrets.token_urlsafe(12)
    _pairing_sessions[sid] = {
        "pairing": pairing, "host": host, "protocol": protocol,
    }
    return {
        "ok": True,
        "session_id": sid,
        "device_provides_pin": pairing.device_provides_pin,
        "msg": (
            "A 4-digit PIN should now appear on your device. "
            "Type it into the dashboard to finish pairing."
            if pairing.device_provides_pin else
            "This device doesn't show a PIN — pairing will complete on submit."
        ),
    }


async def submit_pin(session_id: str, pin: str) -> dict:
    sess = _pairing_sessions.get(session_id)
    if not sess:
        return {"ok": False, "error": "unknown or expired pairing session"}
    pairing = sess["pairing"]
    try:
        if pin:
            pairing.pin(int(pin))
        await pairing.finish()
    except Exception as e:
        await pairing.close()
        _pairing_sessions.pop(session_id, None)
        return {"ok": False, "error": f"pairing failed: {e}"}
    if not pairing.has_paired:
        await pairing.close()
        _pairing_sessions.pop(session_id, None)
        return {"ok": False, "error": "device rejected the PIN"}
    creds = pairing.service.credentials
    creds_db = _read_creds()
    creds_db[sess["host"]] = {
        "credentials": creds,
        "protocol": sess["protocol"],
    }
    _write_creds(creds_db)
    await pairing.close()
    _pairing_sessions.pop(session_id, None)
    return {"ok": True, "host": sess["host"]}


async def cancel_pair(session_id: str) -> None:
    sess = _pairing_sessions.pop(session_id, None)
    if sess:
        try: await sess["pairing"].close()
        except Exception: pass


def unpair(host: str) -> bool:
    """Forget a device's credentials."""
    creds = _read_creds()
    if host in creds:
        creds.pop(host)
        _write_creds(creds)
        return True
    return False


# ── Control ──────────────────────────────────────────────────────────

async def set_volume(host: str, level: int) -> None:
    """0-100. Apple devices use a 0.0-100.0 float internally."""
    atv = await _connect(host)
    try:
        await atv.audio.set_volume(float(max(0, min(100, level))))
    finally:
        atv.close()


async def playback(host: str, action: str) -> None:
    """Full Apple TV remote — D-pad, menu, home, screensaver, transport.
    Maps action names to pyatv RemoteControl methods. Unsupported actions
    on a given device (e.g. d-pad on a HomePod) raise an error from pyatv."""
    atv = await _connect(host)
    try:
        rc = atv.remote_control

        # Screensaver: pyatv's rc.screensaver() relies on a private API that
        # tvOS frequently breaks. The universally-reliable trick is "press
        # Menu several times until it kicks in" — same thing a human does
        # on the physical remote. 4 presses with a small gap is enough to
        # exit any nested view and trigger the screensaver from Home.
        if action == "screensaver":
            for _ in range(4):
                await rc.menu()
                await asyncio.sleep(0.25)
            return

        # Map of action name → coroutine to invoke. Covers transport, D-pad,
        # menu navigation, and convenience buttons.
        actions = {
            # Transport
            "play":            rc.play,
            "pause":           rc.pause,
            "play_pause":      rc.play_pause,
            "stop":            rc.stop,
            "next":            rc.next,
            "previous":        rc.previous,
            "skip_forward":    rc.skip_forward,
            "skip_backward":   rc.skip_backward,
            # D-pad
            "up":              rc.up,
            "down":            rc.down,
            "left":            rc.left,
            "right":           rc.right,
            "select":          rc.select,
            # Navigation
            "menu":            rc.menu,
            "home":            rc.home,
            "home_hold":       rc.home_hold,
            "top_menu":        rc.top_menu,
            # Volume buttons (relative — distinct from absolute set_volume)
            "volume_up":       rc.volume_up,
            "volume_down":     rc.volume_down,
        }
        fn = actions.get(action)
        if not fn:
            raise ValueError(f"unknown action {action!r}")
        await fn()
    finally:
        atv.close()


async def keyboard_text(host: str, text: str, clear: bool = False) -> None:
    """Type text into the Apple TV's currently-focused text field. Useful when
    a search bar / sign-in field is on screen and typing on the Siri Remote
    is painful."""
    atv = await _connect(host)
    try:
        if clear:
            await atv.keyboard.text_clear()
        if text:
            await atv.keyboard.text_set(text)
    finally:
        atv.close()


async def now_playing(host: str) -> dict:
    atv = await _connect(host)
    try:
        np = await atv.metadata.playing()
        out = {
            "title":      getattr(np, "title", None) or "",
            "artist":     getattr(np, "artist", None) or "",
            "album":      getattr(np, "album", None) or "",
            "app":        getattr(np, "app", None) or "",
            "device_state": str(getattr(np, "device_state", "")),
            "position":   getattr(np, "position", None),
            "total_time": getattr(np, "total_time", None),
        }
        try:
            out["volume"] = await atv.audio.volume
        except Exception:
            out["volume"] = None
        return out
    finally:
        atv.close()
