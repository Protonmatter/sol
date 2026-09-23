// The observation browser is a presentation of a preserved image, not a model frame.
import { getSolarObservation } from './solarObservation.js';
import { BODY } from './bodyData.js?v=dcca6290db';
import {createSolarSequenceControls} from './solarSequenceControls.js';
let sequenceControls=null;

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
export const currentObservationPresentation = () => sequenceControls?.presentation()??observationPresentation(getSolarObservation(), explorer.media);

export function renderExplorer(surface) {
  const observing = surface === 'today' && explorer.mode === 'observe';
  sequenceControls?.setVisible(observing);
  document.body.setAttribute('data-experience', explorer.mode);
  const observation = document.getElementById('solarObservation');
  if (observation) observation.hidden = !observing;
  for (const [id, mode] of [['exploreObservation', 'observe'], ['exploreResearch', 'research']]) {
    document.getElementById(id)?.setAttribute('aria-pressed', String(explorer.mode === mode));
  }
  const p = currentObservationPresentation();
  const status = document.getElementById('observationStatus');
  if (status) status.textContent = p.timeLabel;
  const unavailable = document.getElementById('observationUnavailable');
  if (unavailable) unavailable.hidden = sequenceControls?.active() || explorer.media !== 'failed';
  const loading = document.getElementById('observationLoading');
  if (loading) loading.hidden = sequenceControls?.active() ? p.availability!=='loading' : explorer.media !== 'loading';
  document.getElementById('observationMedia')?.setAttribute('aria-busy', String(explorer.media === 'loading'));
  const image = document.getElementById('observationImage');
  if (image) image.hidden = !!sequenceControls?.active() || explorer.media !== 'ready';
  const story=document.querySelector('.observation-story');
  if(story)story.textContent=sequenceControls?.active()?'Recorded evolution in the Sun’s corona. These grayscale frames retain the provider’s display processing; they are not calibrated radiance.':'Bright loops trace hot plasma in the Sun’s outer atmosphere. AIA sees this extreme ultraviolet light; gold makes its structure visible to us.';
  const source=/** @type {HTMLAnchorElement|null} */(document.getElementById('observationSource'));
  if(source)source.href=p.sourceUrl;
  const credit=document.getElementById('observationCredit');
  if(credit)credit.textContent=sequenceControls?.active()?'NASA/SDO AIA · ESA/NASA Helioviewer':getSolarObservation().credits;
}

export function initExplorer(onMode, onImage) {
  if(document.getElementById('observationSequenceToggle')){
    sequenceControls?.dispose();sequenceControls=null;
    sequenceControls=createSolarSequenceControls({document,onChange:()=>{
      renderExplorer(document.body.getAttribute('data-surface')||'today');onImage();
    }});
  }
  const asset = getSolarObservation();
  const img = /** @type {HTMLImageElement|null} */ (document.getElementById('observationImage'));
  if (img) {
    img.onload = () => { explorer.media = 'ready'; onImage(); };
    img.onerror = () => { explorer.media = 'failed'; onImage(); };
    img.alt = `${asset.label}. ${asset.interpretation}. Saved observation, not a live image.`;
    img.src = asset.path;
  }
  const source = /** @type {HTMLAnchorElement|null} */ (document.getElementById('observationSource'));
  if (source) { source.href = asset.sourceUrl; source.textContent = asset.credits; }
  const credit = document.getElementById('observationCredit');
  if (credit) credit.textContent = asset.credits;
  const diameter = document.getElementById('sunDiameter');
  if (diameter) diameter.textContent = `${(BODY.Sun.radiusKm * 2 / 1e6).toFixed(3)} million km`;
  const temperature = document.getElementById('sunTemperature');
  if (temperature) temperature.textContent = `${BODY.Sun.meanTempK.toLocaleString('en-US')} K`;
  document.getElementById('exploreObservation')?.addEventListener('click', () => onMode('observe'));
  document.getElementById('exploreResearch')?.addEventListener('click', () => onMode('research'));
  document.getElementById('openResearchTools')?.addEventListener('click', () => onMode('research', true));
  document.getElementById('openEarthContext')?.addEventListener('click', () => {
    onMode('research', true);
    const details = /** @type {HTMLDetailsElement|null} */ (document.getElementById('sunWeather'));
    if (details) { details.open = true; details.querySelector('summary')?.focus(); details.scrollIntoView({block: 'nearest', behavior: 'auto'}); }
  });
  document.querySelector('.overview-tabs a')?.addEventListener('click', () => {
    const details = /** @type {HTMLDetailsElement|null} */ (document.getElementById('observationDetails'));
    if (details) details.open = true;
  });
  document.getElementById('observationRetry')?.addEventListener('click', () => {
    explorer.media = 'loading';
    if (img) img.src = asset.path;
    onImage();
  });
}
