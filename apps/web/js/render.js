// All canvas rendering: the solar disk, its overlays, and the butterfly diagram.

import { store } from "./store.js";
import { controls, text } from "./dom.js";
import { clamp, hash01 } from "./format.js";
import { selectedRegion } from "./selectors.js";
import { currentBaseImage } from "./data.js";
import { projectSolarPoint, regionAnchor, confidenceEncoding } from "./solarProjection.js";
import { seriesPosition } from "./seriesModel.js";
import { updateWavelengthCaption } from "./wavelength.js";


// Resize may retain the canvas's own pixels; it never copies or resamples them.
// Full source/control renders remain unconditional. Mutable or unsupported
// snapshots, observed images and uncertain draw/context state render fully.
/** @type {WeakMap<object,any>} */
const solarFrames=new WeakMap();
/** @type {WeakMap<object,boolean>} */
const immutableInputs=new WeakMap();

function canvasDisplaySize(canvas,maxSize){
  const rect=canvas.getBoundingClientRect();
  if(rect.width<=0||rect.height<=0)return null;
  const scale=Math.min(window.devicePixelRatio||1,2,maxSize/Math.max(rect.width,1));
  const width=Math.max(1,Math.round(rect.width*scale)),height=Math.max(1,Math.round(rect.height*scale));
  return {width,height,textScale:Math.max(width/rect.width,height/rect.height)};
}

function immutableSnapshot(root){
  if(!root||typeof root!=='object')return false;
  if(immutableInputs.has(root))return immutableInputs.get(root);
  let valid=true,budget=0;
  const pending=[root],seen=new WeakSet();
  try{
    while(pending.length&&valid){
      const value=pending.pop(),proto=Object.getPrototypeOf(value);
      if(seen.has(value)||!Object.isFrozen(value)||(Array.isArray(value)?proto!==Array.prototype:proto!==Object.prototype&&proto!==null)){valid=false;break;}
      seen.add(value);
      for(const key of Reflect.ownKeys(value)){
        const descriptor=Object.getOwnPropertyDescriptor(value,key);
        if(++budget>100000||!descriptor||!('value'in descriptor)||typeof descriptor.value==='function'){valid=false;break;}
        if(descriptor.value&&typeof descriptor.value==='object')pending.push(descriptor.value);
      }
    }
  }catch{valid=false;}
  immutableInputs.set(root,valid);return valid;
}

function solarFrameState(canvas){
  let frame=solarFrames.get(canvas);
  if(frame)return frame;
  frame={valid:false,trackable:false};solarFrames.set(canvas,frame);
  if(typeof canvas.addEventListener==='function'){
    const invalidate=()=>{frame.valid=false;};
    try{canvas.addEventListener('contextlost',invalidate);canvas.addEventListener('contextrestored',invalidate);frame.trackable=true;}
    catch{frame.trackable=false;}
  }
  return frame;
}

function solarDrawInputs(base){
  if(base||!immutableSnapshot(store.state))return null;
  return [store.state,store.activeMode,store.timelineIndex,store.liveEngineRun,store.wavelength,store.selectedRegionId,
    controls?.regions?.checked,controls?.confidence?.checked];
}

function contextUsable(ctx){
  try{return typeof ctx?.isContextLost==='function'&&ctx.isContextLost()===false;}
  catch{return false;}
}

function rememberSolarFrame(canvas,ctx,base,frame,textScale){
  const inputs=solarDrawInputs(base);
  // A procedural Sun always ends with a nondefault rim/region stroke.
  // Native width/height and context resets restore lineWidth to1, so equal
  // backing dimensions alone cannot qualify a frame after such a reset.
  frame.lineWidth=ctx.lineWidth;frame.strokeStyle=ctx.strokeStyle;
  frame.valid=Boolean(frame.trackable&&inputs&&contextUsable(ctx)&&Number.isFinite(frame.lineWidth)&&frame.lineWidth>=1.5&&typeof frame.strokeStyle==='string');
  frame.textScale=textScale;frame.inputs=inputs;frame.ctx=ctx;frame.width=canvas.width;frame.height=canvas.height;
  frame.projected=store.projectedRegions;frame.kind=store.activeBaseKind;frame.label=store.activeBaseLabel;
}

