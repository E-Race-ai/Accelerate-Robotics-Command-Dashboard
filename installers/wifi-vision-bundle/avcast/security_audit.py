"""Security audit re-scan pipeline.

Reproduces the original 4-stage nmap audit and refreshes the host/meta layer
of data.js. The interpretive layer (vulns, risk, recommendations, methodology)
is preserved across rescans — those reflect human/LLM analysis of the prior
scan and need separate re-curation.
"""
from __future__ import annotations
import json
import re
import shutil
import subprocess
import threading
import time
import xml.etree.ElementTree as ET
from datetime import datetime
from pathlib import Path

NETSCAN_DIR = Path(__file__).resolve().parent.parent
NMAP = shutil.which("nmap") or "/opt/homebrew/bin/nmap"

RISKY_PORTS = {21, 22, 23, 80, 81, 135, 139, 443, 445, 515, 631, 5900, 8080, 9100, 161, 3389}

VULN_PORT_LIST = "21,22,23,80,81,135,139,443,445,515,631,5900,8080,9100"
FOCUSED_PORT_LIST = "21,22,23,80,443,515,631,8080,9100"
SERVICES_PORT_LIST = (
    "21,22,23,25,53,80,81,88,110,111,135,139,143,161,389,443,445,465,514,515,587,631,636,801,"
    "873,902,993,995,1080,1433,1521,1723,1900,2049,2375,3000,3128,3268,3306,3389,4443,5000,"
    "5060,5222,5432,5601,5672,5900,5985,6379,7000,7547,8000,8008,8009,8080,8081,8082,8088,"
    "8089,8090,8181,8200,8291,8333,8443,8500,8530,8531,8554,8728,8888,9000,9001,9090,9100,"
    "9200,9418,9443,10000,11211,15672,27017,32400,32764,49152"
)

CATEGORY_EMOJI = {
    "firewall": "🛡️", "apple-device": "🍎", "unknown": "❓",
    "linux-host": "🐧", "network-gear": "📡", "iot": "🔌",
    "voip": "📞", "printer": "🖨️", "windows/server": "🪟",
    "web-device": "🌐", "vnc-host": "🖥️",
}

_state = {
    "running": False,
    "stage": "idle",
    "stage_label": None,
    "stage_index": 0,
    "stage_count": 4,
    "started_at": None,
    "finished_at": None,
    "error": None,
    "log_tail": [],
    "subnets": ["10.1.10.0/24", "10.1.11.0/24"],
    "last_completed_at": None,
}
_state_lock = threading.Lock()


def get_status() -> dict:
    with _state_lock:
        return dict(_state)


def _set(**kw):
    with _state_lock:
        _state.update(kw)


def _append_log(line: str):
    with _state_lock:
        tail = _state["log_tail"]
        tail.append(line)
        if len(tail) > 30:
            del tail[:-30]


def _run(cmd: list[str], cwd: Path) -> int:
    proc = subprocess.Popen(
        cmd, cwd=str(cwd),
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1,
    )
    assert proc.stdout is not None
    for line in proc.stdout:
        line = line.rstrip()
        if line:
            _append_log(line)
    return proc.wait()


def _classify(ports: list[dict], vendor: str) -> str:
    pset = {p["port"] for p in ports}
    names = " ".join((p.get("name", "") + " " + p.get("product", "")) for p in ports).lower()
    v = (vendor or "").lower()
    if 9100 in pset or 515 in pset or 631 in pset or "jetdirect" in names or "printer" in names or "ipp" in names:
        return "printer"
    if "sonicwall" in names or "fortinet" in names or "palo alto" in v:
        return "firewall"
    if "airplay" in names or 7000 in pset or 5000 in pset or "apple" in v:
        return "apple-device"
    if any(b in v for b in ("cisco", "aruba", "ubiquiti", "meraki", "mikrotik")):
        return "network-gear"
    if 88 in pset or 389 in pset or 445 in pset:
        return "windows/server"
    if 22 in pset and len(pset) <= 3:
        return "linux-host"
    if 5900 in pset:
        return "vnc-host"
    if 80 in pset or 443 in pset or 8080 in pset:
        return "web-device"
    return "unknown"


def _parse_services_xml(path: Path) -> list[dict]:
    if not path.exists():
        return []
    tree = ET.parse(path)
    hosts: list[dict] = []
    for h in tree.findall("host"):
        st = h.find("status")
        if st is None or st.get("state") != "up":
            continue
        ip = next((a.get("addr") for a in h.findall("address") if a.get("addrtype") == "ipv4"), None)
        if not ip:
            continue
        mac_el = next((a for a in h.findall("address") if a.get("addrtype") == "mac"), None)
        mac = mac_el.get("addr") if mac_el is not None else ""
        vendor = mac_el.get("vendor", "") if mac_el is not None else ""
        hn_el = h.find("hostnames/hostname")
        hostname = hn_el.get("name") if hn_el is not None else ""
        ports: list[dict] = []
        for p in h.findall("ports/port"):
            ps = p.find("state")
            if ps is None or ps.get("state") != "open":
                continue
            svc = p.find("service")
            ports.append({
                "port": int(p.get("portid")),
                "proto": p.get("protocol"),
                "name": svc.get("name", "") if svc is not None else "",
                "product": svc.get("product", "") if svc is not None else "",
                "version": svc.get("version", "") if svc is not None else "",
                "extra": svc.get("extrainfo", "") if svc is not None else "",
            })
        cat = _classify(ports, vendor)
        hosts.append({
            "ip": ip, "mac": mac, "vendor": vendor, "hostname": hostname,
            "ports": ports, "category": cat,
            "emoji": CATEGORY_EMOJI.get(cat, "❓"),
            "device": cat,
        })
    hosts.sort(key=lambda h: tuple(int(o) for o in h["ip"].split(".")))
    return hosts


