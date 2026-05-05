#!/usr/bin/env python3
"""
Minew B10 Live Web Dashboard — v4

Uses bleak with a very tight scan-restart cycle (1 second) to
maximize update frequency within macOS CoreBluetooth constraints.
The BLE loop and HTTP server run in separate threads.
"""

import asyncio
import struct
import math
import json
import time
import os
import threading
from datetime import datetime, timedelta
from http.server import HTTPServer, BaseHTTPRequestHandler
from socketserver import ThreadingMixIn
from bleak import BleakScanner

ACCEL_SCALE = 256.0
DATA_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'data')
os.makedirs(DATA_DIR, exist_ok=True)

def daily_file(date_str=None):
    if date_str is None:
        date_str = datetime.now().strftime('%Y-%m-%d')
    return os.path.join(DATA_DIR, f'position_{date_str}.json')

def load_daily_data(date_str=None):
    path = daily_file(date_str)
    if os.path.exists(path):
        try:
            with open(path, 'r') as f:
                return json.load(f)
        except:
            pass
    return {}

def save_daily_data(data, date_str=None):
    path = daily_file(date_str)
    try:
        with open(path, 'w') as f:
            json.dump(data, f)
    except:
        pass

def load_week_data():
    """Load position data for the last 7 days."""
    week = {}
    today = datetime.now().date()
    for i in range(7):
        d = today - timedelta(days=i)
        ds = d.strftime('%Y-%m-%d')
        day_data = load_daily_data(ds)
        if day_data:
            week[ds] = day_data
    return week

latest_data = {
    'connected': False, 'address': None, 'rssi': 0, 'frame_count': 0,
    'accel': {'x': 0, 'y': 0, 'z': 0, 'mag': 0},
    'accel_raw': {'x': 0, 'y': 0, 'z': 0},
    'gyro_raw': {'x': 0, 'y': 0, 'z': 0},
    'orientation': {'pitch': 0, 'roll': 0, 'face': 'Searching...'},
    'battery': None, 'timestamp': '', 'raw_hex': '', 'history': [], 'update_id': 0,
    'position_time': {},
    'position_last_face': None,
    'position_last_ts': None,
    'position_last_date': None,
    'session_start': None,
    'week_data': {},
    'last_frame_epoch': 0
}
# Load today's accumulated data on startup
latest_data['position_time'] = load_daily_data()
latest_data['week_data'] = load_week_data()
data_lock = threading.Lock()

def contains_b10_mac(data):
    return b'\x74\x50\xaf\x3f\x23\xac' in data or b'\xaf\x3f\x23\xac' in data

