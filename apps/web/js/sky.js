// "My Sky": a local horizon dome built from the solar-ephemeris WASM engine.
// Plots each body at its topocentric altitude/azimuth for the observer, "now".

import { store } from "./store.js?v=adefd395e5";
import { loadSkyEngine, skySnapshot, fetchServerSky, bodyTrack, BODY_INDEX } from "./skyEngine.js?v=adefd395e5";
import { STARS, CONSTELLATIONS } from "./celestial.js?v=adefd395e5";
import { epochAccuracy, epochLabel } from "./accuracy.js?v=adefd395e5";

function updateSkyAccuracy() {
  const node = document.getElementById("skyAccuracy"); if (!node) return;
  const yrs = (currentUnix() - Date.now() / 1000) / (365.25 * 86400);
  const a = epochAccuracy(yrs, "sky");
  node.className = "epoch-accuracy acc-" + a.level;
  node.textContent = Math.abs(yrs) < 0.5 ? "" : `${epochLabel(yrs)} — ${a.text}`;
}

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

// Name → J2000 (RA°, Dec°) for the constellation stars (used to draw the figures + compute arcs).
const STAR_RADEC = (() => { const m = {}; for (const s of STARS) m[s.n] = s; return m; })();

// Topocentric altitude/azimuth (degrees, az from North through East) for a J2000 RA/Dec at a given
// local sidereal time and latitude. Precession/nutation/refraction are dropped — sub-degree at the
// dome's resolution. The engine's own bodies carry the full reduction; this is for the star figures
// and the diurnal trajectory arcs (which sweep the hour angle from the body's current RA/Dec).
function altAz(raDeg, decDeg, lstDeg, latDeg) {
  const d = Math.PI / 180;
  const H = (lstDeg - raDeg) * d, dec = decDeg * d, lat = latDeg * d;
  const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(H);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const cosA = (Math.sin(dec) - Math.sin(lat) * sinAlt) / (Math.cos(lat) * Math.cos(alt) || 1e-9);
  let A = Math.acos(Math.max(-1, Math.min(1, cosA)));     // 0..π measured from North
  if (Math.sin(H) > 0) A = 2 * Math.PI - A;               // east of meridian vs west
  return { alt: alt / d, az: ((A / d) % 360 + 360) % 360 };
}

// UI/interaction state for hover tooltips, trajectory arcs, and the constellation overlay.
let plotted = [];          // {name, x, y, hit, body} in backing-store px, for hover hit-testing
let domeGeom = null;       // {cx, cy, r, dpr}
let activeName = null;     // hovered or pinned object
let pinned = false;
let showConstellations = true;
let showTrajectory = true;

// The surface's user-facing state, registered on the shared store (store.sky) so it is
// inspectable from one place like the rest of the app — the same object, no copies.
// Rendering internals (plotted/domeGeom/hover state above) stay module-local.
const skyState = (store.sky = {
  observer: { lat: 40.71, lon: -74.01, elev: 0, label: "New York (default)" },
  provider: "local", // "local" = on-device WASM (default), "server" = DE441 high-precision tier
  chosenUnix: null,  // null = live "now"; otherwise a frozen instant (seconds)
});
const observer = skyState.observer;
let timer = 0;
let active = false;
let lastSnap = null;    // most recent snapshot, for Export
let deepLinkApplied = false; // the #sky= hash is applied ONCE, not on every surface switch
let renderGen = 0;      // stale-response guard for the async server tier

// --- Persistence: My Sky is a repeat-use surface; losing the observer/provider on every
// reload (and re-prompting for geolocation) was real friction. localStorage can throw in
// private-mode/blocked-storage browsers, so every access is guarded.
function saveSkyPrefs() {
  try {
    localStorage.setItem("sol-sky-observer", JSON.stringify({
      lat: observer.lat, lon: observer.lon, elev: observer.elev, label: observer.label,
    }));
    localStorage.setItem("sol-sky-provider", skyState.provider);
  } catch (_) { /* storage unavailable — session-only prefs */ }
}

function restoreSkyPrefs() {
  try {
    const raw = localStorage.getItem("sol-sky-observer");
    if (raw) {
      const saved = JSON.parse(raw);
      if (Number.isFinite(saved.lat) && Number.isFinite(saved.lon)) {
        observer.lat = Math.max(-90, Math.min(90, saved.lat));
        observer.lon = Math.max(-180, Math.min(180, saved.lon));
        observer.elev = Number.isFinite(saved.elev) ? saved.elev : 0;
        observer.label = typeof saved.label === "string" && saved.label ? saved.label : "Saved location";
      }
    }
    const savedProvider = localStorage.getItem("sol-sky-provider");
    if (savedProvider === "server" || savedProvider === "local") skyState.provider = savedProvider;
  } catch (_) { /* storage unavailable */ }
}
restoreSkyPrefs();

