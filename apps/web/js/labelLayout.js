// Screen-space presentation only. Never changes a body's physical coordinates.
// A name must stay beside its on-screen target. Suppressed names remain in search.
export function layoutLabels(candidates, {width, height, clearance = 4, limit = width < 600 ? 8 : 16, topInset = 0}) {
  if (![width,height,clearance,limit,topInset].every(Number.isFinite) || width <= 2*clearance || height <= 2*clearance || clearance < 0 || limit < 0 || topInset < 0) return [];
  const top = clearance + topInset;
  const ordered = candidates.filter(c => typeof c.id === "string" && [c.x,c.y,c.width,c.height,c.priority].every(Number.isFinite)
    && c.width > 0 && c.height > 0
    && (c.x >= 0 && c.x <= width && c.y >= 0 && c.y <= height))
    .slice().sort((a,b)=>a.priority-b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const placed = [], seen = new Set();
  const fits = box => box.x >= clearance && box.y >= top && box.x+box.width <= width-clearance
    && box.y+box.height <= height-clearance && placed.every(p=>box.x+box.width+clearance <= p.x
      || p.x+p.width+clearance <= box.x || box.y+box.height+clearance <= p.y || p.y+p.height+clearance <= box.y);
  for (const c of ordered) {
    if (placed.length >= Math.floor(limit)) break;
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const w = c.width, h = c.height;
    const positions = [[c.x+8,c.y-h/2],[c.x-w-8,c.y-h/2],[c.x-w/2,c.y-h-8],[c.x-w/2,c.y+8]];
    const box = positions.map(([x,y])=>({id:c.id,x,y,width:w,height:h,callout:false})).find(fits);
    if (box) placed.push(box);
  }
  return placed;
}
