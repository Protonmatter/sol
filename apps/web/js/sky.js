// "My Sky": a local horizon dome built from the solar-ephemeris WASM engine.
// Plots each body at its topocentric altitude/azimuth for the observer, "now".

import { store } from "./store.js?v=dcca6290db";
import { fetchServerSky, BODY_INDEX, SERVER_BASE } from "./skyEngine.js?v=dcca6290db";
import { createSkyWorkerClient } from "./skyWorkerClient.js?v=dcca6290db";
import { validateSkyWork } from "./skyLimits.js?v=dcca6290db";
import { SkyConsent, makeSkyPreview, parseSkyLink } from "./skyPrivacy.js?v=dcca6290db";
import { skyRows, parseSkyTime, formatSkyTimeInput } from "./skyPresentation.js?v=dcca6290db";
import { syncObjectRows } from "./objectBrowser.js?v=dcca6290db";
import { CONSTELLATIONS } from "./celestial.js?v=dcca6290db";
import { epochAccuracy, epochLabel } from "./accuracy.js?v=dcca6290db";
import { resolveSkyPresentation } from "./presentationState.js?v=dcca6290db";
import { assertEphemerisSnapshotV3, mergeLocalEvents } from "./ephemerisContract.js?v=dcca6290db";

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
  presentation: /** @type {any} */ (null),
  observer: { lat: 40.71, lon: -74.01, elev: 0, label: "New York example location" },
  provider: "local", // "local" = on-device WASM (default), "server" = DE441 high-precision tier
  displayMode: "device",
  chosenUnix: null,  // null = live "now"; otherwise a frozen instant (seconds)
});
const observer = skyState.observer;
let timer = 0;
let active = false;
let lastSnap = null;    // most recent snapshot, for Export
let deepLinkApplied = false; // the #sky= hash is applied ONCE, not on every surface switch
let workerClient = null;
let remoteController = null;
let computingSnapshot = false;
const consent = new SkyConsent();
let selectedName = "Moon";
let query = "", group = "all";
let pendingPreview = null;
let consentPanelRecipient = "";
let displayedObserverLabel = observer.label;
const skyInput = id => /** @type {HTMLInputElement|null} */ (document.getElementById(id));
function inputError(message) { const node=document.getElementById("skyInputError");if(node)node.textContent=message; }
function getWorker() { return workerClient||(workerClient=createSkyWorkerClient()); }
function recipient() {
  const configured=typeof window==="undefined"?SERVER_BASE:/** @type {any} */(window).SOL_EPHEMERIS_SERVER;
  return consent.setRecipient(typeof configured==="string"?configured:"");
}
let renderGen = 0;      // stale-response guard for the async server tier
let geolocationGen = 0; // observer intent survives unrelated snapshot/time refreshes

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
    const provider = localStorage.getItem("sol-sky-provider");
    // Remember the preferred provider, never the session's permission to contact it.
    if (provider === "local" || provider === "server") skyState.provider = provider;
  } catch (_) { /* storage unavailable */ }
  try {
    const raw = localStorage.getItem("sol-sky-observer");
    if (raw) {
      const saved = JSON.parse(raw);
      validateSkyWork({operation:"snapshot",lat:saved.lat,lon:saved.lon,elev:saved.elev,unix:0});
      Object.assign(observer,{lat:saved.lat,lon:saved.lon,elev:saved.elev,label:"Saved location (on this device)"});
    }
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
  node.textContent = `${stateText} UI dates use the proleptic Gregorian calendar. Historical times approximate UT1. Events belong to the observer mean-solar day and display in ${skyState.displayMode==="utc"?"UTC":browserTimeZoneLabel()+" (device civil timezone, not observer timezone)"}. Device daylight-saving repeats use the earlier occurrence; choose UTC for an unambiguous instant.`;
}

