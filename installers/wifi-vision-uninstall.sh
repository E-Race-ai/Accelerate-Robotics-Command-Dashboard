#!/bin/bash
# WiFi Vision Extreme — uninstaller.
# Removes the local backend (launchd auto-start, install dir, any running
# process) and navigates the user's launcher tab back to ?uninstalled=1
# so the launcher buttons reset to "Start Live Cast".

set -e

WV_ORIGIN="${WV_ORIGIN:-https://acceleraterobotics.ai}"
DASHBOARD_URL="${WV_DASHBOARD_URL:-$WV_ORIGIN/pages/wifi-vision.html?uninstalled=1}"
PORT=8765
LABEL="ai.acceleraterobotics.wifivision"
INSTALL_DIR="$HOME/Library/Application Support/WiFiVisionExtreme"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"

clear
echo "═══════════════════════════════════════════════"
echo "  WiFi Vision Extreme — uninstalling…"
echo "═══════════════════════════════════════════════"
echo

echo "→ stopping background service…"
launchctl unload "$PLIST" 2>/dev/null || true

echo "→ killing any running backend on port $PORT…"
PID=$(lsof -t -i ":$PORT" -sTCP:LISTEN 2>/dev/null || true)
[ -n "$PID" ] && kill "$PID" 2>/dev/null || true

echo "→ removing files…"
rm -f "$PLIST"
rm -rf "$INSTALL_DIR"

echo
echo "═══════════════════════════════════════════════"
echo "  ✓ WiFi Vision Extreme is removed."
echo "    Returning you to your browser…"
echo "═══════════════════════════════════════════════"
echo

# Navigate the user's launcher tab back so the buttons reset. Same
# Safari → Chrome → Brave → Edge → Arc → default-browser cascade as the
# installer uses.
LAUNCHER_HOST="${WV_ORIGIN##*://}"

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
  :
else
  open "$DASHBOARD_URL" 2>/dev/null || true
fi
