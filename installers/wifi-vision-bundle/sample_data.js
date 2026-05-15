window.SCAN = {
  "_sample": true,
  "meta": {
    "_sample": true,
    "subnets": ["10.99.10.0/24", "10.99.11.0/24"],
    "scanner": "10.99.10.5",
    "date": "Sample dataset",
    "live": 12
  },
  "risk": {
    "score": 64,
    "grade": "C",
    "verdict": "Demo dataset — sample findings shown for illustration only.",
    "raw": 88
  },
  "hosts": [
    {"ip":"10.99.10.1","mac":"","vendor":"","hostname":"sample-router","ports":[{"port":22,"proto":"tcp","name":"ssh","product":"","version":"","extra":""},{"port":80,"proto":"tcp","name":"http","product":"","version":"","extra":""},{"port":443,"proto":"tcp","name":"https","product":"","version":"","extra":""}],"category":"firewall","device":"Sample Firewall","emoji":"🛡️"},
    {"ip":"10.99.10.10","mac":"","vendor":"","hostname":"sample-host","ports":[{"port":22,"proto":"tcp","name":"ssh","product":"","version":"","extra":""},{"port":5000,"proto":"tcp","name":"upnp","product":"","version":"","extra":""},{"port":7000,"proto":"tcp","name":"rtsp","product":"","version":"","extra":""}],"category":"apple-device","device":"Sample Mac","emoji":"🍎"},
    {"ip":"10.99.10.20","mac":"","vendor":"","hostname":"","ports":[{"port":80,"proto":"tcp","name":"http","product":"","version":"","extra":""},{"port":5000,"proto":"tcp","name":"upnp","product":"","version":"","extra":""}],"category":"apple-device","device":"Sample Apple TV","emoji":"🍎"},
    {"ip":"10.99.10.30","mac":"","vendor":"","hostname":"","ports":[{"port":22,"proto":"tcp","name":"ssh","product":"OpenSSH","version":"9.0","extra":""}],"category":"linux-host","device":"Sample Linux box","emoji":"🐧"},
    {"ip":"10.99.10.50","mac":"","vendor":"","hostname":"sample-bridge","ports":[{"port":80,"proto":"tcp","name":"http","product":"","version":"","extra":""},{"port":443,"proto":"tcp","name":"https","product":"","version":"","extra":""}],"category":"iot","device":"Sample smart bridge","emoji":"💡"},
    {"ip":"10.99.10.55","mac":"","vendor":"","hostname":"","ports":[{"port":80,"proto":"tcp","name":"http","product":"","version":"","extra":""}],"category":"iot","device":"Sample thermostat","emoji":"🔌"},
    {"ip":"10.99.10.60","mac":"","vendor":"","hostname":"sample-voip","ports":[{"port":23,"proto":"tcp","name":"telnet","product":"","version":"","extra":""},{"port":80,"proto":"tcp","name":"http","product":"","version":"","extra":""}],"category":"voip","device":"Sample VoIP gateway","emoji":"📞"},
    {"ip":"10.99.10.70","mac":"","vendor":"","hostname":"","ports":[{"port":80,"proto":"tcp","name":"http","product":"","version":"","extra":""},{"port":515,"proto":"tcp","name":"printer","product":"","version":"","extra":""},{"port":631,"proto":"tcp","name":"ipp","product":"","version":"","extra":""},{"port":9100,"proto":"tcp","name":"jetdirect","product":"","version":"","extra":""}],"category":"printer","device":"Sample printer","emoji":"🖨️"},
    {"ip":"10.99.10.80","mac":"","vendor":"","hostname":"sample-ap","ports":[{"port":22,"proto":"tcp","name":"ssh","product":"","version":"","extra":""}],"category":"network-gear","device":"Sample access point","emoji":"📡"},
    {"ip":"10.99.10.90","mac":"","vendor":"","hostname":"","ports":[{"port":80,"proto":"tcp","name":"http","product":"","version":"","extra":""},{"port":5900,"proto":"tcp","name":"vnc","product":"","version":"","extra":""}],"category":"vnc-host","device":"Sample VNC host","emoji":"🖥️"},
    {"ip":"10.99.11.10","mac":"","vendor":"","hostname":"","ports":[{"port":80,"proto":"tcp","name":"http","product":"","version":"","extra":""}],"category":"web-device","device":"Sample web device","emoji":"🌐"},
    {"ip":"10.99.11.20","mac":"","vendor":"","hostname":"","ports":[{"port":443,"proto":"tcp","name":"https","product":"","version":"","extra":""}],"category":"unknown","device":"Sample unknown device","emoji":"❓"}
  ],
  "vulns": [
    {"severity":"HIGH","ip":"10.99.10.60","title":"Sample finding: Telnet enabled on VoIP gateway","detail":"This is example data for demo purposes. Telnet sends admin credentials in cleartext over the wire. Anyone on the same VLAN can sniff the password during an admin session.","fix":"Disable Telnet in the device's web admin and force SSH-only management. Rotate the admin password after disabling Telnet."},
    {"severity":"HIGH","ip":"10.99.10.70","title":"Sample finding: Printer admin web UI on plain HTTP","detail":"This is example data for demo purposes. Printer's web admin runs on HTTP port 80 — admin credentials cross the wire unencrypted.","fix":"Enable HTTPS-only management in the printer's network settings. Rotate the admin password and restrict access to the IT VLAN."},
    {"severity":"MED","ip":"10.99.10.90","title":"Sample finding: VNC service exposed on default port","detail":"This is example data for demo purposes. VNC port 5900 is reachable network-wide. If authentication is weak or disabled, the desktop session can be hijacked.","fix":"Set a strong VNC password (12+ chars), require client certificates if supported, and firewall port 5900 to admin workstations only."},
    {"severity":"MED","ip":"10.99.10.50","title":"Sample finding: Smart-bridge cloud admin enabled","detail":"This is example data for demo purposes. Bridge's web admin reachable from the LAN with no SSO; credentials are local-only and rarely rotated.","fix":"Disable cloud-admin if not needed. Rotate the admin token quarterly. Enable two-factor authentication if the vendor supports it."},
    {"severity":"INFO","ip":"10.99.11.20","title":"Sample finding: Unknown device on the network","detail":"This is example data for demo purposes. A device responded but the fingerprinting scan couldn't classify it. Worth confirming what it is before approving for office use.","fix":"Check the device's MAC OUI + ARP record to identify the vendor. Tag it in the asset inventory or remove it from the network."}
  ],
  "recommendations": [
    {"priority":1,"title":"Sample recommendation: Disable Telnet on the VoIP gateway","impact":"Eliminates cleartext admin credential exposure on the LAN.","effort":"Low — admin UI toggle, ~5 minutes."},
    {"priority":2,"title":"Sample recommendation: Force HTTPS on the printer admin","impact":"Stops admin password sniffing on the management network.","effort":"Low — printer settings, no firmware update needed."},
    {"priority":3,"title":"Sample recommendation: Lock down VNC reach","impact":"Prevents desktop hijack from non-admin hosts.","effort":"Medium — firewall rule + password rotation."},
    {"priority":4,"title":"Sample recommendation: Identify the unknown device","impact":"Closes a visibility gap in the asset inventory.","effort":"Low — MAC OUI lookup, ~10 minutes."}
  ],
  "methodology": [
    {"phase":"1","name":"Host Discovery","tool":"nmap -sn (sample)","hosts":512,"result":"12 live (sample)"},
    {"phase":"2","name":"Service Fingerprint","tool":"nmap -sV -sC (sample)","hosts":12,"result":"sample services mapped"},
    {"phase":"3","name":"Vulnerability Scripts","tool":"nmap --script vuln (sample)","hosts":7,"result":"5 sample findings"},
    {"phase":"4","name":"Focused Follow-up","tool":"nmap -sC (sample)","hosts":2,"result":"sample follow-up complete"}
  ]
};
