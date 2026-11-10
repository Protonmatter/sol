import assert from 'node:assert/strict';

// Independent browser acceptance limits for updateLabels in orrery.js. The
// renderer explicitly requests 14/24; labelLayout's standalone 8/16 defaults
// do not define the System scene's density policy. Keep the existing 4px
// clearance assertion's 0.1px DOM-rounding allowance.
export function assertSystemLabelLayout({labels,canvas}) {
  assert.ok(canvas&&[canvas.x,canvas.y,canvas.width,canvas.height].every(Number.isFinite)
    &&canvas.width>0&&canvas.height>0&&Number.isSafeInteger(canvas.clientWidth)&&canvas.clientWidth>0,
  'System canvas geometry must be visible and finite');
  const limit=canvas.clientWidth<600?14:24,clearancePx=3.9;
  assert.ok(Array.isArray(labels)&&labels.length>0&&labels.length<=limit,
    `System label count ${labels?.length} must be 1..${limit} for a ${canvas.clientWidth}px client canvas`);
  const ids=new Set();
  for(const label of labels) {
    assert.ok(typeof label.id==='string'&&label.id.length>0&&[label.x,label.y,label.width,label.height].every(Number.isFinite)
      &&label.width>0&&label.height>0,`System label geometry: ${label.id}`);
    assert.ok(!ids.has(label.id),`System duplicate label: ${label.id}`);ids.add(label.id);
    assert.ok(label.x>=canvas.x-.1&&label.y>=canvas.y-.1
      &&label.x+label.width<=canvas.x+canvas.width+.1
      &&label.y+label.height<=canvas.y+canvas.height+.1,`System label bounds: ${label.id}`);
  }
  for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++) {
    const a=labels[i],b=labels[j];
    assert.ok(a.x+a.width+clearancePx<=b.x||b.x+b.width+clearancePx<=a.x
      ||a.y+a.height+clearancePx<=b.y||b.y+b.height+clearancePx<=a.y,`System label clearance: ${a.id}/${b.id}`);
  }
  return {count:labels.length,limit,clearancePx};
}

// Self-contained callback serialized into Chromium. Integer clientWidth is the
// renderer's density input; the fractional DOMRect defines actual canvas bounds.
export function readSystemLabelLayout() {
  const box=node=>{const {x,y,width,height}=node.getBoundingClientRect();return {x,y,width,height};};
  const canvas=document.getElementById('orreryCanvas');
  return {canvas:{...box(canvas),clientWidth:canvas.clientWidth},
    labels:Array.from(document.querySelectorAll('#orreryLabels span'))
      .filter(node=>getComputedStyle(node).display!=='none')
      .map(node=>({id:node.dataset.objectId,...box(node)}))};
}
