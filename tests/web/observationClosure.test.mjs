import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import vm from 'node:vm';

// Execute the caller's actual catch/finalizer and receipt writer. Browser and
// server I/O are boundaries; physical owned-process retirement is tested by
// verifiedBrowserCleanup.test.mjs and the retained real-browser integration.
function fixture(options={}) {
  const {failures={},primary=false,latePageError=false,noBrowser=false,writeFailure=false,
    caseMode=false,caseFailure=false,caseCloseFailure=false}=options;
  const caseError=Object.hasOwn(options,'caseError')?options.caseError:Error('original case check');
  const caseCloseError=Object.hasOwn(options,'caseCloseError')?options.caseCloseError:Error('context close failed');
  const source=fs.readFileSync(new URL('../../tools/observation_startup_validation.mjs',import.meta.url),'utf8').replace(/\r\n/g,'\n');
  const boundary=source.match(/^} catch\(error\)\{evidence.errors.push\(\{message:String\(error\),stack:error\??\.stack\}\);}/m)?.[0];
  assert.ok(boundary,'Exercise the actual catch/finalizer');
  assert.equal(source.split(boundary).length,2);
  const events=[],writes=[],messages=[],process={};
  const evidence={checks:Array.from({length:4},()=>({status:'passed',page_errors:[]})),errors:[]};
  const action=async owner=>{
    events.push(owner);
    if(owner==='browser'&&latePageError)evidence.checks.at(-1).page_errors.push('late page failure');
    if(Object.hasOwn(failures,owner))throw failures[owner];
  };
  const browser=noBrowser?null:{};
  const server={
    closeAllConnections(){events.push('server_connections');if(Object.hasOwn(failures,'server_connections'))throw failures.server_connections;},
    close(callback){action('server').then(()=>callback(),error=>callback(error));},
  };
  const context=vm.createContext({evidence,browser,server,path,out:'/owned/output',cases:[1,2,3,4],process,
    closeOwnedBrowser:async()=>{try{await action('browser');}catch{/* legacy best-effort helper resolves */}},
    closeOwnedBrowserVerified:async()=>action('browser'),
    fs:{writeFileSync(_file,text){events.push('write');if(writeFailure)throw Error('evidence write failed');writes.push(JSON.parse(text));}},
    console:{log(text){events.push('message');messages.push(JSON.parse(text));}},
    primary,caseFailure,caseError,
    fixtureContext:{async close(){events.push('context');if(caseCloseFailure)throw caseCloseError;}},
  });
  return {async run(){
    let error;
    let program='try {if(primary)throw Error("original check failure");\n'+source.slice(source.indexOf(boundary));
    if(caseMode){
      const marker="      console.log(JSON.stringify({name,status:'passed',image_requests:imageRequests,trusted_retries:final.retries.length}));";
      assert.equal(source.split(marker).length,2,'Retain the real per-case catch/finalizer');
      const start=source.indexOf('\n    }',source.indexOf(marker));assert.ok(start>0);
      program='try {for(const name of ["fixture"]){const check=evidence.checks.at(-1),context=fixtureContext;let caseFailed=false;try {if(caseFailure)throw caseError;\n'+source.slice(start);
    }
    try {await vm.runInContext('(async()=>{'+program+'\n})()',context);}
    catch(value){error=value;}
    return {error,exitCode:error?1:process.exitCode??0,evidence,writes,messages,events};
  }};
}

test('observation saves clean acceptance after every cleanup owner',async()=>{
  const r=await fixture().run();assert.equal(r.exitCode,0,r.error?.stack);
  assert.equal(r.writes.length,1);assert.equal(r.writes[0].status,'passed');
  for(const owner of ['browser','server_connections','server']){
    assert.equal(r.writes[0].cleanup[owner].status,'completed');
    assert.ok(r.events.indexOf(owner)<r.events.indexOf('write'));
  }
  assert.ok(r.events.indexOf('write')<r.events.indexOf('message'));
});

