// All canvas rendering: the solar disk, its overlays, and the butterfly diagram.

import { store } from "./store.js?v=c829bbcd8c";
import { controls, text } from "./dom.js?v=c829bbcd8c";
import { clamp, hash01 } from "./format.js?v=c829bbcd8c";
import { selectedRegion } from "./selectors.js?v=c829bbcd8c";
import { currentBaseImage } from "./data.js?v=c829bbcd8c";

export function drawSolarDisk() {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("solarCanvas"));
  resizeCanvasToDisplaySize(canvas, 720);
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) * 0.42;

  store.projectedRegions = [];
  ctx.clearRect(0, 0, width, height);
  const sky = ctx.createRadialGradient(cx, cy, radius * 0.1, cx, cy, radius * 1.35);
  sky.addColorStop(0, "#16110c");
  sky.addColorStop(0.62, "#050506");
  sky.addColorStop(1, "#010102");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  const base = currentBaseImage();
  if (base) {
    drawObservedBase(ctx, base, cx, cy, radius);
    store.activeBaseKind = "observed";
    store.activeBaseLabel = base.cfg.label;
  } else {
    drawSunBase(ctx, cx, cy, radius);
    drawSurfaceTexture(ctx, cx, cy, radius);
    store.activeBaseKind = "synthetic";
    store.activeBaseLabel = "synthetic photosphere";
  }
  drawMagneticPatches(ctx, cx, cy, radius);
  drawModeOverlay(ctx, cx, cy, radius);

  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(247,183,51,0.82)";
  ctx.lineWidth = Math.max(1.5, width * 0.0025);
  ctx.stroke();

  if (controls.regions.checked) {
    drawActiveRegions(ctx, cx, cy, radius);
  }

  const observed = store.activeBaseKind === "observed";
  text("baseLabel", `Base: ${store.activeBaseLabel} (${observed ? "observed" : "synthetic"})`);
  const baseNode = document.getElementById("baseLabel");
  if (baseNode) baseNode.className = `base-label ${observed ? "observed" : "synthetic"}`;
}

function drawObservedBase(ctx, entry, cx, cy, radius) {
  const { img, cfg } = entry;
  const srcSize = img.naturalWidth;
  const scale = radius / (srcSize * cfg.radiusFrac);
  const srcCenter = srcSize * cfg.centerFrac;
  const destSize = srcSize * scale;
  const destX = cx - srcCenter * scale;
  const destY = cy - srcCenter * scale;
  ctx.save();
  // HMI channels are the photospheric disk (clip to it); AIA EUV/UV show the corona arcing beyond the
  // limb, so they are drawn unclipped (and skip the limb-darkening vignette, which assumes a hard disk).
  const clip = entry.cfg.clip !== false;
  if (clip) { ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.clip(); }
  ctx.drawImage(img, destX, destY, destSize, destSize);
  if (clip) {
    const limb = ctx.createRadialGradient(cx, cy, radius * 0.74, cx, cy, radius);
    limb.addColorStop(0, "rgba(0,0,0,0)");
    limb.addColorStop(1, "rgba(0,0,0,0.4)");
    ctx.fillStyle = limb;
    ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
  }
  ctx.restore();
}

function drawSunBase(ctx, cx, cy, radius) {
  const disk = ctx.createRadialGradient(cx - radius * 0.26, cy - radius * 0.32, radius * 0.12, cx, cy, radius);
  disk.addColorStop(0, "#ffd27a");
  disk.addColorStop(0.36, "#ff8d24");
  disk.addColorStop(0.74, "#d86b12");
  disk.addColorStop(1, "#7a300c");
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.fillStyle = disk;
  ctx.fill();
}

