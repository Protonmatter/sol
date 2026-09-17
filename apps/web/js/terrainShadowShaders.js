// GLSL ES 3.00 fragment include. Numeric R32F height data, never a color texture.
// Distances are physical kilometres in the body frame; displayed radius is not used.
// Shader and independent JS reference are tested on analytic fixtures and native grids.
export const TERRAIN_SHADOW_GLSL = `
uniform highp sampler2D u_terrainHeight;
uniform int u_terrainShadowEnabled;
// reference radius, minimum radius, maximum radius (km), prime-meridian U
uniform vec4 u_terrainShape;
uniform vec2 u_terrainPoles;
const int TERRAIN_SHADOW_STEPS=64;
const float TERRAIN_SHADOW_DISTANCE_KM=4096.0;
float terrainRowHeight(int x,int y,float fraction,ivec2 size){
  int x0=((x%size.x)+size.x)%size.x;
  int x1=(x0+1)%size.x;
  return mix(texelFetch(u_terrainHeight,ivec2(x0,y),0).r,
             texelFetch(u_terrainHeight,ivec2(x1,y),0).r,fraction);
}
float terrainHeightKm(vec3 direction){
  ivec2 size=textureSize(u_terrainHeight,0);
  float longitude=dot(direction.xy,direction.xy)>0.0?atan(direction.y,direction.x):0.0;
  float latitude=atan(direction.z,length(direction.xy));
  float u=fract(u_terrainShape.w+longitude*0.1591549430918953);
  float x=u*float(size.x)-0.5;
  float y=(0.5-latitude*0.3183098861837907)*float(size.y)-0.5;
  int ix=int(floor(x));float fx=fract(x);
  if(y<0.0)return mix(u_terrainPoles.x,terrainRowHeight(ix,0,fx,size),clamp((y+0.5)*2.0,0.0,1.0));
  if(y>float(size.y-1))return mix(u_terrainPoles.y,terrainRowHeight(ix,size.y-1,fx,size),clamp((float(size.y)-0.5-y)*2.0,0.0,1.0));
  int iy=int(floor(y));
  return mix(terrainRowHeight(ix,iy,fx,size),terrainRowHeight(ix,min(size.y-1,iy+1),fx,size),fract(y));
}
float terrainSunVisibility(vec3 surfaceKm,vec3 sunDirectionBody){
  if(u_terrainShadowEnabled!=1)return 1.0;
  ivec2 size=textureSize(u_terrainHeight,0);
  if(size.x<4||size.y<2||u_terrainShape.x<=0.0||u_terrainShape.y<=0.0||u_terrainShape.z<u_terrainShape.y)return 1.0;
  float r0=length(surfaceKm),lightLength=length(sunDirectionBody);
  if(r0<=0.0||lightLength<=0.0||any(isnan(surfaceKm))||any(isinf(surfaceKm))||any(isnan(sunDirectionBody))||any(isinf(sunDirectionBody)))return 1.0;
  float cellKm=u_terrainShape.x*3.141592653589793/float(size.y);
  float bias=clamp(cellKm*0.001,0.002,0.05);
  vec3 direction=surfaceKm/r0,light=sunDirectionBody/lightLength;
  float radius=max(r0,u_terrainShape.x+terrainHeightKm(direction))+bias;
  vec3 origin=direction*radius;
  float b=dot(origin,light),outer=u_terrainShape.z+2.0*bias;
  float discriminant=b*b-radius*radius+outer*outer;
  if(discriminant<=0.0)return 1.0;
  float root=sqrt(discriminant),start=max(0.0,-b-root),end=-b+root;
  if(end<=start)return 1.0;
  float inner=u_terrainShape.y-bias,innerDiscriminant=b*b-radius*radius+inner*inner;
  if(innerDiscriminant>=0.0&&-b-sqrt(innerDiscriminant)>0.0)return 0.0;
  float distance=min(end-start,TERRAIN_SHADOW_DISTANCE_KM);
  int samples=min(TERRAIN_SHADOW_STEPS,max(1,int(ceil(distance/(cellKm*0.5)))));
  float stepKm=distance/float(samples);
  for(int i=0;i<TERRAIN_SHADOW_STEPS;i++){
    if(i>=samples)break;
    vec3 q=origin+light*(start+(float(i)+0.5)*stepKm);
    if(length(q)+bias*0.25<u_terrainShape.x+terrainHeightKm(q))return 0.0;
  }
  return 1.0;
}
`;
