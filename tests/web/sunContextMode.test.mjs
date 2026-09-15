import assert from 'node:assert/strict';
import test from 'node:test';
import {orreryHarness} from './helpers/orreryHarness.mjs';

// Reconstructed EUV draws through the solar volume program (u_camObj, passes 1 and 2).
// The visible photosphere draws through the sphere program in mode 1.
const repaint = h => {
  const first = h.gpuSubmissions.length;
  h.resize(812, 604);
  const draws = h.gpuSubmissions.slice(first);
  return {euv: draws.filter(draw => draw.uniforms.u_camObj), visible: draws.filter(draw => draw.uniforms.u_mode === 1)};
};

test('the Sun draws in visible light when it is context, and EUV only as the subject', async t => {
  const h = await orreryHarness(t, {controls: true, catalogues: 'ready', reducedMotion: true, solarAtlas: true});
  await h.enterOrrery(); await h.settleCatalogues(); h.setAnimate(false);
  assert.equal(h.state.solarMode, 'reconstructed-euv', 'EUV stays the default science mode');

  // Inspecting loads the atlas and makes the Sun the subject.
  h.event('orreryInspectSun', 'click'); await h.settleCatalogues();
  assert.equal(h.state.solarStatus, 'ready');
  const inspected = repaint(h);
  assert.deepEqual(inspected.euv.map(draw => draw.uniforms.u_pass), [1, 2]);
  assert.equal(inspected.visible.length, 0);

  // The default overview: anchored on the Sun, nothing selected, no inspection. The atlas
  // is still resident, yet the Sun is only context here, so the photosphere draws.
  h.state.solarInspection = false; h.state.selected = null;
  assert.equal(h.state.anchor, 'Sun');
  const overview = repaint(h);
  assert.equal(overview.euv.length, 0, 'no false-colour EUV Sun in the overview');
  assert.equal(overview.visible.length, 1, 'the visible photosphere draws instead');

  // Explicitly selecting the Sun from the object list makes it the subject again.
  h.input('orrerySearch', 'Sun'); h.nodes.orreryPositions.children[0].click();
  assert.equal(h.state.selected, 'Sun');
  const selected = repaint(h);
  assert.deepEqual(selected.euv.map(draw => draw.uniforms.u_pass), [1, 2]);
  assert.equal(selected.visible.length, 0);
  h.leaveOrrery();
});
