from __future__ import annotations

import json
import re
import zipfile
from pathlib import Path
from xml.etree import ElementTree as ET

from indicator_definitions import (
    APP_ROOT,
    INDICATOR_BY_ID,
    SECTION_TITLE_ALIASES,
    WORKBOOK_COLUMN_ALIASES,
    WORKBOOK_PATH,
)


OUTPUT_PATH = APP_ROOT / "data" / "census_taxonomy.json"

MAIN_NS = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
REL_NS = {"rel": "http://schemas.openxmlformats.org/package/2006/relationships"}
DOC_REL_NS = {
    "docrel": "http://schemas.openxmlformats.org/officeDocument/2006/relationships"
}


def slugify(text: str) -> str:
    cleaned = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return cleaned or "section"


def text_or_none(value: object) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


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

    sheet_rows = []
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
        sheet_rows.append(record)

    return sheet_rows


def main() -> None:
    rows = read_sheet_rows(WORKBOOK_PATH, "dictionary_census")
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
