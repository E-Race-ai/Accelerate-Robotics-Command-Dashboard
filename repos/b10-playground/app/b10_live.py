#!/usr/bin/env python3
"""
Minew B10 Live Tilt Tracker

Confirmed frame structure for B10 long info frame (20 bytes):
  Byte 0:      0xA1 — Frame type
  Byte 1:      0x15 — Sub-type/version
  Bytes 2-3:   Accelerometer X (big-endian int16, ~256 counts/g)
  Bytes 4-5:   Accelerometer Y (big-endian int16)
  Bytes 6-7:   Accelerometer Z (big-endian int16)
  Bytes 8-9:   Gyroscope/sensor X (big-endian int16)
  Bytes 10-11: Gyroscope/sensor Y (big-endian int16)
  Bytes 12-13: Gyroscope/sensor Z (big-endian int16)
  Bytes 14-19: MAC address (reversed)

Short info frame (12 bytes):
  Byte 0:      0xA1 — Frame type
  Byte 1:      0x08 — Sub-type (info only)
  Byte 2:      0x64 — Unknown (100 decimal)
  Bytes 3-8:   MAC address (reversed)
  Bytes 9-11:  Device name ASCII ("B10")

Accelerometer scale: ~256 counts per g
"""

import asyncio
import struct
import sys
import math
from datetime import datetime
from bleak import BleakScanner

B10_MAC_BYTES = bytes.fromhex("ac233faf5074")
ACCEL_SCALE = 256.0  # counts per g

def contains_b10_mac(data: bytes) -> bool:
    return b'\x74\x50\xaf\x3f\x23\xac' in data or b'\xaf\x3f\x23\xac' in data

def orientation_from_accel(x_g, y_g, z_g):
    """Calculate tilt angles from accelerometer gravity vector."""
    # Pitch: rotation around Y axis (tilting forward/back)
    # Roll: rotation around X axis (tilting left/right)
    mag = math.sqrt(x_g**2 + y_g**2 + z_g**2)
    if mag < 0.1:
        return {'pitch': 0, 'roll': 0, 'face': 'unknown'}

    pitch = math.degrees(math.atan2(x_g, math.sqrt(y_g**2 + z_g**2)))
    roll = math.degrees(math.atan2(y_g, math.sqrt(x_g**2 + z_g**2)))

    # Determine face/orientation
    if z_g > 0.7 * mag:
        face = "FACE UP (flat)"
    elif z_g < -0.7 * mag:
        face = "FACE DOWN"
    elif x_g > 0.7 * mag:
        face = "RIGHT SIDE"
    elif x_g < -0.7 * mag:
        face = "LEFT SIDE"
    elif y_g > 0.7 * mag:
        face = "TOP UP (standing)"
    elif y_g < -0.7 * mag:
        face = "BOTTOM UP"
    else:
        face = f"TILTED"

    return {'pitch': round(pitch, 1), 'roll': round(roll, 1), 'face': face}

def bar_graph(value, max_val=1.2, width=20):
    """Simple ASCII bar graph for a value."""
    normalized = min(1.0, abs(value) / max_val)
    filled = int(normalized * width)
    if value >= 0:
        return ' ' * width + '│' + '█' * filled + '░' * (width - filled)
    else:
        return '░' * (width - filled) + '█' * filled + '│' + ' ' * width


