"""AVCast — multi-protocol AV device discovery."""
from __future__ import annotations

import asyncio
import json
import socket
import subprocess
import time
from dataclasses import dataclass, field, asdict
from typing import Any

from zeroconf import ServiceBrowser, ServiceListener, Zeroconf, ServiceStateChange


MDNS_TYPES = {
    "_airplay._tcp.local.": "airplay",
    "_raop._tcp.local.": "airplay-audio",
    "_googlecast._tcp.local.": "chromecast",
    "_spotify-connect._tcp.local.": "spotify-connect",
    "_sonos._tcp.local.": "sonos",
    "_mediaremotetv._tcp.local.": "appletv",
    "_homekit._tcp.local.": "homekit",
    "_hap._tcp.local.": "homekit",
    "_hue._tcp.local.": "hue",
    "_roku-rcp._tcp.local.": "roku",
    "_printer._tcp.local.": "printer",
}


@dataclass
class Device:
    id: str
    name: str
    type: str
    host: str | None = None
    port: int | None = None
    model: str | None = None
    manufacturer: str | None = None
    capabilities: list[str] = field(default_factory=list)
    state: dict = field(default_factory=dict)
    raw: dict = field(default_factory=dict)
    last_seen: float = field(default_factory=time.time)

    def to_dict(self) -> dict:
        return asdict(self)


# ---------- mDNS ----------

class _MDNSCollector(ServiceListener):
    def __init__(self):
        self.devices: dict[str, Device] = {}

    def _emit(self, zc: Zeroconf, type_: str, name: str):
        info = zc.get_service_info(type_, name, timeout=2000)
        if not info:
            return
        kind = MDNS_TYPES.get(type_, "mdns")
        host = None
        for addr in info.parsed_addresses():
            if ":" not in addr and not addr.startswith("169."):
                host = addr
                break
        if not host and info.parsed_addresses():
            host = info.parsed_addresses()[0]

        props = {
            (k.decode("utf-8", "ignore") if isinstance(k, bytes) else str(k)):
            (v.decode("utf-8", "ignore") if isinstance(v, bytes) else (v if v is not None else ""))
            for k, v in (info.properties or {}).items()
        }

        # Default friendly name = mDNS instance name (the part before the service type).
        # This is the canonical "friendly name" for AirPlay/Sonos/AppleTV/HomeKit/RAOP.
        raw_instance = name.split(f".{type_}", 1)[0]
        friendly = raw_instance

        # RAOP audio instances are "<MACWITHOUTCOLONS>@<FriendlyName>"
        # Sonos instances are "<UID>@<RoomName>"
        # Strip the prefix if there's a clear MAC/UID before the @.
        if "@" in friendly:
            head, tail = friendly.split("@", 1)
            if (len(head) == 12 and all(c in "0123456789abcdefABCDEF" for c in head)) \
               or head.startswith("RINCON_") or head.startswith("Sonos-"):
                friendly = tail

        # Chromecast genuinely uses TXT key `fn` for friendly name.
        # NEVER use `fn` for AirPlay — it's feature-flags there.
        if kind == "chromecast":
            if props.get("fn"): friendly = props["fn"]
            elif props.get("n"): friendly = props["n"]
        elif kind == "spotify-connect":
            if props.get("CPath"): pass  # no friendly key, instance name is fine
        elif kind == "homekit":
            # HomeKit `md` is model; instance name is the user-friendly name.
            pass

        # Reject garbage friendly names that are just numbers/commas/dots
        import re as _re
        if _re.fullmatch(r"[\d,.\s\-_]+", friendly or ""):
            friendly = raw_instance  # fall back to instance name

        # Build a stable ID — prefer protocol-native unique IDs so we can merge
        # with enrichment from soco / pychromecast / etc.
        canonical_kind = "airplay" if kind == "airplay-audio" else kind
        unique = None
        if canonical_kind == "sonos":
            import re
            m = re.search(r"RINCON_[A-F0-9]+", name, re.IGNORECASE)
            if m: unique = m.group(0).lower()
        elif canonical_kind == "chromecast":
            unique = (props.get("id") or "").lower() or None
        elif canonical_kind == "airplay":
            # deviceid is the MAC of the AirPlay receiver; use as canonical
            unique = (props.get("deviceid") or "").lower().replace(":", "") or None
        elif canonical_kind == "appletv":
            unique = (props.get("UniqueIdentifier") or props.get("uniqueidentifier") or "").lower() or None

        if not unique:
            unique = info.server.rstrip(".").lower()

        dev_id = f"{canonical_kind}:{unique}"
        if dev_id in self.devices:
            # already have this device — possibly merge in this service's friendly name
            existing = self.devices[dev_id]
            if friendly and len(friendly) > len(existing.name) and "@" not in friendly:
                existing.name = friendly
            existing.raw.setdefault("services", []).append(type_)
            return

        caps = []
        if kind in ("sonos", "chromecast", "roku", "appletv", "airplay"):
            caps.append("status")
        if kind in ("sonos", "chromecast", "roku"):
            caps += ["volume", "mute", "play", "pause"]
        if kind == "appletv":
            caps += ["volume", "play", "pause"]

        # Model — try kind-appropriate keys. For AirPlay, `am` is the canonical model.
        if kind in ("airplay", "airplay-audio", "appletv"):
            model = props.get("am") or props.get("model") or props.get("md") or None
        else:
            model = props.get("model") or props.get("md") or props.get("am") or None
        # Reject garbage model values that look like flag lists, not model strings.
        if model and _re.fullmatch(r"[\d,.\s\-_]+", model):
            model = None

        manuf = None
        if kind == "sonos": manuf = "Sonos"
        elif kind == "chromecast": manuf = "Google"
        elif kind == "roku": manuf = "Roku"
        elif kind in ("airplay", "airplay-audio", "appletv"): manuf = "Apple/AirPlay"

        self.devices[dev_id] = Device(
            id=dev_id,
            name=friendly,
            type=canonical_kind,
            host=host,
            port=info.port,
            model=model,
            manufacturer=manuf,
            capabilities=caps,
            state={"online": True},
            raw={"server": info.server, "props": props, "service_type": type_},
        )

    def add_service(self, zc, type_, name): self._emit(zc, type_, name)
    def update_service(self, zc, type_, name): self._emit(zc, type_, name)
    def remove_service(self, zc, type_, name): pass