test('observation retains an original case assertion when context close also fails',async()=>{
  const r=await fixture({caseMode:true,caseFailure:true,caseCloseFailure:true}).run();
  assert.equal(r.exitCode,1);assert.equal(r.writes[0].status,'failed');
  assert.match(JSON.stringify(r.writes[0].errors),/original case check/);
  assert.match(JSON.stringify(r.writes[0].errors),/context close failed/);
  assert.equal(r.writes[0].checks.at(-1).cleanup.status,'failed');
  assert.ok(r.events.includes('browser')&&r.events.includes('server'));
});

test('observation rejects context cleanup failure after clean case work',async()=>{
  const r=await fixture({caseMode:true,caseCloseFailure:true}).run();
  assert.equal(r.exitCode,1);assert.equal(r.writes[0].status,'failed');
  assert.equal(r.writes[0].checks.at(-1).cleanup.status,'failed');
  assert.match(JSON.stringify(r.writes[0].errors),/context close failed/);
});

test('observation keeps falsy case and context rejections as failed evidence',async()=>{
  for(const value of [null,undefined,false,0,'']){
    for(const options of [{caseFailure:true,caseError:value},{caseCloseFailure:true,caseCloseError:value}]){
      const r=await fixture({caseMode:true,...options}).run();
      assert.equal(r.exitCode,1);assert.equal(r.writes[0].status,'failed');
      assert.ok(r.writes[0].errors.length>0);assert.ok(r.events.includes('server'));
    }
  }
});

for(const owner of ['browser','server_connections','server'])test(`observation retains ${owner} failure and still finalizes`,async()=>{
  const r=await fixture({failures:{[owner]:Error(owner+' failed')}}).run();
  assert.equal(r.exitCode,1);assert.equal(r.writes.length,1);
  assert.equal(r.writes[0].status,'failed');assert.equal(r.writes[0].cleanup[owner].status,'failed');
  assert.match(JSON.stringify(r.writes[0]),new RegExp(owner+' failed'));
  for(const name of ['browser','server_connections','server'])assert.ok(r.events.includes(name));
  assert.equal(r.messages[0].status,'failed');
});

test('observation retains original failure alongside all cleanup failures',async()=>{
  const failures=Object.fromEntries(['browser','server_connections','server'].map(owner=>[owner,Error(owner+' failed')]));
  const r=await fixture({primary:true,failures}).run();
  assert.equal(r.exitCode,1);assert.equal(r.writes[0].status,'failed');
  assert.match(r.writes[0].errors[0].message,/original check failure/);
  for(const owner of Object.keys(failures))assert.equal(r.writes[0].cleanup[owner].status,'failed');
});

test('observation rejects a page error arriving during browser cleanup',async()=>{
  const r=await fixture({latePageError:true}).run();
  assert.equal(r.exitCode,1);assert.equal(r.writes[0].status,'failed');
  assert.match(JSON.stringify(r.writes[0]),/late page failure/);
});

test('observation closes server after launch failure without claiming browser ownership',async()=>{
  const r=await fixture({primary:true,noBrowser:true}).run();
  assert.equal(r.exitCode,1);assert.equal(r.writes[0].cleanup.browser.status,'not_started');
  assert.ok(!r.events.includes('browser'));assert.ok(r.events.includes('server'));
});

test('observation cannot announce success when evidence write fails',async()=>{
  const r=await fixture({writeFailure:true}).run();
  assert.equal(r.exitCode,1);assert.match(r.error.message,/evidence write failed/);
  assert.equal(r.messages.length,0);assert.ok(r.events.includes('server'));
});

test('observation records falsy browser cleanup rejections as failures',async()=>{
  for(const value of [null,undefined,false,0,'']){
    const r=await fixture({failures:{browser:value}}).run();
    assert.equal(r.exitCode,1);assert.equal(r.writes[0].status,'failed');
    assert.equal(r.writes[0].cleanup.browser.status,'failed');assert.ok(r.events.includes('server'));
  }
});
