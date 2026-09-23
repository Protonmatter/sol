// Pure GPU evaluation of the Rust statistical appearance recipe. Units and
// lifetimes are model parameters, not measured convection or inferred plasma.
export const SOLAR_CELLULAR_GLSL = `
uint mixBits(uint x){x^=x>>16;x*=0x7feb352du;x^=x>>15;x*=0x846ca68bu;x^=x>>16;return x;}
uint rotateBits(uint x,uint n){return (x<<n)|(x>>(32u-n));}
uint cellHash(uint seed,ivec3 c,int generation){return mixBits(seed^mixBits(uint(c.x))^rotateBits(mixBits(uint(c.y)),11u)^rotateBits(mixBits(uint(c.z)),22u)^mixBits(uint(generation)));}
float unitBits(uint x){return float(x>>8)/16777216.0;}
vec3 domainWarp(vec3 x,uint seed){
  vec3 q=.18*x;ivec3 b=ivec3(floor(q));vec3 f=fract(q);f=f*f*f*(f*(f*6.-15.)+10.);
  vec3 result=vec3(0.);
  for(int z=0;z<2;z++)for(int y=0;y<2;y++)for(int xx=0;xx<2;xx++){
    ivec3 corner=ivec3(xx,y,z);vec3 weight=mix(vec3(1.)-f,f,vec3(corner));
    uint h=cellHash(seed^0x6a09e667u,b+corner,0);
    vec3 v=2.*vec3(unitBits(mixBits(h^0x100u)),unitBits(mixBits(h^0x101u)),unitBits(mixBits(h^0x102u)))-1.;
    result+=weight.x*weight.y*weight.z*v;
  }
  return x+1.25*result;
}
float cellular(vec3 p,float seconds,float scale,float lifetime,uint seed){
  vec3 x=p*scale;if(u_domainWarp!=0)x=domainWarp(x,seed);
  ivec3 base=ivec3(floor(x));vec2 nearest=vec2(1e20);
  float birth=lifetime*.5;
  for(int iz=-1;iz<=1;iz++)for(int iy=-1;iy<=1;iy++)for(int ix=-1;ix<=1;ix++){
    ivec3 c=base+ivec3(ix,iy,iz);
    float phase=unitBits(cellHash(seed,c,0))*birth;
    int generation=int(floor((seconds-phase)/birth));
    vec3 site=vec3(0);float weight=0.;
    for(int previous=0;previous<2;previous++){
      int g=generation-previous;float age=seconds-phase-float(g)*birth;
      float envelope=pow(sin(3.141592653589793*age/lifetime),2.);
      uint h=cellHash(seed,c,g);
      vec3 jitter=vec3(unitBits(mixBits(h^1u)),unitBits(mixBits(h^2u)),unitBits(mixBits(h^3u)));
      site+=envelope*(vec3(c)+.5+.4*(jitter-.5));weight+=envelope;
    }
    vec3 d=x-site/max(weight,1e-8);float distance2=dot(d,d);
    if(distance2<nearest.x){nearest.y=nearest.x;nearest.x=distance2;}else if(distance2<nearest.y)nearest.y=distance2;
  }
  return clamp(3.*(nearest.y-nearest.x)-.3,-1.,1.);
}
// EUV proxy has a different morphology from photospheric granulation: correlated
// multiscale emission, with smooth local change between deterministic epochs.
float correlatedNoise(vec3 q,uint seed,int generation){
  ivec3 b=ivec3(floor(q));vec3 f=fract(q);f=f*f*f*(f*(f*6.-15.)+10.);
  float value=0.;
  for(int z=0;z<2;z++)for(int y=0;y<2;y++)for(int x=0;x<2;x++){
    ivec3 corner=ivec3(x,y,z);vec3 w=mix(vec3(1.)-f,f,vec3(corner));
    value+=w.x*w.y*w.z*(2.*unitBits(cellHash(seed,b+corner,generation))-1.);
  }
  return value;
}
float euvStructure(vec3 p,float seconds,uint seed){
  vec3 q=domainWarp(p*(695700./10000.)*.35,seed);
  float epoch=seconds/1200.,f=fract(epoch);int g=int(floor(epoch));f=f*f*f*(f*(f*6.-15.)+10.);
  float result=0.;
  for(int i=0;i<3;i++){
    uint octaveSeed=seed^(0x9e3779b9u*uint(i+1));vec3 x=q*float(1<<i);
    float a=correlatedNoise(x,octaveSeed,g),b=correlatedNoise(x,octaveSeed,g+1);
    result+=mix(a,b,f)*(i==0?.55:i==1?.30:.15);
  }
  return clamp(result,-1.,1.);
}
vec4 euvHierarchyComponents(vec3 p,float seconds,uint seed,out float quietMeso){
  vec3 q=domainWarp(p*(695700./10000.)*.35,seed);
  float epoch=seconds/1200.,f=fract(epoch);int g=int(floor(epoch));f=f*f*f*(f*(f*6.-15.)+10.);
  vec3 n=vec3(0.);
  for(int i=0;i<3;i++){
    uint octaveSeed=seed^(0x9e3779b9u*uint(i+1));vec3 x=q*float(1<<i);
    n[i]=mix(correlatedNoise(x,octaveSeed,g),correlatedNoise(x,octaveSeed,g+1),f);
  }
  float quietBase=.5+.5*clamp(dot(n,vec3(.55,.30,.15)),-1.,1.);
  quietMeso=quietBase*quietBase;
  float coarseEpoch=seconds/21600.,cf=fract(coarseEpoch);int cg=int(floor(coarseEpoch));cf=cf*cf*cf*(cf*(cf*6.-15.)+10.);
  uint coarseSeed=seed^0xa54ff53au;
  float coarse=mix(correlatedNoise(q*.14,coarseSeed,cg),correlatedNoise(q*.14,coarseSeed,cg+1),cf);
  float hole=smoothstep(.08,.38,coarse);
  float ridge=max(0.,1.-abs(1.8*(.7*n.x+.3*n.y)));
  return vec4(hole,ridge*ridge*ridge,.5+.5*n.z,n.x);
}
vec4 euvHierarchyComponents(vec3 p,float seconds,uint seed){float unused;return euvHierarchyComponents(p,seconds,seed,unused);}
vec3 turnZ(vec3 p,float angle){float c=cos(angle),s=sin(angle);return vec3(c*p.x-s*p.y,s*p.x+c*p.y,p.z);}
float rotationAt(vec3 p,vec3 coefficients){float b=p.z/max(length(p),1e-8),s2=b*b;return dot(coefficients,vec3(1.,s2,s2*s2));}
float planckRatio(float temperature){float c=26159.579591;return (exp(c/5772.)-1.)/(exp(c/temperature)-1.);}
`;