def discover_mdns(timeout: float = 4.0) -> list[Device]:
    zc = Zeroconf()
    coll = _MDNSCollector()
    browsers = [ServiceBrowser(zc, t, coll) for t in MDNS_TYPES]
    try:
        time.sleep(timeout)
    finally:
        for b in browsers:
            try: b.cancel()
            except Exception: pass
        zc.close()
    return list(coll.devices.values())


# ---------- SSDP (UPnP / Roku / SmartTV) ----------

SSDP_TARGETS = [
    "urn:schemas-upnp-org:device:MediaRenderer:1",
    "urn:schemas-upnp-org:device:ZonePlayer:1",
    "roku:ecp",
    "urn:dial-multiscreen-org:service:dial:1",
    "urn:samsung.com:device:RemoteControlReceiver:1",
    "ssdp:all",
]


def _ssdp_search(st: str, timeout: float = 2.5) -> list[dict]:
    msg = (
        "M-SEARCH * HTTP/1.1\r\n"
        "HOST: 239.255.255.250:1900\r\n"
        'MAN: "ssdp:discover"\r\n'
        "MX: 2\r\n"
        f"ST: {st}\r\n\r\n"
    ).encode()
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 2)
    s.settimeout(timeout)
    try:
        s.sendto(msg, ("239.255.255.250", 1900))
        responses = []
        end = time.time() + timeout
        while time.time() < end:
            try:
                data, addr = s.recvfrom(2048)
            except socket.timeout:
                break
            text = data.decode("utf-8", "ignore")
            headers = {}
            for line in text.split("\r\n")[1:]:
                if ":" in line:
                    k, v = line.split(":", 1)
                    headers[k.strip().upper()] = v.strip()
            headers["_PEER"] = addr[0]
            responses.append(headers)
        return responses
    finally:
        s.close()


def discover_ssdp(timeout: float = 2.5) -> list[Device]:
    seen: dict[str, Device] = {}
    for st in SSDP_TARGETS:
        try:
            responses = _ssdp_search(st, timeout=timeout)
        except Exception:
            continue
        for r in responses:
            usn = r.get("USN") or r.get("LOCATION") or f"{r['_PEER']}:{r.get('ST','')}"
            host = r["_PEER"]
            srv = (r.get("SERVER") or "").lower()
            target = (r.get("ST") or "").lower()

            kind = "upnp"
            manuf = None
            if "roku" in target or "roku" in srv:
                kind, manuf = "roku", "Roku"
            elif "samsung" in target or "samsung" in srv:
                kind, manuf = "smarttv", "Samsung"
            elif "sonos" in srv or "zoneplayer" in target:
                kind, manuf = "sonos", "Sonos"
            elif "lg" in srv:
                kind, manuf = "smarttv", "LG"
            elif "dial" in target:
                kind, manuf = "smarttv", None
            elif "mediarenderer" in target:
                kind, manuf = "upnp-renderer", None

            dev_id = f"{kind}:{host}".lower()
            if dev_id in seen:
                continue

            caps = ["status"]
            if kind == "roku":
                caps += ["volume", "mute", "play", "pause"]

            seen[dev_id] = Device(
                id=dev_id,
                name=r.get("FRIENDLYNAME") or f"{kind} @ {host}",
                type=kind,
                host=host,
                manufacturer=manuf,
                capabilities=caps,
                state={"online": True},
                raw={"ssdp": r},
            )
    return list(seen.values())


