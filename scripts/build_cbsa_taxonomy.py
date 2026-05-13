from __future__ import annotations

import json
import re
from pathlib import Path

from cbsa_indicator_definitions import (
    APP_ROOT,
    INDICATOR_BY_ID,
    SECTION_TITLE_ALIASES,
    WORKBOOK_COLUMN_ALIASES,
    WORKBOOK_PATH,
)
from indicator_definitions import read_sheet_rows, text_or_none


OUTPUT_PATH = APP_ROOT / "data" / "cbsa_taxonomy.json"


def slugify(text: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return cleaned or "section"


def main() -> None:
    rows = read_sheet_rows(WORKBOOK_PATH, "dictionary_cbsa")
    sections = []
    current_section = None

    for row in rows:
        indicator_name = text_or_none(row.get("Indicator Name"))
        column_name = text_or_none(row.get("Column Name"))

        if column_name is None:
            if indicator_name is None:
                current_section = None
                continue
            title = SECTION_TITLE_ALIASES.get(indicator_name, indicator_name)
            current_section = {"id": slugify(title), "title": title, "items": []}
            sections.append(current_section)
            continue

        indicator_id = WORKBOOK_COLUMN_ALIASES.get(column_name, column_name)
        if indicator_id not in INDICATOR_BY_ID:
            continue

        if current_section is None:
            current_section = {"id": "other", "title": "Other", "items": []}
            sections.append(current_section)

        current_section["items"].append(
            {
                "indicator_id": indicator_id,
                "label": indicator_name or INDICATOR_BY_ID[indicator_id]["label"],
                "definition": text_or_none(row.get("Conceptual Definition")),
                "level": text_or_none(row.get("Level")),
                "source_dataset": text_or_none(row.get("Source Dataset")),
                "source_link": text_or_none(row.get("source data link")),
                "variable_type": text_or_none(row.get("Variable Type\xa0")),
            }
        )

    payload = {"sections": [section for section in sections if section["items"]]}
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Wrote {OUTPUT_PATH}")


if __name__ == "__main__":
    main()

