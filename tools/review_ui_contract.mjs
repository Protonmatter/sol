import assert from 'node:assert/strict';

// Exercise the real modal and native keyboard scrolling on short viewports.
export async function assertTourViewport(page) {
  const viewport=page.viewport(),focus=await page.evaluateHandle(()=>document.activeElement);
  const seen=await page.evaluate(()=>{try{return localStorage.getItem('sol-tour-seen');}catch{return null;}});
  const rows=[];
  const frame=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  try {
    for(const [width,height] of [[390,844],[844,390],[320,256]]){
      await page.setViewport({...viewport,width,height});
      await page.focus('#tourStart');await page.keyboard.press('Enter');
      await page.waitForFunction(()=>!document.getElementById('tourLayer').hidden);
      for(let step=0;step<7;step++){
        await frame();
        const row=await page.evaluate(()=>{
          const card=document.getElementById('tourCard'),r=card.getBoundingClientRect();
          return {step:document.getElementById('tourStepCount').textContent,
            rect:{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height},
            mainInert:document.querySelector('main.app-shell').inert,scrollHeight:card.scrollHeight,clientHeight:card.clientHeight};
        });
        assert.equal(row.step,`Step ${step+1} of 7`);
        assert.equal(row.mainInert,true,'The tour must retain modal background isolation');
        assert.ok(row.rect.x>=0&&row.rect.y>=0&&row.rect.right<=width+.1&&row.rect.bottom<=height+.1,
          `Tour card outside ${width}x${height}: ${JSON.stringify(row)}`);
        await page.focus('#tourNext');
        const button=await page.$eval('#tourNext',n=>{
          const r=n.getBoundingClientRect(),host=document.getElementById('tourCard'),card=host.getBoundingClientRect();
          const x=r.x+r.width/2,y=r.y+r.height/2,hit=document.elementFromPoint(x,y);
          const style=getComputedStyle(n),outlineWidth=parseFloat(style.outlineWidth),outlineOffset=parseFloat(style.outlineOffset),spread=outlineWidth+outlineOffset;
          const ink={top:r.top-spread,bottom:r.bottom+spread,left:r.left-spread,right:r.right+spread};
          const clip={top:card.top+host.clientTop,bottom:card.top+host.clientTop+host.clientHeight,left:card.left+host.clientLeft,right:card.left+host.clientLeft+host.clientWidth};
          return {focused:document.activeElement===n,visible:r.top>=Math.max(0,card.top)&&r.bottom<=Math.min(innerHeight,card.bottom),hit:hit===n||n.contains(hit),
            focusVisible:n.matches(':focus-visible'),outlineWidth,outlineOffset,outlineStyle:style.outlineStyle,ink,clip,
            inkUnclipped:ink.top>=clip.top-.5&&ink.bottom<=clip.bottom+.5&&ink.left>=clip.left-.5&&ink.right<=clip.right+.5,
            rect:{top:r.top,bottom:r.bottom,left:r.left,right:r.right},card:{top:card.top,bottom:card.bottom},viewport:[innerWidth,innerHeight]};
        });
        assert.ok(button.focused&&button.visible&&button.hit&&button.focusVisible&&button.outlineWidth>0
          &&button.outlineStyle!=='none'&&button.inkUnclipped,`Keyboard-focused tour action and outline must remain visible and unobscured: ${JSON.stringify({step,...button})}`);
        rows.push({viewport:[width,height],...row,action:button});
        if(step<6)await page.keyboard.press('Enter');
      }
      await page.focus('#tourNext');await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'tourSkip','Forward Tab wraps inside the modal');
      await page.keyboard.down('Shift');await page.keyboard.press('Tab');await page.keyboard.up('Shift');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'tourNext','Reverse Tab wraps inside the modal');
      await page.keyboard.press('Escape');
      assert.equal(await page.evaluate(()=>document.activeElement.id),'tourStart','Escape restores the tour invoker');
    }
    assert.ok(rows.some(r=>r.viewport[1]===256&&r.scrollHeight>r.clientHeight),'The short viewport must exercise actual card overflow');
    return {status:'passed',steps:rows};
  } finally {
    await page.keyboard.up('Shift');
    if(await page.$eval('#tourLayer',n=>!n.hidden))await page.keyboard.press('Escape');
    await page.evaluate(value=>{try{if(value===null)localStorage.removeItem('sol-tour-seen');else localStorage.setItem('sol-tour-seen',value);}catch{}},seen);
    if(viewport)await page.setViewport(viewport);
    await focus.evaluate(n=>{if(n.isConnected&&n.checkVisibility())n.focus();});await focus.dispose();
  }
}

