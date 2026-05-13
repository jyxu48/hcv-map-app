#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INDICATOR="${1:-coi_idx}"
INPUT_GEOJSON="$APP_ROOT/data/${INDICATOR}_only.geojson"
OUTPUT_DIR="$APP_ROOT/data/tiles_${INDICATOR}"
LAYER_NAME="tracts_${INDICATOR}"

if [[ ! -f "$INPUT_GEOJSON" ]]; then
  echo "Missing single-indicator GeoJSON: $INPUT_GEOJSON"
  echo "Run build_single_indicator_geojson.py first."
  exit 1
fi

rm -rf "$OUTPUT_DIR"
mkdir -p "$OUTPUT_DIR"

tippecanoe \
  --force \
  --read-parallel \
  --output-to-directory="$OUTPUT_DIR" \
  --layer="$LAYER_NAME" \
  --projection=EPSG:4326 \
  --minimum-zoom=3 \
  --maximum-zoom=9 \
  --extend-zooms-if-still-dropping \
  --drop-densest-as-needed \
  --buffer=4 \
  "$INPUT_GEOJSON"

echo "Wrote tiles to $OUTPUT_DIR"
