// Static configuration and copy for the web app. Pure data — no imports.

/**
 * @typedef {Object} ActiveRegion
 * @property {number} id
 * @property {number} lat_deg
 * @property {number} lon_deg
 * @property {number} [flux_norm]
 * @property {number} [area_msh]
 * @property {number} [tilt_deg]
 * @property {number} [complexity]
 * @property {number} [confidence]
 */

/**
 * @typedef {Object} Snapshot
 * @property {string} schema_version
 * @property {string} [source_mode]
 * @property {Object} [run]
 * @property {Object} [grid]
 * @property {Array} [layers]
 * @property {Object} [fields]
 * @property {ActiveRegion[]} [active_regions]
 * @property {Object} [learning]
 * @property {Object} [operational_readiness]
 * @property {Object} [observed_context]
 * @property {Array} [observations]
 * @property {string[]} [warnings]
 */

/** @type {Snapshot} */
export const FALLBACK_STATE = {
  schema_version: "solar-state-snapshot.v1",
  model_version: "0.1.1",
  source_mode: "degraded",
  operational_use: false,
  calibration_state: "normalized magnetic units; physical Gauss/Mx calibration not asserted",
  run: { seed: 42, steps: 1, dt_hours: 1, activity_index: 0.9, time_seconds: 3600, mode: "DegradedSyntheticFallback" },
  grid: { lon_count: 8, lat_count: 4, dlon_deg: 45, dlat_deg: 45 },
  layers: [
    { id: "br_normalized", label: "Radial magnetic field", kind: "synthetic", units: "normalized magnetic field" },
    { id: "continuum_proxy", label: "Continuum brightness proxy", kind: "inferred", units: "relative intensity" },
    { id: "confidence", label: "Model confidence", kind: "degraded", units: "0..1" }
  ],
  fields: {
    br_normalized: { units: "normalized magnetic field", values: [0, 0.3, -0.2, 0.1, -0.4, 0.2, 0.1, 0, 0.1, -0.7, 0.8, 0.2, -0.1, 0.4, -0.3, 0.1, 0, 0.2, -0.1, 0.1, 0.3, -0.2, 0.2, 0, 0, 0, 0.1, -0.1, 0, 0, 0.1, 0] },
    continuum_proxy: { units: "relative intensity", values: [1, 0.9, 0.96, 1, 0.82, 0.94, 1.02, 1, 1, 0.35, 0.28, 0.92, 1, 0.86, 0.96, 1, 1, 0.95, 1, 1.02, 0.9, 0.95, 1, 1, 1, 1, 1.02, 1, 1, 1, 1, 1] },
    confidence: { units: "0..1", values: [0.2, 0.4, 0.4, 0.2, 0.5, 0.4, 0.3, 0.2, 0.2, 0.55, 0.55, 0.3, 0.2, 0.45, 0.4, 0.2, 0.2, 0.35, 0.3, 0.2, 0.4, 0.3, 0.2, 0.2, 0.2, 0.2, 0.3, 0.2, 0.2, 0.2, 0.2, 0.2] }
  },
  active_regions: [
    { id: 1, lat_deg: 14, lon_deg: 110, flux_norm: 0.8, area_msh: 900, tilt_deg: 12, complexity: 0.7, confidence: 0.65 },
    { id: 2, lat_deg: -18, lon_deg: 240, flux_norm: 0.6, area_msh: 650, tilt_deg: -9, complexity: 0.55, confidence: 0.6 }
  ],
  learning: {
    cycle_stage: "solar maximum",
    plain_language_insight: "Fallback data is active; load a generated snapshot for the research view."
  },
  operational_readiness: {
    schema_version: "operational-readiness.v1",
    status: "degraded_fallback",
    research_learning_ready: false,
    space_weather_operational: false,
    data_state: { source_mode: "degraded", observation_mode: "none", cache_state: "missing" },
    gates: [
      { id: "snapshot_contract", label: "Snapshot contract valid", passed: false },
      { id: "calibrated_physical_units", label: "Calibrated physical units", passed: false },
      { id: "historical_validation", label: "Historical validation", passed: false },
      { id: "operational_monitoring", label: "Operational monitoring", passed: false }
    ],
    blockers: ["Fallback state only; generate or replay a validated snapshot."]
  },
  observations: [],
  warnings: ["Fallback state rendered because apps/web/data/latest-state.json was unavailable."]
};

export const MODE_COPY = {
  today: ["Today on the Sun", "A plain-language snapshot of where the Sun is in its cycle and what is happening on the side facing us right now."],
  explore: ["Explore the Sun", "Toggle layers, then click any marker to inspect a sunspot group's location, size, magnetic complexity, and how confident the model is."],
  weather: ["Space Weather", "How today's solar activity maps to things people feel on Earth — aurora, GPS, radio, and satellites. A learning view, not an alert service."],
  research: ["Research", "The model behind the picture: the equations it runs, where its data comes from, source-adapter health, and the gates that still block operational forecasting."]
};