// Reduced motion must not start a transition on ordinarily immediate scene
// coordinates. Read the new box in the same task as the style write: waiting
// for a frame would conceal the stale placement this regression detects.
export async function assertReducedMotionPlacement(page) {
  const metrics=await page.evaluate(()=>{
    const host=document.createElement('div'),label=document.createElement('span');
    host.setAttribute('aria-hidden','true');
    host.style.cssText='position:fixed;left:-10000px;top:-10000px;width:320px;height:100px;opacity:0;pointer-events:none;';
    label.className='orrery-label';label.textContent='Moon';
    label.style.cssText='left:8px;top:8px;transform:none;width:max-content;';
    host.appendChild(label);document.body.appendChild(host);
    const box=()=>{const {x,y,width,height}=label.getBoundingClientRect();return {x,y,width,height};};
    try {
      const reducedMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
      const before=box();
      label.style.left='168px';label.style.top='48px';
      const after=box(),style=getComputedStyle(label);
      return {reducedMotion,before,after,expectedDelta:{x:160,y:40},
        inline:{left:label.style.left,top:label.style.top},
        computed:{left:style.left,top:style.top,transitionDuration:style.transitionDuration,transitionProperty:style.transitionProperty},
        activeTransitions:label.getAnimations().filter(a=>a instanceof CSSTransition).length};
    } finally {host.remove();}
  });
  const message=`Reduced motion must apply scene label coordinates immediately: ${JSON.stringify(metrics)}`;
  assert.equal(metrics.reducedMotion,true,message);
  assert.ok(metrics.before.width>0&&metrics.before.height>0&&metrics.after.width>0&&metrics.after.height>0,message);
  assert.ok(Math.abs(metrics.after.x-metrics.before.x-metrics.expectedDelta.x)<=.1
    &&Math.abs(metrics.after.y-metrics.before.y-metrics.expectedDelta.y)<=.1,message);
  assert.equal(metrics.activeTransitions,0,message);
  return metrics;
}

