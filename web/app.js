const APP_BASE_URL = new URL("..", import.meta.url).href.replace(/\/$/, "");
const TILE_BASE_URL = "https://pub-10c7a92e75f84b81a7c9222224870d28.r2.dev/data/tiles";
const TRACT_INDICATORS_URL = `${APP_BASE_URL}/data/indicators.json`;
const TRACT_TAXONOMY_URL = `${APP_BASE_URL}/data/census_taxonomy.json`;
const CBSA_STATS_URL = `${APP_BASE_URL}/data/cbsa_stats.json`;
const NATIONAL_MEDIANS_URL = `${APP_BASE_URL}/data/national_medians.json`;
const TRACT_TILE_URL = `${TILE_BASE_URL}/tracts/{z}/{x}/{y}.pbf`;
const TRACT_CENTROID_TILE_URL = `${TILE_BASE_URL}/tract_centroids/{z}/{x}/{y}.pbf`;
const CBSA_INDICATORS_URL = `${APP_BASE_URL}/data/cbsa_indicators.json`;
const CBSA_TAXONOMY_URL = `${APP_BASE_URL}/data/cbsa_taxonomy.json`;
const CBSA_TILE_URL = `${TILE_BASE_URL}/cbsas/{z}/{x}/{y}.pbf`;
const HYDRO_TILE_URL =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Hydro/MapServer/tile/{z}/{y}/{x}";
const HYDRO_QUERY_URL =
  "https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Hydro/MapServer/1/query";
const TRACT_SOURCE_LAYER = "tracts";
const TRACT_CENTROID_SOURCE_LAYER = "tract_centroids";
const CBSA_SOURCE_LAYER = "cbsas";
const LOW_ZOOM_MAX = 5.6;
const HCV_OVERLAY_DEFAULT_INDICATOR_ID = "hcv_25";
const NO_DATA_COLOR = "#ffffff";
const WATER_FILL_COLOR = "#d4dbe0";
const HYDRO_VECTOR_MIN_ZOOM = 7;
const SPATIAL_MISMATCH_RED_PALETTE = ["#fff5f0", "#fcbba1", "#fb6a4a", "#de2d26", "#a50f15"];
const DEFAULT_TRACT_VIEW = {
  center: [-73.98513, 40.74844],
  zoom: 10.8,
};
const CLEAN_BASEMAP_TILES = [
  "https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
  "https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
  "https://c.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
  "https://d.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png",
];
const CLEAN_BASEMAP_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>';
const HYDRO_ATTRIBUTION = '&copy; <a href="https://www.census.gov/">U.S. Census Bureau</a>';

const state = {
  metadataByLevel: { tract: null, cbsa: null },
  taxonomyByLevel: { tract: null, cbsa: null },
  nationalMediansByLevel: { tract: {}, cbsa: {} },
  cbsaStats: null,
  geographyLevel: "tract",
  selectedIndicatorId: null,
  selectedIndicatorIds: { tract: null, cbsa: null },
  classification: "fixed",
  classifications: { tract: "fixed", cbsa: "fixed" },
  selectedFeature: null,
  selectedFeatures: { tract: null, cbsa: null },
  hoveredFeatureId: null,
  cbsaModeEnabled: false,
  hcvOverlayEnabled: false,
  selectedHcvOverlayIndicatorId: HCV_OVERLAY_DEFAULT_INDICATOR_ID,
  summaryTimer: null,
  hydroRequestId: 0,
  hydroQueryKey: null,
  defaultSelectionApplied: false,
  mapInitialized: false,
};

const LEVEL_CONFIG = {
  tract: {
    sourceId: "tracts",
    sourceLayer: TRACT_SOURCE_LAYER,
    fillLayers: ["tracts-fill-lowzoom", "tracts-fill"],
    interactiveLayers: ["tracts-fill-lowzoom", "tracts-fill", "tract-hcv-overlay"],
    borderLayer: "tracts-borders",
    highlightLayer: "tracts-highlight",
    filterLayers: [
      "tracts-context-lowzoom",
      "tracts-fill-lowzoom",
      "tracts-fill",
      "tracts-borders",
      "tract-hcv-overlay-halo",
      "tract-hcv-overlay",
      "tracts-highlight",
    ],
  },
  cbsa: {
    sourceId: "cbsas",
    sourceLayer: CBSA_SOURCE_LAYER,
    fillLayers: ["cbsas-fill"],
    interactiveLayers: ["cbsas-fill"],
    borderLayer: "cbsas-borders",
    highlightLayer: "cbsas-highlight",
    filterLayers: ["cbsas-fill", "cbsas-borders", "cbsas-highlight"],
  },
};

const map = new maplibregl.Map({
  container: "map",
  center: DEFAULT_TRACT_VIEW.center,
  zoom: DEFAULT_TRACT_VIEW.zoom,
  minZoom: 3,
  maxZoom: 12,
  dragRotate: false,
  pitchWithRotate: false,
  touchPitch: false,
  style: {
    version: 8,
    sources: {
      basemap: {
        type: "raster",
        tiles: CLEAN_BASEMAP_TILES,
        tileSize: 256,
        attribution: CLEAN_BASEMAP_ATTRIBUTION,
      },
    },
    layers: [
      { id: "basemap-background", type: "background", paint: { "background-color": "#d7dee4" } },
      {
        id: "basemap",
        type: "raster",
        source: "basemap",
        paint: {
          "raster-opacity": 0.48,
          "raster-saturation": -0.82,
          "raster-contrast": -0.06,
          "raster-brightness-min": 0.04,
          "raster-brightness-max": 0.9,
        },
      },
    ],
  },
});

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

const datasetBrowser = document.getElementById("dataset-browser");
const activeIndicatorCard = document.getElementById("active-indicator-card");
const classificationSelect = document.getElementById("classification-select");
const classificationButtons = Array.from(document.querySelectorAll(".classification-chip"));
const fillsToggle = document.getElementById("fills-toggle");
const bordersToggle = document.getElementById("borders-toggle");
const geographyLevelToggle = document.getElementById("geography-level-toggle");
const geographyLevelButtons = Array.from(document.querySelectorAll(".mode-segmented-button[data-level]"));
const geographyLevelNote = document.getElementById("geography-level-note");
const cbsaModeButton = document.getElementById("cbsa-mode-button");
const cbsaModeNote = document.getElementById("cbsa-mode-note");
const hcvOverlayToggle = document.getElementById("hcv-overlay-toggle");
const hcvOverlaySelect = document.getElementById("hcv-overlay-select");
const hcvOverlayNote = document.getElementById("hcv-overlay-note");
const legendContainer = document.getElementById("legend");
const viewportSummary = document.getElementById("viewport-summary");
const selectedGeoHeading = document.getElementById("selected-geo-heading");
const tractDetails = document.getElementById("tract-details");
const hoverPopup = new maplibregl.Popup({
  closeButton: false,
  closeOnClick: false,
  maxWidth: "280px",
  offset: 12,
  className: "tract-hover-popup",
});

function getMetadataForLevel(level = state.geographyLevel) {
  return state.metadataByLevel[level];
}

function getTaxonomyForLevel(level = state.geographyLevel) {
  return state.taxonomyByLevel[level];
}

function getLevelConfig(level = state.geographyLevel) {
  return LEVEL_CONFIG[level];
}

function getIndicatorById(indicatorId, level = state.geographyLevel) {
  const metadata = getMetadataForLevel(level);
  return metadata?.indicators.find((indicator) => indicator.id === indicatorId) ?? null;
}

function isHcvIndicatorId(indicatorId) {
  return typeof indicatorId === "string" && indicatorId.toLowerCase().startsWith("hcv_");
}

function getHcvOverlayIndicators() {
  return (getMetadataForLevel("tract")?.indicators ?? []).filter((indicator) => isHcvIndicatorId(indicator.id));
}

function getSelectedHcvOverlayIndicator() {
  return getIndicatorById(state.selectedHcvOverlayIndicatorId, "tract");
}

function formatHcvOverlayLabel(indicator) {
  if (!indicator) {
    return "Housing Choice Voucher overlay";
  }

  if (indicator.id === "hcv_25") {
    return "All HCV households";
  }

  return indicator.label
    .replace(/^Housing Choice Vouchers\s*/i, "")
    .replace(/\s*\(HUD,\s*2025\)\s*$/i, "")
    .trim();
}