# ---------- Sonos enrichment via SoCo ----------

def enrich_sonos() -> list[Device]:
    try:
        import soco
        from soco import discover as sonos_discover
    except Exception:
        return []
    found = sonos_discover(timeout=3) or set()
    devs: list[Device] = []
    for sp in found:
        try:
            info = sp.get_speaker_info(refresh=True)
        except Exception:
            info = {}
        try:
            volume = sp.volume
        except Exception:
            volume = None
        try:
            muted = sp.mute
        except Exception:
            muted = None
        try:
            transport = sp.get_current_transport_info()
            playing = transport.get("current_transport_state") == "PLAYING"
        except Exception:
            playing = None
        track = {}
        try:
            track = sp.get_current_track_info() or {}
        except Exception:
            pass
        artist = (track.get("artist") or "").strip()
        title = (track.get("title") or "").strip()
        album = (track.get("album") or "").strip()
        now_playing = f"{artist} — {title}".strip(" —") if (artist or title) else None
        position = track.get("position") or None  # "0:01:23"
        duration = track.get("duration") or None  # "0:03:45"
        album_art = track.get("album_art") or None

        try:
            group_name = sp.group.label if sp.group else None
        except Exception:
            group_name = None

        # Pull next few tracks from the queue (best-effort, can be slow on big queues)
        queue_next = []
        try:
            queue = sp.get_queue(start=0, max_items=8) or []
            current_index = None
            try:
                current_index = int(track.get("playlist_position") or 0) - 1
            except Exception:
                current_index = 0
            if current_index is None or current_index < 0:
                current_index = 0
            for q in queue[current_index + 1: current_index + 6]:
                qa = (getattr(q, "creator", None) or "").strip()
                qt = (getattr(q, "title", None) or "").strip()
                queue_next.append(f"{qa} — {qt}".strip(" —") if (qa or qt) else qt)
        except Exception:
            pass

        devs.append(Device(
            id=f"sonos:{sp.uid}".lower(),
            name=sp.player_name,
            type="sonos",
            host=sp.ip_address,
            model=info.get("model_name"),
            manufacturer="Sonos",
            capabilities=["volume", "mute", "play", "pause", "stop", "next", "previous", "group", "status"],
            state={
                "online": True,
                "volume": volume,
                "muted": muted,
                "playing": playing,
                "now_playing": now_playing,
                "track": {
                    "artist": artist or None,
                    "title": title or None,
                    "album": album or None,
                    "position": position,
                    "duration": duration,
                    "album_art": album_art,
                },
                "queue_next": queue_next,
                "group": group_name,
            },
            raw={"uid": sp.uid, "info": info},
        ))
    return devs


# ---------- Chromecast enrichment ----------

def enrich_chromecast(timeout: float = 4.0) -> list[Device]:
    try:
        import pychromecast
    except Exception:
        return []
    try:
        chromecasts, browser = pychromecast.get_chromecasts(timeout=timeout)
    except Exception:
        return []
    devs: list[Device] = []
    for cc in chromecasts:
        try:
            cc.wait(timeout=3)
            status = cc.status
            mc = cc.media_controller.status
            volume = round((status.volume_level or 0) * 100)
            artist = title = album = album_art = None
            duration = current_time = None
            content_type = None
            if mc:
                title = mc.title
                artist = mc.artist
                album = mc.album_name
                duration = mc.duration
                current_time = mc.current_time
                content_type = mc.content_type
                if mc.images:
                    try: album_art = mc.images[0].url
                    except Exception: pass
            now_playing = " — ".join([s for s in [artist, title] if s]) or None

            devs.append(Device(
                id=f"chromecast:{str(cc.uuid).lower()}",
                name=cc.cast_info.friendly_name,
                type="chromecast",
                host=cc.cast_info.host,
                port=cc.cast_info.port,
                model=cc.cast_info.model_name,
                manufacturer=cc.cast_info.manufacturer or "Google",
                capabilities=["volume", "mute", "play", "pause", "stop", "next", "previous", "status"],
                state={
                    "online": True,
                    "volume": volume,
                    "muted": status.volume_muted,
                    "playing": (mc.player_state == "PLAYING") if mc else None,
                    "now_playing": now_playing,
                    "track": {
                        "artist": artist,
                        "title": title,
                        "album": album,
                        "duration": duration,
                        "position_sec": current_time,
                        "content_type": content_type,
                        "album_art": album_art,
                    },
                    "app": status.display_name,
                },
                raw={"uuid": str(cc.uuid)},
            ))
        except Exception:
            pass
        finally:
            try: cc.disconnect()
            except Exception: pass
    try: browser.stop_discovery()
    except Exception: pass
    return devs