function toLocalInput(unix) { return formatSkyTimeInput(unix,skyState.displayMode); }

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
  try {
    const request=parseSkyLink(location.hash,currentUnix());
    if(!request)return;
    Object.assign(observer,{lat:request.lat,lon:request.lon,elev:request.elev,label:"Shared location"});
    if(location.hash.split(",").length>=3)skyState.chosenUnix=request.unix;
  } catch(error) { inputError(error.message); }
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
  renderSky();
  // Auto-tick only while live; a frozen time stays put.
  if (!timer) timer = window.setInterval(() => { if (active && skyState.chosenUnix == null) { renderSky(); syncTimeInput(); } }, 60000);
}

export function leaveSky() {
  active = false;
  ++geolocationGen;
  ++renderGen; computingSnapshot=false;
  remoteController?.abort();workerClient?.dispose();workerClient=null;
  trajCache={key:null,pts:null};hideTooltip();
  if (timer) { window.clearInterval(timer); timer = 0; }
}

// Re-fit the dome to its CSS box. Without this, a resize or panel collapse while the time
// was frozen left the backing store at the old size — the dome rendered as an ellipse
// until the next redraw trigger (which, frozen, never came).
export function resizeSky() {
  if (active) redraw();
}

export async function renderSky() {
  if (!active) return;
  const gen=++renderGen;
  const requestedProvider=skyState.provider;
  const requestedObserverLabel=observer.label;
  const request={operation:"snapshot",unix:currentUnix(),lat:observer.lat,lon:observer.lon,elev:observer.elev};
  remoteController?.abort();getWorker().cancel();
  computingSnapshot=true;trajCache={key:null,pts:null};
  try {
    validateSkyWork(request);
    let snap;
    if (requestedProvider==="server") {
      const base=recipient();
      if (!consent.allows(base)) { showConsent();throw new Error("Recipient consent required; no request sent"); }
      remoteController=new AbortController();
      setProvenance("Requesting positions from the authorized recipient…");
      snap=await fetchServerSky(request.unix,request.lat,request.lon,request.elev,base,{consent,signal:remoteController.signal});
      if (!active||gen!==renderGen)return;
      try {
        const local=await getWorker().request(request);
        if (!active||gen!==renderGen)return;
        snap=mergeLocalEvents(snap,local);
      } catch(error) {
        if (!active||gen!==renderGen)return;
        // Valid remote positions remain usable; missing local events stay explicitly uncomputed.
        snap=structuredClone(snap);snap.warnings.push("On-device event/star augmentation unavailable: "+error.message);
      }
    } else {
      setProvenance("Computing Sky on this device…");
      snap=await getWorker().request(request);
    }
    if (!active||gen!==renderGen||requestedProvider!==skyState.provider)return;
    lastSnap=assertEphemerisSnapshotV3(snap);
    displayedObserverLabel=requestedObserverLabel;
    computingSnapshot=false;
    publishSkyPresentation(lastSnap,requestedProvider);
    drawDome(lastSnap);updateList(lastSnap);updateSkyAccuracy();
    inputError("");
    setProvenance(requestedProvider==="server"?"Source: configured Sol server / JPL Horizons; any on-device event/star augmentation retains separate source metadata.":"Source: computed on device, VSOP2013 + ELP-MPP02; source parity is not independent accuracy qualification.");
  } catch(error) {
    if (!active||gen!==renderGen)return;
    publishSkyPresentation(lastSnap,skyState.presentation?.actualProvider||"local",error.message);
    inputError(error.message);
    setProvenance("Requested Sky unavailable. Retaining only the last validated snapshot; its displayed time and observer remain authoritative. Choose On your device to recover locally.");
  } finally { if(gen===renderGen)computingSnapshot=false; }
}