function hexToRgba(hexColor, alpha = 1) {
  const fallback = `rgba(33, 78, 120, ${alpha})`;
  if (typeof hexColor !== "string") {
    return fallback;
  }

  let normalized = hexColor.trim().replace("#", "");
  if (normalized.length === 3) {
    normalized = normalized
      .split("")
      .map((value) => value + value)
      .join("");
  }

  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return fallback;
  }

  const parsed = Number.parseInt(normalized, 16);
  const red = (parsed >> 16) & 255;
  const green = (parsed >> 8) & 255;
  const blue = parsed & 255;
  return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
}

function getTaxonomyMatch(indicatorId, level = state.geographyLevel) {
  const taxonomy = getTaxonomyForLevel(level);
  if (!taxonomy?.sections) {
    return null;
  }
  for (const section of taxonomy.sections) {
    const item = section.items.find((entry) => entry.indicator_id === indicatorId);
    if (item) {
      return { section, item };
    }
  }
  return null;
}

function buildFallbackTaxonomy(level) {
  const metadata = getMetadataForLevel(level);
  const groups = [...new Set((metadata?.indicators ?? []).map((indicator) => indicator.group))];
  return {
    sections: groups.map((group) => ({
      id: group.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
      title: group,
      items: metadata.indicators
        .filter((indicator) => indicator.group === group)
        .map((indicator) => ({
          indicator_id: indicator.id,
          label: indicator.label,
          definition: indicator.description,
          source_dataset: indicator.year_label,
          source_link: null,
          level: "Census tract",
          variable_type: indicator.value_type,
          metadata: indicator,
        })),
    })),
  };
}

function getIndicatorPaletteColors(indicator) {
  if (!indicator) {
    return [];
  }

  if (indicator.group === "Spatial Mismatch") {
    return SPATIAL_MISMATCH_RED_PALETTE;
  }

  return indicator.palette_colors ?? [];
}

function normalizeTaxonomy(rawTaxonomy, level) {
  const metadata = getMetadataForLevel(level);
  const metadataById = new Map((metadata?.indicators ?? []).map((indicator) => [indicator.id, indicator]));
  const sections = (rawTaxonomy?.sections ?? [])
    .map((section) => ({
      id: section.id,
      title: section.title,
      items: (section.items ?? [])
        .filter((item) => metadataById.has(item.indicator_id))
        .map((item) => ({
          ...item,
          metadata: metadataById.get(item.indicator_id),
        })),
    }))
    .filter((section) => section.items.length);

  return sections.length ? { sections } : buildFallbackTaxonomy(level);
}

function getFeatureNumericValue(feature, fieldId) {
  const value = feature?.properties?.[fieldId];
  if (value === null || value === undefined || value === "") {
    return null;
  }
  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
}

function formatValue(value, indicator) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "No data";
  }

  if (indicator.value_type === "binary") {
    return value === 1 ? "Yes" : "No";
  }

  if (indicator.value_type === "currency") {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(value);
  }

  if (indicator.value_type === "percent") {
    const percentValue = value <= 1 ? value * 100 : value;
    return `${percentValue.toFixed(1)}%`;
  }

  if (indicator.value_type === "count") {
    return new Intl.NumberFormat("en-US", {
      maximumFractionDigits: 0,
    }).format(value);
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2,
  }).format(value);
}

