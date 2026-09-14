// Synthetic material shader include; real-body enablement requires source admission.
export const SURFACE_REFLECTION_GLSL=`
float reflectionFresnel(float c,float ni,float nt){
  if(ni==nt)return 0.0;
  float s2=(ni/nt)*(ni/nt)*(1.0-c*c);
  if(s2>=1.0)return 1.0;
  float t=sqrt(1.0-s2);
  float rs=(ni*c-nt*t)/(ni*c+nt*t),rp=(nt*c-ni*t)/(nt*c+ni*t);
  return 0.5*(rs*rs+rp*rp);
}
float reflectionMask(float c,float a2){return 2.0*c/(c+sqrt(a2+(1.0-a2)*c*c));}
float surfaceReflection(vec3 normal,vec3 incident,vec3 view,float alpha,float ni,float nt){
  float nl=dot(normal,incident),nv=dot(normal,view);
  if(nl<=0.0||nv<=0.0||alpha<0.05||alpha>1.0||ni<=0.0||nt<=0.0)return 0.0;
  vec3 sum=incident+view;
  if(dot(sum,sum)<=1e-20)return 0.0;
  vec3 halfDirection=normalize(sum);
  float nh=clamp(dot(normal,halfDirection),0.0,1.0),a2=alpha*alpha;
  float denominator=nh*nh*(a2-1.0)+1.0;
  float d=a2/(3.141592653589793*denominator*denominator);
  float f=reflectionFresnel(clamp(dot(incident,halfDirection),0.0,1.0),ni,nt);
  return d*reflectionMask(nl,a2)*reflectionMask(nv,a2)*f/(4.0*nl*nv);
}
`;
