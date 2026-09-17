// Current source constants remain an angle-independent display shadow recipe.
// The 0.72 contrast factor is a preserved display convention, never measured depth.
export const RING_TRANSPORT_GLSL=`
float displayRingShadowTransmission(float displayOpacity,float geometricCoverage){
  return 1.0-0.72*geometricCoverage*displayOpacity;
}
// Future admitted homogeneous subregions use this before area-weighted summation.
float homogeneousRingTransmission(float tau,float cosine){
  return exp(-tau/abs(cosine));
}
float coveredRingTransmission(float mixedTransmission,float geometricCoverage){
  return 1.0-geometricCoverage+geometricCoverage*mixedTransmission;
}
`;
