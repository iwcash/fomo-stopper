#!/usr/bin/env bash
# Build the Chrome Web Store upload: dist/fomo-stopper-<version>.zip
#
# Uses an allowlist, so test/, store/, dist/ and editor junk never ship.
# Fails before zipping if the manifest would be rejected by the store.
set -euo pipefail
cd "$(dirname "$0")"

FILES=(
  manifest.json
  content.js
  popup.html
  popup.css
  popup.js
  LICENSE
  DISCLAIMER.md
  README.md
  icons/icon16.png
  icons/icon32.png
  icons/icon48.png
  icons/icon128.png
  icons/icl-logo.png
  icons/cat.jpg
)

python3 - "${FILES[@]}" <<'EOF'
import json, os, re, struct, sys

files = set(sys.argv[1:])
errors = []

for f in files:
    if not os.path.isfile(f):
        errors.append(f"missing file: {f}")

m = json.load(open("manifest.json"))
if len(m.get("name", "")) > 75:
    errors.append(f"name is {len(m['name'])} chars (max 75)")
desc = m.get("description", "")
if len(desc) > 132:
    errors.append(f"description is {len(desc)} chars (max 132)")
if not re.fullmatch(r"\d+(\.\d+){0,3}", m.get("version", "")):
    errors.append(f"bad version: {m.get('version')!r}")

referenced = set()
for cs in m.get("content_scripts", []):
    referenced.update(cs.get("js", []) + cs.get("css", []))
referenced.add(m.get("action", {}).get("default_popup", ""))
referenced.update(m.get("icons", {}).values())
referenced.update(m.get("action", {}).get("default_icon", {}).values())
for war in m.get("web_accessible_resources", []):
    referenced.update(war.get("resources", []))
referenced.discard("")
for f in sorted(referenced - files):
    errors.append(f"manifest references {f} but it is not packaged")

def png_size(path):
    with open(path, "rb") as fh:
        head = fh.read(24)
    if head[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    return struct.unpack(">II", head[16:24])

for size, path in {**m.get("icons", {}), **m.get("action", {}).get("default_icon", {})}.items():
    if os.path.isfile(path):
        got = png_size(path)
        if got != (int(size), int(size)):
            errors.append(f"{path} should be {size}x{size} PNG, got {got}")

network = re.compile(r"fetch\(|XMLHttpRequest|WebSocket|sendBeacon|EventSource|importScripts")
for f in files:
    if f.endswith((".js", ".html")) and os.path.isfile(f):
        if network.search(open(f, encoding="utf-8").read()):
            errors.append(f"{f} contains a network API; the extension must stay 100% local")

if errors:
    print("Package check FAILED:")
    for e in errors:
        print("  -", e)
    sys.exit(1)
print(f"Package check passed: {m['name']} {m['version']}, description {len(desc)}/132 chars")
EOF

VERSION=$(python3 -c "import json; print(json.load(open('manifest.json'))['version'])")
OUT="dist/fomo-stopper-${VERSION}.zip"
mkdir -p dist
rm -f "$OUT"
zip -q -X "$OUT" "${FILES[@]}"
echo "Built $OUT ($(du -h "$OUT" | cut -f1 | tr -d ' '))"
unzip -l "$OUT"
