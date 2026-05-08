"""Philips Hue v1 API client + scene engine.

Pairing model:
  1. POST {bridge}/api  with body {"devicetype": "avcast#mac"}
  2. Bridge responds with `{"error":{"description":"link button not pressed"}}`
     until user presses the physical button on the bridge.
  3. Once pressed, bridge responds with `{"success":{"username":"<token>"}}` —
     we cache that token in hue_credentials.json forever.
"""
from __future__ import annotations

import json
import random
import threading
import time
from pathlib import Path
from typing import Any

import requests


CRED_FILE = Path(__file__).parent / "hue_credentials.json"


# ---------- Credential persistence ----------

def load_credentials() -> dict[str, str]:
    if CRED_FILE.exists():
        try: return json.loads(CRED_FILE.read_text())
        except Exception: return {}
    return {}


def save_credentials(creds: dict[str, str]) -> None:
    CRED_FILE.write_text(json.dumps(creds, indent=2))


def credentials_for(bridge_ip: str) -> str | None:
    return load_credentials().get(bridge_ip)


# ---------- API client ----------

class HueBridge:
    def __init__(self, ip: str, username: str | None = None):
        self.ip = ip
        self.username = username or credentials_for(ip)

    @property
    def base(self) -> str:
        return f"http://{self.ip}/api"

    def _user_url(self, suffix: str = "") -> str:
        if not self.username:
            raise RuntimeError("Bridge not paired — call pair() first")
        return f"{self.base}/{self.username}{suffix}"

    # ----- Pairing -----

    def pair(self, app_name: str = "avcast", instance_name: str = "mac") -> dict:
        """Try to obtain a username. Returns {ok, username|error}."""
        body = {"devicetype": f"{app_name}#{instance_name}"}
        try:
            r = requests.post(self.base, json=body, timeout=4)
            data = r.json()
        except Exception as e:
            return {"ok": False, "error": str(e)}
        if isinstance(data, list) and data:
            entry = data[0]
            if "success" in entry and "username" in entry["success"]:
                self.username = entry["success"]["username"]
                creds = load_credentials()
                creds[self.ip] = self.username
                save_credentials(creds)
                return {"ok": True, "username": self.username}
            if "error" in entry:
                return {"ok": False, "error": entry["error"].get("description", "unknown error"),
                        "code": entry["error"].get("type")}
        return {"ok": False, "error": "unexpected response", "raw": data}

    def is_paired(self) -> bool:
        if not self.username:
            return False
        try:
            r = requests.get(self._user_url("/lights"), timeout=3)
            data = r.json()
            return not (isinstance(data, list) and data and "error" in data[0])
        except Exception:
            return False

    # ----- Lights -----

    def list_lights(self) -> dict:
        r = requests.get(self._user_url("/lights"), timeout=3)
        return r.json()

    def list_groups(self) -> dict:
        r = requests.get(self._user_url("/groups"), timeout=3)
        return r.json()

    def set_light_state(self, light_id: str | int, **state) -> dict:
        r = requests.put(self._user_url(f"/lights/{light_id}/state"), json=state, timeout=3)
        return r.json()

    def set_group_action(self, group_id: str | int, **state) -> dict:
        r = requests.put(self._user_url(f"/groups/{group_id}/action"), json=state, timeout=3)
        return r.json()

    def all_lights(self, **state) -> dict:
        # group 0 = all lights
        return self.set_group_action(0, **state)


# ---------- Scene engine ----------

class SceneRunner:
    """Runs one named scene at a time on a background thread.
    Scenes are functions that take (bridge, light_ids, stop_event) and loop
    until stop_event is set, sending light updates as they go."""

    def __init__(self):
        self._thread: threading.Thread | None = None
        self._stop = threading.Event()
        self._current: str | None = None
        self._lights: list[str] = []

    @property
    def status(self) -> dict:
        return {
            "running": bool(self._thread and self._thread.is_alive()),
            "scene": self._current,
            "lights": self._lights,
        }

    def stop(self) -> None:
        self._stop.set()
        if self._thread:
            self._thread.join(timeout=2)
        self._thread = None
        self._current = None
        self._lights = []

    def start(self, scene_name: str, bridge: HueBridge, light_ids: list[str]) -> dict:
        if scene_name not in SCENES:
            return {"ok": False, "error": f"unknown scene {scene_name}"}
        # stop any current
        self.stop()
        self._stop = threading.Event()
        self._current = scene_name
        self._lights = light_ids
        scene_fn = SCENES[scene_name]
        self._thread = threading.Thread(
            target=scene_fn, args=(bridge, light_ids, self._stop),
            daemon=True, name=f"hue-scene-{scene_name}",
        )
        self._thread.start()
        return {"ok": True, "started": scene_name, "lights": light_ids}


# Global scene runner — only one scene at a time per server.
runner = SceneRunner()


# ---------- Helper: send to many lights gracefully ----------

def _set_many(bridge: HueBridge, light_ids: list[str], state: dict) -> None:
    for lid in light_ids:
        try:
            bridge.set_light_state(lid, **state)
        except Exception:
            pass


# ---------- Scene implementations ----------

def scene_rainbow(bridge: HueBridge, light_ids: list[str], stop: threading.Event) -> None:
    """Slow hue rotation, all lights offset around the color wheel."""
    step = 0
    n = max(1, len(light_ids))
    spread = 65535 // n if n > 1 else 0
    while not stop.is_set():
        for i, lid in enumerate(light_ids):
            hue_val = (step + i * spread) % 65536
            try:
                bridge.set_light_state(
                    lid, on=True, hue=hue_val, sat=254, bri=200, transitiontime=8,
                )
            except Exception: pass
        step = (step + 2000) % 65536
        stop.wait(0.9)


