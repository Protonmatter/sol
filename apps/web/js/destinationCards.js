// Concise orientation from admitted scene state and reference facts. No calculation or I/O.
import { BODY } from './bodyData.js?v=dcca6290db';
import { visualBrowsePreview, textureEligible } from './visualAssets.js';

/** @typedef {{eyebrow:string,title:string,description:string,facts:{label:string,value:string}[],note:string,preview:ReturnType<typeof visualBrowsePreview>,focusBody:string|null}} DestinationCard */
const unavailable = 'Unavailable';
const number = (value, unit) => Number.isFinite(value)
  ? `${value.toLocaleString('en-US', {maximumFractionDigits: 2})}${unit}` : unavailable;
const degrees = value => Number.isFinite(value) ? `${value.toFixed(2)}°` : unavailable;
const text = value => typeof value === 'string' && value.trim() ? value : unavailable;
const fact = (label, value) => ({label, value});

/** Snapshot is the last admitted Sky snapshot, never requested input state.
 * @param {{snapshot?:any,selectedName?:string|null,presentation?:any}} input
 * @returns {DestinationCard}
 */
export function skyCard({snapshot = null, selectedName = null, presentation = null} = {}) {
  const body = snapshot?.bodies?.find(item => item.name === selectedName);
  const source = presentation?.actualProvider === 'local' ? 'Computed on your device'
    : presentation?.actualProvider === 'server' ? 'Configured remote provider' : unavailable;
  const facts = [fact('Observer', text(presentation?.observerLabel)), fact('Source', source)];
  let description = 'A map of the sky at the displayed location and time.';
  if (!snapshot) description = 'No validated Sky snapshot is available yet.';
  else if (selectedName) description = !body ? 'This object is not present in the displayed snapshot.'
    : !Number.isFinite(body.alt_deg) ? 'Geometric horizon position is unavailable.'
    : body.alt_deg > 0 ? 'Above the geometric horizon at the displayed time.' : 'At or below the geometric horizon at the displayed time.';
  if (selectedName) facts.push(fact('Geometric altitude', degrees(body?.alt_deg)), fact('Azimuth from north', degrees(body?.az_deg)));
  else facts.push(fact('Above geometric horizon', Number.isInteger(presentation?.aboveCount) && presentation.aboveCount >= 0
    ? `${presentation.aboveCount} objects` : unavailable));
  return {eyebrow: 'YOUR VIEW FROM EARTH', title: selectedName || 'Your sky', description, facts,
    note: `${presentation?.availability === 'last_valid' ? 'Showing the last validated snapshot, including its observer and time. ' : ''}Above the horizon does not guarantee visibility; daylight, weather, terrain and glare are not modelled.`,
    preview: null, focusBody: null};
}

/** @param {any} state @returns {DestinationCard} */
export function systemCard(state = {}) {
  const scale = state.trueScale ? 'Physical scale; small bodies may be sub-pixel.'
    : 'Bodies are enlarged for visibility; physical positions are unchanged.';
  const retained = state.engineError || state.presentation?.availability === 'last_valid'
    ? ' Showing the last validated scene; reference facts remain separate.' : '';
  const card = {eyebrow: 'OUR PLANETARY HOME', title: 'The Solar System',
    description: state.presentation?.availability === 'unavailable' ? 'Model positions are unavailable. Open tools to retry the calculation.'
      : 'Explore our star, the planets and their moons. Select an object to look closer.',
    facts: [], note: `${scale}${retained} Surface detail is simplified wherever a qualified texture is unavailable.`, preview: null, focusBody: null};
  if (state.galaxy && !state.localView) return {...card, eyebrow: 'A WIDER UNIVERSE', title: 'The Milky Way',
    description: 'An illustrative view of our galaxy and the Sun’s place within it.',
    note: 'Illustrative galaxy model; its model clock is separate from planetary time.'};
  if (state.selectedStar) return {...card, eyebrow: 'CATALOGUE STAR', title: text(state.selectedStar.name),
    description: 'A named star from the displayed catalogue.',
    note: 'Catalogue facts; not an independently validated apparent place. Open details for source and epoch.'};
  if (state.galaxy && state.localView) return {...card, eyebrow: 'A WIDER UNIVERSE', title: 'Our stellar neighbourhood',
    description: 'Explore the stars around our Sun at a scale of light-years.',
    note: 'Positions use a static catalogue epoch; this is separate from planetary time.'};
  if (!state.selected) return card;
  const name = state.selected;
  if (!Object.hasOwn(BODY, name)) return {...card, eyebrow: 'SELECTED OBJECT', title: name,
    description: 'Open object details for its catalogue facts, source and position limits.'};
  const body = BODY[name];
  return {...card, eyebrow: 'LOOK CLOSER', title: name, description: body.blurb,
    facts: [fact('Reference radius', number(body.radiusKm, ' km')), fact('Reference gravity', number(body.gravity, ' m/s²')),
      fact('Reference rotation', Number.isFinite(body.rotationHours) ? `${number(Math.abs(body.rotationHours), ' h')}${body.rotationHours < 0 ? ' · retrograde' : ''}` : unavailable)],
    note: `Reference facts from the body catalogue, separate from the rendered date. ${scale}${retained}${!textureEligible(name) || state.useTextures === false ? ' Surface detail unavailable in this view; the 3-D appearance is simplified.' : ''}`,
    preview: visualBrowsePreview(name), focusBody: name};
}
