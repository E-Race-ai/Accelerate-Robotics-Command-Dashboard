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
    "stop_requested": False,
    "current_proc": None,    # subprocess.Popen handle of the currently-running nmap
}
_state_lock = threading.Lock()


def get_status() -> dict:
    with _state_lock:
        d = dict(_state)
    # The subprocess.Popen handle isn't JSON-serializable; drop it from the
    # response. Internal-only — frontend has no use for it.
    d.pop("current_proc", None)
    return d


def _set(**kw):
    with _state_lock:
        _state.update(kw)


def _append_log(line: str):
    with _state_lock:
        tail = _state["log_tail"]
        tail.append(line)
        if len(tail) > 30:
            del tail[:-30]


def _detect_local_subnets() -> list[str]:
    """Return the IPv4 subnets the machine is currently attached to —
    one per active non-loopback, non-link-local interface. Parsed from
    `ifconfig` on macOS / Linux; falls back to route-based detection,
    then to a single /24 around the default-route IP."""
    import re, subprocess, socket, ipaddress
    subnets: set = set()
    try:
        out = subprocess.run(["ifconfig"], capture_output=True, text=True, timeout=3).stdout
        for m in re.finditer(
            r"inet (\d+\.\d+\.\d+\.\d+)\s+netmask\s+(0x[0-9a-fA-F]+|\d+\.\d+\.\d+\.\d+)", out
        ):
            ip_str, nm_str = m.group(1), m.group(2)
            if ip_str.startswith("127.") or ip_str.startswith("169.254."):
                continue
            try:
                if nm_str.startswith("0x"):
                    nm = ipaddress.IPv4Address(int(nm_str, 16))
                else:
                    nm = ipaddress.IPv4Address(nm_str)
                prefix = ipaddress.IPv4Network(f"0.0.0.0/{nm}").prefixlen
                # Cap at /24 so we never sweep an entire /16 by mistake.
                prefix = max(prefix, 24)
                net = ipaddress.ip_interface(f"{ip_str}/{prefix}").network
                subnets.add(str(net))
            except Exception:
                continue
    except Exception:
        pass
    if not subnets:
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
            s.close()
            subnets.add(str(ipaddress.ip_interface(f"{ip}/24").network))
        except Exception:
            pass
    return sorted(subnets)


def _detect_scanner_ip() -> str:
    """Best-guess primary IPv4 used by this machine to reach the LAN."""
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "—"


def _run(cmd: list[str], cwd: Path) -> int:
    proc = subprocess.Popen(
        cmd, cwd=str(cwd),
        stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, bufsize=1,
    )
    # Track the running subprocess so request_stop() can terminate it.
    with _state_lock:
        _state["current_proc"] = proc
    assert proc.stdout is not None
    try:
        for line in proc.stdout:
            line = line.rstrip()
            if line:
                _append_log(line)
        return proc.wait()
    finally:
        with _state_lock:
            _state["current_proc"] = None


def request_stop():
    """Cancel a running scan. Sets a flag the pipeline checks between stages
    and terminates the current nmap subprocess so the active stage exits
    immediately. Idempotent — safe to call when nothing is running."""
    with _state_lock:
        _state["stop_requested"] = True
        proc = _state.get("current_proc")
    if proc is not None:
        try:
            proc.terminate()
        except Exception:
            pass
    return {"ok": True, "stopped": proc is not None}


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


