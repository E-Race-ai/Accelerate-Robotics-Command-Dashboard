#!/usr/bin/env python3
"""
Minew B10 BLE Beacon Scanner

Scans for nearby BLE devices, identifies Minew B10 beacons,
and parses their broadcast data including:
- iBeacon data (UUID, major, minor)
- Eddystone data (UID, URL, TLM)
- Accelerometer data (X, Y, Z)
- Battery level
- Device name and signal strength (RSSI)
"""

import asyncio
import struct
import sys
from datetime import datetime
from bleak import BleakScanner

# Minew B10 may advertise as "B10" or contain "Minew" in name
# Also look for any iBeacon or device with accelerometer data
MINEW_PATTERNS = ["B10", "Minew", "minew", "MINEW"]

# iBeacon prefix: 0x0215 after Apple company ID 0x004C
IBEACON_COMPANY_ID = 0x004C
IBEACON_PREFIX = bytes([0x02, 0x15])

# Eddystone Service UUID
EDDYSTONE_UUID = "0000feaa-0000-1000-8000-00805f9b34fb"

def parse_ibeacon(mfr_data: bytes) -> dict:
    """Parse iBeacon data from manufacturer-specific data."""
    if len(mfr_data) < 23:
        return None
    if mfr_data[0:2] != IBEACON_PREFIX:
        return None

    uuid_bytes = mfr_data[2:18]
    uuid = '-'.join([
        uuid_bytes[0:4].hex(),
        uuid_bytes[4:6].hex(),
        uuid_bytes[6:8].hex(),
        uuid_bytes[8:10].hex(),
        uuid_bytes[10:16].hex()
    ]).upper()

    major = struct.unpack('>H', mfr_data[18:20])[0]
    minor = struct.unpack('>H', mfr_data[20:22])[0]
    tx_power = struct.unpack('b', mfr_data[22:23])[0]

    return {
        'uuid': uuid,
        'major': major,
        'minor': minor,
        'tx_power': tx_power
    }

def parse_eddystone(service_data: bytes) -> dict:
    """Parse Eddystone frame from service data."""
    if len(service_data) < 2:
        return None

    frame_type = service_data[0]
    result = {'frame_type': hex(frame_type)}

    if frame_type == 0x00:  # Eddystone-UID
        if len(service_data) >= 18:
            result['type'] = 'UID'
            result['tx_power'] = struct.unpack('b', service_data[1:2])[0]
            result['namespace'] = service_data[2:12].hex().upper()
            result['instance'] = service_data[12:18].hex().upper()

    elif frame_type == 0x10:  # Eddystone-URL
        result['type'] = 'URL'
        result['tx_power'] = struct.unpack('b', service_data[1:2])[0]
        url_schemes = ['http://www.', 'https://www.', 'http://', 'https://']
        scheme_idx = service_data[2]
        if scheme_idx < len(url_schemes):
            url = url_schemes[scheme_idx]
            url += service_data[3:].decode('ascii', errors='replace')
            result['url'] = url

    elif frame_type == 0x20:  # Eddystone-TLM
        result['type'] = 'TLM'
        if len(service_data) >= 14:
            result['version'] = service_data[1]
            result['battery_mv'] = struct.unpack('>H', service_data[2:4])[0]
            temp_raw = struct.unpack('>h', service_data[4:6])[0]
            result['temperature_c'] = temp_raw / 256.0
            result['adv_count'] = struct.unpack('>I', service_data[6:10])[0]
            result['uptime_sec'] = struct.unpack('>I', service_data[10:14])[0] / 10.0

    return result

def parse_accelerometer(data: bytes) -> dict:
    """Try to parse accelerometer data from various Minew formats."""
    result = {}

    # Minew accelerometer data is typically 3x int16 (X, Y, Z) in mg
    # The exact format depends on the beacon's configuration
    if len(data) >= 6:
        try:
            x = struct.unpack('<h', data[0:2])[0]
            y = struct.unpack('<h', data[2:4])[0]
            z = struct.unpack('<h', data[4:6])[0]
            result['x_mg'] = x
            result['y_mg'] = y
            result['z_mg'] = z
            # Calculate approximate tilt angle from gravity vector
            import math
            magnitude = math.sqrt(x*x + y*y + z*z)
            if magnitude > 0:
                result['magnitude_mg'] = round(magnitude, 1)
        except:
            pass

    return result

