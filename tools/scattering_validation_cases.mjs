// Independent physical ray fixtures and predeclared interpolation admission.
// These fixtures deliberately do not import the production coordinate helpers.
export const SCATTERING_QUALIFICATION_LIMITS=Object.freeze({
  scatteringAbsolute:2e-4,scatteringRelative:.01,zeroLeak:1e-7,
  transmissionAbsolute:1e-4,transmissionRelative:.002,displayAbsolute:2/255,
});
const unit=v=>{const length=Math.hypot(...v);return v.map(x=>x/length);};
const radians=degrees=>degrees*Math.PI/180;
const addScaled=(a,b,s)=>a.map((x,i)=>x+s*b[i]);
function frame(latitude){
  const a=radians(latitude);
  return {axis:[Math.cos(a),0,Math.sin(a)],u:[0,1,0],v:[-Math.sin(a),0,Math.cos(a)]};
}
function physical(vector,q){return [vector[0],vector[1],vector[2]*q];}
function transverse(basis,azimuth){
  return basis.u.map((x,i)=>x*Math.cos(azimuth)+basis.v[i]*Math.sin(azimuth));
}

/** Construct a surface point directly in Cartesian space, not via the field inverse. */
export function physicalSurfaceQuery(dataset,heightKm,angularFraction,azimuth){
  const {radiusKm:R,cameraRadius:D,polarRatio:q,latitude}=dataset,basis=frame(latitude),radius=R+heightKm;
  // Fraction 1 is the geometrical tangent. Values slightly beyond 1 exercise
  // normalized triangle endpoints and signed terrain endpoint support.
  const theta=Math.acos(radius/D)*angularFraction;
  const point=basis.axis.map((x,i)=>radius*(x*Math.cos(theta)+transverse(basis,azimuth)[i]*Math.sin(theta)));
  const surface=physical(point,q),camera=physical(basis.axis.map(x=>x*D),q),delta=surface.map((x,i)=>x-camera[i]);
  return {kind:'surface',surface,direction:unit(delta),maximum:Math.hypot(...delta),heightKm,angularFraction,azimuth};
}

/** Construct a unit ray with prescribed ellipsoidal closest approach. */
export function physicalLimbQuery(dataset,heightKm,azimuth){
  const basis=frame(dataset.latitude),s=(dataset.radiusKm+heightKm)/dataset.cameraRadius;
  const transformed=basis.axis.map((x,i)=>-x*Math.sqrt(1-s*s)+transverse(basis,azimuth)[i]*s);
  return {kind:'limb',surface:[0,0,0],direction:unit(physical(transformed,dataset.polarRatio)),maximum:1e20,heightKm,azimuth};
}

