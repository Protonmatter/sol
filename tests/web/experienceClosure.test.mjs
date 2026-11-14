import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Execute the real browser-check block with browser I/O boundaries. In
// particular, preserve the order of its pre-open read, clicks and assertions.
function timelineDisclosureCheck(mutateOpen){
  const source=fs.readFileSync(new URL('../../tools/experience_validation.mjs',import.meta.url),'utf8');
  const start=source.indexOf('  await page.click("#panelToggle");'),end=source.indexOf('  await page.click("#focusToggle");',start);
  assert.ok(start>0&&end>start);
  const state={wavelength:'model',timelineIndex:-1,playTimer:0,liveEngineRun:false,bundle:{id:'fixed'}},layout={open:false,active:''};
  let opened=false;
  const context=vm.createContext({assert,token:'?fixed',innerWidth:1440,innerHeight:900});
  const page={
    async click(selector){
      if(selector==='#timelineToggle'){
        layout.open=!layout.open;layout.active='journeyTitle';
        if(!opened&&layout.open){opened=true;if(mutateOpen==='frame')state.timelineIndex=2;if(mutateOpen==='playback')state.playTimer=123;}
      }else if(selector==='#timelineClose'){layout.open=false;layout.active='timelineToggle';}
    },
    async evaluate(fn){
      if(String(fn).includes('import('))return JSON.stringify(state);
      context.document={activeElement:{id:layout.active}};
      return vm.runInContext(`(${fn.toString()})()`,context);
    },
    async $eval(selector,fn){
      context.node={hidden:selector==='#timeline'?!layout.open:false,inert:false,getBoundingClientRect:()=>({top:20,bottom:300,left:10,right:700,width:690,height:280})};
      context.document={getElementById:()=>({getBoundingClientRect:()=>({width:120,height:44})})};
      return vm.runInContext(`(${fn.toString()})(node)`,context);
    },
  };
  context.page=page;
  return vm.runInContext(`(async()=>{${source.slice(start,end)}})()`,context);
}
test('actual timeline browser checks preserve a valid open/close sequence',async()=>{await timelineDisclosureCheck();});
for(const mutation of ['frame','playback'])test(`actual timeline browser checks reject an opening ${mutation} mutation`,async()=>{
  await assert.rejects(timelineDisclosureCheck(mutation),/timeline.*(?:model|frame|playback)|opening/i);
});

// Execute the real listener and final caller control flow. Replace only the
// expensive interaction body and browser/server I/O, retaining catch/finally,
// result serialization, acceptance ordering and error propagation unchanged.
function fixture({duringRead=false,duringClose=false,browserFailure=false,serverFailure=false,primaryFailure=false,captureOnly=false}={}) {
  const source=fs.readFileSync(new URL('../../tools/experience_validation.mjs',import.meta.url),'utf8');
  const marker='  diagnostics.interactions=await page.evaluate(()=>window.__solQaInteractions||[]);';
  assert.equal(source.split(marker).length,2);
  const declaration=source.match(/^let browser,page[^\n]*;/m)?.[0];
  const listener=source.split('\n').find(line=>line.trim().startsWith('page.on("pageerror",'));
  assert.ok(declaration&&listener,'Production ownership and runtime listener must be exercised');
  const page=new EventEmitter(),writes=[],messages=[],events=[];
  page.evaluate=async()=>{events.push('read');if(duringRead)page.emit('pageerror',new Error('late final-read error'));return [];};
  page.isClosed=()=>true;
  const browser={async close(){events.push('browser-close');if(duringClose)page.emit('pageerror',new Error('late browser-close error'));if(browserFailure)throw Error('browser close failed');}};
  const server={close(callback){events.push('server-close');if(serverFailure)callback(Error('server close failed'));else callback();}};
  const context=vm.createContext({assert,path,captureOnly,fixtureBrowser:browser,fixturePage:page,server,
    out:'/test-owned-output',fixturePrimary:primaryFailure,
    fs:{writeFileSync(file,text){events.push('write');writes.push({file,value:JSON.parse(text)});}},
    process:{stdout:{write(text){events.push('message');messages.push(text);}}}});
  vm.runInContext('var diagnostics={console:[],checks:[]};',context);
  const program=`(async()=>{${declaration}\nbrowser=fixtureBrowser;page=fixturePage;${listener}\ntry {if(fixturePrimary)throw Error('original interaction failure');\n${source.slice(source.indexOf(marker))}\n})()`;
  return {execute:()=>vm.runInContext(program,context,{filename:'experience_validation.mjs'}),writes,messages,events,
    diagnostics:()=>context.diagnostics};
}

