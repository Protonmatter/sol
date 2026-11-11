import {writeText} from './domWrites.js';
import {layoutLabels} from './labelLayout.js';
import {isLabelOccluded} from './labelOcclusion.js';

// Owns label nodes and text metrics. Geometry is reprojected every frame, but
// fractional text bounds are measured only after content/style/layout changes.
export function createLabelPresenter({document,onInvalidate=()=>{}}) {
  const labelEls=[];
  let metrics=new WeakMap(),viewport='';
  const invalidate=()=>{metrics=new WeakMap();onInvalidate();};
  document.fonts?.addEventListener?.('loadingdone',invalidate);
  document.fonts?.addEventListener?.('loadingerror',invalidate);
  document.fonts?.ready?.then(invalidate);
  function present({canvas,host,items,discs,vp,skyVp,parentOf,selected,selectedStar,anchor,primaryNames}) {
    const cw=canvas.clientWidth,ch=canvas.clientHeight,key=`${cw}:${ch}`;
    if(viewport!==key){metrics=new WeakMap();viewport=key;}
    const projectedById=new Map();
    host.style.left=canvas.offsetLeft+'px';host.style.top=canvas.offsetTop+'px';
    host.style.width=cw+'px';host.style.height=ch+'px';
    while (labelEls.length < items.length) { const e = document.createElement("span"); host.appendChild(e); labelEls.push(e); }
    // Batch DOM text writes, then measurements, then placement writes.
    for (let i = 0; i < labelEls.length; i++) {
      const el = labelEls[i], it = items[i];
      delete el.dataset.projectionX; delete el.dataset.projectionY;
      el.style.display = it ? "block" : "none";
      if (!it) continue;
      const changed=el.className!==it.cls||el.textContent!==it.name;
      if(changed)metrics.delete(el);
      if(el.className!==it.cls)el.className=it.cls;
      writeText(el,it.name); el.style.transform = "none";
      el.style.maxWidth = Math.max(0,cw-8)+"px"; el.style.width = "max-content";
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
      if (wv <= 1e-9) { el.style.display = "none"; continue; }
      const sx = (x / wv * 0.5 + 0.5) * cw, sy = (1 - (y / wv * 0.5 + 0.5)) * ch;
      const projected = {id:it.name,x:sx,y:sy,depth:wv,background:it.sky===true};
      if (isLabelOccluded(projected, occludersFor(it.name))) { el.style.display = "none"; continue; }
      projectedById.set(it.name, projected);
      if (Number.isFinite(sx) && Number.isFinite(sy)) {
        el.dataset.projectionX=String(sx); el.dataset.projectionY=String(sy);
      }
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
    const jumps = document.getElementById("systemJumps");
    let topInset = 0;
    if (jumps && !jumps.hidden && typeof jumps.getBoundingClientRect === "function"
        && typeof host.getBoundingClientRect === "function") {
      const overlap = jumps.getBoundingClientRect().bottom - host.getBoundingClientRect().top;
      if (Number.isFinite(overlap) && overlap > 0) topInset = Math.ceil(overlap + 8);
    }
    const placements = new Map(layoutLabels(candidates,{
      width:cw,height:ch,limit:cw<600?14:24,topInset,
    }).map(p=>[p.id,p]));
    for (let i=0;i<items.length;i++) {
      const el=labelEls[i];
      let box=placements.get(items[i].name);
      if (box && isLabelOccluded({...projectedById.get(items[i].name),bounds:box}, occludersFor(items[i].name))) box=null;
      el.style.display = box ? "block" : "none";
      if (!box) { delete el.dataset.projectionX; delete el.dataset.projectionY; continue; }
      if(el.dataset.objectId!==box.id)el.dataset.objectId=box.id;
      el.classList.toggle("label-callout",box.callout);
      el.style.left=box.x+"px"; el.style.top=box.y+"px";
    }
  }
  return {present,invalidate,dispose(){
    document.fonts?.removeEventListener?.('loadingdone',invalidate);
    document.fonts?.removeEventListener?.('loadingerror',invalidate);
  }};
}
