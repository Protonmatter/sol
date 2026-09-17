// Runs in the page's main world through page.evaluate. Retain the native-event
// promise so CDP cannot lose it while the application reconstructs GPU resources.
export function requestContextRestoration({timeoutMs=10000}={}) {
  if(!Number.isInteger(timeoutMs)||timeoutMs<1||timeoutMs>10000)throw new Error('Invalid restoration deadline');
  const loss=window.__physicalLoss;
  if(!loss?.observed||!loss.canvas||!loss.context?.isContextLost()||!loss.extension)throw new Error('Matching context loss has not been observed');
  const evidence={loss_ms:loss.lossMs,request_ms:performance.now(),event_ms:null,callback_completed_ms:null,ready_ms:null};
  window.__physicalRestoreEvidence=evidence;
  const promise=new Promise((resolve,reject)=>{
    let finished=false,timer;
    const afterApplication=()=>{evidence.callback_completed_ms=performance.now();};
    const cleanup=()=>{clearTimeout(timer);loss.canvas.removeEventListener('webglcontextrestored',restored,true);};
    const fail=error=>{if(finished)return;finished=true;cleanup();loss.canvas.removeEventListener('webglcontextrestored',afterApplication);reject(error);};
    const restored=event=>{
      if(event.target!==loss.canvas)return;
      evidence.event_ms=performance.now();
      if(evidence.event_ms-evidence.request_ms>timeoutMs)return fail(new Error('Native context restoration exceeded 10000ms deadline'));
      if(loss.context.isContextLost())return fail(new Error('Restoration event left matching context lost'));
      finished=true;cleanup();resolve(evidence);
    };
    loss.canvas.addEventListener('webglcontextrestored',restored,{capture:true});
    // The app's existing listener was registered first, so this records when its
    // synchronous rebuild returns. Resource readiness has a separate 40s bound.
    loss.canvas.addEventListener('webglcontextrestored',afterApplication,{once:true});
    timer=setTimeout(()=>fail(new Error('Native context restoration exceeded 10000ms deadline')),timeoutMs);
    try{loss.extension.restoreContext();}catch(error){fail(error);}
  });
  window.__physicalRestorePromise=promise;
  return promise;
}
