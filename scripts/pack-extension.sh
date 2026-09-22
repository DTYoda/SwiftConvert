#!/usr/bin/env bash
# Build a curated Chrome Web Store / Firefox AMO ZIP for SwiftConvert.
# Keeps ffmpeg.wasm (required for A/V) but excludes demo fixtures, git, and node_modules.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="$(python3 -c "import json; print(json.load(open('$ROOT/manifest.json'))['version'])")"
OUT_DIR="$ROOT/dist"
ZIP_NAME="swiftconvert-${VERSION}.zip"
ZIP_PATH="$OUT_DIR/$ZIP_NAME"

mkdir -p "$OUT_DIR"
rm -f "$ZIP_PATH"

# Stage a clean tree so we never ship developer-only paths.
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/icons" "$STAGE/src" "$STAGE/scripts"

# Manifest + icons (PNG set only; skip icons/src tooling + node_modules)
cp "$ROOT/manifest.json" "$STAGE/"
cp "$ROOT"/icons/icon*.png "$STAGE/icons/"

# Extension source (exclude macOS junk)
rsync -a \
  --exclude '.DS_Store' \
  --exclude '**/node_modules/' \
  --exclude '**/*.map' \
  "$ROOT/src/" "$STAGE/src/"

# Optional: include pack script for reproducibility (not required at runtime)
cp "$ROOT/scripts/pack-extension.sh" "$STAGE/scripts/"

# Docs useful for AMO source review (small)
for f in PRIVACY.md LICENSE STORE.md CHANGELOG.md README.md; do
  if [[ -f "$ROOT/$f" ]]; then
    cp "$ROOT/$f" "$STAGE/"
  fi
done
if [[ -f "$ROOT/src/lib/vendor/NOTICE.md" ]]; then
  mkdir -p "$STAGE/src/lib/vendor"
  cp "$ROOT/src/lib/vendor/NOTICE.md" "$STAGE/src/lib/vendor/NOTICE.md"
fi

(
  cd "$STAGE"
  zip -r -q "$ZIP_PATH" . \
    -x '*.DS_Store' \
    -x '*node_modules*' \
    -x '*.git*' \
    -x 'demo/*' \
    -x 'icons/src/*'
)

BYTES="$(wc -c < "$ZIP_PATH" | tr -d ' ')"
MB="$(python3 -c "print(round($BYTES / (1024*1024), 1))")"
echo "Wrote $ZIP_PATH (${MB} MB)"
echo "Excluded: .git, demo/, icons/src/, node_modules, *.map"
ls -lh "$ZIP_PATH"