const currentUnix = () => (skyState.chosenUnix != null ? skyState.chosenUnix : Date.now() / 1000);

function setProvenance(text) {
  const node = document.getElementById("skyProvenance");
  if (node) node.textContent = text;
}

function setLocLabel() {
  const node = document.getElementById("skyLocLabel");
  if (node) node.textContent = `${observer.label}: ${observer.lat.toFixed(2)}°, ${observer.lon.toFixed(2)}° E.`;
}

function browserTimeZoneLabel() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || "device timezone"; }
  catch (_) { return "device timezone"; }
}

function setTimeLabel() {
  const node = document.getElementById("skyTimeLabel");
  if (!node) return;
  const stateText = skyState.chosenUnix == null
    ? "Live — updating every minute."
    : "Frozen at the chosen time. Press Now to return to live.";
  node.textContent = `${stateText} Rise, transit, and set times use ${browserTimeZoneLabel()}, the browser/device timezone.`;
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

// Deep link: #sky=lat,lon[,unix] restores a shared location/time — applied ONCE per page
// load. Re-applying on every enterSky() re-froze the sky at the share instant after every
// surface switch (the trap re-armed each time the user pressed Now and navigated away).
function applyDeepLink() {
  if (deepLinkApplied) return;
  deepLinkApplied = true; // latch on the first check — a hash written later by "share" must never re-apply
  const m = /sky=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)(?:,(\d+))?/.exec(location.hash);
  if (!m) return;
  observer.lat = Math.max(-90, Math.min(90, parseFloat(m[1])));
  const lon = parseFloat(m[2]);
  observer.lon = lon >= -180 && lon <= 180 ? lon : ((lon % 360) + 540) % 360 - 180; // wrap: longitude is an angle
  observer.label = "Shared location";
  if (m[3]) skyState.chosenUnix = parseInt(m[3], 10);
}

// Drop the #sky= hash once the user overrides what it encoded (goes live, moves, or
// repicks a time) so reloads and future deep-link logic don't resurrect stale state.
function clearDeepLinkHash() {
  deepLinkApplied = true;
  if (/#?sky=/.test(location.hash)) {
    history.replaceState(null, "", location.pathname + location.search);
  }
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
  if (!timer) timer = window.setInterval(() => { if (active && skyState.chosenUnix == null) { renderSky(); syncTimeInput(); } }, 60000);
}

export function leaveSky() {
  active = false;
  if (timer) { window.clearInterval(timer); timer = 0; }
}

// Re-fit the dome to its CSS box. Without this, a resize or panel collapse while the time
// was frozen left the backing store at the old size — the dome rendered as an ellipse
// until the next redraw trigger (which, frozen, never came).
export function resizeSky() {
  if (active) redraw();
}

export function renderSky() {
  const unix = currentUnix();
  const gen = ++renderGen; // drop out-of-order server responses (older fetch resolving last)
  if (skyState.provider === "server") {
    setProvenance("Fetching high-precision positions (DE441)…");
    fetchServerSky(unix, observer.lat, observer.lon, observer.elev)
      .then((snap) => {
        if (!active || skyState.provider !== "server" || gen !== renderGen) return;
        lastSnap = enrichWithLocal(snap, unix);
        drawDome(lastSnap);
        updateList(lastSnap);
        updateSkyAccuracy();
        setProvenance("Source: JPL Horizons / DE441 for the Sun, Moon, and planets; sidereal time, rise/set, and the star catalogue come from the on-device engine.");
      })
      .catch((error) => {
        if (!active || skyState.provider !== "server" || gen !== renderGen) return;
        // Graceful fall back to the on-device engine when the optional server is down.
        renderLocal();
        setProvenance(`High-precision server unavailable (${error.message}) — showing the on-device engine.`);
      });
    return;
  }
  renderLocal();
  setProvenance("Source: on-device engine — VSOP2013 + ELP-MPP02; ≤ ~4″ vs JPL Horizons near today (Moon ≤ ~1.5″).");
}

// The DE441 server returns high-precision Sun/Moon/planet positions, but no local sidereal time, no
// rise/transit/set, and no star catalogue. Backfill those from the on-device engine (same instant and
// observer) so the dome keeps its constellations, star list, and rise/set — what the provenance promises.
function enrichWithLocal(serverSnap, unix) {
  let local;
  try { local = skySnapshot(unix, observer.lat, observer.lon, observer.elev); }
  catch (_) { return serverSnap; }
  if (local.time) serverSnap.time = { ...(serverSnap.time || {}), lst_deg: local.time.lst_deg, obliquity_deg: local.time.obliquity_deg };
  serverSnap.bodies = serverSnap.bodies || [];
  const localByName = new Map((local.bodies || []).map((b) => [b.name, b]));
  for (const b of serverSnap.bodies) {
    const l = localByName.get(b.name);
    if (l) { b.rise_jd = l.rise_jd; b.transit_jd = l.transit_jd; b.set_jd = l.set_jd; b.transit_alt_deg = l.transit_alt_deg; }
  }
  // Append objects the server omits (the bright-star catalogue) so figures + the list stay complete.
  const have = new Set(serverSnap.bodies.map((b) => b.name));
  for (const l of local.bodies || []) if (!have.has(l.name)) serverSnap.bodies.push(l);
  return serverSnap;
}