function publishSkyPresentation(snapshot, actualProvider, error = null) {
  skyState.presentation = resolveSkyPresentation({ snapshot, observerLabel: displayedObserverLabel, actualProvider, requestedProvider: skyState.provider, error });
  if (typeof window !== "undefined") window.dispatchEvent(new Event("sol:presentation"));
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
export function moonPhaseInfo(snap) {
  const bodies = snap.bodies || [];
  const sun = bodies.find((b) => b.name === "Sun");
  const moon = bodies.find((b) => b.name === "Moon");
  if (!sun || !moon || !moon.geocentric_range_km || !sun.geocentric_range_km) return null;
  const d = Math.PI / 180;
  const cosPsi = Math.sin(sun.geocentric_apparent_dec_deg * d) * Math.sin(moon.geocentric_apparent_dec_deg * d)
    + Math.cos(sun.geocentric_apparent_dec_deg * d) * Math.cos(moon.geocentric_apparent_dec_deg * d) * Math.cos((sun.geocentric_apparent_ra_deg - moon.geocentric_apparent_ra_deg) * d);
  const psi = Math.acos(Math.max(-1, Math.min(1, cosPsi)));                 // geocentric elongation
  const i = Math.atan2(sun.geocentric_range_km * Math.sin(psi), moon.geocentric_range_km - sun.geocentric_range_km * Math.cos(psi));
  const k = (1 + Math.cos(i)) / 2;                                          // illuminated fraction
  const waxing = ((((moon.geocentric_apparent_ra_deg - sun.geocentric_apparent_ra_deg) % 360) + 360) % 360) < 180;  // Moon east of Sun ⇒ waxing
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
    if (BODY_STYLE[b.name] || !(b.alt_deg > 0)) continue; // BODY_STYLE = Sun/Moon/planets
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
    if (b.alt_deg > 0) {
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

// All 88 IAU figures as RA/Dec polylines (constellations.js). Each vertex is projected
// independently, so nothing here needs to know about the 0h RA seam; a segment is skipped
// only when BOTH ends are well below the horizon.
function drawConstellations(ctx, g, lst, lat) {
  ctx.strokeStyle = "rgba(208,224,255,0.5)"; // bright enough to read over the daytime sky too
  ctx.lineWidth = Math.max(1, g.r * 0.0019);
  const vertices = [];
  for (const c of CONSTELLATIONS) {
    for (const poly of c.lines) {
      for (let i = 0; i + 3 < poly.length; i += 2) {
        const p1 = altAz(poly[i], poly[i + 1], lst, lat);
        const p2 = altAz(poly[i + 2], poly[i + 3], lst, lat);
        if (p1.alt < -2 && p2.alt < -2) continue;
        const [x1, y1] = project(Math.max(p1.alt, -2), p1.az, g);
        const [x2, y2] = project(Math.max(p2.alt, -2), p2.az, g);
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
        if (p1.alt >= 0) vertices.push([x1, y1]);
        if (p2.alt >= 0) vertices.push([x2, y2]);
      }
    }
  }
  // The figure vertices are real stars; a dot on each keeps the shapes readable.
  ctx.fillStyle = "rgba(228,236,255,0.8)";
  const r = Math.max(0.9, g.r * 0.003);
  for (const [x, y] of vertices) {
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
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
  if (!lastSnap||computingSnapshot||!active) return null;
  const now=(lastSnap.time.jd_utc-2440587.5)*86400;
  const o=lastSnap.observer;
  const key=JSON.stringify([b.name,lastSnap.time.jd_utc,o.terrestrial_lat_deg,o.terrestrial_lon_deg_east,o.elev_m]);
  if (trajCache.key===key) return trajCache.pts;
  const generation=renderGen;
  trajCache={key,pts:null};
  getWorker().request({operation:"track",bodyIndex:BODY_INDEX[b.name],lat:o.terrestrial_lat_deg,lon:o.terrestrial_lon_deg_east,elev:o.elev_m,unix:now-43200,dtSeconds:480,samples:181})
    .then(pts=>{if(active&&generation===renderGen&&trajCache.key===key){trajCache={key,pts};redraw();}})
    .catch(error=>{if(active&&generation===renderGen&&trajCache.key===key)inputError("Trajectory unavailable: "+error.message);});
  return null;
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

export function eventLabel(event) {
  if (Number.isFinite(event.jd)) return jdToLocal(event.jd);
  if (event.calculation_status === "calculated" && event.occurrence_status === "none_in_window") return "none in local mean-solar day";
  if (event.calculation_status === "not_calculated") return "not calculated";
  return "-- (unavailable; occurrence unknown)";
}

function jdToLocal(jd) {
  if (jd == null || !Number.isFinite(jd)) return "--";
  const unix = (jd - 2440587.5) * 86400;
  return new Date(unix * 1000).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
    ...(skyState.displayMode==="utc"?{timeZone:"UTC"}:{}),
  });
}

function updateSelectedFacts(snap) {
  const node=document.getElementById("skySelectedFacts");if(!node)return;
  const body=snap.bodies.find(b=>b.name===selectedName);
  if(!body){node.textContent="Selected object is not present in this validated snapshot.";return;}
  fillTooltip(node,body);
  const details=document.createElement("p");
  details.textContent=`Geometric altitude ${body.alt_deg.toFixed(4)}°; refracted altitude ${body.alt_refracted_deg.toFixed(4)}°. Apparent topocentric RA ${body.topocentric_apparent_ra_deg.toFixed(4)}°, declination ${body.topocentric_apparent_dec_deg.toFixed(4)}° (true equator/equinox of date). Observer range ${body.observer_range_km===null?"unavailable (infinite catalogue-star approximation)":body.observer_range_km+" km"}; geocentric range ${body.geocentric_range_km===null?"unavailable":body.geocentric_range_km+" km"}. Snapshot JD ${snap.time.jd_utc}, observer ${snap.observer.terrestrial_lat_deg}°, ${snap.observer.terrestrial_lon_deg_east}° E, ${snap.observer.elev_m} m. Events source: ${body.events.transit.source.engine} ${body.events.transit.source.version}. Above-horizon does not imply visibility: daylight, weather, extinction, terrain and glare are not modelled.`;
  node.appendChild(details);
}
function selectObject(name) {
  selectedName=name;activeName=name;pinned=true;
  if(lastSnap){updateList(lastSnap);redraw();}
}
function updateList(snap) {
  const list=document.getElementById("skyList");if(!list)return;
  const rows=skyRows(snap.bodies,query,group,selectedName);
  syncObjectRows(list,rows,selectObject);
  const count=document.getElementById("skyResultCount");
  if(count)count.textContent=`${rows.filter(r=>!r.hidden).length} matching objects; ${snap.bodies.filter(b=>b.alt_deg>0).length} geometrically above, ${snap.bodies.filter(b=>b.alt_deg<=0).length} at/below horizon. Selection is retained when filtered out.`;
  updateSelectedFacts(snap);
}
for(const id of ["skySearch","skyFilter"])document.getElementById(id)?.addEventListener(id==="skySearch"?"input":"change",()=>{
  query=skyInput("skySearch")?.value||"";group=skyInput("skyFilter")?.value||"all";
  if(lastSnap)updateList(lastSnap);
});

function redraw() { if (lastSnap) drawDome(lastSnap); }

// --- Observer controls ---
document.getElementById("skyGeo")?.addEventListener("click", () => {
  const generation=++geolocationGen;
  const label = document.getElementById("skyLocLabel");
  if (!navigator.geolocation) {
    if (label) label.textContent = "This browser has no geolocation — enter coordinates manually.";
    return;
  }
  if (label) label.textContent = "Locating…"; // pending feedback while the permission prompt is open
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (!active || generation!==geolocationGen) return;
      try { validateSkyWork({operation:"snapshot",lat:pos.coords.latitude,lon:pos.coords.longitude,elev:pos.coords.altitude||0,unix:currentUnix()}); }
      catch(error){inputError(error.message);return;}
      Object.assign(observer,{lat:pos.coords.latitude,lon:pos.coords.longitude,elev:pos.coords.altitude||0,label:"Your device location"});
      clearDeepLinkHash();
      saveSkyPrefs();
      setLocLabel();
      renderSky();
    },
    () => {
      if (!active || generation!==geolocationGen) return;
      if (label) label.textContent = "Location permission denied - enter coordinates manually.";
    }
  );
});

document.getElementById("skySet")?.addEventListener("click", () => {
  try {
    const values=["skyLat","skyLon","skyElev"].map(id=>skyInput(id)?.value.trim());
    if(values.some(v=>!v))throw new Error("Enter latitude, longitude and elevation; empty values are not zero.");
    const [lat,lon,elev]=values.map(Number);
    validateSkyWork({operation:"snapshot",lat,lon,elev,unix:currentUnix()});
    ++geolocationGen;
    Object.assign(observer,{lat,lon,elev,label:"Set location"});
    inputError("");clearDeepLinkHash();saveSkyPrefs();setLocLabel();renderSky();
  } catch(error) {inputError(error.message);}
});

// Enter in either coordinate field commits it — same as pressing Set.
for (const id of ["skyLat", "skyLon", "skyElev"]) {
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
function showConsent() {
  consentPanelRecipient=recipient();
  const panel=document.getElementById("skyConsent"),text=document.getElementById("skyConsentText");
  if(panel)panel.hidden=false;
  if(text)text.textContent=`Send the selected precise latitude, longitude, elevation and observation time to ${consentPanelRecipient||"no configured recipient"}? That Sol server sends the location and time onward to JPL Horizons. On-device mode sends none of these values. Consent lasts this page session only.`;
}
document.getElementById("skyProviderServer")?.addEventListener("click", () => {try{showConsent();}catch(error){inputError(error.message);}});
document.getElementById("skyConsentAllow")?.addEventListener("click",()=>{
  try {if(recipient()!==consentPanelRecipient){showConsent();throw new Error("Recipient changed; review the new destination before allowing it.");}consent.grant();const p=document.getElementById("skyConsent");if(p)p.hidden=true;setProvider("server");}catch(error){inputError(error.message);}
});
document.getElementById("skyConsentDeny")?.addEventListener("click",()=>{consent.revoke();remoteController?.abort();const p=document.getElementById("skyConsent");if(p)p.hidden=true;setProvider("local");});
document.getElementById("skyConsentRevoke")?.addEventListener("click",()=>{consent.revoke();remoteController?.abort();setProvider("local");inputError("Remote consent revoked. Computation stays on this device.");});
// Reflect the restored provider in the buttons at boot (without triggering a render).
document.getElementById("skyProviderLocal")?.classList.toggle("active", skyState.provider === "local");
document.getElementById("skyProviderServer")?.classList.toggle("active", skyState.provider === "server");
document.getElementById("skyProviderLocal")?.setAttribute("aria-pressed", String(skyState.provider === "local"));
document.getElementById("skyProviderServer")?.setAttribute("aria-pressed", String(skyState.provider === "server"));

// --- Time controls (plan for any date/time, not just "now") ---
document.getElementById("skyTimeMode")?.addEventListener("change",()=>{
  skyState.displayMode=skyInput("skyTimeMode")?.value==="utc"?"utc":"device";
  syncTimeInput();setTimeLabel();if(lastSnap)updateList(lastSnap);
});
document.getElementById("skyTime")?.addEventListener("change", (event) => {
  const v = /** @type {HTMLInputElement} */ (event.target).value;
  try {skyState.chosenUnix=parseSkyTime(v,skyState.displayMode);inputError("");}
  catch(error){inputError(error.message);return;}
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
function previewSky(kind) {
  if(!lastSnap){inputError("Compute a validated snapshot before sharing or exporting.");return;}
  document.getElementById("skyShareManualCopy")?.remove();
  const o=lastSnap.observer;
  // Staged release URLs expire; the deployment root forwards the captured Sky hash.
  const releaseBasePath="__SOL_BASE_PATH__";
  const shareBase=releaseBasePath.startsWith("__")?location.href:new URL(releaseBasePath,location.href).href;
  const preview=makeSkyPreview({lat:o.terrestrial_lat_deg,lon:o.terrestrial_lon_deg_east,elev:o.elev_m,unix:(lastSnap.time.jd_utc-2440587.5)*86400},shareBase);
  pendingPreview={...preview,kind,snapshot:lastSnap};
  const panel=document.getElementById("skySharePreview"),text=document.getElementById("skySharePreviewText"),confirm=document.getElementById("skyShareConfirm");
  if(panel)panel.hidden=false;if(text)text.textContent=preview.text+(kind==="export"?" Raw JSON also includes source/model metadata.":" "+preview.url);
  if(confirm)confirm.textContent=kind==="export"?"Download precise snapshot":"Copy precise share link";
}
function offerManualShareCopy(url) {
  let field=/** @type {HTMLTextAreaElement|null} */(document.getElementById("skyShareManualCopy"));
  if(!field){
    field=document.createElement("textarea");field.id="skyShareManualCopy";field.readOnly=true;
    field.setAttribute("aria-label","Precise Sky share link for manual copying");
    document.getElementById("skySharePreview")?.appendChild(field);
  }
  field.value=url;field.focus();field.select();
  inputError("Automatic copying unavailable. Copy the selected precise share link manually.");
}
document.getElementById("skyShare")?.addEventListener("click",()=>previewSky("share"));
document.getElementById("skyExport")?.addEventListener("click",()=>previewSky("export"));
document.getElementById("skyShareCancel")?.addEventListener("click",()=>{pendingPreview=null;document.getElementById("skyShareManualCopy")?.remove();const p=document.getElementById("skySharePreview");if(p)p.hidden=true;});
document.getElementById("skyShareConfirm")?.addEventListener("click",async()=>{
  const preview=pendingPreview;if(!preview)return;
  try{
    if(preview.kind==="share"){
      if(typeof navigator.clipboard?.writeText!=="function")throw new Error("Clipboard API unavailable");
      await navigator.clipboard.writeText(preview.url);
    }
    else {
      const blob=new Blob([JSON.stringify(preview.snapshot,null,2)],{type:"application/json"});
      const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="sky-snapshot-v3.json";a.click();URL.revokeObjectURL(url);
    }
    if(pendingPreview!==preview)return;
    pendingPreview=null;document.getElementById("skyShareManualCopy")?.remove();const p=document.getElementById("skySharePreview");if(p)p.hidden=true;inputError(preview.kind==="share"?"Share link copied.":"Snapshot downloaded.");
  }catch(error){
    if(pendingPreview!==preview)return;
    if(preview.kind==="share")offerManualShareCopy(preview.url);else inputError("Sharing failed: "+error.message);
  }
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
export function fillTooltip(t, b) {
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

  line(b.alt_deg > 0
    ? `${Math.round(b.alt_deg)}° above the ${b.compass} horizon · az ${Math.round(b.az_deg)}°`
    : `below the ${b.compass} horizon`, "tt-line");
  if (b.name === "Moon" && lastSnap) {
    const ph = moonPhaseInfo(lastSnap);
    if (ph) line(`${ph.glyph} ${ph.name} · ${Math.round(ph.k * 100)}% lit`, "tt-line");
  }
  if (b.magnitude != null) line(`magnitude ${b.magnitude.toFixed(1)}`, "tt-line");
  if (b.observer_range_km != null && b.observer_range_km > 0) {
    const lm = b.observer_range_km / 299792.458 / 60; // light-minutes
    line(lm >= 1 ? `${(b.observer_range_km / 1.495978707e8).toFixed(3)} AU · light ${lm.toFixed(1)} min`
      : `${Math.round(b.observer_range_km).toLocaleString()} km away`, "tt-line");
  }
  const transitAltitude = b.events.transit.altitude_deg == null ? "" : ` (${Math.round(b.events.transit.altitude_deg)}°)`;
  line(`rises ${eventLabel(b.events.rise)} · transits ${eventLabel(b.events.transit)}${transitAltitude} · sets ${eventLabel(b.events.set)}`, "tt-line");
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
  const canvas = /** @type {HTMLCanvasElement|null} */ (document.getElementById("skyCanvas")); if (!canvas || !domeGeom) return null;
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
    if (hit) { selectObject(hit.name); showTooltip(hit.body, ev.clientX, ev.clientY); }
    else if (pinned || activeName) { pinned = false; activeName = null; hideTooltip(); redraw(); }
  });
}

// Minimal debug hook (used by verification + handy in the console): current snapshot, plotted hit-
// boxes, dome geometry, and the alt/az helper.
if (typeof window !== "undefined") {
  /** @type {any} */ (window).__skyDebug =
    () => ({ snap: lastSnap, plotted, geom: domeGeom, altAz, BODY_INDEX, observer, currentUnix, selectedName });
}
