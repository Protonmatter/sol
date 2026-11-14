// Identity is available without enrichment. This policy only owns data requests.
export function catalogueDemand(state, {visible=new Map(),moons=[],withinValidity=true,hidden=false}={}) {
  if (!state.active || hidden) return {moons:false,stars:false};
  const parents=new Set(moons.map(m=>m.p));
  const focused=[state.anchor,state.selected];
  const moonFocus=focused.some(name=>parents.has(name)||moons.some(m=>m.n===name));
  const usefulParent=[...visible].some(([name,pixels])=>parents.has(name)&&pixels>=32);
  return {
    moons:!state.galaxy && withinValidity && (moonFocus || state.showMoons && usefulParent),
    stars:!!state.galaxy || state.objectGroup==='star'
      || !!String(state.objectQuery||'').trim() && ['all','star'].includes(state.objectGroup),
  };
}