/** Fixed coverage, including joint off-grid angles/heights and near-domain cameras. */
export function scatteringQualificationCases(getProfile,bodyCatalogue={}){
  const catalogueQ=body=>bodyCatalogue[body]?bodyCatalogue[body].polarKm/bodyCatalogue[body].radiusKm:body==='Earth'?.9966:.9941;
  const definitions=[
    ['Earth-day','Earth',8000,0,0,catalogueQ('Earth'),false],
    ['Earth-night','Earth',8000,0,180,.9966,false],
    ['Earth-terminator-pole','Earth',16000,90,89.97,.9966,false],
    ['Earth-forward-oblique','Earth',100000,43,178.7,.9966,false],
    ['Earth-near-top','Earth',6478.237,17,90.03,.9966,false],
    ['Earth-elevated-10km','Earth',12000,-37,74,1,'elevated'],
    ['Earth-distant-diagnostic','Earth',637813.7,61,113.71,.9966,false],
    ['Mars-day-terrain','Mars',5000,0,0,catalogueQ('Mars'),true],
    ['Mars-night-terrain','Mars',9000,43,180,.9941,true],
    ['Mars-terminator-terrain','Mars',7000,70,90.03,.9941,true],
    ['Mars-forward-terrain','Mars',67923.8,-37,178.7,.9941,true],
    ['Mars-near-top-terrain','Mars',3496.29,31,89.97,.9941,true],
    ['Mars-spherical','Mars',10000,90,128.79,1,false],
  ];
  return definitions.map(([name,body,cameraRadius,latitude,phase,polarRatio,terrain])=>{
    const profile=getProfile(body),basis=frame(latitude),axis=basis.axis;
    const physicalCameraAxis=unit(physical(axis,polarRatio));
    const sunDirectionBody=unit(addScaled(physicalCameraAxis.map(x=>x*Math.cos(radians(phase))),basis.u,Math.sin(radians(phase))));
    const radiusKm=profile.radiusKm,topKm=profile.topKm,cameraBodyKm=physical(axis.map(x=>x*cameraRadius),polarRatio);
    const referenceRadiusKm=!terrain&&bodyCatalogue[body]?bodyCatalogue[body].radiusKm:radiusKm;
    const bounds=terrain===true?{minRadiusKm:3373.069,maxRadiusKm:3417.241}:terrain==='elevated'?{minRadiusKm:radiusKm+10,maxRadiusKm:radiusKm+10}:{referenceRadiusKm};
    const dataset={name,body,profile,radiusKm,topKm,cameraRadius,latitude,phase,polarRatio,bounds,
      options:{cameraBodyKm,sunDirectionBody,polarRatio,solarDistanceAu:1,exposure:1},queries:[]};
    const minHeight=terrain===true?bounds.minRadiusKm-radiusKm:terrain?0:referenceRadiusKm-radiusKm;
    const maxHeight=terrain?bounds.maxRadiusKm/polarRatio-radiusKm:minHeight;
    const heights=terrain===true?[minHeight,-22.37,-7.13,-.001,0,.001,3.37,20.73,maxHeight]:terrain?[0,.1,3.37,10]:[minHeight];
    const fractions=[0,.173,.513,.873,.993,1,1.001,1.03];
    const azimuths=[0,1e-8,Math.PI/128,.741,Math.PI/2,2.711,Math.PI,4.337,2*Math.PI-1e-8];
    for(const height of heights)for(const fraction of fractions)for(const azimuth of azimuths)
      dataset.queries.push(physicalSurfaceQuery(dataset,height,fraction,azimuth));
    for(const height of [0,.001,.1,2,10,37.13,topKm-.001,topKm])for(const azimuth of azimuths)
      dataset.queries.push(physicalLimbQuery(dataset,height,azimuth));
    // A deterministic low-discrepancy sequence covers joint off-grid geometry.
    for(let i=1;i<=48;i++){
      const h=terrain?minHeight+(maxHeight-minHeight)*((i*.7548776662466927)%1):minHeight;
      dataset.queries.push(physicalSurfaceQuery(dataset,h,((i*.569840290998)%1)*1.02,2*Math.PI*((i*.6180339887498949)%1)));
    }
    dataset.queries.forEach((query,index)=>{query.name=`${name}/${query.kind}/${index}`;});
    return dataset;
  });
}

export function linearToDisplay(value){
  const x=Math.max(0,Math.min(1,value));
  return x<=.0031308?12.92*x:1.055*x**(1/2.4)-.055;
}

