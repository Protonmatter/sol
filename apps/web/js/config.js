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

// (The old explore/weather/research entries described surfaces removed in the
// three-destination consolidation — they were unreachable dead copy.)
export const MODE_COPY = {
  today: ["Today on the Sun", "A plain-language snapshot of where the Sun is in its cycle and what is happening on the side facing us right now."],
};

export const APPLICATION_COPY = {
  weather: {
    title: "Space-weather impact",
    text: "Public SWPC indices map to impact categories you may have heard of. Shown for learning only — this app issues no warnings.",
    signals: ["Kp", "F10.7", "GOES/X-ray", "solar wind"]
  },
};

// Plain-language definitions surfaced via the ? affordances and legend/signal chips.
export const GLOSSARY = {
  "active-region": ["Active region", "A magnetically intense area on the Sun, usually marked by a sunspot group. Active regions are where flares and coronal mass ejections come from."],
  "br": ["Br — radial magnetic field", "How strongly the magnetic field points out of or into the surface at a spot. Shown here in normalized units, not calibrated Gauss."],
  "confidence": ["Confidence", "How much the model trusts the value at a spot, from 0 (low) to 1 (high). It drops where data is sparse or the field changes quickly."],
  "continuum": ["Continuum", "Ordinary visible (white) light from the Sun's surface. Sunspots look dark in continuum because they are cooler than their surroundings."],
  "magnetogram": ["Magnetogram", "A map of the surface magnetic field. Opposite magnetic polarities (north/south) are drawn as opposite colors."],
  "kp": ["Kp index", "A 0–9 scale of global geomagnetic activity. Higher Kp means stronger geomagnetic storms and aurora visible farther from the poles."],
  "geomagnetic-latitude": ["Geomagnetic latitude", "Your latitude measured from Earth's magnetic pole instead of the geographic one. Aurora follows the magnetic pole, so this — not your map latitude — decides whether the auroral oval can reach you."],
  "f107": ["F10.7", "The Sun's radio brightness at 10.7 cm wavelength — a long-running, reliable proxy for overall solar activity."],
  "goes-xray": ["GOES X-ray flux", "Solar X-ray brightness measured by the GOES satellites. Spikes mark solar flares, graded C, M, and X by strength."],
  "solar-wind": ["Solar wind", "The constant stream of charged particles flowing off the Sun. Faster, denser wind can drive geomagnetic storms at Earth."],
  "stage-minimum": ["Solar minimum", "The calm low point of the ~11-year cycle. Few or no sunspots, few flares, and aurora are rare and stay near the poles."],
  "stage-rising": ["Rising phase", "Activity climbs out of minimum: sunspots grow more frequent and appear at mid-latitudes. Flares and aurora become more common."],
  "stage-maximum": ["Solar maximum", "The busy peak of the cycle. The most sunspots, the most flares and coronal mass ejections, and the best chance of aurora far from the poles."],
  "stage-declining": ["Declining phase", "Activity winds down toward the next minimum. Sunspots become less frequent and drift toward the Sun's equator."],
  // Solar System / orrery vocabulary (surfaced by the '?' affordances in the body detail panel).
  "sidereal": ["Sidereal rotation", "How long a body takes to spin once relative to the distant stars (not to the Sun). 'Retrograde' means it spins backwards compared with most planets."],
  "axial-tilt": ["Axial tilt", "The angle between a body's spin axis and the straight-up direction of its orbit. Earth's 23.4° tilt is what gives us seasons."],
  "oblateness": ["Oblateness", "How much a fast-spinning body bulges at its equator and flattens at its poles, making its equatorial radius larger than its polar one."],
  "escape-velocity": ["Escape velocity", "The speed something needs to break free of a body's gravity for good, with no further push."],
  "magnetic-dipole": ["Magnetic dipole", "A global magnetic field with a north and south pole, like a bar magnet — here compared with the strength of Earth's."],
  "orbital-speed": ["Orbital speed", "How fast the body is moving along its orbit right now. Bodies travel faster when they are closer to the Sun."],
  "phase-angle": ["Phase angle", "The Sun–body–observer angle. It sets how much of the lit face we see — the same effect as the Moon's phases."],
  "apparent-magnitude": ["Apparent magnitude", "How bright the object looks from Earth. Smaller numbers are brighter; the brightest stars sit near 0 or below."],
  "equilibrium-temperature": ["Equilibrium temperature", "The temperature a body would settle at from sunlight alone if it were a simple black body — no greenhouse gases, no internal heat. Venus's real ~737 K is far above its ~227 K equilibrium value because of its thick CO₂ atmosphere."]
};

export const SIGNAL_TERMS = { "Kp": "kp", "F10.7": "f107", "GOES/X-ray": "goes-xray", "solar wind": "solar-wind" };
export const LEGEND_TERMS = { continuum: "continuum", magnetogram: "magnetogram", continuum_proxy: "continuum", br_normalized: "magnetogram", confidence: "confidence", active_regions: "active-region" };

export const STAGE_PLAIN = {
  "solar minimum": "its quietest point in the 11-year sunspot cycle",
  "rising or declining phase": "ramping between quiet and active years",
  "solar maximum": "its 11-year peak, when sunspots are most common"
};

// The Sun is now a single surface; its depth lives in progressive-disclosure drawers (`.sun-section`)
// shown on the Sun surface and hidden on My Sky / Solar System purely via CSS (body[data-surface]).

