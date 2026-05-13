#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
INPUT_GEOJSON="$APP_ROOT/data/cbsa_joined.geojson"
OUTPUT_DIR="$APP_ROOT/data/tiles/cbsas"
TEMP_OUTPUT_DIR="$APP_ROOT/data/tiles/cbsas_tmp"
BACKUP_OUTPUT_DIR="$APP_ROOT/data/tiles/cbsas_prev"

if [[ ! -f "$INPUT_GEOJSON" ]]; then
  echo "Missing joined GeoJSON: $INPUT_GEOJSON"
  echo "Run python3 scripts/build_cbsa_joined_geojson.py first."
  exit 1
fi

python3 - <<PY
from pathlib import Path
import shutil

for raw_path in ("$TEMP_OUTPUT_DIR", "$BACKUP_OUTPUT_DIR"):
    path = Path(raw_path)
    if path.exists():
        shutil.rmtree(path, ignore_errors=True)
PY
mkdir -p "$TEMP_OUTPUT_DIR"

tippecanoe \
  --force \
  --read-parallel \
  --output-to-directory="$TEMP_OUTPUT_DIR" \
  --layer="cbsas" \
  --projection=EPSG:4326 \
  --minimum-zoom=3 \
  --maximum-zoom=9 \
  --no-feature-limit \
  --no-tile-size-limit \
  --simplify-only-low-zooms \
  --detect-shared-borders \
  --buffer=8 \
  "$INPUT_GEOJSON"

python3 - <<PY
from pathlib import Path
import shutil

output_dir = Path("$OUTPUT_DIR")
temp_output_dir = Path("$TEMP_OUTPUT_DIR")
backup_output_dir = Path("$BACKUP_OUTPUT_DIR")

if output_dir.exists():
    output_dir.rename(backup_output_dir)

temp_output_dir.rename(output_dir)

if backup_output_dir.exists():
    shutil.rmtree(backup_output_dir, ignore_errors=True)
PY

echo "Wrote CBSA tiles to $OUTPUT_DIR"