async def live_track(duration: int = 120):
    print(f"╔══════════════════════════════════════════════════════════════╗")
    print(f"║  Minew B10 Live Tilt Tracker                               ║")
    print(f"║  MAC: AC:23:3F:AF:50:74 | Scale: ~256 counts/g            ║")
    print(f"║  Tilt the device to see real-time orientation changes       ║")
    print(f"║  Press Ctrl+C to stop                                      ║")
    print(f"╚══════════════════════════════════════════════════════════════╝")
    print()

    b10_address = None
    frame_count = 0
    last_print = [0]

    def callback(device, adv_data):
        nonlocal b10_address, frame_count

        if adv_data.service_data:
            for uuid, data in adv_data.service_data.items():
                if 'ffe1' in uuid.lower() and contains_b10_mac(data):
                    b10_address = device.address

        if device.address != b10_address:
            return

        if not adv_data.service_data:
            return

        for uuid, data in adv_data.service_data.items():
            if len(data) < 14:
                # Short frame — just note it
                if len(data) >= 9 and data[-3:] == b'B10':
                    frame_count += 1
                    ts = datetime.now().strftime('%H:%M:%S')
                    print(f"  [{ts}] Short info frame | Battery byte: {data[1]} | Name: B10")
                return

            if data[0] != 0xA1 or data[1] != 0x15:
                return

            frame_count += 1
            rssi = adv_data.rssi

            # Parse accelerometer (bytes 2-7, big-endian int16)
            ax_raw = struct.unpack('>h', data[2:4])[0]
            ay_raw = struct.unpack('>h', data[4:6])[0]
            az_raw = struct.unpack('>h', data[6:8])[0]

            ax_g = ax_raw / ACCEL_SCALE
            ay_g = ay_raw / ACCEL_SCALE
            az_g = az_raw / ACCEL_SCALE
            mag_g = math.sqrt(ax_g**2 + ay_g**2 + az_g**2)

            # Parse gyroscope/secondary sensor (bytes 8-13)
            gx_raw = struct.unpack('>h', data[8:10])[0]
            gy_raw = struct.unpack('>h', data[10:12])[0]
            gz_raw = struct.unpack('>h', data[12:14])[0]

            # Orientation
            orient = orientation_from_accel(ax_g, ay_g, az_g)

            ts = datetime.now().strftime('%H:%M:%S.%f')[:-3]

            # Clear and redraw (simple terminal update)
            print(f"\033[2K", end='')  # Clear line
            print(f"  ┌─── Frame #{frame_count} | {ts} | RSSI: {rssi} dBm ───────────────────")
            print(f"  │")
            print(f"  │  ACCELEROMETER (gravity vector)")
            print(f"  │    X: {ax_g:>+7.3f} g  ({ax_raw:>+6d} raw)  {bar_graph(ax_g)}")
            print(f"  │    Y: {ay_g:>+7.3f} g  ({ay_raw:>+6d} raw)  {bar_graph(ay_g)}")
            print(f"  │    Z: {az_g:>+7.3f} g  ({az_raw:>+6d} raw)  {bar_graph(az_g)}")
            print(f"  │    Magnitude: {mag_g:.3f} g")
            print(f"  │")
            print(f"  │  ORIENTATION")
            print(f"  │    Pitch: {orient['pitch']:>+7.1f}°")
            print(f"  │    Roll:  {orient['roll']:>+7.1f}°")
            print(f"  │    Face:  {orient['face']}")
            print(f"  │")
            print(f"  │  GYRO/SENSOR 2 (raw)")
            print(f"  │    X: {gx_raw:>+6d}   Y: {gy_raw:>+6d}   Z: {gz_raw:>+6d}")
            print(f"  │")
            print(f"  │  Raw: {data.hex()}")
            print(f"  └────────────────────────────────────────────────────────────")
            print()

    scanner = BleakScanner(detection_callback=callback)
    await scanner.start()

    try:
        for i in range(duration):
            await asyncio.sleep(1)
            if b10_address is None and i % 5 == 4:
                print(f"  Searching for B10... ({i+1}/{duration}s)")
            elif b10_address and frame_count == 0 and i % 10 == 9:
                print(f"  B10 found at {b10_address}, waiting for sensor frames... ({i+1}s)")
    except KeyboardInterrupt:
        print("\n  Stopped.")

    await scanner.stop()

    print()
    print(f"  ═══════════════════════════════════════════")
    print(f"  Session complete. {frame_count} sensor frames captured.")
    print(f"  ═══════════════════════════════════════════")


if __name__ == '__main__':
    duration = int(sys.argv[1]) if len(sys.argv) > 1 else 120
    asyncio.run(live_track(duration))