function renderLocal() {
  let snap;
  try {
    snap = skySnapshot(currentUnix(), observer.lat, observer.lon, observer.elev);
  } catch (error) {
    // Engine not instantiated yet (e.g. Set/Now pressed during the WASM fetch): say so and
    // finish the render once it lands — the old silent return produced a dead button.
    // Retry ONLY for the not-loaded case; retrying an engine trap would loop forever.
    if (String(error && error.message).includes("not loaded")) {
      setProvenance("Sky engine is still loading — this will render in a moment.");
      loadSkyEngine().then(() => { if (active) renderSky(); }).catch(() => {});
    }
    return;
  }
  lastSnap = snap;
  drawDome(snap);
  updateList(snap);
  updateSkyAccuracy();
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

function project(alt, az, g) {
  const rr = (1 - alt / 90) * g.r, a = az * Math.PI / 180;
  return [g.cx + rr * Math.sin(a), g.cy - rr * Math.cos(a)];
}

// --- Moon phase (Meeus Ch. 48) ---------------------------------------------------------------
// Illuminated fraction k, waxing/waning sense, and a name, computed from the snapshot's geocentric
// Sun & Moon (RA/Dec + distance). k = (1 + cos i)/2 with phase angle i from the Sun–Moon elongation.
function moonPhaseInfo(snap) {
  const bodies = snap.bodies || [];
  const sun = bodies.find((b) => b.name === "Sun");
  const moon = bodies.find((b) => b.name === "Moon");
  if (!sun || !moon || !moon.distance_km || !sun.distance_km) return null;
  const d = Math.PI / 180;
  const cosPsi = Math.sin(sun.dec_deg * d) * Math.sin(moon.dec_deg * d)
    + Math.cos(sun.dec_deg * d) * Math.cos(moon.dec_deg * d) * Math.cos((sun.ra_deg - moon.ra_deg) * d);
  const psi = Math.acos(Math.max(-1, Math.min(1, cosPsi)));                 // geocentric elongation
  const i = Math.atan2(sun.distance_km * Math.sin(psi), moon.distance_km - sun.distance_km * Math.cos(psi));
  const k = (1 + Math.cos(i)) / 2;                                          // illuminated fraction
  const waxing = ((((moon.ra_deg - sun.ra_deg) % 360) + 360) % 360) < 180;  // Moon east of Sun ⇒ waxing
  return { k, waxing, name: moonPhaseName(k, waxing), glyph: moonPhaseGlyph(k, waxing) };
}
function moonPhaseName(k, waxing) {
  if (k < 0.04) return "New Moon";
  if (k > 0.96) return "Full Moon";
  if (Math.abs(k - 0.5) < 0.06) return waxing ? "First Quarter" : "Last Quarter";
  if (k < 0.5) return waxing ? "Waxing Crescent" : "Waning Crescent";
  return waxing ? "Waxing Gibbous" : "Waning Gibbous";
}
function moonPhaseGlyph(k, waxing) {
  if (k < 0.04) return "🌑";
  if (k > 0.96) return "🌕";
  if (Math.abs(k - 0.5) < 0.06) return waxing ? "🌓" : "🌗";
  if (k < 0.5) return waxing ? "🌒" : "🌘";
  return waxing ? "🌔" : "🌖";
}
// Draw the Moon as a lit disc with the dark portion shaded, the bright limb pointing toward `theta`
// (radians — the on-dome direction to the Sun). The terminator is a half-ellipse whose signed
// semi-axis r·(2k−1) gives a crescent (k<0.5) or gibbous (k>0.5) automatically.
function drawMoonDisc(ctx, x, y, r, k, theta) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(theta);
  ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fillStyle = "#3a3c46"; ctx.fill();    // shadowed disc
  const tx = r * (2 * k - 1);
  ctx.beginPath();
  ctx.arc(0, 0, r, -Math.PI / 2, Math.PI / 2, false);                          // sun-facing limb, top→bottom
  ctx.ellipse(0, 0, Math.abs(tx), r, 0, Math.PI / 2, -Math.PI / 2, tx < 0);    // terminator, bottom→top
  ctx.closePath();
  ctx.fillStyle = "#dfe2ea"; ctx.fill();
  ctx.restore();
}

