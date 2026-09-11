// A view summary is not a scientific snapshot or an accuracy qualification.
// Clone once at explicit preview so later clock/data updates cannot change a download.
const freeze=value=>{
  if(value && typeof value==="object"){Object.values(value).forEach(freeze);Object.freeze(value);}
  return value;
};
/** @param {any} input */
export function createViewEvidence({surface,presentation,releaseId="local-preview",exportedAt,bundleIdentity=null}) {
  if(!["today","sky","orrery"].includes(surface)||!presentation)throw new Error("A resolved view is required before export");
  return freeze(JSON.parse(JSON.stringify({schema_version:"sol-view-evidence.v1",surface,
    release_id:releaseId.startsWith("__SOL_")?"local-preview":releaseId,exported_at:exportedAt,
    presentation,bundle_identity:surface==="today"?bundleIdentity:null,
    scope:"Displayed explanatory revision only. Not an independent accuracy qualification, observation, or resumable model checkpoint."})));
}