# ---------- UPnP MediaRenderer enrichment ----------

def enrich_upnp_renderer(d: Device) -> dict | None:
    """Fetch a UPnP device's description XML, parse out AVTransport +
    RenderingControl service URLs. Returns a dict with friendly_name, model,
    manufacturer, av_url, rc_url + device_desc_url. Returns None if the
    device isn't a media renderer (no AVTransport/RenderingControl services).
    The returned dict is stashed on the device's raw.upnp so the SOAP
    controllers can address the service URLs directly."""
    import requests
    import xml.etree.ElementTree as ET
    from urllib.parse import urljoin

    ssdp = (d.raw.get("ssdp") or {}) if isinstance(d.raw.get("ssdp"), dict) else {}
    loc = ssdp.get("LOCATION") or ssdp.get("Location") or ssdp.get("location")
    if not loc:
        return None

    try:
        r = requests.get(loc, timeout=3)
        if r.status_code != 200:
            return None
        xml_text = r.text
    except Exception:
        return None

    try:
        root = ET.fromstring(xml_text)
    except Exception:
        return None

    ns = "{urn:schemas-upnp-org:device-1-0}"
    device_elem = root.find(f"{ns}device")
    if device_elem is None:
        return None

    friendly = (device_elem.findtext(f"{ns}friendlyName") or "").strip() or None
    model    = (device_elem.findtext(f"{ns}modelName")    or "").strip() or None
    manuf    = (device_elem.findtext(f"{ns}manufacturer") or "").strip() or None

    # UPnP devices can embed sub-devices; walk recursively.
    def _walk(dev_elem, out):
        for svc in dev_elem.findall(f"{ns}serviceList/{ns}service"):
            stype = (svc.findtext(f"{ns}serviceType") or "").strip()
            curl  = (svc.findtext(f"{ns}controlURL")  or "").strip()
            if stype and curl:
                out.append((stype, curl))
        for sub in dev_elem.findall(f"{ns}deviceList/{ns}device"):
            _walk(sub, out)

    services: list[tuple[str, str]] = []
    _walk(device_elem, services)

    av_url = rc_url = None
    for stype, curl in services:
        if "AVTransport" in stype and not av_url:
            av_url = urljoin(loc, curl)
        elif "RenderingControl" in stype and not rc_url:
            rc_url = urljoin(loc, curl)

    if not (av_url or rc_url):
        return None  # not a media renderer

    return {
        "name": friendly,
        "model": model,
        "manufacturer": manuf,
        "av_url": av_url,
        "rc_url": rc_url,
        "device_desc_url": loc,
    }


# ---------- Roku enrichment ----------

def enrich_roku(host: str) -> dict | None:
    import requests
    try:
        r = requests.get(f"http://{host}:8060/query/device-info", timeout=2)
        if r.status_code != 200:
            return None
        text = r.text
        def grab(tag: str) -> str | None:
            import re
            m = re.search(fr"<{tag}>([^<]+)</{tag}>", text)
            return m.group(1) if m else None
        return {
            "name": grab("user-device-name") or grab("friendly-device-name") or grab("model-name"),
            "model": grab("model-name"),
            "serial": grab("serial-number"),
            "powered": grab("power-mode") == "PowerOn",
            "network": grab("network-name"),
        }
    except Exception:
        return None


# ---------- Local Bluetooth ----------