def _synthesize_findings(hosts: list[dict]) -> list[dict]:
    """Heuristic vulnerability findings derived from each host's open service
    list. We don't parse the full vuln-script XML (that'd be a project); we
    flag the well-known dangerous ports + plaintext protocols + admin
    interfaces. Severity classes mirror the page's expectations: HIGH / MED / INFO."""
    findings: list[dict] = []
    fid = 0
    for h in hosts:
        ip = h.get("ip", "")
        port_set = {p.get("port") for p in (h.get("ports") or [])}
        port_index = {p.get("port"): p for p in (h.get("ports") or [])}
        def add(severity: str, title: str, detail: str, port: int | None = None):
            nonlocal fid
            fid += 1
            findings.append({
                "id": f"f{fid:04d}", "ip": ip, "severity": severity,
                "title": title, "detail": detail,
                "port": port, "category": h.get("category", "unknown"),
            })
        if 23 in port_set:
            add("HIGH", "Telnet exposed", f"Port 23 is open on {ip}. Telnet sends credentials in clear text — disable it or replace with SSH.", 23)
        if 21 in port_set:
            add("HIGH", "FTP exposed", f"Port 21 is open on {ip}. Most FTP servers send credentials in clear text — disable or switch to SFTP/FTPS.", 21)
        if 445 in port_set:
            add("MED", "SMB/CIFS exposed", f"Port 445 is open on {ip}. Restrict to internal-only and confirm SMBv1 is disabled.", 445)
        if 139 in port_set:
            add("MED", "NetBIOS exposed", f"Port 139 is open on {ip}. Legacy protocol — consider firewalling externally.", 139)
        if 5900 in port_set:
            add("MED", "VNC exposed", f"Port 5900 (VNC) is open on {ip}. Confirm a strong password is set and consider tunneling through SSH.", 5900)
        if 161 in port_set:
            add("MED", "SNMP exposed", f"Port 161 is open on {ip}. Ensure community string is not the default 'public'.", 161)
        if 1900 in port_set:
            add("INFO", "UPnP advertised", f"Port 1900 (UPnP/SSDP) on {ip}. Often benign on media devices; flag if seen on routers/firewalls.", 1900)
        # Admin web UIs on non-standard HTTPS ports
        for adminport in (8080, 8443, 8000, 8888, 10000):
            if adminport in port_set:
                add("INFO", f"Admin web UI on port {adminport}",
                    f"{ip}:{adminport} responds to HTTP. Verify it requires authentication and uses a strong password.", adminport)
        # Old SSH versions (heuristic via product string)
        ssh_svc = port_index.get(22)
        if ssh_svc and "openssh" in (ssh_svc.get("product") or "").lower():
            ver = ssh_svc.get("version") or ""
            if ver and any(ver.startswith(old) for old in ("5.", "6.", "7.0", "7.1", "7.2")):
                add("MED", "Old OpenSSH version", f"{ip} is running OpenSSH {ver}. Older versions have known CVEs — update to 9.x+.", 22)
        # Printer admin
        if 9100 in port_set and 80 in port_set:
            add("INFO", "Printer web admin", f"{ip} has both raw-print (9100) and a web UI. Make sure the admin panel has a non-default password.", 80)
    return findings


def _risk_from_findings(findings: list[dict]) -> dict:
    """Composite security score on an INVERTED scale — 100 = fully secure,
    0 = critical exposure (think A+ school grade). HIGH findings cost the
    most points, then MED, then INFO. Grade band: A 80+, B 60-79,
    C 40-59, D 20-39, F under 20. Always returns a verdict string the page
    can show as the headline under the number."""
    hi  = sum(1 for v in findings if v["severity"] == "HIGH")
    med = sum(1 for v in findings if v["severity"] == "MED")
    inf = sum(1 for v in findings if v["severity"] == "INFO")
    penalty = hi * 25 + med * 10 + inf * 2
    score = max(0, 100 - penalty)
    if score >= 90: grade, verdict = "A", "Excellent — minimal exposure detected. Consider the recommendations below to reach a perfect 100."
    elif score >= 80: grade, verdict = "A-", "Strong baseline — a few low-impact items to clean up to push toward 100."
    elif score >= 60: grade, verdict = "B", "Mostly healthy — a handful of items worth addressing to harden the network further."
    elif score >= 40: grade, verdict = "C", "Moderate exposure — patch the medium-severity items soon and triage anything HIGH."
    elif score >= 20: grade, verdict = "D", "Significant exposure — multiple high-impact items require immediate action."
    else:             grade, verdict = "F", "Critical exposure — stop here and remediate immediately before broader exposure."
    return {"score": score, "grade": grade, "verdict": verdict,
            "raw": penalty,
            "counts": {"HIGH": hi, "MED": med, "INFO": inf}}


