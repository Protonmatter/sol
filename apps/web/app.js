// Entry module: wires DOM events to the feature modules and kicks off loading.
// The app is split into ES modules under ./js/ — see docs/HANDOFF.md.

import { store } from "./js/store.js";
import { renderAll, updateTaskHeader, currentViewPresentation } from "./js/view.js";
import { updateModeButtons } from "./js/surfaceNavigation.js";
import { showTip, hideTip, isTipHidden } from "./js/tooltip.js";
import { registerOfflineRelease } from "./js/releaseClient.js";
import { createViewEvidence } from "./js/viewEvidence.js";
import { workspace, renderWorkspace, openInspector, revealWorkspaceControl } from "./js/workspace.js";
import { explorer, initExplorer } from "./js/explorer.js";
import {createViewLoader} from './js/viewLoader.js';
import {createDocumentRecovery} from './js/catalogueLoader.js';
import {registerDestinationRenderer} from './js/viewRegistry.js';
import {initObservationMedia} from './js/observationMedia.js';
import {afterObservationPaint} from './js/offlineBoot.js';

// Resolves after the native offline attempt captures its original DOM owners,
// or when this preview cannot register. UI fixtures await this before cloning.
let markOfflineStartup=(_status)=>{};
export const offlineStartup=new Promise(resolve=>{markOfflineStartup=resolve;});

