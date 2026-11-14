import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {registerOfflineRelease} from '../../apps/web/js/releaseClient.js';
import {assertMobileOfflineUpdate} from '../../tools/review_ui_contract.mjs';

const toolSource=fs.readFileSync(new URL('../../tools/review_ui_contract.mjs',import.meta.url),'utf8').replaceAll('\r\n','\n');
const functionStart=toolSource.indexOf('export async function assertMobileOfflineUpdate(page)');
const setupStart=toolSource.indexOf('async () => {',functionStart);
const setupEnd=toolSource.indexOf('\n    });\n    const summary =',setupStart);
assert.ok(setupStart>0&&setupEnd>setupStart);
const setupSource=toolSource.slice(setupStart,setupEnd)+'\n}';
const appUrl='https://example.test/sol/app.js?source-control';
const pageEvaluate=(f,fn)=>f.evaluate(fn.toString()).then(value=>value===undefined?undefined:JSON.parse(JSON.stringify(value)));

function fixture({lateRegistration=false,appPending=false,offlinePending=false,replaceFailure=false}={}){
  const menu={open:false,children:[]};let failReplacement=replaceFailure;
  class Node{
    constructor(id){this.id=id;this.hidden=true;this.disabled=false;this.onclick=null;this.textContent='Local preview';this.parentNode=null;}
    closest(){return this.parentNode;}
    cloneNode(deep){assert.equal(deep,true);const node=new Node(this.id);
      for(const key of ['hidden','disabled','textContent'])node[key]=this[key];return node;}
    replaceWith(node){
      if(failReplacement&&this.id==='releaseStatus'){failReplacement=false;throw new Error('status replacement failed');}
      const parent=this.parentNode;assert.ok(parent,'replacement must own a connected node');
      const index=parent.children.indexOf(this);assert.ok(index>=0);parent.children[index]=node;node.parentNode=parent;this.parentNode=null;
    }
  }
  const originalButton=new Node('releaseUpdate'),originalStatus=new Node('releaseStatus');
  menu.children=[originalButton,originalStatus];for(const node of menu.children)node.parentNode=menu;
  const document={querySelector:()=>({src:appUrl}),getElementById:id=>menu.children.find(node=>node.id===id)};
  const nativeMessages=[],registrationListeners={},workerListeners={};
  const waiting={postMessage(message,ports=[]){nativeMessages.push(message);if(message.type==='GET_RELEASE_ID')
    ports[0].postMessage({type:'RELEASE_ID',release_id:'native-A',base_path:'/sol/',namespace:'releases/native-A/'});}};
  const registration={active:{},waiting:null,installing:{state:'installed',addEventListener:(name,fn)=>workerListeners[name]=fn},
    addEventListener:(name,fn)=>registrationListeners[name]=fn};
  let resolveRegistration;const pendingRegistration=new Promise(resolve=>{resolveRegistration=resolve;});
  let resolveOffline,beginOffline;
  const offlineStartup=offlinePending?new Promise(resolve=>{resolveOffline=resolve;}):Promise.resolve();
  const register=()=>registerOfflineRelease({serviceWorker:{register:()=>lateRegistration?pendingRegistration:Promise.resolve(registration),addEventListener(){}},
    document,location:{hash:'#real',assign:()=>assert.fail('No real navigation allowed')},basePath:'/sol/',releaseId:'native-A'});
  const nativeStartup=offlinePending?new Promise(resolve=>{beginOffline=()=>{const pending=register();resolveOffline();resolve(pending);};}):register();
  let resolveApp;const appGate=appPending?new Promise(resolve=>{resolveApp=resolve;}):Promise.resolve();
  const imports=[],context=vm.createContext({document,URL,setTimeout,clearTimeout});
  const dependencies=new Map();
  async function evaluate(source){
    const module=new vm.SourceTextModule(`export default ${source}`,{context,importModuleDynamically:async specifier=>{
      imports.push(specifier);
      assert.ok([appUrl,'./js/releaseClient.js?source-control'].includes(specifier),specifier);
      if(specifier===appUrl)await appGate;
      if(!dependencies.has(specifier)){
        const names=specifier===appUrl?['offlineStartup']:['registerOfflineRelease'];
        const dependency=new vm.SyntheticModule(names,function(){this.setExport(names[0],specifier===appUrl?offlineStartup:registerOfflineRelease);},{context});
        await dependency.link(()=>assert.fail('No synthetic dependency'));await dependency.evaluate();dependencies.set(specifier,dependency);
      }
      return dependencies.get(specifier);
    }});
    await module.link(()=>assert.fail('Fixture callback is self-contained'));await module.evaluate();return module.namespace.default();
  }
  const setup=()=>evaluate(setupSource);
  async function interleave(kind){
    registration.waiting=waiting;
    if(kind==='late-register-resolution'){resolveRegistration(registration);await nativeStartup;}
    else if(kind==='updatefound-statechange'){registrationListeners.updatefound();workerListeners.statechange();}
  }
  return {menu,document,originalButton,originalStatus,nativeMessages,nativeStartup,registration,imports,context,setup,evaluate,interleave,
    resolveApp:()=>resolveApp?.(),resolveRegistration:()=>resolveRegistration(registration),beginOffline:()=>{const start=beginOffline;beginOffline=null;start?.();}};
}

