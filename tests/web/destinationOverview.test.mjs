import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {renderDestinationOverview} from '../../apps/web/js/destinationOverview.js';
import {visualBrowsePreview} from '../../apps/web/js/visualAssets.js';
import {loadSourceModules} from './helpers/sourceModuleHarness.mjs';

const ids = ['destinationEyebrow', 'destinationTitle', 'destinationDescription', 'destinationNote',
  'destinationFacts', 'destinationPreview', 'destinationImage', 'destinationImageStatus',
  'destinationImageSource', 'destinationFocus', 'destinationLocation', 'systemJumps',
  'destinationCaption', 'destinationCaveat', 'destinationAppearance', 'destinationAppearanceText',
  'destinationAppearanceSources', 'destinationEarthLayers', 'destinationDetails'];

// Model the DOM operations the card owns, including the observable cost of replacing
// descendants. Any HTML parsing attempt fails, so external names remain literal text.
function fakeDocument() {
  const doc = {activeElement: null};
  class Element {
    constructor(tagName, id = '') {
      this.tagName = tagName.toUpperCase(); this.id = id;
      this.dataset = {}; this.attributes = {}; this.children = [];
      this.hidden = false; this.open = false; this.replacements = 0;
      this.textAssignments = 0; this.sourceAssignments = 0; this._text = '';
      this.currentSrc = '';
    }
    get textContent() { return this.children.length ? this.children.map(child => child.textContent).join('') : this._text; }
    set textContent(value) {
      this.textAssignments++; this._text = String(value);
      if (this.contains(doc.activeElement) && doc.activeElement !== this) doc.activeElement = null;
      this.children = [];
    }
    set innerHTML(_value) { throw new Error('Untrusted card content must not be parsed as HTML'); }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) {
      this.replacements++;
      if (this.contains(doc.activeElement) && doc.activeElement !== this) doc.activeElement = null;
      this.children = children; this._text = '';
    }
    contains(node) { return node === this || this.children.some(child => child.contains(node)); }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    get src() { return this.getAttribute('src') || ''; }
    set src(value) { this.sourceAssignments++; this.setAttribute('src', value); }
    focus() { doc.activeElement = this; }
  }
  const nodes = Object.fromEntries(ids.map(id => [id, new Element(
    id === 'destinationImage' ? 'img' : id === 'destinationFacts' ? 'dl' : 'div', id)]));
  const cameras = ['Sun', 'Earth', 'Jupiter', 'Saturn'].map(name => {
    const button = new Element('button'); button.dataset.cameraBody = name; return button;
  });
  Object.assign(doc, {
    getElementById: id => nodes[id] || null,
    createElement: tagName => new Element(tagName),
    querySelectorAll: selector => selector === '[data-camera-body]' ? cameras : [],
  });
  return {doc, nodes, cameras};
}

function withDocument(run) {
  const previous = globalThis.document;
  const harness = fakeDocument();
  globalThis.document = harness.doc;
  try { return run(harness); } finally { globalThis.document = previous; }
}

const skyState = () => ({
  overview: {snapshot: {bodies: [{name: 'Moon', alt_deg: 12.345, az_deg: 123.456}]}, selectedName: 'Moon'},
  presentation: {observerLabel: 'Displayed observer', actualProvider: 'local', availability: 'ready', aboveCount: 6},
  requestedObserverLabel: 'Pending observer', requestedProvider: 'server',
});
const factsOf = nodes => Object.fromEntries(nodes.destinationFacts.children.map(row => {
  assert.equal(row.tagName, 'DIV');
  assert.deepEqual(row.children.map(child => child.tagName), ['DT', 'DD']);
  return row.children.map(child => child.textContent);
}));

test('Earth source disclosure retains dates and links while repeated frames preserve focused source controls', () => withDocument(({nodes,doc}) => {
  const state = {selected:'Earth',useTextures:true};
  renderDestinationOverview('orrery', null, state);
  assert.equal(nodes.destinationAppearance.hidden, false);
  assert.equal(nodes.destinationEarthLayers.hidden, false);
  const links = nodes.destinationAppearanceSources.children;
  assert.equal(links.length, 5);
  assert.ok(links.some(link => link.textContent.includes('2002')), 'historical composite source remains attributable');
  assert.ok(links.every(link => link.href.startsWith('https://') && link.rel.includes('noopener')));
  links[0].focus(); renderDestinationOverview('orrery', null, state);
  assert.equal(doc.activeElement, links[0]); assert.equal(nodes.destinationAppearanceSources.replacements, 1);
  renderDestinationOverview('orrery', null, {...state,selected:'Jupiter'});
  assert.equal(nodes.destinationEarthLayers.hidden, true);
  assert.equal(nodes.destinationAppearanceSources.children.length, 1);
  renderDestinationOverview('sky', skyState(), state);
  assert.equal(nodes.destinationAppearance.hidden, true);
  assert.equal(nodes.destinationAppearanceSources.children.length, 0);
}));

