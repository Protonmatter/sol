// "Solar System": a top-down heliocentric orbit view built from the ephemeris WASM engine.
// Looks straight down on the ecliptic plane; planets sit at their real VSOP2013 positions.

import { loadSkyEngine, systemSnapshot } from "./skyEngine.js?v=20";

const BODY_STYLE = {
  Mercury: { color: "#b3a487", size: 3.0 },
  Venus: { color: "#f6efcf", size: 4.2 },
  Earth: { color: "#5b9bff", size: 4.4 },
  Mars: { color: "#ff6a4d", size: 3.6 },
  Jupiter: { color: "#e1c89c", size: 7.0 },
  Saturn: { color: "#f0d98a", size: 6.2 },
  Uranus: { color: "#a8e0e6", size: 5.0 },
  Neptune: { color: "#7da7ff", size: 5.0 }
};

// Mean orbital semi-major axes (AU) — drawn as stable guide rings.
const SEMI_MAJOR_AU = {
  Mercury: 0.387, Venus: 0.723, Earth: 1.0, Mars: 1.524,
  Jupiter: 5.203, Saturn: 9.537, Uranus: 19.191, Neptune: 30.07
};

const state = { offsetYears: 0, viewAu: 32, selected: null, active: false, hits: [] };

export function enterSystem() {
  state.active = true;
  loadSkyEngine().then(() => {
    // The engine may already be cached (loaded by My Sky), so its promise can
    // resolve before the just-shown canvas has a layout box. Render on the next
    // frame, once layout has settled, so the first paint is never blank.
    render();
    requestAnimationFrame(() => { if (state.active) render(); });
  }).catch(() => {
    const node = document.getElementById("systemInsight");
    if (node) node.textContent = "Orbit engine unavailable (the ephemeris WebAssembly module failed to load).";
  });
}

export function leaveSystem() {
  state.active = false;
}

function currentUnix() {
  return Date.now() / 1000 + state.offsetYears * 365.25 * 86400;
}

function render() {
  let snap;
  try {
    snap = systemSnapshot(currentUnix());
  } catch (error) {
    return;
  }
  draw(snap);
  updateInfo(snap);
}

function resize(canvas) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0) return false;
  const scale = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.round(rect.width * scale);
  const h = Math.round(rect.height * scale);
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  return true;
}

