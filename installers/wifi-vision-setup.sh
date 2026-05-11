#!/bin/bash
# WiFi Vision Extreme — one-shot Mac installer.
# Sets up the local backend that powers A/V Cast + WiFi Audit, registers it
# to auto-launch on login, then opens the dashboard.
# After the first run, the backend stays up across reboots — clicking the
# tile from then on just opens the dashboard, no installer needed.

set -e

# Derive bundle + dashboard URLs from a single origin so the installer works
# from both production (acceleraterobotics.ai) and local dev (localhost:3000).
# The launcher page passes the right WV_ORIGIN at curl-time.
WV_ORIGIN="${WV_ORIGIN:-https://acceleraterobotics.ai}"
BUNDLE_URL="${WV_BUNDLE_URL:-$WV_ORIGIN/installers/wifi-vision-bundle.tar.gz}"
DASHBOARD_URL="${WV_DASHBOARD_URL:-$WV_ORIGIN/pages/wifi-vision.html?installed=1}"
PORT=8765
LABEL="ai.acceleraterobotics.wifivision"
INSTALL_DIR="$HOME/Library/Application Support/WiFiVisionExtreme"
VENV="$INSTALL_DIR/venv"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$INSTALL_DIR/backend.log"

clear
echo "═══════════════════════════════════════════════"
echo "  WiFi Vision Extreme — Accelerate Robotics"
echo "  setting up your local backend on port $PORT"
echo "═══════════════════════════════════════════════"
echo

# --- 1. Working directory ------------------------------------------------
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# --- 2. Stop any previous instance --------------------------------------
echo "→ stopping any prior backend…"
launchctl unload "$PLIST" 2>/dev/null || true
# Also catch a manually-started one bound to the same port
PID=$(lsof -t -i ":$PORT" -sTCP:LISTEN 2>/dev/null || true)
[ -n "$PID" ] && kill "$PID" 2>/dev/null || true

# --- 3. Fetch the code bundle -------------------------------------------
echo "→ downloading code bundle…"
curl -fsSL "$BUNDLE_URL" -o /tmp/wv-bundle.tgz
rm -rf "$INSTALL_DIR/wifi-vision-bundle"
tar -xzf /tmp/wv-bundle.tgz -C "$INSTALL_DIR"
rm /tmp/wv-bundle.tgz
APP_DIR="$INSTALL_DIR/wifi-vision-bundle/avcast"
[ -d "$APP_DIR" ] || { echo "✗ bundle layout unexpected"; exit 1; }

# --- 4. Python venv + deps ----------------------------------------------
echo "→ preparing Python environment (this is the slow part — ~30s)…"
PYBIN="$(command -v python3 || true)"
[ -z "$PYBIN" ] && PYBIN="/usr/bin/python3"
[ -x "$PYBIN" ] || { echo "✗ Python 3 not found — install from python.org and re-run"; exit 1; }

# Pre-flight: catch the two most common macOS python3 stub failures and
# turn the cryptic system message into a one-line fix the user can paste.
PROBE=$("$PYBIN" --version 2>&1 || true)
RERUN_PREFIX=""
[ "$WV_ORIGIN" != "https://acceleraterobotics.ai" ] && RERUN_PREFIX="WV_ORIGIN='$WV_ORIGIN' "
RERUN="curl -fsSL $WV_ORIGIN/installers/wifi-vision-setup.sh | ${RERUN_PREFIX}bash"
if echo "$PROBE" | grep -qi "Xcode license"; then
  echo
  echo "═══════════════════════════════════════════════════════════════"
  echo "  ✗ macOS needs you to accept the Xcode license once before"
  echo "    Python can run on this Mac."
  echo "═══════════════════════════════════════════════════════════════"
  echo
  echo "  Paste this single line — it accepts the license (you'll be"
  echo "  asked for your Mac password) and then re-runs setup for you:"
  echo
  echo "    sudo xcodebuild -license accept && $RERUN"
  echo
  exit 1
