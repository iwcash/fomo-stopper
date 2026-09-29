#!/usr/bin/env bash
# Render the Chrome Web Store screenshots (1280x800) and small promo tile
# (440x280) from store/stage.html with headless Chrome.
#
# Uses a throwaway Chrome profile, so your normal browser is untouched.
set -euo pipefail
cd "$(dirname "$0")/.."

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
PORT="${PORT:-8742}"
OUT=store/screenshots
PROFILE="${PROFILE:-$(mktemp -d)}"
mkdir -p "$OUT" "$PROFILE"

python3 -m http.server "$PORT" --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null; pkill -f -- "--user-data-dir=$PROFILE" 2>/dev/null; rm -rf "$PROFILE"' EXIT
sleep 1

# Headless Chrome on macOS often keeps running after writing the file,
# so wait for the PNG to appear, then stop that Chrome ourselves.
shoot() { # name width height file
  rm -f "$4"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars --no-first-run \
    --user-data-dir="$PROFILE" --window-size="$2,$3" --virtual-time-budget=3500 \
    --screenshot="$PWD/$4" "http://127.0.0.1:$PORT/store/stage.html?shot=$1" >/dev/null 2>&1 &
  local pid=$! waited=0
  until [ -s "$4" ] || [ $waited -ge 60 ]; do sleep 0.5; waited=$((waited + 1)); done
  sleep 0.5
  kill "$pid" 2>/dev/null || true
  pkill -f -- "--user-data-dir=$PROFILE" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  if [ ! -s "$4" ]; then echo "  FAILED: $4" >&2; exit 1; fi
  echo "  $4"
}

# The store accepts at most 5 screenshots. stage.html also has
# shot=fomo and shot=countdown if you want to swap one in.
SHOTS="${SHOTS:-pause nudge cancelled stats privacy}"

echo "Rendering:"
rm -f "$OUT"/*.png
i=1
for name in $SHOTS; do
  shoot "$name" 1280 800 "$OUT/$i-$name.png"
  i=$((i + 1))
done
shoot tile 440 280 store/promo-tile-440x280.png
shoot og 1200 630 store/og-fomo-stopper-1200x630.png
