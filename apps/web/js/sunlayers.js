// A labeled cutaway cross-section of the Sun's structure — the layers we can NOT photograph (the
// interior: core → radiative → convective zones) plus the thin observable atmosphere (photosphere →
// chromosphere → corona), with temperatures and radii. Complements the wavelength selector, which
// shows only the atmosphere. Built as a crisp inline SVG + an accessible text list.

// name, temperature, radius, note, swatch colour, and (for the interior) the outer radius as a
// fraction of R☉ used to draw the nested circles. Atmosphere layers are thin shells above the surface.
const INTERIOR = [
  { name: "Core",            temp: "~15,000,000 K",            rad: "0 – 0.25 R☉  (0 – 174,000 km)", frac: 0.25, fill: "#fff6cf", note: "Nuclear fusion — hydrogen fuses to helium, powering the Sun." },
  { name: "Radiative zone",  temp: "7,000,000 → 2,000,000 K",  rad: "0.25 – 0.7 R☉",                  frac: 0.70, fill: "#ffd277", note: "Energy crawls out as radiation — a photon needs ~170,000 years to escape." },
  { name: "Convective zone", temp: "2,000,000 → 5,500 K",      rad: "0.7 – 1 R☉",                     frac: 1.00, fill: "#ff9a3c", note: "Boiling cells of plasma carry heat to the surface (granulation)." },
];
const ATMOSPHERE = [
  { name: "Photosphere",  temp: "~5,500 K",            rad: "the visible surface, ~500 km thick", fill: "#ffe39a", note: "Where sunlight escapes; sunspots and granulation live here." },
  { name: "Chromosphere", temp: "~4,500 → 20,000 K",   rad: "~2,000 km above the surface",         fill: "#ff7a5c", note: "A reddish layer; seen at 304 Å and during total eclipses." },
  { name: "Corona",       temp: "1 – 3 million K",      rad: "millions of km outward",              fill: "#bcd2ff", note: "The faint, ultra-hot outer atmosphere — and the source of the solar wind." },
];

// Outer → inner, for the leader labels (matches the visual stacking top → bottom on the right).
const LABEL_ORDER = ["Corona", "Chromosphere", "Photosphere", "Convective zone", "Radiative zone", "Core"];

function cutawaySVG() {
  const W = 380, H = 330, cx = 128, cy = 165, R = 120;
  const conv = R, radz = R * 0.70, core = R * 0.25;
  const th = -42 * Math.PI / 180, ct = Math.cos(th), st = Math.sin(th); // up-right leader ray
  const onRay = (r) => [cx + r * ct, cy + r * st];
  // representative radius of each labelled layer (where its leader starts)
  const srcR = { "Corona": R + 30, "Chromosphere": R + 7, "Photosphere": R - 3,
    "Convective zone": (radz + conv) / 2, "Radiative zone": (core + radz) / 2, "Core": core * 0.5 };
  const lx = 262, lys = [24, 60, 96, 146, 210, 288];
  let leaders = "";
  LABEL_ORDER.forEach((name, i) => {
    const [sx, sy] = onRay(srcR[name]); const ly = lys[i];
    leaders += `<polyline points="${sx.toFixed(1)},${sy.toFixed(1)} ${lx - 16},${ly} ${lx - 7},${ly}" fill="none" stroke="rgba(222,224,238,0.5)" stroke-width="1.2"/>`;
    leaders += `<circle cx="${sx.toFixed(1)}" cy="${sy.toFixed(1)}" r="2.3" fill="#fff"/>`;
    leaders += `<text x="${lx}" y="${ly + 4}" font-size="12.5" font-weight="600" fill="#ece9df">${name}</text>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cutaway of the Sun's layers" font-family="Segoe UI, system-ui, sans-serif">
    <defs>
      <radialGradient id="coronaGlow"><stop offset="0.7" stop-color="rgba(150,180,255,0)"/><stop offset="0.8" stop-color="rgba(160,190,255,0.5)"/><stop offset="1" stop-color="rgba(150,180,255,0)"/></radialGradient>
      <radialGradient id="coreGlow"><stop offset="0" stop-color="#fffdf2"/><stop offset="1" stop-color="#ffe7a4"/></radialGradient>
    </defs>
    <circle cx="${cx}" cy="${cy}" r="${R + 42}" fill="url(#coronaGlow)"/>
    <circle cx="${cx}" cy="${cy}" r="${conv}" fill="#ff9a3c"/>
    <circle cx="${cx}" cy="${cy}" r="${radz}" fill="#ffd277"/>
    <circle cx="${cx}" cy="${cy}" r="${core}" fill="url(#coreGlow)"/>
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="none" stroke="#ffe7a0" stroke-width="2.5"/>
    <circle cx="${cx}" cy="${cy}" r="${R + 4}" fill="none" stroke="rgba(255,120,90,0.65)" stroke-width="2"/>
    ${leaders}
  </svg>`;
}

function listHTML() {
  const rows = INTERIOR.concat(ATMOSPHERE) // centre outward: core → corona
    .map((o) => `<div class="layer-row"><span class="layer-dot" style="--c:${o.fill}"></span><div>
      <strong>${o.name}</strong> · <span class="muted">${o.temp}</span><br>
      <span class="layer-rad">${o.rad}</span> — ${o.note}</div></div>`).join("");
  return `<div class="layer-list">${rows}</div>`;
}

export function buildSunCutaway() {
  const host = document.getElementById("sunCutaway");
  if (!host) return;
  host.innerHTML = cutawaySVG() + listHTML();
}