export const APPLICATION_COPY = {
  today: {
    title: "Where the Sun is now",
    text: "The Sun runs an ~11-year cycle from quiet (minimum) to active (maximum). More sunspot groups means more flares and more aurora.",
    signals: ["stage", "regions", "confidence"]
  },
  explore: {
    title: "Inspect active regions",
    text: "Each marker is a sunspot group. Click one to see its location, magnetic complexity, area, and the model's confidence.",
    signals: ["selected AR", "complexity", "confidence"]
  },
  weather: {
    title: "Space-weather impact",
    text: "Public SWPC indices map to impact categories you may have heard of. Shown for learning only — this app issues no warnings.",
    signals: ["Kp", "F10.7", "GOES/X-ray", "solar wind"]
  },
  research: {
    title: "Model bench & provenance",
    text: "Seeded simulations, immutable snapshots, provenance labels, adapter health, and golden checks make algorithm changes auditable.",
    signals: ["schema", "provenance", "golden tests"]
  }
};

// Plain-language definitions surfaced via the ? affordances and legend/signal chips.
export const GLOSSARY = {
  "active-region": ["Active region", "A magnetically intense area on the Sun, usually marked by a sunspot group. Active regions are where flares and coronal mass ejections come from."],
  "br": ["Br — radial magnetic field", "How strongly the magnetic field points out of or into the surface at a spot. Shown here in normalized units, not calibrated Gauss."],
  "confidence": ["Confidence", "How much the model trusts the value at a spot, from 0 (low) to 1 (high). It drops where data is sparse or the field changes quickly."],
  "continuum": ["Continuum", "Ordinary visible (white) light from the Sun's surface. Sunspots look dark in continuum because they are cooler than their surroundings."],
  "magnetogram": ["Magnetogram", "A map of the surface magnetic field. Opposite magnetic polarities (north/south) are drawn as opposite colors."],
  "kp": ["Kp index", "A 0–9 scale of global geomagnetic activity. Higher Kp means stronger geomagnetic storms and aurora visible farther from the poles."],
  "f107": ["F10.7", "The Sun's radio brightness at 10.7 cm wavelength — a long-running, reliable proxy for overall solar activity."],
  "goes-xray": ["GOES X-ray flux", "Solar X-ray brightness measured by the GOES satellites. Spikes mark solar flares, graded C, M, and X by strength."],
  "solar-wind": ["Solar wind", "The constant stream of charged particles flowing off the Sun. Faster, denser wind can drive geomagnetic storms at Earth."],
  "stage-minimum": ["Solar minimum", "The calm low point of the ~11-year cycle. Few or no sunspots, few flares, and aurora are rare and stay near the poles."],
  "stage-rising": ["Rising phase", "Activity climbs out of minimum: sunspots grow more frequent and appear at mid-latitudes. Flares and aurora become more common."],
  "stage-maximum": ["Solar maximum", "The busy peak of the cycle. The most sunspots, the most flares and coronal mass ejections, and the best chance of aurora far from the poles."],
  "stage-declining": ["Declining phase", "Activity winds down toward the next minimum. Sunspots become less frequent and drift toward the Sun's equator."]
};

export const SIGNAL_TERMS = { "Kp": "kp", "F10.7": "f107", "GOES/X-ray": "goes-xray", "solar wind": "solar-wind" };
export const LEGEND_TERMS = { continuum_proxy: "continuum", br_normalized: "magnetogram", confidence: "confidence", active_regions: "active-region" };

export const STAGE_PLAIN = {
  "solar minimum": "its quietest point in the 11-year sunspot cycle",
  "rising or declining phase": "ramping between quiet and active years",
  "solar maximum": "its 11-year peak, when sunspots are most common"
};

// Which panels each surface reveals. "today" is the beginner glance (none of these).
export const MANAGED_PANELS = [".layer-controls", ".layer-legend", ".metric-grid", ".mode-copy", ".selection-panel", ".application-panel", ".research-panel"];
export const SURFACE_PANELS = {
  today: [],
  explore: [".layer-controls", ".layer-legend", ".metric-grid", ".mode-copy", ".selection-panel"],
  weather: [".metric-grid", ".mode-copy", ".application-panel"],
  research: [".layer-controls", ".layer-legend", ".metric-grid", ".mode-copy", ".selection-panel", ".application-panel", ".research-panel"]
};

// Real, recognizable Sun imagery (NASA SDO latest browse frames). Disk geometry
// measured from the 1024px source: the Sun is centered with radius 0.4565 * width.
export const BASE_IMAGES = {
  continuum: { url: "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_HMIIC.jpg", label: "SDO/HMI continuum", centerFrac: 0.5, radiusFrac: 0.4565 },
  magnetogram: { url: "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_HMIB.jpg", label: "SDO/HMI magnetogram", centerFrac: 0.5, radiusFrac: 0.4565 }
};

export const TOUR_STEPS = [
  { target: null, title: "Meet the Sun", body: "This is the real Sun as seen today by NASA's SDO satellite — not a drawing. Take a few seconds and I'll show you around." },
  { target: "#solarCanvas", title: "Real sunspots", body: "Those dark specks are sunspots: cooler, magnetically intense patches. The more sunspots there are, the more active the Sun is." },
  { target: "#stageRail", title: "Where we are in the cycle", body: "The Sun runs an ~11-year cycle from quiet (Minimum) to busy (Maximum). The highlighted step is where it is right now — click any step to learn about it." },
  { target: ".mode-grid", title: "Go as deep as you like", body: "Today is the simple view. Explore lets you click sunspot groups and toggle layers. Space Weather and Research go deeper." },
  { target: null, title: "You're set", body: "Tap any '?' to learn a term, and click a marker on the Sun to inspect it. Enjoy exploring." }
];
