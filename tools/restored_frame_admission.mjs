// Pixel admission for a restored canvas capture. The restoration gate previously
// hashed its screenshot without decoding it, so a blank or never-drawn canvas was
// accepted as long as readiness statuses were green. This module is pure so the
// negative controls run without a browser; the validator separately requires an
// observed draw from the replacement graphics context, which proves the body.
import {PNG} from 'pngjs';

const LEVEL_SHIFT=3; // 32 levels per channel: tolerant of dither, blind to one flat fill.

export function measureCanvasFrame(pngBuffer){
  const {width,height,data}=PNG.sync.read(pngBuffer);
  const pixels=width*height;
  if(!pixels)return {width,height,pixels:0,distinctLevels:0,lumaMean:0,lumaStdDev:0};
  const levels=new Set();let sum=0,squares=0;
  for(let i=0;i<data.length;i+=4){
    const r=data[i],g=data[i+1],b=data[i+2];
    levels.add(((r>>LEVEL_SHIFT)<<10)|((g>>LEVEL_SHIFT)<<5)|(b>>LEVEL_SHIFT));
    const luma=.2126*r+.7152*g+.0722*b;sum+=luma;squares+=luma*luma;
  }
  const lumaMean=sum/pixels,variance=Math.max(0,squares/pixels-lumaMean*lumaMean);
  return {width,height,pixels,distinctLevels:levels.size,lumaMean,lumaStdDev:Math.sqrt(variance)};
}

export function assertRestoredFrame(pngBuffer,{minPixels=64,minDistinctLevels=8,minLumaStdDev=2}={}){
  const frame=measureCanvasFrame(pngBuffer);
  const reasons=[];
  if(frame.pixels<minPixels)reasons.push(`only ${frame.pixels} pixels`);
  if(frame.distinctLevels<minDistinctLevels)reasons.push(`${frame.distinctLevels} distinct colour levels`);
  if(frame.lumaStdDev<minLumaStdDev)reasons.push(`luminance deviation ${frame.lumaStdDev.toFixed(3)}`);
  if(reasons.length)throw new Error(`Restored canvas is blank or uniform: ${reasons.join(', ')}`);
  return frame;
}

// A lost context cannot draw, so a terrain-shadowed body draw recorded after loss was
// observed necessarily came from the replacement context. Status flags are not evidence.
export function assertReplacementContextDraw(draws){
  if(!Array.isArray(draws))throw new Error('Replacement-context draw evidence missing');
  const live=draws.filter(draw=>draw&&draw.contextLost===false&&Number.isInteger(draw.count)&&draw.count>0);
  const body=live.filter(draw=>draw.terrainShadow===1);
  if(!body.length)throw new Error(`No terrain-shadowed body draw from the replacement context (${draws.length} recorded, ${live.length} live)`);
  return {recorded:draws.length,live:live.length,body:body.length,maxBodyIndexCount:Math.max(...body.map(draw=>draw.count))};
}
