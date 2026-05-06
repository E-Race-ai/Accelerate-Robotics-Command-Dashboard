#!/usr/bin/env python3
"""
Minew B10 GATT Connection

Attempts to connect to the B10 over BLE GATT to:
1. Discover all services and characteristics
2. Authenticate with default password (minew123)
3. Read sensor data directly via GATT characteristics
4. Subscribe to notifications for real-time accelerometer data

Minew BeaconPlus GATT protocol:
- Connection requires password validation (default: "minew123")
- Password is 8 characters (digits or letters)
- After connection, sensor data may be available via notifications
"""

import asyncio
import sys
from bleak import BleakScanner, BleakClient

# B10 identification
B10_SERVICE_UUID = "0000ffe1-0000-1000-8000-00805f9b34fb"
DEFAULT_PASSWORD = "minew123"

def contains_b10_mac(data: bytes) -> bool:
    return b'\x74\x50\xaf\x3f\x23\xac' in data or b'\xaf\x3f\x23\xac' in data


async def find_b10(timeout=15):
    """Scan to find the B10's macOS address."""
    print(f"  Scanning for B10 ({timeout}s)...")
    b10_addr = None

    def callback(device, adv_data):
        nonlocal b10_addr
        if adv_data.service_data:
            for uuid, data in adv_data.service_data.items():
                if 'ffe1' in uuid.lower() and contains_b10_mac(data):
                    b10_addr = device.address
                    print(f"  Found B10 at {device.address} (RSSI: {adv_data.rssi})")

    scanner = BleakScanner(detection_callback=callback)
    await scanner.start()
    for i in range(timeout):
        await asyncio.sleep(1)
        if b10_addr:
            break
    await scanner.stop()
    return b10_addr


