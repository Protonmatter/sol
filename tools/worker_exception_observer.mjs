// Local QA only. Join setup after the owned browser closes, before copying errors.
import {TargetCloseError} from 'puppeteer-core';

export function createWorkerExceptionObserver(browser,{ownerForTarget,errors,targets,timeoutMs=5000,maxTargets=128,now=()=>performance.now(),onException,onSetupError}){
  if(typeof ownerForTarget!=='function'||!Array.isArray(errors)||!Array.isArray(targets)||typeof now!=='function'
    ||!Number.isSafeInteger(timeoutMs)||timeoutMs<1||timeoutMs>60000||!Number.isSafeInteger(maxTargets)||maxTargets<1||maxTargets>128
    ||onException!==undefined&&typeof onException!=='function'||onSetupError!==undefined&&typeof onSetupError!=='function')throw new Error('Invalid worker observation bounds');
  const pending=new Set(),records=new Map(),destroyed=new WeakSet();let capacityFailed=false;
  const notify=(callback,value)=>{if(callback)try{callback(value);}catch(error){errors.push(`worker observation callback failed: ${String(error)}`);}};
  const onDestroyed=target=>{destroyed.add(target);const record=records.get(target);if(record)record.row.destroyed=true;};
  const onCreated=target=>{
    const owner=ownerForTarget(target),row={type:target.type(),url:target.url(),owner:owner?.name??'unattributed'};
    if(targets.length<512)targets.push(row);
    if(!['service_worker','other','worker'].includes(row.type))return;
    if(records.size>=maxTargets){if(!capacityFailed)errors.push('worker observation capacity exceeded');capacityFailed=true;return;}
    const record={row,session:null,listener:null};records.set(target,record);row.observation='pending';
    const failures=owner?.errors??errors,started=now();let timer,expired=false;
    const admit=()=>{
      const elapsed=now()-started;
      if(!Number.isFinite(elapsed)||elapsed<0||elapsed>=timeoutMs){expired=true;throw new Error(`worker observation deadline or invalid clock (${timeoutMs} ms)`);}
    };
    const physical=(async()=>{
      const session=await target.createCDPSession();if(expired)return;admit();record.session=session;
      record.listener=event=>{const detail=event.exceptionDetails,message=detail.exception?.description||detail.text;
        failures.push(`worker: ${message}`);notify(onException,{message,target});};
      session.on('Runtime.exceptionThrown',record.listener);
      await session.send('Runtime.enable');if(expired)return;admit();row.observation='ready';
    })();
    const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{expired=true;reject(new Error(`worker observation deadline exceeded (${timeoutMs} ms)`));},timeoutMs);});
    const task=Promise.race([physical,deadline]).catch(error=>{
      if(destroyed.has(target)&&error instanceof TargetCloseError)row.observation='closed';
      else{row.observation='failed';failures.push(`worker observation: ${String(error)}`);notify(onSetupError,{error,target});}
    }).finally(()=>clearTimeout(timer));
    pending.add(task);void task.then(()=>pending.delete(task));
  };
  browser.on('targetdestroyed',onDestroyed);browser.on('targetcreated',onCreated);
  return {
    async settle(){while(pending.size)await Promise.all([...pending]);},
    dispose(){
      if(pending.size)throw new Error('Worker observation disposed before setup settled');
      browser.off('targetcreated',onCreated);browser.off('targetdestroyed',onDestroyed);
      for(const {session,listener} of records.values())if(session&&listener)session.off('Runtime.exceptionThrown',listener);
    },
  };
}
