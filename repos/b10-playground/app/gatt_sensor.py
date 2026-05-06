#!/usr/bin/env python3
"""
Minew B10 GATT Sensor Reader — v2

Tries multiple connection strategies:
1. Subscribe to notifications BEFORE writing password
2. Try writing password to different characteristics
3. Try NOT writing a password at all (just subscribe)
4. Try writing shorter/different password formats
"""

import asyncio
import struct
import math
from datetime import datetime
from bleak import BleakScanner, BleakClient

MINEW_CHAR = "7f280002-8204-f393-e0a9-e50e24dcca9e"
EDDY_PASS_CHAR = "a3c8750b-8ed3-4bdf-8a39-a01bebede295"
ACCEL_SCALE = 256.0


def contains_b10_mac(data: bytes) -> bool:
    return b'\x74\x50\xaf\x3f\x23\xac' in data or b'\xaf\x3f\x23\xac' in data


def on_notify(sender, data):
    ts = datetime.now().strftime('%H:%M:%S.%f')[:-3]
    print(f"  [{ts}] NOTIFICATION ({len(data)} bytes): {data.hex()}")
    byte_str = ' '.join(f'{b:02x}' for b in data)
    print(f"    Bytes: {byte_str}")
    if len(data) >= 6:
        for offset in [0, 2, 4]:
            if offset + 6 <= len(data):
                x = struct.unpack('>h', data[offset:offset+2])[0]
                y = struct.unpack('>h', data[offset+2:offset+4])[0]
                z = struct.unpack('>h', data[offset+4:offset+6])[0]
                mag = math.sqrt(x**2 + y**2 + z**2)
                print(f"    @{offset} BE: X={x:>+6d} Y={y:>+6d} Z={z:>+6d} mag={mag:.0f}")
    print()


def on_disconnect(client):
    print(f"  !! DISCONNECTED")


async def find_b10():
    print("  Scanning for B10...")
    devices = await BleakScanner.discover(timeout=10, return_adv=True)
    for device, adv_data in devices.values():
        if adv_data.service_data:
            for uuid, data in adv_data.service_data.items():
                if 'ffe1' in uuid.lower() and contains_b10_mac(data):
                    return device
    return None


async def try_strategy(name, address, strategy_fn):
    print(f"\n  ═══ Strategy: {name} ═══")
    try:
        client = BleakClient(address, timeout=15, disconnected_callback=on_disconnect)
        await client.connect()
        if not client.is_connected:
            print("  Failed to connect.")
            return
        print(f"  ✓ Connected (MTU: {client.mtu_size})")

        await strategy_fn(client)

    except asyncio.TimeoutError:
        print("  ✗ Timed out")
    except Exception as e:
        print(f"  ✗ Error: {e}")
    finally:
        try:
            if client.is_connected:
                await client.disconnect()
        except:
            pass


async def strategy_subscribe_first(client):
    """Subscribe to notifications before writing anything."""
    print("  Subscribing to notifications first (no password)...")
    try:
        await client.start_notify(MINEW_CHAR, on_notify)
        print("  ✓ Subscribed. Waiting 10s for data...")
        for i in range(10):
            await asyncio.sleep(1)
            if not client.is_connected:
                print("  Disconnected during wait.")
                return
        await client.stop_notify(MINEW_CHAR)
    except Exception as e:
        print(f"  ✗ {e}")


async def strategy_subscribe_then_password(client):
    """Subscribe to notifications, then write password."""
    print("  Step 1: Subscribe to notifications...")
    try:
        await client.start_notify(MINEW_CHAR, on_notify)
        print("  ✓ Subscribed")
    except Exception as e:
        print(f"  ✗ Subscribe failed: {e}")
        return

    await asyncio.sleep(0.3)

    print("  Step 2: Writing password 'minewtech'...")
    try:
        await client.write_gatt_char(MINEW_CHAR, b"minewtech", response=True)
        print("  ✓ Password written")
    except Exception as e:
        print(f"  ✗ Password write failed: {e}")

    print("  Waiting 15s for notifications...")
    for i in range(15):
        await asyncio.sleep(1)
        if not client.is_connected:
            print("  Disconnected.")
            return
    try:
        await client.stop_notify(MINEW_CHAR)
    except:
        pass


async def strategy_eddy_password(client):
    """Write password to Eddystone char, then subscribe on Minew char."""
    print("  Step 1: Subscribe to Minew char notifications...")
    try:
        await client.start_notify(MINEW_CHAR, on_notify)
        print("  ✓ Subscribed")
    except Exception as e:
        print(f"  ✗ Subscribe failed: {e}")
        return

    await asyncio.sleep(0.3)

    print("  Step 2: Writing 'minewtech' to Eddystone password char...")
    try:
        await client.write_gatt_char(EDDY_PASS_CHAR, b"minewtech")
        print("  ✓ Written")
    except Exception as e:
        print(f"  ✗ Write failed: {e}")

    print("  Waiting 15s for notifications...")
    for i in range(15):
        await asyncio.sleep(1)
        if not client.is_connected:
            print("  Disconnected.")
            return


async def strategy_read_only(client):
    """Just read everything readable, no writes."""
    print("  Reading all characteristics (no password)...")
    for service in client.services:
        for char in service.characteristics:
            if 'read' in char.properties:
                try:
                    val = await client.read_gatt_char(char.uuid)
                    try:
                        text = val.decode('utf-8')
                        if text.isprintable() and len(text.strip()) > 0:
                            print(f"    {char.uuid[-8:]}: '{text}'")
                        else:
                            print(f"    {char.uuid[-8:]}: {val.hex()}")
                    except:
                        print(f"    {char.uuid[-8:]}: {val.hex()}")
                except Exception as e:
                    print(f"    {char.uuid[-8:]}: failed ({e})")
                    if 'disconnected' in str(e).lower():
                        return

    # Stay connected for a bit to see if anything comes in
    print("  Staying connected for 10s...")
    for i in range(10):
        await asyncio.sleep(1)
        if not client.is_connected:
            print("  Disconnected.")
            return


async def strategy_password_minew123(client):
    """Subscribe first, then try minew123 password."""
    print("  Step 1: Subscribe...")
    try:
        await client.start_notify(MINEW_CHAR, on_notify)
        print("  ✓ Subscribed")
    except Exception as e:
        print(f"  ✗ {e}")
        return

    await asyncio.sleep(0.3)

    print("  Step 2: Writing 'minew123'...")
    try:
        await client.write_gatt_char(MINEW_CHAR, b"minew123", response=True)
        print("  ✓ Written")
    except Exception as e:
        print(f"  ✗ {e}")

    print("  Waiting 15s...")
    for i in range(15):
        await asyncio.sleep(1)
        if not client.is_connected:
            print("  Disconnected.")
            return


async def main():
    print("╔═══════════════════════════════════════════════╗")
    print("║  B10 GATT Multi-Strategy Connection Test     ║")
    print("╚═══════════════════════════════════════════════╝")

    device = await find_b10()
    if not device:
        print("  B10 not found.")
        return

    address = device.address
    print(f"  Found B10 at {address}")

    strategies = [
        ("Subscribe first, no password", strategy_subscribe_first),
        ("Subscribe then minewtech", strategy_subscribe_then_password),
        ("Subscribe then minew123", strategy_password_minew123),
        ("Eddystone char password", strategy_eddy_password),
        ("Read-only exploration", strategy_read_only),
    ]

    for name, fn in strategies:
        await try_strategy(name, address, fn)
        await asyncio.sleep(2)  # Brief pause between attempts

    print("\n  All strategies tested.")


if __name__ == '__main__':
    asyncio.run(main())