// A keyboard-operable scene must retain visible outline ink inside clipping
// containers. Measure the actual cascade/geometry, rather than matching CSS text.
export async function assertSceneCanvasFocus(page, selector, screenshotPath) {
  await page.keyboard.press('Tab');
  await page.focus(selector);
  // Focus/style invalidation can still expose the preceding outline in the same
  // task. Observe after a completed rendering opportunity, with no fixed sleep.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  if (screenshotPath) await page.screenshot({path:screenshotPath,fullPage:false});
  const metrics = await page.$eval(selector, node => {
    const style = getComputedStyle(node), rect = node.getBoundingClientRect();
    const width = parseFloat(style.outlineWidth), spread = width + parseFloat(style.outlineOffset);
    const ink = {left:rect.left-spread,right:rect.right+spread,top:rect.top-spread,bottom:rect.bottom+spread};
    const clipped = [];
    for (let parent=node.parentElement; parent; parent=parent.parentElement) {
      const css=getComputedStyle(parent),box=parent.getBoundingClientRect();
      const left=box.left+parent.clientLeft,top=box.top+parent.clientTop;
      const clipX=/(hidden|clip|scroll|auto)/.test(css.overflowX);
      const clipY=/(hidden|clip|scroll|auto)/.test(css.overflowY);
      if ((clipX&&(ink.left<left-.5||ink.right>left+parent.clientWidth+.5))
          ||(clipY&&(ink.top<top-.5||ink.bottom>top+parent.clientHeight+.5))) {
        clipped.push({tag:parent.tagName,id:parent.id,className:parent.className,
          overflowX:css.overflowX,overflowY:css.overflowY});
      }
    }
    const focusRules=[];
    const visitRules=rules=>{for(const rule of rules){
      if(rule.selectorText?.includes('focus'))focusRules.push(rule.cssText);
      if(rule.cssRules)visitRules(rule.cssRules);
    }};
    const stylesheets=Array.from(document.styleSheets,sheet=>{
      try{visitRules(sheet.cssRules);return {href:sheet.href,rules:sheet.cssRules.length,disabled:sheet.disabled};}
      catch(error){return {href:sheet.href,error:String(error)};}
    });
    return {focused:document.activeElement===node,focusVisible:node.matches(':focus-visible'),
      outlineStyle:style.outlineStyle,outlineWidth:width,outlineOffset:parseFloat(style.outlineOffset),
      outlineColor:style.outlineColor,inlineStyle:node.getAttribute('style'),focusRules,stylesheets,
      clipped,viewport:{width:innerWidth,height:innerHeight}};
  });
  assert.ok(metrics.focused&&metrics.focusVisible,'scene canvas must expose actual keyboard focus');
  assert.ok(metrics.outlineWidth>0&&metrics.outlineStyle!=='none'
    &&metrics.outlineColor!=='transparent'&&!/^rgba\(.*,[\s]*0\)$/.test(metrics.outlineColor),
    `scene canvas needs visible outline ink: ${JSON.stringify(metrics)}`);
  assert.deepEqual(metrics.clipped,[],`scene canvas focus outline must survive ancestor clipping: ${JSON.stringify(metrics)}`);
  return metrics;
}

export function assertManifestRequestIdentity(requests) {
  const manifest = requests.filter(url => new URL(url).pathname.endsWith('/js/visualAssetManifest.js'));
  assert.equal(manifest.length, 1, `visual inventory must load once through its exact import URL: ${JSON.stringify(manifest)}`);
  return manifest;
}