function reuseSolarFrame(canvas,size){
  const frame=solarFrames.get(canvas);
  if(!frame?.valid)return false;
  if(!size||size.textScale!==frame.textScale||size.width!==canvas.width||size.height!==canvas.height||frame.width!==canvas.width||frame.height!==canvas.height)return false;
  const ctx=canvas.getContext('2d');
  if(ctx!==frame.ctx||!contextUsable(ctx)||!Object.is(ctx.lineWidth,frame.lineWidth)||ctx.strokeStyle!==frame.strokeStyle){frame.valid=false;return false;}
  const inputs=solarDrawInputs(currentBaseImage());
  if(!inputs||inputs.some((value,index)=>!Object.is(value,frame.inputs[index]))||frame.projected!==store.projectedRegions
    ||frame.kind!==store.activeBaseKind||frame.label!==store.activeBaseLabel)return false;
  try{updateWavelengthCaption();}catch(error){frame.valid=false;throw error;}
  return true;
}

/** @param {any} [options] */
export function drawSolarDisk(options=null) {
  const canvas = /** @type {HTMLCanvasElement} */ (document.getElementById("solarCanvas"));
  const size=canvasDisplaySize(canvas,720);
  const textScale=size?.textScale||1;
  if(options?.resizeOnly===true&&reuseSolarFrame(canvas,size))return;
  const frame=solarFrameState(canvas);
  frame.valid=false;
  resizeCanvasToDisplaySize(canvas,size);
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
    drawObservedBase(ctx, base, width, height);
    store.activeBaseKind = "observed";
    store.activeBaseLabel = base.cfg.label;
  } else {
    drawSunBase(ctx, cx, cy, radius);
    drawSurfaceTexture(ctx, cx, cy, radius);
    store.activeBaseKind = "synthetic";
    store.activeBaseLabel = "synthetic photosphere";
  }
  // Browse imagery has no capture-epoch registration: no modeled markers or
  // fields may be composited as though they were observations.
  if (!base) {
    drawMagneticPatches(ctx, cx, cy, radius);
    drawModeOverlay(ctx, cx, cy, radius);
  }

  if (!base) {
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(247,183,51,0.82)";
    ctx.lineWidth = Math.max(1.5, width * 0.0025);
    ctx.stroke();
  }

  if (!base && controls.regions.checked) {
    drawActiveRegions(ctx, cx, cy, radius, textScale);
  }

  const observed = store.activeBaseKind === "observed";
  text("baseLabel", `Base: ${store.activeBaseLabel} (${observed ? "observed" : "synthetic"})`);
  const baseNode = document.getElementById("baseLabel");
  if (baseNode) baseNode.className = `base-label ${observed ? "observed" : "synthetic"}`;
  // Timeline/local-model transitions can reuse a ready image without a load event.
  // Refresh its source disclosure whenever the displayed disk changes.
  updateWavelengthCaption();
  rememberSolarFrame(canvas,ctx,base,frame,textScale);
}

function drawObservedBase(ctx, entry, width, height) {
  const { img } = entry;
  // A browse frame is a camera plane, not a registered photospheric disk.
  // Preserve its complete field, caption, palette and existing limb treatment.
  // The model radius must not crop the corona or shade HMI magnetic values.
  const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
  const drawWidth = img.naturalWidth * scale, drawHeight = img.naturalHeight * scale;
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, (width - drawWidth) / 2, (height - drawHeight) / 2, drawWidth, drawHeight);
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
  // them). No model overlay is admitted over an unregistered observed image.
  const model = store.activeBaseKind === "synthetic";
  if (!model) return;
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.clip();

  for (const region of store.state.active_regions || []) {
    const point = projectRegion(region, cx, cy, radius);
    if (!point || point.z <= 1e-12) continue;
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
  }

  if (controls.confidence.checked) drawConfidenceField(ctx, cx, cy, radius);

  ctx.restore();
}

