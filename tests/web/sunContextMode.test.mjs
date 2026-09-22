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
  assert.ok(inspected.euv.every(draw => draw.uniforms.u_quiet === 4), 'EUV draws sample the radial quiet profile');
  assert.equal(inspected.euv[0].uniforms['u_loopGain[0]'].length, 24, 'source arches plus whole-sphere arches');
  assert.ok(inspected.euv[0].uniforms['u_loopGain[0]'].slice(12).every(gain => Math.abs(gain - 0.42) < 1e-6));
  assert.equal(inspected.euv[0].uniforms.u_phase, 0);
  assert.equal(inspected.euv[0].uniforms.u_displayGain, 3, 'the live EUV disk is lifted above the admitted 1x gold map');
  assert.ok(inspected.euv.every(draw => draw.uniforms.u_coronaGlow === 1), 'the whole-limb shell is on while the EUV Sun is showing');
  assert.equal(inspected.visible.length, 0);
  const unix = h.state.renderUnix;
  h.frame((h.state.lastTick || 0) + 1000);
  const flowing = repaint(h);
  assert.ok(flowing.euv[0].uniforms.u_phase > 0, 'corona flow advances while the EUV Sun is showing');
  assert.equal(h.state.renderUnix, unix, 'corona flow does not advance orbital time');

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

test('choosing a solar source mode makes the Sun the subject instead of doing nothing', async t => {
  const h = await orreryHarness(t, {controls: true, catalogues: 'ready', reducedMotion: true, solarAtlas: true});
  await h.enterOrrery(); await h.settleCatalogues(); h.setAnimate(false);

  // The default overview: anchored on the Sun, nothing selected, no inspection. The selector
  // used to leave the Sun as context, so switching mode changed nothing on screen.
  assert.equal(h.state.anchor, 'Sun');
  assert.equal(h.state.selected, null);
  const framing = {az: h.state.az, el: h.state.el, radius: h.state.radius};

  h.input('orrerySolarMode', 'visible', 'change');
  assert.equal(h.state.selected, 'Sun', 'using the control makes the Sun the subject');
  assert.equal(h.state.solarInspection, false, 'without the camera move Inspect performs');
  assert.deepEqual({az: h.state.az, el: h.state.el, radius: h.state.radius}, framing);
  assert.equal(repaint(h).visible.length, 1, 'the visible photosphere draws');

  // Switching back to EUV governs the Sun again. The atlas itself only loads once the Sun
  // is large enough on screen, so at overview distance the honest outcome is the disclosed
  // EUV mode with the photosphere retained, not an EUV draw.
  h.input('orrerySolarMode', 'reconstructed-euv', 'change');
  assert.equal(h.state.selected, 'Sun');
  assert.match(h.nodes.orreryPhysicalStatus.textContent, /AIA 171/,
    'the status line describes the EUV reference the selector now governs');
  h.input('orrerySolarMode', 'visible', 'change');
  assert.match(h.nodes.orreryPhysicalStatus.textContent, /Visible-light approximation/);

  // Anchored elsewhere the control is not offered at all, so it must not grab the selection.
  h.input('orreryAnchor', 'Mars', 'change');
  assert.equal(h.nodes.orrerySolarControls.hidden, true);
  h.input('orrerySolarMode', 'visible', 'change');
  assert.equal(h.state.selected, 'Mars', 'a hidden control never steals the selection');
  h.leaveOrrery();
});
