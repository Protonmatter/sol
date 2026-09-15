import assert from 'node:assert/strict';
import test from 'node:test';
import { assertMarsOpticalTerrainSpin } from '../../tools/mars_spin_assertions.mjs';

function probe() {
  const rate = 7 * 86400;
  return { subjectBody: 'Mars', sampleError: '', initialState: { animate: true, anchor: 'Mars', hdrEnabled: true },
    terrain: { sourceSha256: 'source', actualPositionHash: 'positions', actualIndexHash: 'indices' },
    drawCounts: { physicalRejected: 0, terrainRejected: 0, presentationMismatch: 0 },
    samples: [0, 1, 2].map(i => {
      const angle = i * .05 * 2 * Math.PI / 5, c = Math.cos(angle), s = Math.sin(angle), epoch = 100 + i * .05 * rate;
      return { elapsedMs: 100 + i * 100, epoch, rate, physical: { body: 'Mars', passed: true },
        terrain: { passed: true, level: 4, sourceSha256: 'source', positionHash: 'positions', indexHash: 'indices', vertexCount: 131841,
          draw: { count: 783360, type: 5125, offset: 0 } }, presentation: { epoch, serial: i + 1, generation: 1 },
        model: [c, s, 0, 0, -s, c, 0, 0, 0, 0, 1, 0, .1, .2, .3, 1], normal: [c, s, 0, -s, c, 0, 0, 0, 1] };
    }) };
}

test('three complete physical Mars terrain draws at distinct engine epochs and matching final presentations pass', () => {
  assert.equal(assertMarsOpticalTerrainSpin(probe()).draws, 3);
});

test('late final presentation, partial draw, fallback optics and wrong source stay red', () => {
  for (const change of [p => p.samples[2].elapsedMs = 5000.01,
    p => p.samples[1].presentation.epoch = 0, p => p.samples[1].physical.passed = false,
    p => p.samples[1].terrain.passed = false, p => p.samples[1].terrain.sourceSha256 = 'old-source',
    p => p.samples[1].terrain.positionHash = 'wrong-mesh', p => p.samples[1].terrain.draw.count--,
    p => p.samples[1].epoch = p.samples[0].epoch, p => p.subjectBody = 'Earth',
    p => p.samples.pop(), p => p.initialState.hdrEnabled = false]) {
    const value = probe(); change(value); assert.throws(() => assertMarsOpticalTerrainSpin(value));
  }
});

test('preserving epochs while freezing model and normals cannot pass animation', () => {
  const value = probe(); for (const sample of value.samples) { sample.model = value.samples[0].model; sample.normal = value.samples[0].normal; }
  assert.throws(() => assertMarsOpticalTerrainSpin(value), /frozen|cap/);
});
