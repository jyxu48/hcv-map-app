from __future__ import annotations

from pathlib import Path
import zipfile
from xml.etree import ElementTree as ET

import pandas as pd


APP_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = Path("/Users/jinyang/Desktop/processing/data_pipeline/tract")
MASTER_TABLE_PATH = DATA_ROOT / "tract_master_table" / "tract_master_table.csv"
GEOMETRY_PATH = DATA_ROOT / "backbone_id_geography" / "backbone_id_geography.geojson"
WORKBOOK_PATH = Path("/Users/jinyang/Desktop/processing/dictionary_副本.xlsx")

OUTPUT_DATA_DIR = APP_ROOT / "data"
OUTPUT_TILES_DIR = OUTPUT_DATA_DIR / "tiles" / "tracts"
JOINED_GEOJSON_PATH = OUTPUT_DATA_DIR / "tracts_joined.geojson"
INDICATORS_PATH = OUTPUT_DATA_DIR / "indicators.json"
CBSA_STATS_PATH = OUTPUT_DATA_DIR / "cbsa_stats.json"

BASE_GEOGRAPHY_FIELDS = [
    "geoid",
    "state_abbr",
    "state_name",
    "county_name",
    "cbsa_code",
    "cbsa_name",
    "metro_type",
]

WORKBOOK_COLUMN_ALIASES = {
    "mhi_tract": "median_household_income",
    "lfp_rate": "labor_force_participation_rate",
    "ba_plus_share": "bachelors_degree_or_higher_pct",
    "avg_hh_size": "average_household_size",
    "single_parent_share": "single_parent_households_pct",
    "pop_65plus_share": "population_age_65_plus_pct",
    "minority_share": "minority_share_pct",
    "rent_burdened_share": "rent_burdened_households_pct_30_plus",
    "severe_rent_burdened_share": "severely_rent_burdened_pct_50_plus",
}

SECTION_TITLE_ALIASES = {
    "Afforadable Housing Projects": "Affordable Housing Projects",
    "Housing Choice Vouchers Users": "Housing Choice Voucher Users",
}

COLOR_RAMPS = {
    "sequential_blue": ["#dbe9f5", "#b9d3e7", "#82afcd", "#4f82a8", "#1d4f82"],
    "sequential_teal": ["#ddefed", "#b7d8d3", "#7bb4ab", "#43867f", "#145d60"],
    "sequential_green": ["#e0eee4", "#bbd5c2", "#84af93", "#4f8462", "#24593d"],
    "sequential_slate": ["#dde5ec", "#bcc9d4", "#8a9bab", "#5a6c80", "#334155"],
    "categorical_binary": ["#e2e8f0", "#1d4f82"],
}

INDEX_FIELDS = {"coi_idx", "coi_edu", "coi_health_env", "coi_soc_eco", "haz_idx"}
BINARY_FIELDS = {"recap", "rcaa"}
CURRENCY_FIELDS = {
    "median_household_income",
    "median_gross_rent",
    "hcv_rent_per_month",
    "hcv_spending_per_month",
    "hcv_hh_income",
    "hcv_person_income",
    "hcv_ave_util_allow",
}
NUMBER_FIELDS = {
    "average_household_size",
    "hcv_people_per_unit",
    "hcv_months_since_report",
    "hcv_months_waiting",
    "hcv_months_from_movein",
}

MAIN_NS = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = {"rel": "http://schemas.openxmlformats.org/package/2006/relationships"}
DOC_REL_NS = {
    "docrel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
}


