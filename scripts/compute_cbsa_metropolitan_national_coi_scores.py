from __future__ import annotations

import csv
import json
from pathlib import Path

import numpy as np
import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_PIPELINE_DIR = PROJECT_ROOT.parent / "data_pipeline"

CBSA_MASTER_FILE = DATA_PIPELINE_DIR / "cbsa" / "cbsa_master_table" / "cbsa_master_table.csv"
TRACT_MASTER_FILE = DATA_PIPELINE_DIR / "tract" / "tract_master_table" / "tract_master_table.csv"
CHAS_TABLE1_FILE = DATA_PIPELINE_DIR / "cbsa" / "hud_chas_2018_2022" / "Table1.csv"
CROSSWALK_FILE = (
    DATA_PIPELINE_DIR
    / "shared_geography_and_crosswalks"
    / "tract_to_cbsa_2023"
    / "tract_to_cbsa_crosswalk_2023.csv"
)

OUTPUT_JSON = PROJECT_ROOT / "data" / "cbsa_metropolitan_national_coi_scores.json"
OUTPUT_CSV = PROJECT_ROOT / "data" / "cbsa_metropolitan_national_coi_scores.csv"

METRIC_LABELS = {
    "coi_idx": "Opportunity Index",
    "coi_edu": "Education Domain",
    "coi_health_env": "Health & Environment Domain",
    "coi_soc_eco": "Social & Economic Domain",
}

RENTER_OUTPUT_COLUMNS = {
    "coi_idx": "renter_weighted_metro_national_coi_idx",
    "coi_edu": "renter_weighted_metro_national_coi_edu",
    "coi_health_env": "renter_weighted_metro_national_coi_health_env",
    "coi_soc_eco": "renter_weighted_metro_national_coi_eco",
}

HCV_OUTPUT_COLUMNS = {
    "coi_idx": "hcv_weighted_metro_national_coi_idx",
    "coi_edu": "hcv_weighted_metro_national_coi_edu",
    "coi_health_env": "hcv_weighted_metro_national_coi_health_env",
    "coi_soc_eco": "hcv_weighted_metro_national_coi_eco",
}


def standardize_chas_geoid(series: pd.Series) -> pd.Series:
    return series.astype("string").str.extract(r"(\d{11})$", expand=False)


def compute_weighted_metric(
    frame: pd.DataFrame,
    value_column: str,
    weight_column: str,
) -> dict[str, float | int]:
    valid = frame[value_column].notna() & frame[weight_column].notna()
    denominator = frame.loc[valid, weight_column].sum()
    numerator = (frame.loc[valid, value_column] * frame.loc[valid, weight_column]).sum()
    score = float(numerator / denominator) if pd.notna(denominator) and denominator > 0 else np.nan

    return {
        "score": score,
        "tract_rows_used": int(valid.sum()),
        "weight_sum": float(denominator) if pd.notna(denominator) else np.nan,
    }


