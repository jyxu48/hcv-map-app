from __future__ import annotations

import csv
import json
from pathlib import Path

from cbsa_indicator_definitions import (
    BASE_GEOGRAPHY_FIELDS,
    GEOMETRY_PATH,
    INDICATOR_DEFINITIONS,
    JOINED_GEOJSON_PATH,
    MASTER_TABLE_PATH,
    NO_DATA_SENTINELS_BY_FIELD,
)


def normalize_value(field_id: str, raw_value: str):
    if raw_value is None or raw_value == "":
        return None
    try:
        value = float(raw_value)
    except ValueError:
        return raw_value

    if value in NO_DATA_SENTINELS_BY_FIELD.get(field_id, set()):
        return None

    return value


def load_master_lookup() -> dict[str, dict]:
    indicator_fields = [definition["id"] for definition in INDICATOR_DEFINITIONS]
    lookup: dict[str, dict] = {}

    with MASTER_TABLE_PATH.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            cbsa_code = str(row["cbsa_code"]).strip()
            props = {}
            for field in BASE_GEOGRAPHY_FIELDS:
                props[field] = normalize_value(field, row[field])
            props["cbsa_code"] = cbsa_code
            for field in indicator_fields:
                props[field] = normalize_value(field, row[field])
            lookup[cbsa_code] = props

    return lookup


def main() -> None:
    output_path = Path(JOINED_GEOJSON_PATH)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    master_lookup = load_master_lookup()
    with GEOMETRY_PATH.open(encoding="utf-8") as handle:
        geometry_collection = json.load(handle)

    joined_features = []
    missing_codes = []
    for feature in geometry_collection["features"]:
        geometry_props = feature["properties"]
        cbsa_code = str(geometry_props["CBSACODE"]).strip()
        joined_props = master_lookup.get(cbsa_code)
        if joined_props is None:
            missing_codes.append(cbsa_code)
            continue

        joined_features.append(
            {
                "type": "Feature",
                "id": cbsa_code,
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
    print(f"Missing geometry matches: {len(missing_codes)}")


if __name__ == "__main__":
    main()