/** A separate display interpolation budget, not calibration or solver equivalence. */
export function assessScatteringSample(measured,reference){
  const limits=SCATTERING_QUALIFICATION_LIMITS,failures=[];
  if(!measured||!reference||['scattering','transmission','color'].some(key=>
    !Array.isArray(measured[key])||!Array.isArray(reference[key])||measured[key].length!==4||reference[key].length!==4))
    return {passed:false,failures:['malformed result'],maxScatteringError:null,maxDisplayError:null};
  let maxScatteringError=0,maxDisplayError=0;
  for(const key of ['scattering','transmission','color'])if(![...measured[key],...reference[key]].every(Number.isFinite))failures.push(`${key}: non-finite result`);
  if(Math.abs(measured.scattering[3]-1)>1e-6||Math.abs(reference.scattering[3]-1)>1e-6)failures.push('invalid scattering alpha');
  if([...measured.scattering.slice(0,3),...reference.scattering.slice(0,3)].some(value=>value<0))failures.push('negative scattering');
  for(let c=0;c<3;c++){
    const expected=reference.scattering[c],delta=Math.abs(measured.scattering[c]-expected);
    const allowed=expected===0?limits.zeroLeak:limits.scatteringAbsolute+limits.scatteringRelative*Math.abs(expected);
    if(delta>allowed)failures.push(`scattering[${c}]: ${delta} > ${allowed}`);
    maxScatteringError=Math.max(maxScatteringError,delta);
    const dt=Math.abs(measured.transmission[c]-reference.transmission[c]);
    const transmissionAllowed=reference.transmission[c]===0?limits.zeroLeak:limits.transmissionAbsolute+limits.transmissionRelative*Math.abs(reference.transmission[c]);
    if(dt>transmissionAllowed)failures.push(`transmission[${c}]: ${dt} > ${transmissionAllowed}`);
    const ds=Math.abs(linearToDisplay(measured.color[c])-linearToDisplay(reference.color[c]));
    if(ds>limits.displayAbsolute)failures.push(`display[${c}]: ${ds} > ${limits.displayAbsolute}`);
    maxDisplayError=Math.max(maxDisplayError,ds);
  }
  return {passed:failures.length===0,failures,maxScatteringError,maxDisplayError};
}

/** The actual shell excludes solid-body rays before calling the field. Float32
 * upload may change the topology of an ideal tangent; retain its raw result but
 * qualify shell output under the same GPU predicate used by the material. */
export function assessScatteringQuery(query,measured,reference){
  const raw=assessScatteringSample(measured,reference);
  if(query.kind!=='limb')return {...raw,domain:'surface',raw_assessment:raw};
  const finite4=value=>Array.isArray(value)&&value.length===4&&value.every(Number.isFinite);
  if(!finite4(reference.domain)||!finite4(measured.domain)||!finite4(reference.shell)||!finite4(measured.shell))
    return {...raw,passed:false,domain:'invalid-diagnostic',failures:[...raw.failures,'missing or invalid shell diagnostic'],raw_assessment:raw};
  const [groundStart,groundEnd,outerStart,outerEnd]=reference.domain;
  const ground=groundEnd>0&&groundStart>=0,empty=outerEnd<=Math.max(0,outerStart);
  const domain=ground?'solid-body-occluded':empty?'no-atmosphere-intersection':'visible-limb';
  if(ground||empty){
    const passed=[...measured.shell,...reference.shell].every(value=>Math.abs(value)<=SCATTERING_QUALIFICATION_LIMITS.zeroLeak);
    return {passed,domain,failures:passed?[]:['discarded/outside ray produced nonzero shell output'],
      maxScatteringError:raw.maxScatteringError,maxDisplayError:raw.maxDisplayError,raw_assessment:raw};
  }
  const failures=[...raw.failures];
  for(let c=0;c<4;c++){
    const expected=reference.shell[c];
    const allowed=expected===0?SCATTERING_QUALIFICATION_LIMITS.zeroLeak:c===3?
      SCATTERING_QUALIFICATION_LIMITS.transmissionAbsolute+SCATTERING_QUALIFICATION_LIMITS.transmissionRelative*Math.abs(expected):SCATTERING_QUALIFICATION_LIMITS.displayAbsolute;
    if(Math.abs(measured.shell[c]-expected)>allowed)failures.push(`actual shell[${c}] exceeds ${allowed}`);
  }
  return {...raw,passed:failures.length===0,domain,failures,raw_assessment:raw};
}