def text_or_none(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def canonical_indicator_id(raw_column_name: str | None) -> str | None:
    if raw_column_name is None:
        return None
    return WORKBOOK_COLUMN_ALIASES.get(raw_column_name, raw_column_name)


def load_master_columns() -> set[str]:
    return set(pd.read_csv(MASTER_TABLE_PATH, nrows=0).columns)


def col_letters_to_index(cell_ref: str) -> int:
    letters = "".join(char for char in cell_ref if char.isalpha())
    index = 0
    for char in letters:
        index = index * 26 + (ord(char.upper()) - ord("A") + 1)
    return max(index - 1, 0)


def read_shared_strings(archive: zipfile.ZipFile) -> list[str]:
    if "xl/sharedStrings.xml" not in archive.namelist():
        return []
    root = ET.fromstring(archive.read("xl/sharedStrings.xml"))
    values = []
    for si in root.findall("main:si", MAIN_NS):
        parts = [node.text or "" for node in si.findall(".//main:t", MAIN_NS)]
        values.append("".join(parts))
    return values


def resolve_sheet_path(archive: zipfile.ZipFile, sheet_name: str) -> str:
    workbook_root = ET.fromstring(archive.read("xl/workbook.xml"))
    rel_root = ET.fromstring(archive.read("xl/_rels/workbook.xml.rels"))

    rel_map = {
        rel.attrib["Id"]: rel.attrib["Target"]
        for rel in rel_root.findall("rel:Relationship", REL_NS)
    }

    for sheet in workbook_root.findall("main:sheets/main:sheet", MAIN_NS):
        if sheet.attrib.get("name") != sheet_name:
            continue
        rel_id = sheet.attrib.get(f"{{{DOC_REL_NS['docrel']}}}id")
        target = rel_map.get(rel_id)
        if not target:
            break
        normalized = target.lstrip("/")
        return normalized if normalized.startswith("xl/") else f"xl/{normalized}"

    raise ValueError(f"Sheet not found: {sheet_name}")


def cell_value(cell: ET.Element, shared_strings: list[str]) -> str | None:
    cell_type = cell.attrib.get("t")

    if cell_type == "inlineStr":
        parts = [node.text or "" for node in cell.findall(".//main:t", MAIN_NS)]
        return "".join(parts)

    value_node = cell.find("main:v", MAIN_NS)
    if value_node is None or value_node.text is None:
        return None

    raw = value_node.text
    if cell_type == "s":
        return shared_strings[int(raw)]
    return raw


def read_sheet_rows(workbook_path: Path, sheet_name: str) -> list[dict[str, str | None]]:
    with zipfile.ZipFile(workbook_path) as archive:
        shared_strings = read_shared_strings(archive)
        sheet_path = resolve_sheet_path(archive, sheet_name)
        root = ET.fromstring(archive.read(sheet_path))

    rows = []
    headers = None

    for row in root.findall("main:sheetData/main:row", MAIN_NS):
        cells = {}
        for cell in row.findall("main:c", MAIN_NS):
            ref = cell.attrib.get("r", "")
            index = col_letters_to_index(ref)
            cells[index] = cell_value(cell, shared_strings)

        if not cells:
            continue

        width = max(cells) + 1
        values = [cells.get(index) for index in range(width)]

        if headers is None:
            headers = [text_or_none(value) or f"column_{idx}" for idx, value in enumerate(values)]
            continue

        record = {}
        for idx, header in enumerate(headers):
            record[header] = values[idx] if idx < len(values) else None
        rows.append(record)

    return rows


def infer_value_type(field_id: str) -> str:
    if field_id in BINARY_FIELDS:
        return "binary"
    if field_id in INDEX_FIELDS or field_id.endswith("_idx"):
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
    if field_id in {"average_household_size", "hcv_people_per_unit"}:
        return "ratio"
    if value_type == "binary":
        return "binary"
    return "count" if value_type == "count" else "number"


def infer_palette(field_id: str, value_type: str) -> str:
    if value_type == "binary":
        return "categorical_binary"
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
    if value_type == "binary":
        return "binary"
    if value_type in {"index", "percent"}:
        return "fixed"
    return "quantile"


def build_indicator_definitions() -> list[dict]:
    master_columns = load_master_columns()
    workbook_rows = read_sheet_rows(WORKBOOK_PATH, "dictionary_census")

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

DEFAULT_INDICATOR_ID = "coi_idx" if "coi_idx" in INDICATOR_BY_ID else INDICATOR_DEFINITIONS[0]["id"]

NO_DATA_SENTINELS_BY_FIELD = {
    indicator["id"]: {-4.0, -5.0}
    for indicator in INDICATOR_DEFINITIONS
    if indicator["id"].startswith("hcv_")
}


def relevant_columns() -> list[str]:
    return BASE_GEOGRAPHY_FIELDS + [indicator["id"] for indicator in INDICATOR_DEFINITIONS]
