#!/usr/bin/env bash
# AVCast launcher — starts the FastAPI backend and opens the dashboard.
set -e
cd "$(dirname "$0")"
PORT="${AVCAST_PORT:-8765}"

# Make sure the venv exists
if [ ! -x ".venv/bin/python" ]; then
  echo "venv not found — run: python3 -m venv .venv && .venv/bin/pip install -r requirements.txt"
  exit 1
fi

echo "▶ Starting AVCast on http://127.0.0.1:${PORT}"
echo "  (ctrl-c to stop)"

# Open browser after a short delay
( sleep 1.5 && open "http://127.0.0.1:${PORT}/" ) &

exec .venv/bin/uvicorn backend:app --host 127.0.0.1 --port "${PORT}" --log-level warning