function draw(snap) {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("systemCanvas"));
  if (!canvas || !resize(canvas)) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.46;
  const scale = r / state.viewAu; // pixels per AU

  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = "#05070d";
  ctx.fillRect(0, 0, w, h);

  // Guide orbit rings at each planet's mean distance.
  ctx.lineWidth = 1;
  for (const [name, a] of Object.entries(SEMI_MAJOR_AU)) {
    const rr = a * scale;
    if (rr > r * 1.02 || rr < 2) continue;
    ctx.strokeStyle = name === state.selected ? "rgba(247,183,51,0.55)" : "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.stroke();
  }

  // The Sun at the centre.
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(5, r * 0.02), 0, Math.PI * 2);
  ctx.fillStyle = "#ffd24a";
  ctx.shadowColor = "#ffd24a";
  ctx.shadowBlur = r * 0.05;
  ctx.fill();
  ctx.shadowBlur = 0;

  // Planet dots at their heliocentric (x, y) projected top-down (y up on screen).
  state.hits = [];
  ctx.font = `${Math.max(11, r * 0.03)}px Segoe UI, sans-serif`;
  ctx.textBaseline = "middle";
  ctx.textAlign = "left";
  for (const b of snap.bodies || []) {
    const style = BODY_STYLE[b.name] || { color: "#ffffff", size: 3 };
    const sx = cx + b.x_au * scale;
    const sy = cy - b.y_au * scale;
    if (sx < -20 || sx > w + 20 || sy < -20 || sy > h + 20) continue;
    const selected = b.name === state.selected;
    const size = Math.max(2.5, (style.size / 4) * Math.max(3, r * 0.012));
    if (selected) {
      ctx.beginPath();
      ctx.arc(sx, sy, size + 5, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(247,183,51,0.9)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fillStyle = style.color;
    ctx.fill();
    ctx.fillStyle = "rgba(246,243,232,0.92)";
    ctx.fillText(b.name, sx + size + 4, sy);
    state.hits.push({ name: b.name, sx, sy });
  }

  // Scale legend (one AU bar) bottom-left.
  ctx.fillStyle = "rgba(246,243,232,0.7)";
  ctx.font = `${Math.max(10, r * 0.026)}px Segoe UI, sans-serif`;
  ctx.textAlign = "left";
  const barAu = state.viewAu >= 12 ? 10 : state.viewAu >= 3 ? 5 : 1;
  const bx = 16;
  const by = h - 18;
  ctx.strokeStyle = "rgba(246,243,232,0.7)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(bx, by);
  ctx.lineTo(bx + barAu * scale, by);
  ctx.stroke();
  ctx.fillText(`${barAu} AU`, bx, by - 10);
}

function updateInfo(snap) {
  const dateLabel = document.getElementById("systemDateLabel");
  if (dateLabel) {
    const d = new Date(currentUnix() * 1000);
    const tag = state.offsetYears === 0 ? " (now)" : "";
    dateLabel.textContent = d.toLocaleDateString([], { year: "numeric", month: "short", day: "numeric" }) + tag;
  }
  const info = document.getElementById("systemInfo");
  if (!info) return;
  info.textContent = "";
  const body = (snap.bodies || []).find((b) => b.name === state.selected);
  if (!body) {
    const row = document.createElement("div");
    row.className = "sky-row";
    row.textContent = "Click a planet to inspect its distance, speed, phase, brightness, and temperature.";
    info.appendChild(row);
    return;
  }
  const card = document.createElement("div");
  card.className = "sky-row system-detail";
  const title = document.createElement("strong");
  title.textContent = body.name;
  card.appendChild(title);

  const dl = document.createElement("dl");
  dl.className = "detail-grid";
  const add = (label, value) => {
    if (value == null) return;
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value;
    dl.appendChild(dt);
    dl.appendChild(dd);
  };
  const lightMin = body.geo_dist_au * 8.3168;
  add("From the Sun", `${body.dist_au.toFixed(3)} AU`);
  add("From Earth", `${body.geo_dist_au.toFixed(3)} AU · light ${lightMin.toFixed(1)} min`);
  add("Orbital speed", `${body.speed_kms.toFixed(2)} km/s`);
  if (body.illuminated_fraction != null) {
    add("Illuminated", `${(body.illuminated_fraction * 100).toFixed(1)}% · phase ${body.phase_angle_deg.toFixed(1)}°`);
  }
  if (body.magnitude != null) add("Apparent magnitude", body.magnitude.toFixed(1));
  if (body.equilibrium_temp_k != null) add("Equilibrium temp", `${body.equilibrium_temp_k.toFixed(0)} K`);
  card.appendChild(dl);
  info.appendChild(card);
}

// --- Controls ---
document.getElementById("systemTime")?.addEventListener("input", (event) => {
  state.offsetYears = Number(/** @type {HTMLInputElement} */ (event.target).value);
  if (state.active) render();
});
document.getElementById("systemZoom")?.addEventListener("input", (event) => {
  state.viewAu = Number(/** @type {HTMLInputElement} */ (event.target).value);
  if (state.active) render();
});
document.getElementById("systemNow")?.addEventListener("click", () => {
  state.offsetYears = 0;
  const slider = /** @type {HTMLInputElement|null} */ (document.getElementById("systemTime"));
  if (slider) slider.value = "0";
  if (state.active) render();
});
document.getElementById("systemCanvas")?.addEventListener("click", (event) => {
  const canvas = /** @type {HTMLCanvasElement} */ (event.currentTarget);
  const rect = canvas.getBoundingClientRect();
  const x = (event.clientX - rect.left) * (canvas.width / rect.width);
  const y = (event.clientY - rect.top) * (canvas.height / rect.height);
  let best = null;
  for (const hit of state.hits) {
    const d = Math.hypot(hit.sx - x, hit.sy - y);
    if (d < 22 && (!best || d < best.d)) best = { d, name: hit.name };
  }
  state.selected = best ? best.name : null;
  render();
});