for(const [name,options,message] of [
  ['final asynchronous state read',{duringRead:true},'late final-read error'],
  ['browser shutdown',{duringClose:true},'late browser-close error'],
])test(`experience rejects a runtime error during ${name} and saves it after cleanup`,async()=>{
  const f=fixture(options);
  await assert.rejects(f.execute(),new RegExp(message));
  assert.equal(f.writes.length,1);
  assert.equal(f.writes[0].value.console[0].message,message);
  assert.match(f.writes[0].value.failure.message,/browser errors/);
  assert.equal(f.messages.length,0,'No success output can precede final acceptance');
  assert.ok(!f.writes[0].value.checks.some(row=>row.result==='passed'));
  assert.ok(f.events.indexOf('browser-close')<f.events.indexOf('write'));
  assert.ok(f.events.indexOf('server-close')<f.events.indexOf('write'));
});

for(const [name,options,message] of [
  ['browser',{browserFailure:true},'browser close failed'],
  ['server',{serverFailure:true},'server close failed'],
])test(`experience preserves ${name} shutdown failure and attempts all cleanup`,async()=>{
  const f=fixture(options);
  await assert.rejects(f.execute(),new RegExp(message));
  assert.equal(f.writes.length,1);
  assert.match(f.writes[0].value.failure.message,new RegExp(message));
  assert.ok(f.events.includes('browser-close')&&f.events.includes('server-close'));
  assert.ok(f.events.indexOf('server-close')<f.events.indexOf('write'));
  assert.equal(f.messages.length,0);
});

test('experience retains the original interaction failure when shutdown also fails',async()=>{
  const f=fixture({primaryFailure:true,browserFailure:true,serverFailure:true});
  await assert.rejects(f.execute(),/original interaction failure/);
  assert.equal(f.writes.length,1);
  assert.equal(f.writes[0].value.failure.message,'original interaction failure');
  assert.equal(f.writes[0].value.cleanup.browser.status,'failed');
  assert.equal(f.writes[0].value.cleanup.server.status,'failed');
  assert.equal(f.messages.length,0);
});

test('experience accepts clean work only after browser/server closure and evidence write',async()=>{
  const f=fixture();await f.execute();
  assert.equal(f.writes.length,1);
  assert.equal(f.writes[0].value.checks.at(-1).result,'passed');
  assert.ok(f.events.indexOf('browser-close')<f.events.indexOf('write'));
  assert.ok(f.events.indexOf('server-close')<f.events.indexOf('write'));
  assert.ok(f.events.indexOf('write')<f.events.indexOf('message'));
  assert.match(f.messages[0],/^PASS:/);
});

test('experience capture-only keeps diagnostic errors without claiming acceptance',async()=>{
  const f=fixture({captureOnly:true,duringRead:true,duringClose:true});await f.execute();
  assert.equal(f.writes[0].value.console.length,2);
  assert.equal(f.writes[0].value.checks.at(-1).result,'capture_only');
  assert.ok(!f.writes[0].value.checks.some(row=>row.result==='passed'));
  assert.match(f.messages[0],/^CAPTURED:/);
  assert.ok(f.events.indexOf('server-close')<f.events.indexOf('write'));
});
