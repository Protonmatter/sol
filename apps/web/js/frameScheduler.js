// One owner for continuous frames and on-demand redraws. Measurements describe
// JavaScript frame work and input-to-frame-start/submit latency, never GPU or
// compositor completion (requestAnimationFrame runs before browser paint).
export function createFrameScheduler({schedule,cancel,now,enabled,continuous,render,sampleLimit=120,onSample=(_sample)=>{}}) {
  let pending=null,generation=0,rendering=false,dirty=false,inputAt=null,previousFrame=null;
  const samples=[];
  const limit=Math.max(1,Math.min(600,Math.floor(sampleLimit)||120));
  function arm() {
    if(pending!==null||rendering||!enabled())return;
    const owner=generation;
    pending=schedule(timestamp=>{
      if(owner!==generation)return;
      pending=null;
      if(!enabled()){dirty=false;inputAt=null;previousFrame=null;return;}
      const start=now(),latency=inputAt===null?null:Math.max(0,start-inputAt),running=!!continuous();
      const elapsed=previousFrame===null?null:timestamp-previousFrame;
      const intervalMs=running&&Number.isFinite(elapsed)&&elapsed>0&&elapsed<=250?elapsed:null;
      dirty=false;inputAt=null;rendering=true;
      let completed=false,rendered=false;
      try {rendered=render(timestamp)!==false;completed=true;}
      finally {
        const frameMs=Math.max(0,now()-start);
        const sample={timestamp,frameMs,inputToFrameMs:latency,
          inputToSubmitMs:latency===null||!completed||!rendered?null:latency+frameMs,
          completed,rendered,continuous:running,continuation:running&&previousFrame!==null&&elapsed>0,intervalMs};
        samples.push(sample);
        if(samples.length>limit)samples.shift();
        let observed=false;
        try {onSample({...sample});observed=true;}
        finally {
          rendering=false;
          // Render/observer failures preserve diagnostics and propagate, but cannot
          // create an automatic error loop. A later explicit invalidation may retry.
          if(!completed||!observed){dirty=false;inputAt=null;previousFrame=null;}
          else {
            const active=enabled(),keepRunning=active&&owner===generation&&continuous();
            previousFrame=rendered&&keepRunning&&Number.isFinite(timestamp)?timestamp:null;
            if(active&&(dirty||keepRunning))arm();
          }
        }
      }
    });
  }
  return {
    invalidate({input=false}={}) {
      if(!enabled())return;
      dirty=true;
      if(input&&inputAt===null)inputAt=now();
      arm();
    },
    cancel() {
      generation++;
      if(pending!==null)cancel(pending);
      pending=null;dirty=false;inputAt=null;previousFrame=null;
    },
    get pending(){return pending!==null;},
    timings:()=>samples.map(sample=>({...sample})),
  };
}
