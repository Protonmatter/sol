// Coverage is not optical depth. Display constants are never promoted to measurements.
/** @typedef {{kind:'empty'|'opaque'|'depth',weight:number,tau?:number}} RingRegion */
/** @typedef {{kind:'display-opacity',opacity:number}|{kind:'resolved-mixture',regions:RingRegion[]}} RingMaterial */

/** Finite fixed-footprint mixture; geometrical support must be qualified separately.
 * @param {RingMaterial} material @param {number} cosine @param {number} [coverage] */
export function ringTransmission(material,cosine,coverage=1) {
  if(!Number.isFinite(cosine)||Math.abs(cosine)>1||!Number.isFinite(coverage)||coverage<0||coverage>1)
    throw new RangeError('Invalid ring cosine or coverage');
  if(material.kind==='display-opacity'){
    if(!Number.isFinite(material.opacity)||material.opacity<0||material.opacity>1)throw new RangeError('Invalid display opacity');
    return 1-coverage*material.opacity;
  }
  if(material.kind!=='resolved-mixture')throw new Error('Unsupported ring material; angular source admission required');
  if(Math.abs(cosine)<.02)throw new RangeError('Ring transport outside angular domain');
  if(!Array.isArray(material.regions)||!material.regions.length||material.regions.length>256)throw new RangeError('Ring region count exceeds budget');
  let totalWeight=0,transmitted=0;
  for(const region of material.regions){
    if(!Number.isFinite(region.weight)||region.weight<0)throw new RangeError('Invalid ring area weight');
    totalWeight+=region.weight;
    let value;
    if(region.kind==='empty')value=1;
    else if(region.kind==='opaque')value=0;
    else if(region.kind==='depth'){
      if(!Number.isFinite(region.tau)||region.tau<0)throw new RangeError('Invalid homogeneous optical depth');
      value=Math.exp(-region.tau/Math.abs(cosine));
    }else throw new Error('Unsupported ring subregion');
    transmitted+=region.weight*value;
  }
  if(Math.abs(totalWeight-1)>1e-12)throw new RangeError('Ring area weights must sum to one');
  return 1-coverage+coverage*transmitted;
}
