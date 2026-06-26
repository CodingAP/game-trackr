#!/bin/sh
set -e

ROOT="$(CDPATH= cd -- "$(dirname "$0")/.." && pwd)"
ICON_DIR="$ROOT/frontend/public/icons"
OUT_DIR="$ROOT/public/icons"

mkdir -p "$ICON_DIR" "$OUT_DIR"

if command -v rsvg-convert >/dev/null 2>&1; then
  rsvg-convert -w 180 -h 180 "$ROOT/frontend/public/icon.svg" -o "$ICON_DIR/icon-180.png"
  rsvg-convert -w 192 -h 192 "$ROOT/frontend/public/icon.svg" -o "$ICON_DIR/icon-192.png"
  rsvg-convert -w 512 -h 512 "$ROOT/frontend/public/icon.svg" -o "$ICON_DIR/icon-512.png"
  rsvg-convert -w 512 -h 512 "$ROOT/frontend/public/icon-maskable.svg" -o "$ICON_DIR/icon-maskable-512.png"
else
  echo "rsvg-convert not found; using committed icon PNGs"
fi

cp "$ICON_DIR"/*.png "$OUT_DIR"/