function drawSurfaceTexture(ctx, cx, cy, radius) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  const seed = store.state.run?.seed || 42;
  for (let i = 0; i < 850; i += 1) {
    const a = hash01(i * 3 + seed) * Math.PI * 2;
    const rr = Math.sqrt(hash01(i * 7 + seed)) * radius * 0.98;
    const x = cx + Math.cos(a) * rr;
    const y = cy + Math.sin(a) * rr;
    const limb = 1 - Math.min(1, rr / radius);
    const size = radius * (0.0035 + 0.0075 * hash01(i * 11 + seed));
    const bright = hash01(i * 13 + seed) > 0.48;
    ctx.globalAlpha = (bright ? 0.09 : 0.07) * (0.55 + limb);
    ctx.fillStyle = bright ? "#ffd58f" : "#9d390c";
    ctx.beginPath();
    ctx.ellipse(x, y, size * 1.7, size, a, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = "#ffd275";
  ctx.lineWidth = Math.max(1, radius * 0.004);
  for (let i = 0; i < 34; i += 1) {
    const y = cy - radius * 0.74 + i * radius * 0.045;
    ctx.beginPath();
    ctx.moveTo(cx - radius * 0.86, y);
    ctx.bezierCurveTo(cx - radius * 0.32, y + Math.sin(i) * 10, cx + radius * 0.35, y - Math.cos(i) * 12, cx + radius * 0.86, y);
    ctx.stroke();
  }

  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawMagneticPatches(ctx, cx, cy, radius) {
  // Synthetic sunspots + magnetic dipoles belong to the "Model" view (the real SDO images already show
  // them). Only the confidence overlay may sit on top of a real wavelength image.
  const model = store.wavelength === "model";
  if (!model && !controls.confidence.checked) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  for (const region of store.state.active_regions || []) {
    const point = projectRegion(region, cx, cy, radius);
    if (!point || point.z < -0.2) continue;
    const baseSize = radius * (0.032 + 0.07 * clamp(region.complexity || 0.35, 0, 1));
    const tilt = ((region.tilt_deg || 0) / 180) * Math.PI;
    const dx = Math.cos(tilt) * baseSize * 0.72;
    const dy = -Math.sin(tilt) * baseSize * 0.38;
    const flux = clamp(region.flux_norm || 0.5, 0.2, 1.5);

    if (model) {
      drawSpot(ctx, point.x, point.y, baseSize * 0.42 * flux, "rgba(55,18,8,0.48)", "rgba(55,18,8,0)");          // sunspot umbra
      drawSpot(ctx, point.x + dx, point.y + dy, baseSize * flux, "rgba(90,105,220,0.5)", "rgba(90,105,220,0)");  // + polarity
      drawSpot(ctx, point.x - dx, point.y - dy, baseSize * flux, "rgba(236,64,126,0.48)", "rgba(236,64,126,0)"); // − polarity
    }
    if (controls.confidence.checked) {
      drawSpot(ctx, point.x, point.y, baseSize * 1.35, "rgba(97,224,155,0.22)", "rgba(97,224,155,0)");
    }
  }

  ctx.restore();
}

function drawSpot(ctx, x, y, radius, inner, outer) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, inner);
  gradient.addColorStop(1, outer);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}