function toFiniteNumber(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function getNationalMedianRecord(indicatorId, level = state.geographyLevel) {
  return state.nationalMediansByLevel[level]?.[indicatorId] ?? null;
}

function getRangeMarkerPosition(value, minimum, median, maximum) {
  const current = toFiniteNumber(value);
  const minValue = toFiniteNumber(minimum);
  const medianValue = toFiniteNumber(median);
  const maxValue = toFiniteNumber(maximum);

  if (current === null || minValue === null || medianValue === null || maxValue === null) {
    return null;
  }

  if (!(minValue < maxValue)) {
    return 50;
  }

  const clampedCurrent = Math.min(maxValue, Math.max(minValue, current));

  if (!(minValue < medianValue && medianValue < maxValue)) {
    return ((clampedCurrent - minValue) / (maxValue - minValue)) * 100;
  }

  if (clampedCurrent <= medianValue) {
    return medianValue === minValue
      ? 50
      : ((clampedCurrent - minValue) / (medianValue - minValue)) * 50;
  }

  return medianValue === maxValue
    ? 50
    : 50 + ((clampedCurrent - medianValue) / (maxValue - medianValue)) * 50;
}

function buildComparisonChart(indicator, currentValue, level = state.geographyLevel) {
  const summaryRecord = getNationalMedianRecord(indicator.id, level);
  const minValue = toFiniteNumber(indicator?.stats?.min);
  const maxValue = toFiniteNumber(indicator?.stats?.max);
  const medianValue =
    toFiniteNumber(summaryRecord?.national_median) ?? toFiniteNumber(indicator?.stats?.median);
  const currentPosition = getRangeMarkerPosition(currentValue, minValue, medianValue, maxValue);
  const medianLabel = medianValue === null ? "Median" : `Median (${formatValue(medianValue, indicator)})`;
  const currentLabel = currentValue === null ? "No data" : formatValue(currentValue, indicator);

  return `
    <div class="comparison-card">
      <div class="comparison-card-header">
        <div class="comparison-card-title">National comparison</div>
        <div class="comparison-card-value">${currentLabel}</div>
      </div>
      <div class="comparison-track">
        <span class="comparison-track-center"></span>
        ${
          currentPosition === null
            ? ""
            : `<span class="comparison-track-marker" style="left: ${currentPosition}%"></span>`
        }
      </div>
      <div class="comparison-track-labels">
        <span>Lowest</span>
        <span>${medianLabel}</span>
        <span>Highest</span>
      </div>
    </div>
  `;
}

function buildDetailMetricStrip(items) {
  return `
    <div class="detail-metric-strip">
      ${items
        .map(
          (item) => `
            <div class="detail-metric-pill">
              <span class="detail-metric-pill-label">${item.label}</span>
              <span class="detail-metric-pill-value">${item.value}</span>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

function buildDetailIndicatorInfo(taxonomyMatch, indicator) {
  const description = taxonomyMatch?.item.definition || indicator?.description || "";
  const sourceLink = taxonomyMatch?.item.source_link;

  return `
    <div class="detail-indicator-info">
      ${description ? `<div class="detail-indicator-description">${description}</div>` : ""}
      ${
        sourceLink
          ? `<div class="source-link-row detail-source-link-row"><a href="${sourceLink}" target="_blank" rel="noreferrer">Source link</a></div>`
          : ""
      }
    </div>
  `;
}

function persistCurrentLevelState() {
  state.selectedIndicatorIds[state.geographyLevel] = state.selectedIndicatorId;
  state.classifications[state.geographyLevel] = state.classification;
  state.selectedFeatures[state.geographyLevel] = state.selectedFeature;
}

function updateClassificationControls() {
  const indicator = getIndicatorById(state.selectedIndicatorId);
  const disableClassification = indicator?.value_type === "binary";
  if (classificationSelect) {
    classificationSelect.value = state.classification;
    classificationSelect.disabled = disableClassification;
  }
  classificationButtons.forEach((button) => {
    const isActive = button.dataset.value === state.classification;
    button.classList.toggle("is-active", isActive);
    button.disabled = disableClassification;
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function populateHcvOverlayControls() {
  if (!hcvOverlaySelect) {
    return;
  }

  const overlayIndicators = getHcvOverlayIndicators();
  if (!overlayIndicators.length) {
    hcvOverlaySelect.innerHTML = '<option value="">No HCV overlay available</option>';
    return;
  }

  if (!overlayIndicators.some((indicator) => indicator.id === state.selectedHcvOverlayIndicatorId)) {
    state.selectedHcvOverlayIndicatorId = overlayIndicators[0].id;
  }

  hcvOverlaySelect.innerHTML = overlayIndicators
    .map((indicator) => {
      const isSelected = indicator.id === state.selectedHcvOverlayIndicatorId;
      return `<option value="${indicator.id}"${isSelected ? " selected" : ""}>${formatHcvOverlayLabel(indicator)}</option>`;
    })
    .join("");
}

function updateHcvOverlayControls() {
  if (!hcvOverlayToggle || !hcvOverlaySelect || !hcvOverlayNote) {
    return;
  }

  const selectedOverlayIndicator = getSelectedHcvOverlayIndicator();
  const hasOverlayIndicators = getHcvOverlayIndicators().length > 0;
  const tractLevel = state.geographyLevel === "tract";
  const canShowOverlay = tractLevel && hasOverlayIndicators;

  hcvOverlayToggle.checked = state.hcvOverlayEnabled && canShowOverlay;
  hcvOverlayToggle.disabled = !canShowOverlay;
  hcvOverlaySelect.disabled = !canShowOverlay;

  if (!hasOverlayIndicators) {
    hcvOverlayNote.textContent = "No tract-level HCV overlay indicators are available.";
    return;
  }

  if (!tractLevel) {
    hcvOverlayNote.textContent = "HCV overlay is available in tract view only.";
    return;
  }

  hcvOverlayNote.textContent = state.hcvOverlayEnabled
    ? `Dots sized by ${formatHcvOverlayLabel(selectedOverlayIndicator)}.`
    : "Overlay tract-level HCV dots on top of the current dataset.";
}

function updateGeographyLevelControls() {
  if (!geographyLevelToggle || !geographyLevelNote) {
    return;
  }

  const isCbsa = state.geographyLevel === "cbsa";
  geographyLevelToggle.dataset.active = state.geographyLevel;
  geographyLevelButtons.forEach((button) => {
    const isActive = button.dataset.level === state.geographyLevel;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
    button.tabIndex = isActive ? 0 : -1;
  });
  geographyLevelNote.textContent = isCbsa
    ? "Showing CBSA summary data and CBSA boundaries."
    : "Showing tract-level data and boundaries.";

  if (selectedGeoHeading) {
    selectedGeoHeading.textContent = isCbsa ? "Selected CBSA" : "Selected geography";
  }
}

function getSelectedCbsaCode() {
  const cbsaCode = state.selectedFeature?.properties?.cbsa_code;
  if (cbsaCode === null || cbsaCode === undefined) {
    return "";
  }
  return String(cbsaCode).trim();
}

function hasSelectedCbsa() {
  return Boolean(getSelectedCbsaCode());
}

function getCbsaContextFromFeature(feature) {
  const cbsaCode = feature?.properties?.cbsa_code;
  if (cbsaCode === null || cbsaCode === undefined) {
    return null;
  }

  const code = String(cbsaCode).trim();
  if (!code) {
    return null;
  }

  return {
    code,
    name: feature?.properties?.cbsa_name || "selected CBSA",
  };
}

function getCbsaFocusContext() {
  const currentContext = getCbsaContextFromFeature(state.selectedFeature);
  const tractContext = getCbsaContextFromFeature(state.selectedFeatures.tract);
  const cbsaContext = getCbsaContextFromFeature(state.selectedFeatures.cbsa);

  if (state.geographyLevel === "cbsa") {
    return currentContext ?? cbsaContext;
  }

  if (state.cbsaModeEnabled) {
    return currentContext ?? cbsaContext ?? tractContext;
  }

  return currentContext ?? tractContext;
}

function updateCbsaModeControls() {
  if (!cbsaModeButton || !cbsaModeNote) {
    return;
  }

  const setCbsaNote = (message) => {
    cbsaModeNote.textContent = message;
    cbsaModeNote.hidden = !message;
  };

  if (state.geographyLevel === "cbsa") {
    const selectedCbsaContext = getCbsaContextFromFeature(state.selectedFeature);
    const isAvailable = Boolean(selectedCbsaContext?.code);

    cbsaModeButton.disabled = !isAvailable;
    cbsaModeButton.classList.remove("is-active");
    cbsaModeButton.textContent = isAvailable
      ? "Show selected CBSA in tract view"
      : "Select a CBSA to open tract view";
    setCbsaNote("");
    return;
  }

  const selectedTractContext = getCbsaContextFromFeature(state.selectedFeature);
  const focusContext = getCbsaFocusContext();
  const isAvailable = state.cbsaModeEnabled
    ? Boolean(focusContext?.code)
    : Boolean(selectedTractContext?.code);

  cbsaModeButton.disabled = !isAvailable;
  cbsaModeButton.classList.toggle("is-active", state.cbsaModeEnabled && Boolean(focusContext?.code));

  if (!isAvailable) {
    cbsaModeButton.textContent = "Focus on selected tract's CBSA";
    setCbsaNote("Select a tract to enable CBSA mode.");
    return;
  }

  cbsaModeButton.textContent = state.cbsaModeEnabled
    ? "Return to nationwide tract view"
    : "Focus on selected tract's CBSA";
  setCbsaNote(state.cbsaModeEnabled ? `Showing only tracts in ${focusContext?.name || "selected CBSA"}.` : "");
}

function combineLayerFilters(filters) {
  const activeFilters = filters.filter(Boolean);
  if (!activeFilters.length) {
    return null;
  }
  if (activeFilters.length === 1) {
    return activeFilters[0];
  }
  return ["all", ...activeFilters];
}

function getTractCbsaFocusFilter() {
  const cbsaCode = getCbsaFocusContext()?.code ?? "";
  return state.geographyLevel === "tract" && state.cbsaModeEnabled && cbsaCode
    ? ["==", ["to-string", ["get", "cbsa_code"]], cbsaCode]
    : null;
}

function getPositiveHcvOverlayFilter(indicator = getSelectedHcvOverlayIndicator()) {
  if (!indicator) {
    return null;
  }
  return [">", ["coalesce", ["to-number", ["get", indicator.id]], 0], 0];
}

function applyCbsaFilter() {
  if (!map.getLayer("tracts-fill")) {
    return;
  }

  const tractFilter = getTractCbsaFocusFilter();
  const overlayFilter = combineLayerFilters([tractFilter, getPositiveHcvOverlayFilter()]);

  getLevelConfig("tract").filterLayers.forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.setFilter(layerId, layerId.startsWith("tract-hcv-overlay") ? overlayFilter : tractFilter);
    }
  });

  hoverPopup.remove();
  scheduleViewportSummary();
}

function activateSelectedCbsaTractView() {
  const selectedCbsaContext =
    getCbsaContextFromFeature(state.selectedFeature) ?? getCbsaContextFromFeature(state.selectedFeatures.cbsa);
  if (!selectedCbsaContext?.code) {
    return;
  }

  if (state.geographyLevel !== "tract") {
    switchGeographyLevel("tract");
  }

  const tractSelection = state.selectedFeatures.tract;
  const tractContext = getCbsaContextFromFeature(tractSelection);
  if (tractSelection?.id && tractContext?.code !== selectedCbsaContext.code) {
    setFeatureStateSafe(tractSelection.id, "selected", false, "tract");
    state.selectedFeatures.tract = null;
    if (state.geographyLevel === "tract") {
      state.selectedFeature = null;
    }
  }

  state.cbsaModeEnabled = true;
  renderTractDetails(state.selectedFeature);
  updateCbsaModeControls();
  applyCbsaFilter();
}

function clearHoverState(level = state.geographyLevel) {
  if (state.hoveredFeatureId) {
    setFeatureStateSafe(state.hoveredFeatureId, "hover", false, level);
    state.hoveredFeatureId = null;
  }
  hoverPopup.remove();
}

function switchGeographyLevel(nextLevel) {
  if (nextLevel === state.geographyLevel) {
    return;
  }

  persistCurrentLevelState();
  clearHoverState(state.geographyLevel);

  state.cbsaModeEnabled = false;
  state.geographyLevel = nextLevel;

  const metadata = getMetadataForLevel(nextLevel);
  const storedIndicatorId = state.selectedIndicatorIds[nextLevel];
  const defaultIndicator = getIndicatorById(metadata?.default_indicator, nextLevel);
  const fallbackIndicatorId =
    storedIndicatorId ??
    defaultIndicator?.id ??
    getTaxonomyForLevel(nextLevel)?.sections?.[0]?.items?.[0]?.indicator_id ??
    null;

  state.selectedIndicatorId = fallbackIndicatorId;
  state.selectedFeature = state.selectedFeatures[nextLevel] ?? null;

  const indicator = getIndicatorById(state.selectedIndicatorId, nextLevel);
  state.classification =
    state.classifications[nextLevel] ??
    (indicator?.value_type === "binary" ? "fixed" : indicator?.default_classification ?? "fixed");
  updateClassificationControls();

  renderDatasetBrowser();
  renderActiveIndicatorCard();
  renderTractDetails(state.selectedFeature);
  updateGeographyLevelControls();
  updateCbsaModeControls();
  updateFillStyle();
}

function buildStepExpression(indicator, classification) {
  const paletteColors = getIndicatorPaletteColors(indicator);

  if (indicator.value_type === "binary") {
    return [
      "case",
      ["!", ["has", indicator.id]],
      NO_DATA_COLOR,
      ["==", ["get", indicator.id], 1],
      paletteColors[1] ?? indicator.palette_colors?.[1] ?? "#1f2937",
      paletteColors[0] ?? indicator.palette_colors?.[0] ?? "#d1d5db",
    ];
  }

  const breaks = indicator.breaks[classification]?.length
    ? indicator.breaks[classification]
    : indicator.breaks.fixed;
  const colors = paletteColors.length ? paletteColors : indicator.palette_colors;
  const step = ["step", ["get", indicator.id], colors[0]];

  breaks.forEach((breakpoint, index) => {
    step.push(breakpoint, colors[Math.min(index + 1, colors.length - 1)]);
  });

  return ["case", ["!", ["has", indicator.id]], NO_DATA_COLOR, step];
}

function buildLegend(indicator, classification) {
  legendContainer.innerHTML = "";
  const paletteColors = getIndicatorPaletteColors(indicator);

  const topRow = document.createElement("div");
  topRow.className = "legend-toprow";

  const strip = document.createElement("div");
  strip.className = "legend-strip";

  const labels = document.createElement("div");
  labels.className = "legend-labels";

  const noData = document.createElement("div");
  noData.className = "legend-missing";
  const noDataSwatch = document.createElement("span");
  noDataSwatch.className = "legend-missing-swatch";
  noDataSwatch.style.background = NO_DATA_COLOR;

  const noDataLabel = document.createElement("span");
  noDataLabel.textContent = indicator.null_label;

  noData.appendChild(noDataSwatch);
  noData.appendChild(noDataLabel);
  topRow.appendChild(noData);

  if (indicator.value_type === "binary") {
    [
      { label: "No", color: paletteColors[0] ?? indicator.palette_colors[0] },
      { label: "Yes", color: paletteColors[1] ?? indicator.palette_colors[1] },
    ].forEach((item) => {
      const segment = document.createElement("span");
      segment.className = "legend-segment";
      segment.style.background = item.color;
      strip.appendChild(segment);

      const label = document.createElement("span");
      label.className = "legend-label";
      label.textContent = item.label;
      labels.appendChild(label);
    });

    legendContainer.appendChild(topRow);
    legendContainer.appendChild(strip);
    legendContainer.appendChild(labels);
    return;
  }

  const breaks = indicator.breaks[classification]?.length
    ? indicator.breaks[classification]
    : indicator.breaks.fixed;
  const colors = paletteColors.length ? paletteColors : indicator.palette_colors;

  colors.forEach((color, index) => {
    let label = "";
    if (index === 0) {
      label = `< ${formatValue(breaks[0], indicator)}`;
    } else if (index === colors.length - 1) {
      label = `>= ${formatValue(breaks[breaks.length - 1], indicator)}`;
    } else {
      label = `${formatValue(breaks[index - 1], indicator)} to ${formatValue(breaks[index], indicator)}`;
    }

    const segment = document.createElement("span");
    segment.className = "legend-segment";
    segment.style.background = color;
    strip.appendChild(segment);

    const labelNode = document.createElement("span");
    labelNode.className = "legend-label";
    labelNode.textContent = label;
    labels.appendChild(labelNode);
  });

  legendContainer.appendChild(topRow);
  legendContainer.appendChild(strip);
  legendContainer.appendChild(labels);
}

function renderDatasetBrowser() {
  datasetBrowser.innerHTML = "";
  const taxonomy = getTaxonomyForLevel();
  if (!taxonomy?.sections) {
    return;
  }

  taxonomy.sections.forEach((section) => {
    const details = document.createElement("details");
    details.className = "dataset-category";
    details.open = section.items.some((item) => item.indicator_id === state.selectedIndicatorId);

    const summary = document.createElement("summary");
    summary.innerHTML = `
      <span>
        <span class="dataset-category-title">${section.title}</span>
        <span class="dataset-category-meta">${section.items.length} datasets</span>
      </span>
      <span class="dataset-category-icon">▶</span>
    `;

    const list = document.createElement("div");
    list.className = "dataset-list";

    section.items.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "dataset-item";
      button.dataset.indicatorId = item.indicator_id;
      if (item.indicator_id === state.selectedIndicatorId) {
        button.classList.add("active");
      }
      button.innerHTML = `
        <span class="dataset-item-title">${item.label}</span>
        <span class="dataset-item-meta">${item.metadata.year_label}</span>
      `;
      list.appendChild(button);
    });

    details.appendChild(summary);
    details.appendChild(list);
    datasetBrowser.appendChild(details);
  });
}

