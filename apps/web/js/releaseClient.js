// Explicit update consent. A worker's script URL does not identify its installed bytes.
export function identifyWaitingRelease(worker, basePath, createChannel = ()=>new MessageChannel(), timeoutMs = 5000) {
  return new Promise((resolve,reject)=>{
    const channel = createChannel();
    const done = (error,value) => { clearTimeout(timer); channel.port1.close(); channel.port2.close(); if(error) reject(error); else resolve(value); };
    const timer = setTimeout(()=>done(Error("Release identity handshake timed out")),timeoutMs);
    channel.port1.onmessage = event=>{
      const value = event.data;
      if(value?.type!=="RELEASE_ID" || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.release_id)
        || value.base_path!==basePath || value.namespace!==`releases/${value.release_id}/`) done(Error("Invalid installed release identity"));
      else done(null,value.release_id);
    };
    try { worker.postMessage({type:"GET_RELEASE_ID"},[channel.port2]); } catch(error) { done(error); }
  });
}

export async function registerOfflineRelease({serviceWorker,location,document,basePath,releaseId,createChannel = ()=>new MessageChannel()}) {
  const status = document.getElementById("releaseStatus"), button = document.getElementById("releaseUpdate");
  let reloadRequested = false;
  serviceWorker.addEventListener("controllerchange",()=>{if(reloadRequested) location.assign(basePath);});
  try {
    const registration = await serviceWorker.register(`${basePath}sw.js?v=${releaseId}`,{scope:basePath,updateViaCache:"none"});
    const offerUpdate = ()=>{
      if (!registration.waiting || !button) return;
      button.hidden = false;
      if(status) status.textContent = "Verified update ready; this tab retains its current release.";
      button.onclick = async()=>{
        const worker = registration.waiting;
        if(!worker) return;
        button.disabled = true;
        try {
          const installedId = await identifyWaitingRelease(worker,basePath,createChannel);
          if(registration.waiting !== worker) throw Error("Waiting release changed; retry the update");
          reloadRequested = true;
          worker.postMessage({type:"ACTIVATE_RELEASE",release_id:installedId});
        } catch(error) { if(status) status.textContent = `Update unavailable: ${error.message}. Current release retained.`; }
        finally { button.disabled = false; }
      };
    };
    if(registration.active && status) status.textContent = `Release ${releaseId} · offline state pending verification`;
    offerUpdate();
    registration.addEventListener("updatefound",()=>{
      const worker = registration.installing;
      if(status) status.textContent = "Verifying offline release…";
      worker?.addEventListener("statechange",()=>{
        if(worker.state==="installed") { if(status) status.textContent = "Complete release installed for offline use."; offerUpdate(); }
        else if(worker.state==="redundant" && status) status.textContent = "Offline update failed; existing complete release retained.";
      });
    });
    return registration;
  } catch(_) { if(status) status.textContent = "Offline installation unavailable; using network-validated release."; return null; }
}