def discover_local_bluetooth() -> list[Device]:
    try:
        out = subprocess.run(
            ["system_profiler", "SPBluetoothDataType", "-json"],
            capture_output=True, text=True, timeout=10,
        )
        data = json.loads(out.stdout)
    except Exception:
        return []
    devs: list[Device] = []
    blocks = data.get("SPBluetoothDataType", [])
    for block in blocks:
        for section_key in ("device_connected", "device_not_connected", "device_paired"):
            for entry in block.get(section_key, []) or []:
                if not isinstance(entry, dict):
                    continue
                for name, meta in entry.items():
                    if not isinstance(meta, dict):
                        continue
                    minor = (meta.get("device_minorClassOfDevice_string") or "").lower()
                    major = (meta.get("device_majorClassOfDevice_string") or "").lower()
                    is_audio = any(t in (minor + " " + major) for t in
                                   ("headphones", "speaker", "audio", "headset", "carkit", "loudspeaker"))
                    if not is_audio:
                        continue
                    addr = meta.get("device_address") or name
                    connected = section_key == "device_connected"
                    devs.append(Device(
                        id=f"bluetooth:{addr}".lower(),
                        name=name,
                        type="bluetooth",
                        host=None,
                        manufacturer=meta.get("device_manufacturer"),
                        model=meta.get("device_productID"),
                        capabilities=["status"],
                        state={
                            "online": connected,
                            "paired_to": socket.gethostname(),
                            "rssi": meta.get("device_rssi"),
                            "battery": meta.get("device_batteryLevelMain"),
                        },
                        raw={"address": addr, "section": section_key, "meta": meta},
                    ))
    return devs


# ---------- Top-level orchestrator ----------

# ---------- Direct unicast probes (cross-subnet, no multicast needed) ----------

import re as _re_mod

# Catches both consumer Roku TV model numbers (55S423, 65S423) and the
# Roku-internal hardware codes that AirPlay advertises as `am=` (7105X, 7131X, 7133X, 5535X).
ROKU_MODEL_RE = _re_mod.compile(r"^[0-9]{2,5}[A-Z][A-Z0-9]*$")
APPLE_TV_RE = _re_mod.compile(r"^AppleTV", _re_mod.IGNORECASE)
APPLE_PERSONAL_RE = _re_mod.compile(r"^(iPhone|iPad|Mac|MacBook|iMac)", _re_mod.IGNORECASE)


def _reclassify_by_model(devs: list[Device]) -> None:
    """Move airplay-typed devices into more specific buckets based on advertised model."""
    for d in devs:
        if d.type != "airplay" or not d.model:
            continue
        m = d.model.strip()
        if APPLE_TV_RE.match(m):
            d.type = "appletv"
            d.manufacturer = "Apple"
            # Apple TV control requires pairing (pyatv), which we haven't built — be honest about it.
            d.capabilities = ["status"]
            d.state.setdefault("note", "Pairing required for control (pyatv)")
        elif ROKU_MODEL_RE.match(m):
            d.type = "roku"
            d.manufacturer = "Roku / TCL"
            d.capabilities = ["volume", "mute", "play", "pause", "next", "previous", "status"]
        elif APPLE_PERSONAL_RE.match(m):
            d.type = "personal-airplay"
            d.manufacturer = "Apple (personal device)"
            d.capabilities = ["status"]


def _reclassify_by_hostname(devs: list[Device]) -> None:
    """Catch devices that announce only via _raop._tcp (no `am=` model tag) by
    looking at their mDNS hostname. Sonos players announce as `Sonos-XXXXXX.local`,
    Rokus as `roku-XXXXXX.local`, etc. Without this, those devices stay
    type=airplay forever and end up duplicating the real Sonos/Roku entries."""
    for d in devs:
        if d.type != "airplay":
            continue
        server = (d.raw.get("server") or "").lower().rstrip(".")
        host_label = server.split(".", 1)[0]
        # Sonos
        if host_label.startswith("sonos-") or "rincon_" in d.id.lower() or "sonos" in d.name.lower():
            d.type = "sonos"
            d.manufacturer = "Sonos"
            # Caps are filled in properly by enrich_sonos when available; leave bare here
            # so the absorption pass can prefer the SoCo-enriched entry.
            d.capabilities = ["status"]
        # Roku (some Rokus broadcast on _airplay._tcp without a Roku model code)
        elif host_label.startswith("roku-") or host_label.startswith("rokutv-"):
            d.type = "roku"
            d.manufacturer = "Roku"
            d.capabilities = ["volume", "mute", "play", "pause", "next", "previous", "status"]


