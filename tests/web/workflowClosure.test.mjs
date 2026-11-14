import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';
import {types as utilTypes} from 'node:util';

const files={sky:'sky_validation.mjs',browser:'browser_validation.mjs',physical:'physical_rendering_validation.mjs'};
const owners={sky:['browser','server','redirect'],browser:['workers','browser','server'],physical:['browser','server']};
const errorEvent=message=>({type:()=> 'error',text:()=>message,location:()=>({lineNumber:1})});

// Run each caller's real listeners and finalization, including its receipt writer
// and final throw/output. Only the expensive checks and external I/O are replaced.
function fixture(caller,{runtimeEvent,lateWorkerError=false,alreadyDisposed=false,failOwners=[],primary=false,writeFailure=false,
  rawPrimary=false,primaryValue,rawCleanup=false,cleanupValue}={}) {
  const source=fs.readFileSync(new URL('../../tools/'+files[caller],import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const page=new EventEmitter(),events=[],writes=[],messages=[];
  let snapshot;
  const inject=()=>{if(runtimeEvent)page.emit(runtimeEvent,runtimeEvent==='pageerror'?new Error('late runtime error'):errorEvent('late runtime error'));};
  const close=async name=>{events.push(name);if(name==='browser')inject();if(failOwners.includes(name))throw rawCleanup?cleanupValue:Error(name+' cleanup failed');};
  const browser={close:()=>close('browser')};
  const server=caller==='browser'?{close:()=>close('server')}:
    {close(callback){close('server').then(()=>callback?.(),error=>callback?callback(error):Promise.reject(error));},closeAllConnections(){}};
  const redirectTarget={close(callback){close('redirect').then(()=>callback?.(),error=>callback?callback(error):Promise.reject(error));}};
  const coverage={errors:[],async dispose(){await close('workers');if(lateWorkerError)this.errors.push('late worker coverage error');}};
  if(alreadyDisposed&&lateWorkerError)coverage.errors.push('late worker coverage error');
  const proc={exitCode:undefined};
  const context=vm.createContext({assert,path,utilTypes,page,fixtureBrowser:browser,fixtureServer:server,redirectTarget,
    fixtureCoverage:coverage,alreadyDisposed,fixtureHasPrimary:primary||rawPrimary,fixturePrimary:rawPrimary?primaryValue:primary?new Error('original gate failure'):null,
    startWorkerCoverage:async()=>coverage,waitForWorkerActivityIdle:async()=>{},
    diagnosticPage:{async evaluate(){return {}; }},setTimeout,clearTimeout,
    clearInterval(){},progress:0,timer:0,controller:{abort(){}},phase:'complete',
    out:'/test-owned-output',outputDirectory:'/test-owned-output',
    manifest:{base_path:'/sol/'},immutablePath:'/sol/releases/test/index.html',focus:{},geometry:{},lifecycle:true,
    clipboardFallbacks:[],capturedHash:'#sky=1',roundtrip:true,
    closeOwnedBrowser:async value=>value.close(),
    closeOwnedBrowserVerified:async value=>value.close(),
    console:{log(...args){events.push('message');messages.push(args.join(' '));},error(){}},
    process:proc,
    fs:{writeFileSync(_file,text){events.push('write');if(writeFailure)throw Error('evidence write failed');snapshot=JSON.parse(text);writes.push(snapshot);}},
  });
  vm.runInContext('var evidence={status:"passed",passed:true,errors:[],console_errors:[],checks:[],mockRequests:1};var failures=[];var coverageErrors=[];var validationError=null;',context);
  const save=()=>{events.push('write');if(writeFailure)throw Error('evidence write failed');snapshot=JSON.parse(JSON.stringify(context.evidence));writes.push(snapshot);};
  context.save=save;context.saveEvidence=save;
  let program;
  if(caller==='sky') {
    const declaration=source.match(/^let browser[^\n]*;/m)?.[0];assert.ok(declaration);
    const listener=source.split('\n').find(line=>line.trim().startsWith('page.on("pageerror",'));assert.ok(listener);
    const marker='  assert.deepEqual(evidence.errors,[]);',start=source.lastIndexOf(marker);assert.ok(start>0);
    program=`${declaration}\nbrowser=fixtureBrowser;const server=fixtureServer;${listener}\ntry {if(fixtureHasPrimary)throw fixturePrimary;\n${source.slice(start)}`;
  } else {
    const browserCaller=caller==='browser';
    const marker=browserCaller?'  } finally {\n    clearInterval(progress);':'}finally{\n  clearTimeout(timer);controller.abort();';
    const start=source.lastIndexOf(marker);assert.ok(start>0,'Actual cleanup boundary must exist');
    const end=browserCaller?source.lastIndexOf('\n}\n\nawait main();'):source.length;
    assert.ok(end>start);
    const listenerStart=source.indexOf(browserCaller?'    page.on("pageerror",':"  page.on('pageerror',");
    const listenerEnd=source.indexOf(browserCaller?'    // Page-scoped':"  page.on('requestfailed',",listenerStart);
    assert.ok(listenerStart>0&&listenerEnd>listenerStart);
    const listener=source.slice(listenerStart,listenerEnd);
    let header='let browser=fixtureBrowser,server=fixtureServer,workerCoverage;';
    if(browserCaller){
      const begin=source.indexOf('    workerCoverage=await startWorkerCoverage(');
      const finish=source.indexOf('    console.log("Browser validation: worker coverage armed")',begin);
      assert.ok(begin>0&&finish>begin,'Exercise actual coverage error-reference setup');
      header+=source.slice(begin,finish)+'\nif(alreadyDisposed)workerCoverage=null;';
    }
    page.isClosed=()=>true;
    const catchStart=source.lastIndexOf(browserCaller?'  } catch(error) {':'}catch(error){',start);
    assert.ok(catchStart>0&&catchStart<start,'Exercise the actual primary-error catch');
    program=`${header}\n${listener}\ntry {if(fixtureHasPrimary)throw fixturePrimary;\n${source.slice(catchStart,end)}`;
  }
  return {async run(){let error,didThrow=false;try{await vm.runInContext('(async()=>{'+program+'\n})()',context,{filename:files[caller]});}catch(value){error=value;didThrow=true;}
      return {error,exitCode:didThrow?1:proc.exitCode||0,snapshot,writes,messages,events,evidence:context.evidence};}};
}

for(const caller of Object.keys(files)) {
  for(const runtimeEvent of caller==='sky'?['pageerror']:['pageerror','console'])
    test(`${caller} rejects ${runtimeEvent} arriving during browser cleanup`,async()=>{
      const r=await fixture(caller,{runtimeEvent}).run();
      assert.equal(r.exitCode,1);assert.ok(r.snapshot,'Failure receipt must survive');
      assert.ok(r.snapshot.status==='failed'||r.snapshot.passed===false);
      assert.match(JSON.stringify(r.snapshot),/late runtime error/);
      assert.ok(r.messages.every(message=>!message.startsWith('PASS:')&&!message.startsWith('OK:')));
      for(const name of owners[caller])assert.ok(r.events.indexOf(name)<r.events.lastIndexOf('write'),name+' must close before the final receipt');
    });

  for(const owner of owners[caller])
    test(`${caller} records ${owner} cleanup failure and still attempts every owner`,async()=>{
      const r=await fixture(caller,{failOwners:[owner]}).run();
      assert.equal(r.exitCode,1);assert.ok(r.snapshot);
      assert.equal(r.snapshot.cleanup[owner].status,'failed');
      assert.match(JSON.stringify(r.snapshot),new RegExp(owner+' cleanup failed'));
      for(const name of owners[caller])assert.ok(r.events.includes(name),'cleanup must attempt '+name);
      assert.ok(r.snapshot.status==='failed'||r.snapshot.passed===false);
      assert.equal(r.messages.filter(x=>/^(PASS:|OK:)/.test(x)).length,0);
    });

  test(`${caller} keeps an original gate failure when all cleanup actions fail`,async()=>{
    const r=await fixture(caller,{primary:true,failOwners:owners[caller]}).run();
    assert.equal(r.exitCode,1);assert.ok(r.snapshot);
    assert.match(JSON.stringify(r.snapshot.failure),/original gate failure/);
    if(r.error)assert.match(r.error.message,/original gate failure/);
    for(const name of owners[caller])assert.equal(r.snapshot.cleanup[name].status,'failed');
  });

  test(`${caller} saves clean acceptance only after all owners close`,async()=>{
    const r=await fixture(caller).run();assert.equal(r.exitCode,0,r.error?.stack);
    assert.ok(r.snapshot.status==='passed'||r.snapshot.passed===true);
    for(const name of owners[caller]){
      assert.equal(r.snapshot.cleanup[name].status,'completed');
      assert.ok(r.events.indexOf(name)<r.events.lastIndexOf('write'));
    }
    if(caller!=='physical')assert.ok(r.events.lastIndexOf('write')<r.events.lastIndexOf('message'));
  });

  test(`${caller} does not announce success when final evidence cannot be written`,async()=>{
    const r=await fixture(caller,{writeFailure:true}).run();
    assert.equal(r.exitCode,1);assert.match(r.error.message,/evidence write failed/);
    for(const name of owners[caller])assert.ok(r.events.includes(name));
    assert.equal(r.messages.filter(x=>/^(PASS:|OK:)/.test(x)).length,0);
  });

  test(`${caller} retains falsy thrown gate values as failures`,async()=>{
    for(const primaryValue of [null,undefined,false,0,'']){
      const r=await fixture(caller,{rawPrimary:true,primaryValue}).run();
      assert.equal(r.exitCode,1,'Rejected with '+String(primaryValue));
      assert.ok(r.snapshot.status==='failed'||r.snapshot.passed===false);
      assert.match(JSON.stringify(r.snapshot.failure),/Non-Error rejection/);
      assert.equal(r.messages.filter(x=>/^(PASS:|OK:)/.test(x)).length,0);
    }
  });

  test(`${caller} records falsy cleanup rejections and continues remaining cleanup`,async()=>{
    for(const cleanupValue of [null,undefined,false,0,'']){
      const r=await fixture(caller,{failOwners:['browser'],rawCleanup:true,cleanupValue}).run();
      assert.equal(r.exitCode,1,'Rejected with '+String(cleanupValue));
      assert.equal(r.snapshot.cleanup.browser.status,'failed');
      assert.match(r.snapshot.cleanup.browser.message,/Non-Error rejection/);
      for(const name of owners[caller])assert.ok(r.events.includes(name));
    }
  });
}

test('browser rejects a worker coverage error recorded during fulfilled disposal',async()=>{
  const r=await fixture('browser',{lateWorkerError:true}).run();
  assert.equal(r.exitCode,1);assert.equal(r.snapshot.status,'failed');
  assert.match(JSON.stringify(r.snapshot),/late worker coverage error/);
});

test('browser retains errors from an earlier worker disposal after releasing its owner',async()=>{
  const r=await fixture('browser',{alreadyDisposed:true,lateWorkerError:true}).run();
  assert.equal(r.exitCode,1);assert.equal(r.snapshot.status,'failed');
  assert.equal(r.snapshot.cleanup.workers.status,'already_disposed');
  assert.match(JSON.stringify(r.snapshot),/late worker coverage error/);
  assert.ok(!r.events.includes('workers'),'An already disposed owner must not be disposed again');
});

test('browser accepts a clean earlier worker disposal without repeating it',async()=>{
  const r=await fixture('browser',{alreadyDisposed:true}).run();
  assert.equal(r.exitCode,0);assert.equal(r.snapshot.status,'passed');
  assert.equal(r.snapshot.cleanup.workers.status,'already_disposed');
  assert.ok(!r.events.includes('workers'));
});
