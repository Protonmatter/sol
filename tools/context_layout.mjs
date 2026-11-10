// Self-contained browser callback shared by Sky/System reflow checks. An explicit
// hidden ancestor is intentional conditional UI; zero CSS geometry without that
// signal remains a failure, including at narrow widths.
export function readContextLayout({requiredControls,visibleIds}) {
  const context=Array.from(document.querySelectorAll('#destinationOverview button:not([hidden])'));
  const hiddenContextControls=context.filter(node=>node.closest('[hidden]')).map(node=>({id:node.id,hiddenAncestor:node.closest('[hidden]').id||null}));
  const controls=[...context.filter(node=>!node.closest('[hidden]')),...document.querySelectorAll(requiredControls)];
  const clipped=controls.filter(node=>{
    const rect=node.getBoundingClientRect();return !rect.width||rect.left<0||rect.right>innerWidth+1;
  }).map(node=>node.id||node.textContent);
  return {layout:{overflow:document.documentElement.scrollWidth>innerWidth+1,clipped,
    visible:visibleIds.every(id=>document.getElementById(id)?.getClientRects().length>0)},hiddenContextControls};
}