function drawDome(snap) {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("skyCanvas"));
  if (!canvas || !resize(canvas)) return;
  const ctx = canvas.getContext("2d");
  const w = canvas.width, h = canvas.height;
  const cx = w / 2, cy = h / 2, r = Math.min(w, h) * 0.46;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const g = { cx, cy, r, dpr };
  domeGeom = g;
  plotted = [];
  const lst = snap.time ? snap.time.lst_deg : 0;
  const lat = snap.observer ? snap.observer.lat_deg : observer.lat;

  ctx.clearRect(0, 0, w, h);
  // Dome (sky) coloured by the Sun's altitude; constellation figures clipped inside it.
  ctx.save();
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = skyColor(sunAltitude(snap)); ctx.fillRect(0, 0, w, h);
  if (showConstellations) drawConstellations(ctx, g, lst, lat);
  ctx.restore();

  // Altitude rings (30 deg, 60 deg) + horizon.
  ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 1;
  for (const alt of [30, 60]) { ctx.beginPath(); ctx.arc(cx, cy, (1 - alt / 90) * r, 0, Math.PI * 2); ctx.stroke(); }
  ctx.strokeStyle = "rgba(247,183,51,0.8)"; ctx.lineWidth = Math.max(1.5, w * 0.002);
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();

  // Cardinal directions (N up, clockwise - compass orientation).
  ctx.fillStyle = "#f6f3e8"; ctx.font = `${Math.max(13, r * 0.05)}px Segoe UI, sans-serif`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  const pad = r * 0.1;
  ctx.fillText("N", cx, cy - r - pad * 0.6); ctx.fillText("S", cx, cy + r + pad * 0.6);
  ctx.fillText("E", cx + r + pad * 0.6, cy); ctx.fillText("W", cx - r - pad * 0.6, cy);

  // Catalogue stars (full engine reduction) first, so Sun/Moon/planets draw on top.
  for (const b of snap.bodies || []) {
    if (BODY_STYLE[b.name] || !b.above_horizon) continue; // BODY_STYLE = Sun/Moon/planets
    const [x, y] = project(b.alt_deg, b.az_deg, g);
    const mag = b.magnitude == null ? 2 : b.magnitude;
    const size = Math.max(1.2, (2.6 - mag) * r * 0.0055);
    ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = activeName === b.name ? "#fff3c4" : "rgba(222,230,255,0.94)"; ctx.fill();
    plotted.push({ name: b.name, x, y, hit: Math.max(10 * dpr, size + 6 * dpr), body: b });
    if (mag < 1.5) {
      ctx.font = `${Math.max(9, r * 0.024)}px Segoe UI, sans-serif`; ctx.textAlign = "left";
      ctx.fillStyle = "rgba(200,210,235,0.72)"; ctx.fillText(b.name, x + size + 3, y);
    }
  }

  // Trajectory arc for the hovered / pinned object, under the body discs.
  if (showTrajectory && activeName) {
    const a = (snap.bodies || []).find((b) => b.name === activeName);
    if (a) drawTrajectory(ctx, g, a, lst, lat);
  }

  // Sun / Moon / planets — discs above the horizon, rim markers below ("objects outside the view").
  const moonPhase = moonPhaseInfo(snap);
  const sunBody = (snap.bodies || []).find((b) => b.name === "Sun");
  const sunDome = sunBody ? project(sunBody.alt_deg, sunBody.az_deg, g) : null;
  for (const b of snap.bodies || []) {
    const style = BODY_STYLE[b.name]; if (!style) continue;
    if (b.above_horizon) {
      const [x, y] = project(b.alt_deg, b.az_deg, g);
      const size = Math.max(2.5, r * style.size);
      if (activeName === b.name) {
        ctx.beginPath(); ctx.arc(x, y, size + 5 * dpr, 0, Math.PI * 2);
        ctx.strokeStyle = "rgba(247,183,51,0.95)"; ctx.lineWidth = 2 * dpr; ctx.stroke();
      }
      if (b.name === "Moon" && moonPhase && sunDome) {
        drawMoonDisc(ctx, x, y, size, moonPhase.k, Math.atan2(sunDome[1] - y, sunDome[0] - x));
      } else {
      ctx.beginPath(); ctx.arc(x, y, size, 0, Math.PI * 2); ctx.fillStyle = style.color; ctx.fill();
      }
      ctx.fillStyle = "rgba(246,243,232,0.95)"; ctx.font = `${Math.max(11, r * 0.033)}px Segoe UI, sans-serif`; ctx.textAlign = "left";
      ctx.fillText(b.name, x + size + 4, y);
      plotted.push({ name: b.name, x, y, hit: Math.max(12 * dpr, size + 7 * dpr), body: b });
    } else {
      const a = b.az_deg * Math.PI / 180, rr = r * 1.05;
      const x = cx + rr * Math.sin(a), y = cy - rr * Math.cos(a);
      const mk = Math.max(2, r * style.size * 0.7);
      ctx.globalAlpha = activeName === b.name ? 0.95 : 0.55;
      ctx.strokeStyle = style.color; ctx.lineWidth = 1.2 * dpr;
      ctx.beginPath(); ctx.moveTo(cx + r * 0.99 * Math.sin(a), cy - r * 0.99 * Math.cos(a)); ctx.lineTo(x, y); ctx.stroke();
      ctx.beginPath(); ctx.arc(x, y, mk, 0, Math.PI * 2); ctx.fillStyle = style.color; ctx.fill();
      ctx.globalAlpha = 1;
      plotted.push({ name: b.name, x, y, hit: Math.max(11 * dpr, mk + 6 * dpr), body: b });
    }
  }
}