function renderActiveIndicatorCard() {
  const indicator = getIndicatorById(state.selectedIndicatorId);
  const taxonomyMatch = getTaxonomyMatch(state.selectedIndicatorId);

  if (!indicator) {
    activeIndicatorCard.className = "summary-card muted dataset-banner-card";
    activeIndicatorCard.textContent = "Select a dataset to see its definition, source, and year.";
    return;
  }

  const itemLabel = taxonomyMatch?.item.label || indicator.label;
  const sectionTitle = taxonomyMatch?.section.title || indicator.group;

  activeIndicatorCard.className = "summary-card active-dataset-card dataset-banner-card";
  activeIndicatorCard.innerHTML = `
    <div class="dataset-banner-primary">
      <div class="dataset-banner-label">Current Dataset</div>
      <div class="detail-heading">${itemLabel}</div>
      <div class="detail-subheading">${sectionTitle}</div>
    </div>
  `;
}

function selectIndicator(indicatorId) {
  const indicator = getIndicatorById(indicatorId);
  if (!indicator) {
    return;
  }
  state.selectedIndicatorId = indicatorId;
  state.selectedIndicatorIds[state.geographyLevel] = indicatorId;
  state.classification =
    indicator.value_type === "binary"
      ? "fixed"
      : indicator.default_classification ?? state.classification;
  state.classifications[state.geographyLevel] = state.classification;
  updateClassificationControls();
  renderDatasetBrowser();
  renderActiveIndicatorCard();
  updateFillStyle();
}

function addTractSourceAndLayers() {
  if (map.getSource("tracts")) {
    return;
  }

  map.addSource("tracts", {
    type: "vector",
    tiles: [TRACT_TILE_URL],
    minzoom: 3,
    maxzoom: 11,
    promoteId: { [TRACT_SOURCE_LAYER]: "geoid" },
  });

  map.addLayer({
    id: "tracts-context-lowzoom",
    type: "fill",
    source: "tracts",
    "source-layer": TRACT_SOURCE_LAYER,
    maxzoom: LOW_ZOOM_MAX,
    paint: {
      "fill-color": "#d5e2ec",
      "fill-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        3,
        0.92,
        4.4,
        0.72,
        LOW_ZOOM_MAX,
        0.2,
      ],
      "fill-outline-color": [
        "interpolate",
        ["linear"],
        ["zoom"],
        3,
        "rgba(255, 255, 255, 0)",
        4.8,
        "rgba(255, 255, 255, 0)",
        LOW_ZOOM_MAX,
        "rgba(255, 255, 255, 0)",
      ],
    },
  });

  map.addLayer({
    id: "tracts-fill-lowzoom",
    type: "fill",
    source: "tracts",
    "source-layer": TRACT_SOURCE_LAYER,
    maxzoom: LOW_ZOOM_MAX,
    paint: {
      "fill-color": "#7fa8c7",
      "fill-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        3,
        0.92,
        4.8,
        0.86,
        LOW_ZOOM_MAX,
        0.55,
      ],
      "fill-outline-color": [
        "interpolate",
        ["linear"],
        ["zoom"],
        3,
        "rgba(255, 255, 255, 0)",
        4.8,
        "rgba(255, 255, 255, 0)",
        LOW_ZOOM_MAX,
        "rgba(255, 255, 255, 0)",
      ],
    },
  });

  map.addLayer({
    id: "tracts-fill",
    type: "fill",
    source: "tracts",
    "source-layer": TRACT_SOURCE_LAYER,
    minzoom: LOW_ZOOM_MAX - 0.3,
    paint: {
      "fill-color": "#cbd5e1",
      "fill-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        3,
        0.98,
        5,
        0.95,
        8,
        0.9,
        11,
        0.84,
      ],
      "fill-outline-color": [
        "interpolate",
        ["linear"],
        ["zoom"],
        3,
        "rgba(255, 255, 255, 0)",
        6,
        "rgba(255, 255, 255, 0)",
        9,
        "rgba(255, 255, 255, 0)",
        11,
        "rgba(255, 255, 255, 0)",
      ],
    },
  });

  map.addLayer({
    id: "tracts-borders",
    type: "line",
    source: "tracts",
    "source-layer": TRACT_SOURCE_LAYER,
    paint: {
      "line-color": "rgba(203, 213, 225, 0.8)",
      "line-width": 0.22,
    },
  });

  map.addLayer({
    id: "tracts-highlight",
    type: "line",
    source: "tracts",
    "source-layer": TRACT_SOURCE_LAYER,
    paint: {
      "line-color": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        "#ffffff",
        ["boolean", ["feature-state", "hover"], false],
        "#2f4858",
        "rgba(0,0,0,0)",
      ],
      "line-width": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        2.4,
        ["boolean", ["feature-state", "hover"], false],
        1.2,
        0,
      ],
    },
  });
}