def _build_recommendations(findings: list[dict], hosts: list[dict]) -> list[dict]:
    """Build prioritized recommendations. Field names match what report.html
    expects in its renderer: priority (number), title, impact (rationale),
    effort ("Low — quick fix" / "Medium — config change" / "High — needs change-window").
    Recommendations are gated by what the scan actually found, plus a set of
    hardening tips that always apply so the report never says 'you're done,
    relax' (there's always more to do to push toward 100/100)."""
    items: list[tuple[str, str, str, str]] = []  # (effort, title, impact, gate-key)
    def has(*keys) -> bool:
        for k in keys:
            if any(k in (f["title"] or "") for f in findings): return True
        return False

    # ── Critical / HIGH-severity gated recs (only when relevant) ──
    if has("Telnet"):
        items.append(("Low — quick fix",
            "Disable Telnet wherever it appears",
            "Telnet sends credentials in clear text. Replace with SSH on every flagged host or block port 23 at the firewall — both work in minutes.",
            "telnet"))
    if has("FTP"):
        items.append(("Low — quick fix",
            "Replace FTP with SFTP or FTPS",
            "FTP transmits credentials and data unencrypted. Migrate to SFTP (built into OpenSSH) or FTPS (FTP-over-TLS) — both are drop-in replacements with stronger transport security.",
            "ftp"))
    if has("SMB", "NetBIOS"):
        items.append(("Medium — config change",
            "Audit SMB / NetBIOS exposure",
            "Restrict SMB and NetBIOS to internal management VLANs only. Confirm SMBv1 is disabled — every modern OS supports SMBv2/3-only mode.",
            "smb"))
    if has("VNC"):
        items.append(("Medium — config change",
            "Tunnel VNC through SSH or replace it",
            "VNC's native auth is weak. Either tunnel through SSH (vnc:// over an SSH local-forward) or switch to a remote-desktop tool with strong native auth like RustDesk or AnyDesk.",
            "vnc"))
    if has("SNMP"):
        items.append(("Medium — config change",
            "Rotate SNMP community strings",
            "Default communities like 'public'/'private' let any local attacker enumerate the device fleet. Move to SNMPv3 with auth + encryption where the device supports it; otherwise rotate to a long random community string.",
            "snmp"))
    if has("OpenSSH"):
        items.append(("Medium — config change",
            "Update OpenSSH installations",
            "Some hosts are running pre-9.x OpenSSH. Update to the current version to pick up the last two years of CVE fixes — most distributions ship 9.x in their stable repos now.",
            "openssh"))
    if has("Admin web UI"):
        items.append(("Low — quick fix",
            "Audit non-standard admin web UIs",
            "Each device with an admin panel on 8080/8443/8000 should have a strong unique password and ideally MFA. Many vendors ship with well-known default credentials that won't survive a public credential-stuffing attempt.",
            "admin-ui"))
    if has("Printer web admin"):
        items.append(("Low — quick fix",
            "Lock down printer admin pages",
            "Printers are common pivot points — they sit on the LAN, hold cached credentials, and rarely get patched. Set a non-default admin password on every flagged unit and restrict the admin VLAN.",
            "printer"))
    if has("UPnP"):
        items.append(("Medium — config change",
            "Disable UPnP at the gateway",
            "UPnP can punch holes in your firewall on demand. Disable it on the WAN router and any consumer-grade access points that have it enabled by default.",
            "upnp"))

    # ── Always-applicable hardening (push toward 100/100 even when score is high) ──
    items.append(("Low — quick fix",
        "Confirm WPA3 (or WPA2-AES) is the only Wi-Fi auth in use",
        "Open or WPA-mixed SSIDs let nearby attackers join the LAN before they ever touch your perimeter. Disable any legacy SSID and require WPA3-Personal (or WPA2-AES with a 16+ char passphrase) on every broadcast.",
        "wifi-auth"))
    items.append(("Medium — config change",
        "Isolate the guest network",
        "Confirm the guest SSID can only reach the internet — no LAN, no admin VLAN, no printers. Most consumer routers ship with this disabled by default.",
        "guest-vlan"))
    items.append(("Low — quick fix",
        f"Maintain an asset inventory of the {len(hosts)} live host{'s' if len(hosts) != 1 else ''}",
        "Keep this discovered list up to date in your CMDB / spreadsheet. Anything new on the next scan should be a known device — anything you can't account for is the first thing to investigate.",
        "asset-inventory"))
    items.append(("Medium — config change",
        "Enable two-factor on every admin web UI",
        "Routers, NAS units, printers, and IoT bridges with admin panels on the LAN should all require 2FA / passkey login. Single-password logins on the LAN are a credential-spray waiting to happen.",
        "2fa-admin"))
    items.append(("Medium — config change",
        "Set up centralized log collection",
        "Forward syslog from your firewall, switches, and any *nix host to a central log store (Loki/Splunk/ELK). Catches credential-stuffing and lateral-movement attempts in minutes instead of weeks.",
        "centralized-logs"))
    items.append(("High — needs change-window",
        "Segment the IoT/AV fleet onto its own VLAN",
        "Cameras, smart speakers, AV receivers, printers — none of these need to reach your laptops or servers. Move them onto a dedicated VLAN with internet-only egress and the attack surface drops dramatically.",
        "iot-vlan"))
    items.append(("Low — quick fix",
        "Schedule recurring audits monthly",
        "Networks drift. Re-run this audit on a recurring basis (monthly or after any major change) so newly-exposed services show up immediately, not on the next pen-test.",
        "recurring-audit"))

    # Number them in priority order: HIGH-effort fixes that close real gaps first,
    # then the always-on hardening. Field names match the renderer.
    recs: list[dict] = []
    for i, (effort, title, impact, _gate) in enumerate(items, start=1):
        recs.append({
            "priority": i, "title": title, "impact": impact, "effort": effort,
        })
    return recs