def orientation_from_accel(x, y, z):
    """Determine patient body position from accelerometer gravity vector.

    Sensor mounted on patient's sternum, Y axis pointing toward head.
    Y = -1g means patient is standing upright (gravity through feet).

    Axis mapping (sensor on sternum, head up):
      Y = -1g → Standing/Upright (gravity pulling toward feet)
      Y = +1g → Inverted (not clinical)
      Z = +1g → Supine (lying on back — gravity through back)
      Z = -1g → Prone (lying face down — gravity through chest)
      X = +1g → Right Lateral (lying on right side)
      X = -1g → Left Lateral (lying on left side)
    """
    mag = math.sqrt(x**2 + y**2 + z**2)
    if mag < 0.1: return {'pitch': 0, 'roll': 0, 'tilt_from_supine': 0, 'face': 'Unknown'}

    # Tilt angles relative to body axes
    # Forward/back tilt: how far from flat on back (supine = 0°, standing = 90°, prone = 180°)
    tilt_from_supine = math.degrees(math.acos(min(1, max(-1, z / mag))))
    # Left/right roll: positive = tilted toward right side
    body_roll = math.degrees(math.atan2(x, math.sqrt(y**2 + z**2)))
    # Head up/down: how far from horizontal (supine = 0°, standing = -90°)
    head_elevation = math.degrees(math.atan2(-y, math.sqrt(x**2 + z**2)))

    # Determine clinical position
    # Lateral detection starts at 20° (sin(20°) ≈ 0.342)
    # Full lateral turn at 25° (sin(25°) ≈ 0.423)
    # Supine/prone/upright at 45° (sin(45°) ≈ 0.7)
    lateral_detect = 0.342 * mag      # 20° — start detecting lateral
    lateral_turn = 0.423 * mag        # 25° — full lateral turn
    primary_threshold = 0.7 * mag     # 45° — supine/prone/upright

    if abs(x) > lateral_turn:
        # ≥25° = full lateral turn
        face = "LEFT LATERAL" if x > 0 else "RIGHT LATERAL"
    elif abs(x) > lateral_detect:
        # 20-25° = tilted but not a full turn
        face = "LEFT LATERAL (TILTED)" if x > 0 else "RIGHT LATERAL (TILTED)"
    elif z > primary_threshold:
        face = "SUPINE"
    elif z < -primary_threshold:
        face = "PRONE"
    elif y < -primary_threshold:
        if z > 0.3 * mag:
            face = "SEMI-FOWLER"
        else:
            face = "UPRIGHT"
    elif y > primary_threshold:
        face = "INVERTED"
    else:
        # Mixed — determine closest
        if abs(z) > abs(x) and abs(z) > abs(y):
            face = "SUPINE (TILTED)" if z > 0 else "PRONE (TILTED)"
        elif abs(x) > abs(y):
            face = "LEFT LATERAL (TILTED)" if x > 0 else "RIGHT LATERAL (TILTED)"
        else:
            face = "RECLINED" if y < 0 else "TILTED"

    return {
        'pitch': round(head_elevation, 1),
        'roll': round(body_roll, 1),
        'tilt_from_supine': round(tilt_from_supine, 1),
        'face': face
    }

def process_frame(data, rssi, address):
    if len(data) < 14 or data[0] != 0xA1 or data[1] != 0x15:
        if len(data) >= 9 and data[-3:] == b'B10':
            with data_lock:
                latest_data['battery'] = data[1]
                latest_data['connected'] = True
                latest_data['address'] = address
        return
    ax = struct.unpack('>h', data[2:4])[0]; ay = struct.unpack('>h', data[4:6])[0]; az = struct.unpack('>h', data[6:8])[0]
    gx = struct.unpack('>h', data[8:10])[0]; gy = struct.unpack('>h', data[10:12])[0]; gz = struct.unpack('>h', data[12:14])[0]
    axg=ax/ACCEL_SCALE; ayg=ay/ACCEL_SCALE; azg=az/ACCEL_SCALE
    mag=math.sqrt(axg**2+ayg**2+azg**2); orient=orientation_from_accel(axg,ayg,azg)
    ts = datetime.now().strftime('%H:%M:%S.%f')[:-3]
    today_str = datetime.now().strftime('%Y-%m-%d')
    now = time.time()
    face = orient['face']
    base_face = face.replace(' (TILTED)', '')
    with data_lock:
        if latest_data['session_start'] is None:
            latest_data['session_start'] = now

        # Handle day rollover
        if latest_data['position_last_date'] and latest_data['position_last_date'] != today_str:
            # Save yesterday's data, start fresh for today
            save_daily_data(latest_data['position_time'], latest_data['position_last_date'])
            latest_data['position_time'] = load_daily_data(today_str)
            latest_data['week_data'] = load_week_data()

        # Accumulate time in current position
        if latest_data['position_last_ts'] is not None and latest_data['position_last_face'] is not None:
            elapsed = now - latest_data['position_last_ts']
            if elapsed < 30:  # Cap at 30s to avoid gaps from scanner restarts inflating the count
                prev = latest_data['position_last_face']
                latest_data['position_time'][prev] = latest_data['position_time'].get(prev, 0) + elapsed
        latest_data['position_last_face'] = base_face
        latest_data['position_last_ts'] = now
        latest_data['position_last_date'] = today_str

        # Save to disk every 10 frames
        if (latest_data.get('frame_count', 0) + 1) % 10 == 0:
            save_daily_data(latest_data['position_time'], today_str)
            latest_data['week_data'] = load_week_data()

        latest_data.update({
            'frame_count': latest_data['frame_count']+1, 'connected': True, 'address': address,
            'rssi': rssi, 'raw_hex': data.hex(), 'timestamp': ts, 'update_id': latest_data['update_id']+1,
            'accel': {'x':round(axg,3),'y':round(ayg,3),'z':round(azg,3),'mag':round(mag,3)},
            'accel_raw': {'x':ax,'y':ay,'z':az}, 'gyro_raw': {'x':gx,'y':gy,'z':gz}, 'orientation': orient,
            'session_elapsed': round(now - latest_data['session_start'], 1)
        })
        latest_data['history'].append({'time':ts,'x':round(axg,3),'y':round(ayg,3),'z':round(azg,3),'tilt':orient['tilt_from_supine'],'pitch':orient['pitch'],'roll':orient['roll'],'face':orient['face'],'rssi':rssi})
        if len(latest_data['history'])>200: latest_data['history']=latest_data['history'][-200:]
    print(f"  [{ts}] X:{axg:>+.3f} Y:{ayg:>+.3f} Z:{azg:>+.3f} | {orient['face']:<12} | RSSI:{rssi}")

