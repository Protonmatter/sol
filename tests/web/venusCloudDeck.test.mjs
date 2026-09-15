import assert from 'node:assert/strict';
import test from 'node:test';
import {appearanceReference, appearanceSummary, appearanceDescription, surfaceReferenceShown} from '../../apps/web/js/planetAppearance.js';
import {planReferenceDemand} from '../../apps/web/js/referenceDemand.js';
import {missingDetailColor} from '../../apps/web/js/visualAssets.js';

test('Venus draws its visible cloud deck unless the radar layer is chosen', () => {
  assert.equal(surfaceReferenceShown('Venus', {}), false);
  assert.equal(surfaceReferenceShown('Venus', {venusRadar: false}), false);
  assert.equal(surfaceReferenceShown('Venus', {venusRadar: true}), true);
  for (const body of ['Mercury', 'Earth', 'Mars', 'Jupiter', 'Moon']) assert.equal(surfaceReferenceShown(body, {}), true, body);
  // The radar mosaic stays registered with its full provenance for the opt-in layer.
  assert.equal(appearanceReference('Venus').role, 'surface');
});

test('the Venus card describes the layer actually drawn', () => {
  const radar = appearanceReference('Venus');
  const clouds = appearanceSummary('Venus', {});
  assert.match(clouds, /cloud deck/);
  assert.ok(!clouds.includes(radar.label), 'the default card must not describe the radar map');
  assert.match(appearanceDescription('Venus', {}, true), /No visible-light global map exists/);
  const shown = appearanceSummary('Venus', {venusRadar: true, appearanceStatus: {[radar.id]: 'ready'}});
  assert.ok(shown.includes(radar.label), 'the opt-in card names the radar source');
});

test('the cloud deck has a documented pale yellow-white colour, not the neutral missing-detail grey', () => {
  const [r, g, b] = missingDetailColor('Venus');
  assert.ok(r > g && g > b, 'visible reflectance falls toward blue');
  assert.ok(b > 0.6, 'the deck is bright');
  assert.notDeepEqual([r, g, b], [0.55, 0.55, 0.55]);
});

test('the radar mosaic is not fetched while the cloud deck is shown', () => {
  const visible = new Map([['Venus', 400], ['Mercury', 300]]);
  const hidden = planReferenceDemand(visible, {anchor: 'Venus'});
  assert.ok(!hidden.some(asset => asset.body === 'Venus'));
  assert.ok(hidden.some(asset => asset.body === 'Mercury'));
  const opted = planReferenceDemand(visible, {anchor: 'Venus', venusRadar: true});
  assert.equal(opted[0].body, 'Venus');
  assert.equal(opted[0].role, 'surface');
});