function buildHcvOverlayValueRadiusExpression(indicator, minRadius, maxRadius) {
  const quantileBreaks = indicator?.breaks?.quantile?.length
    ? indicator.breaks.quantile
    : indicator?.breaks?.fixed ?? [];
  const positiveStops = [...new Set(quantileBreaks.filter((value) => Number.isFinite(value) && value > 0))]
    .sort((a, b) => a - b);
  const maxValue = Number.isFinite(indicator?.stats?.max) ? indicator.stats.max : positiveStops.at(-1) ?? 1;
  const stops = [...new Set([...positiveStops, maxValue])].filter((value) => value > 0).sort((a, b) => a - b);
  const expression = ["interpolate", ["linear"], ["coalesce", ["to-number", ["get", indicator.id]], 0], 0, 0];

  stops.forEach((stop, index) => {
    const progress = stops.length === 1 ? 1 : index / (stops.length - 1);
    const radius = minRadius + (maxRadius - minRadius) * progress;
    expression.push(stop, Number(radius.toFixed(2)));
  });

  return expression;
}

function buildHcvOverlayRadiusExpression(indicator) {
  return [
    "interpolate",
    ["linear"],
    ["zoom"],
    3,
    buildHcvOverlayValueRadiusExpression(indicator, 1.6, 4.8),
    10,
    buildHcvOverlayValueRadiusExpression(indicator, 2.4, 7.2),
  ];
}

function buildHcvOverlayColorExpression(indicator) {
  const fallbackColor = hexToRgba("#214e78", 0.48);
  if (!indicator) {
    return fallbackColor;
  }

  const classification =
    indicator.value_type === "binary" ? "binary" : indicator.default_classification ?? "quantile";
  const breaks = indicator.breaks?.[classification]?.length
    ? indicator.breaks[classification]
    : indicator.breaks?.fixed ?? [];
  const colors = (indicator.palette_colors?.length ? indicator.palette_colors : [fallbackColor]).map((color) =>
    hexToRgba(color, 0.5),
  );

  if (indicator.value_type === "binary") {
    return [
      "case",
      ["==", ["coalesce", ["to-number", ["get", indicator.id]], 0], 1],
      colors[1] ?? fallbackColor,
      colors[0] ?? fallbackColor,
    ];
  }

  const step = ["step", ["coalesce", ["to-number", ["get", indicator.id]], 0], colors[0] ?? fallbackColor];
  breaks.forEach((breakpoint, index) => {
    step.push(breakpoint, colors[Math.min(index + 1, colors.length - 1)] ?? fallbackColor);
  });

  return step;
}

function addTractCentroidSourceAndLayers() {
  if (map.getSource("tract-centroids")) {
    return;
  }

  map.addSource("tract-centroids", {
    type: "vector",
    tiles: [TRACT_CENTROID_TILE_URL],
    minzoom: 3,
    maxzoom: 11,
    promoteId: { [TRACT_CENTROID_SOURCE_LAYER]: "geoid" },
  });

  map.addLayer(
    {
      id: "tract-hcv-overlay-halo",
      type: "circle",
      source: "tract-centroids",
      "source-layer": TRACT_CENTROID_SOURCE_LAYER,
      layout: {
        visibility: "none",
      },
      paint: {
        "circle-color": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          "rgba(255, 255, 255, 0.92)",
          ["boolean", ["feature-state", "hover"], false],
          "rgba(255, 255, 255, 0.64)",
          "rgba(255, 255, 255, 0)",
        ],
        "circle-opacity": [
          "case",
          ["boolean", ["feature-state", "selected"], false],
          1,
          ["boolean", ["feature-state", "hover"], false],
          1,
          0,
        ],
        "circle-radius": 0,
        "circle-blur": 0.08,
      },
    },
    "tracts-highlight",
  );

  map.addLayer(
    {
      id: "tract-hcv-overlay",
      type: "circle",
      source: "tract-centroids",
      "source-layer": TRACT_CENTROID_SOURCE_LAYER,
      layout: {
        visibility: "none",
        "circle-sort-key": 0,
      },
      paint: {
        "circle-color": "rgba(33, 78, 120, 0.48)",
        "circle-opacity": 1,
        "circle-radius": 0,
        "circle-stroke-color": "rgba(255, 255, 255, 0.68)",
        "circle-stroke-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3,
          0.45,
          10,
          0.9,
        ],
      },
    },
    "tracts-highlight",
  );
}

function addCbsaSourceAndLayers() {
  if (map.getSource("cbsas")) {
    return;
  }

  map.addSource("cbsas", {
    type: "vector",
    tiles: [CBSA_TILE_URL],
    minzoom: 3,
    maxzoom: 9,
    promoteId: { [CBSA_SOURCE_LAYER]: "cbsa_code" },
  });

  map.addLayer({
    id: "cbsas-fill",
    type: "fill",
    source: "cbsas",
    "source-layer": CBSA_SOURCE_LAYER,
    paint: {
      "fill-color": "#cbd5e1",
      "fill-opacity": [
        "interpolate",
        ["linear"],
        ["zoom"],
        3,
        0.72,
        6,
        0.64,
        9,
        0.56,
      ],
      "fill-outline-color": [
        "interpolate",
        ["linear"],
        ["zoom"],
        3,
        "rgba(255, 255, 255, 0)",
        7,
        "rgba(255, 255, 255, 0)",
        9,
        "rgba(255, 255, 255, 0)",
      ],
    },
    layout: {
      visibility: "none",
    },
  });

  map.addLayer({
    id: "cbsas-borders",
    type: "line",
    source: "cbsas",
    "source-layer": CBSA_SOURCE_LAYER,
    paint: {
      "line-color": "rgba(203, 213, 225, 0.8)",
      "line-width": 0.42,
    },
    layout: {
      visibility: "none",
    },
  });

  map.addLayer({
    id: "cbsas-highlight",
    type: "line",
    source: "cbsas",
    "source-layer": CBSA_SOURCE_LAYER,
    paint: {
      "line-color": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        "#ffffff",
        ["boolean", ["feature-state", "hover"], false],
        "#2f4858",
        "rgba(0,0,0,0)",
      ],
      "line-width": [
        "case",
        ["boolean", ["feature-state", "selected"], false],
        2.6,
        ["boolean", ["feature-state", "hover"], false],
        1.4,
        0,
      ],
    },
    layout: {
      visibility: "none",
    },
  });
}

function emptyFeatureCollection() {
  return { type: "FeatureCollection", features: [] };
}

function lngLatToWebMercator(lng, lat) {
  const clampedLat = Math.max(Math.min(lat, 89.5), -89.5);
  return {
    x: 6378137 * (lng * Math.PI) / 180,
    y: 6378137 * Math.log(Math.tan(Math.PI / 4 + (clampedLat * Math.PI) / 360)),
  };
}

function buildHydroQueryUrl(bounds) {
  const southwest = lngLatToWebMercator(bounds.getWest(), bounds.getSouth());
  const northeast = lngLatToWebMercator(bounds.getEast(), bounds.getNorth());
  const zoom = map.getZoom();
  const geometryPrecision = zoom >= 11 ? 6 : zoom >= 9 ? 5 : 4;
  const params = new URLSearchParams({
    f: "geojson",
    where: "1=1",
    returnGeometry: "true",
    spatialRel: "esriSpatialRelIntersects",
    geometryType: "esriGeometryEnvelope",
    geometry: `${southwest.x},${southwest.y},${northeast.x},${northeast.y}`,
    inSR: "3857",
    outFields: "OBJECTID",
    outSR: "4326",
    resultType: "tile",
    geometryPrecision: String(geometryPrecision),
  });

  return `${HYDRO_QUERY_URL}?${params.toString()}`;
}

