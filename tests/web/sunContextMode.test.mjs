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
  h.state.solarMode='reconstructed-euv'; // This regression specifically exercises the retained legacy reference.
  await h.enterOrrery(); await h.settleCatalogues(); h.setAnimate(false);
  assert.equal(h.state.solarMode, 'reconstructed-euv', 'legacy EUV remains explicitly selectable');

  // Inspecting loads the atlas and makes the Sun the subject.
  h.event('orreryInspectSun', 'click'); await h.settleCatalogues();
  assert.equal(h.state.solarStatus, 'ready');
  const inspected = repaint(h);
  assert.deepEqual(inspected.euv.map(draw => draw.uniforms.u_pass), [1, 2]);
  assert.ok(inspected.euv.every(draw => draw.uniforms.u_quiet === 4), 'EUV draws sample the radial quiet profile');
  assert.equal(inspected.euv[0].uniforms['u_loopGain[0]'].length, 24, 'source arches plus whole-sphere arches');
  assert.ok(inspected.euv[0].uniforms['u_loopGain[0]'].slice(12).every(gain => Math.abs(gain - 0.42) < 1e-6));
  assert.equal(inspected.euv[0].uniforms.u_phase, 0);
  assert.equal(inspected.euv[0].uniforms.u_displayGain, 6, 'the live EUV disk is lifted above the admitted 1x gold map');
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
  assert.equal(overview.visible[0].uniforms.u_activity, 0, 'context Sun is the flat disk: no spots or cells in the overview');

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
  const photosphere = repaint(h).visible;
  assert.equal(photosphere.length, 1, 'the visible photosphere draws');
  assert.equal(photosphere[0].uniforms.u_activity, 1, 'the visible subject shows the educational photosphere');
  assert.equal(photosphere[0].uniforms.u_activityFrame.length, 9, 'spots and cells receive the EUV source frame');
  const frame = photosphere[0].uniforms.u_activityFrame;
  for (let j = 0; j < 3; j++) {
    const column = frame.slice(j * 3, j * 3 + 3);
    assert.ok(Math.abs(Math.hypot(...column) - 1) < 1e-5, 'body-to-source frame is a rotation');
  }
  // Lock the multiply order: the IAU pole (body +Z) maps into the source basis, whose +X
  // is built perpendicular to that pole and whose +Y is the pole projected off the
  // observer axis. So the third column is (0, cos B0, sin B0) with |B0| <= 7.25 degrees.
  // R_source * R_body, or either transpose, puts the pole somewhere else.
  const pole = frame.slice(6, 9);
  assert.ok(Math.abs(pole[0]) < 1e-5, 'solar pole has no source +X component');
  assert.ok(pole[1] > Math.cos(7.25 * Math.PI / 180) - 1e-5, 'solar pole is the source +Y axis to within B0');
  const restSpots = photosphere[0].uniforms['u_spot[0]'];

  // The harness window reports no reduced motion here, so the activity clock runs.
  const start = h.state.lastTick || 0;
  for (let step = 1; step <= 3; step++) h.frame(start + step * 1000);
  const running = repaint(h).visible[0].uniforms;
  assert.ok(running.u_activityDays > 0, 'the visible Sun activity clock advances on wall time');
  assert.ok(running['u_spot[0]'].some((value, i) => Math.abs(value - restSpots[i]) > 1e-7), 'spot groups move with it');

  // Turning reduced motion on mid-session shows the clock at zero rather than freezing
  // the state it had reached; the accumulated flow time is not what is drawn.
  h.setWindowReducedMotion(true);
  const held = repaint(h).visible[0].uniforms;
  assert.equal(held.u_activityDays, 0, 'reduced motion shows the activity clock at zero');
  assert.deepEqual(held['u_spot[0]'], restSpots, 'spots return to their rest positions');
  h.setWindowReducedMotion(false);
  const resumed = repaint(h).visible[0].uniforms;
  assert.equal(resumed.u_activityDays, running.u_activityDays, 'the clock resumes where it was');

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
