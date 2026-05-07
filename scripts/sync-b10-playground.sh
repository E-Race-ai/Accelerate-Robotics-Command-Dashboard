#!/usr/bin/env bash
# Sync b10-playground assets into repos/b10-playground/ for production bundling.
#
# Why this exists: src/server.js mounts /repos/b10-playground from a sibling
# directory in dev, falling back to repos/b10-playground/ in production. Only the
# bundled fallback is committed to git, so production needs an up-to-date copy
# whenever the upstream playground changes.
#
# Usage (from repo root):
#   ./scripts/sync-b10-playground.sh                # use sibling at ../b10-playground
#   ./scripts/sync-b10-playground.sh /path/to/repo  # explicit source path
#
# What gets bundled:
#   - index.html              (the lab UI)
#   - docs/research/*.md      (the 5 reference docs the page links to)
#
# What is NOT bundled:
#   - sidecar/                (~520 MB Python service; deploy separately)
#   - .git, README, LICENSE, RESUME.md, NEXT-UP.md, serve.sh
#
# After running, review the diff with `git diff repos/b10-playground/` and
# commit on a fix/ or chore/ branch — never directly to main.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="$REPO_ROOT/repos/b10-playground"
SRC="${1:-$REPO_ROOT/../b10-playground}"

if [[ ! -d "$SRC" ]]; then
  echo "error: source not found: $SRC" >&2
  echo "       pass an explicit path or clone b10-playground next to this repo" >&2
  exit 1
fi

if [[ ! -f "$SRC/index.html" ]]; then
  echo "error: $SRC/index.html missing — is this the right directory?" >&2
  exit 1
fi

echo "syncing from: $SRC"
echo "         to: $DEST"

mkdir -p "$DEST/docs/research"

cp "$SRC/index.html" "$DEST/index.html"

# WHY: explicit list — prevents accidentally bundling unrelated docs/ files
RESEARCH_DOCS=(
  "00-synthesis-decision-matrix.md"
  "01-wearable-imu-toolkits.md"
  "02-vision-skeleton-toolkits.md"
  "03-contactless-radar-inbed-toolkits.md"
  "04-digital-health-platforms.md"
)
for doc in "${RESEARCH_DOCS[@]}"; do
  src_file="$SRC/docs/research/$doc"
  if [[ ! -f "$src_file" ]]; then
    echo "warn: missing $src_file (skipped)" >&2
    continue
  fi
  cp "$src_file" "$DEST/docs/research/$doc"
done

# Capture upstream commit for traceability — handy in commit messages.
if [[ -d "$SRC/.git" ]]; then
  UPSTREAM_SHA="$(git -C "$SRC" rev-parse --short HEAD 2>/dev/null || echo unknown)"
  UPSTREAM_BRANCH="$(git -C "$SRC" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  echo
  echo "upstream: $UPSTREAM_BRANCH @ $UPSTREAM_SHA"
fi

echo
echo "done. review with: git diff repos/b10-playground/"
echo "next:              git checkout -b chore/sync-b10-playground"
echo "                   git add repos/b10-playground/"
echo "                   git commit -m 'chore(repos): sync b10-playground'"
