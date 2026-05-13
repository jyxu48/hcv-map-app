(function () {
  const TILE_URL = `${window.location.origin}/data/tiles_coi_idx/{z}/{x}/{y}.pbf`;
  const SOURCE_ID = "tracts-coi";
  const SOURCE_LAYER = "tracts_coi_idx";

  const logEl = document.getElementById("debug-log");
  const statusEl = document.getElementById("map-status");
  const countEl = document.getElementById("feature-count");
  const clickedEl = document.getElementById("clicked-tract");
  const logLines = [];
  let sourceReadyLogged = false;
  let selectedFeatureId = null;

  function log(message) {
    const stamp = new Date().toLocaleTimeString();
    logLines.push(`[${stamp}] ${message}`);
    while (logLines.length > 12) {
      logLines.shift();
    }
    logEl.textContent = logLines.join("\n");
  }

  function updateStatus(message) {
    statusEl.textContent = message;
    log(message);
  }

  log(`tile URL template: ${TILE_URL}`);

  const map = new maplibregl.Map({
    container: "map",
    center: [-96, 38.7],
    zoom: 3.4,
    minZoom: 2.5,
    maxZoom: 10,
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    style: {
      version: 8,
      sources: {
        osm: {
          type: "raster",
          tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
          tileSize: 256,
          attribution: "&copy; OpenStreetMap contributors",
        },
      },
      layers: [{ id: "osm", type: "raster", source: "osm" }],
    },
  });

  // Keep navigation simple: pan and zoom only, no rotation or pitch.
  if (map.dragRotate) {
    map.dragRotate.disable();
  }
  if (map.touchZoomRotate) {
    map.touchZoomRotate.disableRotation();
  }
  if (map.touchPitch && typeof map.touchPitch.disable === "function") {
    map.touchPitch.disable();
  }
  if (map.keyboard && typeof map.keyboard.disableRotation === "function") {
    map.keyboard.disableRotation();
  }
  if (typeof map.setPitch === "function") {
    map.setPitch(0);
  }
  if (typeof map.setBearing === "function") {
    map.setBearing(0);
  }

  function updateVisibleCount() {
    if (!map.getLayer("coi-fill")) {
      return;
    }
    const features = map.queryRenderedFeatures(undefined, { layers: ["coi-fill"] });
    const ids = new Set(features.map((feature) => feature.properties.geoid));
    countEl.textContent = String(ids.size);
  }

  map.on("load", () => {
    updateStatus("map load event fired");

    map.addSource(SOURCE_ID, {
      type: "vector",
      tiles: [TILE_URL],
      minzoom: 3,
      maxzoom: 9,
      promoteId: { [SOURCE_LAYER]: "geoid" },
    });
    log("vector source added");

    map.addLayer({
      id: "coi-fill",
      type: "fill",
      source: SOURCE_ID,
      "source-layer": SOURCE_LAYER,
      paint: {
        "fill-color": [
          "case",
          ["!", ["has", "coi_idx"]],
          "#d1d5db",
          [
            "step",
            ["get", "coi_idx"],
            "#f7fbff",
            20, "#c6dbef",
            40, "#6baed6",
            60, "#2171b5",
            80, "#08306b",
          ],
        ],
        "fill-opacity": 0.78,
      },
    });
    log("fill layer added");

    map.addLayer({
      id: "coi-line",
      type: "line",
      source: SOURCE_ID,
      "source-layer": SOURCE_LAYER,
      paint: {
        "line-color": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          "#ffffff",
          "rgba(31, 41, 55, 0.20)",
        ],
        "line-width": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          2.4,
          0.25,
        ],
      },
    });
    log("line layer added");

    map.on("click", "coi-fill", (event) => {
      const feature = event.features && event.features[0];
      if (!feature) {
        return;
      }
      const geoid = feature.properties.geoid;
      const value = feature.properties.coi_idx;
      const featureId = feature.id ?? geoid;

      if (selectedFeatureId && selectedFeatureId !== featureId) {
        map.setFeatureState(
          { source: SOURCE_ID, sourceLayer: SOURCE_LAYER, id: selectedFeatureId },
          { selected: false },
        );
      }

      selectedFeatureId = featureId;
      map.setFeatureState(
        { source: SOURCE_ID, sourceLayer: SOURCE_LAYER, id: selectedFeatureId },
        { selected: true },
      );

      clickedEl.textContent = `${geoid} | coi_idx=${value}`;
      log(`clicked tract ${geoid} coi_idx=${value}`);
    });

    map.on("moveend", updateVisibleCount);
    map.once("idle", () => {
      updateStatus("ready");
      updateVisibleCount();
      log("initial render complete");
    });
  });

  map.on("error", (event) => {
    const message = event && event.error ? event.error.message : "unknown map error";
    if (/404|not found/i.test(message)) {
      return;
    }
    updateStatus(`map error: ${message}`);
  });

  map.on("sourcedata", (event) => {
    if (event.sourceId !== SOURCE_ID) {
      return;
    }
    if (event.isSourceLoaded && !sourceReadyLogged) {
      sourceReadyLogged = true;
      log("vector source fully loaded");
    }
  });

  updateStatus("map booting");
})();
