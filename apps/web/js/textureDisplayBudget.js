// Display resampling preserves geographic extent, not native raster resolution.
// Categorical scientific palettes retain their exact grid and nearest sampling.
export const MAX_REFERENCE_GPU_BYTES=96*1024*1024;
export const MAX_REFERENCE_PENDING_BYTES=32*1024*1024;
export function textureBytes(width,height,mipmaps=true) {
  let bytes=0;
  for (;;) {
    bytes+=width*height*4;
    if(!mipmaps || width===1&&height===1)return bytes;
    width=Math.max(1,Math.floor(width/2));height=Math.max(1,Math.floor(height/2));
  }
}
export function planTextureDisplay(asset,pixels=0,dpr=1,maxSize=2048) {
  const [width,height]=asset.dimensions;
  if(![width,height].every(n=>Number.isSafeInteger(n)&&n>0)||!Number.isFinite(maxSize)||maxSize<1)throw Error('Invalid texture grid');
  const exact=asset.role==='sea-ice';
  if(exact && Math.max(width,height)>maxSize)throw Error('Device cannot preserve the scientific palette grid');
  const desired=Math.max(512,(Number.isFinite(pixels)?pixels:0)*Math.min(2,Math.max(1,dpr))*2);
  const tier=desired<=512?512:desired<=1024?1024:2048;
  const ratio=exact?1:Math.min(1,tier/Math.max(width,height),maxSize/Math.max(width,height));
  const w=Math.max(1,Math.floor(width*ratio)),h=Math.max(1,Math.floor(height*ratio));
  return {width:w,height:h,bytes:textureBytes(w,h,!exact),decodedBytes:w*h*4,exact};
}
