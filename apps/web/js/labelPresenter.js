import {writeText} from './domWrites.js';
import {layoutLabels} from './labelLayout.js';
import {isLabelOccluded} from './labelOcclusion.js';

// Owns label nodes and text metrics. Geometry is reprojected every frame, but
// fractional text bounds are measured only after content/style/layout changes.
// Writes are skipped when a value is unchanged, so a steady frame does not dirty
// layout before the next frame's reads.
const setStyle=(el,name,value)=>{if(el.style[name]!==value)el.style[name]=value;};
const setData=(el,name,value)=>{if(el.dataset[name]!==value)el.dataset[name]=value;};
const clearProjection=el=>{
  if(el.dataset.projectionX!==undefined)delete el.dataset.projectionX;
  if(el.dataset.projectionY!==undefined)delete el.dataset.projectionY;
};
export function createLabelPresenter({document,onInvalidate=()=>{}}) {
  const labelEls=[];
  let metrics=new WeakMap(),viewport='',insetCache=null;
  const invalidate=()=>{metrics=new WeakMap();insetCache=null;onInvalidate();};
  document.fonts?.addEventListener?.('loadingdone',invalidate);
  document.fonts?.addEventListener?.('loadingerror',invalidate);
  document.fonts?.ready?.then(invalidate);
  function present({canvas,host,items,discs,vp,skyVp,parentOf,selected,selectedStar,anchor,primaryNames}) {
    const cw=canvas.clientWidth,ch=canvas.clientHeight,key=`${cw}:${ch}`;
    if(viewport!==key){metrics=new WeakMap();insetCache=null;viewport=key;}
    const projectedById=new Map();
    setStyle(host,'left',canvas.offsetLeft+'px');setStyle(host,'top',canvas.offsetTop+'px');
    setStyle(host,'width',cw+'px');setStyle(host,'height',ch+'px');
    while (labelEls.length < items.length) { const e = document.createElement("span"); host.appendChild(e); labelEls.push(e); }
    // Batch DOM text writes, then measurements, then placement writes.
    for (let i = 0; i < labelEls.length; i++) {
      const el = labelEls[i], it = items[i];
      if (!it) { setStyle(el,'display','none'); clearProjection(el); continue; }
      const changed=el.className!==it.cls||el.textContent!==it.name;
      if(changed)metrics.delete(el);
      if(el.className!==it.cls)el.className=it.cls;
      writeText(el,it.name); setStyle(el,'transform','none');
      setStyle(el,'maxWidth',Math.max(0,cw-8)+'px'); setStyle(el,'width','max-content');
      // Only a label that must be measured is shown before placement; the final
      // pass below decides visibility for the rest.
      if(!metrics.has(el))setStyle(el,'display','block');
    }
    const occludersFor = name => {
      const parent = parentOf(name);
      return parent ? discs.filter(d => d.id !== parent) : discs;
    };
    const candidates = [];
    for (let i = 0; i < items.length; i++) {
      const el = labelEls[i];
      const it = items[i], m = it.sky ? skyVp : vp;
      const x = m[0] * it.p[0] + m[4] * it.p[1] + m[8] * it.p[2] + m[12];
      const y = m[1] * it.p[0] + m[5] * it.p[1] + m[9] * it.p[2] + m[13];
      const wv = m[3] * it.p[0] + m[7] * it.p[1] + m[11] * it.p[2] + m[15];
      if (wv <= 1e-9) { setStyle(el,'display','none'); clearProjection(el); continue; }
      const sx = (x / wv * 0.5 + 0.5) * cw, sy = (1 - (y / wv * 0.5 + 0.5)) * ch;
      const projected = {id:it.name,x:sx,y:sy,depth:wv,background:it.sky===true};
      if (isLabelOccluded(projected, occludersFor(it.name))) { setStyle(el,'display','none'); clearProjection(el); continue; }
      projectedById.set(it.name, projected);
      if (Number.isFinite(sx) && Number.isFinite(sy)) {
        setData(el,'projectionX',String(sx)); setData(el,'projectionY',String(sy));
      } else clearProjection(el);
      const isSelected = it.name === selected || it.name === selectedStar;
      const moonParent = parentOf(it.name);
      const focusedMoon = moonParent && (moonParent === selected || moonParent === anchor);
      const priority = isSelected ? 0
        : (it.name === anchor || focusedMoon) ? 1
        : primaryNames.includes(it.name) ? 2
        : moonParent ? 3
        : 4;
      // Integer offset sizes can round text down and consume the required clearance.
      let labelBounds=metrics.get(el);
      if(!labelBounds){
        const bounds=el.getBoundingClientRect();
        labelBounds={width:bounds.width,height:bounds.height};metrics.set(el,labelBounds);
      }
      candidates.push({id:it.name,x:sx,y:sy,width:labelBounds.width,height:labelBounds.height,priority});
    }
    // The jump bar only moves with layout, so its overlap is measured once per
    // viewport and visibility state instead of forcing a layout read every frame.
    const jumps = document.getElementById("systemJumps");
    const insetKey = `${key}:${jumps ? jumps.hidden : 'none'}`;
    if (!insetCache || insetCache.key !== insetKey) {
      let topInset = 0;
      if (jumps && !jumps.hidden && typeof jumps.getBoundingClientRect === "function"
          && typeof host.getBoundingClientRect === "function") {
        const overlap = jumps.getBoundingClientRect().bottom - host.getBoundingClientRect().top;
        if (Number.isFinite(overlap) && overlap > 0) topInset = Math.ceil(overlap + 8);
      }
      insetCache = {key:insetKey, topInset};
    }
    const topInset = insetCache.topInset;
    const placements = new Map(layoutLabels(candidates,{
      width:cw,height:ch,limit:cw<600?14:24,topInset,
    }).map(p=>[p.id,p]));
    for (let i=0;i<items.length;i++) {
      const el=labelEls[i];
      let box=placements.get(items[i].name);
      if (box && isLabelOccluded({...projectedById.get(items[i].name),bounds:box}, occludersFor(items[i].name))) box=null;
      setStyle(el,'display',box ? "block" : "none");
      if (!box) { clearProjection(el); continue; }
      setData(el,'objectId',box.id);
      el.classList.toggle("label-callout",box.callout);
      setStyle(el,'left',box.x+"px"); setStyle(el,'top',box.y+"px");
    }
  }
  return {present,invalidate,dispose(){
    document.fonts?.removeEventListener?.('loadingdone',invalidate);
    document.fonts?.removeEventListener?.('loadingerror',invalidate);
  }};
}
