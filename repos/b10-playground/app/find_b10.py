#!/usr/bin/env python3
"""
Targeted Minew B10 finder.

Scans for BLE devices and attempts to identify the B10 by:
1. Looking for service UUID 0000ffe1 (common Minew sensor service)
2. Looking for any device with "B10" or "Minew" in scan response name
3. Attempting to connect to candidates and read device name characteristic
4. Parsing Minew-format advertising data (acceleration, battery, device info)

Also does an active scan (requesting scan response) which may reveal
device names not visible in passive advertisement packets.
"""

import asyncio
import struct
import sys
from datetime import datetime
from bleak import BleakScanner, BleakClient

# Known Minew-related service UUIDs
MINEW_SERVICE_UUIDS = [
    "0000ffe1-0000-1000-8000-00805f9b34fb",  # Minew sensor data
    "0000fff0-0000-1000-8000-00805f9b34fb",  # Minew config
    "0000ffe0-0000-1000-8000-00805f9b34fb",  # Minew data
]

# Standard BLE GATT characteristics
DEVICE_NAME_UUID = "00002a00-0000-1000-8000-00805f9b34fb"
APPEARANCE_UUID = "00002a01-0000-1000-8000-00805f9b34fb"
MANUFACTURER_NAME_UUID = "00002a29-0000-1000-8000-00805f9b34fb"
MODEL_NUMBER_UUID = "00002a24-0000-1000-8000-00805f9b34fb"
FIRMWARE_UUID = "00002a26-0000-1000-8000-00805f9b34fb"
HARDWARE_UUID = "00002a27-0000-1000-8000-00805f9b34fb"
BATTERY_LEVEL_UUID = "00002a19-0000-1000-8000-00805f9b34fb"

def parse_minew_service_data(data: bytes) -> dict:
    """Parse Minew-format service data from ffe1 UUID."""
    result = {
        'raw_hex': data.hex(),
        'length': len(data)
    }

    if len(data) < 2:
        return result

    # Minew frame type is typically the first byte
    frame_type = data[0]
    result['frame_type'] = hex(frame_type)

    # Minew info frame (0xA1) — device info + battery
    if frame_type == 0xA1 and len(data) >= 8:
        result['type'] = 'Minew Info'
        # Battery percentage is often at byte 1
        result['battery_pct'] = data[1]
        # Remaining bytes may contain MAC, firmware version, etc.
        if len(data) >= 8:
            result['info_data'] = data[2:].hex()

    # Minew accelerometer frame (0xA2 or varies by config)
    elif frame_type == 0xA2 and len(data) >= 8:
        result['type'] = 'Minew Accelerometer'
        # Accelerometer data typically starts after frame type + header
        try:
            if len(data) >= 8:
                x = struct.unpack('<h', data[2:4])[0]
                y = struct.unpack('<h', data[4:6])[0]
                z = struct.unpack('<h', data[6:8])[0]
                result['accel_x_mg'] = x
                result['accel_y_mg'] = y
                result['accel_z_mg'] = z
        except:
            pass

    # iBeacon-like frame or other Minew format
    else:
        # Try multiple known Minew data layouts
        # Some Minew devices put battery at offset 1, accel at later offsets
        if len(data) >= 3:
            result['byte_0'] = hex(data[0])
            result['byte_1'] = hex(data[1]) if len(data) > 1 else None
            result['byte_2'] = hex(data[2]) if len(data) > 2 else None

        # Look for accelerometer-like data patterns
        if len(data) >= 14:
            # Try parsing as: [type][battery][reserved][x_lo][x_hi][y_lo][y_hi][z_lo][z_hi]...
            for offset in [2, 4, 6, 8]:
                if offset + 6 <= len(data):
                    try:
                        x = struct.unpack('<h', data[offset:offset+2])[0]
                        y = struct.unpack('<h', data[offset+2:offset+4])[0]
                        z = struct.unpack('<h', data[offset+4:offset+6])[0]
                        # Plausible accelerometer if magnitude is near 1g (1000mg)
                        import math
                        mag = math.sqrt(x*x + y*y + z*z)
                        if 500 < mag < 2000:
                            result[f'accel_at_offset_{offset}'] = {
                                'x_mg': x, 'y_mg': y, 'z_mg': z,
                                'magnitude_mg': round(mag, 1)
                            }
                    except:
                        pass

    return result


