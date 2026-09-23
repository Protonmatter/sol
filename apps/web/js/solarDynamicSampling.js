import {validateDynamicPacket,parseDynamicJson} from './solarDynamicAssets.js';

export function validateAppearanceRequest(value) {
  if(!value||!Number.isInteger(value.seed)||value.seed<0||value.seed>0xffffffff
    ||!Number.isFinite(value.time_s)||value.time_s<0||value.time_s>21600
    ||!['quiet-v1','active-v1'].includes(value.recipe_id)||!Number.isInteger(value.lod)||value.lod<0||value.lod>2)
    throw new RangeError('Invalid solar appearance request');
  return {seed:value.seed,time_s:value.time_s,recipe_id:value.recipe_id,lod:value.lod};
}

export function sampleSolarAppearance(wasm,request) {
  const value=validateAppearanceRequest(request);
  if(typeof wasm?.appearance_abi_version!=='function'||wasm.appearance_abi_version()!==1
    ||typeof wasm.appearance_eval_v1!=='function'||typeof wasm.appearance_result_len_v1!=='function')
    throw new Error('Solar appearance ABI unavailable');
  const ptr=wasm.appearance_eval_v1(value.seed,value.time_s,value.recipe_id==='active-v1'?1:0,value.lod);
  const len=wasm.appearance_result_len_v1(),buffer=wasm.memory?.buffer;
  if(!buffer||!Number.isSafeInteger(ptr)||!Number.isSafeInteger(len)||ptr<0||len<1||len>1048576||ptr+len>buffer.byteLength)
    throw new Error('Solar appearance result buffer size invalid');
  const bytes=new Uint8Array(buffer,ptr,len).slice();
  const packet=parseDynamicJson(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  if(packet.schema_version==='engine-error.v1')throw new Error(packet.error?.message||'Solar appearance rejected');
  validateDynamicPacket(packet);
  if(packet.seed!==value.seed||packet.recipe_id!==value.recipe_id||Math.abs(packet.time_s-value.time_s)>1e-8)
    throw new Error('Solar appearance result identity mismatch');
  return packet;
}
