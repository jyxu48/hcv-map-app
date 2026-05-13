from __future__ import annotations

from pathlib import Path

import pandas as pd

from indicator_definitions import (
    APP_ROOT,
    COLOR_RAMPS,
    SECTION_TITLE_ALIASES,
    WORKBOOK_PATH,
    read_sheet_rows,
    text_or_none,
)


DATA_ROOT = Path("/Users/jinyang/Desktop/processing/data_pipeline/cbsa")
MASTER_TABLE_PATH = DATA_ROOT / "cbsa_master_table" / "cbsa_master_table.csv"
GEOMETRY_PATH = Path(
    "/Users/jinyang/Desktop/processing/data_pipeline/shared_geography_and_crosswalks/"
    "cbsa_boundaries_2023/Core_based_statistical_area_for_the_US_July_2023_3769685354379046903.geojson"
)

OUTPUT_DATA_DIR = APP_ROOT / "data"
JOINED_GEOJSON_PATH = OUTPUT_DATA_DIR / "cbsa_joined.geojson"
INDICATORS_PATH = OUTPUT_DATA_DIR / "cbsa_indicators.json"
TAXONOMY_PATH = OUTPUT_DATA_DIR / "cbsa_taxonomy.json"

BASE_GEOGRAPHY_FIELDS = [
    "cbsa_code",
    "cbsa_name",
    "cbsa_name_full",
    "cbsa_type",
    "is_metropolitan",
    "is_micropolitan",
    "lsad_code",
    "aland",
    "awater",
    "intptlat",
    "intptlon",
]

WORKBOOK_COLUMN_ALIASES = {
    "recap": "recap_share",
    "rcaa": "rcaa_share",
    "coi_idx": "renter_coi_idx",
    "coi_edu": "renter_coi_edu",
    "coi_health_env": "renter_coi_health_env",
    "coi_soc_eco": "renter_coi_eco",
}

INDEX_FIELDS = {
    "hcv_coi_idx",
    "hcv_coi_edu",
    "hcv_coi_health_env",
    "hcv_coi_eco",
    "renter_coi_idx",
    "renter_coi_edu",
    "renter_coi_health_env",
    "renter_coi_eco",
}

CURRENCY_FIELDS = {
    "median_hh_income",
    "median_gross_rent",
    "hcv_rent_per_month",
    "hcv_spending_per_month",
    "hcv_hh_income",
    "hcv_person_income",
    "hcv_ave_util_allow",
    "hcv_median_gross_rent",
    "hcv_median_hh_income",
}

NUMBER_FIELDS = {
    "hcv_people_per_unit",
    "hcv_months_since_report",
    "hcv_months_waiting",
    "hcv_months_from_movein",
}


def canonical_indicator_id(raw_column_name: str | None) -> str | None:
    if raw_column_name is None:
        return None
    return WORKBOOK_COLUMN_ALIASES.get(raw_column_name, raw_column_name)


def load_master_columns() -> set[str]:
    return set(pd.read_csv(MASTER_TABLE_PATH, nrows=0).columns)


def infer_value_type(field_id: str) -> str:
    if field_id in INDEX_FIELDS:
        return "index"
    if field_id in CURRENCY_FIELDS:
        return "currency"
    if field_id in NUMBER_FIELDS:
        return "number"
    if (
        field_id.endswith("_rate")
        or field_id.endswith("_share")
        or field_id.endswith("_pct")
        or "_pct_" in field_id
        or field_id.startswith("hcv_pct_")
    ):
        return "percent"
    return "count"


def infer_unit(field_id: str, value_type: str) -> str:
    if value_type == "currency":
        return "USD"
    if value_type == "percent":
        return "percent"
    if value_type == "index":
        return "index"
    if field_id in {
        "hcv_months_since_report",
        "hcv_months_waiting",
        "hcv_months_from_movein",
    }:
        return "months"
    if field_id in {"hcv_people_per_unit"}:
        return "ratio"
    return "count" if value_type == "count" else "number"


def infer_palette(field_id: str, value_type: str) -> str:
    if value_type == "currency":
        return "sequential_green"
    if value_type == "percent":
        return "sequential_teal"
    if value_type == "index":
        return "sequential_blue"
    if field_id.startswith(("aqv_", "pvn_", "vng_", "em_", "hcv_")):
        return "sequential_slate"
    return "sequential_blue"


def infer_default_classification(value_type: str) -> str:
    if value_type in {"index", "percent"}:
        return "fixed"
    return "quantile"


def build_indicator_definitions() -> list[dict]:
    master_columns = load_master_columns()
    workbook_rows = read_sheet_rows(WORKBOOK_PATH, "dictionary_cbsa")

    definitions: list[dict] = []
    seen_ids: set[str] = set()
    current_section = "Other"

    for row in workbook_rows:
        indicator_name = text_or_none(row.get("Indicator Name"))
        raw_column_name = text_or_none(row.get("Column Name"))

        if raw_column_name is None:
            if indicator_name is not None:
                current_section = SECTION_TITLE_ALIASES.get(indicator_name, indicator_name)
            continue

        indicator_id = canonical_indicator_id(raw_column_name)
        if indicator_id is None or indicator_id not in master_columns or indicator_id in seen_ids:
            continue

        value_type = infer_value_type(indicator_id)
        source_dataset = text_or_none(row.get("Source Dataset"))
        description = text_or_none(row.get("Conceptual Definition"))

        definitions.append(
            {
                "id": indicator_id,
                "label": indicator_name or indicator_id,
                "group": current_section,
                "description": description or "",
                "unit": infer_unit(indicator_id, value_type),
                "value_type": value_type,
                "palette": infer_palette(indicator_id, value_type),
                "default_classification": infer_default_classification(value_type),
                "year_label": source_dataset or "",
            }
        )
        seen_ids.add(indicator_id)

    return definitions


INDICATOR_DEFINITIONS = build_indicator_definitions()
INDICATOR_BY_ID = {indicator["id"]: indicator for indicator in INDICATOR_DEFINITIONS}

DEFAULT_INDICATOR_ID = (
    "renter_coi_idx"
    if "renter_coi_idx" in INDICATOR_BY_ID
    else INDICATOR_DEFINITIONS[0]["id"]
)

NO_DATA_SENTINELS_BY_FIELD = {
    indicator["id"]: {-4.0, -5.0}
    for indicator in INDICATOR_DEFINITIONS
    if indicator["id"].startswith("hcv_")
}