async def scan_and_identify(duration: int = 20):
    """Scan, identify candidates, and attempt connection."""

    print(f"╔══════════════════════════════════════════════════════════╗")
    print(f"║       Minew B10 Targeted Finder                        ║")
    print(f"║       Known MAC: AC:23:3F:AF:50:74                     ║")
    print(f"║       Scanning for {duration} seconds (active scan)...         ║")
    print(f"╚══════════════════════════════════════════════════════════╝")
    print()

    candidates = {}

    def callback(device, adv_data):
        addr = device.address
        name = adv_data.local_name or device.name
        rssi = adv_data.rssi

        is_candidate = False
        reasons = []

        # Check name
        if name and any(p in str(name) for p in ["B10", "Minew", "minew"]):
            is_candidate = True
            reasons.append(f"Name contains match: '{name}'")

        # Check service UUIDs
        if adv_data.service_uuids:
            for uuid in adv_data.service_uuids:
                if uuid.lower() in [u.lower() for u in MINEW_SERVICE_UUIDS]:
                    is_candidate = True
                    reasons.append(f"Minew service UUID: {uuid}")

        # Check service data keys
        if adv_data.service_data:
            for uuid in adv_data.service_data:
                if 'ffe1' in uuid.lower() or 'ffe0' in uuid.lower() or 'fff0' in uuid.lower():
                    is_candidate = True
                    reasons.append(f"Minew service data UUID: {uuid}")

        if is_candidate or (addr in candidates):
            if addr not in candidates:
                candidates[addr] = {
                    'name': name,
                    'rssi': rssi,
                    'address': addr,
                    'reasons': reasons,
                    'manufacturer_data': {},
                    'service_data': {},
                    'service_uuids': [],
                    'seen_count': 0,
                    'adv_history': []
                }

            c = candidates[addr]
            c['seen_count'] += 1
            c['rssi'] = rssi
            if name:
                c['name'] = name
            c['reasons'] = list(set(c['reasons'] + reasons))

            if adv_data.manufacturer_data:
                for cid, data in adv_data.manufacturer_data.items():
                    c['manufacturer_data'][cid] = data

            if adv_data.service_data:
                for uuid, data in adv_data.service_data.items():
                    c['service_data'][uuid] = data
                    # Store history of service data (may change with accel)
                    c['adv_history'].append({
                        'time': datetime.now().isoformat(),
                        'uuid': uuid,
                        'data': data.hex()
                    })

            if adv_data.service_uuids:
                c['service_uuids'] = list(set(c['service_uuids'] + adv_data.service_uuids))

    scanner = BleakScanner(detection_callback=callback)
    await scanner.start()

    for i in range(duration):
        await asyncio.sleep(1)
        sys.stdout.write(f"\r  Scanning... {i+1}/{duration}s | {len(candidates)} candidates found")
        sys.stdout.flush()

    await scanner.stop()
    print("\n")

    if not candidates:
        print("  No Minew/B10 candidates found.")
        print("  Make sure the B10 is powered on and within range.")
        print("  Try pressing the SOS button to trigger active advertising.")
        return

    # Display candidates
    print(f"═══════════════════════════════════════════════════════════")
    print(f"  CANDIDATES FOUND: {len(candidates)}")
    print(f"═══════════════════════════════════════════════════════════")
    print()

    for addr, c in sorted(candidates.items(), key=lambda x: x[1]['rssi'], reverse=True):
        print(f"  ┌─────────────────────────────────────────────────────")
        print(f"  │ ★ {c['name'] or '(unnamed)'}")
        print(f"  │ Address: {c['address']}")
        print(f"  │ RSSI: {c['rssi']} dBm")
        print(f"  │ Packets: {c['seen_count']}")
        print(f"  │")
        print(f"  │ Why candidate:")
        for r in c['reasons']:
            print(f"  │   • {r}")

        # Parse service data
        if c['service_data']:
            for uuid, data in c['service_data'].items():
                print(f"  │")
                print(f"  │ Service Data (UUID: {uuid}):")
                print(f"  │   Raw: {data.hex()}")
                print(f"  │   Length: {len(data)} bytes")

                if 'ffe1' in uuid.lower():
                    parsed = parse_minew_service_data(data)
                    print(f"  │")
                    print(f"  │   ── Parsed Minew Data ──")
                    for k, v in parsed.items():
                        if k not in ('raw_hex', 'length'):
                            print(f"  │   {k}: {v}")

        # Manufacturer data
        if c['manufacturer_data']:
            for cid, data in c['manufacturer_data'].items():
                print(f"  │")
                print(f"  │ Manufacturer Data (Company: {hex(cid)}):")
                print(f"  │   Raw: {data.hex()}")

        # Service UUIDs
        if c['service_uuids']:
            print(f"  │")
            print(f"  │ Service UUIDs:")
            for uuid in c['service_uuids']:
                print(f"  │   {uuid}")

        # Show advertising data history (first 5 and last 5)
        if len(c['adv_history']) > 1:
            print(f"  │")
            print(f"  │ Advertising History ({len(c['adv_history'])} packets captured):")
            history = c['adv_history']
            show = history[:3] + history[-3:] if len(history) > 6 else history
            for h in show:
                print(f"  │   {h['time'][-12:]} | {h['uuid'][-8:]} | {h['data']}")

        print(f"  └─────────────────────────────────────────────────────")
        print()

    # Attempt to connect to candidates
    print(f"═══════════════════════════════════════════════════════════")
    print(f"  ATTEMPTING CONNECTIONS TO READ DEVICE INFO...")
    print(f"═══════════════════════════════════════════════════════════")
    print()

    for addr, c in candidates.items():
        print(f"  Connecting to {c['name'] or addr}...")
        try:
            async with BleakClient(addr, timeout=10) as client:
                if client.is_connected:
                    print(f"  ✓ Connected!")
                    print()

                    # Read standard characteristics
                    chars_to_read = [
                        ("Device Name", DEVICE_NAME_UUID),
                        ("Manufacturer", MANUFACTURER_NAME_UUID),
                        ("Model Number", MODEL_NUMBER_UUID),
                        ("Firmware", FIRMWARE_UUID),
                        ("Hardware", HARDWARE_UUID),
                        ("Battery Level", BATTERY_LEVEL_UUID),
                    ]

                    for char_name, char_uuid in chars_to_read:
                        try:
                            data = await client.read_gatt_char(char_uuid)
                            if char_uuid == BATTERY_LEVEL_UUID:
                                print(f"    {char_name}: {data[0]}%")
                            else:
                                print(f"    {char_name}: {data.decode('utf-8', errors='replace')}")
                        except Exception as e:
                            pass  # Characteristic not available

                    # List all services and characteristics
                    print()
                    print(f"    All Services & Characteristics:")
                    for service in client.services:
                        print(f"      Service: {service.uuid} ({service.description or 'Unknown'})")
                        for char in service.characteristics:
                            props = ', '.join(char.properties)
                            print(f"        Char: {char.uuid} [{props}]")
                            if 'read' in char.properties:
                                try:
                                    val = await client.read_gatt_char(char.uuid)
                                    if len(val) <= 20:
                                        # Try as string first, then hex
                                        try:
                                            text = val.decode('utf-8')
                                            if text.isprintable():
                                                print(f"          Value: '{text}'")
                                            else:
                                                print(f"          Value: {val.hex()}")
                                        except:
                                            print(f"          Value: {val.hex()}")
                                    else:
                                        print(f"          Value ({len(val)} bytes): {val[:20].hex()}...")
                                except:
                                    print(f"          (could not read)")

                    print()

        except asyncio.TimeoutError:
            print(f"  ✗ Connection timed out — device may not accept connections, or may be out of range")
            print()
        except Exception as e:
            print(f"  ✗ Connection failed: {e}")
            print()


if __name__ == '__main__':
    duration = int(sys.argv[1]) if len(sys.argv) > 1 else 20
    asyncio.run(scan_and_identify(duration))