function drawConstellations(ctx, g, lst, lat) {
  ctx.strokeStyle = "rgba(208,224,255,0.5)"; // bright enough to read over the daytime sky too
  ctx.lineWidth = Math.max(1, g.r * 0.0019);
  for (const c of CONSTELLATIONS) {
    for (const [n1, n2] of c.lines) {
      const s1 = STAR_RADEC[n1], s2 = STAR_RADEC[n2]; if (!s1 || !s2) continue;
      const p1 = altAz(s1.ra, s1.dec, lst, lat), p2 = altAz(s2.ra, s2.dec, lst, lat);
      if (p1.alt < -2 && p2.alt < -2) continue;
      const [x1, y1] = project(Math.max(p1.alt, -2), p1.az, g);
      const [x2, y2] = project(Math.max(p2.alt, -2), p2.az, g);
      ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
  }
  ctx.fillStyle = "rgba(228,236,255,0.8)";
  const seen = new Set();
  for (const c of CONSTELLATIONS) for (const pair of c.lines) for (const n of pair) {
    if (seen.has(n)) continue; seen.add(n);
    const s = STAR_RADEC[n]; if (!s) continue;
    const p = altAz(s.ra, s.dec, lst, lat); if (p.alt < 0) continue;
    const [x, y] = project(p.alt, p.az, g);
    ctx.beginPath(); ctx.arc(x, y, Math.max(0.9, g.r * 0.003), 0, Math.PI * 2); ctx.fill();
  }
}

// Diurnal path across the sky over the day, swept from the body's current RA/Dec. The hour angle runs
// ±12 sidereal hours around "now"; the past half is dimmed/dashed and the future half is solid, with
// rise/set crossings marked. RA/Dec are held fixed — exact for the Sun and planets over a day, a close
// approximation for the fast Moon.
let trajCache = { key: null, pts: null };

// Trajectory sample points {alt, az}, centred on "now". Fixed stars use the exact diurnal sweep from
// their RA/Dec; the Sun/Moon/planets re-solve the ephemeris along the day via the engine (cached) — so
// the Moon's fast motion is followed precisely, not approximated by a fixed RA/Dec.
function trajectoryPoints(b, lstNow, lat) {
  if (!BODY_STYLE[b.name]) {
    if (b.ra_deg == null) return null;
    const N = 240, pts = [];
    for (let k = 0; k <= N; k++) pts.push(altAz(b.ra_deg, b.dec_deg, lstNow - 180 + 360 * (k / N), lat));
    return pts;
  }
  const now = currentUnix();
  const key = `${b.name}|${Math.round(now / 300)}|${observer.lat.toFixed(3)},${observer.lon.toFixed(3)}`;
  if (trajCache.key === key && trajCache.body === b.name) return trajCache.pts;
  const N = 180, dt = (24 * 3600) / N;
  let track;
  try { track = bodyTrack(BODY_INDEX[b.name], observer.lat, observer.lon, observer.elev, now - 12 * 3600, dt, N + 1); }
  catch (_) { return null; }
  const pts = track.map((s) => ({ alt: s.alt, az: s.az }));
  trajCache = { key, body: b.name, pts };
  return pts;
}

function drawTrajectory(ctx, g, b, lstNow, lat) {
  const pts = trajectoryPoints(b, lstNow, lat);
  if (!pts || pts.length < 3) return;
  const N = pts.length - 1, mid = Math.floor(N / 2);
  const style = BODY_STYLE[b.name] || { color: "#cfe0ff" };
  const drawSeg = (from, to, past) => {
    let started = false;
    ctx.beginPath();
    for (let i = from; i <= to; i++) {
      const q = pts[i]; if (q.alt < 0) { started = false; continue; }
      const [x, y] = project(q.alt, q.az, g);
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = style.color; ctx.globalAlpha = past ? 0.32 : 0.82;
    ctx.lineWidth = Math.max(1.3, g.r * 0.004); ctx.setLineDash(past ? [4 * g.dpr, 4 * g.dpr] : []);
    ctx.stroke(); ctx.setLineDash([]); ctx.globalAlpha = 1;
  };
  drawSeg(0, mid, true);
  drawSeg(mid, N, false);
  for (let i = 1; i <= N; i++) {
    if ((pts[i - 1].alt < 0) !== (pts[i].alt < 0)) {
      const [x, y] = project(0, pts[i].az, g);
      ctx.beginPath(); ctx.arc(x, y, 4 * g.dpr, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(247,183,51,0.9)"; ctx.lineWidth = 1.4 * g.dpr; ctx.stroke();
    }
  }
}

function jdToLocal(jd) {
  if (jd == null || !Number.isFinite(jd)) return "--";
  const unix = (jd - 2440587.5) * 86400;
  return new Date(unix * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

function rowFor(b, titleText, detailText) {
  const row = document.createElement("div");
  row.className = "sky-row sky-hoverable";
  row.dataset.name = b.name;
  row.tabIndex = 0;
  row.setAttribute("role", "button");
  const title = document.createElement("strong"); title.textContent = titleText;
  const detail = document.createElement("span"); detail.className = "muted"; detail.textContent = detailText;
  row.append(title, detail);
  // Focus and hover both preview the body on the dome — keyboard parity with mouse.
  const previewOn = () => { if (pinned) return; activeName = b.name; redraw(); };
  const previewOff = () => { if (pinned) return; if (activeName === b.name) { activeName = null; redraw(); } };
  row.addEventListener("mouseenter", previewOn);
  row.addEventListener("mouseleave", previewOff);
  row.addEventListener("focus", previewOn);
  row.addEventListener("blur", previewOff);
  // Enter/Space AND click/tap toggle a pin — parity with clicking the body on the dome.
  // (The row advertised role="button" + cursor:pointer but had no click handler, so mouse
  // and iOS users got less than keyboard users.)
  const togglePin = () => {
    const pinThis = !(pinned && activeName === b.name);
    pinned = pinThis;
    activeName = pinThis ? b.name : null;
    const listEl = row.parentElement;
    if (listEl) listEl.querySelectorAll('.sky-row[role="button"]').forEach((r) => r.setAttribute("aria-pressed", "false"));
    row.setAttribute("aria-pressed", String(pinThis));
    redraw();
  };
  row.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    togglePin();
  });
  row.addEventListener("click", togglePin);
  row.setAttribute("aria-pressed", String(pinned && activeName === b.name));
  return row;
}

function updateList(snap) {
  const list = document.getElementById("skyList");
  if (!list) return;
  list.textContent = "";
  const bodies = snap.bodies || [];
  const up = bodies.filter((b) => b.above_horizon).sort((a, b) => b.alt_deg - a.alt_deg);
  if (!up.length) {
    const row = document.createElement("div");
    row.className = "sky-row";
    row.textContent = "Nothing is above your horizon right now.";
    list.appendChild(row);
  }
  const phase = moonPhaseInfo(snap);
  for (const b of up) {
    const magText = (!BODY_STYLE[b.name] && b.magnitude != null) ? `mag ${b.magnitude.toFixed(1)}, ` : "";
    const isMoon = b.name === "Moon" && phase;
    const title = isMoon
      ? `Moon ${phase.glyph} ${phase.name} - ${Math.round(b.alt_deg)}° up in the ${b.compass}`
      : `${b.name} - ${Math.round(b.alt_deg)}° up in the ${b.compass}`;
    const litText = isMoon ? `${Math.round(phase.k * 100)}% lit, ` : "";
    list.appendChild(rowFor(b, title,
      `${litText}${magText}azimuth ${Math.round(b.az_deg)}°, rises ${jdToLocal(b.rise_jd)}, sets ${jdToLocal(b.set_jd)}`));
  }

  // Below the horizon: the Sun / Moon / planets you can't see yet, and when they rise ("outside the view").
  const below = bodies.filter((b) => BODY_STYLE[b.name] && !b.above_horizon)
    .sort((a, b) => (Number.isFinite(a.rise_jd) ? a.rise_jd : 1e9) - (Number.isFinite(b.rise_jd) ? b.rise_jd : 1e9));
  if (below.length) {
    const head = document.createElement("div");
    head.className = "sky-row sky-subhead";
    head.textContent = "Below the horizon";
    list.appendChild(head);
    for (const b of below) {
      list.appendChild(rowFor(b, `${b.name} - below the ${b.compass} horizon`,
        Number.isFinite(b.rise_jd) ? `rises ${jdToLocal(b.rise_jd)}` : "does not rise today"));
    }
  }
}

function redraw() { if (lastSnap) drawDome(lastSnap); }

// --- Observer controls ---
document.getElementById("skyGeo")?.addEventListener("click", () => {
  const label = document.getElementById("skyLocLabel");
  if (!navigator.geolocation) {
    if (label) label.textContent = "This browser has no geolocation — enter coordinates manually.";
    return;
  }
  if (label) label.textContent = "Locating…"; // pending feedback while the permission prompt is open
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      observer.lat = pos.coords.latitude;
      observer.lon = pos.coords.longitude;
      observer.elev = pos.coords.altitude || 0;
      observer.label = "Your location";
      clearDeepLinkHash();
      saveSkyPrefs();
      setLocLabel();
      renderSky();
    },
    () => {
      if (label) label.textContent = "Location permission denied - enter coordinates manually.";
    }
  );
});

document.getElementById("skySet")?.addEventListener("click", () => {
  const lat = Number(/** @type {HTMLInputElement} */ (document.getElementById("skyLat")).value);
  const lon = Number(/** @type {HTMLInputElement} */ (document.getElementById("skyLon")).value);
  const label = document.getElementById("skyLocLabel");
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    if (label) label.textContent = "Enter a numeric latitude and longitude — e.g. 40.71, -74.01.";
    return;
  }
  const clampedLat = Math.max(-90, Math.min(90, lat));
  // Longitude is an ANGLE: wrap it into [-180, 180] instead of clamping. Clamping sent a
  // pasted 0–360-style value like 270 (= 90°W) to +180 — the wrong meridian entirely.
  // Only touch out-of-range values: the modulo arithmetic carries float error, so wrapping
  // an in-range −0.13 returned −0.12999999999999545 and spuriously showed the wrap notice.
  const wrappedLon = lon >= -180 && lon <= 180 ? lon : ((lon % 360) + 540) % 360 - 180;
  observer.lat = clampedLat;
  observer.lon = wrappedLon;
  observer.label = "Set location";
  clearDeepLinkHash();
  saveSkyPrefs();
  setLocLabel();
  if (clampedLat !== lat && label) {
    label.textContent = `Latitude out of range — clamped to ${clampedLat}° (valid: -90° to 90°).`;
  } else if (wrappedLon !== lon && label) {
    label.textContent = `Longitude wrapped to ${wrappedLon.toFixed(2)}° (east-positive; e.g. 270 means 90°W).`;
  }
  renderSky();
});

