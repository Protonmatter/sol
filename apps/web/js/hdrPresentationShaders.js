export const HDR_PRESENT_VS = `#version 300 es
void main(){
  vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);
  gl_Position=vec4(p*2.0-1.0,0,1);
}`;

export const HDR_PRESENT_FS = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_scene;
uniform float u_exposure;
uniform int u_frameSerial,u_frameGeneration;
uniform float u_frameEpochHigh,u_frameEpochLow;
out vec4 o;
vec3 encodeOutput(vec3 c){
  return mix(c*12.92,1.055*pow(c,vec3(1.0/2.4))-.055,step(vec3(.0031308),c));
}
void main(){
  // Identity uniforms participate in the actual color-writing consumer, allowing
  // final-submission qualification to reject an offscreen or stale producer.
  if(u_frameSerial<1||u_frameGeneration<1||isnan(u_frameEpochHigh)||isnan(u_frameEpochLow))discard;
  vec3 scene=texelFetch(u_scene,ivec2(gl_FragCoord.xy),0).rgb;
  // Invalid material output is visibly rejected, never passed through a NaN
  // clamping/tone-map expression as if it were a legitimate black observation.
  if(any(isnan(scene))||any(isinf(scene))){o=vec4(1,0,1,1);return;}
  vec3 x=max(scene,vec3(0))*u_exposure;
  o=vec4(encodeOutput(x/(vec3(1)+x)),1);
}`;
