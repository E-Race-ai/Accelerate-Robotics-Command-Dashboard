#!/usr/bin/env python3
"""
Minew B10 Beacon — Continuous Data Parser

Now that we've identified the B10 (service UUID ffe1, MAC AC:23:3F:AF:50:74
embedded in service data), this script continuously monitors its broadcasts
and parses all available data.

The B10 can advertise up to 6 channels:
- iBeacon
- Eddystone UID
- Eddystone URL
- Eddystone TLM
- Accelerometer data
- Device info (with MAC and battery)
"""

import asyncio
import struct
import sys
import math
from datetime import datetime
from bleak import BleakScanner

# The B10's macOS-randomized address (may change between scans)
# We identify it by the MAC in service data: AC233FAF5074
B10_MAC_BYTES = bytes.fromhex("ac233faf5074")
B10_MAC_STR = "AC:23:3F:AF:50:74"

# Service UUID the B10 advertises on
B10_SERVICE_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb"

def contains_b10_mac(data: bytes) -> bool:
    """Check if the data contains the B10's MAC address (in any byte order)."""
    mac = bytes.fromhex("ac233faf5074")
    mac_rev = bytes(reversed(mac))
    # Check various byte orderings
    return mac in data or mac_rev in data or b'\xaf\x3f\x23\xac' in data

def parse_b10_frame(data: bytes) -> dict:
    """Parse a Minew B10 service data frame."""
    result = {
        'raw_hex': data.hex(),
        'length': len(data),
        'timestamp': datetime.now().strftime('%H:%M:%S.%f')[:-3]
    }

    if len(data) < 2:
        return result

    frame_type = data[0]
    result['frame_type'] = hex(frame_type)

    # === Minew Info Frame (0xA1) ===
    # Format: [type:1][battery:1][...][mac:6][name:var]
    if frame_type == 0xA1:
        result['type'] = 'Device Info'
        if len(data) >= 2:
            result['battery_pct'] = data[1]

        # Look for MAC address in the data
        for i in range(2, len(data) - 5):
            chunk = data[i:i+4]
            if chunk == b'\xaf\x3f\x23\xac' or chunk == bytes.fromhex("7450af3f"):
                # Found MAC fragment — extract full MAC
                if i >= 2 and i + 6 <= len(data):
                    mac_start = max(0, i - 2)
                    mac_bytes = data[mac_start:mac_start + 6]
                    result['mac_fragment'] = mac_bytes.hex()
                break

        # Look for ASCII name at end of data
        for i in range(len(data) - 3, 0, -1):
            try:
                tail = data[i:].decode('ascii')
                if tail.isprintable() and len(tail) >= 2:
                    result['device_name'] = tail
                    break
            except:
                continue

        # Parse remaining bytes
        if len(data) > 2:
            result['payload'] = data[2:].hex()

    # === Minew Accelerometer Frame (0xA2) ===
    elif frame_type == 0xA2:
        result['type'] = 'Accelerometer'
        # Try different known Minew accel data layouts
        if len(data) >= 8:
            # Layout 1: [type][battery][x_lo][x_hi][y_lo][y_hi][z_lo][z_hi]
            try:
                x = struct.unpack('<h', data[2:4])[0]
                y = struct.unpack('<h', data[4:6])[0]
                z = struct.unpack('<h', data[6:8])[0]
                mag = math.sqrt(x*x + y*y + z*z)
                result['accel'] = {
                    'x_mg': x, 'y_mg': y, 'z_mg': z,
                    'magnitude_mg': round(mag, 1)
                }
                # Estimate orientation from gravity vector
                if mag > 0:
                    result['orientation'] = {
                        'pitch_deg': round(math.degrees(math.asin(min(1, max(-1, x / mag)))), 1),
                        'roll_deg': round(math.degrees(math.asin(min(1, max(-1, y / mag)))), 1),
                    }
            except:
                pass

    # === iBeacon-like Frame ===
    elif frame_type == 0x02 and len(data) >= 22:
        result['type'] = 'iBeacon'
        try:
            uuid_bytes = data[2:18]
            uuid = '-'.join([
                uuid_bytes[0:4].hex(), uuid_bytes[4:6].hex(),
                uuid_bytes[6:8].hex(), uuid_bytes[8:10].hex(),
                uuid_bytes[10:16].hex()
            ]).upper()
            result['uuid'] = uuid
            result['major'] = struct.unpack('>H', data[18:20])[0]
            result['minor'] = struct.unpack('>H', data[20:22])[0]
            if len(data) > 22:
                result['tx_power'] = struct.unpack('b', data[22:23])[0]
        except:
            pass

    # === Unknown frame — dump everything ===
    else:
        result['type'] = f'Unknown (0x{frame_type:02x})'
        # Try to find useful patterns
        if len(data) >= 8:
            # Try accel at various offsets
            for offset in range(1, min(len(data) - 5, 10)):
                try:
                    x = struct.unpack('<h', data[offset:offset+2])[0]
                    y = struct.unpack('<h', data[offset+2:offset+4])[0]
                    z = struct.unpack('<h', data[offset+4:offset+6])[0]
                    mag = math.sqrt(x*x + y*y + z*z)
                    if 800 < mag < 1200:  # Near 1g
                        result[f'possible_accel_at_{offset}'] = {
                            'x': x, 'y': y, 'z': z, 'mag': round(mag)
                        }
                except:
                    pass

    return result