async def ble_loop():
    b10_addr = None
    last_frame_time = time.time()
    stale_count = 0  # consecutive cycles with no data
    print("  BLE scanner starting — adaptive restart cycle")
    while True:
        found_this_cycle = False
        def cb(device, adv_data):
            nonlocal b10_addr, found_this_cycle, last_frame_time, stale_count
            if adv_data.service_data:
                for uuid, data in adv_data.service_data.items():
                    if 'ffe1' in uuid.lower() and (contains_b10_mac(data) or device.address == b10_addr):
                        b10_addr = device.address
                        found_this_cycle = True
                        last_frame_time = time.time()
                        stale_count = 0
                        process_frame(data, adv_data.rssi, device.address)
        try:
            scanner = BleakScanner(detection_callback=cb)
            await scanner.start()
            await asyncio.sleep(1.0)
            await scanner.stop()
        except Exception as e:
            print(f"  Scanner error: {e}")
            await asyncio.sleep(1.0)
            continue

        # Update staleness in shared data
        stale_seconds = time.time() - last_frame_time
        with data_lock:
            latest_data['last_frame_epoch'] = last_frame_time

        if not found_this_cycle:
            stale_count += 1
            if stale_count >= 5 and stale_count % 5 == 0:
                # No data for 5+ consecutive cycles — force a longer pause
                # to let CoreBluetooth fully clear its advertisement cache
                pause = min(3.0, 1.0 + stale_count * 0.2)
                print(f"  ⚠ No B10 data for {stale_count} cycles ({stale_seconds:.0f}s) — pausing {pause:.1f}s to reset CoreBluetooth cache")
                b10_addr = None  # clear cached address in case it rotated
                await asyncio.sleep(pause)
            elif stale_count >= 20 and stale_count % 20 == 0:
                # Extended stale period — log but keep trying
                print(f"  ⚠ B10 stale for {stale_seconds:.0f}s — still scanning (check sensor power/proximity)")

def run_ble(loop):
    asyncio.set_event_loop(loop)
    loop.run_until_complete(ble_loop())

class ThreadedHTTPServer(ThreadingMixIn, HTTPServer):
    daemon_threads = True

class Handler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path == '/api/data':
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            with data_lock:
                self.wfile.write(json.dumps(latest_data).encode())
        elif self.path in ('/', '/dashboard'):
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            self.wfile.write(HTML.encode())
        else:
            self.send_response(404)
            self.end_headers()
    def log_message(self, *a): pass

