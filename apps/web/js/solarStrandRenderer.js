import {createShaderPrograms} from './shaderPrograms.js';
import {SOLAR_STRAND_VS,SOLAR_STRAND_FS} from './solarStrandShaders.js';
const MAX_SEGMENTS=16384;
const erf=x=>{const s=Math.sign(x);x=Math.abs(x);const t=1/(1+.3275911*x);return s*(1-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-.284496736)*t+.254829592)*t*Math.exp(-x*x));};
export function gaussianIntegral(a,b,c,lo,hi){
  if(a<1e-12)return Math.exp(-c)*(hi-lo);
  const r=Math.sqrt(a),m=b/a;return Math.max(0,Math.sqrt(Math.PI)/(2*r)*Math.exp(b*b/a-c)*(erf(r*(hi+m))-erf(r*(lo+m))));
}
/** Peak emissivity matches offline Gaussian deposition: emission_relative times
 * altitude taper. Integrating cross-section gives 2*pi*sigma^2 per unit length. */
export function buildStrandInstances(packet){
  if(!Array.isArray(packet?.strands)||packet.strands.length>4096)throw new Error('Invalid strand count');
  const data=[];let count=0,pointCount=0;
  for(const strand of packet.strands){
    if(strand.classification==='incomplete')continue;
    const points=strand.points,p=strand.pulse,gains=strand.emissivity_gain;
    if(!Array.isArray(points)||points.length>MAX_SEGMENTS+1||!Number.isFinite(strand.emission_relative)||strand.emission_relative<0||strand.emission_relative>100)throw new Error('Invalid strand');
    pointCount+=points.length;if(pointCount>MAX_SEGMENTS+4096)throw new Error('Strand point budget exceeded');
    if(gains!==undefined&&(!Array.isArray(gains)||gains.length!==points.length||gains.some(g=>!Number.isFinite(g)||g<0||g>1)))throw new Error('Invalid strand emissivity profile');
    if(!p||![p.onset_s,p.duration_s,p.speed_R_per_s,p.amplitude,p.width_R].every(Number.isFinite)||p.onset_s<0||p.onset_s>21600||p.duration_s<=0||p.duration_s>21600||p.width_R<1e-5||p.width_R>2.6||p.amplitude<0||p.amplitude>100||p.speed_R_per_s<0||p.speed_R_per_s>1)throw new Error('Invalid strand pulse');
    for(const point of points)if(!Array.isArray(point)||point.length!==4||!point.every(Number.isFinite)||Math.hypot(...point.slice(0,3))<.9||Math.hypot(...point.slice(0,3))>2.6||point[3]<1e-5||point[3]>.1)throw new Error('Invalid strand point');
    let arc=0;
    for(let i=1;i<points.length;i++){
      const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);
      if(length<1e-7)continue;if(++count>MAX_SEGMENTS)throw new Error('Strand segment budget exceeded');
      const radius=Math.hypot((a[0]+b[0])*.5,(a[1]+b[1])*.5,(a[2]+b[2])*.5);
      const gain=gains===undefined?1:(gains[i-1]+gains[i])*.5;
      data.push(...a.slice(0,3),(a[3]+b[3])*.5,...b.slice(0,3),strand.emission_relative*gain*Math.exp(-Math.max(0,radius-1)/.3),p.onset_s,p.duration_s,p.speed_R_per_s,p.amplitude,arc,p.width_R,length,0);
      arc+=length;
    }
  }
  return new Float32Array(data);
}
export function createSolarStrandRenderer(gl,{generation=1,onChange=(_status)=>{}}={}){
  const manager=createShaderPrograms(gl,{generation,capacity:1});let disposed=false,serial=0,buffer=null,vao=null,count=0,uniforms=null;
  let report={state:'deferred',reason:'',segments:0,estimatedBytes:0};
  const notify=()=>{if(!disposed)onChange({...report});};
  function release(){if(buffer)gl.deleteBuffer(buffer);if(vao)gl.deleteVertexArray(vao);buffer=null;vao=null;count=0;}
  async function prepare(packet){
    if(disposed)return false;const token=++serial;report={state:'loading',reason:'',segments:0,estimatedBytes:0};notify();
    try{
      const data=buildStrandInstances(packet);const ticket=manager.request('strands',SOLAR_STRAND_VS,SOLAR_STRAND_FS);const result=await ticket.done;
      if(disposed||token!==serial||gl.isContextLost())return false;
      if(result.status!=='ready')throw new Error(result.error||'Strand shader unavailable');
      const oldVAO=gl.getParameter(gl.VERTEX_ARRAY_BINDING),oldBuffer=gl.getParameter(gl.ARRAY_BUFFER_BINDING);
      release();
      try{
        buffer=gl.createBuffer();vao=gl.createVertexArray();if(!buffer||!vao)throw new Error('Strand allocation failed');
        gl.bindVertexArray(vao);gl.bindBuffer(gl.ARRAY_BUFFER,buffer);gl.bufferData(gl.ARRAY_BUFFER,data,gl.STATIC_DRAW);
        for(let i=0;i<4;i++){gl.enableVertexAttribArray(i);gl.vertexAttribPointer(i,4,gl.FLOAT,false,64,i*16);gl.vertexAttribDivisor(i,1);}
        if(gl.getError()!==gl.NO_ERROR)throw new Error('Strand upload failed');
      }finally{gl.bindVertexArray(oldVAO);gl.bindBuffer(gl.ARRAY_BUFFER,oldBuffer);}
      count=data.length/16;const program=manager.get('strands');uniforms=Object.fromEntries(['u_mvp','u_camera','u_rotation','u_seconds','u_channel','u_transfer','u_coolEnabled'].map(name=>[name,gl.getUniformLocation(program,name)]));
      report={state:'ready',reason:'',segments:count,estimatedBytes:data.byteLength};notify();return true;
    }catch(error){if(token===serial&&!disposed){release();report={state:'unavailable',reason:error.message,segments:0,estimatedBytes:0};notify();}return false;}
  }
  function draw({mvp,camera,seconds,channel='euv',linearOutput=true,outputMode='linear',coolEnabled=false}){
    if(disposed||report.state!=='ready'||gl.isContextLost()||!Number.isFinite(seconds)||seconds<0||seconds>21600||!linearOutput)return false;
    const program=manager.get('strands');if(!program)return false;
    const oldVAO=gl.getParameter(gl.VERTEX_ARRAY_BINDING),oldProgram=gl.getParameter(gl.CURRENT_PROGRAM),cull=gl.isEnabled(gl.CULL_FACE);
    try{
      gl.disable(gl.CULL_FACE);gl.useProgram(program);gl.bindVertexArray(vao);
      // Root rotates the complete Carrington frame into world space once.
      gl.uniformMatrix4fv(uniforms.u_mvp,false,new Float32Array(mvp));gl.uniform3fv(uniforms.u_camera,new Float32Array(camera));gl.uniform3f(uniforms.u_rotation,14.713-14.1844,-2.396,-1.787);
      gl.uniform1i(uniforms.u_coolEnabled,coolEnabled&&channel==='euv'?1:0);
      gl.uniform1f(uniforms.u_seconds,seconds);gl.uniform1i(uniforms.u_channel,channel==='visible'?1:0);gl.uniform1i(uniforms.u_transfer,outputMode==='transfer'?1:0);gl.drawArraysInstanced(gl.TRIANGLES,0,6,count);return true;
    }finally{gl.bindVertexArray(oldVAO);gl.useProgram(oldProgram);if(cull)gl.enable(gl.CULL_FACE);}
  }
  return {prepare,draw,status:()=>({...report}),dispose(){if(disposed)return;disposed=true;++serial;release();manager.dispose();report={state:'disposed',reason:'',segments:0,estimatedBytes:0};}};
}