const loadedViews={research:null,sky:null,orrery:null};
const viewNames={research:'Solar research',sky:'My Sky',orrery:'Solar System'};
let activeView='observe',retryFocus=false;
// "Retry this view" re-imports first. If the browser still holds the earlier failure and
// the view's code is reachable again, the page reloads into the saved view. This module
// and the page that loads it share a directory, so the page's base resolves the same URLs.
const reloadWhenReachable=(...paths)=>createDocumentRecovery({urls:()=>paths.map(path=>new URL(path,document.baseURI).href)});
const viewCode=createViewLoader({
  loaders:{
    research:()=>import('./js/research.js'),
    sky:async()=>{const [view,overview]=await Promise.all([import('./js/sky.js'),import('./js/destinationOverview.js')]);return {...view,overview};},
    orrery:async()=>{const [view,overview]=await Promise.all([import('./js/orrery.js'),import('./js/destinationOverview.js')]);return {...view,overview};},
  },
  recoveries:{
    research:reloadWhenReachable('./js/research.js'),
    sky:reloadWhenReachable('./js/sky.js','./js/destinationOverview.js'),
    orrery:reloadWhenReachable('./js/orrery.js','./js/destinationOverview.js'),
  },
  onState(state){
    document.body.setAttribute('data-view-code',state.status);
    document.body.setAttribute('data-view-code-name',state.name);
    document.body.setAttribute('data-view-initialized',String(state.name==='observe'||state.initialized===true));
    const busy=['loading','activating','paused'].includes(state.status),failed=state.status==='failed';
    const panel=document.getElementById('viewCodePanel'),status=document.getElementById('viewCodeStatus'),retry=document.getElementById('viewCodeRetry');
    if(panel)panel.hidden=!busy&&!failed;
    if(status)status.textContent=failed?`${viewNames[state.name]} could not be prepared. Retry when this view is available.`:busy?`Preparing ${viewNames[state.name]}…`:'';
    if(retry)retry.hidden=!failed;
    for(const [name,selector]of [['research','.sun-section, #timeline, .context-card'],['sky','.sky-panel'],['orrery','.orrery-panel, #systemJumps']]){
      for(const node of document.querySelectorAll(selector)){
        const ready=state.name===name&&state.status==='ready';
        node.toggleAttribute('inert',!ready);node.setAttribute('aria-busy',String(state.name===name&&busy));
      }
    }
    if(state.status==='ready'&&retryFocus&&document.activeElement===status&&!document.hidden)document.getElementById('viewTitle')?.focus();
    if(!failed&&!busy)retryFocus=false;
    updateTaskHeader();
  },
  async onReady(name,module,owner){
    if(!owner.isCurrent())return;
    if(document.hidden){viewCode.pauseLoading();return;}
    loadedViews[name]=module;
    if(module.overview)registerDestinationRenderer(module.overview.renderDestinationOverview);
    if(name==='research')module.enterResearch();
    else {
      renderAll();
      if(name==='sky')module.enterSky();
      else await module.enterOrrery();
    }
    if(!owner.isCurrent())return;
    if(document.hidden){viewCode.pauseLoading();return;}
    // Research entry owns its complete render; other views need this final refresh.
    if(name!=='research')renderAll();
  },
});
// All activation rejections have an observer; the controller renders recoverable
// failure. Cancellation resolves null and never starts an inactive view.
const observeActivation=task=>task.catch(()=>null);
function selectView(){
  const name=store.activeMode==='today'?(explorer.mode==='observe'?'observe':'research'):store.activeMode;
  if(name!==activeView){
    loadedViews.research?.leaveResearch();loadedViews.sky?.leaveSky();loadedViews.orrery?.leaveOrrery();
    activeView=name;retryFocus=false;
  }
  updateModeButtons();
  const activation=observeActivation(viewCode.activate(name));
  renderAll();
  return activation;
}
document.getElementById('viewCodeRetry')?.addEventListener('click',()=>{
  retryFocus=document.activeElement===document.getElementById('viewCodeRetry');
  if(retryFocus)document.getElementById('viewCodeStatus')?.focus();
  observeActivation(viewCode.retry());
});
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){retryFocus=false;viewCode.pauseLoading();}
  else observeActivation(viewCode.resumeLoading());
});
document.addEventListener('focusin',event=>{if(event.target!==document.getElementById('viewCodeStatus'))retryFocus=false;});
document.addEventListener('pointerdown',()=>{retryFocus=false;},true);
if(document.hidden)viewCode.pauseLoading();
function chooseExperience(mode, tools = false) {
  explorer.choose(mode);
  if(mode==='research')loadedViews.research?.selectResearchModel();
  if(mode==='observe'){workspace.setInspector('today',false);workspace.timelineOpen=false;}
  if(tools)openInspector('today');
  const activation=selectView();
  if(tools)document.getElementById('inspectorClose')?.focus();
  window.dispatchEvent(new Event('resize'));
  return activation;
}
window.addEventListener("sol:presentation", updateTaskHeader);
let previewEvidence=null;
document.getElementById("viewEvidencePreview")?.addEventListener("click",()=>{
  const presentation=currentViewPresentation();
  const output=document.getElementById("viewEvidenceJson"),panel=document.getElementById("viewEvidencePanel"),download=document.getElementById("viewEvidenceDownload");
  try {
    previewEvidence=createViewEvidence({surface:store.activeMode,presentation,releaseId:"__SOL_RELEASE_ID__",exportedAt:new Date().toISOString(),bundleIdentity:store.activeMode==='today'&&explorer.mode==='observe'?null:store.dataBundleIdentity});
    if(output)output.textContent=JSON.stringify(previewEvidence,null,2);download?.removeAttribute("disabled");
  } catch(error) {previewEvidence=null;if(output)output.textContent=error.message;download?.setAttribute("disabled","");}
  if(panel)panel.hidden=false;output?.focus();
});
document.getElementById("viewEvidenceCancel")?.addEventListener("click",()=>{previewEvidence=null;const panel=document.getElementById("viewEvidencePanel");if(panel)panel.hidden=true;document.getElementById("viewEvidencePreview")?.focus();});
document.getElementById("viewEvidenceDownload")?.addEventListener("click",()=>{
  if(!previewEvidence)return;
  const url=URL.createObjectURL(new Blob([JSON.stringify(previewEvidence,null,2)+"\n"],{type:"application/json"})),link=document.createElement("a");
  link.href=url;link.download="sol-view-evidence.v1.json";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});

// --- Surface tabs ---
document.querySelectorAll(".mode-button").forEach((button) => {
  button.addEventListener("click", () => {
    store.activeMode = /** @type {HTMLElement} */ (button).dataset.mode;

    // The onboarding tour is about the Sun; don't let it linger over the sky / solar-system
    // surfaces. Guard on an OPEN tour (like the Escape handler below): calling endTour()
    // unconditionally wrote sol-tour-seen and stole focus to the (about-to-hide) tour CTA
    // on every tab click — first-time visitors who clicked a tab never saw the tour at all.
    if ((store.activeMode === "sky" || store.activeMode === "orrery") && store.tourIndex >= 0) loadedViews.research?.endResearchTour();
    selectView();
    try { localStorage.setItem("sol-surface", store.activeMode); } catch (_) { /* session-only */ }
  });
});