for(const race of ['none','late-register-resolution','updatefound-statechange']){
  test(`mobile mock owns cloned controls and preserves latest startup state: ${race}`,async()=>{
    const f=fixture({lateRegistration:race==='late-register-resolution'});
    if(race!=='late-register-resolution')await f.nativeStartup;
    await f.setup();const mock=f.context.__solReviewUpdate;
    const fixtureButton=f.document.getElementById('releaseUpdate');
    assert.notEqual(fixtureButton,f.originalButton,'real callbacks must retain separate nodes');
    if(race!=='none')await f.interleave(race);
    const latestHandler=f.originalButton.onclick,latestText=f.originalStatus.textContent;
    await fixtureButton.onclick();
    assert.equal(mock.messages.at(-1).type,'ACTIVATE_RELEASE');assert.equal(mock.messages.at(-1).release_id,'review-B');
    assert.equal(f.nativeMessages.length,0,'synthetic consent cannot activate the startup worker');
    mock.restore();mock.restore();
    assert.equal(f.document.getElementById('releaseUpdate'),f.originalButton);
    assert.equal(f.document.getElementById('releaseStatus'),f.originalStatus);
    assert.equal(f.originalButton.onclick,latestHandler);assert.equal(f.originalStatus.textContent,latestText);
    assert.equal(f.menu.open,false);
  });
}

test('the exact original app evaluation completes before fixture controls are replaced',async()=>{
  const f=fixture({appPending:true});await f.nativeStartup;
  const pending=f.setup();let settled=false;pending.then(()=>{settled=true;},()=>{settled=true;});
  await new Promise(resolve=>setImmediate(resolve));await new Promise(resolve=>setImmediate(resolve));
  try{
    assert.equal(settled,false);assert.equal(f.document.getElementById('releaseUpdate'),f.originalButton);
    assert.ok(f.imports.includes(appUrl));
  }finally{f.resolveApp();await pending;f.context.__solReviewUpdate?.restore();}
});

test('deferred native startup captures original controls before fixture replacement',async()=>{
  const f=fixture({offlinePending:true,lateRegistration:true}),pending=f.setup();let settled=false;
  pending.then(()=>{settled=true;},()=>{settled=true;});await new Promise(resolve=>setImmediate(resolve));
  try{
    assert.equal(settled,false);assert.equal(f.document.getElementById('releaseUpdate'),f.originalButton);
    f.beginOffline();await pending;
    assert.notEqual(f.document.getElementById('releaseUpdate'),f.originalButton);
    await f.interleave('late-register-resolution');
    await f.document.getElementById('releaseUpdate').onclick();assert.equal(f.nativeMessages.length,0);
    f.context.__solReviewUpdate.restore();assert.equal(f.document.getElementById('releaseUpdate'),f.originalButton);
  }finally{f.beginOffline();f.resolveRegistration();await f.nativeStartup;f.context.__solReviewUpdate?.restore();}
});

test('partial setup failure restores originals through the real helper finally',async()=>{
  const f=fixture({replaceFailure:true});await f.nativeStartup;const view={width:1280,height:900},viewports=[];
  const page={viewport:()=>view,setViewport:async value=>viewports.push(value),evaluate:fn=>pageEvaluate(f,fn)};
  await assert.rejects(assertMobileOfflineUpdate(page),/status replacement failed/);
  assert.equal(f.document.getElementById('releaseUpdate'),f.originalButton);
  assert.equal(f.document.getElementById('releaseStatus'),f.originalStatus);
  assert.equal(f.context.__solReviewUpdate,undefined);assert.equal(viewports.at(-1),view);
});

