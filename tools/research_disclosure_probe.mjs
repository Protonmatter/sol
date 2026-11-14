import assert from 'node:assert/strict';

export function readResearchHit(selector){
  const node=document.querySelector(selector);if(!node)return {exists:false,selector};
  const box=node.getBoundingClientRect(),rect=r=>({left:r.left,top:r.top,right:r.right,bottom:r.bottom,width:r.width,height:r.height});
  const clips=[{name:'viewport',left:0,top:0,right:innerWidth,bottom:innerHeight}];
  let left=Math.max(0,box.left),top=Math.max(0,box.top),right=Math.min(innerWidth,box.right),bottom=Math.min(innerHeight,box.bottom);
  for(let parent=node.parentElement;parent;parent=parent.parentElement){
    const style=getComputedStyle(parent),r=parent.getBoundingClientRect(),clipX=/^(auto|scroll|hidden|clip)$/.test(style.overflowX),clipY=/^(auto|scroll|hidden|clip)$/.test(style.overflowY);
    if(!clipX&&!clipY)continue;
    const p={name:parent.id?'#'+parent.id:parent.tagName,overflowX:style.overflowX,overflowY:style.overflowY,
      left:r.left+parent.clientLeft,top:r.top+parent.clientTop,right:r.left+parent.clientLeft+parent.clientWidth,bottom:r.top+parent.clientTop+parent.clientHeight,
      clientWidth:parent.clientWidth,clientHeight:parent.clientHeight,scrollHeight:parent.scrollHeight};clips.push(p);
    if(clipX){left=Math.max(left,p.left);right=Math.min(right,p.right);}if(clipY){top=Math.max(top,p.top);bottom=Math.min(bottom,p.bottom);}
  }
  const width=Math.max(0,right-left),height=Math.max(0,bottom-top),x=(left+right)/2,y=(top+bottom)/2;
  const front=width>0&&height>0?document.elementFromPoint(x,y):null;
  const panel=document.getElementById('viewInspector'),p=panel.getBoundingClientRect();
  return {exists:true,selector,box:rect(box),intersection:{left,top,right,bottom,width,height},x,y,
    hit:!!front&&(front===node||node.contains(front)),front:front?.id||front?.tagName||null,clips,
    panel:{...rect(p),scrollTop:panel.scrollTop,scrollHeight:panel.scrollHeight,clientHeight:panel.clientHeight},viewport:{width:innerWidth,height:innerHeight,scrollY}};
}

