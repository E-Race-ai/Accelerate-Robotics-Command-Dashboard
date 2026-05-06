# WiFi Requirements

The single most reliable way to break a robot deployment is the WiFi situation. This is the playbook for getting it right.

## Hard constraint: 2.4 GHz required

**All Keenon robots (C30, W3, T8) are 2.4 GHz WiFi only. No 5 GHz support.**

If the site's WiFi is 5 GHz-only, the robots cannot join it. Period. You must either:

1. Enable the 2.4 GHz band on the existing APs
2. Add a dedicated 2.4 GHz SSID for robots
3. Provision a separate robot network

**Verify before the robot ships to site** by asking the facility's IT team for:
- List of SSIDs advertised on the robot's intended area
- Which bands each SSID uses (802.11 b/g/n vs. a/ac/ax)
- Signal strength map if available

## Hard constraint: No captive portals

Hospital and hotel WiFi frequently has captive portals — you join the SSID, open a browser, and click "I agree" before traffic flows. **Robots can't do this.**

Workarounds, in order of preference:

1. **MAC address pre-authorization** — ask IT to add the robot's WiFi MAC (from the sticker or `adb shell ip addr`) to the network's allow-list
2. **Dedicated robot SSID** — a separate SSID with no captive portal
3. **Static IP + no auth** — sometimes available on guest networks with "devices" or "IoT" classification
4. **Cellular fallback** — Keenon W3 supports 4G LTE; last resort but works

## SSID strategy at Thesis Hotel and similar sites

At the Thesis Hotel and similar properties, the right pattern is:

- **Dedicated SSID:** `accel-robots` or similar
- **Band:** 2.4 GHz, 802.11b/g/n
- **Auth:** WPA2-PSK with a long rotating password
- **Captive portal:** disabled
- **DHCP:** enabled, with static reservations for known robots
- **Isolation:** robots can see the Accelerate Cloud but cannot reach guest or administrative networks

## Signal strength

Keenon C30 telemetry reports WiFi RSSI in the system status screen. Useful thresholds:

| RSSI | Status | Action |
|---|---|---|
| -30 to -50 dBm | Excellent | Normal operation |
| -50 to -67 dBm | Good | Normal operation |
| -67 to -74 dBm | Fair | Watch for disconnects; may need additional AP |
| -74 to -85 dBm | Marginal | Likely to drop under load; add AP coverage |
| Below -85 dBm | Unusable | Deploy will fail |

The cached robot status at Thesis Hotel reported RSSI around -74 dBm — that's the edge of acceptable. We should plan for at least one additional 2.4 GHz AP if we expand coverage to corners of the building.

## Cellular fallback (W3 only)

The Keenon W3 has 4G LTE with extensive band support. If WiFi is unreliable, it will switch to cellular. This is fine for backup but:

- Cellular data costs money (SIM plan required)
- Hospital basement floors and shafts often have no cellular signal
- Latency is higher than WiFi — noticeable in interactive mode

Do not design the deployment to depend on cellular. WiFi first.

## Troubleshooting

### Robot shows "connected" but can't reach cloud

Almost always a captive portal. Open a browser on any device and see if you're blocked by a login page. If so, fix the network, don't fight it.

### Robot drops WiFi intermittently

- Check RSSI at the drop location — if below -74, add AP coverage
- Check for 2.4 GHz interference (microwaves, legacy cordless phones, crowded channels)
- Check if the AP is load-shedding older clients when it gets busy

### New floor, new WiFi zone

Keenon's floor mapping stays in the robot. WiFi needs to cover every spot on the map. Before expanding coverage, survey RSSI throughout the new area.

## Related

- [`network-topology.md`](network-topology.md) — recommended robot subnet layout
- [`../robots/keenon-c30.md`](../robots/keenon-c30.md) — C30 radio specs
- [`../robots/keenon-w3.md`](../robots/keenon-w3.md) — W3 radio + cellular specs
- [`../../40-deployments/thesis-hotel/site-survey.md`](../../40-deployments/thesis-hotel/site-survey.md) — Thesis Hotel WiFi status
