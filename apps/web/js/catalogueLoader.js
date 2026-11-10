// Bounds application ownership of a canonical module import. The browser owns
// its physical fetch; cancellation and retry do not promise a new transfer.
export const CATALOGUE_DEADLINE_MS = 30000;

export function createCatalogueLoader({load,timeoutMs=CATALOGUE_DEADLINE_MS,
  now=()=>performance.now(),setTimer=(callback,delay)=>setTimeout(callback,delay),clearTimer=timer=>clearTimeout(timer)}) {
  if(typeof load!=='function')throw new TypeError('Catalogue load must be a function');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<=0)throw new RangeError('Catalogue deadline must be a positive integer');
  let status='idle',value=null,error=null,pending=null;
  return Object.freeze({
    get status(){return status;},get value(){return value;},get error(){return error;},
    request(){
      if(pending)return pending.promise;
      if(status==='ready')return Promise.resolve(value);
      const start=now();
      if(!Number.isFinite(start))throw new TypeError('Catalogue clock must be finite');
      let resolve,reject;
      const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
      const attempt={promise,resolve,reject,timer:null,deadline:start+timeoutMs};
      pending=attempt;status='loading';error=null;
      const timeout=()=>new Error('Catalogue request exceeded its deadline');
      const finish=(ok,result)=>{
        if(pending!==attempt)return;
        if(now()>=attempt.deadline){ok=false;result=timeout();}
        clearTimer(attempt.timer);pending=null;
        if(ok){value=result;status='ready';error=null;resolve(value);}
        else {status='failed';error=result instanceof Error?result:new Error(String(result));reject(error);}
      };
      const expire=()=>{
        if(pending!==attempt)return;
        const remaining=attempt.deadline-now();
        if(remaining>0){attempt.timer=setTimer(expire,Math.ceil(remaining));return;}
        finish(false,timeout());
      };
      attempt.timer=setTimer(expire,timeoutMs);
      // Observe both outcomes even after cancellation/timeout. Only the current
      // attempt may publish; late success/rejection cannot affect a replacement.
      Promise.resolve().then(()=>{
        if(pending!==attempt)return;
        if(now()>=attempt.deadline){finish(false,timeout());return;}
        return load();
      }).then(result=>finish(true,result),failure=>finish(false,failure));
      return promise;
    },
    cancel(){
      if(!pending)return;
      const attempt=pending;pending=null;clearTimer(attempt.timer);
      status='idle';error=null;
      const failure=new Error('Catalogue request cancelled');failure.name='AbortError';attempt.reject(failure);
    },
  });
}

// View code uses the same import ownership/deadline protocol as catalogues.
export const createModuleLoader = createCatalogueLoader;
