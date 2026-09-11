import assert from "node:assert/strict";
import test from "node:test";
import { MessageChannel } from "node:worker_threads";
import { registerOfflineRelease, identifyWaitingRelease } from "../../apps/web/js/releaseClient.js";
import {harness,release,origin} from "./helpers/releaseCacheHarness.mjs";

test("A registration with B worker content activates B using verified identity, not script URL",async()=>{
  const b=harness("B",await release("B"));await b.event("install");
  const messages=[],button={hidden:true},status={},listeners={},navigations=[];
  const waiting={scriptURL:origin+"/sol/sw.js?v=A",postMessage(message,ports=[]){messages.push(message);return b.event("message",{data:message,ports,source:{url:origin+"/sol/releases/A/index.html"}});}};
  const registration={waiting,active:{},addEventListener(){}};
  const serviceWorker={register:async()=>registration,addEventListener:(type,fn)=>listeners[type]=fn};
  await registerOfflineRelease({serviceWorker,location:{assign:path=>navigations.push(path)},document:{getElementById:id=>id==="releaseUpdate"?button:status},basePath:"/sol/",releaseId:"A",createChannel:()=>new MessageChannel()});
  assert.equal(button.hidden,false);assert.deepEqual(navigations,[]);
  await button.onclick();await new Promise(resolve=>setImmediate(resolve));
  assert.deepEqual(messages.at(-1),{type:"ACTIVATE_RELEASE",release_id:"B"});assert.deepEqual(b.actions,["skipWaiting"]);
  listeners.controllerchange();assert.deepEqual(navigations,["/sol/"]);
});
test("handshake rejects wrong-scope, unknown identity, and timeout",async()=>{
  for(const packet of [{type:"RELEASE_ID",release_id:"B",base_path:"/wrong/",namespace:"releases/B/"},{type:"wrong"},{type:"RELEASE_ID",release_id:"../x",base_path:"/sol/"}]) {
    await assert.rejects(identifyWaitingRelease({postMessage:(_,ports)=>ports[0].postMessage(packet)},"/sol/",()=>new MessageChannel(),30),/identity/);
  }
  await assert.rejects(identifyWaitingRelease({postMessage(){}},"/sol/",()=>new MessageChannel(),5),/timed out/);
});