// Enter in either coordinate field commits it — same as pressing Set.
for (const id of ["skyLat", "skyLon"]) {
  document.getElementById(id)?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      document.getElementById("skySet")?.click();
    }
  });
}

// --- Data-source toggle (on-device engine vs optional DE441 server tier) ---
function setProvider(p) {
  skyState.provider = p;
  const localBtn = document.getElementById("skyProviderLocal");
  const serverBtn = document.getElementById("skyProviderServer");
  localBtn?.classList.toggle("active", p === "local");
  serverBtn?.classList.toggle("active", p === "server");
  // Class-only state was invisible to assistive tech.
  localBtn?.setAttribute("aria-pressed", String(p === "local"));
  serverBtn?.setAttribute("aria-pressed", String(p === "server"));
  saveSkyPrefs();
  if (active) renderSky();
}
document.getElementById("skyProviderLocal")?.addEventListener("click", () => setProvider("local"));
document.getElementById("skyProviderServer")?.addEventListener("click", () => setProvider("server"));
// Reflect the restored provider in the buttons at boot (without triggering a render).
document.getElementById("skyProviderLocal")?.classList.toggle("active", skyState.provider === "local");
document.getElementById("skyProviderServer")?.classList.toggle("active", skyState.provider === "server");
document.getElementById("skyProviderLocal")?.setAttribute("aria-pressed", String(skyState.provider === "local"));
document.getElementById("skyProviderServer")?.setAttribute("aria-pressed", String(skyState.provider === "server"));