async def monitor_b10(duration: int = 60):
    """Continuously monitor B10 beacon broadcasts."""

    print(f"╔══════════════════════════════════════════════════════════╗")
    print(f"║       Minew B10 Continuous Monitor                     ║")
    print(f"║       Target MAC: {B10_MAC_STR}                    ║")
    print(f"║       Monitoring for {duration} seconds...                     ║")
    print(f"╚══════════════════════════════════════════════════════════╝")
    print()

    b10_address = None
    frame_count = 0
    frame_types_seen = set()

    def callback(device, adv_data):
        nonlocal b10_address, frame_count

        # Check if this is the B10 by looking for its MAC in service data
        if adv_data.service_data:
            for uuid, data in adv_data.service_data.items():
                if 'ffe1' in uuid.lower() and contains_b10_mac(data):
                    b10_address = device.address

        # Also match by previously identified address
        if device.address == b10_address:
            frame_count += 1

            # Parse all service data frames
            if adv_data.service_data:
                for uuid, data in adv_data.service_data.items():
                    parsed = parse_b10_frame(data)
                    frame_type = parsed.get('type', 'Unknown')
                    frame_types_seen.add(frame_type)

                    ts = parsed['timestamp']
                    rssi = adv_data.rssi

                    print(f"  [{ts}] RSSI: {rssi:>4} dBm | Frame #{frame_count} | Type: {frame_type}")
                    print(f"           Raw: {parsed['raw_hex']}")

                    # Print parsed fields
                    for k, v in parsed.items():
                        if k not in ('raw_hex', 'length', 'timestamp', 'frame_type', 'type'):
                            if isinstance(v, dict):
                                print(f"           {k}:")
                                for kk, vv in v.items():
                                    print(f"             {kk}: {vv}")
                            else:
                                print(f"           {k}: {v}")
                    print()

            # Also capture manufacturer data if present
            if adv_data.manufacturer_data:
                for cid, data in adv_data.manufacturer_data.items():
                    if cid == 0x004C and len(data) >= 23:  # iBeacon
                        parsed = parse_b10_frame(bytes([0x02]) + data)
                        if parsed.get('type') == 'iBeacon':
                            ts = datetime.now().strftime('%H:%M:%S.%f')[:-3]
                            print(f"  [{ts}] RSSI: {adv_data.rssi:>4} dBm | Frame #{frame_count} | Type: iBeacon (MfrData)")
                            for k, v in parsed.items():
                                if k not in ('raw_hex', 'length', 'timestamp', 'frame_type', 'type'):
                                    print(f"           {k}: {v}")
                            print()

    scanner = BleakScanner(detection_callback=callback)
    await scanner.start()

    try:
        for i in range(duration):
            await asyncio.sleep(1)
            if i % 10 == 9:
                status = f"B10 {'FOUND' if b10_address else 'searching...'}"
                print(f"  --- {i+1}/{duration}s | {status} | {frame_count} frames | Types seen: {frame_types_seen or 'none yet'} ---")
                print()
    except KeyboardInterrupt:
        print("\n  Stopped by user.")

    await scanner.stop()

    print()
    print(f"═══════════════════════════════════════════════════════════")
    print(f"  MONITORING COMPLETE")
    print(f"  B10 Address: {b10_address or 'Not found'}")
    print(f"  Total frames captured: {frame_count}")
    print(f"  Frame types seen: {frame_types_seen or 'None'}")
    print(f"═══════════════════════════════════════════════════════════")


if __name__ == '__main__':
    duration = int(sys.argv[1]) if len(sys.argv) > 1 else 60
    asyncio.run(monitor_b10(duration))
