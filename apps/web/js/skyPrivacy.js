import { validateSkyWork } from "./skyLimits.js?v=dcca6290db";

export function normalizeRecipient(base) {
  if (!base) return "";
  const url=new URL(base,typeof location==="undefined"?"https://invalid.example/":location.href);
  if (!["http:","https:"].includes(url.protocol)||url.username||url.password||url.search||url.hash) throw new Error("Remote recipient must be an HTTP(S) endpoint without credentials, query or fragment");
  return url.href.replace(/\/+$/,"");
}

// Deliberately session-only: stored provider preferences cannot authorize transmission.
export class SkyConsent {
  recipient="";
  granted=false;
  setRecipient(base) { const next=normalizeRecipient(base);if(next!==this.recipient){this.recipient=next;this.granted=false;}return next; }
  grant() { if(!this.recipient)throw new Error("No configured recipient");this.granted=true; }
  revoke() { this.granted=false; }
  allows(base) { return this.granted&&Boolean(this.recipient)&&normalizeRecipient(base)===this.recipient; }
}

export function makeSkyPreview({lat,lon,elev,unix},base) {
  validateSkyWork({operation:"snapshot",lat,lon,elev,unix});
  const url=new URL(base);url.hash=`sky=${lat},${lon},${unix},${elev}`;
  return {url:url.href,text:`Includes precise latitude ${lat}°, longitude ${lon}° east, elevation ${elev} m, and time ${new Date(unix*1000).toISOString()} (Unix ${unix}). Anyone receiving this can read those values.`};
}

export function parseSkyLink(hash,now) {
  if(!hash.startsWith("#sky="))return null;
  const parts=hash.slice(5).split(",");
  const number=/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/;
  if(parts.length<2||parts.length>4||parts.some(part=>!number.test(part)))return null;
  const [lat,lon,unix=now,elev=0]=parts.map(Number);
  validateSkyWork({operation:"snapshot",lat,lon,elev,unix});
  return {lat,lon,elev,unix};
}
