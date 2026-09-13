// Small read-only cards use accepted presentation data; controls keep their existing owners.
import { skyCard, systemCard } from './destinationCards.js?v=dcca6290db';
import { elpMoonAliased } from './orreryTime.js?v=dcca6290db';

export function renderDestinationOverview(surface, sky, system) {
  if (surface === 'today') return;
  const card = surface === 'sky'
    ? skyCard({ ...sky?.overview, presentation: sky?.presentation }) : systemCard(system);
  const text = (id, value) => { const node = document.getElementById(id); if (node && node.textContent !== value) node.textContent = value; };
  text('destinationEyebrow', card.eyebrow);
  text('destinationTitle', card.title);
  text('destinationDescription', card.description);
  text('destinationNote', card.note);
  const facts = document.getElementById('destinationFacts');
  if (facts && facts.dataset.content !== JSON.stringify(card.facts)) {
    facts.dataset.content = JSON.stringify(card.facts);
    facts.replaceChildren(...card.facts.map(fact => {
      const row = document.createElement('div'), label = document.createElement('dt'), value = document.createElement('dd');
      label.textContent = fact.label; value.textContent = fact.value; row.append(label, value); return row;
    }));
  }
  const preview = document.getElementById('destinationPreview');
  if (preview) preview.hidden = !card.preview;
  const image = /** @type {HTMLImageElement|null} */ (document.getElementById('destinationImage'));
  if (image && card.preview && image.getAttribute('src') !== card.preview.path) {
    const path = card.preview.path;
    image.hidden = true;
    text('destinationImageStatus', 'Loading this object’s archive reference…');
    image.onerror = () => { if (image.getAttribute('src') !== path) return; image.hidden = true; text('destinationImageStatus', 'Archive preview unavailable. Open its original source below.'); };
    image.onload = () => {
      if (image.getAttribute('src') !== path || (image.currentSrc && !image.currentSrc.endsWith(path))) return;
      image.hidden = false; text('destinationImageStatus', 'Archive reference · separate from the 3-D scene');
    };
    image.alt = card.preview.label; image.src = card.preview.path;
  }
  const source = /** @type {HTMLAnchorElement|null} */ (document.getElementById('destinationImageSource'));
  if (source && card.preview) { source.href = card.preview.sourceUrl; source.textContent = card.preview.credits; }
  const focus = document.getElementById('destinationFocus');
  if (focus) { focus.hidden = !card.focusBody; focus.dataset.body = card.focusBody || ''; focus.textContent = `Focus on ${card.focusBody || 'object'}`; }
  const location = document.getElementById('destinationLocation');
  if (location) location.hidden = surface !== 'sky';
  const systemJumps = document.getElementById('systemJumps');
  if (systemJumps) systemJumps.hidden = surface !== 'orrery' || Boolean(system?.galaxy);
  text('destinationCaption', surface === 'sky'
    ? 'Horizon map · north at the top · calculated positions, not a camera view'
    : system?.galaxy ? (system.localView ? 'Solar neighbourhood · static catalogue epoch · distances in light-years' : 'Milky Way illustration · separate model clock')
    : system?.trueScale ? 'Physical scale · small bodies may be subpixel'
    : 'Sizes enlarged for visibility · physical centers preserved · moon spacing enlarged');
  const caveats = surface === 'sky' || system?.galaxy ? '' : [system?.moonsHiddenReason,
    system?.animate && elpMoonAliased(system?.simStepSeconds) ? 'The Moon’s drawn motion is under-sampled at this speed; physical positions are unchanged.' : '',
    system?.spinLimitedCount && system?.animate && !system?.galaxy ? 'Rotation display rate-limited to one visible turn/5s.' : ''].filter(Boolean).join(' ');
  text('destinationCaveat', caveats);
  for (const button of document.querySelectorAll('[data-camera-body]')) button.setAttribute('aria-pressed', String(system?.anchor === /** @type {HTMLElement} */ (button).dataset.cameraBody));
}
