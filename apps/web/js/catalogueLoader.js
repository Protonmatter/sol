// Bounds application ownership of a canonical module import. The browser owns
// its physical fetch; cancellation and retry do not promise a new transfer.
export const CATALOGUE_DEADLINE_MS = 30000;

// A browser keeps a failed module fetch for the life of its document, so importing the
// same URL again fails without touching the network. The only way to fetch it again is a
// new document. When every listed module is reachable now, replace the document and
// report true. When one is not, report false and leave the page, and any offline state,
// exactly as it is: reloading an unreachable page would trade an error for a blank one.
export function createDocumentRecovery({urls,fetchModule=(url,init)=>fetch(url,init),reload=()=>location.reload()}) {
  if(typeof urls!=='function'||typeof fetchModule!=='function'||typeof reload!=='function')throw new TypeError('Document recovery needs urls, fetchModule and reload functions');
  return async()=>{
    for(const url of urls()){
      const response=await fetchModule(url,{cache:'no-store'});
      if(!response||response.ok!==true)return false;
    }
    reload();return true;
  };
}

export function createCatalogueLoader({load,recover=null,timeoutMs=CATALOGUE_DEADLINE_MS,
  now=()=>performance.now(),setTimer=(callback,delay)=>setTimeout(callback,delay),clearTimer=timer=>clearTimeout(timer)}) {
  if(typeof load!=='function')throw new TypeError('Catalogue load must be a function');
  if(recover!==null&&typeof recover!=='function')throw new TypeError('Catalogue recovery must be a function');
  if(!Number.isSafeInteger(timeoutMs)||timeoutMs<=0)throw new RangeError('Catalogue deadline must be a positive integer');
  let status='idle',value=null,error=null,pending=null,loadRejected=false;
  return Object.freeze({
    get status(){return status;},get value(){return value;},get error(){return error;},
    // recover:true marks an explicit retry by the person using the page. Only such a retry
    // may replace the document, and only after the import has been rejected twice.
    request({recover:explicitRetry=false}={}){
      if(pending)return pending.promise;
      if(status==='ready')return Promise.resolve(value);
      const rejectedBefore=loadRejected;
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
      }).then(result=>finish(true,result),async failure=>{
        // Recorded even for a superseded attempt: the browser's failure outlives this request.
        loadRejected=true;
        if(explicitRetry&&recover&&rejectedBefore&&pending===attempt){
          let reloading=false;
          try{reloading=await recover()===true;}catch(_){ /* the import failure below is the report */ }
          // The document is being replaced. The deadline still bounds this attempt.
          if(reloading)return;
        }
        finish(false,failure);
      });
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