# Priority order used by _absorb_secondary_services(). LOWER index = higher
# priority. When several devices share an IP, the one with the smallest index
# wins; the rest get absorbed into its raw.absorbed_services list and dropped.
PRIMARY_PRIORITY = [
    "sonos", "chromecast", "roku", "appletv", "hue", "printer",
    "upnp-renderer", "airplay", "homekit", "spotify-connect",
    "upnp", "smarttv", "personal-airplay", "bluetooth",
]


def _absorb_secondary_services(devs: list[Device]) -> list[Device]:
    """Final dedup pass — collapse multiple device entries at the same IP into
    a single primary by type-priority. The classic case: a single Sonos
    announces on _sonos._tcp + _airplay._tcp + _spotify-connect._tcp, so we
    end up with three cards for one device. Same for Apple TVs that also
    advertise _homekit._tcp, Lenovo Smart Displays that also speak UPnP, etc.

    Also unconditionally drops `airplay-host:*` unicast-probe ghosts (the
    "AirPlay device @ 10.x.x.x" placeholders) when any other entry exists at
    the same IP — those are always duplicates of a richer entry."""
    from collections import defaultdict
    by_host: dict[str, list[Device]] = defaultdict(list)
    no_host: list[Device] = []
    for d in devs:
        (by_host[d.host] if d.host else no_host).append(d)

    keep_ids: set[int] = set()
    for d in no_host:
        keep_ids.add(id(d))

    for host, group in by_host.items():
        if len(group) == 1:
            keep_ids.add(id(group[0]))
            continue
        # Drop airplay-host:* probe ghosts when something better exists.
        non_ghosts = [d for d in group if not d.id.startswith("airplay-host:")]
        if non_ghosts and len(non_ghosts) < len(group):
            group = non_ghosts
        if len(group) == 1:
            keep_ids.add(id(group[0]))
            continue
        # Pick the highest-priority device as primary; absorb the rest.
        def _prio(d: Device) -> int:
            try:
                return PRIMARY_PRIORITY.index(d.type)
            except ValueError:
                return 999
        group.sort(key=_prio)
        primary = group[0]
        absorbed = group[1:]
        # Stash absorbed type names + services on the primary so the operator
        # can still see "this Sonos also speaks AirPlay 2 and Spotify Connect".
        primary.raw.setdefault("absorbed_services", [])
        for sec in absorbed:
            entry = {
                "type": sec.type,
                "name": sec.name,
                "service": (sec.raw.get("service_type") or sec.raw.get("server") or sec.id),
            }
            primary.raw["absorbed_services"].append(entry)
        keep_ids.add(id(primary))

    return [d for d in devs if id(d) in keep_ids]


def probe_subnets_for_roku(subnets: list[str], timeout: float = 1.0,
                            concurrency: int = 64) -> list[Device]:
    """Direct unicast probe of port 8060 across given /24 subnets — finds Rokus
    that mDNS/SSDP missed (e.g. across subnet boundaries with no multicast routing)."""
    import ipaddress
    from concurrent.futures import ThreadPoolExecutor

    hosts = []
    for sn in subnets:
        try:
            net = ipaddress.ip_network(sn, strict=False)
            for ip in net.hosts():
                hosts.append(str(ip))
        except Exception:
            continue

    def _probe(host: str):
        # Cheap TCP connect first to avoid the HTTP overhead on dead hosts.
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        try:
            s.connect((host, 8060))
            s.close()
        except Exception:
            return None
        info = enrich_roku(host)
        if not info:
            return None
        return Device(
            id=f"roku:{host}",
            name=info.get("name") or f"Roku @ {host}",
            type="roku",
            host=host,
            model=info.get("model"),
            manufacturer="Roku / TCL",
            capabilities=["volume", "mute", "play", "pause", "next", "previous", "status"],
            state={
                "online": True,
                "powered": info.get("powered"),
                "network": info.get("network"),
            },
            raw={"roku": info, "discovered_via": "unicast-probe"},
        )

    devs: list[Device] = []
    with ThreadPoolExecutor(max_workers=concurrency) as ex:
        for d in ex.map(_probe, hosts):
            if d is not None:
                devs.append(d)
    return devs


