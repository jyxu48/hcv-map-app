#!/bin/zsh

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$APP_ROOT"

python3 scripts/build_indicator_metadata.py
python3 scripts/build_census_taxonomy.py
python3 scripts/build_cbsa_stats.py
python3 scripts/build_joined_geojson.py
python3 scripts/build_tract_centroid_geojson.py
./scripts/build_tiles.sh
./scripts/build_tract_centroid_tiles.sh

echo "Build completed."
