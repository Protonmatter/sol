// Display color contracts, not calibrated reflectance/radiance. Numerical data,
// scientific palettes and relative moon contrast never opt into material filtering.
export function linearFilterReference(asset) {
  return asset?.role === 'surface' && asset.nodata === 'none'
    && (asset.body === 'Earth' || asset.body === 'Moon');
}

// Every pass opts in explicitly. Alpha is coverage/opacity and remains untouched.
// Legacy display recipes are evaluated first, then converted once for composition.
export const DISPLAY_COMPOSITION_GLSL = `
uniform int u_linearOutput;
vec3 displayToLinear(vec3 c){
  c=max(c,vec3(0));
  return mix(c/12.92,pow((c+.055)/1.055,vec3(2.4)),step(vec3(.04045),c));
}
vec3 displayOutput(vec3 c){return u_linearOutput==1 ? displayToLinear(c) : c;}
`;