// --- Time controls (plan for any date/time, not just "now") ---
document.getElementById("skyTime")?.addEventListener("change", (event) => {
  const v = /** @type {HTMLInputElement} */ (event.target).value;
  const t = v ? new Date(v).getTime() : NaN;
  const label = document.getElementById("skyTimeLabel");
  if (!Number.isFinite(t)) {
    if (label) label.textContent = "Enter a valid date and time, or press Now for live.";
    return;
  }
  skyState.chosenUnix = t / 1000;
  clearDeepLinkHash();
  setTimeLabel();
  if (active) renderSky();
});
document.getElementById("skyNow")?.addEventListener("click", () => {
  skyState.chosenUnix = null;
  // Going live supersedes a shared instant; leaving the #sky= hash in place used to
  // re-freeze the view on the next surface switch.
  clearDeepLinkHash();
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

// --- Overlay toggles ---
document.getElementById("skyConst")?.addEventListener("change", (e) => { showConstellations = /** @type {HTMLInputElement} */ (e.target).checked; redraw(); });
document.getElementById("skyTraj")?.addEventListener("change", (e) => { showTrajectory = /** @type {HTMLInputElement} */ (e.target).checked; redraw(); });

// --- Hover tooltip + click-to-pin on the dome (SkyView-style inspection) ---
function ensureTooltip() {
  let t = document.getElementById("skyTooltip");
  if (!t) { t = document.createElement("div"); t.id = "skyTooltip"; t.className = "sky-tooltip"; t.style.display = "none"; document.body.appendChild(t); }
  return t;
}
// Build the tooltip via DOM nodes + textContent (never innerHTML): with the
// "NASA JPL (live)" provider, b.name/b.compass come from a fetched JSON response,
// so string-interpolating them into innerHTML would be an injection vector.
function fillTooltip(t, b) {
  t.textContent = "";
  const line = (text, cls) => {
    const d = document.createElement("div");
    if (cls) d.className = cls;
    d.textContent = text;
    t.appendChild(d);
  };
  const nameRow = document.createElement("div");
  const strong = document.createElement("strong");
  strong.textContent = b.name;
  nameRow.appendChild(strong);
  t.appendChild(nameRow);

  line(b.above_horizon
    ? `${Math.round(b.alt_deg)}° above the ${b.compass} horizon · az ${Math.round(b.az_deg)}°`
    : `below the ${b.compass} horizon`, "tt-line");
  if (b.name === "Moon" && lastSnap) {
    const ph = moonPhaseInfo(lastSnap);
    if (ph) line(`${ph.glyph} ${ph.name} · ${Math.round(ph.k * 100)}% lit`, "tt-line");
  }
  if (b.magnitude != null) line(`magnitude ${b.magnitude.toFixed(1)}`, "tt-line");
  if (b.distance_km != null && b.distance_km > 0) {
    const lm = b.distance_km / 299792.458 / 60; // light-minutes
    line(lm >= 1 ? `${(b.distance_km / 1.495978707e8).toFixed(3)} AU · light ${lm.toFixed(1)} min`
      : `${Math.round(b.distance_km).toLocaleString()} km away`, "tt-line");
  }
  line(`rises ${jdToLocal(b.rise_jd)} · transits ${jdToLocal(b.transit_jd)} (${Math.round(b.transit_alt_deg)}°) · sets ${jdToLocal(b.set_jd)}`, "tt-line");
  line("trajectory: dashed = past, solid = ahead", "tt-line muted");
}
function showTooltip(b, clientX, clientY) {
  const t = ensureTooltip();
  fillTooltip(t, b);
  t.style.display = "block";
  const pad = 14, rect = t.getBoundingClientRect();
  let x = clientX + pad, y = clientY + pad;
  if (x + rect.width > window.innerWidth - 8) x = clientX - rect.width - pad;
  if (y + rect.height > window.innerHeight - 8) y = clientY - rect.height - pad;
  t.style.left = Math.max(8, x) + "px"; t.style.top = Math.max(8, y) + "px";
}
function hideTooltip() { const t = document.getElementById("skyTooltip"); if (t) t.style.display = "none"; }
function hitTest(ev) {
  const canvas = document.getElementById("skyCanvas"); if (!canvas || !domeGeom) return null;
  const rect = canvas.getBoundingClientRect();
  const x = (ev.clientX - rect.left) * (canvas.width / rect.width);
  const y = (ev.clientY - rect.top) * (canvas.height / rect.height);
  let best = null;
  for (const p of plotted) { const d = Math.hypot(p.x - x, p.y - y); if (d < p.hit && (!best || d < best.d)) best = { d, p }; }
  return best ? best.p : null;
}
const skyCanvasEl = document.getElementById("skyCanvas");
if (skyCanvasEl) {
  skyCanvasEl.addEventListener("mousemove", (ev) => {
    if (pinned) return;
    const hit = hitTest(ev);
    if (hit) { showTooltip(hit.body, ev.clientX, ev.clientY); skyCanvasEl.style.cursor = "pointer"; }
    else { hideTooltip(); skyCanvasEl.style.cursor = "default"; }
    const name = hit ? hit.name : null;
    if (name !== activeName) { activeName = name; redraw(); }
  });
  skyCanvasEl.addEventListener("mouseleave", () => {
    if (pinned) return;
    if (activeName) { activeName = null; redraw(); }
    hideTooltip(); skyCanvasEl.style.cursor = "default";
  });
  skyCanvasEl.addEventListener("click", (ev) => {
    const hit = hitTest(ev);
    if (hit) { activeName = hit.name; pinned = true; showTooltip(hit.body, ev.clientX, ev.clientY); redraw(); }
    else if (pinned || activeName) { pinned = false; activeName = null; hideTooltip(); redraw(); }
  });
}

// Minimal debug hook (used by verification + handy in the console): current snapshot, plotted hit-
// boxes, dome geometry, and the alt/az helper.
if (typeof window !== "undefined") {
  window.__skyDebug = () => ({ snap: lastSnap, plotted, geom: domeGeom, altAz, bodyTrack, skySnapshot, BODY_INDEX, observer, currentUnix });
}
