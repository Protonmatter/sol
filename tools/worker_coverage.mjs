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

// Qualification requires a truthful graceful-close result and confirmed exit.
// Keep the legacy helper's resolving fallback contract for existing callers.
export async function closeOwnedBrowserVerified(browser, { timeoutMs = 10_000 } = {}) {
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) throw new RangeError("Invalid owned-browser cleanup deadline");
  const child = browser.process();
  if (!child || !Number.isSafeInteger(child.pid) || child.pid < 1 || typeof child.on !== "function" || typeof child.once !== "function" || typeof child.off !== "function" || typeof child.kill !== "function") {
    throw new Error("Owned browser process handle is required for verified cleanup");
  }
  if (!(child.exitCode === null || Number.isInteger(child.exitCode)) || !(child.signalCode === null || typeof child.signalCode === "string" && child.signalCode.length > 0)) {
    throw new Error("Owned browser process state is invalid");
  }
  const exited = () => child.exitCode !== null || child.signalCode !== null;
  if (exited()) return;
  const failures = [];
  const record = error => failures.push(error instanceof Error ? error : new Error(String(error)));
  const onError = error => record(error);
  const waitForExit = async () => {
    let listener;
    try {
      await bounded(() => new Promise(resolve => {
        if (exited()) resolve();
        else { listener = resolve; child.once("exit", listener); }
      }), timeoutMs, "owned browser exit");
    } finally { if (listener) child.off("exit", listener); }
  };
  child.on("error", onError);
  try {
    try { await closeOwnedBrowser(browser, { timeoutMs, diagnostic: message => record(message) }); }
    catch (error) { record(error); }
    try { await waitForExit(); }
    catch (error) {
      record(error);
      if (!exited()) {
        try { if (child.kill("SIGKILL") !== true) record("Owned browser kill request was not accepted"); }
        catch (killError) { record(killError); }
        try { await waitForExit(); } catch (exitError) { record(exitError); }
      }
    }
  } finally { child.off("error", onError); }
  if (failures.length) throw new AggregateError(failures, "Verified browser cleanup failed: " + failures.map(error => error.message).join("; "));
}

// beforeCollect is an idle barrier, not a lock. The caller must prevent new
// timed requests while collection is in progress (including automatic refresh).
export async function startWorkerCoverage(page, { timeoutMs = 10_000, beforeCollect = () => {} } = {}) {
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
        // Debugger can force WASM onto slower execution tiers. Arm coverage
        // before resume; source discovery waits until timed work has returned.
        await send(session,"Profiler.enable");
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
      try {await bounded(beforeCollect,timeoutMs,"worker coverage quiescence");}
      catch(error) {errors.push(error.message);return;}
      await Promise.all([...pending]);
      for(const record of workers.values()) {
        const collected=[];
        let debuggerRequested=false,complete=false;
        try {
          const result=await send(record.session,"Profiler.takePreciseCoverage");
          debuggerRequested=true;
          await send(record.session,"Debugger.enable");
          for(const script of result.result) {
            if(!script.url||script.url.startsWith("wasm:"))continue;
            const source=record.sources.get(script.scriptId);
            if(!source||source.url!==script.url)throw new Error(`worker coverage source identity missing or inconsistent: ${script.scriptId}`);
            if(source.text===null)source.text=(await send(record.session,"Debugger.getScriptSource",{scriptId:script.scriptId})).scriptSource;
            collected.push({url:source.url,text:source.text,rawScriptCoverage:script});
          }
          complete=true;
        } catch(error) {if(!cancelled(record,error))errors.push(error.message);}
        finally {
          if(debuggerRequested) {
            try {await send(record.session,"Debugger.disable");}
            catch(error) {complete=false;if(!cancelled(record,error))errors.push(error.message);}
          }
        }
        // A failed source/cleanup operation cannot publish a partial collection.
        if(complete)entries.push(...collected);
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
