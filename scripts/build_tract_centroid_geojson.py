from __future__ import annotations

import json
from pathlib import Path

import shapefile

from build_joined_geojson import load_master_lookup


APP_ROOT = Path(__file__).resolve().parents[1]
SHAPEFILE_PATH = Path(
    "/Users/jinyang/Desktop/processing/data_pipeline/tract/backbone_id_geography/cb_2022_us_tract_500k/cb_2022_us_tract_500k.shp"
)
OUTPUT_GEOJSON_PATH = APP_ROOT / "data" / "tract_centroids.geojson"
EPSILON = 1e-12


def average_point(points: list[tuple[float, float]]) -> tuple[float, float] | None:
    if not points:
        return None
    x = sum(point[0] for point in points) / len(points)
    y = sum(point[1] for point in points) / len(points)
    return (x, y)


def compute_ring_centroid(ring: list[list[float]] | list[tuple[float, float]]) -> tuple[float, tuple[float, float] | None]:
    normalized_ring = [(float(point[0]), float(point[1])) for point in ring]
    if len(normalized_ring) > 1 and normalized_ring[0] == normalized_ring[-1]:
        normalized_ring = normalized_ring[:-1]

    if len(normalized_ring) < 3:
        return 0.0, average_point(normalized_ring)

    area_twice = 0.0
    centroid_x = 0.0
    centroid_y = 0.0

    for current, nxt in zip(normalized_ring, normalized_ring[1:] + [normalized_ring[0]]):
        cross = current[0] * nxt[1] - nxt[0] * current[1]
        area_twice += cross
        centroid_x += (current[0] + nxt[0]) * cross
        centroid_y += (current[1] + nxt[1]) * cross

    if abs(area_twice) < EPSILON:
        return 0.0, average_point(normalized_ring)

    return area_twice / 2.0, (centroid_x / (3.0 * area_twice), centroid_y / (3.0 * area_twice))


def combine_centroids(parts: list[tuple[float, tuple[float, float] | None]]) -> tuple[float, float] | None:
    total_area = 0.0
    centroid_x = 0.0
    centroid_y = 0.0
    fallback_points: list[tuple[float, float]] = []

    for area, centroid in parts:
        if centroid is None:
            continue
        fallback_points.append(centroid)
        if abs(area) < EPSILON:
            continue
        total_area += area
        centroid_x += centroid[0] * area
        centroid_y += centroid[1] * area

    if abs(total_area) >= EPSILON:
        return (centroid_x / total_area, centroid_y / total_area)

    return average_point(fallback_points)


def compute_geometry_centroid(geometry: dict, bbox: list[float] | None = None) -> tuple[float, float] | None:
    geometry_type = geometry.get("type")
    coordinates = geometry.get("coordinates") or []

    if geometry_type == "Polygon":
        centroid = combine_centroids([compute_ring_centroid(ring) for ring in coordinates])
        if centroid:
            return centroid
    elif geometry_type == "MultiPolygon":
        centroid = combine_centroids(
            [compute_ring_centroid(ring) for polygon in coordinates for ring in polygon]
        )
        if centroid:
            return centroid

    if bbox and len(bbox) == 4:
        return ((bbox[0] + bbox[2]) / 2.0, (bbox[1] + bbox[3]) / 2.0)

    return None


def main() -> None:
    if not SHAPEFILE_PATH.exists():
        raise FileNotFoundError(f"Missing shapefile: {SHAPEFILE_PATH}")

    OUTPUT_GEOJSON_PATH.parent.mkdir(parents=True, exist_ok=True)

    master_lookup = load_master_lookup()
    reader = shapefile.Reader(str(SHAPEFILE_PATH))

    feature_count = 0
    missing_geoids = 0
    missing_centroids = 0

    with OUTPUT_GEOJSON_PATH.open("w", encoding="utf-8") as handle:
        handle.write('{"type":"FeatureCollection","features":[')
        wrote_feature = False

        for shape_record in reader.iterShapeRecords():
            record = shape_record.record.as_dict()
            geoid = record.get("GEOID")
            if not geoid:
                continue

            joined_props = master_lookup.get(geoid)
            if joined_props is None:
                missing_geoids += 1
                continue

            shape = shape_record.shape
            centroid = compute_geometry_centroid(shape.__geo_interface__, shape.bbox)
            if centroid is None:
                missing_centroids += 1
                continue

            feature = {
                "type": "Feature",
                "properties": joined_props,
                "geometry": {
                    "type": "Point",
                    "coordinates": [centroid[0], centroid[1]],
                },
            }

            if wrote_feature:
                handle.write(",")
            handle.write(json.dumps(feature, separators=(",", ":")))
            wrote_feature = True
            feature_count += 1

        handle.write("]}")

    print(f"Wrote {OUTPUT_GEOJSON_PATH}")
    print(f"Centroid features: {feature_count}")
    print(f"Missing master-table matches: {missing_geoids}")
    print(f"Missing centroid geometry: {missing_centroids}")


if __name__ == "__main__":
    main()