// Real NASA SDO "latest" browse images — the Sun looks different at every wavelength because each one
// is emitted by a different layer/temperature of the solar atmosphere. HMI continuum/magnetogram ARE
// the photospheric disk (clipped to it); the AIA EUV/UV channels show the corona arcing beyond the limb
// (not clipped). radiusFrac = the photosphere's radius as a fraction of the 1024-px frame — HMI fills
// the frame (~0.4565); AIA's wider field of view makes the disk smaller (~0.39).
const SDO = "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_";
export const BASE_IMAGES = {
  continuum:   { url: SDO + "HMIIC.jpg", label: "Visible (HMI continuum)", centerFrac: 0.5, radiusFrac: 0.4565, clip: true, layer: "Photosphere — the surface", temp: "~5,500 K", blurb: "Ordinary white light from the Sun's surface. Dark sunspots are cooler, magnetically intense regions." },
  magnetogram: { url: SDO + "HMIB.jpg", label: "Magnetic field (HMI magnetogram)", centerFrac: 0.5, radiusFrac: 0.4565, clip: true, layer: "Photosphere — magnetic field", temp: "magnetic map", blurb: "The surface magnetic field. Black and white are opposite magnetic polarities; active regions are where they're strongest." },
  aia1700:     { url: SDO + "1700.jpg", label: "1700 Å — ultraviolet", centerFrac: 0.5, radiusFrac: 0.39, clip: false, layer: "Photosphere / temperature minimum", temp: "~4,500 K", blurb: "Ultraviolet from the lowest atmosphere, just above the visible surface." },
  aia304:      { url: SDO + "0304.jpg", label: "304 Å — chromosphere", centerFrac: 0.5, radiusFrac: 0.39, clip: false, layer: "Chromosphere / transition region", temp: "~50,000 K", blurb: "He II light from the chromosphere — filaments, prominences, and the cooler atmosphere above the surface." },
  aia171:      { url: SDO + "0171.jpg", label: "171 Å — quiet corona", centerFrac: 0.5, radiusFrac: 0.39, clip: false, layer: "Upper transition region / quiet corona", temp: "~600,000 K", blurb: "Fe IX — the iconic magnetic coronal loops arcing above active regions." },
  aia193:      { url: SDO + "0193.jpg", label: "193 Å — corona", centerFrac: 0.5, radiusFrac: 0.39, clip: false, layer: "Corona + hot flare plasma", temp: "~1.2 MK", blurb: "Fe XII — the bright corona, and dark coronal holes where the fast solar wind escapes." },
  aia211:      { url: SDO + "0211.jpg", label: "211 Å — active corona", centerFrac: 0.5, radiusFrac: 0.39, clip: false, layer: "Active-region corona", temp: "~2 MK", blurb: "Fe XIV — the hotter, magnetically active corona." },
  aia335:      { url: SDO + "0335.jpg", label: "335 Å — active corona", centerFrac: 0.5, radiusFrac: 0.39, clip: false, layer: "Active-region corona", temp: "~2.5 MK", blurb: "Fe XVI — hot corona over the most active regions." },
  aia131:      { url: SDO + "0131.jpg", label: "131 Å — flares", centerFrac: 0.5, radiusFrac: 0.39, clip: false, layer: "Flaring corona", temp: "~10 MK (flares)", blurb: "Fe XXI / Fe VIII — flaring regions and the hottest flare plasma." },
  aia094:      { url: SDO + "0094.jpg", label: "94 Å — flares", centerFrac: 0.5, radiusFrac: 0.39, clip: false, layer: "Flaring corona", temp: "~6 MK", blurb: "Fe XVIII — the very hot plasma of solar flares." },
};

// The selector, ordered low atmosphere → hot corona; "model" is the synthetic engine view. Colours echo
// SDO's conventional channel palette so each chip hints at how that wavelength looks.
export const WAVELENGTHS = [
  { id: "model", short: "Model", color: "#f6aa45" },
  { id: "continuum", short: "Visible", color: "#ffcf8a" },
  { id: "magnetogram", short: "Magnetic", color: "#cdcdd8" },
  { id: "aia1700", short: "1700", color: "#b99a6b" },
  { id: "aia304", short: "304", color: "#ff9b4a" },
  { id: "aia171", short: "171", color: "#ffd24a" },
  { id: "aia193", short: "193", color: "#caa14a" },
  { id: "aia211", short: "211", color: "#b56bd6" },
  { id: "aia335", short: "335", color: "#6b8fd6" },
  { id: "aia131", short: "131", color: "#5bd6c2" },
  { id: "aia094", short: "94", color: "#6bd67a" },
];

export const TOUR_STEPS = [
  { target: null, title: "Meet the Sun", body: "This is the real Sun as seen today by NASA's SDO satellite — not a drawing. Take a few seconds and I'll show you around." },
  { target: "#solarCanvas", title: "Real sunspots", body: "Those dark specks are sunspots: cooler, magnetically intense patches. The more sunspots there are, the more active the Sun is." },
  { target: "#stageRail", title: "Where we are in the cycle", body: "The Sun runs an ~11-year cycle from quiet (Minimum) to busy (Maximum). The highlighted step is where it is right now — click any step to learn about it." },
  { target: ".mode-grid", title: "Three places to explore", body: "These buttons switch the whole app. You're on The Sun now — the drawers beneath it go deeper: the layers, what it means for Earth, and the model under the hood." },
  { target: ".mode-button[data-mode='sky']", title: "My Sky", body: "Switch here for your local night sky: where the Sun, Moon, planets and bright stars are right now for your location, with rise and set times. Real orbital mechanics, validated against NASA JPL." },
  { target: ".mode-button[data-mode='orrery']", title: "Solar System", body: "And here you fly through the planets in 3-D at their true positions — drag to orbit, scroll to zoom, click a world to inspect it. Sizes are enlarged so the small planets show up; flip on True scale for honest proportions." },
  { target: null, title: "You're set", body: "Tap any '?' to learn a term, and click a marker on the Sun to inspect it. Enjoy exploring." }
];
