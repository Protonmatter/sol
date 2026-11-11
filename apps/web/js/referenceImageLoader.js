// Only source bytes and decoding are owned here; the renderer owns upload/lifetime.
export async function decodeReferenceImage(asset,plan,signal,services={}) {
  const check=()=>{if(signal.aborted)throw new DOMException('Reference request cancelled','AbortError');};
  check();
  const response=await (services.fetch||fetch)(asset.path,{signal,credentials:'same-origin'});
  if(!response.ok)throw Error('Reference image unavailable');
  const bytes=await response.arrayBuffer();check();
  if(bytes.byteLength!==asset.bytes)throw Error('Reference byte size mismatch');
  const digest=await (services.digest||(b=>crypto.subtle.digest('SHA-256',b)))(bytes);check();
  const hash=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
  if(hash!==asset.sha256)throw Error('Reference hash mismatch');
  // Admitted source-qualified references are PNG. Read IHDR before resizing so
  // a requested display grid cannot disguise drift in the pinned source grid.
  const view=new DataView(bytes),signature=[137,80,78,71,13,10,26,10];
  if(bytes.byteLength<24 || !signature.every((b,i)=>view.getUint8(i)===b)
    ||view.getUint32(12)!==0x49484452 || view.getUint32(16)!==asset.dimensions[0]
    ||view.getUint32(20)!==asset.dimensions[1])throw Error('Reference source grid mismatch');
  const image=await (services.decode||createImageBitmap)(new Blob([bytes],{type:'image/png'}),{
    resizeWidth:plan.width,resizeHeight:plan.height,resizeQuality:plan.exact?'pixelated':'high',
    imageOrientation:'none',colorSpaceConversion:plan.exact?'none':'default',
    premultiplyAlpha:asset.nodata==='alpha'&&!plan.exact?'premultiply':'none',
  });
  try {check();if(image.width!==plan.width||image.height!==plan.height)throw Error('Reference display grid mismatch');return image;}
  catch(error){image.close();throw error;}
}
export function requestReferenceImage(asset,{plan,signal,onReady,onError}) {
  void decodeReferenceImage(asset,plan,signal).then(onReady,onError);
}