async function updateHydroPolygons() {
  const hydroSource = map.getSource("hydro-polygons");
  if (!hydroSource) {
    return;
  }

  if (map.getZoom() < HYDRO_VECTOR_MIN_ZOOM) {
    state.hydroRequestId += 1;
    state.hydroQueryKey = null;
    hydroSource.setData(emptyFeatureCollection());
    return;
  }

  const bounds = map.getBounds();
  if (!bounds) {
    return;
  }

  const queryKey = [
    map.getZoom().toFixed(2),
    bounds.getWest().toFixed(3),
    bounds.getSouth().toFixed(3),
    bounds.getEast().toFixed(3),
    bounds.getNorth().toFixed(3),
  ].join(":");

  if (state.hydroQueryKey === queryKey) {
    return;
  }

  state.hydroQueryKey = queryKey;
  const requestId = state.hydroRequestId + 1;
  state.hydroRequestId = requestId;

  try {
    const response = await fetch(buildHydroQueryUrl(bounds), { mode: "cors" });
    if (!response.ok) {
      throw new Error(`Hydro query failed with status ${response.status}`);
    }

    const payload = await response.json();
    if (requestId !== state.hydroRequestId || !map.getSource("hydro-polygons")) {
      return;
    }

    const features = (payload?.features ?? []).filter((feature) =>
      feature?.geometry?.type === "Polygon" || feature?.geometry?.type === "MultiPolygon",
    );
    hydroSource.setData({
      type: "FeatureCollection",
      features,
    });
  } catch (error) {
    if (requestId !== state.hydroRequestId || !map.getSource("hydro-polygons")) {
      return;
    }
    console.error("Failed to load hydro polygons", error);
  }
}

function arrangeMapLayerOrder() {
  const orderedLayers = [
    "tracts-context-lowzoom",
    "tracts-fill-lowzoom",
    "tracts-fill",
    "cbsas-fill",
    "hydro-mask-base",
    "hydro-mask-detail",
    "hydro-polygons-fill",
    "hydro-polygons-seal",
    "tracts-borders",
    "tract-hcv-overlay-halo",
    "tract-hcv-overlay",
    "tracts-highlight",
    "cbsas-borders",
    "cbsas-highlight",
  ];

  orderedLayers.forEach((layerId) => {
    if (map.getLayer(layerId)) {
      map.moveLayer(layerId);
    }
  });
}

function addHydroMaskLayer() {
  if (!map.getSource("hydro")) {
    map.addSource("hydro", {
      type: "raster",
      tiles: [HYDRO_TILE_URL],
      tileSize: 256,
      minzoom: 0,
      maxzoom: 19,
      attribution: HYDRO_ATTRIBUTION,
    });
  }

  if (!map.getSource("hydro-polygons")) {
    map.addSource("hydro-polygons", {
      type: "geojson",
      data: emptyFeatureCollection(),
    });
  }

  if (!map.getLayer("hydro-mask-base")) {
    map.addLayer({
      id: "hydro-mask-base",
      type: "raster",
      source: "hydro",
      maxzoom: HYDRO_VECTOR_MIN_ZOOM + 0.25,
      paint: {
        "raster-opacity": 1,
        "raster-saturation": -1,
        "raster-contrast": -0.2,
        "raster-brightness-min": 0.86,
        "raster-brightness-max": 0.94,
      },
    });
  }

  if (!map.getLayer("hydro-mask-detail")) {
    map.addLayer({
      id: "hydro-mask-detail",
      type: "raster",
      source: "hydro",
      maxzoom: HYDRO_VECTOR_MIN_ZOOM + 0.25,
      paint: {
        "raster-opacity": [
          "interpolate",
          ["linear"],
          ["zoom"],
          3,
          0.05,
          5,
          0.08,
          7,
          0.1,
          10,
          0.12,
          12,
          0.14,
        ],
        "raster-saturation": -1,
        "raster-contrast": -0.16,
        "raster-brightness-min": 0.8,
        "raster-brightness-max": 0.92,
      },
    });
  }

  if (!map.getLayer("hydro-polygons-fill")) {
    map.addLayer({
      id: "hydro-polygons-fill",
      type: "fill",
      source: "hydro-polygons",
      minzoom: HYDRO_VECTOR_MIN_ZOOM,
      paint: {
        "fill-color": WATER_FILL_COLOR,
        "fill-opacity": 1,
        "fill-antialias": false,
      },
    });
  }

  if (!map.getLayer("hydro-polygons-seal")) {
    map.addLayer({
      id: "hydro-polygons-seal",
      type: "line",
      source: "hydro-polygons",
      minzoom: HYDRO_VECTOR_MIN_ZOOM,
      paint: {
        "line-color": WATER_FILL_COLOR,
        "line-width": [
          "interpolate",
          ["linear"],
          ["zoom"],
          HYDRO_VECTOR_MIN_ZOOM,
          0.8,
          10,
          1.2,
          12,
          1.6,
        ],
      },
      layout: {
        "line-join": "round",
        "line-cap": "round",
      },
    });
  }

  arrangeMapLayerOrder();
}

function updateHcvOverlayStyle() {
  if (!map.getLayer("tract-hcv-overlay") || !map.getLayer("tract-hcv-overlay-halo")) {
    return;
  }

  const overlayIndicator = getSelectedHcvOverlayIndicator();
  const overlayVisible = state.geographyLevel === "tract" && state.hcvOverlayEnabled && Boolean(overlayIndicator);

  map.setLayoutProperty("tract-hcv-overlay", "visibility", overlayVisible ? "visible" : "none");
  map.setLayoutProperty("tract-hcv-overlay-halo", "visibility", overlayVisible ? "visible" : "none");

  if (!overlayVisible || !overlayIndicator) {
    return;
  }

  const baseRadius = buildHcvOverlayRadiusExpression(overlayIndicator);
  const haloRadius = [
    "+",
    baseRadius,
    [
      "case",
      ["boolean", ["feature-state", "selected"], false],
      2.4,
      ["boolean", ["feature-state", "hover"], false],
      1.2,
      0,
    ],
  ];
  const valueExpression = ["coalesce", ["to-number", ["get", overlayIndicator.id]], 0];

  map.setLayoutProperty("tract-hcv-overlay", "circle-sort-key", valueExpression);
  map.setPaintProperty("tract-hcv-overlay", "circle-color", buildHcvOverlayColorExpression(overlayIndicator));
  map.setPaintProperty("tract-hcv-overlay", "circle-radius", baseRadius);
  map.setPaintProperty("tract-hcv-overlay-halo", "circle-radius", haloRadius);
  map.setPaintProperty("tract-hcv-overlay", "circle-opacity", 1);
  map.setPaintProperty(
    "tract-hcv-overlay-halo",
    "circle-opacity",
    [
      "case",
      ["boolean", ["feature-state", "selected"], false],
      1,
      ["boolean", ["feature-state", "hover"], false],
      0.88,
      0,
    ],
  );
}

function updateFillStyle() {
  const indicator = getIndicatorById(state.selectedIndicatorId);
  if (!indicator || !map.getLayer("tracts-fill") || !map.getLayer("cbsas-fill")) {
    return;
  }

  const classification = indicator.value_type === "binary" ? "binary" : state.classification;
  const expression = buildStepExpression(indicator, classification);
  const isTractLevel = state.geographyLevel === "tract";
  const fillsEnabled = fillsToggle ? fillsToggle.checked : true;
  const bordersEnabled = bordersToggle ? bordersToggle.checked : true;

  map.setPaintProperty("tracts-fill-lowzoom", "fill-color", expression);
  map.setPaintProperty("tracts-fill", "fill-color", expression);
  map.setPaintProperty("cbsas-fill", "fill-color", expression);

  map.setLayoutProperty(
    "tracts-context-lowzoom",
    "visibility",
    isTractLevel && fillsEnabled ? "visible" : "none",
  );
  map.setLayoutProperty(
    "tracts-fill-lowzoom",
    "visibility",
    isTractLevel && fillsEnabled ? "visible" : "none",
  );
  map.setLayoutProperty("tracts-fill", "visibility", isTractLevel && fillsEnabled ? "visible" : "none");
  map.setLayoutProperty(
    "tracts-borders",
    "visibility",
    isTractLevel && bordersEnabled ? "visible" : "none",
  );
  map.setLayoutProperty("tracts-highlight", "visibility", isTractLevel ? "visible" : "none");

  map.setLayoutProperty("cbsas-fill", "visibility", !isTractLevel && fillsEnabled ? "visible" : "none");
  map.setLayoutProperty(
    "cbsas-borders",
    "visibility",
    !isTractLevel && bordersEnabled ? "visible" : "none",
  );
  map.setLayoutProperty("cbsas-highlight", "visibility", !isTractLevel ? "visible" : "none");

  updateClassificationControls();
  updateHcvOverlayControls();
  updateHcvOverlayStyle();
  buildLegend(indicator, classification);
  renderTractDetails(state.selectedFeature);
  renderActiveIndicatorCard();
  updateCbsaModeControls();
  applyCbsaFilter();
  scheduleViewportSummary();
}

