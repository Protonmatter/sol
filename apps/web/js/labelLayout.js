// Screen-space presentation only. Never changes a body's physical coordinates.
export function layoutLabels(candidates, {width, height, clearance = 4, limit = width < 600 ? 8 : 16, topInset = 0}) {
  if (![width,height,clearance,limit,topInset].every(Number.isFinite) || width <= 2*clearance || height <= 2*clearance || clearance < 0 || limit < 0 || topInset < 0) return [];
  const top = clearance + topInset;
  const ordered = candidates.filter(c => typeof c.id === "string" && [c.x,c.y,c.width,c.height,c.priority].every(Number.isFinite)
    && c.width > 0 && c.height > 0
    && (c.priority <= 1 || (c.x >= 0 && c.x <= width && c.y >= 0 && c.y <= height)))
    .slice().sort((a,b)=>a.priority-b.priority || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const placed = [], seen = new Set();
  const fits = box => box.x >= clearance && box.y >= top && box.x+box.width <= width-clearance
    && box.y+box.height <= height-clearance && placed.every(p=>box.x+box.width+clearance <= p.x
      || p.x+p.width+clearance <= box.x || box.y+box.height+clearance <= p.y || p.y+p.height+clearance <= box.y);
  for (const c of ordered) {
    if (placed.length >= Math.floor(limit)) break;
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    const w = Math.min(c.width,width-2*clearance), h = Math.min(c.height,height-2*clearance);
    const positions = [[c.x+8,c.y-h/2],[c.x-w-8,c.y-h/2],[c.x-w/2,c.y-h-8],[c.x-w/2,c.y+8]];
    let box = positions.map(([x,y])=>({id:c.id,x,y,width:w,height:h,callout:false})).find(fits);
    if (!box && c.priority <= 2) {
      // Planets and the current selection keep a readable name even when they
      // sit on top of each other around the Sun. Moons and sky objects (3+) stay
      // optional so they cannot bury Mercury or Venus. Overflow names start
      // below topInset so they do not sit under the system-jump chips.
      const x = Math.max(clearance,Math.min(width-clearance-w,c.x+8));
      const y = Math.max(top,Math.min(height-clearance-h,c.y-h/2));
      box = {id:c.id,x,y,width:w,height:h,callout:true};
      if (!fits(box)) {
        box = null;
        for (let row=top; row+h<=height-clearance; row+=h+clearance) {
          const callout = {id:c.id,x:clearance,y:row,width:w,height:h,callout:true};
          if (fits(callout)) { box=callout; break; }
        }
      }
    }
    if (box) placed.push(box);
  }
  return placed;
}