test('Today does not alter a destination or require the destination DOM to exist', () => {
  const previous = globalThis.document;
  globalThis.document = {getElementById() { throw new Error('Today must not render another destination'); }};
  try { assert.equal(renderDestinationOverview('today'), undefined); }
  finally { globalThis.document = previous; }
});

test('Sky renders admitted positions and observer with literal, semantic text content', () => withDocument(({nodes}) => {
  const sky = skyState();
  const name = '<img src=x onerror=alert(1)>';
  sky.overview.selectedName = name; sky.overview.snapshot.bodies[0].name = name;
  sky.presentation.observerLabel = '<b>Displayed observer</b>';
  renderDestinationOverview('sky', sky, {selected: 'Earth', anchor: 'Earth'});
  assert.equal(nodes.destinationTitle.textContent, name);
  assert.equal(nodes.destinationTitle.children.length, 0);
  assert.deepEqual(factsOf(nodes), {
    Observer: '<b>Displayed observer</b>', Source: 'Computed on your device',
    'Geometric altitude': '12.35°', 'Azimuth from north': '123.46°',
  });
  assert.match(nodes.destinationDescription.textContent, /Above the geometric horizon/);
  assert.match(nodes.destinationNote.textContent, /does not guarantee visibility/);
  assert.doesNotMatch(nodes.destinationFacts.textContent, /Pending observer|Configured remote provider/);
  assert.equal(nodes.destinationPreview.hidden, true);
  assert.equal(nodes.destinationFocus.hidden, true);
  assert.equal(nodes.destinationLocation.hidden, false);
  assert.equal(nodes.systemJumps.hidden, true);
  assert.match(nodes.destinationCaption.textContent, /calculated positions, not a camera view/);
}));

test('Unchanged admitted facts preserve descendants, reading focus, and disclosure state', () => withDocument(({doc, nodes}) => {
  const sky = skyState();
  renderDestinationOverview('sky', sky, {});
  const rows = [...nodes.destinationFacts.children];
  const value = rows[0].children[1]; value.focus();
  const titleAssignments = nodes.destinationTitle.textAssignments;
  nodes.destinationPreview.open = true;
  renderDestinationOverview('sky', structuredClone(sky), {});
  assert.equal(nodes.destinationFacts.replacements, 1);
  assert.deepEqual(nodes.destinationFacts.children, rows);
  assert.equal(doc.activeElement, value);
  assert.equal(nodes.destinationTitle.textAssignments, titleAssignments);
  assert.equal(nodes.destinationPreview.open, true);

  sky.presentation.availability = 'last_valid';
  renderDestinationOverview('sky', sky, {});
  assert.match(nodes.destinationNote.textContent, /last validated snapshot/);
  assert.equal(nodes.destinationFacts.replacements, 1);
  assert.equal(doc.activeElement, value);

  sky.overview.snapshot.bodies[0].alt_deg = -2;
  renderDestinationOverview('sky', sky, {});
  assert.equal(nodes.destinationFacts.replacements, 2);
  assert.equal(factsOf(nodes)['Geometric altitude'], '-2.00°');
  assert.match(nodes.destinationDescription.textContent, /At or below/);
}));

