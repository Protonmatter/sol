// "My Sky": a local horizon dome built from the solar-ephemeris WASM engine.
// Plots each body at its topocentric altitude/azimuth for the observer, "now".

import { loadSkyEngine, skySnapshot } from "./skyEngine.js?v=20";

const BODY_STYLE = {
  Sun: { color: "#ffd24a", size: 0.030 },
  Moon: { color: "#d8dae2", size: 0.024 },
  Mercury: { color: "#b3a487", size: 0.012 },
  Venus: { color: "#f6efcf", size: 0.016 },
  Mars: { color: "#ff6a4d", size: 0.014 },
  Jupiter: { color: "#e1c89c", size: 0.018 },
  Saturn: { color: "#f0d98a", size: 0.016 },
  Uranus: { color: "#a8e0e6", size: 0.011 },
  Neptune: { color: "#7da7ff", size: 0.011 }
};

const observer = { lat: 40.71, lon: -74.01, elev: 0, label: "New York (default)" };
let timer = 0;
let active = false;

function setLocLabel() {
  const node = document.getElementById("skyLocLabel");
  if (node) node.textContent = `${observer.label}: ${observer.lat.toFixed(2)} deg, ${observer.lon.toFixed(2)} deg - local time, updated live.`;
}

export function enterSky() {
  active = true;
  setLocLabel();
  loadSkyEngine().then(renderSky).catch(() => {
    const node = document.getElementById("skyInsight");
    if (node) node.textContent = "Sky engine unavailable (the ephemeris WebAssembly module failed to load).";
  });
  if (!timer) timer = window.setInterval(() => { if (active) renderSky(); }, 60000);
}

export function leaveSky() {
  active = false;
  if (timer) { window.clearInterval(timer); timer = 0; }
}

export function renderSky() {
  let snap;
  try {
    snap = skySnapshot(Date.now() / 1000, observer.lat, observer.lon, observer.elev);
  } catch (error) {
    return;
  }
  drawDome(snap);
  updateList(snap);
}

function sunAltitude(snap) {
  const sun = (snap.bodies || []).find((b) => b.name === "Sun");
  return sun ? sun.alt_refracted_deg : -18;
}

function skyColor(sunAlt) {
  // Night (<= -18 deg) to day (>= +6 deg).
  const t = Math.max(0, Math.min(1, (sunAlt + 18) / 24));
  const night = [7, 9, 18];
  const day = [58, 116, 196];
  const mix = night.map((n, i) => Math.round(n + (day[i] - n) * t));
  return `rgb(${mix[0]}, ${mix[1]}, ${mix[2]})`;
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

function drawDome(snap) {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("skyCanvas"));
  if (!canvas || !resize(canvas)) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width;
  const h = canvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.46;

  ctx.clearRect(0, 0, w, h);
  // Dome (sky) coloured by the Sun's altitude.
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = skyColor(sunAltitude(snap));
  ctx.fillRect(0, 0, w, h);
  ctx.restore();

  // Altitude rings (30 deg, 60 deg).
  ctx.strokeStyle = "rgba(255,255,255,0.18)";
  ctx.lineWidth = 1;
  for (const alt of [30, 60]) {
    ctx.beginPath();
    ctx.arc(cx, cy, (1 - alt / 90) * r, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Horizon.
  ctx.strokeStyle = "rgba(247,183,51,0.8)";
  ctx.lineWidth = Math.max(1.5, w * 0.002);
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.stroke();

  // Cardinal directions (N up, clockwise - compass orientation).
  ctx.fillStyle = "#f6f3e8";
  ctx.font = `${Math.max(13, r * 0.05)}px Segoe UI, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const pad = r * 0.1;
  ctx.fillText("N", cx, cy - r - pad * 0.6);
  ctx.fillText("S", cx, cy + r + pad * 0.6);
  ctx.fillText("E", cx + r + pad * 0.6, cy);
  ctx.fillText("W", cx - r - pad * 0.6, cy);

  // Bodies above the horizon.
  for (const b of snap.bodies || []) {
    if (!b.above_horizon) continue;
    const style = BODY_STYLE[b.name] || { color: "#ffffff", size: 0.012 };
    const rr = (1 - b.alt_deg / 90) * r;
    const az = b.az_deg * Math.PI / 180;
    const x = cx + rr * Math.sin(az);
    const y = cy - rr * Math.cos(az);
    const size = Math.max(2.5, r * style.size);
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = style.color;
    ctx.fill();
    ctx.fillStyle = "rgba(246,243,232,0.95)";
    ctx.font = `${Math.max(11, r * 0.035)}px Segoe UI, sans-serif`;
    ctx.textAlign = "left";
    ctx.fillText(b.name, x + size + 4, y);
  }
}

function jdToLocal(jd) {
  if (jd == null || !Number.isFinite(jd)) return "--";
  const unix = (jd - 2440587.5) * 86400;
  return new Date(unix * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function updateList(snap) {
  const list = document.getElementById("skyList");
  if (!list) return;
  list.textContent = "";
  const up = (snap.bodies || []).filter((b) => b.above_horizon).sort((a, b) => b.alt_deg - a.alt_deg);
  if (!up.length) {
    const row = document.createElement("div");
    row.className = "sky-row";
    row.textContent = "Nothing is above your horizon right now.";
    list.appendChild(row);
  }
  for (const b of up) {
    const row = document.createElement("div");
    row.className = "sky-row";
    const title = document.createElement("strong");
    title.textContent = `${b.name} - ${Math.round(b.alt_deg)} deg up in the ${b.compass}`;
    const detail = document.createElement("span");
    detail.className = "muted";
    detail.textContent = `azimuth ${Math.round(b.az_deg)} deg, rises ${jdToLocal(b.rise_jd)}, sets ${jdToLocal(b.set_jd)}`;
    row.appendChild(title);
    row.appendChild(detail);
    list.appendChild(row);
  }
}

// --- Observer controls ---
document.getElementById("skyGeo")?.addEventListener("click", () => {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      observer.lat = pos.coords.latitude;
      observer.lon = pos.coords.longitude;
      observer.elev = pos.coords.altitude || 0;
      observer.label = "Your location";
      setLocLabel();
      renderSky();
    },
    () => {
      const node = document.getElementById("skyLocLabel");
      if (node) node.textContent = "Location permission denied - enter coordinates manually.";
    }
  );
});

document.getElementById("skySet")?.addEventListener("click", () => {
  const lat = Number(/** @type {HTMLInputElement} */ (document.getElementById("skyLat")).value);
  const lon = Number(/** @type {HTMLInputElement} */ (document.getElementById("skyLon")).value);
  if (Number.isFinite(lat) && Number.isFinite(lon)) {
    observer.lat = Math.max(-90, Math.min(90, lat));
    observer.lon = lon;
    observer.label = "Set location";
    setLocLabel();
    renderSky();
  }
});