function setFeatureStateSafe(featureId, key, value, level = state.geographyLevel) {
  if (!featureId) {
    return;
  }
  const config = getLevelConfig(level);
  const target = { source: config.sourceId, id: featureId };
  if (config.sourceLayer) {
    target.sourceLayer = config.sourceLayer;
  }
  map.setFeatureState(target, { [key]: value });

  if (level === "tract" && map.getSource("tract-centroids")) {
    map.setFeatureState(
      {
        source: "tract-centroids",
        sourceLayer: TRACT_CENTROID_SOURCE_LAYER,
        id: featureId,
      },
      { [key]: value },
    );
  }
}

function renderTractDetails(feature) {
  const isCbsaLevel = state.geographyLevel === "cbsa";
  if (!feature) {
    tractDetails.className = "summary-card muted";
    tractDetails.innerHTML = isCbsaLevel
      ? "Click a CBSA to inspect its values, labels, and summary geography details."
      : "Click a tract to inspect its values, labels, and CBSA comparison.";
    updateCbsaModeControls();
    return;
  }

  const indicator = getIndicatorById(state.selectedIndicatorId);
  const taxonomyMatch = getTaxonomyMatch(state.selectedIndicatorId);
  const props = feature.properties;
  const tractValue = getFeatureNumericValue(feature, indicator.id);
  const cbsaCode = props.cbsa_code ?? "";
  const cbsaStats = !isCbsaLevel ? state.cbsaStats[cbsaCode]?.indicators?.[indicator.id] ?? null : null;
  const comparisonChart = buildComparisonChart(indicator, tractValue, state.geographyLevel);

  if (isCbsaLevel) {
    tractDetails.className = "summary-card detail-card";
    tractDetails.innerHTML = `
      <div>
        <div class="detail-heading">${props.cbsa_name}</div>
        <div class="detail-subheading detail-subheading-stack">
          <span>CBSA ${props.cbsa_code}</span>
          <span>${props.cbsa_type || "Core-based statistical area"}</span>
        </div>
      </div>
      ${comparisonChart}
      ${buildDetailMetricStrip([
        { label: "Level", value: "CBSA summary" },
        { label: "CBSA type", value: props.cbsa_type || "No type" },
      ])}
      ${buildDetailIndicatorInfo(taxonomyMatch, indicator)}
    `;
    updateCbsaModeControls();
    return;
  }

  tractDetails.className = "summary-card detail-card";
  tractDetails.innerHTML = `
    <div>
      <div class="detail-heading">${props.county_name}, ${props.state_abbr}</div>
      <div class="detail-subheading detail-subheading-stack">
        <span>GEOID ${props.geoid}</span>
        <span>${props.cbsa_name || "No CBSA assignment"}</span>
      </div>
    </div>
    ${comparisonChart}
    ${buildDetailMetricStrip([
      {
        label: "CBSA median",
        value: cbsaStats ? formatValue(cbsaStats.median, indicator) : "No CBSA stats",
      },
      {
        label: "CBSA mean",
        value: cbsaStats ? formatValue(cbsaStats.mean, indicator) : "No CBSA stats",
      },
    ])}
    ${buildDetailIndicatorInfo(taxonomyMatch, indicator)}
  `;
  updateCbsaModeControls();
}

function applySelectedFeature(feature, level = state.geographyLevel) {
  if (!feature) {
    return;
  }

  if (state.selectedFeature?.id && state.selectedFeature.id !== feature.id) {
    setFeatureStateSafe(state.selectedFeature.id, "selected", false, level);
  }

  state.selectedFeature = feature;
  state.selectedFeatures[level] = feature;
  setFeatureStateSafe(feature.id, "selected", true, level);
  renderTractDetails(feature);

  if (level === "tract" && state.cbsaModeEnabled && !hasSelectedCbsa()) {
    state.cbsaModeEnabled = false;
  }

  updateCbsaModeControls();
  applyCbsaFilter();
}

function initializeDefaultTractSelection() {
  if (state.defaultSelectionApplied || state.geographyLevel !== "tract") {
    return;
  }

  const point = map.project(DEFAULT_TRACT_VIEW.center);
  const radius = 10;
  const features = map.queryRenderedFeatures(
    [
      [point.x - radius, point.y - radius],
      [point.x + radius, point.y + radius],
    ],
    { layers: ["tracts-fill"] },
  );
  const tractFeature = features.find((feature) => feature?.properties?.geoid);

  if (!tractFeature) {
    return;
  }

  state.defaultSelectionApplied = true;
  applySelectedFeature(tractFeature, "tract");
}

function renderHoverPopup(feature, lngLat) {
  const indicator = getIndicatorById(state.selectedIndicatorId);
  if (!indicator || !feature || !lngLat) {
    hoverPopup.remove();
    return;
  }

  const taxonomyMatch = getTaxonomyMatch(state.selectedIndicatorId);
  const props = feature.properties ?? {};
  const tractValue = getFeatureNumericValue(feature, indicator.id);
  const isCbsaLevel = state.geographyLevel === "cbsa";
  const locationLabel = isCbsaLevel
    ? props.cbsa_name || "Selected CBSA"
    : [props.county_name, props.state_abbr].filter(Boolean).join(", ");
  const subLabel = isCbsaLevel
    ? [props.cbsa_code ? `CBSA ${props.cbsa_code}` : null, props.cbsa_type || null]
        .filter(Boolean)
        .join(" | ")
    : [props.geoid ? `GEOID ${props.geoid}` : null, props.cbsa_name || null]
        .filter(Boolean)
        .join(" | ");
  const overlayIndicator =
    !isCbsaLevel && state.hcvOverlayEnabled ? getSelectedHcvOverlayIndicator() : null;
  const overlayValue =
    overlayIndicator && overlayIndicator.id !== indicator.id
      ? getFeatureNumericValue(feature, overlayIndicator.id)
      : null;

  hoverPopup
    .setLngLat(lngLat)
    .setHTML(`
      <div class="hover-popup-card">
        <div class="hover-popup-title">${locationLabel || "Selected tract"}</div>
        <div class="hover-popup-subtitle">${subLabel || "Census tract"}</div>
        <div class="hover-popup-metric-label">${taxonomyMatch?.item.label || indicator.label}</div>
        <div class="hover-popup-metric-value">${formatValue(tractValue, indicator)}</div>
        ${
          overlayIndicator && overlayValue !== null
            ? `
              <div class="hover-popup-secondary-label">${formatHcvOverlayLabel(overlayIndicator)}</div>
              <div class="hover-popup-secondary-value">${formatValue(overlayValue, overlayIndicator)}</div>
            `
            : ""
        }
      </div>
    `);

  if (!hoverPopup.isOpen()) {
    hoverPopup.addTo(map);
  }
}

function scheduleViewportSummary() {
  if (state.summaryTimer) {
    clearTimeout(state.summaryTimer);
  }
  state.summaryTimer = window.setTimeout(renderViewportSummary, 160);
}

