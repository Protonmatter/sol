// One active computation + one replaceable latest intent. Pure scheduler with injected I/O.
export class EngineError extends Error {
  constructor(code, message) { super(message); this.name = "EngineError"; this.code = code; }
}

export class LatestWorkerClient {
  constructor({ engine, schema, release, createWorker, validateRequest = value=>value, validateResult = value=>value,
    deadlineMs = 10000, setTimer = setTimeout, clearTimer = clearTimeout }) {
    this.engine=engine; this.schema=schema; this.release=release; this.createWorker=createWorker;
    this.validateRequest=validateRequest; this.validateResult=validateResult; this.deadlineMs=deadlineMs;
    // Browser timers cannot be invoked with a LatestWorkerClient receiver.
    // Keep injected callbacks unbound too; Node timers do not expose this mistake.
    this.setTimer=(callback,delay)=>setTimer(callback,delay);
    this.clearTimer=timer=>clearTimer(timer);
    this.generation = 0; this.active = null; this.pending = null; this.worker = null; this.disposed = false;
  }
  request(payload) {
    if (this.disposed) return Promise.reject(new EngineError("disposed", "Engine has been disposed"));
    try { payload = this.validateRequest(payload); } catch(error) { return Promise.reject(error); }
    const generation = ++this.generation;
    return new Promise((resolve,reject)=>{
      const job = {generation,payload,resolve,reject};
      if (this.active) {
        this.pending?.reject(new EngineError("superseded", "A newer request replaced this intent"));
        this.pending = job;
      } else this.start(job);
    });
  }
  start(job) {
    this.active = job;
    try {
      if (!this.worker) this.worker = this.createWorker();
      const worker = this.worker;
      worker.onmessage = event=>{
        if (worker !== this.worker || !this.active || event.data?.generation !== this.active.generation) return;
        const message = event.data;
        if (message.protocol !== "sol-worker.v1" || message.engine !== this.engine || message.schema !== this.schema
          || message.abi !== 1 || message.release !== this.release || !["result","error"].includes(message.type)) {
          this.finish(new EngineError("protocol", "Engine result identity does not match the requested contract")); return;
        }
        if (message.type === "error") { this.finish(new EngineError(message.error?.code || "engine_failed", message.error?.message || "Engine failed")); return; }
        if (this.active.generation !== this.generation) { this.finish(new EngineError("superseded", "Newer intent owns the view")); return; }
        try { this.finish(null, this.validateResult(message.value)); } catch(error) { this.finish(error); }
      };
      worker.onerror = event=>{
        event.preventDefault?.();
        if(worker === this.worker) this.finish(new EngineError("worker_failed", "Engine worker failed; retry this request"), undefined, true);
      };
      job.timer = this.setTimer(()=>this.finish(new EngineError("deadline", "Engine exceeded its wall deadline"), undefined, true), this.deadlineMs);
      worker.postMessage({type:"compute",protocol:"sol-worker.v1",engine:this.engine,schema:this.schema,abi:1,release:this.release,generation:job.generation,payload:job.payload});
    } catch(error) { this.finish(error, undefined, true); }
  }
  finish(error, value, terminate = false) {
    if (!this.active) return;
    const job = this.active; this.active = null;
    if (job.timer !== undefined) this.clearTimer(job.timer);
    if (terminate && this.worker) { this.worker.terminate(); this.worker = null; }
    if (error) job.reject(error); else job.resolve(value);
    const pending = this.pending; this.pending = null;
    if (pending) this.start(pending);
  }
  cancel() {
    this.generation++;
    this.pending?.reject(new EngineError("cancelled", "Engine request cancelled")); this.pending = null;
    if (this.active) this.finish(new EngineError("cancelled", "Engine request cancelled"), undefined, true);
    else if (this.worker) { this.worker.terminate(); this.worker = null; }
  }
  dispose() { this.cancel(); this.disposed = true; }
}
