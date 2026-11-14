import {writeText,writeAttribute,writeBoolean} from './domWrites.js';

// The observation browser is a presentation of a preserved image, not a model frame.
import { getSolarObservation } from './solarObservation.js';
import { SUN_RADIUS_KM, SUN_MEAN_TEMP_K } from './sunFacts.js';
import { initObservationMedia } from './observationMedia.js';

export function createExplorerState() {
  return {
    mode: 'observe', media: 'loading',
    choose(mode) {
      if (!['observe', 'research'].includes(mode)) throw new Error('Unknown exploration mode');
      this.mode = mode;
    },
  };
}
export const explorer = createExplorerState();

export function observationPresentation(asset, media) {
  return {
    sourceKind: 'observed', providerLabel: 'NASA · SDO / AIA 171 Å',
    timeLabel: asset.capturedAt ? `${asset.capturedAt.replace('T', ' ').replace('Z', ' UTC')} · archival` : 'Capture time unavailable · archival image',
    availability: media === 'ready' ? 'ready' : media === 'failed' ? 'unavailable' : 'loading',
    headline: media === 'failed' ? 'This saved observation could not be loaded.' : 'Our star, seen in extreme ultraviolet.',
    sourceUrl: asset.sourceUrl, capturedAt: asset.capturedAt, interpretation: asset.interpretation,
    compositingPermitted: false, modelBundleIdentity: null,
    scope: 'Preserved NASA browse image. No model regions are registered to this image.',
  };
}
export const currentObservationPresentation = () => observationPresentation(getSolarObservation(), explorer.media);

export function renderExplorer(surface) {
  const observing = surface === 'today' && explorer.mode === 'observe';
  writeAttribute(document.body, 'data-experience', explorer.mode);
  const observation = document.getElementById('solarObservation');
  if (observation) writeBoolean(observation, 'hidden', !observing);
  for (const [id, mode] of [['exploreObservation', 'observe'], ['exploreResearch', 'research']]) {
    const control = document.getElementById(id);
    if (control) writeAttribute(control, 'aria-pressed', String(explorer.mode === mode));
  }
  const p = currentObservationPresentation();
  const status = document.getElementById('observationStatus');
  if (status) writeText(status, p.timeLabel);
  const unavailable = document.getElementById('observationUnavailable');
  if (unavailable) writeBoolean(unavailable, 'hidden', explorer.media !== 'failed');
  const loading = document.getElementById('observationLoading');
  if (loading) writeBoolean(loading, 'hidden', explorer.media !== 'loading');
  const media = document.getElementById('observationMedia');
  if (media) writeAttribute(media, 'aria-busy', String(explorer.media === 'loading'));
  const image = document.getElementById('observationImage');
  if (image) writeBoolean(image, 'hidden', explorer.media !== 'ready');
}

export function initExplorer(onMode, onImage) {
  let contextRevealGeneration=0;
  const asset = getSolarObservation();
  const img = /** @type {HTMLImageElement|null} */ (document.getElementById('observationImage'));
  if (img) {
    img.alt = `${asset.label}. ${asset.interpretation}. Saved observation, not a live image.`;
    if (img.getAttribute('src') !== asset.path) img.src = asset.path;
    initObservationMedia(document).subscribe(media => { explorer.media = media; onImage(); });
  }
  const source = /** @type {HTMLAnchorElement|null} */ (document.getElementById('observationSource'));
  if (source) { source.href = asset.sourceUrl; source.textContent = asset.credits; }
  const credit = document.getElementById('observationCredit');
  if (credit) credit.textContent = asset.credits;
  const diameter = document.getElementById('sunDiameter');
  if (diameter) diameter.textContent = `${(SUN_RADIUS_KM * 2 / 1e6).toFixed(3)} million km`;
  const temperature = document.getElementById('sunTemperature');
  if (temperature) temperature.textContent = `${SUN_MEAN_TEMP_K.toLocaleString('en-US')} K`;
  document.getElementById('exploreObservation')?.addEventListener('click', () => onMode('observe'));
  document.getElementById('exploreResearch')?.addEventListener('click', () => onMode('research'));
  document.getElementById('openResearchTools')?.addEventListener('click', () => onMode('research', true));
  document.getElementById('openEarthContext')?.addEventListener('click', () => {
    const generation=++contextRevealGeneration;
    const activation=onMode('research', true);
    const focusOwner=document.activeElement;
    const reveal=()=>{
      if(document.hidden||document.activeElement!==focusOwner||explorer.mode!=='research'||document.body.getAttribute('data-surface')!=='today')return;
      const details = /** @type {HTMLDetailsElement|null} */ (document.getElementById('sunWeather'));
      if (details) { details.open = true; details.querySelector('summary')?.focus(); details.scrollIntoView({block: 'nearest', behavior: 'auto'}); }
    };
    // Lazy controls are inert until their handlers exist. A cancelled entry must
    // never focus a hidden disclosure after the user chooses another surface.
    if(activation&&typeof activation.then==='function'){
      const controller=new AbortController();let retained=true;
      const revoke=()=>{retained=false;controller.abort();};
      document.addEventListener('focusin',event=>{if(event.target!==focusOwner)revoke();},{signal:controller.signal});
      document.addEventListener('pointerdown',revoke,{capture:true,signal:controller.signal});
      document.addEventListener('keydown',revoke,{capture:true,signal:controller.signal});
      document.addEventListener('visibilitychange',()=>{if(document.hidden)revoke();},{signal:controller.signal});
      activation.then(module=>{if(module&&retained&&generation===contextRevealGeneration)reveal();},()=>{}).finally(()=>controller.abort());
    }else reveal();
  });
  document.querySelector('.overview-tabs a')?.addEventListener('click', () => {
    const details = /** @type {HTMLDetailsElement|null} */ (document.getElementById('observationDetails'));
    if (details) details.open = true;
  });
}