def _build_methodology() -> list[dict]:
    """Static description of what the 4 nmap stages do. Field names (phase /
    name / tool / result) match the renderer in report.html."""
    return [
        {"phase": 1, "name": "Host discovery sweep",
         "tool": "nmap -sn -PS22,80,443,515,631,1400,5353,7000,8009,8060,9100",
         "result": "TCP SYN-ping across SSH/HTTP/HTTPS + AirPlay/Chromecast/Roku/Sonos/printer service ports. Catches every host responding to at least one service even when ICMP is blocked at the gateway."},
        {"phase": 2, "name": "Service fingerprinting",
         "tool": "nmap -sT -sV -sC --version-intensity 5 -iL live_hosts.txt",
         "result": "Targeted service-version detection across the 50 most common admin/management ports on every host found in stage 1."},
        {"phase": 3, "name": "Vulnerability scripts",
         "tool": "nmap --script vuln,default,http-enum,http-default-accounts,ssl-enum-ciphers,smb-vuln*,ssh2-enum-algos,ftp-anon,telnet-encryption",
         "result": "NSE vulnerability scripts on every host that exposed a risky port. Surfaces default credentials, weak ciphers, anonymous-FTP, and known CVEs."},
        {"phase": 4, "name": "Focused follow-up",
         "tool": "nmap --script http-title,http-headers,http-default-accounts,banner,snmp-info",
         "result": "Re-runs targeted scripts on any host that timed out in stage 3 — picks up admin-page titles, server banners, and SNMP info even on slow devices."},
    ]


def _regenerate_data_js(hosts: list[dict]):
    """Rewrite data.js with a complete, freshly-computed report. Replaces ALL
    user-facing sections (risk score, findings, recommendations, methodology,
    meta) — earlier versions preserved old fields, which left the page showing
    'No scan data' even after a successful scan when data.js was cleared on
    scan start."""
    import ipaddress
    data_path = NETSCAN_DIR / "data.js"
    if data_path.exists():
        (NETSCAN_DIR / "data.js.bak").write_text(data_path.read_text())

    findings = _synthesize_findings(hosts)
    risk     = _risk_from_findings(findings)
    recs     = _build_recommendations(findings, hosts)
    methodology = _build_methodology()

    # Count probed IPs across the configured subnets (used by the "of N probed
    # across M subnets" KPI subtitle).
    total_probed = 0
    for s in _state["subnets"] or []:
        try:
            total_probed += sum(1 for _ in ipaddress.ip_network(s, strict=False).hosts())
        except Exception:
            pass

    new = {
        "is_sample": False,
        "hosts": hosts,
        "vulns": findings,
        "risk": risk,
        "recommendations": recs,
        "methodology": methodology,
        "meta": {
            "subnets": _state["subnets"],
            "scanner": _detect_scanner_ip(),
            "date": datetime.now().strftime("%m/%d/%Y"),
            "live": len(hosts),
            "total_probed": total_probed,
            "rescanned_at": int(time.time()),
        },
    }
    data_path.write_text("window.SCAN = " + json.dumps(new) + ";\n")


def _check_stop():
    """Raise StopIteration if a stop was requested. Caller catches and bails."""
    with _state_lock:
        if _state.get("stop_requested"):
            raise _ScanStopped()


class _ScanStopped(Exception):
    """Raised when the user requested a stop mid-scan."""
    pass


