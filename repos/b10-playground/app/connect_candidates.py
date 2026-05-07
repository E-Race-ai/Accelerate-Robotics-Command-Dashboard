#!/usr/bin/env python3
"""
Broad BLE scanner that captures ALL devices with service data or
manufacturer data, then attempts to connect to each one to read
the device name and identify the B10.

The B10 may not advertise its name in the standard advertisement
packet — it may only be readable after connecting.
"""

import asyncio
import sys
from bleak import BleakScanner, BleakClient

DEVICE_NAME_UUID = "00002a00-0000-1000-8000-00805f9b34fb"
MANUFACTURER_NAME_UUID = "00002a29-0000-1000-8000-00805f9b34fb"
MODEL_NUMBER_UUID = "00002a24-0000-1000-8000-00805f9b34fb"
BATTERY_LEVEL_UUID = "00002a19-0000-1000-8000-00805f9b34fb"

async def main():
    print("Scanning for 15 seconds — capturing ALL advertising devices...")
    print()

    devices_with_data = {}

    def callback(device, adv_data):
        addr = device.address
        name = adv_data.local_name or device.name
        has_service_data = bool(adv_data.service_data)
        has_mfr_data = bool(adv_data.manufacturer_data)
        has_name = bool(name)
        rssi = adv_data.rssi

        # Capture any device that has service data, iBeacon, or a name
        if has_service_data or has_name or rssi > -65:
            if addr not in devices_with_data:
                devices_with_data[addr] = {
                    'name': name,
                    'rssi': rssi,
                    'service_data': {},
                    'mfr_data': {},
                    'uuids': [],
                    'count': 0
                }
            d = devices_with_data[addr]
            d['count'] += 1
            d['rssi'] = rssi
            if name:
                d['name'] = name
            if adv_data.service_data:
                for u, v in adv_data.service_data.items():
                    d['service_data'][u] = v.hex()
            if adv_data.manufacturer_data:
                for cid, v in adv_data.manufacturer_data.items():
                    d['mfr_data'][hex(cid)] = v.hex()
            if adv_data.service_uuids:
                d['uuids'] = list(set(d['uuids'] + adv_data.service_uuids))

    scanner = BleakScanner(detection_callback=callback)
    await scanner.start()
    for i in range(15):
        await asyncio.sleep(1)
        sys.stdout.write(f"\r  {i+1}/15s — {len(devices_with_data)} devices with data")
        sys.stdout.flush()
    await scanner.stop()
    print("\n")

    # Sort by signal strength
    sorted_devices = sorted(devices_with_data.items(), key=lambda x: x[1]['rssi'], reverse=True)

    print(f"Found {len(sorted_devices)} devices. Listing all with details:\n")

    for addr, d in sorted_devices:
        name_str = d['name'] or '(no name)'
        print(f"  [{d['rssi']:>4} dBm] {name_str:<25} {addr[:20]}  ({d['count']} pkts)")
        if d['service_data']:
            for u, v in d['service_data'].items():
                print(f"           SvcData {u[-8:]}: {v}")
        if d['mfr_data']:
            for cid, v in d['mfr_data'].items():
                label = "iBeacon" if cid == "0x4c" and len(v) > 40 else cid
                print(f"           MfrData {label}: {v[:40]}{'...' if len(v)>40 else ''}")
        if d['uuids']:
            for u in d['uuids']:
                print(f"           UUID: {u}")
        print()

    # Now try connecting to top candidates (non-Apple, with service data or strong signal)
    connect_targets = []
    for addr, d in sorted_devices:
        # Skip obvious Apple devices (company 0x4c with short data)
        is_apple_only = all(cid == '0x4c' for cid in d['mfr_data'].keys()) if d['mfr_data'] else False
        has_short_apple = is_apple_only and all(len(v) <= 18 for v in d['mfr_data'].values())

        if d['service_data'] or (not has_short_apple and d['rssi'] > -60):
            connect_targets.append((addr, d))

    if connect_targets:
        print(f"═════════════════════════════════════════════════════")
        print(f"  Attempting to connect to {len(connect_targets)} non-Apple candidates...")
        print(f"═════════════════════════════════════════════════════\n")

        for addr, d in connect_targets:
            name_str = d['name'] or '(no name)'
            print(f"  → Connecting to {name_str} ({addr[:20]}, {d['rssi']} dBm)...")
            try:
                async with BleakClient(addr, timeout=8) as client:
                    if client.is_connected:
                        # Read device name
                        try:
                            name_data = await client.read_gatt_char(DEVICE_NAME_UUID)
                            dev_name = name_data.decode('utf-8', errors='replace')
                            print(f"    ✓ Device Name: '{dev_name}'")
                        except:
                            print(f"    - Device Name: not readable")

                        try:
                            mfr_data = await client.read_gatt_char(MANUFACTURER_NAME_UUID)
                            print(f"    ✓ Manufacturer: '{mfr_data.decode('utf-8', errors='replace')}'")
                        except:
                            pass

                        try:
                            model_data = await client.read_gatt_char(MODEL_NUMBER_UUID)
                            print(f"    ✓ Model: '{model_data.decode('utf-8', errors='replace')}'")
                        except:
                            pass

                        try:
                            batt = await client.read_gatt_char(BATTERY_LEVEL_UUID)
                            print(f"    ✓ Battery: {batt[0]}%")
                        except:
                            pass

                        # List services
                        print(f"    Services:")
                        for svc in client.services:
                            print(f"      {svc.uuid}: {svc.description or '?'}")
                            for ch in svc.characteristics:
                                props = ','.join(ch.properties)
                                val_str = ""
                                if 'read' in ch.properties:
                                    try:
                                        val = await client.read_gatt_char(ch.uuid)
                                        try:
                                            t = val.decode('utf-8')
                                            val_str = f" = '{t}'" if t.isprintable() and len(t) < 30 else f" = {val.hex()}"
                                        except:
                                            val_str = f" = {val.hex()}" if len(val) < 20 else f" = {val[:16].hex()}..."
                                    except:
                                        val_str = " (read failed)"
                                print(f"        {ch.uuid} [{props}]{val_str}")
                        print()

            except asyncio.TimeoutError:
                print(f"    ✗ Timeout")
            except Exception as e:
                print(f"    ✗ {e}")
            print()

asyncio.run(main())
