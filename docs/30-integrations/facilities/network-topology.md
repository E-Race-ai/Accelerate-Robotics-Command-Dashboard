# Network Topology

Recommended network layout for a robot deployment site. Based on what we learn from Thesis Hotel — update as the pattern evolves.

## Goals

1. Robots can reach the Accelerate Cloud and the Keenon Cloud
2. Robots **cannot** reach guest or administrative networks (isolation)
3. Robots **can** reach each other for local coordination
4. IT has full visibility into robot network activity

## Subnet layout

```
Building WAN
    │
    ▼
Router / Firewall
    │
    ├── VLAN 10 — Guest WiFi (hotel guests)              [isolated]
    ├── VLAN 20 — Staff / administrative                  [isolated]
    ├── VLAN 30 — Robots (this deployment)                [egress to cloud only]
    │     │
    │     ├── 2.4 GHz APs: SSID "accel-robots"
    │     ├── DHCP range: 192.168.30.100–200
    │     ├── Static reservations: 192.168.30.10–99
    │     └── Default gateway: 192.168.30.1
    │
    └── VLAN 40 — Facility systems (elevators, HVAC)      [isolated]
```

## Firewall rules for VLAN 30 (robots)

**Allow outbound:**
- DNS (53 UDP/TCP) to operator DNS or 1.1.1.1 / 8.8.8.8
- NTP (123 UDP) to pool.ntp.org
- HTTPS (443) to Accelerate Cloud hostnames (TBD)
- HTTPS (443) to Keenon Cloud hostnames (`*.keenon.com`, `*.dynasky.com`)
- MQTT TLS (8883) to Accelerate broker
- LoRa gateway traffic if local (not routed)

**Deny outbound:**
- RFC1918 destinations except other robots on VLAN 30
- All other ports

**Allow inbound:**
- Nothing from the internet
- SSH (22) from management VLAN for debugging
- HTTP (80) from management VLAN for robot web UIs

## DNS

Robots should resolve through the operator's DNS or a fast public resolver. Avoid the building's default DNS if it does NXDOMAIN hijacking or captive-portal redirection.

Captive portals commonly use DNS rewriting to force the login page. This breaks robots that don't have a browser. Either:
- Use 1.1.1.1 / 8.8.8.8 explicitly on the robot
- Or bypass the captive portal via MAC pre-auth (see [`wifi-requirements.md`](wifi-requirements.md))

## DHCP vs static

- **DHCP** is fine for robots in steady-state operation — reservations by MAC give stable IPs.
- **Static** is required for any robot participating in elevator integration, because the E-Box master needs known endpoints.

## Physical AP placement

- Every floor in the robot operation zone needs ≥ -67 dBm coverage
- Elevator shafts are dead zones by design — don't rely on WiFi inside a shaft; use LoRa for shaft comms
- APs should be 2.4 GHz-capable AND have it enabled (many modern APs default 5 GHz only)

## Security

- Never put robots on the same VLAN as staff devices
- Never give robots access to patient data networks (HIPAA-adjacent networks need explicit firewall rules)
- Rotate the robot SSID PSK quarterly
- Log all outbound robot traffic for audit

## For Thesis Hotel specifically

See [`../../40-deployments/thesis-hotel/site-survey.md`](../../40-deployments/thesis-hotel/site-survey.md) for the current network state at the pilot site.

## Related

- [`wifi-requirements.md`](wifi-requirements.md) — 2.4 GHz, captive portals, RSSI
- [`../elevator/keenon-ebox.md`](../elevator/keenon-ebox.md) — E-Box network needs