def scene_fire(bridge: HueBridge, light_ids: list[str], stop: threading.Event) -> None:
    """Flicker oranges/reds — like firelight."""
    while not stop.is_set():
        for lid in light_ids:
            try:
                bridge.set_light_state(
                    lid, on=True,
                    hue=random.randint(0, 6500),  # 0=red, 6500=orange
                    sat=254,
                    bri=random.randint(80, 220),
                    transitiontime=2,  # 200ms — quick flicker
                )
            except Exception: pass
        stop.wait(random.uniform(0.18, 0.45))


def scene_sunrise(bridge: HueBridge, light_ids: list[str], stop: threading.Event) -> None:
    """Slow warm gradient up over ~3 minutes, then warm white."""
    steps = 60
    for i in range(steps + 1):
        if stop.is_set(): return
        bri = int(20 + (234 / steps) * i)
        # hue: 0 (red) -> 8500 (yellow-amber) -> 0 (warm white)
        hue_val = max(0, 8500 - int(8500 * i / steps))
        sat = max(120, 254 - int(134 * i / steps))
        _set_many(bridge, light_ids, {
            "on": True, "hue": hue_val, "sat": sat, "bri": bri, "transitiontime": 30,
        })
        stop.wait(3.0)
    # hold warm white
    while not stop.is_set():
        _set_many(bridge, light_ids, {"on": True, "ct": 366, "bri": 254, "transitiontime": 4})
        stop.wait(60)


def scene_ocean(bridge: HueBridge, light_ids: list[str], stop: threading.Event) -> None:
    """Drift between deep blue and teal."""
    direction = 1
    val = 0.0
    while not stop.is_set():
        val += 0.05 * direction
        if val >= 1.0 or val <= 0.0:
            direction *= -1
            val = max(0.0, min(1.0, val))
        # hue: 41000 (deep blue) <-> 31000 (teal)
        hue_val = int(31000 + (41000 - 31000) * val)
        bri = int(140 + 80 * val)
        _set_many(bridge, light_ids, {
            "on": True, "hue": hue_val, "sat": 254, "bri": bri, "transitiontime": 12,
        })
        stop.wait(1.2)


def scene_alert(bridge: HueBridge, light_ids: list[str], stop: threading.Event) -> None:
    """Red/blue alternating — incident mode."""
    flip = False
    while not stop.is_set():
        for i, lid in enumerate(light_ids):
            on_red = (i % 2 == 0) ^ flip
            try:
                bridge.set_light_state(
                    lid, on=True,
                    hue=0 if on_red else 46920,  # red / blue
                    sat=254, bri=254, transitiontime=0,
                )
            except Exception: pass
        flip = not flip
        stop.wait(0.45)


def scene_party(bridge: HueBridge, light_ids: list[str], stop: threading.Event) -> None:
    """Fast random colors per light."""
    while not stop.is_set():
        for lid in light_ids:
            try:
                bridge.set_light_state(
                    lid, on=True,
                    hue=random.randint(0, 65535),
                    sat=254,
                    bri=random.randint(180, 254),
                    transitiontime=2,
                )
            except Exception: pass
        stop.wait(0.4)


def scene_twinkle(bridge: HueBridge, light_ids: list[str], stop: threading.Event) -> None:
    """Cool-blue base with random brief white flashes."""
    # set base
    _set_many(bridge, light_ids, {"on": True, "hue": 47000, "sat": 254, "bri": 60, "transitiontime": 8})
    while not stop.is_set():
        if light_ids:
            target = random.choice(light_ids)
            try:
                bridge.set_light_state(target, on=True, ct=153, sat=0, bri=254, transitiontime=0)
            except Exception: pass
            stop.wait(0.18)
            try:
                bridge.set_light_state(target, on=True, hue=47000, sat=254, bri=60, transitiontime=4)
            except Exception: pass
        stop.wait(random.uniform(0.4, 1.4))


def scene_strobe(bridge: HueBridge, light_ids: list[str], stop: threading.Event) -> None:
    """Hard on/off strobe — caller should warn user about photosensitive epilepsy first."""
    on = True
    while not stop.is_set():
        _set_many(bridge, light_ids, {
            "on": True, "ct": 153, "sat": 0,
            "bri": 254 if on else 1, "transitiontime": 0,
        })
        on = not on
        stop.wait(0.10)


SCENES = {
    "rainbow":  scene_rainbow,
    "fire":     scene_fire,
    "sunrise":  scene_sunrise,
    "ocean":    scene_ocean,
    "alert":    scene_alert,
    "party":    scene_party,
    "twinkle":  scene_twinkle,
    "strobe":   scene_strobe,
}

SCENE_META = {
    "rainbow":  {"label": "Rainbow Cycle",   "icon": "🌈", "warning": None},
    "fire":     {"label": "Fire",            "icon": "🔥", "warning": None},
    "sunrise":  {"label": "Sunrise",         "icon": "🌅", "warning": None},
    "ocean":    {"label": "Ocean",           "icon": "💧", "warning": None},
    "alert":    {"label": "Alert / Incident","icon": "🚨", "warning": None},
    "party":    {"label": "Party",           "icon": "🎉", "warning": "Fast color changes"},
    "twinkle":  {"label": "Twinkle",         "icon": "❄️", "warning": None},
    "strobe":   {"label": "Strobe",          "icon": "⚡", "warning": "PHOTOSENSITIVE EPILEPSY WARNING — rapid flashing"},
}
