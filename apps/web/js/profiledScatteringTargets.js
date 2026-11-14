// Two independent source-bound owners, each limited to one target. The existing
// createScatteringTargets owner still proves program/frame/texture identity.
const BODIES=Object.freeze(['Earth','Mars']);
/** @param {(body:string,capacity:number)=>any} create */
export function createProfiledScatteringTargets(create){
  if(typeof create!=='function')throw new TypeError('Scattering owner factory required');
  const owners=new Map();let disposed=false,currentFrame=null,lastFrame=null;
  return {
    register(body){
      if(disposed)throw new Error('Profiled scattering targets disposed');
      if(!BODIES.includes(body))throw new TypeError('Unsupported scattering profile/body');
      if(!owners.has(body)){
        const owner=create(body,1);owners.set(body,owner);
        if(currentFrame)owner.beginFrame(currentFrame);
      }
      return owners.get(body);
    },
    beginFrame(frame){
      if(disposed)return false;
      if(!frame||!Number.isSafeInteger(frame.contextGeneration)||frame.contextGeneration<0
        ||!Number.isSafeInteger(frame.sceneSerial)||frame.sceneSerial<0||!Number.isFinite(frame.epoch))throw new TypeError('Invalid scattering frame');
      const stale=lastFrame&&(frame.contextGeneration!==lastFrame.contextGeneration||frame.sceneSerial<lastFrame.sceneSerial
        ||frame.sceneSerial===lastFrame.sceneSerial&&!Object.is(frame.epoch,lastFrame.epoch));
      if(stale){currentFrame=null;for(const owner of owners.values())owner.beginFrame(frame);return false;}
      currentFrame={contextGeneration:frame.contextGeneration,sceneSerial:frame.sceneSerial,epoch:frame.epoch};lastFrame=currentFrame;let ready=true;
      for(const owner of owners.values())ready=owner.beginFrame(currentFrame)&&ready;
      return ready;
    },
    generate(body,args,...rest){return !disposed&&!!currentFrame&&args?.profile?.body===body&&owners.get(body)?.generate(body,args,...rest)||false;},
    bind(body,args,...rest){return !disposed&&!!currentFrame&&args?.profile?.body===body&&owners.get(body)?.bind(body,args,...rest)||false;},
    status(body){return disposed?{state:'disposed',reason:'Scattering targets disposed',submission:null}
      :owners.get(body)?.status(body)||{state:'deferred',reason:'',submission:null};},
    retry(body){return !disposed&&owners.get(body)?.retry(body)||false;},
    cancel(body){
      if(disposed)return;
      if(body===undefined)for(const owner of owners.values())owner.cancel();
      else owners.get(body)?.cancel(body);
    },
    dispose(){
      if(disposed)return;disposed=true;currentFrame=null;
      for(const owner of owners.values())owner.dispose();
    },
  };
}