// Real mobile layout and native disclosure, with an isolated waiting-worker fixture.
// Production activation/identity checks execute without installing or activating a worker.
export async function assertMobileOfflineUpdate(page) {
  const viewport = page.viewport();
  let primaryError;
  try {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.evaluate(async () => {
      const entry = document.querySelector('script[type="module"][src^="app.js"]');
      // Reuse the exact entry. New shells defer installation until the image
      // paints; wait until native registration captures its original DOM owners.
      const app=await import(entry.src);
      if(app.offlineStartup){
        let timer;
        try{await Promise.race([app.offlineStartup,new Promise((_,reject)=>{timer=setTimeout(()=>reject(new Error('Native offline startup did not capture its controls')),30000);})]);}
        finally{clearTimeout(timer);}
      }
      const { registerOfflineRelease } = await import(`./js/releaseClient.js${new URL(entry.src).search}`);
      const realButton = document.getElementById('releaseUpdate'), realStatus = document.getElementById('releaseStatus');
      const menu = realButton.closest('details'), savedOpen = menu.open;
      const button = realButton.cloneNode(true), status = realStatus.cloneNode(true);
      const messages = [], navigations = [], listeners = {};
      const fixture = { messages, navigations, listeners, handler: null, phase: 'setup',
        snapshot() { return { phase: this.phase, handlerOwned: button.onclick === this.handler,
          button: { connected: !!button.parentNode, hidden: button.hidden, disabled: button.disabled },
          status: status.textContent, messages: messages.slice(-10).map(m=>({type:m.type,release_id:m.release_id??null})),
          navigations: navigations.slice(-4) }; },
        restore() {
          // Real callbacks may have updated these detached originals meanwhile.
          // Reinsert their latest state; never restore saved handler/text values.
          if (button.parentNode) button.replaceWith(realButton);
          if (status.parentNode) status.replaceWith(realStatus);
          menu.open = savedOpen;
        } };
      // Publish cleanup before partial DOM replacement or awaited setup can fail.
      globalThis.__solReviewUpdate = fixture;
      realButton.replaceWith(button); realStatus.replaceWith(status); button.disabled = false;
      const waiting = { postMessage(message, ports = []) {
        messages.push(message);
        if (message.type === 'GET_RELEASE_ID') ports[0].postMessage({ type: 'RELEASE_ID', release_id: 'review-B', base_path: '/', namespace: 'releases/review-B/' });
      } };
      await registerOfflineRelease({
        serviceWorker: { register: async () => ({ waiting, active: {}, addEventListener() {} }), addEventListener: (type, fn) => { listeners[type] = fn; } },
        location: { hash: '#sky=0,0,0,0', assign: value => navigations.push(value) },
        document, basePath: '/', releaseId: 'review-A',
      });
      fixture.handler = button.onclick; fixture.phase = 'ready';
    });
    const summary = await page.$('.offline-menu summary');
    assert.ok(summary && await summary.isVisible(), 'mobile Offline disclosure must be visible');
    const closed = await summary.boundingBox();
    assert.ok(closed?.height >= 44, 'mobile Offline disclosure retains a 44px touch target');
    await summary.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.$eval('.offline-menu', node => node.open), true, 'keyboard opens native disclosure');
    const button = await page.$('#releaseUpdate');
    assert.ok(await button.isVisible(), 'verified update action is reachable on mobile');
    assert.match(await page.$eval('#releaseStatus', node => node.textContent), /Verified update ready/);
    const geometry = await page.$eval('#releaseUpdate', node => {
      const r = node.getBoundingClientRect();
      return { left: r.left, right: r.right, width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.ok(geometry.left >= 0 && geometry.right <= geometry.width && !geometry.overflow, `mobile update must fit: ${JSON.stringify(geometry)}`);
    await button.click();
    await page.waitForFunction(() => globalThis.__solReviewUpdate.messages.some(m => m.type === 'ACTIVATE_RELEASE'), { polling: 50 });
    const result = await page.evaluate(() => {
      const fixture = globalThis.__solReviewUpdate;
      const before = [...fixture.navigations];
      fixture.listeners.controllerchange();
      return { messages: fixture.messages, before, after: fixture.navigations };
    });
    assert.deepEqual(result.messages.at(-1), { type: 'ACTIVATE_RELEASE', release_id: 'review-B' });
    assert.deepEqual(result.before, []);
    assert.deepEqual(result.after, ['/#sky=0,0,0,0']);
    await summary.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.$eval('.offline-menu', node => node.open), false);
    return { viewport: 390, touchTargetHeight: closed.height, ...result };
  } catch(error) {
    primaryError = error;
    try { error.mobileFixture = await page.evaluate(() => globalThis.__solReviewUpdate?.snapshot() ?? null); }
    catch(failure) { error.mobileFixture = { unavailable: failure.message }; }
    error.message += `; mobile fixture: ${JSON.stringify(error.mobileFixture)}`;
    throw error;
  } finally {
    const cleanupErrors = [];
    try { await page.evaluate(() => {
      try { globalThis.__solReviewUpdate?.restore(); }
      finally { delete globalThis.__solReviewUpdate; }
    }); } catch(error) { cleanupErrors.push(`controls: ${error.message}`); }
    try { await page.setViewport(viewport); } catch(error) { cleanupErrors.push(`viewport: ${error.message}`); }
    if(cleanupErrors.length) {
      if(primaryError) primaryError.message += `; mobile cleanup: ${cleanupErrors.join('; ')}`;
      else throw new Error(`Mobile fixture cleanup failed: ${cleanupErrors.join('; ')}`);
    }
  }
}
