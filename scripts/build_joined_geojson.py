from __future__ import annotations

import csv
import json
from pathlib import Path

from indicator_definitions import (
    BASE_GEOGRAPHY_FIELDS,
    GEOMETRY_PATH,
    INDICATOR_DEFINITIONS,
    JOINED_GEOJSON_PATH,
    MASTER_TABLE_PATH,
    NO_DATA_SENTINELS_BY_FIELD,
)


def normalize_value(field_id: str, raw_value: str) -> float | int | None:
    if raw_value is None or raw_value == "":
        return None
    try:
        value = float(raw_value)
    except ValueError:
        return raw_value

    if value in NO_DATA_SENTINELS_BY_FIELD.get(field_id, set()):
        return None

    if field_id in {"recap", "rcaa"}:
        return int(value)

    return value


def load_master_lookup() -> dict[str, dict]:
    indicator_fields = [definition["id"] for definition in INDICATOR_DEFINITIONS]
    wanted_fields = BASE_GEOGRAPHY_FIELDS + indicator_fields
    lookup: dict[str, dict] = {}

    with MASTER_TABLE_PATH.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            geoid = row["geoid"]
            props = {}
            for field in BASE_GEOGRAPHY_FIELDS:
                props[field] = row[field]
            for field in indicator_fields:
                props[field] = normalize_value(field, row[field])
            lookup[geoid] = props

    return lookup


def main() -> None:
    output_path = Path(JOINED_GEOJSON_PATH)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    master_lookup = load_master_lookup()
    with GEOMETRY_PATH.open(encoding="utf-8") as handle:
        geometry_collection = json.load(handle)

    joined_features = []
    missing_geoids = []
    for feature in geometry_collection["features"]:
        geometry_props = feature["properties"]
        geoid = geometry_props["geoid"]
        joined_props = master_lookup.get(geoid)
        if joined_props is None:
            missing_geoids.append(geoid)
            continue

        joined_features.append(
            {
                "type": "Feature",
                "properties": joined_props,
                "geometry": feature["geometry"],
            }
        )

    payload = {
        "type": "FeatureCollection",
        "features": joined_features,
    }
    output_path.write_text(json.dumps(payload), encoding="utf-8")

    print(f"Wrote {output_path}")
    print(f"Joined features: {len(joined_features)}")
    print(f"Missing geometry matches: {len(missing_geoids)}")


if __name__ == "__main__":
    main()
