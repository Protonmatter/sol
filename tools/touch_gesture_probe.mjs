import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {assertBrowserBackend,captureBrowserCapabilities,withBrowserFeatureStatus} from './browser_backend.mjs';

export function assertSurvivingPointerMotion(before,after,deltaX){
  assert(Math.abs(after.az-before.az+deltaX*.008)<.001,'Surviving finger must produce the expected orbit movement');
  assert.equal(after.radius,before.radius,'A surviving finger must not zoom');
}

// Serialized whole into the page; lazy System state is legitimately absent first.
export async function touchSystemReady(){
  const body=document.body;
  if(body.dataset.appReady!=='true'||body.dataset.surface!=='orrery'||body.dataset.viewCodeName!=='orrery')return false;
  if(body.dataset.viewCode==='failed')return true;
  const entry=document.querySelector('script[type="module"][src^="app.js"]');if(!entry)return false;
  const query=new URL(entry.src).search,{store}=await import('./js/store.js'+query),system=store.orrery;
  globalThis.__solTouchState=system;if(!system)return false;
  if(system.engineError)return true;
  const canvas=document.getElementById('orreryCanvas'),rect=canvas.getBoundingClientRect();
  return body.dataset.viewCode==='ready'&&system.active&&system.bodies.length===9
    &&system.backend.includes('WebGL2')&&canvas.checkVisibility()&&rect.width>0&&rect.height>0;
}