def parse_manufacturer_data(company_id: int, data: bytes) -> dict:
    """Parse manufacturer-specific data."""
    result = {
        'company_id': hex(company_id),
        'raw_hex': data.hex(),
        'length': len(data)
    }

    # Apple iBeacon
    if company_id == IBEACON_COMPANY_ID:
        ibeacon = parse_ibeacon(data)
        if ibeacon:
            result['ibeacon'] = ibeacon

    return result

def is_potential_minew(name, address, mfr_data):
    """Check if this device might be a Minew B10."""
    if name:
        for pattern in MINEW_PATTERNS:
            if pattern in str(name):
                return True
    return False

async def scan_for_b10(duration: int = 15):
    """Scan for BLE devices and identify Minew B10 beacons."""

    print(f"╔══════════════════════════════════════════════════════════╗")
    print(f"║       Minew B10 BLE Beacon Scanner                     ║")
    print(f"║       Scanning for {duration} seconds...                       ║")
    print(f"╚══════════════════════════════════════════════════════════╝")
    print()

    all_devices = {}
    b10_candidates = []

    def detection_callback(device, advertisement_data):
        """Called for each detected BLE device."""
        addr = device.address
        name = advertisement_data.local_name or device.name
        rssi = advertisement_data.rssi

        if addr not in all_devices:
            all_devices[addr] = {
                'name': name,
                'rssi': rssi,
                'address': addr,
                'manufacturer_data': {},
                'service_data': {},
                'service_uuids': [],
                'seen_count': 0,
                'first_seen': datetime.now(),
            }

        entry = all_devices[addr]
        entry['seen_count'] += 1
        entry['rssi'] = rssi  # Update to latest RSSI
        entry['last_seen'] = datetime.now()

        if name:
            entry['name'] = name

        # Capture manufacturer data
        if advertisement_data.manufacturer_data:
            for company_id, data in advertisement_data.manufacturer_data.items():
                entry['manufacturer_data'][company_id] = data

        # Capture service data
        if advertisement_data.service_data:
            for uuid, data in advertisement_data.service_data.items():
                entry['service_data'][uuid] = data

        # Capture service UUIDs
        if advertisement_data.service_uuids:
            entry['service_uuids'] = list(set(entry['service_uuids'] + advertisement_data.service_uuids))

    # Start scanning
    scanner = BleakScanner(detection_callback=detection_callback)
    await scanner.start()

    # Show progress
    for i in range(duration):
        await asyncio.sleep(1)
        device_count = len(all_devices)
        b10_count = sum(1 for d in all_devices.values() if is_potential_minew(d['name'], d['address'], d['manufacturer_data']))
        sys.stdout.write(f"\r  Scanning... {i+1}/{duration}s | {device_count} devices found | {b10_count} potential B10 matches")
        sys.stdout.flush()

    await scanner.stop()
    print("\n")

    # Analyze results
    print(f"═══════════════════════════════════════════════════════════")
    print(f"  SCAN COMPLETE — {len(all_devices)} devices detected")
    print(f"═══════════════════════════════════════════════════════════")
    print()

    # First, show potential Minew B10 devices
    b10_found = False
    for addr, device in sorted(all_devices.items(), key=lambda x: x[1]['rssi'], reverse=True):
        if is_potential_minew(device['name'], addr, device['manufacturer_data']):
            b10_found = True
            print_device_detail(device, is_b10=True)

    if not b10_found:
        print("  ⚠  No device with 'B10' or 'Minew' in its name was found.")
        print()
        print("  The B10 may advertise without a name, or with a different name.")
        print("  Showing all devices with manufacturer data or strong signal:")
        print()

        # Show devices that have manufacturer data or iBeacon data (sorted by RSSI)
        shown = 0
        for addr, device in sorted(all_devices.items(), key=lambda x: x[1]['rssi'], reverse=True):
            if device['manufacturer_data'] or device['service_data'] or device['rssi'] > -70:
                print_device_detail(device, is_b10=False)
                shown += 1
                if shown >= 20:
                    remaining = len(all_devices) - shown
                    print(f"  ... and {remaining} more devices (weaker signal)")
                    break

    # Summary of all devices
    print()
    print(f"═══════════════════════════════════════════════════════════")
    print(f"  ALL DETECTED DEVICES (sorted by signal strength)")
    print(f"═══════════════════════════════════════════════════════════")
    print()
    print(f"  {'RSSI':>5}  {'Name':<30} {'Address':<20} {'Packets'}")
    print(f"  {'─'*5}  {'─'*30} {'─'*20} {'─'*7}")
    for addr, device in sorted(all_devices.items(), key=lambda x: x[1]['rssi'], reverse=True):
        name = device['name'] or '(unnamed)'
        rssi = device['rssi']
        count = device['seen_count']
        marker = " ◄ POTENTIAL B10" if is_potential_minew(device['name'], addr, device['manufacturer_data']) else ""
        print(f"  {rssi:>5}  {name:<30} {addr:<20} {count:>4}{marker}")