// --- Responsive re-render ---
let resizeTimer = 0;
window.addEventListener("resize", () => {
  window.clearTimeout(resizeTimer);
  resizeTimer = window.setTimeout(() => {
    renderAll("resize");
    loadedViews.sky?.resizeSky(); // the sky dome sizes its backing store on draw; frozen time never redraws otherwise
    if (store.tourIndex >= 0) loadedViews.research?.showResearchTourStep();
  }, 120);
});

// --- Glossary tooltips ---
document.addEventListener("mouseover", (event) => {
  const target = /** @type {Element} */ (event.target)?.closest?.("[data-term]");
  if (target && !store.tipPinned) showTip(target);
});
document.addEventListener("mouseout", (event) => {
  const target = /** @type {Element} */ (event.target)?.closest?.("[data-term]");
  if (target && !store.tipPinned) hideTip();
});
document.addEventListener("focusin", (event) => {
  const target = /** @type {Element} */ (event.target)?.closest?.("[data-term]");
  if (target) showTip(target);
});
document.addEventListener("focusout", (event) => {
  const target = /** @type {Element} */ (event.target)?.closest?.("[data-term]");
  if (target && !store.tipPinned) hideTip();
});
document.addEventListener("click", (event) => {
  const target = /** @type {Element} */ (event.target)?.closest?.("[data-term]");
  if (target) {
    event.preventDefault();
    if (store.tipPinned && !isTipHidden()) hideTip();
    else { showTip(target); store.tipPinned = true; }
  } else if (store.tipPinned) {
    hideTip();
  }
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideTip();
    if (store.tourIndex >= 0) loadedViews.research?.endResearchTour();
    return;
  }
  // Enter/Space activates the role="button" spans (stage steps, legend/signal chips):
  // real buttons synthesize click from the keyboard, spans don't — so AT announced
  // "button" on elements that keyboard users couldn't actually press.
  if (event.key !== "Enter" && event.key !== " ") return;
  const target = /** @type {Element} */ (event.target);
  if (target instanceof HTMLElement && target.matches('[role="button"][data-term]')) {
    event.preventDefault();
    target.click();
  }
});

// --- Onboarding tour controls ---
document.getElementById("tourStart")?.addEventListener("click", async () => {
  explorer.choose('research');store.activeMode='today';
  loadedViews.research?.selectResearchModel();
  const module=await selectView();
  if(module&&viewCode.state.name==='research'&&viewCode.state.status==='ready'&&!document.hidden)module.startResearchTour();
});
document.getElementById("sourcesLink")?.addEventListener("click", () => {
  const details = /** @type {HTMLDetailsElement|null} */ (document.getElementById("sourcesAndLimits"));
  if (details) details.open = true;
});
// --- Collapsible / pinned control panel (for an unobstructed full-bleed 3-D view) ---
document.getElementById("panelToggle")?.addEventListener("click", () => {
  const open = !workspace.inspectorVisible(store.activeMode);
  workspace.focus = false;
  workspace.setInspector(store.activeMode, open);
  renderWorkspace(store.activeMode);
});
document.getElementById("inspectorClose")?.addEventListener("click", () => {
  workspace.setInspector(store.activeMode, false);
  document.getElementById("panelToggle")?.focus();
  renderWorkspace(store.activeMode);
});
document.getElementById("focusToggle")?.addEventListener("click", () => {
  workspace.focus = !workspace.focus;
  renderWorkspace(store.activeMode);
});
const revealTime = () => {
  workspace.focus = false;
  if (store.activeMode === "today") workspace.timelineOpen = !workspace.timelineOpen;
  else openInspector(store.activeMode);
  renderWorkspace(store.activeMode);
  if (store.activeMode === "today" && workspace.timelineOpen) {
    document.getElementById('timeline')?.scrollIntoView({block:'nearest',behavior:'auto'});
    document.getElementById('journeyTitle')?.focus({preventScroll:true});
  } else if (store.activeMode !== "today") revealWorkspaceControl(store.activeMode, store.activeMode === 'sky' ? 'skyTime' : 'orreryTime');
};
document.getElementById("timelineToggle")?.addEventListener("click", revealTime);
document.getElementById('timelineClose')?.addEventListener('click',()=>{
  if(store.activeMode!=='today'||!workspace.timelineOpen||workspace.focus)return;
  workspace.timelineOpen=false;renderWorkspace(store.activeMode);
  document.getElementById('timelineToggle')?.focus();
});
document.querySelectorAll('a[href="#timeline"]').forEach(link => link.addEventListener("click", () => {
  workspace.timelineOpen = true; workspace.focus = false; renderWorkspace(store.activeMode);
}));
window.addEventListener("sol:object-selected", event => {
  const surface = /** @type {CustomEvent} */ (event).detail?.surface;
  if (surface === store.activeMode) {
    if (surface === 'today') openInspector(surface);
    else { workspace.focus = false; renderWorkspace(surface); updateTaskHeader(); }
  }
});

