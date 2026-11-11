// Only source bytes and decoding are owned here; the renderer owns upload/lifetime.
const PNG_SIGNATURE=[137,80,78,71,13,10,26,10];
// JPEG frame headers SOF0-SOF15, excluding DHT (C4), JPG (C8) and DAC (CC).
const isJpegFrame=marker=>marker>=0xc0&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker);

// Reads the encoded source grid without decoding pixels. The container must match
// the pinned file extension, so a renamed or substituted format fails closed.
export function referenceSourceGrid(bytes,path) {
  const view=new DataView(bytes),n=bytes.byteLength,ext=String(path).toLowerCase().split('.').pop();
  if(ext==='png'){
    if(n<24||!PNG_SIGNATURE.every((b,i)=>view.getUint8(i)===b)||view.getUint32(12)!==0x49484452)return null;
    return {type:'image/png',width:view.getUint32(16),height:view.getUint32(20)};
  }
  if(ext!=='jpg'&&ext!=='jpeg')return null;
  if(n<4||view.getUint8(0)!==0xff||view.getUint8(1)!==0xd8)return null;
  let i=2;
  while(i+3<n){
    if(view.getUint8(i)!==0xff)return null;
    let marker=view.getUint8(i+1);
    while(marker===0xff&&i+2<n){i++;marker=view.getUint8(i+1);}
    if(marker===0xd8||marker===0x01||(marker>=0xd0&&marker<=0xd7)){i+=2;continue;}
    if(marker===0xd9||marker===0xda||i+3>=n)return null;
    const length=view.getUint16(i+2);
    if(length<2)return null;
    if(isJpegFrame(marker)){
      if(length<7||i+8>=n)return null;
      return {type:'image/jpeg',width:view.getUint16(i+7),height:view.getUint16(i+5)};
    }
    i+=2+length;
  }
  return null;
}

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
  // Admitted source-qualified references are PNG or JPEG. Read the encoded grid
  // (PNG IHDR or JPEG frame header) before resizing so a requested display grid
  // cannot disguise drift in the pinned source grid.
  const grid=referenceSourceGrid(bytes,asset.path);
  if(!grid||grid.width!==asset.dimensions[0]||grid.height!==asset.dimensions[1])throw Error('Reference source grid mismatch');
  const image=await (services.decode||createImageBitmap)(new Blob([bytes],{type:grid.type}),{
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
