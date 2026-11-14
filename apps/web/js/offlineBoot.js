// Let the saved observation paint before offline installation competes for bytes.
export function afterObservationPaint({media,install,onError=()=>{},
  requestFrame=callback=>requestAnimationFrame(callback),cancelFrame=id=>cancelAnimationFrame(id)}){
  let stopped=false,unsubscribe=null;
  const frames=new Set();
  const clearFrames=()=>{for(const id of frames)cancelFrame(id);frames.clear();};
  const stop=()=>{if(stopped)return;stopped=true;clearFrames();unsubscribe?.();};
  const frame=callback=>{
    const id=requestFrame(()=>{frames.delete(id);if(!stopped)callback();});frames.add(id);
  };
  unsubscribe=media.subscribe(status=>{
    clearFrames();
    if(status!=='ready'||stopped)return;
    frame(()=>frame(()=>{
      if(media.media!=='ready')return;
      stop();Promise.resolve().then(install).catch(onError);
    }));
  });
  return stop;
}