test('fixture failure retains synthetic state before restoration and preserves the original error',async()=>{
  const f=fixture();await f.nativeStartup;const failure=new Error('mobile activation predicate failed');
  const originalView={width:1280,height:900};let pressed=false;
  const summary={isVisible:async()=>true,boundingBox:async()=>({height:48}),focus:async()=>{}};
  const page={viewport:()=>originalView,setViewport:async()=>{},evaluate:fn=>pageEvaluate(f,fn),
    $:async selector=>selector.includes('summary')?summary:{isVisible:async()=>true,click:async()=>{}},
    keyboard:{press:async()=>{pressed=!pressed;f.menu.open=pressed;}},
    $eval:async(selector)=>selector==='.offline-menu'?f.menu.open:selector==='#releaseStatus'?
      f.document.getElementById('releaseStatus').textContent:{left:0,right:200,width:390,overflow:false},
    waitForFunction:async()=>{throw failure;}};
  await assert.rejects(assertMobileOfflineUpdate(page),error=>error===failure);
  assert.ok(failure.mobileFixture,'failure context must survive fixture deletion');
  assert.equal(failure.mobileFixture.handlerOwned,true);assert.deepEqual(failure.mobileFixture.messages,[]);
  assert.equal(f.context.__solReviewUpdate,undefined);assert.equal(f.document.getElementById('releaseUpdate'),f.originalButton);
});

test('cleanup failures retain the primary error and still attempt viewport restoration',async()=>{
  const f=fixture();await f.nativeStartup;const primary=new Error('summary failed');let evaluations=0,viewportCalls=0;
  const page={viewport:()=>({width:1280,height:900}),
    setViewport:async()=>{if(++viewportCalls===2)throw new Error('viewport closed');},
    evaluate:fn=>{if(++evaluations===3)throw new Error('page closed');return pageEvaluate(f,fn);},
    $:async()=>{throw primary;}};
  try{
    await assert.rejects(assertMobileOfflineUpdate(page),error=>error===primary);
    assert.equal(viewportCalls,2);assert.match(primary.message,/controls: page closed; viewport: viewport closed/);
  }finally{f.context.__solReviewUpdate?.restore();delete f.context.__solReviewUpdate;}
});

test('cleanup failure after a successful fixture cannot report success',async()=>{
  const f=fixture();await f.nativeStartup;let evaluations=0,pressed=false;
  const summary={isVisible:async()=>true,boundingBox:async()=>({height:48}),focus:async()=>{}};
  const page={viewport:()=>({width:1280,height:900}),setViewport:async()=>{},
    evaluate:fn=>{if(++evaluations===3)throw new Error('restore failed');return pageEvaluate(f,fn);},
    $:async selector=>selector.includes('summary')?summary:{isVisible:async()=>true,click:async()=>f.document.getElementById('releaseUpdate').onclick()},
    keyboard:{press:async()=>{pressed=!pressed;f.menu.open=pressed;}},
    $eval:async selector=>selector==='.offline-menu'?f.menu.open:selector==='#releaseStatus'?
      f.document.getElementById('releaseStatus').textContent:{left:0,right:200,width:390,overflow:false},
    waitForFunction:async()=>assert.equal(f.context.__solReviewUpdate.messages.at(-1).type,'ACTIVATE_RELEASE')};
  try{await assert.rejects(assertMobileOfflineUpdate(page),/Mobile fixture cleanup failed: controls: restore failed/);}
  finally{f.context.__solReviewUpdate?.restore();delete f.context.__solReviewUpdate;}
});

test('fixture waits for the exported deferred app registration capture barrier',()=>{
  const source=ts.createSourceFile('app.js',fs.readFileSync(new URL('../../apps/web/app.js',import.meta.url),'utf8'),ts.ScriptTarget.Latest,true,ts.ScriptKind.JS);
  const depths=[];function visit(node,depth=0){
    if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='registerOfflineRelease')depths.push(depth);
    ts.forEachChild(node,child=>visit(child,depth+(ts.isFunctionLike(node)?1:0)));
  }visit(source);assert.deepEqual(depths,[1],'repeated or differently deferred startup requires a new fixture ownership contract');
  const exported=source.statements.filter(ts.isVariableStatement).filter(node=>node.modifiers?.some(item=>item.kind===ts.SyntaxKind.ExportKeyword));
  assert.ok(exported.some(node=>node.declarationList.declarations.some(item=>item.name.getText(source)==='offlineStartup')));
  assert.match(setupSource,/await Promise\.race\(\[app\.offlineStartup/,'fixture must await native capture before DOM replacement');
});
