// Engine-owned celestial reduction; this module only applies a supplied rotation
// and the geometric horizon projection. No independent precession model lives here.
const D = Math.PI / 180;
const cached = new WeakMap();
const vector = (ra, dec) => [Math.cos(dec*D)*Math.cos(ra*D), Math.cos(dec*D)*Math.sin(ra*D), Math.sin(dec*D)];
const dot = (a,b) => a.reduce((sum,x,i)=>sum+x*b[i],0);
export function altAz(ra, dec, lst, lat) {
  const h=(lst-ra)*D,d=dec*D,p=lat*D;
  const alt=Math.asin(Math.max(-1,Math.min(1,Math.sin(p)*Math.sin(d)+Math.cos(p)*Math.cos(d)*Math.cos(h))))/D;
  const az=Math.atan2(-Math.cos(d)*Math.sin(h),Math.sin(d)*Math.cos(p)-Math.sin(p)*Math.cos(d)*Math.cos(h))/D;
  return {alt,az:((az%360)+360)%360};
}
function validFrame(s) {
  const f=s.star_frame,m=f?.j2000_to_true_equatorial,o=f?.observer;
  if(f?.version!==1||typeof f.source!=="string"||!f.source||!Number.isFinite(f.jd_utc)||Math.abs(f.jd_utc-s.time.jd_utc)>2**-29) return false;
  if(!Number.isFinite(f.lst_deg)||f.lst_deg<0||f.lst_deg>=360||!o) return false;
  for(const key of ['terrestrial_lat_deg','terrestrial_lon_deg_east','elev_m']) if(!Number.isFinite(o[key])||o[key]!==s.observer[key]) return false;
  if(!Number.isFinite(o.polar_motion_corrected_lat_deg)||Math.abs(o.polar_motion_corrected_lat_deg)>90) return false;
  if(!Number.isFinite(o.polar_motion_corrected_lon_deg_east)) return false;
  if(!Array.isArray(m)||m.length!==3||m.some(r=>!Array.isArray(r)||r.length!==3||r.some(x=>!Number.isFinite(x)))) return false;
  for(let i=0;i<3;i++) for(let j=0;j<3;j++) if(Math.abs(dot(m[i],m[j])-(i===j?1:0))>1e-9) return false;
  const determinant=m[0][0]*(m[1][1]*m[2][2]-m[1][2]*m[2][1])-m[0][1]*(m[1][0]*m[2][2]-m[1][2]*m[2][0])+m[0][2]*(m[1][0]*m[2][1]-m[1][1]*m[2][0]);
  return Math.abs(determinant-1)<1e-9;
}
export function constellationFrame(snapshot) {
  if(cached.has(snapshot)) return cached.get(snapshot);
  let result;
  if(!validFrame(snapshot)) {
    result={available:false,status:'Constellations unavailable: this snapshot has no valid engine star frame.',project:()=>null};
  } else {
    const f=snapshot.star_frame, m=f.j2000_to_true_equatorial;
    // Angular matching accounts for input rounding, including across RA=0 and near
    // the pole. Ambiguous matches stay unmatched; never assign another star's PM.
    const stars=snapshot.bodies.filter(b=>b.kind==='star'&&[b.catalogue_ra_deg,b.catalogue_dec_deg,b.alt_deg,b.az_deg].every(Number.isFinite))
      .map(b=>({v:vector(b.catalogue_ra_deg,b.catalogue_dec_deg),b}));
    const limit=2*Math.sin(0.001*D/2),points=new Map();
    result={available:true,status:'Geometric horizon. Constellations use engine precession/nutation; matched catalogue stars include proper motion. Other vertices omit proper motion; annual aberration and parallax are omitted.',project(ra,dec){
      if(!Number.isFinite(ra)||!Number.isFinite(dec)||Math.abs(dec)>90) return null;
      const key=`${ra},${dec}`;
      if(points.has(key))return points.get(key);
      const v=vector(ra,dec), matches=stars.filter(s=>Math.hypot(...s.v.map((x,i)=>x-v[i]))<=limit);
      let p;
      if(matches.length===1) p={alt:matches[0].b.alt_deg,az:matches[0].b.az_deg};
      else {
        const [x,y,z]=m.map(row=>dot(row,v));
        p=altAz(Math.atan2(y,x)/D,Math.atan2(z,Math.hypot(x,y))/D,f.lst_deg,f.observer.polar_motion_corrected_lat_deg);
      }
      points.set(key,p);return p;
    }};
  }
  cached.set(snapshot,result);return result;
}
