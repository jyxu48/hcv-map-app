from __future__ import annotations

import csv
import json
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SOURCE_CSV = PROJECT_ROOT.parent / "national_medians_from_dictionary.csv"
TARGET_CSV = PROJECT_ROOT / "data" / "national_medians_from_dictionary.csv"
TARGET_JSON = PROJECT_ROOT / "data" / "national_medians.json"

SHEET_TO_LEVEL = {
    "dictionary_census": "tract",
    "dictionary_cbsa": "cbsa",
}


def parse_float(value: str) -> float | None:
    if value is None:
        return None
    stripped = value.strip()
    if not stripped:
        return None
    try:
        return float(stripped)
    except ValueError:
        return None


def main() -> None:
    if not SOURCE_CSV.exists():
        raise FileNotFoundError(f"Missing source CSV: {SOURCE_CSV}")

    TARGET_CSV.parent.mkdir(parents=True, exist_ok=True)
    TARGET_CSV.write_bytes(SOURCE_CSV.read_bytes())

    grouped: dict[str, dict[str, dict[str, object]]] = {"tract": {}, "cbsa": {}}

    with SOURCE_CSV.open(newline="", encoding="utf-8") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            level = SHEET_TO_LEVEL.get((row.get("sheet") or "").strip())
            indicator_id = (row.get("indicator") or row.get("master_column") or "").strip()
            median = parse_float(row.get("national_median") or "")

            if not level or not indicator_id or median is None:
                continue

            grouped[level][indicator_id] = {
                "indicator": indicator_id,
                "indicator_name": (row.get("indicator_name") or "").strip(),
                "source_dataset": (row.get("source_dataset") or "").strip(),
                "level_label": (row.get("level") or "").strip(),
                "non_missing_n": int((row.get("non_missing_n") or "0").strip() or 0),
                "national_median": median,
                "status": (row.get("status") or "").strip(),
            }

    payload = {
        "tract": grouped["tract"],
        "cbsa": grouped["cbsa"],
    }

    with TARGET_JSON.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2)
        handle.write("\n")

    print(f"Copied {SOURCE_CSV} -> {TARGET_CSV}")
    print(f"Wrote {TARGET_JSON}")
    print(f"Tract indicators: {len(grouped['tract'])}")
    print(f"CBSA indicators: {len(grouped['cbsa'])}")


if __name__ == "__main__":
    main()
