// Self-contained validator predicates, serialized into the GPU fixture.
export function evaluatePhysicalMaterialPixel(actual,reference,tolerance=1e-6){
  const finite=values=>Array.isArray(values)&&values.length===4&&values.every(Number.isFinite);
  const actualWritten=finite(actual)&&actual[3]===1,referenceWritten=finite(reference)&&reference[3]===1;
  return {actualWritten,referenceWritten,passed:actualWritten&&referenceWritten
    &&actual.every((v,i)=>Math.abs(v-reference[i])<=tolerance)};
}

export function physicalMaterialMapping(body,appearance){
  const latitude={Earth:2,Mars:1}[body];
  if(!latitude||appearance?.map?.[2]!==latitude)throw new Error('Physical fixture source latitude contract changed');
  return {map:[...appearance.map],lat:[...appearance.lat],window:[...appearance.window],nodata:appearance.nodata};
}

export function evaluatePhysicalPresentation(actual,linear){
  const valid=Array.isArray(linear)&&linear.length===4&&linear.every(Number.isFinite)&&linear[3]===1;
  const expected=valid?[...linear.slice(0,3).map(value=>{
    const x=Math.max(0,value)/(1+Math.max(0,value));
    return Math.round(255*(x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055));
  }),255]:[];
  // RGBA16F producer quantization and final UNORM8 rounding; exact
  // consumer/reference equality remains an additional independent requirement.
  const tolerance=2;
  return {expected,tolerance,passed:valid&&Array.isArray(actual)&&actual.length===4&&actual[3]===255
    &&actual.every((value,i)=>Number.isFinite(value)&&Math.abs(value-expected[i])<=tolerance)};
}
