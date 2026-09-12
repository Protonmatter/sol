// Chromium worker instrumentation for the same retained artifact as page coverage.
// Workers are resumed only after precise coverage is armed. Cancellation remains real.
import { TargetCloseError } from "puppeteer-core";

async function bounded(operation, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([Promise.resolve().then(operation), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} deadline exceeded (${timeoutMs} ms)`)), timeoutMs);
    })]);
  } finally { clearTimeout(timer); }
}

// Only a ChildProcess obtained from this launch is eligible for forced cleanup.
// Never discover or terminate other browser processes on the host.
export async function closeOwnedBrowser(browser, { timeoutMs = 10_000, diagnostic = console.warn } = {}) {
  try { await bounded(() => browser.close(), timeoutMs, "browser close"); }
  catch (error) {
    diagnostic(error.message);
    const child = browser.process();
    if (child && child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
}

export async function startWorkerCoverage(page, { timeoutMs = 10_000 } = {}) {
  const parent=await page.createCDPSession(),workers=new Map(),entries=[],errors=[];
  const pending=new Set();
  const send = (session, method, params) => bounded(() => session.send(method, params), timeoutMs, method);
  // Puppeteer rejects pending commands with TargetCloseError before forwarding
  // the matching detach event synchronously. Neither a message containing Target
  // nor detachment alone excuses an instrumentation failure or deadline.
  const cancelled = (record, error) => record.detached && error instanceof TargetCloseError;
  parent.on("Target.attachedToTarget",event=>{
    const work=(async()=>{
      const session=parent.connection().session(event.sessionId);
      if(!session){errors.push(`missing worker session ${event.sessionId}`);return;}
      const record={session,sources:new Map(),detached:false};workers.set(event.sessionId,record);
      try {
        session.on("Debugger.scriptParsed",event=>{
          if(event.url&&!event.url.startsWith("wasm:"))record.sources.set(event.scriptId,{url:event.url,text:null});
        });
        await send(session,"Debugger.enable");await send(session,"Profiler.enable");
        await send(session,"Profiler.startPreciseCoverage",{callCount:true,detailed:true});
      } catch(error){if(!cancelled(record,error))errors.push(error.message);}
      finally{try{await send(session,"Runtime.runIfWaitingForDebugger");}catch(error){if(!cancelled(record,error))errors.push(error.message);}}
    })();
    pending.add(work);work.finally(()=>pending.delete(work));
  });
  parent.on("Target.detachedFromTarget",event=>{
    const record=workers.get(event.sessionId);if(record)record.detached=true;
    workers.delete(event.sessionId);
  });
  await send(parent,"Target.setAutoAttach",{autoAttach:true,waitForDebuggerOnStart:true,flatten:true,filter:[{type:"worker",exclude:false},{exclude:true}]});
  return {
    entries,errors,
    async collect(){
      await Promise.all([...pending]);
      for(const record of workers.values()) {
        try {
          const result=await send(record.session,"Profiler.takePreciseCoverage");
          for(const script of result.result) {
            const source=record.sources.get(script.scriptId);if(!source)continue;
            if(source.text===null)source.text=(await send(record.session,"Debugger.getScriptSource",{scriptId:script.scriptId})).scriptSource;
            entries.push({url:source.url,text:source.text,rawScriptCoverage:script});
          }
        } catch(error) {if(!cancelled(record,error))errors.push(error.message);}
      }
    },
    async dispose() {
      // Disarm auto-attach before browser.close: no new target may remain paused
      // while Chromium is waiting for its shutdown handshake.
      try {
        await bounded(async () => {
          await parent.send("Target.setAutoAttach", { autoAttach: false, waitForDebuggerOnStart: false, flatten: true });
          await Promise.all([...pending]);
          await parent.detach();
        }, 5_000, "worker coverage shutdown");
      } catch (error) { errors.push(error.message); }
    }
  };
}