def _live_hosts_from_gnmap(path: Path) -> list[str]:
    ips: list[str] = []
    if not path.exists():
        return ips
    for line in path.read_text().splitlines():
        if "Status: Up" in line:
            m = re.search(r"Host:\s+(\S+)", line)
            if m:
                ips.append(m.group(1))
    return ips


def _vuln_targets_from_hosts(hosts: list[dict]) -> list[str]:
    out: list[str] = []
    for h in hosts:
        pset = {p["port"] for p in h["ports"]}
        if pset & RISKY_PORTS:
            out.append(h["ip"])
    return out


def _regenerate_data_js(hosts: list[dict]):
    """Rewrite data.js with refreshed hosts + meta. Preserve vulns/risk/recommendations/methodology."""
    data_path = NETSCAN_DIR / "data.js"
    existing: dict = {}
    if data_path.exists():
        text = data_path.read_text()
        try:
            existing = json.loads(re.sub(r"^\s*window\.SCAN\s*=\s*", "", text).rstrip().rstrip(";"))
        except Exception:
            existing = {}
        (NETSCAN_DIR / "data.js.bak").write_text(text)
    new = dict(existing)
    new["hosts"] = hosts
    new["meta"] = {
        **(existing.get("meta") or {}),
        "subnets": _state["subnets"],
        "date": datetime.now().strftime("%Y-%m-%d"),
        "live": len(hosts),
        "rescanned_at": int(time.time()),
    }
    data_path.write_text("window.SCAN = " + json.dumps(new) + ";\n")


def run_pipeline():
    try:
        _set(running=True, stage="discovery", stage_label="Stage 1/4: discovery sweep",
             stage_index=1, started_at=int(time.time()), finished_at=None,
             error=None, log_tail=[])

        rc = _run([
            NMAP, "-sn", "--unprivileged", "-oA", "01_discovery",
            *_state["subnets"],
        ], NETSCAN_DIR)
        if rc != 0:
            raise RuntimeError(f"discovery failed (nmap exit {rc})")

        live = _live_hosts_from_gnmap(NETSCAN_DIR / "01_discovery.gnmap")
        (NETSCAN_DIR / "live_hosts.txt").write_text("\n".join(live) + "\n")
        if not live:
            raise RuntimeError("discovery returned 0 live hosts")

        _set(stage="services", stage_label=f"Stage 2/4: service fingerprinting ({len(live)} hosts)",
             stage_index=2)
        rc = _run([
            NMAP, "-sT", "-sV", "-sC", "--version-intensity", "5",
            "-p", SERVICES_PORT_LIST,
            "-iL", "live_hosts.txt", "-oA", "02_services",
            "-T4", "--max-retries", "2", "--host-timeout", "5m",
        ], NETSCAN_DIR)
        if rc != 0:
            raise RuntimeError(f"services failed (nmap exit {rc})")

        hosts = _parse_services_xml(NETSCAN_DIR / "02_services.xml")
        targets = _vuln_targets_from_hosts(hosts)
        (NETSCAN_DIR / "vuln_targets.txt").write_text("\n".join(targets) + "\n")

        _set(stage="vuln", stage_label=f"Stage 3/4: vuln scripts ({len(targets)} targets)",
             stage_index=3)
        if targets:
            rc = _run([
                NMAP, "-sT", "-sV",
                "--script", "vuln,default,http-enum,http-default-accounts,ftp-anon,ssl-enum-ciphers,smb-vuln*,ssh2-enum-algos,telnet-encryption",
                "-p", VULN_PORT_LIST,
                "-iL", "vuln_targets.txt", "-oA", "03_vuln",
                "-T4", "--host-timeout", "8m",
            ], NETSCAN_DIR)
            if rc != 0:
                _append_log(f"[warn] vuln stage exit {rc} (continuing)")

        _set(stage="focused", stage_label="Stage 4/4: focused follow-up",
             stage_index=4)
        timed_out: list[str] = []
        v_xml = NETSCAN_DIR / "03_vuln.xml"
        if v_xml.exists():
            try:
                vt = ET.parse(v_xml)
                seen = set()
                for h in vt.findall("host"):
                    st = h.find("status")
                    if st is not None and st.get("state") == "up":
                        ip = next((a.get("addr") for a in h.findall("address") if a.get("addrtype") == "ipv4"), None)
                        if ip:
                            seen.add(ip)
                timed_out = [ip for ip in targets if ip not in seen]
            except Exception as e:
                _append_log(f"[warn] could not parse 03_vuln.xml: {e}")
        (NETSCAN_DIR / "timed_out.txt").write_text("\n".join(timed_out) + "\n")
        if timed_out:
            rc = _run([
                NMAP, "-sT", "-sV",
                "--script", "http-title,http-headers,http-default-accounts,http-auth,ftp-anon,banner,snmp-info",
                "-p", FOCUSED_PORT_LIST,
                "-iL", "timed_out.txt", "-oA", "04_focused",
                "-T4", "--host-timeout", "4m",
            ], NETSCAN_DIR)
            if rc != 0:
                _append_log(f"[warn] focused stage exit {rc} (continuing)")

        _set(stage="classify", stage_label="Regenerating data.js")
        _regenerate_data_js(hosts)

        now = int(time.time())
        _set(stage="done", stage_label="Scan complete",
             finished_at=now, running=False, last_completed_at=now)
    except Exception as e:
        _set(stage="error", stage_label=f"Failed: {e}",
             error=str(e), finished_at=int(time.time()), running=False)


def start_pipeline() -> bool:
    with _state_lock:
        if _state["running"]:
            return False
    threading.Thread(target=run_pipeline, daemon=True).start()
    return True