HTML = """<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>B10 Live</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:-apple-system,sans-serif;background:#0a0e17;color:#e0e0e0;min-height:100vh}
.hdr{background:#1a2332;padding:16px 24px;border-bottom:1px solid #2a3a4a;display:flex;justify-content:space-between;align-items:center}
.hdr h1{font-size:18px;color:#00b4d8;letter-spacing:1px}
.dot{display:inline-block;width:10px;height:10px;border-radius:50%;margin-right:6px}
.dot.on{background:#2ecc71;box-shadow:0 0 8px #2ecc71} .dot.off{background:#e67e22;animation:p 1s infinite}
@keyframes p{0%,100%{opacity:1}50%{opacity:.3}}
.g{display:grid;grid-template-columns:1fr 1fr;gap:16px;padding:16px 24px;max-width:1100px;margin:0 auto}
.c{background:#111820;border:1px solid #1e2d3d;border-radius:10px;padding:16px}
.c h2{font-size:12px;text-transform:uppercase;letter-spacing:1.5px;color:#5a7a9a;margin-bottom:12px}
.c.f{grid-column:1/-1}
.fl{font-size:36px;font-weight:800;color:#00b4d8;text-align:center;transition:all .15s}
.ang{display:flex;justify-content:center;gap:30px;margin-top:10px}
.av{font-size:26px;font-weight:700;font-family:'SF Mono',monospace;text-align:center;transition:all .15s}
.al{font-size:10px;color:#5a7a9a;text-transform:uppercase;margin-top:3px;text-align:center}
.br{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.bl{width:16px;font-weight:700;font-size:14px;text-align:center}
.bl.x{color:#e74c3c}.bl.y{color:#2ecc71}.bl.z{color:#3498db}
.bo{flex:1;height:24px;background:#0a0e17;border-radius:3px;position:relative}
.bc{position:absolute;left:50%;top:0;bottom:0;width:1px;background:#2a3a4a}
.bf{position:absolute;top:2px;bottom:2px;border-radius:2px;transition:all .15s}
.bf.x{background:#e74c3c}.bf.y{background:#2ecc71}.bf.z{background:#3498db}
.bv{width:80px;text-align:right;font-family:'SF Mono',monospace;font-size:13px}
.dv{width:160px;height:220px;margin:0 auto;perspective:500px}
.db{width:80px;height:180px;margin:10px auto 0;transform-style:preserve-3d;transition:transform .15s;position:relative}
.body-head{width:28px;height:28px;border-radius:50%;border:2px solid #00b4d8;position:absolute;top:0;left:50%;transform:translateX(-50%);background:#0d2040}
.body-torso{width:40px;height:60px;border:2px solid #00b4d8;border-radius:6px 6px 4px 4px;position:absolute;top:30px;left:50%;transform:translateX(-50%);background:linear-gradient(180deg,#1a3a5a,#0d2040)}
.body-sensor{width:10px;height:10px;border-radius:50%;background:#2ecc71;box-shadow:0 0 8px #2ecc71;position:absolute;top:48px;left:50%;transform:translateX(-50%);z-index:2}
.body-arm-l{width:10px;height:50px;border:2px solid #00b4d8;border-radius:5px;position:absolute;top:34px;left:12px;background:#0d2040;transform:rotate(8deg)}
.body-arm-r{width:10px;height:50px;border:2px solid #00b4d8;border-radius:5px;position:absolute;top:34px;right:12px;background:#0d2040;transform:rotate(-8deg)}
.body-leg-l{width:12px;height:65px;border:2px solid #00b4d8;border-radius:5px;position:absolute;top:88px;left:24px;background:#0d2040;transform:rotate(3deg)}
.body-leg-r{width:12px;height:65px;border:2px solid #00b4d8;border-radius:5px;position:absolute;top:88px;right:24px;background:#0d2040;transform:rotate(-3deg)}
.il{font-family:'SF Mono',monospace;font-size:11px;color:#5a7a9a;line-height:1.8}
.il .l{color:#3a5a7a;display:inline-block;width:70px}.il .v{color:#8ab4d8}
.mg{text-align:center;margin-top:8px;font-size:13px;color:#5a7a9a}.mg span{color:#e0e0e0;font-weight:600;font-family:'SF Mono',monospace}
.fc{font-family:'SF Mono',monospace;font-size:11px;color:#3a5a7a;text-align:center;margin-top:8px}
.fp{font-size:11px;color:#2ecc71;text-align:center;margin-top:2px;font-family:'SF Mono',monospace}
.dist-row{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.dist-label{width:110px;font-size:12px;font-family:'SF Mono',monospace;color:#8ab4d8;text-align:right}
.dist-bar-outer{flex:1;height:22px;background:#0a0e17;border-radius:3px;position:relative;overflow:hidden}
.dist-bar-fill{height:100%;border-radius:3px;transition:width .3s;min-width:1px}
.dist-pct{width:45px;font-size:12px;font-family:'SF Mono',monospace;color:#5a7a9a}
.dist-time{width:60px;font-size:11px;font-family:'SF Mono',monospace;color:#3a5a7a;text-align:right}
.dist-colors-supine{background:#3498db}
.dist-colors-left{background:#e67e22}
.dist-colors-right{background:#9b59b6}
.dist-colors-prone{background:#e74c3c}
.dist-colors-upright{background:#2ecc71}
.dist-colors-other{background:#5a7a9a}
.session-info{font-size:11px;color:#3a5a7a;font-family:'SF Mono',monospace;text-align:right;margin-bottom:12px}
.hw{max-height:180px;overflow-y:auto}.hw table{width:100%;font-size:11px;font-family:'SF Mono',monospace;border-collapse:collapse}
.hw th{text-align:left;color:#3a5a7a;padding:3px 6px;border-bottom:1px solid #1e2d3d;position:sticky;top:0;background:#111820}
.hw td{padding:3px 6px;border-bottom:1px solid #0d1520}
</style></head><body>
<div class="hdr"><h1>PATIENT POSITION MONITOR — B10 Sternum Sensor</h1><div style="font-size:13px"><span class="dot off" id="sd"></span><span id="st">Searching...</span></div></div>
<div class="g">
<div class="c"><h2>Patient Position</h2><div class="fl" id="face">Searching...</div><div class="ang"><div><div class="av" id="tilt">--</div><div class="al">Tilt from Supine</div></div><div><div class="av" id="roll">--</div><div class="al">Left/Right Roll</div></div><div><div class="av" id="pitch">--</div><div class="al">Head Elevation</div></div></div><div class="fc" id="fct"></div><div class="fp" id="fps"></div></div>
<div class="c"><h2>Patient Visualization</h2><div class="dv"><div class="db" id="dbox"><div class="body-head"></div><div class="body-torso"></div><div class="body-sensor" title="Sensor (sternum)"></div><div class="body-arm-l"></div><div class="body-arm-r"></div><div class="body-leg-l"></div><div class="body-leg-r"></div></div></div><div class="mg">Mag: <span id="mag">--</span> g</div></div>
<div class="c"><h2>Accelerometer</h2>
<div class="br"><div class="bl x">X</div><div class="bo"><div class="bc"></div><div class="bf x" id="bX"></div></div><div class="bv" id="vX">--</div></div>
<div class="br"><div class="bl y">Y</div><div class="bo"><div class="bc"></div><div class="bf y" id="bY"></div></div><div class="bv" id="vY">--</div></div>
<div class="br"><div class="bl z">Z</div><div class="bo"><div class="bc"></div><div class="bf z" id="bZ"></div></div><div class="bv" id="vZ">--</div></div>
<div class="il" style="margin-top:8px"><div><span class="l">Raw:</span><span class="v" id="raw">--</span></div></div></div>
<div class="c"><h2>Info</h2><div class="il">
<div><span class="l">MAC:</span><span class="v">AC:23:3F:AF:50:74</span></div>
<div><span class="l">RSSI:</span><span class="v" id="rssi">--</span> dBm</div>
<div><span class="l">Battery:</span><span class="v" id="batt">--</span></div>
<div><span class="l">Gyro:</span><span class="v" id="gyro">--</span></div>
<div><span class="l">Hex:</span></div><div><span class="v" id="hex" style="word-break:break-all;font-size:10px">--</span></div>
</div></div>
<div class="c f"><h2>Today's Position Distribution</h2><div class="session-info" id="sess">Session: --</div><div id="distBars"></div></div>
<div class="c f"><h2>Weekly Position Distribution (by day)</h2><div id="weekChart"></div></div>
<div class="c f"><h2>Position History</h2><div class="hw"><table><thead><tr><th>Time</th><th>X (g)</th><th>Y (g)</th><th>Z (g)</th><th>Tilt°</th><th>Roll°</th><th>Position</th><th>RSSI</th></tr></thead><tbody id="hb"></tbody></table></div></div>
</div>
<script>
let lid=0,fpc=0,lastEpoch=0;
function sb(id,v){const e=document.getElementById(id),p=Math.min(50,Math.abs(v)/1.2*50);if(v>=0){e.style.left='50%';e.style.right='auto'}else{e.style.right='50%';e.style.left='auto'}e.style.width=p+'%'}
function u(d){if(d.update_id===lid)return;lid=d.update_id;fpc++;
// Staleness detection: if last_frame_epoch hasn't changed in 5+ seconds, data is stale
const now=Date.now()/1000;
const staleAge=d.last_frame_epoch>0?(now-d.last_frame_epoch):999;
const isStale=staleAge>5;
if(d.connected&&!isStale){document.getElementById('sd').className='dot on';document.getElementById('st').textContent='Connected'}
else if(d.connected&&isStale){document.getElementById('sd').className='dot off';document.getElementById('st').textContent='Stale ('+Math.round(staleAge)+'s) — reconnecting...'}
else{document.getElementById('sd').className='dot off';document.getElementById('st').textContent='Searching...'}
document.getElementById('face').textContent=d.orientation.face;
document.getElementById('tilt').textContent=(d.orientation.tilt_from_supine||0).toFixed(1)+'°';
document.getElementById('pitch').textContent=d.orientation.pitch.toFixed(1)+'°';
document.getElementById('roll').textContent=d.orientation.roll.toFixed(1)+'°';
document.getElementById('fct').textContent='Frame #'+d.frame_count+' | '+d.timestamp;
sb('bX',d.accel.x);sb('bY',d.accel.y);sb('bZ',d.accel.z);
document.getElementById('vX').textContent=d.accel.x.toFixed(3)+' g';
document.getElementById('vY').textContent=d.accel.y.toFixed(3)+' g';
document.getElementById('vZ').textContent=d.accel.z.toFixed(3)+' g';
document.getElementById('mag').textContent=d.accel.mag.toFixed(3);
document.getElementById('raw').textContent='X:'+d.accel_raw.x+' Y:'+d.accel_raw.y+' Z:'+d.accel_raw.z;
document.getElementById('rssi').textContent=d.rssi;
if(d.battery!==null)document.getElementById('batt').textContent=d.battery+'%';
document.getElementById('gyro').textContent='X:'+d.gyro_raw.x+' Y:'+d.gyro_raw.y+' Z:'+d.gyro_raw.z;
document.getElementById('hex').textContent=d.raw_hex;
// Roll (X axis) = patient rolling left/right in bed → rotate around the body's long axis (rotateY for front-facing figure)
// Pitch (head elevation) = patient sitting up or lying flat → tilt forward/back (rotateX)
document.getElementById('dbox').style.transform='rotateY('+(-d.orientation.roll)+'deg) rotateX('+(-d.orientation.pitch)+'deg)';
// Position distribution
if(d.position_time){
const colors={'SUPINE':'supine','LEFT LATERAL':'left','RIGHT LATERAL':'right','PRONE':'prone','UPRIGHT':'upright','SEMI-FOWLER':'upright','RECLINED':'upright'};
const pt=d.position_time;const keys=Object.keys(pt);
const total=Object.values(pt).reduce((a,b)=>a+b,0);
const container=document.getElementById('distBars');
if(keys.length>0&&total>0){
container.innerHTML='';
keys.sort((a,b)=>pt[b]-pt[a]);
keys.forEach(k=>{
const secs=pt[k];const pct=total>0?(secs/total*100):0;
const mins=Math.floor(secs/60);const s=Math.floor(secs%60);
const timeStr=mins>0?mins+'m '+s+'s':s+'s';
const colorClass='dist-colors-'+(colors[k]||'other');
const row=document.createElement('div');row.className='dist-row';
row.innerHTML='<div class="dist-label">'+k+'</div><div class="dist-bar-outer"><div class="dist-bar-fill '+colorClass+'" style="width:'+pct+'%"></div></div><div class="dist-pct">'+pct.toFixed(1)+'%</div><div class="dist-time">'+timeStr+'</div>';
container.appendChild(row);
});
}
if(d.session_elapsed){const em=Math.floor(d.session_elapsed/60);const es=Math.floor(d.session_elapsed%60);document.getElementById('sess').textContent='Session: '+em+'m '+es+'s | '+d.frame_count+' frames';}
}
// Weekly chart
if(d.week_data){
const wc=document.getElementById('weekChart');
const allPos=new Set();const days=Object.keys(d.week_data).sort();
// Include today's live data
const todayKey=new Date().toISOString().slice(0,10);
const weekWithToday={...d.week_data};
if(d.position_time&&Object.keys(d.position_time).length>0){weekWithToday[todayKey]=d.position_time;}
const sortedDays=Object.keys(weekWithToday).sort();
sortedDays.forEach(day=>{Object.keys(weekWithToday[day]).forEach(p=>allPos.add(p))});
if(sortedDays.length>0&&allPos.size>0){
const posArr=Array.from(allPos).sort();
let html='<div style="display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap">';
posArr.forEach(p=>{const c=colors[p]||'other';html+='<div style="display:flex;align-items:center;gap:4px;font-size:11px;color:#8ab4d8"><div style="width:10px;height:10px;border-radius:2px" class="dist-colors-'+c+'"></div>'+p+'</div>'});
html+='</div>';
sortedDays.forEach(day=>{
const dd=weekWithToday[day];const total=Object.values(dd).reduce((a,b)=>a+b,0);
if(total<1)return;
const dayLabel=day===todayKey?'Today ('+day+')':day;
const totalMin=Math.floor(total/60);const totalHr=Math.floor(totalMin/60);const remMin=totalMin%60;
const durStr=totalHr>0?totalHr+'h '+remMin+'m':totalMin+'m';
html+='<div style="margin-bottom:8px"><div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="font-size:11px;color:#5a7a9a;font-family:SF Mono,monospace">'+dayLabel+'</span><span style="font-size:11px;color:#3a5a7a;font-family:SF Mono,monospace">'+durStr+' tracked</span></div>';
html+='<div style="display:flex;height:24px;border-radius:3px;overflow:hidden;background:#0a0e17">';
posArr.forEach(p=>{
const secs=dd[p]||0;const pct=secs/total*100;
if(pct>0.5){const c=colors[p]||'other';
html+='<div class="dist-colors-'+c+'" style="width:'+pct+'%;display:flex;align-items:center;justify-content:center;font-size:9px;color:#fff;font-weight:600;overflow:hidden">'+(pct>8?Math.round(pct)+'%':'')+'</div>';}
});
html+='</div></div>';
});
wc.innerHTML=html;
}}
if(d.history&&d.history.length){const t=document.getElementById('hb');t.innerHTML='';d.history.slice(-15).reverse().forEach(h=>{const r=document.createElement('tr');r.innerHTML='<td>'+h.time+'</td><td>'+h.x.toFixed(3)+'</td><td>'+h.y.toFixed(3)+'</td><td>'+h.z.toFixed(3)+'</td><td>'+(h.tilt||0).toFixed(1)+'°</td><td>'+h.roll+'°</td><td>'+h.face+'</td><td>'+h.rssi+'</td>';t.appendChild(r)})}}
setInterval(()=>{document.getElementById('fps').textContent=fpc+' upd/s';fpc=0},1000);
setInterval(()=>{fetch('/api/data').then(r=>r.json()).then(u).catch(()=>{})},200);
</script></body></html>
"""

if __name__ == '__main__':
    port = 8765
    loop = asyncio.new_event_loop()
    t = threading.Thread(target=run_ble, args=(loop,), daemon=True)
    t.start()
    server = ThreadedHTTPServer(('127.0.0.1', port), Handler)
    print(f"╔═══════════════════════════════════════════╗")
    print(f"║  B10 Dashboard v4 — http://localhost:{port}  ║")
    print(f"║  Ctrl+C to stop                           ║")
    print(f"╚═══════════════════════════════════════════╝")
    print()
    import webbrowser
    webbrowser.open(f'http://localhost:{port}')
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n  Stopped.")
        server.shutdown()