test('Earth archive preview retains attribution and handles decoded success or failure independently of the scene', () => withDocument(({nodes}) => {
  const system = {selected: 'Earth', anchor: 'Earth', presentation: {availability: 'ready'}};
  renderDestinationOverview('orrery', undefined, system);
  assert.equal(nodes.destinationPreview.hidden, false);
  assert.equal(nodes.destinationImage.src, 'textures/earth.jpg');
  assert.match(nodes.destinationImage.alt, /Earth/);
  assert.match(nodes.destinationImageSource.href, /^https:\/\/eoimages\.gsfc\.nasa\.gov\//);
  assert.match(nodes.destinationImageSource.textContent, /NASA/);
  assert.equal(nodes.destinationImage.hidden, true);
  assert.match(nodes.destinationImageStatus.textContent, /Loading this object/);
  nodes.destinationImage.onload();
  assert.equal(nodes.destinationImage.hidden, false);
  assert.match(nodes.destinationImageStatus.textContent, /Archive reference.*separate from the 3-D scene/);
  assert.equal(nodes.destinationFocus.hidden, false);
  assert.equal(nodes.destinationFocus.dataset.body, 'Earth');
  assert.equal(nodes.destinationFocus.textContent, 'Focus on Earth');
  assert.equal(factsOf(nodes)['Reference radius'], '6,378.14 km');

  nodes.destinationPreview.open = true;
  const source = nodes.destinationImageSource.href;
  nodes.destinationImage.onerror();
  assert.equal(nodes.destinationImage.hidden, true);
  assert.match(nodes.destinationImageStatus.textContent, /Archive preview unavailable/);
  assert.equal(nodes.destinationImageSource.href, source);
  assert.equal(nodes.destinationTitle.textContent, 'Earth');
  assert.equal(nodes.destinationFocus.hidden, false);
  renderDestinationOverview('orrery', undefined, {...system, animate: true});
  assert.equal(nodes.destinationImage.sourceAssignments, 1, 'ordinary rendering must not repeatedly request a failed image');
  assert.equal(nodes.destinationImage.hidden, true);
  assert.equal(nodes.destinationPreview.open, true);
}));

test('Returning to a failed archive retries once without accepting callbacks from its previous request', () => withDocument(({nodes}) => {
  const earth = {selected: 'Earth'}, image = nodes.destinationImage;
  renderDestinationOverview('orrery', undefined, earth);
  const oldLoad = image.onload, oldError = image.onerror;
  oldError();
  for (let frame = 0; frame < 3; frame++) renderDestinationOverview('orrery', undefined, earth);
  assert.equal(image.sourceAssignments, 1, 'a failed preview must not retry on every scene frame');
  const source = nodes.destinationImageSource.href;
  renderDestinationOverview('orrery', undefined, {selected: 'Mars'});
  assert.equal(nodes.destinationPreview.hidden, true, 'Mars has no archive preview');
  renderDestinationOverview('orrery', undefined, earth);
  assert.equal(image.sourceAssignments, 2, 'returning to the failed source must make a new request');
  assert.equal(image.src, 'textures/earth.jpg');
  assert.equal(image.hidden, true);
  assert.equal(nodes.destinationImageSource.href, source);
  const loadingStatus = nodes.destinationImageStatus.textContent;
  assert.match(loadingStatus, /Loading this object/);
  image.currentSrc = 'https://sol.example.test/textures/earth.jpg';
  oldLoad(); oldError();
  assert.equal(image.hidden, true, 'an old callback for the same URL cannot settle the retry');
  assert.equal(nodes.destinationImageStatus.textContent, loadingStatus);
  image.onload();
  assert.equal(image.hidden, false);
  assert.match(nodes.destinationImageStatus.textContent, /Archive reference.*separate from the 3-D scene/);
  oldError();
  assert.equal(image.hidden, false, 'an obsolete error cannot hide the successfully retried image');
  renderDestinationOverview('orrery', undefined, earth);
  assert.equal(image.sourceAssignments, 2);
  image.onerror();
  renderDestinationOverview('sky', skyState(), {});
  renderDestinationOverview('orrery', undefined, earth);
  assert.equal(image.sourceAssignments, 3, 'another deliberate return can recover a subsequent failure');
  renderDestinationOverview('orrery', undefined, earth);
  assert.equal(image.sourceAssignments, 3, 'the new attempt also remains bounded while loading');
}));

test('Returning to a successfully decoded archive preserves the cached image without another request', () => withDocument(({nodes}) => {
  renderDestinationOverview('orrery', undefined, {selected: 'Earth'});
  nodes.destinationImage.onload();
  renderDestinationOverview('orrery', undefined, {selected: 'Mars'});
  renderDestinationOverview('orrery', undefined, {selected: 'Earth'});
  assert.equal(nodes.destinationPreview.hidden, false);
  assert.equal(nodes.destinationImage.hidden, false);
  assert.equal(nodes.destinationImage.sourceAssignments, 1);
  assert.match(nodes.destinationImageStatus.textContent, /Archive reference.*separate from the 3-D scene/);
}));

test('An archive change never pairs an old decoded bitmap with the newly selected source', async () => {
  const {doc, nodes} = fakeDocument();
  // Both previews are already source-admitted. Use the card-data boundary to exercise
  // two available archives without changing the catalogue or qualifying a new asset.
  const makeCard = state => ({eyebrow: 'ARCHIVE REFERENCE', title: state.selected,
    description: '', facts: [], note: '', focusBody: null,
    preview: visualBrowsePreview(state.selected)});
  const [overview] = await loadSourceModules(vm.createContext({document: doc}),
    [new URL('../../apps/web/js/destinationOverview.js', import.meta.url)], {
      resolveImport: specifier => specifier.startsWith('./destinationCards.js')
        ? {skyCard: () => { throw new Error('This fixture is a System preview sequence'); }, systemCard: makeCard}
        : undefined,
    });
  const earth = visualBrowsePreview('Earth'), io = visualBrowsePreview('Io');
  assert.ok(earth && io, 'the sequence requires two independently admitted archive previews');
  const image = nodes.destinationImage;
  overview.renderDestinationOverview('orrery', undefined, {selected: 'Earth'});
  const oldLoad = image.onload, oldError = image.onerror;
  assert.equal(image.hidden, true);
  image.currentSrc = `https://sol.example.test/${earth.path}`;
  oldLoad();
  assert.equal(image.hidden, false);

  overview.renderDestinationOverview('orrery', undefined, {selected: 'Io'});
  assert.equal(image.hidden, true, 'Earth must be hidden while the Io request is pending');
  assert.equal(image.src, io.path);
  assert.equal(nodes.destinationImageSource.href, io.sourceUrl);
  assert.equal(nodes.destinationImageSource.textContent, io.credits);
  assert.equal(image.alt, io.label);
  const loadingStatus = nodes.destinationImageStatus.textContent;
  assert.match(loadingStatus, /Loading this object/);
  oldLoad(); oldError();
  assert.equal(image.hidden, true);
  assert.equal(nodes.destinationImageStatus.textContent, loadingStatus);
  assert.equal(nodes.destinationImageSource.href, io.sourceUrl);

  // Even the current callback cannot reveal an old resource still reported by the
  // browser's currentSrc while its new src attribute already names the next image.
  image.onload();
  assert.equal(image.hidden, true);
  assert.equal(nodes.destinationImageStatus.textContent, loadingStatus);
  image.currentSrc = `https://sol.example.test/${io.path}`;
  image.onload();
  assert.equal(image.hidden, false);
  assert.match(nodes.destinationImageStatus.textContent, /Archive reference.*separate from the 3-D scene/);
  oldError(); oldLoad();
  assert.equal(image.hidden, false);
  assert.equal(nodes.destinationImageSource.href, io.sourceUrl);
  assert.doesNotMatch(nodes.destinationImageStatus.textContent, /unavailable|Loading/);
  image.onerror();
  assert.equal(image.hidden, true);
  assert.match(nodes.destinationImageStatus.textContent, /Archive preview unavailable/);
  assert.equal(nodes.destinationImageSource.href, io.sourceUrl);
});

test('Switching destinations cannot expose an old archive or old object facts', () => withDocument(({nodes}) => {
  renderDestinationOverview('orrery', undefined, {selected: 'Earth', anchor: 'Earth'});
  nodes.destinationImage.onload();
  renderDestinationOverview('orrery', undefined, {selected: 'Moon', anchor: 'Earth'});
  assert.equal(nodes.destinationTitle.textContent, 'Moon');
  assert.equal(nodes.destinationPreview.hidden, true, 'unqualified Moon detail must not reuse Earth imagery');
  assert.equal(nodes.destinationImage.sourceAssignments, 1);
  assert.equal(nodes.destinationFocus.dataset.body, 'Moon');
  assert.doesNotMatch(nodes.destinationFacts.textContent, /6,378\.14/);

  renderDestinationOverview('sky', skyState(), {});
  assert.equal(nodes.destinationPreview.hidden, true);
  assert.equal(nodes.destinationFocus.hidden, true);
  assert.equal(nodes.destinationFocus.dataset.body, '');
  assert.equal(nodes.destinationLocation.hidden, false);
  assert.equal(nodes.systemJumps.hidden, true);
  assert.equal(factsOf(nodes).Observer, 'Displayed observer');
  assert.equal(factsOf(nodes)['Reference radius'], undefined);

  renderDestinationOverview('orrery', undefined, {selected: '<script>catalogue object</script>', anchor: 'Sun'});
  assert.equal(nodes.destinationTitle.textContent, '<script>catalogue object</script>');
  assert.equal(nodes.destinationTitle.children.length, 0);
  assert.deepEqual(factsOf(nodes), {});
  assert.equal(nodes.destinationPreview.hidden, true);
  assert.equal(nodes.destinationFocus.hidden, true);
  assert.equal(nodes.destinationLocation.hidden, true);
  assert.equal(nodes.systemJumps.hidden, false);
}));

test('Camera selection and dynamic scale, moon and rotation disclosures follow the displayed scene', () => withDocument(({nodes, cameras}) => {
  const state = {anchor: 'Earth', animate: true, spinLimitedCount: 2,
    moonsHiddenReason: 'Moons hidden outside the supported epoch.'};
  renderDestinationOverview('orrery', undefined, state);
  assert.deepEqual(cameras.map(node => node.attributes['aria-pressed']), ['false', 'true', 'false', 'false']);
  assert.match(nodes.destinationCaption.textContent, /Sizes enlarged.*physical centers preserved/);
  assert.match(nodes.destinationCaveat.textContent, /Moons hidden outside the supported epoch/);
  assert.match(nodes.destinationCaveat.textContent, /Rotation display rate-limited/);

  renderDestinationOverview('orrery', undefined, {...state, anchor: 'Saturn', animate: false, trueScale: true});
  assert.deepEqual(cameras.map(node => node.attributes['aria-pressed']), ['false', 'false', 'false', 'true']);
  assert.match(nodes.destinationCaption.textContent, /Physical scale.*subpixel/);
  assert.doesNotMatch(nodes.destinationCaveat.textContent, /Rotation/);
  renderDestinationOverview('orrery', undefined, {anchor: 'Unknown', spinLimitedCount: 0, animate: true});
  assert.ok(cameras.every(node => node.attributes['aria-pressed'] === 'false'));
  assert.equal(nodes.destinationCaveat.textContent, '');
  renderDestinationOverview('sky', skyState(), state);
  assert.equal(nodes.destinationCaveat.textContent, '', 'System disclosures must not leak into Sky');
}));

test('Galaxy and neighbourhood modes clear body cards and disclose their separate clocks', () => withDocument(({nodes}) => {
  renderDestinationOverview('orrery', undefined, {selected: 'Earth', anchor: 'Earth'});
  assert.equal(nodes.destinationDetails.hidden, false);
  renderDestinationOverview('orrery', undefined, {selected: 'Earth', galaxy: true, animate: true, spinLimitedCount: 4,
    moonsHiddenReason: 'Moons hidden outside the supported epoch.'});
  assert.equal(nodes.destinationTitle.textContent, 'The Milky Way');
  assert.deepEqual(factsOf(nodes), {});
  assert.equal(nodes.destinationPreview.hidden, true);
  assert.equal(nodes.destinationFocus.hidden, true);
  assert.equal(nodes.destinationDetails.hidden, true, 'the galactic overview has no current object details');
  assert.equal(nodes.systemJumps.hidden, true);
  assert.match(nodes.destinationCaption.textContent, /Milky Way illustration.*separate model clock/);
  assert.equal(nodes.destinationCaveat.textContent, '', 'planetary moon and spin caveats must not label a galactic scene');
  renderDestinationOverview('orrery', undefined, {galaxy: true, localView: true, selected: 'Earth'});
  assert.equal(nodes.destinationDetails.hidden, true, 'the neighbourhood overview must not expose a retained planet');
  renderDestinationOverview('orrery', undefined, {galaxy: true, localView: true, selectedStar: {name: 'Sirius'}});
  assert.equal(nodes.destinationTitle.textContent, 'Sirius');
  assert.equal(nodes.destinationEyebrow.textContent, 'CATALOGUE STAR');
  assert.match(nodes.destinationCaption.textContent, /static catalogue epoch.*light-years/);
  assert.equal(nodes.destinationPreview.hidden, true);
  assert.equal(nodes.destinationFocus.hidden, true);
  assert.equal(nodes.destinationDetails.hidden, false, 'a selected catalogue star retains its details action');
  renderDestinationOverview('sky', skyState(), {galaxy: true});
  assert.equal(nodes.destinationDetails.hidden, false, 'the System galaxy state cannot hide Sky details');
  renderDestinationOverview('orrery', undefined, {selected: 'Earth', galaxy: false});
  assert.equal(nodes.destinationDetails.hidden, false, 'returning to the system restores planet details');
}));

test('Not-yet-created states and absent optional card elements remain safe', () => withDocument(({nodes}) => {
  renderDestinationOverview('sky');
  assert.equal(nodes.destinationTitle.textContent, 'Your sky');
  assert.match(nodes.destinationDescription.textContent, /No validated Sky snapshot/);
  assert.equal(factsOf(nodes).Source, 'Unavailable');
  renderDestinationOverview('orrery');
  assert.equal(nodes.destinationTitle.textContent, 'The Solar System');
  assert.equal(nodes.destinationPreview.hidden, true);
  for (const id of ids) delete nodes[id];
  assert.doesNotThrow(() => renderDestinationOverview('sky', skyState()));
  assert.doesNotThrow(() => renderDestinationOverview('orrery', undefined, {selected: 'Earth'}));
}));