export async function verifyResearchDisclosures(page,{onObservation=()=>{}}={}){
  await page.evaluate(()=>{
    if(!window.__solResearchControlProbe){
      const state={events:[]};window.__solResearchControlProbe=state;
      for(const type of ['wheel','pointerdown','click','keydown','input'])document.addEventListener(type,event=>{
        const target=event.target;state.events.push({type,trusted:event.isTrusted,id:target?.id||null,
          summary:target?.closest?.('summary')?.parentElement?.id||null,key:event.key||null});
        if(state.events.length>400)state.events.shift();
      },{capture:true,passive:true});
    }else window.__solResearchControlProbe.events.length=0;
  });
  const settle=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  async function reach(selector){
    let state;
    for(let attempt=0;attempt<24;attempt++){
      state=await page.evaluate(readResearchHit,selector);assert.ok(state.exists,'Missing Research control '+selector);
      const enough=state.intersection.width>=Math.min(24,state.box.width)&&state.intersection.height>=Math.min(24,state.box.height);
      if(enough&&state.hit)return state;
      if(attempt>0&&state.clips.some(p=>p.overflowY==='hidden'&&p.clientHeight<Math.min(24,state.box.height)))break;
      const p=state.panel,v=state.viewport,visibleTop=Math.max(0,p.top),visibleBottom=Math.min(v.height,p.bottom);
      const x=Math.max(4,Math.min(v.width-4,p.left+8)),y=visibleBottom>visibleTop?(visibleTop+visibleBottom)/2:v.height/2;
      const center=(state.box.top+state.box.bottom)/2,delta=Math.max(-600,Math.min(600,center-v.height/2));
      await page.mouse.move(x,y);await page.mouse.wheel({deltaY:Math.abs(delta)<80?(center<v.height/2?-180:180):delta});await settle();
    }
    onObservation({type:'unreachable',state});
    assert.fail('Research control is clipped or not hit-testable after native wheel input: '+selector+' '+JSON.stringify(state));
  }
  const summaries=[];
  for(const id of ['sunInside','sunExplore','sunWeather','sunResearch']){
    const selector='#'+id+' > summary',before=await page.$eval('#'+id,node=>node.open),hit=await reach(selector);
    await page.mouse.click(hit.x,hit.y);await settle();
    const after=await page.$eval('#'+id,node=>node.open);assert.equal(after,!before,'Native pointer must toggle '+id);
    assert.equal(await page.$eval(selector,node=>document.activeElement===node),true,'Native pointer focuses '+id);
    await page.keyboard.press('Enter');await settle();
    const restored=await page.$eval('#'+id,node=>node.open);assert.equal(restored,before,'Native Enter restores '+id);
    const row={id,before,afterPointer:after,restored,hit};summaries.push(row);onObservation({type:'summary',...row});
  }
  assert.equal(await page.$eval('#sunExplore',node=>node.open),true,'Preserve initially open region controls');
  const originalIds=await page.$$eval('#regionList button[data-object-id]',nodes=>nodes.filter(n=>!n.hidden).map(n=>n.dataset.objectId));
  assert.ok(originalIds.length>0,'Research region list must contain accepted records');
  const first=originalIds[0],count=originalIds.length,hit=await reach('#regionSearch');await page.mouse.click(hit.x,hit.y);
  assert.equal(await page.evaluate(()=>document.activeElement?.id),'regionSearch');
  assert.equal(await page.$eval('#regionSearch',node=>node.value),'','Start with an unfiltered region list');
  await page.keyboard.type(first);await settle();
  assert.equal(await page.$eval('#regionSearch',node=>node.value),first,'Native typing updates the search value');
  const filtered=await page.$$eval('#regionList button[data-object-id]',nodes=>nodes.filter(n=>!n.hidden).map(n=>n.dataset.objectId));
  assert.ok(filtered.includes(first),'Native search retains matching region');
  async function clearTyped(value){
    for(const character of Array.from(value))await page.keyboard.press('Backspace');
    await settle();assert.equal(await page.$eval('#regionSearch',node=>node.value),'','Native Backspace clears the search');
  }
  await clearTyped(first);
  const noMatchQuery='__sol_research_controls_no_match__';await page.keyboard.type(noMatchQuery);await settle();
  assert.equal(await page.$eval('#regionSearch',node=>node.value),noMatchQuery);
  const empty=await page.$$eval('#regionList button[data-object-id]',nodes=>nodes.filter(n=>!n.hidden).map(n=>n.dataset.objectId));
  assert.deepEqual(empty,[],'A nonmatching native query must actually filter out every row');
  await clearTyped(noMatchQuery);
  const restoredIds=await page.$$eval('#regionList button[data-object-id]',nodes=>nodes.filter(n=>!n.hidden).map(n=>n.dataset.objectId));
  assert.deepEqual(restoredIds,originalIds,'Clearing restores the exact visible region identities and order');
  const restoredCount=restoredIds.length;
  const events=await page.evaluate(()=>window.__solResearchControlProbe.events);
  for(const id of ['sunInside','sunExplore','sunWeather','sunResearch']){
    assert.ok(events.some(e=>e.type==='click'&&e.trusted&&e.summary===id),'Trusted pointer evidence missing '+id);
    assert.ok(events.some(e=>e.type==='keydown'&&e.trusted&&e.key==='Enter'&&e.summary===id),'Trusted keyboard evidence missing '+id);
  }
  assert.ok(events.some(e=>e.type==='wheel'&&e.trusted));assert.ok(events.some(e=>e.type==='input'&&e.trusted&&e.id==='regionSearch'));
  return {summaries,search:{first,count,originalIds,filtered,noMatchQuery,empty,restoredIds,restoredCount,hit},events};
}