def print_device_detail(device: dict, is_b10: bool = False):
    """Print detailed information about a device."""
    name = device['name'] or '(unnamed)'
    marker = "★ POTENTIAL MINEW B10" if is_b10 else ""

    print(f"  ┌─────────────────────────────────────────────────────")
    print(f"  │ {marker} {name}")
    print(f"  │ Address: {device['address']}")
    print(f"  │ RSSI: {device['rssi']} dBm")
    print(f"  │ Packets seen: {device['seen_count']}")

    # Manufacturer data
    if device['manufacturer_data']:
        for company_id, data in device['manufacturer_data'].items():
            parsed = parse_manufacturer_data(company_id, data)
            print(f"  │")
            print(f"  │ Manufacturer Data (Company: {parsed['company_id']}):")
            print(f"  │   Raw: {parsed['raw_hex']}")
            print(f"  │   Length: {parsed['length']} bytes")

            if 'ibeacon' in parsed:
                ib = parsed['ibeacon']
                print(f"  │")
                print(f"  │   ── iBeacon ──")
                print(f"  │   UUID:     {ib['uuid']}")
                print(f"  │   Major:    {ib['major']}")
                print(f"  │   Minor:    {ib['minor']}")
                print(f"  │   TX Power: {ib['tx_power']} dBm")

            # Try to find accelerometer data in non-iBeacon manufacturer data
            if company_id != IBEACON_COMPANY_ID and len(data) >= 6:
                accel = parse_accelerometer(data)
                if accel:
                    print(f"  │")
                    print(f"  │   ── Possible Accelerometer Data ──")
                    print(f"  │   X: {accel.get('x_mg', '?')} mg")
                    print(f"  │   Y: {accel.get('y_mg', '?')} mg")
                    print(f"  │   Z: {accel.get('z_mg', '?')} mg")
                    if 'magnitude_mg' in accel:
                        print(f"  │   Magnitude: {accel['magnitude_mg']} mg")

    # Service data (Eddystone, KSensor, etc.)
    if device['service_data']:
        for uuid, data in device['service_data'].items():
            print(f"  │")
            print(f"  │ Service Data (UUID: {uuid}):")
            print(f"  │   Raw: {data.hex()}")
            print(f"  │   Length: {len(data)} bytes")

            # Parse Eddystone
            if 'feaa' in uuid.lower():
                eddy = parse_eddystone(data)
                if eddy:
                    print(f"  │")
                    print(f"  │   ── Eddystone {eddy.get('type', 'Unknown')} ──")
                    if eddy.get('type') == 'UID':
                        print(f"  │   Namespace: {eddy['namespace']}")
                        print(f"  │   Instance:  {eddy['instance']}")
                        print(f"  │   TX Power:  {eddy['tx_power']} dBm")
                    elif eddy.get('type') == 'URL':
                        print(f"  │   URL: {eddy.get('url', '?')}")
                    elif eddy.get('type') == 'TLM':
                        print(f"  │   Battery:     {eddy['battery_mv']} mV")
                        print(f"  │   Temperature: {eddy['temperature_c']:.1f} °C")
                        print(f"  │   Adv Count:   {eddy['adv_count']}")
                        print(f"  │   Uptime:      {eddy['uptime_sec']:.1f} s")

    # Service UUIDs
    if device['service_uuids']:
        print(f"  │")
        print(f"  │ Service UUIDs:")
        for uuid in device['service_uuids']:
            print(f"  │   {uuid}")

    print(f"  └─────────────────────────────────────────────────────")
    print()


if __name__ == '__main__':
    duration = int(sys.argv[1]) if len(sys.argv) > 1 else 15
    asyncio.run(scan_for_b10(duration))