def probe_subnets_for_appletv(subnets: list[str], timeout: float = 1.0,
                                concurrency: int = 64) -> list[Device]:
    """Probe port 7000 (AirPlay HTTP). Used to flag Apple TVs across subnets;
    we can't actually control them yet (would need pyatv + pairing) but at least
    they show up with online status."""
    import ipaddress
    from concurrent.futures import ThreadPoolExecutor

    hosts = []
    for sn in subnets:
        try:
            for ip in ipaddress.ip_network(sn, strict=False).hosts():
                hosts.append(str(ip))
        except Exception:
            continue

    def _probe(host: str):
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(timeout)
        try:
            s.connect((host, 7000))
            s.close()
        except Exception:
            return None
        # Reverse-DNS to get a friendlier label than "AirPlay device @ 10.x.x.x".
        # The mDNS host part (e.g. "Lobby" from "Lobby.local") shows up here when
        # the device is sticky in the local resolver, even if mDNS browsing missed it.
        nice_name = None
        try:
            hostname = socket.gethostbyaddr(host)[0]
            label = hostname.split(".", 1)[0]
            # Reject IP-pattern fallbacks ("10-1-10-102" or just the IP)
            if label and not label.replace("-", ".").replace("_", ".").startswith(host[:5]):
                nice_name = label.replace("-", " ")
        except Exception:
            pass
        return Device(
            id=f"airplay-host:{host}",
            name=nice_name or f"AirPlay receiver @ {host}",
            type="airplay",
            host=host,
            port=7000,
            manufacturer="Apple/AirPlay",
            capabilities=["status"],
            state={"online": True, "note": "Discovered via direct port-7000 probe — limited metadata"},
            raw={"discovered_via": "unicast-probe-7000"},
        )

    devs: list[Device] = []
    with ThreadPoolExecutor(max_workers=concurrency) as ex:
        for d in ex.map(_probe, hosts):
            if d is not None:
                devs.append(d)
    return devs


# Subnets to sweep. Order of precedence:
#   1. Explicit `subnets` arg to discover_all() (rare — used by tests)
#   2. AVCAST_SUBNETS env var (manual override for unusual setups)
#   3. Auto-detected from local network interfaces (the normal case —
#      adapts as the laptop moves between networks)
#   4. Hardcoded fallback (only if everything else fails)
import os as _os
import re as _re_subnets
import socket as _socket_subnets
import subprocess as _sub_subnets
import ipaddress as _ipaddr_subnets


