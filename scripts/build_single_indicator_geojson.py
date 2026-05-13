from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path

from indicator_definitions import GEOMETRY_PATH, MASTER_TABLE_PATH, OUTPUT_DATA_DIR


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build a single-indicator tract GeoJSON.")
    parser.add_argument("--indicator", default="coi_idx")
    parser.add_argument("--output", default=None)
    return parser.parse_args()


def normalize_value(raw_value: str) -> float | None:
    if raw_value is None or raw_value == "":
        return None
    try:
        return float(raw_value)
    except ValueError:
        return None


def load_indicator_lookup(indicator: str) -> dict[str, float | None]:
    lookup: dict[str, float | None] = {}
    with MASTER_TABLE_PATH.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            lookup[row["geoid"]] = normalize_value(row.get(indicator, ""))
    return lookup


def main() -> None:
    args = parse_args()
    indicator = args.indicator
    output_path = (
        Path(args.output)
        if args.output
        else OUTPUT_DATA_DIR / f"{indicator}_only.geojson"
    )
    output_path.parent.mkdir(parents=True, exist_ok=True)

    lookup = load_indicator_lookup(indicator)
    with GEOMETRY_PATH.open(encoding="utf-8") as handle:
        geometry_collection = json.load(handle)

    features = []
    missing = 0
    for feature in geometry_collection["features"]:
        geoid = feature["properties"]["geoid"]
        if geoid not in lookup:
            missing += 1
            continue
        value = lookup[geoid]
        features.append(
            {
                "type": "Feature",
                "properties": {
                    "geoid": geoid,
                    indicator: value,
                },
                "geometry": feature["geometry"],
            }
        )

    output = {"type": "FeatureCollection", "features": features}
    output_path.write_text(json.dumps(output), encoding="utf-8")
    print(f"Wrote {output_path}")
    print(f"Feature count: {len(features)}")
    print(f"Missing matches: {missing}")


if __name__ == "__main__":
    main()