// An owned context keeps touch emulation and deliberate selection changes out of
// the existing scene/coverage page. Trusted CDP input exercises native dispatch.
export async function verifyTouchGestures(browser,url,directory,{backend,fixedUnixMs}){
  const evidence={status:'failed',scope:'Trusted Chromium touch dispatch under mobile emulation; not physical-device acceptance.',cases:[],errors:[],offOriginRequests:[]};
  assert.equal(new URL(url).hostname,'127.0.0.1','Touch probe requires the owned loopback preview');
  assert(browser.process()?.spawnargs.includes('--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'),
    'Touch probe requires the normal browser suite DNS guard');
  fs.mkdirSync(directory,{recursive:true});
  const context=await browser.createBrowserContext();let page,session,timer,primaryError,read;
  try{
    page=await context.newPage();
    await page.setBypassServiceWorker(true);
    await page.setViewport({width:390,height:844,deviceScaleFactor:2,isMobile:true,hasTouch:true});
    await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
    await page.evaluateOnNewDocument(unix=>{
      const NativeDate=Date;
      globalThis.Date=class extends NativeDate{constructor(...args){super(...(args.length?args:[unix]));}static now(){return unix;}};
      globalThis.__solTouchTrace=[];globalThis.__solTouchSelections=[];
      for(const type of ['pointerdown','pointermove','pointerup','pointercancel','gotpointercapture','lostpointercapture'])
        document.addEventListener(type,event=>{
          if(__solTouchTrace.length>=512)throw Error('Touch trace limit exceeded');
          __solTouchTrace.push({type,target:event.target.id,id:event.pointerId,pointerType:event.pointerType,
            trusted:event.isTrusted,x:event.clientX,y:event.clientY});
        },true);
      window.addEventListener('sol:object-selected',event=>{
        if(__solTouchSelections.length>=32)throw Error('Selection trace limit exceeded');
        __solTouchSelections.push({surface:event.detail?.surface,selected:globalThis.__solTouchState?.selected});
      });
    },fixedUnixMs);
    const origin=new URL(url).origin;
    page.on('request',request=>{
      const target=new URL(request.url());
      if(target.origin!==origin&&target.protocol!=='data:')evidence.offOriginRequests.push(target.origin+target.pathname);
    });
    page.on('pageerror',error=>evidence.errors.push(error.message));
    page.on('console',message=>{if(message.type()==='error')evidence.errors.push(message.text());});
    session=await page.createCDPSession();
    await session.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
    const frame=()=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    read=()=>page.evaluate(()=>{
      const state=__solTouchState;
      return {camera:{az:state.az,el:state.el,radius:state.radius},epoch:state.renderUnix,
        positions:state.bodies.map(({name,x_au,y_au,z_au})=>({name,x_au,y_au,z_au})),
        selected:state.selected,selectedStar:state.selectedStar?.id??state.selectedStar?.name??null,
        scrollY,selectionCount:__solTouchSelections.length};
    });
    const center=()=>page.$eval('#orreryCanvas',node=>{
      node.scrollIntoView({block:'center',behavior:'instant'});const r=node.getBoundingClientRect();
      const x=r.x+r.width/2,y=r.y+r.height/2;
      return {x,y,width:r.width,height:r.height,visible:node.checkVisibility(),hit:document.elementFromPoint(x,y)===node,touchAction:getComputedStyle(node).touchAction};
    });
    const send=(type,touchPoints)=>session.send('Input.dispatchTouchEvent',{type,touchPoints});
    const point=(id,x,y)=>({id,x,y,radiusX:3,radiusY:3,force:1});
    const trace=()=>page.evaluate(()=>__solTouchTrace.slice());
    const activeContacts=async expected=>{
      const active=new Set();for(const e of await trace())if(e.pointerType==='touch'){
        if(e.type==='pointerdown')active.add(e.id);else if(e.type==='pointerup'||e.type==='pointercancel')active.delete(e.id);
      }
      assert.deepEqual([...active].sort((a,b)=>a-b),[...expected].sort((a,b)=>a-b),'Trusted events must establish the intended live contacts');
    };
    const startContact=async p=>{
      const offset=(await trace()).length;await send('touchStart',[p]);
      const downs=(await trace()).slice(offset).filter(e=>e.type==='pointerdown');
      assert.equal(downs.length,1);assert(downs[0].trusted&&downs[0].pointerType==='touch'&&downs[0].target==='orreryCanvas');
      return downs[0].id;
    };
    const endContact=async(p,id)=>{
      const offset=(await trace()).length;await send('touchEnd',[p]);
      const ups=(await trace()).slice(offset).filter(e=>e.type==='pointerup');
      assert.equal(ups.length,1);assert.equal(ups[0].id,id);assert(ups[0].trusted&&ups[0].pointerType==='touch');
    };
    const runCase=async(name,operation)=>{
      evidence.currentCase=name;
      const p=await center();assert.equal(p.touchAction,'none');
      assert(p.width>0&&p.height>0&&p.visible&&p.hit,`Touch target must be visible and hit-testable: ${JSON.stringify(p)}`);await frame();
      const before=await read();evidence.inFlight={name,before,target:p};const checks=await operation(before,p);await frame();const after=await read();
      assert.equal(after.epoch,before.epoch,`${name}: physical epoch changed`);
      assert.deepEqual(after.positions,before.positions,`${name}: physical positions changed`);
      evidence.cases.push({name,before,after,checks:checks??null});delete evidence.inFlight;
    };
    const work=async()=>{
      await page.goto(url,{waitUntil:'networkidle0',timeout:30000});
      await page.waitForFunction(()=>document.body.dataset.appReady==='true',{timeout:30000});
      await page.click('[data-mode="orrery"]');
      await page.waitForFunction(touchSystemReady,{timeout:30000});
      const startup=await page.evaluate(()=>({code:document.body.dataset.viewCode,message:document.getElementById('viewCodeStatus')?.textContent,error:globalThis.__solTouchState?.engineError}));
      assert.equal(startup.code,'ready',`Touch System code entry failed: ${startup.message}`);
      assert.equal(startup.error,'',`Touch System startup failed: ${startup.error}`);
      await page.evaluate(()=>{const node=document.getElementById('orreryAnimate');node.checked=false;node.dispatchEvent(new Event('change',{bubbles:true}));});
      evidence.capabilities=await withBrowserFeatureStatus(backend,browser,await page.evaluate(captureBrowserCapabilities));assertBrowserBackend(backend,evidence.capabilities);
      evidence.mobile=await page.evaluate(()=>({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,maxTouchPoints:navigator.maxTouchPoints}));
      await runCase('single-finger orbit',async(before,p)=>{
        await send('touchStart',[point(1,p.x+70,p.y)]);await send('touchMove',[point(1,p.x+90,p.y+10)]);await send('touchEnd',[]);
        const after=await read();assert(Math.abs(after.camera.az-before.camera.az+.16)<.01);assert(Math.abs(after.camera.el-before.camera.el-.08)<.01);
        assert.equal(after.camera.radius,before.camera.radius);assert.equal(after.scrollY,before.scrollY);assert.equal(after.selectionCount,before.selectionCount);
      });
      await runCase('stationary two-finger contact',async(before,p)=>{
        await send('touchStart',[point(2,p.x,p.y)]);await send('touchStart',[point(2,p.x,p.y),point(3,p.x+75,p.y)]);await send('touchEnd',[]);
        const after=await read();assert.equal(after.selectionCount,before.selectionCount,'Two contacts must not emit even transient selection intents');
        assert.equal(after.selected,before.selected);assert.equal(after.selectedStar,before.selectedStar);assert.deepEqual(after.camera,before.camera);
      });
      await runCase('pinch and surviving finger',async(before,p)=>{
        const survivor=await startContact(point(4,p.x-40,p.y)),removed=await startContact(point(5,p.x+40,p.y));await activeContacts([survivor,removed]);
        await send('touchMove',[point(4,p.x-60,p.y),point(5,p.x+60,p.y)]);const pinched=await read();
        assert(Math.abs(pinched.camera.radius/before.camera.radius-2/3)<.01);
        await endContact(point(5,p.x+60,p.y),removed);await activeContacts([survivor]);const afterLift=await read();
        // Non-blocking touchmoves are delivered with the next main frame. Drain the
        // pinch's queued frames first so the 5 s bound times input delivery rather
        // than software-GPU frame backlog.
        await frame();
        const offset=(await trace()).length;await send('touchMove',[point(4,p.x-40,p.y)]);
        await page.waitForFunction(({offset,id})=>__solTouchTrace.slice(offset).some(e=>e.type==='pointermove'&&e.id===id),
          {timeout:5000},{offset,id:survivor});
        const moves=(await trace()).slice(offset).filter(e=>e.type==='pointermove');assert.equal(moves.length,1);assert.equal(moves[0].id,survivor);assert(moves[0].trusted);
        const after=await read();assertSurvivingPointerMotion(afterLift.camera,after.camera,20);
        assert.equal(after.camera.radius,pinched.camera.radius);assert.equal(after.selectionCount,before.selectionCount);
        await endContact(point(4,p.x-40,p.y),survivor);await activeContacts([]);
        return {survivor,removed,pinched:pinched.camera,afterLift:afterLift.camera,afterMove:after.camera,expectedDeltaX:20};
      });
      await runCase('added contacts preserve drag and pinch',async(before,p)=>{
        const first=await startContact(point(20,p.x+50,p.y));await send('touchMove',[point(20,p.x+60,p.y)]);
        const second=await startContact(point(21,p.x,p.y));await activeContacts([first,second]);await endContact(point(21,p.x,p.y),second);await activeContacts([first]);
        assert.equal((await read()).selectionCount,before.selectionCount,'Adding a finger must not rearm a drag');
        const nextSecond=await startContact(point(22,p.x+80,p.y));await activeContacts([first,nextSecond]);const prePinch=await read();await send('touchMove',[point(22,p.x+100,p.y)]);
        const pinched=await read();assert(Math.abs(pinched.camera.radius/prePinch.camera.radius-.5)<.001,'A real two-contact pinch must zoom before adding the third finger');
        const third=await startContact(point(23,p.x,p.y));await activeContacts([first,nextSecond,third]);await endContact(point(23,p.x,p.y),third);await activeContacts([first,nextSecond]);
        await endContact(point(22,p.x+100,p.y),nextSecond);await activeContacts([first]);await endContact(point(20,p.x+60,p.y),first);await activeContacts([]);
        assert.equal((await read()).selectionCount,before.selectionCount,'A third contact must not rearm a pinch');
        return {first,second,nextSecond,third,prePinch:prePinch.camera,pinched:pinched.camera};
      });
      await runCase('cancel then fresh drag',async(before,p)=>{
        await send('touchStart',[point(6,p.x+70,p.y)]);await send('touchCancel',[]);
        await send('touchStart',[point(7,p.x+70,p.y)]);await send('touchMove',[point(7,p.x+90,p.y)]);await send('touchEnd',[]);
        const after=await read();assert(Math.abs(after.camera.az-before.camera.az+.16)<.01);assert.equal(after.camera.radius,before.camera.radius);
      });
      await runCase('view exit during contact',async(_before,p)=>{
        await send('touchStart',[point(8,p.x+70,p.y)]);await page.focus('[data-mode="sky"]');await page.keyboard.press('Enter');
        await page.waitForFunction(()=>!__solTouchState.active);await send('touchEnd',[]);
        await page.focus('[data-mode="orrery"]');await page.keyboard.press('Enter');await page.waitForFunction(()=>__solTouchState.active&&__solTouchState.bodies.length===9);
        p=await center();await frame();const before=await read();
        await send('touchStart',[point(9,p.x+70,p.y)]);await send('touchMove',[point(9,p.x+90,p.y)]);await send('touchEnd',[]);
        const after=await read();assert(Math.abs(after.camera.az-before.camera.az+.16)<.01,'Returning must not interpret one finger as a stale pinch');assert.equal(after.camera.radius,before.camera.radius);
      });
      await runCase('fresh single-finger tap selects Sun',async(before,p)=>{
        await send('touchStart',[point(10,p.x,p.y)]);await send('touchEnd',[]);const after=await read();
        assert.equal(after.selected,'Sun');assert.equal(after.selectionCount,before.selectionCount+1,'Positive tap must prove the selection observer is live');
      });
      evidence.events=await page.evaluate(()=>__solTouchTrace);evidence.selections=await page.evaluate(()=>__solTouchSelections);
      assert(evidence.events.some(event=>event.pointerType==='touch'&&event.trusted));assert.deepEqual(evidence.errors,[]);assert.deepEqual(evidence.offOriginRequests,[]);
      delete evidence.currentCase;evidence.status='passed';
    };
    await Promise.race([work(),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Touch gesture probe exceeded 120000ms')),120000);})]);
    return evidence;
  }catch(error){
    primaryError=error;
    evidence.failure={message:error.message,stack:error.stack};
    if(page&&!page.isClosed())try{
      if(read)evidence.finalState=await read();
      evidence.events=await page.evaluate(()=>globalThis.__solTouchTrace);evidence.selections=await page.evaluate(()=>globalThis.__solTouchSelections);
      await page.screenshot({path:path.join(directory,'failure.png'),fullPage:false});
    }catch(failure){evidence.captureError=failure.message;}
    throw error;
  }finally{
    clearTimeout(timer);let closeTimer,cleanupError;
    try{
      await Promise.race([context.close(),new Promise((_,reject)=>{closeTimer=setTimeout(()=>reject(Error('Touch context cleanup exceeded 10000ms')),10000);})]);
      evidence.contextClosed=true;
    }catch(error){
      evidence.status='failed';evidence.contextClosed=false;evidence.cleanupError=error.message;
      if(primaryError)primaryError.message+='; touch cleanup: '+error.message;else cleanupError=error;
    }finally{
      clearTimeout(closeTimer);
      const lateProblems=[...evidence.errors,...evidence.offOriginRequests.map(url=>'Off-origin request: '+url)];
      if(lateProblems.length){
        evidence.status='failed';const error=Error('Touch runtime errors through context close: '+lateProblems.join('; '));
        if(primaryError)primaryError.message+='; '+error.message;
        else if(cleanupError)cleanupError.message+='; '+error.message;else cleanupError=error;
      }
      try{fs.writeFileSync(path.join(directory,'touch-gestures.json'),JSON.stringify(evidence,null,2)+'\n');}
      catch(error){if(primaryError)primaryError.message+='; touch evidence write: '+error.message;else if(cleanupError)cleanupError.message+='; touch evidence write: '+error.message;else throw error;}
    }
    if(cleanupError)throw cleanupError;
  }
}