async def connect_and_explore(address):
    """Connect to B10 and discover all GATT services/characteristics."""
    print(f"\n  Connecting to {address}...")
    print(f"  (Timeout: 15 seconds)")
    print()

    try:
        async with BleakClient(address, timeout=15) as client:
            if not client.is_connected:
                print("  Failed to connect.")
                return

            print(f"  ✓ CONNECTED to B10")
            print(f"  MTU: {client.mtu_size}")
            print()

            # Discover and list all services
            print(f"  ═══════════════════════════════════════════════")
            print(f"  GATT SERVICE DISCOVERY")
            print(f"  ═══════════════════════════════════════════════")
            print()

            password_char = None
            sensor_chars = []
            notify_chars = []

            for service in client.services:
                print(f"  Service: {service.uuid}")
                print(f"    Description: {service.description or 'Unknown'}")
                print()

                for char in service.characteristics:
                    props = ', '.join(char.properties)
                    print(f"    Characteristic: {char.uuid}")
                    print(f"      Properties: [{props}]")
                    print(f"      Handle: {char.handle}")

                    # Track interesting characteristics
                    if 'write' in char.properties:
                        # Could be password or config characteristic
                        if 'notify' not in char.properties and 'read' not in char.properties:
                            password_char = char
                            print(f"      ★ Possible password/config write characteristic")

                    if 'notify' in char.properties:
                        notify_chars.append(char)
                        print(f"      ★ Supports notifications — possible sensor data stream")

                    if 'read' in char.properties:
                        sensor_chars.append(char)

                    # Try to read if readable
                    if 'read' in char.properties:
                        try:
                            value = await client.read_gatt_char(char.uuid)
                            if len(value) <= 30:
                                try:
                                    text = value.decode('utf-8')
                                    if text.isprintable() and len(text.strip()) > 0:
                                        print(f"      Value (text): '{text}'")
                                    else:
                                        print(f"      Value (hex): {value.hex()}")
                                except:
                                    print(f"      Value (hex): {value.hex()}")
                            else:
                                print(f"      Value ({len(value)} bytes): {value[:20].hex()}...")
                        except Exception as e:
                            print(f"      (read failed: {e})")

                    # List descriptors
                    for desc in char.descriptors:
                        print(f"      Descriptor: {desc.uuid} (handle: {desc.handle})")
                        try:
                            desc_val = await client.read_gatt_descriptor(desc.handle)
                            print(f"        Value: {desc_val.hex()}")
                        except:
                            pass

                    print()
                print()

            # Try writing the default password to writable characteristics
            print(f"  ═══════════════════════════════════════════════")
            print(f"  PASSWORD AUTHENTICATION ATTEMPT")
            print(f"  ═══════════════════════════════════════════════")
            print()

            # Try the default Minew password on any write-capable characteristics
            password_bytes = DEFAULT_PASSWORD.encode('utf-8')
            print(f"  Default password: '{DEFAULT_PASSWORD}' ({password_bytes.hex()})")
            print()

            for service in client.services:
                for char in service.characteristics:
                    if 'write' in char.properties or 'write-without-response' in char.properties:
                        print(f"  Trying password on {char.uuid}...")
                        try:
                            await client.write_gatt_char(char.uuid, password_bytes, response='write' in char.properties)
                            print(f"    ✓ Write accepted!")

                            # After password, try reading all readable chars again
                            await asyncio.sleep(0.5)
                            for rc in sensor_chars:
                                try:
                                    val = await client.read_gatt_char(rc.uuid)
                                    print(f"    Post-auth read {rc.uuid}: {val.hex()}")
                                except Exception as e:
                                    print(f"    Post-auth read {rc.uuid}: failed ({e})")

                        except Exception as e:
                            print(f"    ✗ Write failed: {e}")
                        print()

            # Try subscribing to notification characteristics
            if notify_chars:
                print(f"  ═══════════════════════════════════════════════")
                print(f"  NOTIFICATION SUBSCRIPTIONS")
                print(f"  ═══════════════════════════════════════════════")
                print()

                received_data = []

                def notification_handler(sender, data):
                    received_data.append(data)
                    print(f"  ← Notification from {sender}: {data.hex()} ({len(data)} bytes)")
                    # Try to parse as accelerometer
                    if len(data) >= 6:
                        import struct
                        try:
                            vals = []
                            for i in range(0, min(len(data), 12), 2):
                                vals.append(struct.unpack('>h', data[i:i+2])[0])
                            print(f"    As BE int16s: {vals}")
                        except:
                            pass

                for nc in notify_chars:
                    try:
                        await client.start_notify(nc.uuid, notification_handler)
                        print(f"  ✓ Subscribed to {nc.uuid}")
                    except Exception as e:
                        print(f"  ✗ Subscribe failed for {nc.uuid}: {e}")

                if any(True for nc in notify_chars):
                    print(f"\n  Listening for notifications for 20 seconds...")
                    for i in range(20):
                        await asyncio.sleep(1)
                        if i % 5 == 4:
                            print(f"    ... {i+1}/20s, {len(received_data)} notifications received")

                    # Unsubscribe
                    for nc in notify_chars:
                        try:
                            await client.stop_notify(nc.uuid)
                        except:
                            pass

                    print(f"\n  Total notifications received: {len(received_data)}")

            print(f"\n  Done. Disconnecting.")

    except asyncio.TimeoutError:
        print(f"  ✗ Connection timed out.")
        print(f"    The B10 may not accept GATT connections, or it may be")
        print(f"    connected to another device (e.g., BeaconSET+ app).")
        print(f"    Make sure no other app is connected to the B10.")
    except Exception as e:
        print(f"  ✗ Error: {e}")


async def main():
    print(f"╔══════════════════════════════════════════════════════════╗")
    print(f"║  Minew B10 GATT Connection Explorer                    ║")
    print(f"║  Default password: {DEFAULT_PASSWORD}                          ║")
    print(f"╚══════════════════════════════════════════════════════════╝")
    print()

    address = await find_b10(timeout=15)

    if not address:
        print("  B10 not found via scan. Trying all devices with ffe1 service...")
        # Fallback: scan for any device with ffe1
        devices = await BleakScanner.discover(timeout=10)
        for d in devices:
            print(f"    {d.address}: {d.name or '(unnamed)'}")

        print("\n  Could not identify B10. Make sure it's powered on and nearby.")
        return

    await connect_and_explore(address)


if __name__ == '__main__':
    asyncio.run(main())