def main() -> None:
    cbsa_master = pd.read_csv(
        CBSA_MASTER_FILE,
        usecols=["cbsa_code", "is_metropolitan"],
        dtype={"cbsa_code": "string"},
    )
    metro_cbsa_codes = set(
        cbsa_master.loc[cbsa_master["is_metropolitan"].eq(True), "cbsa_code"]
        .dropna()
        .astype("string")
        .tolist()
    )

    tract_master = pd.read_csv(
        TRACT_MASTER_FILE,
        usecols=["geoid", "hcv_25", *METRIC_LABELS.keys()],
        dtype={"geoid": "string"},
    )
    crosswalk = pd.read_csv(
        CROSSWALK_FILE,
        usecols=["geoid", "cbsa_code"],
        dtype={"geoid": "string", "cbsa_code": "string"},
    )
    crosswalk = crosswalk.loc[crosswalk["cbsa_code"].fillna("").str.fullmatch(r"\d{5}")].copy()
    crosswalk = crosswalk.loc[crosswalk["cbsa_code"].isin(metro_cbsa_codes)].copy()

    metro_tracts = tract_master.merge(crosswalk, on="geoid", how="inner", validate="one_to_one")

    table1 = pd.read_csv(
        CHAS_TABLE1_FILE,
        usecols=["geoid", "T1_est75"],
        dtype={"geoid": "string"},
        encoding="latin1",
    )
    table1["geoid"] = standardize_chas_geoid(table1["geoid"])
    table1["renter_households_total"] = pd.to_numeric(table1["T1_est75"], errors="coerce")

    renter_frame = metro_tracts.merge(
        table1[["geoid", "renter_households_total"]],
        on="geoid",
        how="inner",
        validate="one_to_one",
    )
    renter_negative_mask = renter_frame["renter_households_total"].lt(0)
    renter_frame.loc[renter_negative_mask, "renter_households_total"] = np.nan

    hcv_frame = metro_tracts.copy()
    hcv_frame["hcv_weight"] = pd.to_numeric(hcv_frame["hcv_25"], errors="coerce")
    hcv_negative_mask = hcv_frame["hcv_weight"].lt(0)
    hcv_frame.loc[hcv_negative_mask, "hcv_weight"] = np.nan

    renter_results: dict[str, dict[str, float | int | str]] = {}
    hcv_results: dict[str, dict[str, float | int | str]] = {}
    csv_rows: list[dict[str, object]] = []

    for input_metric, label in METRIC_LABELS.items():
        renter_metric = compute_weighted_metric(renter_frame, input_metric, "renter_households_total")
        hcv_metric = compute_weighted_metric(hcv_frame, input_metric, "hcv_weight")

        renter_results[RENTER_OUTPUT_COLUMNS[input_metric]] = {
            "label": label,
            **renter_metric,
        }
        hcv_results[HCV_OUTPUT_COLUMNS[input_metric]] = {
            "label": label,
            **hcv_metric,
        }

        csv_rows.append(
            {
                "series": "renter_weighted_metro_national",
                "metric": RENTER_OUTPUT_COLUMNS[input_metric],
                "label": label,
                "score": renter_metric["score"],
                "tract_rows_used": renter_metric["tract_rows_used"],
                "weight_sum": renter_metric["weight_sum"],
            }
        )
        csv_rows.append(
            {
                "series": "hcv_weighted_metro_national",
                "metric": HCV_OUTPUT_COLUMNS[input_metric],
                "label": label,
                "score": hcv_metric["score"],
                "tract_rows_used": hcv_metric["tract_rows_used"],
                "weight_sum": hcv_metric["weight_sum"],
            }
        )

    payload = {
        "metadata": {
            "scope": "Metropolitan CBSAs only",
            "metro_cbsa_count": len(metro_cbsa_codes),
            "tract_master_file": str(TRACT_MASTER_FILE),
            "cbsa_master_file": str(CBSA_MASTER_FILE),
            "crosswalk_file": str(CROSSWALK_FILE),
            "chas_table1_file": str(CHAS_TABLE1_FILE),
            "notes": [
                "Renter-weighted metro national scores use CHAS Table1 T1_est75 renter-occupied households as weights.",
                "HCV-weighted metro national scores use tract hcv_25 as weights.",
                "Only tracts assigned to metropolitan CBSA codes are included.",
                "Negative weights are treated as missing, following the existing CBSA extraction logic.",
            ],
        },
        "renter_weighted_metro_national": renter_results,
        "hcv_weighted_metro_national": hcv_results,
    }

    OUTPUT_JSON.write_text(json.dumps(payload, indent=2), encoding="utf-8")

    with OUTPUT_CSV.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["series", "metric", "label", "score", "tract_rows_used", "weight_sum"],
        )
        writer.writeheader()
        writer.writerows(csv_rows)

    print(f"Saved {OUTPUT_JSON}")
    print(f"Saved {OUTPUT_CSV}")
    print(f"Metropolitan CBSA count: {len(metro_cbsa_codes)}")


if __name__ == "__main__":
    main()
