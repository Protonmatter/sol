import {createModuleLoader} from './catalogueLoader.js';

/** @typedef {{name:string,status:string,error:Error|null,initialized:boolean}} ViewCodeState */

/**
 * Own a selected view's code activation. Cancellation resolves null; failures
 * reject. onState is synchronous; async onReady must honor isCurrent/signal
 * before publishing after an await. Existing viewers own their compute work.
 * @param {{loaders:Record<string,()=>any>,recoveries?:Record<string,()=>Promise<boolean>>,onState?:(state:ViewCodeState)=>void,
 * onReady?:(name:string,module:any,owner:{signal:AbortSignal,isCurrent:()=>boolean})=>any,
 * timeoutMs?:number,now?:()=>number,setTimer?:(callback:()=>void,delay:number)=>any,
 * clearTimer?:(timer:any)=>void}} options
 */
export function createViewLoader({loaders,recoveries={},onState=()=>{},onReady=()=>{},...timing}) {
  const imports=new Map();
  for(const [name,load]of Object.entries(loaders)){
    if(name==='observe'||typeof load!=='function')throw new TypeError('View loaders must be named functions');
    imports.set(name,createModuleLoader({load,recover:recoveries[name]??null,...timing}));
  }
  // Namespace caching does not establish successful view entry.
  const enteredViews=new Set();
  let selected='observe',paused=false,generation=0,pending=null;
  /** @type {Readonly<ViewCodeState>} */
  let state=Object.freeze({name:selected,status:'idle',error:null,initialized:true});
  const publish=(status,error=null)=>{state=Object.freeze({name:selected,status,error,initialized:selected==='observe'||status==='ready'||enteredViews.has(selected)});onState(state);};
  const cancel=(settle=true)=>{
    generation++;
    if(!pending)return;
    const attempt=pending;pending=null;attempt.controller.abort();imports.get(attempt.name).cancel();if(settle)attempt.resolve(null);
  };
  // explicitRetry is true only for retry(): selecting or returning to a view never replaces
  // the document on its own.
  const start=(explicitRetry=false)=>{
    if(selected==='observe'){publish('idle');return Promise.resolve(null);}
    if(paused){publish('paused');return Promise.resolve(null);}
    let resolve,reject;
    const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});
    const attempt={name:selected,generation:++generation,controller:new AbortController(),resolve,reject,promise};
    pending=attempt;
    const isCurrent=()=>pending===attempt&&generation===attempt.generation&&!paused&&selected===attempt.name;
    const fail=error=>{
      if(!isCurrent())return;
      pending=null;
      attempt.controller.abort();imports.get(attempt.name).cancel();
      const failure=error instanceof Error?error:new Error(String(error));
      state=Object.freeze({name:selected,status:'failed',error:failure,initialized:enteredViews.has(selected)});
      // Preserve the originating failure if the status renderer also fails.
      try{onState(state);}catch(_) { /* returned rejection still reports the failure */ }
      reject(failure);
    };
    try{
      publish('loading');
      if(!isCurrent())return promise;
      imports.get(selected).request({recover:explicitRetry}).then(async module=>{
        if(!isCurrent())return;
        publish('activating');
        if(!isCurrent())return;
        await onReady(attempt.name,module,Object.freeze({signal:attempt.controller.signal,isCurrent}));
        if(!isCurrent())return;
        publish('ready');
        if(!isCurrent())return;
        enteredViews.add(attempt.name);
        pending=null;resolve(module);
      }).catch(fail);
    }catch(error){fail(error);}
    return promise;
  };
  return Object.freeze({
    get state(){return state;},
    activate(name){
      if(name!=='observe'&&!imports.has(name))throw new Error(`Unknown view: ${name}`);
      if(name===selected&&pending)return pending.promise;
      if(name===selected&&state.status==='ready')return Promise.resolve(imports.get(name).value);
      cancel();selected=name;return start();
    },
    retry(){if(pending)return pending.promise;return start(true);},
    pauseLoading(){
      paused=true;
      if(pending){
        const attempt=pending,pauseGeneration=generation+1;
        const ownsPause=()=>generation===pauseGeneration&&!pending&&selected===attempt.name;
        try{
          // Detach before publication, but do not settle away a current failure.
          cancel(false);
          if(ownsPause())publish('paused');
          attempt.resolve(null);
        }catch(error){
          const failure=error instanceof Error?error:new Error(String(error));
          if(ownsPause()){
            state=Object.freeze({name:selected,status:'failed',error:failure,initialized:enteredViews.has(selected)});
            try{onState(state);}catch(_) { /* the original rejection remains observable */ }
          }
          attempt.reject(failure);
          throw failure;
        }
      }
    },
    resumeLoading(){
      paused=false;
      if(state.status==='paused')return start();
      return Promise.resolve(null);
    },
  });
}