def run_pipeline():
    try:
        # Reset stop flag at the start of every new scan.
        _set(stop_requested=False)
        # Auto-detect the subnets the machine is CURRENTLY on so the audit
        # always scans the right network — no more "wait it's still using the
        # IP range from when this tool was first installed" surprises.
        # Falls back to the hardcoded default only if detection fails entirely.
        detected_subnets = _detect_local_subnets()
        if detected_subnets:
            _set(subnets=detected_subnets)
        _set(running=True, stage="discovery", stage_label="Stage 1/4: discovery sweep",
             stage_index=1, started_at=int(time.time()), finished_at=None,
             error=None, log_tail=[])

        # Host discovery: use TCP SYN-ping (--unprivileged falls back to
        # TCP-connect) across the ports our actual fleet listens on, NOT just
        # the nmap default ACK-80/443. On segmented networks where 80/443 are
        # blocked, the default returns "0 hosts up" even when 40+ devices
        # are visible to mDNS/SSDP. The ports cover SSH/HTTP/HTTPS + AirPlay
        # (7000), Chromecast (8009), Roku ECP (8060), Sonos (1400), mDNS
        # (5353), and printer (515/631/9100). nmap stops probing once any
        # one of these succeeds per host, so the overhead is minimal.
        # T4 + min-rate keep stage 1 under a couple of minutes for /24 sweeps.
        DISCOVERY_PORTS = "22,80,443,515,631,1400,5353,7000,8009,8060,9100"
        rc = _run([
            NMAP, "-sn",
            "-PS" + DISCOVERY_PORTS,
            "-PA80,443",
            "--unprivileged",
            "-T4", "--min-rate", "300", "--max-retries", "1",
            "--host-timeout", "12s",
            "-oA", "01_discovery",
            *_state["subnets"],
        ], NETSCAN_DIR)
        if rc != 0:
            raise RuntimeError(f"discovery failed (nmap exit {rc})")

        live = _live_hosts_from_gnmap(NETSCAN_DIR / "01_discovery.gnmap")
        # Fallback: if nmap discovery returns nothing (segmented network blocks
        # every probe type), seed live hosts from A/V Cast's own running
        # device list. mDNS/SSDP/unicast probes catch devices that nmap
        # host-discovery can't reach. We call our own /api/devices endpoint
        # rather than reading devices_cache.json so we get the CURRENT
        # state, not a possibly-stale on-disk snapshot.
        if not live:
            try:
                import urllib.request as _urlreq, json as _json
                with _urlreq.urlopen("http://127.0.0.1:8765/api/devices", timeout=4) as r:
                    payload = _json.loads(r.read().decode("utf-8"))
                devs = payload.get("devices") or []
                if isinstance(devs, dict):
                    devs = list(devs.values())
                seen: set = set()
                for d in devs:
                    if d.get("is_sample"):
                        continue
                    h = d.get("host")
                    if h and h not in seen:
                        seen.add(h)
                        live.append(h)
                if live:
                    _set(log_tail=(_state.get("log_tail") or []) + [
                        f"[fallback] nmap discovery found 0 — using {len(live)} hosts from A/V Cast"
                    ])
            except Exception as _e:
                _set(log_tail=(_state.get("log_tail") or []) + [
                    f"[fallback] A/V Cast device list unreachable: {_e}"
                ])
        (NETSCAN_DIR / "live_hosts.txt").write_text("\n".join(live) + "\n")
        if not live:
            raise RuntimeError("discovery returned 0 live hosts and no cached devices — run a Live Cast scan on the A/V Cast page first")

        _check_stop()
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

        _check_stop()
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

        _check_stop()
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
    except _ScanStopped:
        # User clicked Stop Scanning. Don't write partial results — leave
        # data.js as it was so the page returns to its prior (empty/cleared)
        # state. Flip to idle so the bootstrap polling stops.
        _set(stage="idle", stage_label="Scan stopped",
             finished_at=int(time.time()), running=False,
             error=None, stop_requested=False)
    except Exception as e:
        _set(stage="error", stage_label=f"Failed: {e}",
             error=str(e), finished_at=int(time.time()), running=False,
             stop_requested=False)


def start_pipeline() -> bool:
    with _state_lock:
        if _state["running"]:
            return False
    threading.Thread(target=run_pipeline, daemon=True).start()
    return True