function renderViewportSummary() {
  if (!viewportSummary) {
    return;
  }

  if (!map.getLayer("tracts-fill")) {
    return;
  }

  const indicator = getIndicatorById(state.selectedIndicatorId);
  const rendered = map.queryRenderedFeatures(undefined, {
    layers: ["tracts-fill-lowzoom", "tracts-fill"],
  });
  const deduped = new Map();

  rendered.forEach((feature) => {
    if (!deduped.has(feature.properties.geoid)) {
      deduped.set(feature.properties.geoid, feature);
    }
  });

  const values = [...deduped.values()]
    .map((feature) => getFeatureNumericValue(feature, indicator.id))
    .filter((value) => value !== null);

  if (!values.length) {
    viewportSummary.className = "summary-card muted";
    viewportSummary.textContent = "No visible tracts with data for the current indicator.";
    return;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const median = sorted[Math.floor(sorted.length / 2)];

  viewportSummary.className = "summary-card";
  viewportSummary.innerHTML = `
    <div class="summary-grid">
      <div class="stat-card">
        <span class="stat-label">Visible tracts</span>
        <span class="stat-value">${new Intl.NumberFormat("en-US").format(deduped.size)}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">With data</span>
        <span class="stat-value">${new Intl.NumberFormat("en-US").format(values.length)}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Mean</span>
        <span class="stat-value">${formatValue(mean, indicator)}</span>
      </div>
      <div class="stat-card">
        <span class="stat-label">Median</span>
        <span class="stat-value">${formatValue(median, indicator)}</span>
      </div>
    </div>
  `;
}

function registerEvents() {
  datasetBrowser.addEventListener("click", (event) => {
    const summary = event.target.closest(".dataset-category > summary");
    if (summary) {
      const currentCategory = summary.parentElement;
      window.setTimeout(() => {
        if (!currentCategory?.open) {
          return;
        }
        datasetBrowser.querySelectorAll(".dataset-category").forEach((category) => {
          if (category !== currentCategory) {
            category.open = false;
          }
        });
      }, 0);
      return;
    }

    const button = event.target.closest(".dataset-item");
    if (!button) {
      return;
    }
    selectIndicator(button.dataset.indicatorId);
  });

  classificationSelect?.addEventListener("change", () => {
    state.classification = classificationSelect.value;
    state.classifications[state.geographyLevel] = state.classification;
    updateClassificationControls();
    updateFillStyle();
  });

  classificationButtons.forEach((button) => {
    button.addEventListener("click", () => {
      if (button.disabled) {
        return;
      }
      state.classification = button.dataset.value;
      state.classifications[state.geographyLevel] = state.classification;
      if (classificationSelect) {
        classificationSelect.value = state.classification;
      }
      updateClassificationControls();
      updateFillStyle();
    });
  });

  hcvOverlayToggle?.addEventListener("change", () => {
    state.hcvOverlayEnabled = hcvOverlayToggle.checked;
    updateHcvOverlayControls();
    updateHcvOverlayStyle();
    applyCbsaFilter();
  });

  hcvOverlaySelect?.addEventListener("change", () => {
    state.selectedHcvOverlayIndicatorId = hcvOverlaySelect.value;
    updateHcvOverlayControls();
    updateHcvOverlayStyle();
    applyCbsaFilter();
  });

  fillsToggle?.addEventListener("change", updateFillStyle);
  bordersToggle?.addEventListener("change", updateFillStyle);
  geographyLevelButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const nextLevel = button.dataset.level;
      if (!nextLevel) {
        return;
      }
      switchGeographyLevel(nextLevel);
    });
  });
  geographyLevelToggle?.addEventListener("keydown", (event) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
      return;
    }
    event.preventDefault();
    switchGeographyLevel(event.key === "ArrowLeft" ? "tract" : "cbsa");
  });
  cbsaModeButton?.addEventListener("click", () => {
    if (state.geographyLevel === "cbsa") {
      activateSelectedCbsaTractView();
      return;
    }

    if (state.cbsaModeEnabled) {
      state.cbsaModeEnabled = false;
      updateCbsaModeControls();
      applyCbsaFilter();
      return;
    }

    const selectedTractContext = getCbsaContextFromFeature(state.selectedFeature);
    if (!selectedTractContext?.code) {
      return;
    }

    state.cbsaModeEnabled = true;
    updateCbsaModeControls();
    applyCbsaFilter();
  });

  const handleMouseMove = (level) => (event) => {
    if (state.geographyLevel !== level) {
      return;
    }
    map.getCanvas().style.cursor = "pointer";
    const feature = event.features?.[0];
    if (!feature) {
      hoverPopup.remove();
      return;
    }

    if (state.hoveredFeatureId && state.hoveredFeatureId !== feature.id) {
      setFeatureStateSafe(state.hoveredFeatureId, "hover", false, level);
    }

    state.hoveredFeatureId = feature.id;
    setFeatureStateSafe(state.hoveredFeatureId, "hover", true, level);
    renderHoverPopup(feature, event.lngLat);
  };

  const handleMouseLeave = (level) => () => {
    if (state.geographyLevel !== level) {
      return;
    }
    map.getCanvas().style.cursor = "";
    if (state.hoveredFeatureId) {
      setFeatureStateSafe(state.hoveredFeatureId, "hover", false, level);
      state.hoveredFeatureId = null;
    }
    hoverPopup.remove();
  };

  const handleClick = (level) => (event) => {
    if (state.geographyLevel !== level) {
      return;
    }
    const feature = event.features?.[0];
    if (!feature) {
      return;
    }
    applySelectedFeature(feature, level);
  };

  getLevelConfig("tract").interactiveLayers.forEach((layerId) => {
    map.on("mousemove", layerId, handleMouseMove("tract"));
    map.on("mouseleave", layerId, handleMouseLeave("tract"));
    map.on("click", layerId, handleClick("tract"));
  });

  getLevelConfig("cbsa").interactiveLayers.forEach((layerId) => {
    map.on("mousemove", layerId, handleMouseMove("cbsa"));
    map.on("mouseleave", layerId, handleMouseLeave("cbsa"));
    map.on("click", layerId, handleClick("cbsa"));
  });

  map.on("moveend", () => {
    scheduleViewportSummary();
    updateHydroPolygons();
  });
}

function populateControls() {
  ["tract", "cbsa"].forEach((level) => {
    state.taxonomyByLevel[level] = normalizeTaxonomy(getTaxonomyForLevel(level), level);
    const metadata = getMetadataForLevel(level);
    const defaultIndicator = getIndicatorById(metadata?.default_indicator, level);
    const fallbackIndicatorId =
      defaultIndicator?.id ??
      getTaxonomyForLevel(level)?.sections?.[0]?.items?.[0]?.indicator_id ??
      null;

    if (!state.selectedIndicatorIds[level]) {
      state.selectedIndicatorIds[level] = fallbackIndicatorId;
    }

    const levelIndicator = getIndicatorById(state.selectedIndicatorIds[level], level);
    state.classifications[level] =
      state.classifications[level] ??
      (levelIndicator?.value_type === "binary"
        ? "fixed"
        : levelIndicator?.default_classification ?? "fixed");
  });

  state.selectedIndicatorId = state.selectedIndicatorIds[state.geographyLevel];
  state.classification = state.classifications[state.geographyLevel] ?? "fixed";
  state.selectedFeature = state.selectedFeatures[state.geographyLevel] ?? null;
  populateHcvOverlayControls();
  updateClassificationControls();
  updateHcvOverlayControls();
  renderDatasetBrowser();
  renderActiveIndicatorCard();
  renderTractDetails(state.selectedFeature);
  updateGeographyLevelControls();
  updateCbsaModeControls();
}

async function initialize() {
  const [tractMetadata, tractTaxonomy, cbsaStats, cbsaMetadata, cbsaTaxonomy, nationalMedians] = await Promise.all([
    fetch(TRACT_INDICATORS_URL).then((response) => response.json()),
    fetch(TRACT_TAXONOMY_URL)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null),
    fetch(CBSA_STATS_URL).then((response) => response.json()),
    fetch(CBSA_INDICATORS_URL).then((response) => response.json()),
    fetch(CBSA_TAXONOMY_URL)
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null),
    fetch(NATIONAL_MEDIANS_URL)
      .then((response) => (response.ok ? response.json() : { tract: {}, cbsa: {} }))
      .catch(() => ({ tract: {}, cbsa: {} })),
  ]);

  state.metadataByLevel.tract = tractMetadata;
  state.taxonomyByLevel.tract = tractTaxonomy;
  state.metadataByLevel.cbsa = cbsaMetadata;
  state.taxonomyByLevel.cbsa = cbsaTaxonomy;
  state.nationalMediansByLevel = {
    tract: nationalMedians?.tract ?? {},
    cbsa: nationalMedians?.cbsa ?? {},
  };
  state.cbsaStats = cbsaStats;
  populateControls();

  const setupMap = () => {
    if (state.mapInitialized) {
      return;
    }
    state.mapInitialized = true;
    addTractSourceAndLayers();
    addTractCentroidSourceAndLayers();
    addCbsaSourceAndLayers();
    addHydroMaskLayer();
    registerEvents();
    updateFillStyle();
    updateHydroPolygons();
    map.once("idle", initializeDefaultTractSelection);
  };

  if (map.isStyleLoaded()) {
    setupMap();
  } else {
    map.once("load", setupMap);
  }
}

initialize().catch((error) => {
  console.error(error);
  tractDetails.className = "summary-card";
  tractDetails.textContent =
    "Failed to load map assets. Build the data artifacts first, then reload the page.";
});
