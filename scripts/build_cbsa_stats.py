from __future__ import annotations

import json
from pathlib import Path

import pandas as pd

from indicator_definitions import (
    CBSA_STATS_PATH,
    INDICATOR_DEFINITIONS,
    MASTER_TABLE_PATH,
    NO_DATA_SENTINELS_BY_FIELD,
)


def clean_series(series: pd.Series, field_id: str) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce")
    sentinels = NO_DATA_SENTINELS_BY_FIELD.get(field_id, set())
    if sentinels:
        numeric = numeric.mask(numeric.isin(sentinels))
    return numeric


def build_indicator_stats(values: pd.Series) -> dict | None:
    cleaned = values.dropna()
    if cleaned.empty:
        return None
    return {
        "count": int(cleaned.count()),
        "mean": float(cleaned.mean()),
        "median": float(cleaned.median()),
        "min": float(cleaned.min()),
        "max": float(cleaned.max()),
        "p10": float(cleaned.quantile(0.10)),
        "p25": float(cleaned.quantile(0.25)),
        "p75": float(cleaned.quantile(0.75)),
        "p90": float(cleaned.quantile(0.90)),
    }


def main() -> None:
    output_path = Path(CBSA_STATS_PATH)
    output_path.parent.mkdir(parents=True, exist_ok=True)

    indicator_fields = [definition["id"] for definition in INDICATOR_DEFINITIONS]
    usecols = ["cbsa_code", "cbsa_name"] + indicator_fields
    frame = pd.read_csv(MASTER_TABLE_PATH, usecols=usecols, low_memory=False)

    for field_id in indicator_fields:
        frame[field_id] = clean_series(frame[field_id], field_id)

    grouped = frame.groupby(["cbsa_code", "cbsa_name"], dropna=False, sort=True)

    payload = {}
    for (cbsa_code, cbsa_name), group in grouped:
        code = "" if pd.isna(cbsa_code) else str(cbsa_code)
        name = "" if pd.isna(cbsa_name) else str(cbsa_name)
        indicator_stats = {}
        for definition in INDICATOR_DEFINITIONS:
            stats = build_indicator_stats(group[definition["id"]])
            if stats is not None:
                indicator_stats[definition["id"]] = stats
        payload[code] = {
            "cbsa_name": name,
            "tract_count": int(len(group)),
            "indicators": indicator_stats,
        }

    output_path.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {output_path}")


if __name__ == "__main__":
    main()
