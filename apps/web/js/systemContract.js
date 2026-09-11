// Computational bounds are not accuracy qualification. This covers the visible
// +/-5000-year explorer with explicit finite admission and no hidden clamping.
export const SYSTEM_ORDER=["Mercury","Venus","Earth","Mars","Jupiter","Saturn","Uranus","Neptune","Moon"];
// Publish a complete new coordinate set or nothing. The worker metadata is frozen;
// retaining it never leaves a partially updated body at a different render epoch.
export function projectSystemPositions(bodies, positions) {
  if(!positions || positions.length!==27 || bodies.length!==9) throw new Error("Fixed-size position ABI unavailable or invalid; reload a coherent release");
  const projected=[];
  for(let i=0;i<9;i++) {
    if(!Object.hasOwn(bodies,i)||bodies[i].name!==SYSTEM_ORDER[i]) throw new Error("System position body order mismatch");
    const x=positions[i*3],y=positions[i*3+1],z=positions[i*3+2],distance=Math.hypot(x,y,z);
    if(![x,y,z,distance].every(Number.isFinite)) throw new Error("Non-finite System coordinates");
    projected.push({...bodies[i],x_au:x,y_au:y,z_au:z,dist_au:distance});
  }
  const earth=projected[2];
  for(const body of projected) {
    body.geo_dist_au=Math.hypot(body.x_au-earth.x_au,body.y_au-earth.y_au,body.z_au-earth.z_au);
    if(!Number.isFinite(body.geo_dist_au)) throw new Error("Non-finite System distance");
  }
  return projected;
}
/** @param {any} input */
export function validateSystemRequest({unix}={}) {
  if (!Number.isFinite(unix)||unix<Date.UTC(-9999,0,1)/1000||unix>=Date.UTC(10000,0,1)/1000) throw new Error("System epoch outside computational years -9999 through 9999");
  return Object.freeze({unix});
}
export function assertSystemSnapshot(snapshot, unix) {
  validateSystemRequest({unix});
  if (!snapshot || snapshot.schema_version!=="system-snapshot.v1" || Object.keys(snapshot).some(k=>!["schema_version","jd_utc","bodies"].includes(k))
    || !Number.isFinite(snapshot.jd_utc) || Math.abs(snapshot.jd_utc-(unix/86400+2440587.5))>0.00000051
    || !Array.isArray(snapshot.bodies)||snapshot.bodies.length!==9) throw new Error("System snapshot identity or epoch mismatch");
  const allowed=new Set(["name","x_au","y_au","z_au","dist_au","geo_dist_au","speed_kms","phase_angle_deg","illuminated_fraction","magnitude","equilibrium_temp_k","mean_temp_k","a_au","ecc","inc_deg","node_deg","argp_deg"]);
  for(let i=0;i<9;i++) {
    const body=snapshot.bodies[i];
    if(!Object.hasOwn(snapshot.bodies,i)||!body||body.name!==SYSTEM_ORDER[i]||Object.keys(body).length!==allowed.size
      || Object.entries(body).some(([key,value])=>!allowed.has(key)||(key!=="name"&&value!==null&&!Number.isFinite(value)))
      || ["x_au","y_au","z_au","dist_au","geo_dist_au","speed_kms"].some(key=>!Number.isFinite(body[key])) || body.dist_au<=0 || body.geo_dist_au<0
      || Math.abs(Math.hypot(body.x_au,body.y_au,body.z_au)-body.dist_au)>4e-8) throw new Error("Invalid System body position");
    Object.freeze(body);
  }
  Object.freeze(snapshot.bodies);return Object.freeze(snapshot);
}
