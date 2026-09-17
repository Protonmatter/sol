// Exact scatteringResidual function from 89e1e28b226fa7346eaa53ecfa0d404dcbc37124.
vec4 scatteringResidual(vec3 p){
  ivec3 lo=ivec3(floor(p));vec3 f=fract(p),planes[4];
  // Uniform-grid monotone cubic Hermite interpolation in log residual space.
  // Harmonic slopes retain each interval's bounds. Undefined zero-source knots
  // use the original normalized linear extension, not an invented log floor.
  for(int z=0;z<4;z++){
    vec3 rows[4];
    for(int y=0;y<4;y++){
      vec3 values[4];
      for(int x=0;x<4;x++){
        vec4 sampleValue=scatteringSurfaceTexel(lo+ivec3(x-1,y-1,z-1));
        if(sampleValue.a<0.999999)return vec4(0);
        if(any(lessThanEqual(sampleValue.rgb,vec3(0))))return scatteringResidualLinear(p);
        values[x]=log(sampleValue.rgb);
      }
      rows[y]=scatteringCubic(values[0],values[1],values[2],values[3],f.x);
    }
    if(lo.y==0)rows[0]=2.0*rows[1]-rows[2];
    if(lo.y>=u_scatteringSurfaceSize.y-2)rows[3]=2.0*rows[2]-rows[1];
    planes[z]=scatteringCubic(rows[0],rows[1],rows[2],rows[3],f.y);
  }
  if(lo.z==0)planes[0]=2.0*planes[1]-planes[2];
  if(lo.z>=u_scatteringSurfaceSize.z-2)planes[3]=2.0*planes[2]-planes[1];
  return vec4(exp(scatteringCubic(planes[0],planes[1],planes[2],planes[3],f.z)),1);
}
