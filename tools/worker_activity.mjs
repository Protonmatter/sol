// Test-only request observation. Does not change messages, timers or worker results.
export function installWorkerActivity() {
  const NativeWorker=globalThis.Worker,workers=new Map(),errors=[];
  let nextId=0;
  const fail=message=>{if(errors.length<32)errors.push(message);};
  const identity=message=>message?.protocol==="sol-worker.v1"&&Number.isSafeInteger(message.generation)&&message.generation>0
    ? JSON.stringify([message.protocol,message.engine,message.schema,message.abi,message.release,message.generation]):null;
  if(typeof NativeWorker!=="function"||globalThis.__solWorkerActivity)throw new Error("worker activity installation unavailable or duplicated");
  class ObservedWorker extends NativeWorker {
    constructor(...args) {
      super(...args);
      const record={id:++nextId,active:new Map()};workers.set(this,record);
      if(workers.size>128)fail("worker activity capacity exceeded");
      this.addEventListener("message",event=>{
        if(event.data?.type==="result"||event.data?.type==="error"||event.data?.type==="ready") {
          const key=identity(event.data);
          if(key&&record.active.has(key)){
            const expected=event.data.type==='ready'?'initialize':'compute';
            if(event.data.type==='error'||record.active.get(key)===expected)record.active.delete(key);
            else fail('worker response phase does not match active work');
          }
        }
      });
      this.addEventListener("error",event=>{record.active.clear();fail(`worker ${record.id} exception: ${event.message||'unknown Worker error'}`);});
      this.addEventListener("messageerror",()=>fail("worker activity message could not be decoded"));
    }
    postMessage(...args) {
      const record=workers.get(this),message=args[0];
      const key=["compute","initialize"].includes(message?.type)?identity(message):null;
      const added=key&&record&&!record.active.has(key);
      if(key&&record){if(!added)fail("duplicate active worker request identity");else record.active.set(key,message.type);}
      try {return super.postMessage(...args);}
      catch(error) {if(added)record.active.delete(key);throw error;}
    }
    terminate(...args) {
      const result=super.terminate(...args);workers.delete(this);return result;
    }
  }
  globalThis.Worker=ObservedWorker;
  Object.defineProperty(globalThis,"__solWorkerActivity",{value:()=>({
    workers:workers.size,activeRequests:[...workers.values()].reduce((sum,record)=>sum+record.active.size,0),
    activeWorkers:[...workers.values()].filter(record=>record.active.size).map(record=>record.id),errors:[...errors],
  })});
}

export async function waitForWorkerActivityIdle(page,{timeoutMs=10_000}={}) {
  await page.waitForFunction(()=>{
    const state=globalThis.__solWorkerActivity?.();
    if(!state)throw new Error("worker activity observation missing");
    if(state.errors.length)throw new Error("worker activity observation failed: "+state.errors.join("; "));
    return state.activeRequests===0;
  },{timeout:timeoutMs});
}
