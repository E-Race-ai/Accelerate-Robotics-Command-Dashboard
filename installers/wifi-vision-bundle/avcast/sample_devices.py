"""Sample A/V Cast devices for demo / "show sample" mode.

These are fully SYNTHETIC — fake IPs (10.99.x range so they don't collide
with anyone's real network), generic device names prefixed with "Demo:".
Loaded into the in-memory device registry by POST /api/devices/sample so
operators can demo the dashboard without running a real scan.

Each device is tagged with "is_sample": True so the frontend can detect
demo mode and show a banner.

Capabilities use the granular per-action names ("play", "pause", "stop",
"next", "previous", "mute") that match the per-button checks in renderCard.
The older "playback" alias never rendered transport buttons.
"""
from __future__ import annotations
import time

# Standard granular caps for full-control sample devices. Matches what the
# frontend renderCard checks for and what the backend overrides paired Apple
# devices to.
_FULL_CAPS = ["volume", "mute", "play", "pause", "stop", "next", "previous"]

SAMPLE_DEVICES = [
    {
        "id": "sample-sonos-1", "type": "sonos",
        "name": "Demo: Living Room Speaker", "host": "10.99.10.10",
        "manufacturer": "Sonos", "model": "Sonos One (sample)",
        "capabilities": _FULL_CAPS + ["group"],
        "state": {
            "online": True, "playing": True,
            "volume": 28, "muted": False,
            "track": {
                "title": "Sample Track One", "artist": "Demo Artist",
                "album": "Example Album", "duration": 192, "position": 87, "art": "",
            },
            "now_playing": "Demo Artist — Sample Track One",
            "queue_next": [
                {"title": "Sample Track Two", "artist": "Demo Artist"},
                {"title": "Sample Track Three", "artist": "Demo Artist"},
            ],
            "group": "Demo Group A",
        },
        "raw": {"discovered_via": "sample-data"},
        "is_sample": True,
    },
    {
        "id": "sample-sonos-2", "type": "sonos",
        "name": "Demo: Kitchen Speaker", "host": "10.99.10.11",
        "manufacturer": "Sonos", "model": "Sonos Move (sample)",
        "capabilities": _FULL_CAPS + ["group"],
        "state": {
            "online": True, "playing": False,
            "volume": 14, "muted": False, "track": {},
            "group": "Demo Group B",
        },
        "raw": {"discovered_via": "sample-data"},
        "is_sample": True,
    },
    {
        "id": "sample-appletv-1", "type": "appletv",
        "name": "Demo: Conference Room TV", "host": "10.99.10.20",
        "manufacturer": "Apple", "model": "AppleTV4K (sample)",
        "capabilities": _FULL_CAPS,
        "paired": True,  # so the remote panel renders for the demo
        "state": {"online": True, "playing": False, "volume": 35, "muted": False},
        "raw": {"discovered_via": "sample-data"},
        "is_sample": True,
    },
    {
        "id": "sample-appletv-2", "type": "appletv",
        "name": "Demo: Lobby TV", "host": "10.99.10.21",
        "manufacturer": "Apple", "model": "AppleTV4K (sample)",
        "capabilities": _FULL_CAPS,
        "paired": True,
        "state": {
            "online": True, "playing": True, "volume": 60, "muted": False,
            "now_playing": "Severance · S2 E5 — Apple TV+ (sample)",
            "track": {"title": "Severance · S2 E5", "artist": "Apple TV+ (sample)",
                      "duration": 3300, "position": 1842, "art": ""},
        },
        "raw": {"discovered_via": "sample-data"},
        "is_sample": True,
    },
    {
        "id": "sample-appletv-3", "type": "appletv",
        "name": "Demo: Office TV", "host": "10.99.10.22",
        "manufacturer": "Apple", "model": "AppleTV (sample)",
        "capabilities": _FULL_CAPS,
        "paired": True,
        "state": {"online": True, "playing": False, "volume": 22, "muted": False},
        "raw": {"discovered_via": "sample-data"},
        "is_sample": True,
    },
    {
        "id": "sample-homepod-1", "type": "appletv",
        "name": "Demo: HomePod (Kitchen)", "host": "10.99.10.23",
        "manufacturer": "Apple", "model": "HomePod (sample)",
        "capabilities": _FULL_CAPS,
        "is_homepod": True, "paired": True,
        "state": {
            "online": True, "playing": True, "volume": 42, "muted": False,
            "now_playing": "Sample HomePod track",
            "track": {"title": "Solar Power", "artist": "Sample Demo Artist",
                      "album": "Sample Album", "duration": 192, "position": 87, "art": ""},
        },
        "raw": {"discovered_via": "sample-data"},
        "is_sample": True,
    },
    {
        "id": "sample-homepod-2", "type": "appletv",
        "name": "Demo: HomePod mini (Office)", "host": "10.99.10.24",
        "manufacturer": "Apple", "model": "HomePod mini (sample)",
        "capabilities": _FULL_CAPS,
        "is_homepod": True, "paired": True,
        "state": {"online": True, "playing": False, "volume": 18, "muted": False},
        "raw": {"discovered_via": "sample-data"},
        "is_sample": True,
    },
    {
        "id": "sample-homepod-3", "type": "appletv",
        "name": "Demo: HomePod stereo pair (Boardroom L+R)", "host": "10.99.10.25",
        "manufacturer": "Apple", "model": "HomePod stereo (sample)",
        "capabilities": _FULL_CAPS,
        "is_homepod": True, "paired": True,
        "state": {
            "online": True, "playing": True, "volume": 55, "muted": False,
            "now_playing": "Sample lo-fi background",
            "track": {"title": "Sample Focus Mix", "artist": "Sample Artist",
                      "duration": 7200, "position": 2400, "art": ""},
        },
        "raw": {"discovered_via": "sample-data"},
        "is_sample": True,
    },
    {
        "id": "sample-roku-1", "type": "roku",
        "name": "Demo: Training Room Display", "host": "10.99.10.30",
        "manufacturer": "Roku / TCL", "model": "55S455 (sample)",
        "capabilities": ["volume", "mute", "play", "pause", "next", "previous", "status"],
        "state": {"online": True, "playing": False, "volume": 40, "muted": False, "powered": True},
        "raw": {"discovered_via": "sample-data"},
        "is_sample": True,
    },
    {
        "id": "sample-chromecast-1", "type": "chromecast",
        "name": "Demo: Reception Display", "host": "10.99.10.40",
        "manufacturer": "Google", "model": "Chromecast (sample)",
        "capabilities": _FULL_CAPS,
        "state": {
            "online": True, "playing": True, "volume": 50, "muted": False,
            "now_playing": "Sample lobby ambience",
        },
        "raw": {"discovered_via": "sample-data"},
        "is_sample": True,
    },
    {
        "id": "sample-upnp-1", "type": "upnp-renderer",
        "name": "Demo: Conference Room Soundbar", "host": "10.99.10.45",
        "manufacturer": "Generic UPnP", "model": "MediaRenderer 1.0 (sample)",
        "capabilities": ["volume", "mute", "play", "pause", "stop", "status"],
        "state": {
            "online": True, "playing": False, "volume": 38, "muted": False,
        },
        "raw": {
            "discovered_via": "sample-data",
            "upnp": {
                "name": "Demo Soundbar",
                "model": "MediaRenderer 1.0",
                "manufacturer": "Generic UPnP",
                "av_url": "http://10.99.10.45/upnp/control/AVTransport1",
                "rc_url": "http://10.99.10.45/upnp/control/RenderingControl1",
                "device_desc_url": "http://10.99.10.45/description.xml",
            },
        },
        "is_sample": True,
    },
    {
        "id": "sample-hue-1", "type": "hue",
        "name": "Demo: Smart Lighting Bridge", "host": "10.99.10.50",
        "manufacturer": "Philips", "model": "Hue Bridge (sample)",
        "capabilities": [],
        "state": {"online": True},
        "raw": {"discovered_via": "sample-data"},
        "is_sample": True,
    },
    {
        "id": "sample-airplay-1", "type": "airplay",
        "name": "Demo: AirPlay Receiver A", "host": "10.99.11.10",
        "manufacturer": "Generic Vendor", "model": "AirPlay Receiver (sample)",
        "capabilities": _FULL_CAPS,
        "paired": True,
        "state": {"online": True, "playing": False, "volume": 30, "muted": False},
        "raw": {"discovered_via": "sample-data"},
        "is_sample": True,
    },
    {
        "id": "sample-airplay-2", "type": "airplay",
        "name": "Demo: AirPlay Receiver B", "host": "10.99.11.11",
        "manufacturer": "Generic Vendor", "model": "AirPlay Speaker (sample)",
        "capabilities": _FULL_CAPS,
        "paired": True,
        "state": {
            "online": True, "playing": True, "volume": 45, "muted": False,
            "now_playing": "Sample podcast episode",
        },
        "raw": {"discovered_via": "sample-data"},
        "is_sample": True,
    },
    {
        "id": "sample-spotify-1", "type": "spotify-connect",
        "name": "Demo: Boardroom Speaker", "host": "10.99.10.60",
        "manufacturer": "Generic Vendor", "model": "Smart Speaker (sample)",
        "capabilities": [],
        "state": {"online": True},
        "raw": {"discovered_via": "sample-data"},
        "is_sample": True,
    },
    {
        "id": "sample-printer-1", "type": "printer",
        "name": "Demo: Office Printer", "host": "10.99.10.70",
        "manufacturer": "Generic Vendor", "model": "Multi-function Printer (sample)",
        "capabilities": [],
        "state": {"online": True},
        "raw": {"discovered_via": "sample-data"},
        "is_sample": True,
    },
    {
        "id": "sample-smarttv-1", "type": "smarttv",
        "name": "Demo: Cafe Display", "host": "10.99.11.30",
        "manufacturer": "Generic Vendor", "model": "Smart TV (sample)",
        "capabilities": [],
        "state": {"online": True},
        "raw": {"discovered_via": "sample-data"},
        "is_sample": True,
    },
    {
        "id": "sample-personal-1", "type": "personal-airplay",
        "name": "Demo: Visitor Phone", "host": "10.99.11.50",
        "manufacturer": "Apple", "model": "Smartphone (sample)",
        "capabilities": [],
        "state": {"online": True},
        "raw": {"discovered_via": "sample-data"},
        "is_sample": True,
    },
    {
        "id": "sample-personal-2", "type": "personal-airplay",
        "name": "Demo: Visitor Laptop", "host": "10.99.11.51",
        "manufacturer": "Apple", "model": "Laptop (sample)",
        "capabilities": [],
        "state": {"online": True},
        "raw": {"discovered_via": "sample-data"},
        "is_sample": True,
    },
]


def as_registry() -> dict:
    """Return the sample devices keyed by id (matching `_state['devices']` shape)."""
    return {d["id"]: d for d in SAMPLE_DEVICES}


def last_scan_timestamp() -> int:
    return int(time.time())