for (const [id, skyTarget, systemTarget] of [
  ['destinationSearch', 'skySearch', 'orrerySearch'],
  ['destinationDetails', 'skySelectedFacts', 'orreryDetail'],
  ['destinationLocation', 'skyLat', 'orreryTime'],
  ['destinationEarthLayers', 'skySelectedFacts', 'orreryEarthNight'],
]) document.getElementById(id)?.addEventListener('click', () => {
  if (id === 'destinationDetails' && store.activeMode === 'orrery' && store.orrery?.galaxy && !store.orrery?.selectedStar) return;
  revealWorkspaceControl(store.activeMode, store.activeMode === 'sky' ? skyTarget : systemTarget);
});
document.getElementById('destinationTime')?.addEventListener('click', revealTime);
const focusBody = body => {
  const anchor = /** @type {HTMLSelectElement|null} */ (document.getElementById('orreryAnchor'));
  if (store.activeMode !== 'orrery' || !anchor) return;
  // #orreryAnchor lists the planets and Earth's Moon only, but the renderer anchors on any
  // catalogue moon (anchorPos/anchorDisplayExtent both resolve one, and follow its parent
  // outside the validated window). Its own Focus control takes the current selection, so a
  // moon card's action goes there instead of advertising a button that does nothing.
  if (![...anchor.options].some(option => option.value === body)) {
    if (body && store.orrery?.selected === body) document.getElementById('orreryFocusSelected')?.click();
    return;
  }
  const freeFly = /** @type {HTMLInputElement|null} */ (document.getElementById('orreryFreeFly'));
  if (freeFly?.checked) { freeFly.checked = false; freeFly.dispatchEvent(new Event('change')); }
  anchor.value = body; anchor.dispatchEvent(new Event('change')); updateTaskHeader();
};
document.getElementById('destinationFocus')?.addEventListener('click', event => {
  const body=/** @type {HTMLElement} */ (event.currentTarget).dataset.body;
  if(store.activeMode==='orrery'&&body==='Sun')document.getElementById('orreryInspectSun')?.click();
  else focusBody(body);
});
for (const button of document.querySelectorAll('[data-camera-body]')) button.addEventListener('click', () => focusBody(/** @type {HTMLElement} */ (button).dataset.cameraBody));
document.addEventListener("keydown", event => {
  if (event.key === "Escape" && store.tourIndex < 0 && workspace.focus) {
    workspace.focus = false; renderWorkspace(store.activeMode); document.getElementById("focusToggle")?.focus();
  }
});

// --- Boot ---
initExplorer(chooseExperience, updateTaskHeader);
// Route the initial surface: a #sky= share link outranks the remembered surface, which
// outranks the default. Share-link recipients used to land on the Sun surface with no
// hint their link encoded a sky view; everyone else lost their place on every reload.
(() => {
  let target = null;
  if (/#sky=/.test(location.hash)) target = "sky";
  else {
    try {
      const saved = localStorage.getItem("sol-surface");
      if (saved === "sky" || saved === "orrery") target = saved;
    } catch (_) { /* storage unavailable */ }
  }
  if (target) {
    /** @type {HTMLElement|null} */ (document.querySelector(`.mode-button[data-mode="${target}"]`))?.click();
  }
})();
selectView();
document.body.setAttribute('data-app-ready','true');

// Source preview has no release manifest, so only staged builds register an offline worker.
const releaseBasePath = "__SOL_BASE_PATH__";
if ("serviceWorker" in navigator && !releaseBasePath.startsWith("__")) {
  const status=document.getElementById('releaseStatus');
  if(status)status.textContent='Offline copy waits for the saved observation.';
  afterObservationPaint({media:initObservationMedia(document),
    install:()=>{
      const pending=registerOfflineRelease({serviceWorker:navigator.serviceWorker,location,document,basePath:releaseBasePath,releaseId:"__SOL_RELEASE_ID__"});
      markOfflineStartup('requested');return pending;
    },
    onError:()=>{markOfflineStartup('unavailable');if(status)status.textContent='Offline installation unavailable; this tab retains its current release.';},
  });
}else markOfflineStartup('skipped');
