// "My Sky": a local horizon dome built from the solar-ephemeris WASM engine.
// Plots each body at its topocentric altitude/azimuth for the observer, "now".

import { loadSkyEngine, skySnapshot, fetchServerSky } from "./skyEngine.js?v=6322cab170";

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
let provider = "local"; // "local" = on-device WASM (default), "server" = DE441 high-precision tier
let chosenUnix = null;  // null = live "now"; otherwise a frozen instant (seconds)
let lastSnap = null;    // most recent snapshot, for Export

const currentUnix = () => (chosenUnix != null ? chosenUnix : Date.now() / 1000);

function setProvenance(text) {
  const node = document.getElementById("skyProvenance");
  if (node) node.textContent = text;
}

function setLocLabel() {
  const node = document.getElementById("skyLocLabel");
  if (node) node.textContent = `${observer.label}: ${observer.lat.toFixed(2)} deg, ${observer.lon.toFixed(2)} deg.`;
}

function setTimeLabel() {
  const node = document.getElementById("skyTimeLabel");
  if (node) node.textContent = chosenUnix == null
    ? "Live — updating every minute."
    : "Frozen at the chosen time. Press Now to return to live.";
}

function toLocalInput(unix) {
  const d = new Date(unix * 1000);
  const p = (x) => String(x).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function syncTimeInput() {
  const input = /** @type {HTMLInputElement|null} */ (document.getElementById("skyTime"));
  if (input) input.value = toLocalInput(currentUnix());
}

// Deep link: #sky=lat,lon[,unix] restores a shared location/time.
function applyDeepLink() {
  const m = /sky=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+))?/.exec(location.hash);
  if (!m) return;
  observer.lat = Math.max(-90, Math.min(90, parseFloat(m[1])));
  observer.lon = parseFloat(m[2]);
  observer.label = "Shared location";
  if (m[3]) chosenUnix = parseInt(m[3], 10);
}

export function enterSky() {
  active = true;
  applyDeepLink();
  setLocLabel();
  setTimeLabel();
  syncTimeInput();
  loadSkyEngine().then(renderSky).catch(() => {
    const node = document.getElementById("skyInsight");
    if (node) node.textContent = "Sky engine unavailable (the ephemeris WebAssembly module failed to load).";
  });
  // Auto-tick only while live; a frozen time stays put.
  if (!timer) timer = window.setInterval(() => { if (active && chosenUnix == null) { renderSky(); syncTimeInput(); } }, 60000);
}

export function leaveSky() {
  active = false;
  if (timer) { window.clearInterval(timer); timer = 0; }
}

export function renderSky() {
  const unix = currentUnix();
  if (provider === "server") {
    setProvenance("Fetching high-precision positions (DE441)…");
    fetchServerSky(unix, observer.lat, observer.lon, observer.elev)
      .then((snap) => {
        if (!active || provider !== "server") return;
        lastSnap = snap;
        drawDome(snap);
        updateList(snap);
        setProvenance("Source: JPL Horizons / DE441 (server tier). Rise/set come from the on-device engine.");
      })
      .catch((error) => {
        // Graceful fall back to the on-device engine when the optional server is down.
        renderLocal();
        setProvenance(`High-precision server unavailable (${error.message}) — showing the on-device engine.`);
      });
    return;
  }
  renderLocal();
  setProvenance("Source: on-device engine — VSOP2013 + ELP-MPP02; ≤ ~5″ vs JPL Horizons near today.");
}

function renderLocal() {
  let snap;
  try {
    snap = skySnapshot(currentUnix(), observer.lat, observer.lon, observer.elev);
  } catch (error) {
    return;
  }
  lastSnap = snap;
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

  // Catalogue stars first (so Sun/Moon/planets draw on top).
  ctx.fillStyle = "rgba(220,228,255,0.92)";
  for (const b of snap.bodies || []) {
    if (!b.above_horizon || BODY_STYLE[b.name]) continue; // BODY_STYLE = Sun/Moon/planets
    const rr = (1 - b.alt_deg / 90) * r;
    const az = b.az_deg * Math.PI / 180;
    const x = cx + rr * Math.sin(az);
    const y = cy - rr * Math.cos(az);
    const mag = b.magnitude == null ? 2 : b.magnitude;
    const size = Math.max(1.2, (2.5 - mag) * r * 0.005);
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fill();
    if (mag < 1.5) { // label only the brightest, to avoid clutter
      ctx.font = `${Math.max(9, r * 0.025)}px Segoe UI, sans-serif`;
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(200,210,235,0.7)";
      ctx.fillText(b.name, x + size + 3, y);
      ctx.fillStyle = "rgba(220,228,255,0.92)";
    }
  }

  // Sun / Moon / planets above the horizon.
  for (const b of snap.bodies || []) {
    if (!b.above_horizon) continue;
    const style = BODY_STYLE[b.name];
    if (!style) continue;
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
    const magText = (!BODY_STYLE[b.name] && b.magnitude != null) ? `mag ${b.magnitude.toFixed(1)}, ` : "";
    detail.textContent = `${magText}azimuth ${Math.round(b.az_deg)} deg, rises ${jdToLocal(b.rise_jd)}, sets ${jdToLocal(b.set_jd)}`;
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

// --- Data-source toggle (on-device engine vs optional DE441 server tier) ---
function setProvider(p) {
  provider = p;
  document.getElementById("skyProviderLocal")?.classList.toggle("active", p === "local");
  document.getElementById("skyProviderServer")?.classList.toggle("active", p === "server");
  if (active) renderSky();
}
document.getElementById("skyProviderLocal")?.addEventListener("click", () => setProvider("local"));
document.getElementById("skyProviderServer")?.addEventListener("click", () => setProvider("server"));

// --- Time controls (plan for any date/time, not just "now") ---
document.getElementById("skyTime")?.addEventListener("change", (event) => {
  const v = /** @type {HTMLInputElement} */ (event.target).value;
  const t = v ? new Date(v).getTime() : NaN;
  if (Number.isFinite(t)) {
    chosenUnix = t / 1000;
    setTimeLabel();
    if (active) renderSky();
  }
});
document.getElementById("skyNow")?.addEventListener("click", () => {
  chosenUnix = null;
  syncTimeInput();
  setTimeLabel();
  if (active) renderSky();
});

// --- Share link + export (deep-link the location/time; download the snapshot) ---
document.getElementById("skyShare")?.addEventListener("click", () => {
  const u = Math.round(currentUnix());
  location.hash = `sky=${observer.lat.toFixed(4)},${observer.lon.toFixed(4)},${u}`;
  const label = document.getElementById("skyTimeLabel");
  const msg = "Shareable link copied to the address bar.";
  if (navigator.clipboard) {
    navigator.clipboard.writeText(location.href).then(() => { if (label) label.textContent = msg; }, () => {});
  } else if (label) {
    label.textContent = "Link is in the address bar — copy it to share.";
  }
});
document.getElementById("skyExport")?.addEventListener("click", () => {
  if (!lastSnap) return;
  const blob = new Blob([JSON.stringify(lastSnap, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `sky-${Math.round(currentUnix())}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
});