fi
if echo "$PROBE" | grep -qiE "no developer tools|invalid active developer path"; then
  echo
  echo "═══════════════════════════════════════════════════════════════"
  echo "  ✗ macOS Command Line Tools aren't installed yet."
  echo "═══════════════════════════════════════════════════════════════"
  echo
  echo "  A popup should have appeared — click Install, wait ~3 minutes,"
  echo "  then paste this line to re-run setup:"
  echo
  echo "    $RERUN"
  echo
  exit 1
fi

"$PYBIN" -m venv "$VENV"
"$VENV/bin/pip" install --quiet --upgrade pip wheel
"$VENV/bin/pip" install --quiet -r "$APP_DIR/requirements.txt"

# --- 5. LaunchAgent so the backend stays up across reboots --------------
echo "→ registering background service…"
mkdir -p "$(dirname "$PLIST")"
cat > "$PLIST" <<PLIST_EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$VENV/bin/uvicorn</string>
    <string>backend:app</string>
    <string>--host</string><string>127.0.0.1</string>
    <string>--port</string><string>$PORT</string>
  </array>
  <key>WorkingDirectory</key><string>$APP_DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST_EOF
launchctl load "$PLIST"

# --- 6. Wait for backend to come up -------------------------------------
echo -n "→ waiting for backend "
for i in $(seq 1 40); do
  if curl -fsS -o /dev/null "http://127.0.0.1:$PORT/" 2>/dev/null; then
    echo " ✓"
    READY=1
    break
  fi
  echo -n "."
  sleep 1
done

if [ -z "$READY" ]; then
  echo
  echo "✗ backend didn't come up in 40s. Recent log:"
  tail -30 "$LOG" 2>/dev/null
  exit 1
fi

# --- 7. Open the dashboard so the user goes straight there --------------
# Prefer reusing the user's existing launcher tab if they have one open in
# Safari — opening a fresh tab on top of the one they were already looking
# at is jarring. Falls back to `open` (default browser, new tab) if Safari
# isn't running or the launcher tab can't be found.
echo
echo "═══════════════════════════════════════════════"
echo "  ✓ WiFi Vision Extreme is now running."
echo "    Returning you to your browser…"
echo "    The backend auto-starts every time you log in."
echo "═══════════════════════════════════════════════"
echo
sleep 1

LAUNCHER_HOST="${WV_ORIGIN##*://}"   # strip protocol so the tab match works for http://localhost:3000 too

# Try to navigate the user's existing browser tab back to the dashboard so
# they end up in the SAME tab they were already looking at. Safari and
# Chrome have different AppleScript dictionaries, so we try each in turn.
# If neither has the launcher tab open (or the user denied "Terminal can
# control <browser>" permission), fall back to `open` which uses the OS
# default browser and opens a new tab.

nav_safari() {
  osascript <<OSA 2>/dev/null
tell application "Safari"
  if it is not running then error "not running"
  repeat with w in windows
    set i to 0
    repeat with t in tabs of w
      set i to i + 1
      try
        if (URL of t contains "${LAUNCHER_HOST}") and (URL of t contains "wifi-vision") then
          set current tab of w to tab i of w
          set URL of tab i of w to "${DASHBOARD_URL}"
          activate
          return
        end if
      end try
    end repeat
  end repeat
  error "tab not found"
end tell
OSA
}

nav_chrome() {
  # Works for Google Chrome AND Chromium forks that use the same dictionary
  # (Brave, Microsoft Edge, Arc all share Chrome's AppleScript schema).
  local app="$1"
  osascript <<OSA 2>/dev/null
tell application "${app}"
  if it is not running then error "not running"
  repeat with w in windows
    set i to 0
    repeat with t in tabs of w
      set i to i + 1
      try
        if (URL of t contains "${LAUNCHER_HOST}") and (URL of t contains "wifi-vision") then
          set active tab index of w to i
          tell tab i of w to go to URL "${DASHBOARD_URL}"
          activate
          return
        end if
      end try
    end repeat
  end repeat
  error "tab not found"
end tell
OSA
}

if nav_safari \
  || nav_chrome "Google Chrome" \
  || nav_chrome "Brave Browser" \
  || nav_chrome "Microsoft Edge" \
  || nav_chrome "Arc"; then
  :  # one of them navigated the tab — done
else
  open "$DASHBOARD_URL"
fi
