from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from indicator_definitions import (
    COLOR_RAMPS,
    DEFAULT_INDICATOR_ID,
    INDICATOR_DEFINITIONS,
    INDICATORS_PATH,
    MASTER_TABLE_PATH,
    NO_DATA_SENTINELS_BY_FIELD,
)


def clean_series(series: pd.Series, field_id: str) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    sentinels = NO_DATA_SENTINELS_BY_FIELD.get(field_id, set())
    if sentinels:
        numeric = numeric.mask(numeric.isin(sentinels))
    return numeric


def unique_sorted(values: list[float]) -> list[float]:
    return [float(value) for value in sorted({round(float(value), 6) for value in values})]


def build_fixed_breaks(values: pd.Series, value_type: str) -> list[float]:
    if values.empty:
        return []

    minimum = float(values.min())
    maximum = float(values.max())

    if value_type == "binary":
        return []

    if value_type == "index" and minimum >= 0 and maximum <= 100:
        return [20.0, 40.0, 60.0, 80.0]

    if value_type == "percent" and maximum <= 1.0:
        return [0.2, 0.4, 0.6, 0.8]

    if minimum == maximum:
        return [minimum]

    step = (maximum - minimum) / 5.0
    return unique_sorted([minimum + step * index for index in range(1, 5)])


def build_quantile_breaks(values: pd.Series) -> list[float]:
    if values.empty:
        return []
    quantiles = values.quantile([0.2, 0.4, 0.6, 0.8]).tolist()
    return unique_sorted(quantiles)


def build_indicator_entry(frame: pd.DataFrame, definition: dict) -> dict:
    field_id = definition["id"]
    cleaned = clean_series(frame[field_id], field_id).dropna()

    entry = {
        **definition,
        "palette_colors": COLOR_RAMPS[definition["palette"]],
        "missing_color": "#d1d5db",
        "null_label": "No data",
        "field": field_id,
        "stats": {
            "valid_count": int(cleaned.count()),
            "min": None if cleaned.empty else float(cleaned.min()),
            "max": None if cleaned.empty else float(cleaned.max()),
            "mean": None if cleaned.empty else float(cleaned.mean()),
            "median": None if cleaned.empty else float(cleaned.median()),
        },
        "breaks": {
            "fixed": build_fixed_breaks(cleaned, definition["value_type"]),
            "quantile": build_quantile_breaks(cleaned),
        },
    }
    return entry


def main() -> None:
    output_path = Path(INDICATORS_PATH)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    usecols = [definition["id"] for definition in INDICATOR_DEFINITIONS]
    frame = pd.read_csv(MASTER_TABLE_PATH, usecols=usecols, low_memory=False)

    indicators = [build_indicator_entry(frame, definition) for definition in INDICATOR_DEFINITIONS]
    payload = {
        "default_indicator": DEFAULT_INDICATOR_ID,
        "default_classification": "fixed",
        "indicator_groups": sorted({definition["group"] for definition in INDICATOR_DEFINITIONS}),
        "indicators": indicators,
    }

    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {output_path}")


if __name__ == "__main__":
    main()
