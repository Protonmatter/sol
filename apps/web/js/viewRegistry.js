// One untokened URL per immutable release namespace. No shared state across releases.
let researchRenderer=null,destinationRenderer=null;
export function registerResearchRenderer(renderer){
  if(typeof renderer?.prepare!=='function'||typeof renderer?.draw!=='function')throw new TypeError('Invalid Research renderer');
  researchRenderer=renderer;
}
export const getResearchRenderer=()=>researchRenderer;
export function registerDestinationRenderer(renderer){
  if(typeof renderer!=='function')throw new TypeError('Invalid destination renderer');
  destinationRenderer=renderer;
}
export const getDestinationRenderer=()=>destinationRenderer;