function drawActiveRegions(ctx, cx, cy, radius) {
  const selected = selectedRegion();
  for (const region of store.state.active_regions || []) {
    const point = projectRegion(region, cx, cy, radius);
    if (!point || point.z < -0.15) continue;
    store.projectedRegions.push({ ...point, region });
    const isSelected = selected && selected.id === region.id;
    const size = (isSelected ? 6 : 4) + 12 * clamp(region.complexity || 0.3, 0, 1);
    ctx.beginPath();
    ctx.arc(point.x, point.y, size + (isSelected ? 5 : 0), 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? "rgba(247,183,51,0.25)" : "rgba(64,214,200,0.18)";
    ctx.fill();
    ctx.lineWidth = isSelected ? 3.5 : 2;
    ctx.strokeStyle = isSelected ? "#f7b733" : region.flux_norm >= 0.7 ? "#d958a7" : "#40d6c8";
    ctx.stroke();

    if (isSelected) {
      ctx.fillStyle = "rgba(246,243,232,0.92)";
      ctx.font = `${Math.max(11, radius * 0.032)}px Segoe UI, sans-serif`;
      ctx.fillText(`AR ${region.id}`, point.x + size + 5, point.y - size - 4);
    }
  }
}

function drawModeOverlay(ctx, cx, cy, radius) {
  // The Sun is a single surface now; the disk carries the latitude-band overlay (sunspot zones).
  if (store.activeMode === "today") drawLatitudeBands(ctx, cx, cy, radius, "rgba(247,183,51,0.12)");
}

function drawLatitudeBands(ctx, cx, cy, radius, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  for (const lat of [-40, -20, 0, 20, 40]) {
    const y = cy - radius * Math.sin((lat / 180) * Math.PI);
    const width = radius * Math.cos((lat / 180) * Math.PI);
    ctx.beginPath();
    ctx.ellipse(cx, y, width, Math.max(4, radius * 0.012), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

export function drawButterfly() {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("butterflyCanvas"));
  resizeCanvasToDisplaySize(canvas, 980);
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  store.projectedButterflyRegions = [];
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#08090c";
  ctx.fillRect(0, 0, width, height);
  if (store.seriesFrames.length) {
    drawButterflySeries(ctx, width, height);
  } else {
    drawButterflySnapshot(ctx, width, height);
  }
}

// A real butterfly diagram: sunspot latitude (y) against cycle time (x).
function drawButterflySeries(ctx, width, height) {
  const padLeft = 38;
  const padRight = 14;
  const top = 14;
  const bottom = height - 24;
  const plotH = bottom - top;
  const count = store.seriesFrames.length;
  const latToY = (lat) => top + (1 - (lat + 45) / 90) * plotH;
  const frameToX = (i) => padLeft + (count === 1 ? 0.5 : i / (count - 1)) * (width - padLeft - padRight);

  ctx.strokeStyle = "#313742";
  ctx.lineWidth = 1;
  for (const lat of [45, 0, -45]) {
    const y = latToY(lat);
    ctx.beginPath();
    ctx.moveTo(padLeft, y);
    ctx.lineTo(width - padRight, y);
    ctx.stroke();
  }

  if (store.timelineIndex >= 0) {
    const x = frameToX(store.timelineIndex);
    ctx.strokeStyle = "rgba(247,183,51,0.75)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x, top);
    ctx.lineTo(x, bottom);
    ctx.stroke();
  }

  store.seriesFrames.forEach((frame, i) => {
    const x = frameToX(i);
    for (const region of frame.active_regions || []) {
      const lat = region.lat_deg || 0;
      const y = latToY(lat);
      const size = 1.4 + 4 * clamp(region.complexity || 0.3, 0, 1);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fillStyle = lat >= 0 ? "rgba(247,183,51,0.82)" : "rgba(64,214,200,0.82)";
      ctx.fill();
    }
  });

  ctx.fillStyle = "#aeb4bd";
  ctx.font = "13px Segoe UI, sans-serif";
  ctx.fillText("+45°", 4, latToY(45) + 4);
  ctx.fillText("eq", 12, latToY(0) + 4);
  ctx.fillText("-45°", 4, latToY(-45) + 4);
  ctx.fillText("time →  (one idealized ~11-year cycle)", padLeft, height - 7);
}

// Fallback used before the series loads: today's regions plotted by latitude.
function drawButterflySnapshot(ctx, width, height) {
  ctx.strokeStyle = "#313742";
  ctx.lineWidth = 1;
  for (let i = 1; i < 6; i += 1) {
    const y = (height / 6) * i;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  const regions = store.state.active_regions || [];
  regions.forEach((region, index) => {
    const x = 30 + (index / Math.max(regions.length - 1, 1)) * (width - 60);
    const y = height / 2 - ((region.lat_deg || 0) / 45) * (height * 0.42);
    const isSelected = store.selectedRegionId === region.id;
    const size = (isSelected ? 6 : 3) + 8 * clamp(region.complexity || 0.3, 0, 1);
    store.projectedButterflyRegions.push({ x, y, region });
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? "#f7b733" : region.lat_deg >= 0 ? "rgba(247,183,51,0.85)" : "rgba(64,214,200,0.85)";
    ctx.fill();
  });
  ctx.fillStyle = "#aeb4bd";
  ctx.font = "14px Segoe UI, sans-serif";
  ctx.fillText("+45 deg", 14, 22);
  ctx.fillText("equator", 14, height / 2 - 8);
  ctx.fillText("-45 deg", 14, height - 14);
}

function resizeCanvasToDisplaySize(canvas, maxSize) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return;
  const scale = Math.min(window.devicePixelRatio || 1, 2, maxSize / Math.max(rect.width, 1));
  const width = Math.max(1, Math.round(rect.width * scale));
  const height = Math.max(1, Math.round(rect.height * scale));
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

export function projectRegion(region, cx, cy, radius) {
  const lon = (((region.lon_deg || 0) / 360) * Math.PI * 2) - Math.PI;
  const lat = ((region.lat_deg || 0) / 180) * Math.PI;
  const z = Math.cos(lat) * Math.cos(lon);
  return {
    x: cx + radius * Math.cos(lat) * Math.sin(lon),
    y: cy - radius * Math.sin(lat),
    z
  };
}
