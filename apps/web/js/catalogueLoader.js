// Bounds application ownership of a canonical module import. The browser owns
// its physical fetch; cancellation and retry do not promise a new transfer.
export const CATALOGUE_DEADLINE_MS = 30000;

// A browser keeps a failed module fetch for the life of its document, so importing the
// same URL again fails without touching the network. The only way to fetch it again is a
// new document. When every listed module is reachable now, replace the document and
// report true. When one is not, report false and leave the page, and any offline state,
// exactly as it is: reloading an unreachable page would trade an error for a blank one.
export function createDocumentRecovery({urls,graphUrl=null,fetchModule=(url,init)=>fetch(url,init),reload=()=>location.reload()}) {
  if(typeof urls!=='function'||typeof fetchModule!=='function'||typeof reload!=='function')throw new TypeError('Document recovery needs urls, fetchModule and reload functions');
  return async({signal=undefined,isCurrent=()=>true}={})=>{
    const current=()=>!signal?.aborted&&isCurrent();
    if(!current())return false;
    let targets=urls();
    if(graphUrl){
      const graphLocation=typeof graphUrl==='function'?graphUrl():graphUrl;
      const response=await fetchModule(graphLocation,{cache:'no-store',signal});
      if(!current()||!response?.ok)return false;
      const graph=await response.json();
      if(!current())return false;
      if(graph?.schema_version!=='module-dependencies.v1'||!graph.modules||typeof graph.modules!=='object'
        ||Array.isArray(graph.modules)||Object.keys(graph.modules).length>4096)return false;
      const root=new URL('./',graphLocation),queue=[...targets],seen=new Set();
      const local=/^(?:js\/)?[A-Za-z0-9_.-]+\.js$/;
      for(let i=0;i<queue.length;i++){
        const url=new URL(queue[i],root);
        if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname)||url.search||url.hash)return false;
        const name=url.pathname.slice(root.pathname.length);
        if(!local.test(name)||!Object.hasOwn(graph.modules,name))return false;
        if(seen.has(url.href))continue;
        seen.add(url.href);
        const dependencies=graph.modules[name];
        if(!Array.isArray(dependencies)||dependencies.length>4096)return false;
        for(const dependency of dependencies){
          if(typeof dependency!=='string'||!local.test(dependency))return false;
          const next=new URL(dependency,root).href;
          if(!seen.has(next))queue.push(next);
        }
        if(queue.length>16384)return false;
      }
      targets=[...seen];
    }
    for(const url of targets){
      const response=await fetchModule(url,{cache:'no-store',signal});
      if(!current())return false;
      if(!response||response.ok!==true){void response?.body?.cancel().catch(()=>{});return false;}
      await response.arrayBuffer();
      if(!current())return false;
    }
    if(!current())return false;
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
      const attempt={promise,resolve,reject,timer:null,deadline:start+timeoutMs,controller:new AbortController()};
      pending=attempt;status='loading';error=null;
      const timeout=()=>new Error('Catalogue request exceeded its deadline');
      const finish=(ok,result)=>{
        if(pending!==attempt)return;
        if(now()>=attempt.deadline){ok=false;result=timeout();}
        clearTimer(attempt.timer);pending=null;attempt.controller.abort();
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
          try{reloading=await recover({signal:attempt.controller.signal,isCurrent:()=>pending===attempt&&now()<attempt.deadline})===true;}catch(_){ /* the import failure below is the report */ }
          // The document is being replaced. The deadline still bounds this attempt.
          if(reloading)return;
        }
        finish(false,failure);
      });
      return promise;
    },
    cancel(){
      if(!pending)return;
      const attempt=pending;pending=null;clearTimer(attempt.timer);attempt.controller.abort();
      status='idle';error=null;
      const failure=new Error('Catalogue request cancelled');failure.name='AbortError';attempt.reject(failure);
    },
  });
}

// View code uses the same import ownership/deadline protocol as catalogues.
export const createModuleLoader = createCatalogueLoader;