function drawConfidenceField(ctx, cx, cy, radius) {
  const grid = store.state.grid;
  const values = store.state.fields?.confidence?.values;
  if (!grid || !values || values.length !== grid.lon_count * grid.lat_count) return;
  for (let row = 0; row < grid.lat_count; row++) {
    for (let col = 0; col < grid.lon_count; col++) {
      const point = projectSolarPoint(-90 + (row + 0.5) * grid.dlat_deg, (col + 0.5) * grid.dlon_deg, store.state.coordinates);
      const encoding = confidenceEncoding(values[row * grid.lon_count + col]);
      if (!point?.visible || !encoding) continue;
      ctx.fillStyle = `rgba(97,224,155,${encoding.opacity})`;
      ctx.beginPath();
      ctx.ellipse(cx + point.x * radius, cy + point.y * radius, Math.max(1, radius * Math.PI / grid.lon_count * point.z), Math.max(1, radius * Math.PI / (2 * grid.lat_count)), 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
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

function drawActiveRegions(ctx, cx, cy, radius, textScale) {
  const selected = selectedRegion();
  for (const region of store.state.active_regions || []) {
    const point = projectRegion(region, cx, cy, radius);
    if (!point || point.z <= 1e-12) continue;
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
      ctx.font = `${Math.max(12 * textScale, radius * 0.032)}px Segoe UI, sans-serif`;
      ctx.fillText(`AR ${region.id}`, point.x + size + 5 * textScale, point.y - size - 4 * textScale);
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
  const size=canvasDisplaySize(canvas,980);
  resizeCanvasToDisplaySize(canvas,size);
  const textScale=size?.textScale||1;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  store.projectedButterflyRegions = [];
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#08090c";
  ctx.fillRect(0, 0, width, height);
  if (store.seriesFrames.length) {
    drawButterflySeries(ctx, width, height, textScale);
  } else {
    drawButterflySnapshot(ctx, width, height, textScale);
  }
}

// A real butterfly diagram: sunspot latitude (y) against cycle time (x).
function drawButterflySeries(ctx, width, height, textScale) {
  const padLeft = 38 * textScale;
  const padRight = 14 * textScale;
  const top = 14 * textScale;
  const bottom = height - 24 * textScale;
  const plotH = bottom - top;
  const count = store.seriesFrames.length;
  const latToY = (lat) => top + (1 - (lat + 45) / 90) * plotH;
  const frameToX = (i) => padLeft + (seriesPosition(store.seriesRecords, i) ?? (count === 1 ? 0.5 : i / (count - 1))) * (width - padLeft - padRight);

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
    if (!frame) {
      ctx.strokeStyle = "#aeb4bd";
      ctx.setLineDash([3, 5]);
      ctx.beginPath(); ctx.moveTo(x, top); ctx.lineTo(x, bottom); ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    for (const region of frame.active_regions || []) {
      const lat = regionAnchor(region).lat_deg;
      const y = latToY(lat);
      const size = 1.4 + 4 * clamp(region.complexity || 0.3, 0, 1);
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fillStyle = lat >= 0 ? "rgba(247,183,51,0.82)" : "rgba(64,214,200,0.82)";
      ctx.fill();
    }
  });

  ctx.fillStyle = "#aeb4bd";
  ctx.font = `${13 * textScale}px Segoe UI, sans-serif`;
  ctx.fillText("+45°", 4 * textScale, latToY(45) + 4 * textScale);
  ctx.fillText("eq", 12 * textScale, latToY(0) + 4 * textScale);
  ctx.fillText("-45°", 4 * textScale, latToY(-45) + 4 * textScale);
  ctx.fillText("time →  (one idealized ~11-year cycle)", padLeft, height - 7 * textScale);
}

// Fallback used before the series loads: today's regions plotted by latitude.
function drawButterflySnapshot(ctx, width, height, textScale) {
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
    const lat = regionAnchor(region).lat_deg;
    const y = height / 2 - (lat / 45) * (height * 0.42);
    const isSelected = store.selectedRegionId === region.id;
    const size = (isSelected ? 6 : 3) + 8 * clamp(region.complexity || 0.3, 0, 1);
    store.projectedButterflyRegions.push({ x, y, region });
    ctx.beginPath();
    ctx.arc(x, y, size, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? "#f7b733" : lat >= 0 ? "rgba(247,183,51,0.85)" : "rgba(64,214,200,0.85)";
    ctx.fill();
  });
  ctx.fillStyle = "#aeb4bd";
  ctx.font = `${14 * textScale}px Segoe UI, sans-serif`;
  ctx.fillText("+45 deg", 14 * textScale, 22 * textScale);
  ctx.fillText("equator", 14 * textScale, height / 2 - 8 * textScale);
  ctx.fillText("-45 deg", 14 * textScale, height - 14 * textScale);
}

function resizeCanvasToDisplaySize(canvas, size) {
  if(!size)return;
  const {width,height}=size;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
}

export function projectRegion(region, cx, cy, radius) {
  const anchor = regionAnchor(region);
  const point = projectSolarPoint(anchor.lat_deg, anchor.lon_deg, store.state.coordinates);
  if (!point) return null;
  return {
    x: cx + radius * point.x,
    y: cy + radius * point.y,
    z: point.z
  };
}