def detect_local_subnets() -> list[str]:
    """IPv4 /24 (or narrower) subnets covering every active, non-loopback,
    non-link-local interface. Parsed from ifconfig on macOS/Linux."""
    subnets: set = set()
    try:
        out = _sub_subnets.run(["ifconfig"], capture_output=True, text=True, timeout=3).stdout
        for m in _re_subnets.finditer(
            r"inet (\d+\.\d+\.\d+\.\d+)\s+netmask\s+(0x[0-9a-fA-F]+|\d+\.\d+\.\d+\.\d+)", out
        ):
            ip_str, nm_str = m.group(1), m.group(2)
            if ip_str.startswith("127.") or ip_str.startswith("169.254."):
                continue
            try:
                if nm_str.startswith("0x"):
                    nm = _ipaddr_subnets.IPv4Address(int(nm_str, 16))
                else:
                    nm = _ipaddr_subnets.IPv4Address(nm_str)
                prefix = _ipaddr_subnets.IPv4Network(f"0.0.0.0/{nm}").prefixlen
                prefix = max(prefix, 24)   # never sweep wider than /24
                net = _ipaddr_subnets.ip_interface(f"{ip_str}/{prefix}").network
                subnets.add(str(net))
            except Exception:
                continue
    except Exception:
        pass
    if not subnets:
        try:
            s = _socket_subnets.socket(_socket_subnets.AF_INET, _socket_subnets.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            subnets.add(str(_ipaddr_subnets.ip_interface(f"{ip}/24").network))
        except Exception:
            pass
    return sorted(subnets)


def default_subnets() -> list[str]:
    """Resolved at call time — env override > local detection > hardcoded."""
    env = (_os.environ.get("AVCAST_SUBNETS") or "").strip()
    if env:
        return [s.strip() for s in env.split(",") if s.strip()]
    detected = detect_local_subnets()
    if detected:
        return detected
    return ["10.1.10.0/24", "10.1.11.0/24"]


# Kept for backwards compatibility — callers that imported the constant.
# Computed once at module load; prefer default_subnets() for fresh detection.
DEFAULT_SUBNETS = default_subnets()


def discover_all(mdns_timeout: float = 4.0, ssdp_timeout: float = 2.5,
                 subnets: list[str] | None = None) -> list[Device]:
    """Run all discovery methods, merge by id, return unified device list."""
    merged: dict[str, Device] = {}

    def _name_score(n: str) -> int:
        """Higher = better. Penalize raw mDNS-style names like 'RINCON_xxx@...' and IDs."""
        if not n: return 0
        score = 50
        if "@" in n: score -= 20
        if "RINCON_" in n: score -= 30
        if "._tcp" in n: score -= 30
        if n.startswith("upnp") or n.startswith("airplay"): score -= 10
        # Heavy penalty for the unicast-probe fallback names — they're better
        # than nothing but always lose to the real mDNS friendly name (e.g.
        # "Living Room HomePod" should win over "AirPlay device @ 10.1.10.42").
        if "device @ " in n.lower() or n.lower().startswith("apple device"):
            score -= 60
        # readable names full of words score higher
        score += min(len(n.split()), 4) * 3
        return score

    def merge(items: list[Device]):
        for d in items:
            existing = merged.get(d.id)
            if existing:
                # prefer the cleaner display name
                if _name_score(d.name) > _name_score(existing.name):
                    existing.name = d.name
                # state — prefer non-null values from the new source
                for k, v in d.state.items():
                    if v is not None and v != "":
                        existing.state[k] = v
                existing.raw.update(d.raw)
                if d.model and not existing.model: existing.model = d.model
                if d.host and not existing.host: existing.host = d.host
                if d.port and not existing.port: existing.port = d.port
                for cap in d.capabilities:
                    if cap not in existing.capabilities:
                        existing.capabilities.append(cap)
            else:
                merged[d.id] = d

    if subnets is None:
        # Re-detect on every discovery so we follow the laptop between networks.
        subnets = default_subnets()

    merge(discover_mdns(timeout=mdns_timeout))
    merge(discover_ssdp(timeout=ssdp_timeout))
    merge(enrich_sonos())
    merge(enrich_chromecast(timeout=mdns_timeout))
    merge(discover_local_bluetooth())

    # Cross-subnet unicast sweep for things that don't traverse multicast boundaries
    if subnets:
        merge(probe_subnets_for_roku(subnets))
        merge(probe_subnets_for_appletv(subnets))

    # Reclassify airplay devices into appletv/roku/sonos/etc.
    # Hostname-based runs first — catches Sonos/Roku that announced via _raop._tcp
    # only and have no `am=` model tag. Then the model-based pass handles the rest.
    _reclassify_by_hostname(list(merged.values()))
    _reclassify_by_model(list(merged.values()))

    # After reclassification, re-merge any duplicates that now have the same id+type
    final: dict[str, Device] = {}
    for d in merged.values():
        # If a device of the same canonical (host, type) exists, merge
        key = f"{d.type}:{d.host or d.id}"
        existing = final.get(key)
        if existing:
            for k, v in d.state.items():
                if v not in (None, ""): existing.state[k] = v
            for cap in d.capabilities:
                if cap not in existing.capabilities: existing.capabilities.append(cap)
            if d.model and not existing.model: existing.model = d.model
            if _name_score(d.name) > _name_score(existing.name): existing.name = d.name
            existing.raw.update(d.raw)
        else:
            final[key] = d

    # Roku enrichment for any roku hosts found (fills name/model from ECP if missing)
    for d in final.values():
        if d.type == "roku" and d.host:
            info = enrich_roku(d.host)
            if info:
                if info.get("name") and (not d.name or d.name.startswith(("Roku", "roku"))):
                    d.name = info["name"]
                if info.get("model") and not d.model: d.model = info["model"]
                d.state["powered"] = info.get("powered")
                d.raw["roku"] = info

    # UPnP MediaRenderer enrichment — for each type=upnp device, fetch its
    # device-desc.xml and check for AVTransport/RenderingControl services.
    # If present, reclassify to upnp-renderer with full caps + service URLs
    # stashed in raw so controllers can issue SOAP commands.
    for d in list(final.values()):
        if d.type == "upnp" and d.host:
            try:
                renderer_info = enrich_upnp_renderer(d)
                if renderer_info:
                    d.type = "upnp-renderer"
                    d.name = renderer_info.get("name") or d.name
                    d.model = renderer_info.get("model") or d.model
                    d.manufacturer = renderer_info.get("manufacturer") or d.manufacturer
                    d.capabilities = ["volume", "mute", "play", "pause", "stop", "status"]
                    d.raw["upnp"] = renderer_info
            except Exception:
                pass

    # Final dedup: collapse same-IP duplicates (the canonical case is one
    # Sonos showing up as sonos + airplay + spotify-connect simultaneously).
    return _absorb_secondary_services(list(final.values()))


if __name__ == "__main__":
    devs = discover_all()
    print(json.dumps([d.to_dict() for d in devs], indent=2, default=str))
    print(f"\n{len(devs)} devices found")
