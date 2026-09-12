import { validateSkyWork } from "./skyLimits.js?v=dcca6290db";

export function skyRows(bodies,query="",group="all",selected=null) {
  const q=query.trim().toLowerCase();
  return bodies.map(b=>{
    const category=b.name==="Sun"||b.name==="Moon"?"sunmoon":b.kind==="star"?"stars":"planets";
    const matches=group==="all"||group===category||(group==="above"&&b.alt_deg>0)||(group==="below"&&b.alt_deg<=0);
    return {id:b.name,selected:selected===b.name,hidden:!matches||!b.name.toLowerCase().includes(q),className:"sky-row sky-object-row",label:`${b.name} · ${b.alt_deg>0?"Above":"At/below"} geometric horizon · altitude ${b.alt_deg.toFixed(2)}° · azimuth ${b.az_deg.toFixed(2)}°`};
  });
}

export function formatSkyTimeInput(unix,mode="device") {
  const d=new Date(unix*1000),get=part=>d[`${mode==="utc"?"getUTC":"get"}${part}`](),p=n=>String(n).padStart(2,"0");
  return `${String(get("FullYear")).padStart(4,"0")}-${p(get("Month")+1)}-${p(get("Date"))}T${p(get("Hours"))}:${p(get("Minutes"))}`;
}

export function parseSkyTime(text,mode="device") {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(text)) throw new Error("Enter a valid Gregorian date and time");
  const unix=new Date(text+(mode==="utc"?"Z":"")).getTime()/1000;
  validateSkyWork({operation:"snapshot",lat:0,lon:0,elev:0,unix});
  if (formatSkyTimeInput(unix,mode)!==text) throw new Error("Invalid calendar date or nonexistent device-local time; use UTC for an unambiguous instant");
  return unix;
}
