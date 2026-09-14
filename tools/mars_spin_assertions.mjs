import assert from 'node:assert/strict';

/** Additional Mars acceptance; the original Earth gate is unchanged. */
export function assertMarsOpticalTerrainSpin(probe) {
  assert.equal(probe.subjectBody, 'Mars');
  assert.equal(probe.sampleError, '');
  assert.ok(probe.samples.length >= 3, `Insufficient Mars final draws: ${probe.samples.length}`);
  assert.equal(probe.initialState.animate, true); assert.equal(probe.initialState.anchor, 'Mars');
  assert.equal(probe.initialState.hdrEnabled, true);
  let totalAngle = 0, previousRotation = null;
  const epochs = new Set();
  for (const sample of probe.samples) {
    assert.ok(Number.isFinite(sample.elapsedMs) && sample.elapsedMs >= 0 && sample.elapsedMs <= 5000, 'Mars final draw exceeded five seconds');
    assert.ok(!epochs.has(sample.epoch), 'Mars final draw repeated an engine epoch'); epochs.add(sample.epoch);
    assert.ok(sample.physical?.passed && sample.physical.body === 'Mars', 'Mars draw did not use admitted physical optics');
    assert.ok(sample.terrain?.passed && sample.terrain.level === 4, 'Mars draw did not use admitted level-4 terrain');
    assert.equal(sample.terrain.sourceSha256, probe.terrain.sourceSha256);
    assert.equal(sample.terrain.positionHash, probe.terrain.actualPositionHash);
    assert.equal(sample.terrain.indexHash, probe.terrain.actualIndexHash);
    assert.equal(sample.terrain.vertexCount, 131841); assert.equal(sample.terrain.draw.count, 783360);
    assert.equal(sample.terrain.draw.type, 5125); assert.equal(sample.terrain.draw.offset, 0);
    assert.ok(sample.presentation && sample.presentation.epoch === sample.epoch, 'Mars producer did not reach its matching final HDR presentation');
    assert.ok(Number.isInteger(sample.presentation.serial) && Number.isInteger(sample.presentation.generation));
    const normal = sample.normal, model = sample.model, rotation = [];
    assert.ok(normal?.length === 9 && model?.length === 16 && [...normal, ...model, sample.epoch, sample.rate].every(Number.isFinite), 'Nonfinite Mars draw transform');
    assert.ok(Math.abs(sample.rate - 7 * 86400) < 1e-6, 'Mars gate did not use the selected seven-days-per-second rate');
    const equatorialScale = Math.hypot(...model.slice(0, 3));
    for (let column = 0; column < 3; column++) {
      const axis = model.slice(column * 4, column * 4 + 3), length = Math.hypot(...axis);
      const normalLength = Math.hypot(...normal.slice(column * 3, column * 3 + 3));
      assert.ok(length > 0 && normalLength > 0, 'Degenerate Mars transform');
      for (let row = 0; row < 3; row++) {
        assert.ok(Math.abs(axis[row] * equatorialScale / (length * length) - normal[column * 3 + row]) <= 1e-5, 'Mars normal does not match the model inverse transpose');
        rotation.push(normal[column * 3 + row] / normalLength);
      }
    }
    for (let a = 0; a < 3; a++) for (let b = 0; b < 3; b++) {
      const dot = rotation.slice(a * 3, a * 3 + 3).reduce((sum, value, k) => sum + value * rotation[b * 3 + k], 0);
      assert.ok(Math.abs(dot - Number(a === b)) <= 1e-5, 'Mars rotation is not orthonormal');
    }
    if (previousRotation) {
      const previous = probe.samples[epochs.size - 2], expected = (sample.epoch - previous.epoch) / sample.rate * (2 * Math.PI / 5);
      const trace = rotation.reduce((sum, value, k) => sum + value * previousRotation[k], 0);
      const angle = Math.acos(Math.max(-1, Math.min(1, (trace - 1) / 2)));
      assert.ok(expected > 0 && Math.abs(angle - expected) <= Math.max(1e-4, expected * .10), `Mars submitted spin frozen or outside cap: angle=${angle}, expected=${expected}`);
      totalAngle += angle;
    }
    previousRotation = rotation;
  }
  assert.ok(totalAngle >= .01, 'Mars submitted spin is frozen or undersampled');
  assert.equal(probe.drawCounts.physicalRejected, 0); assert.equal(probe.drawCounts.terrainRejected, 0);
  assert.equal(probe.drawCounts.presentationMismatch, 0);
  return { draws: probe.samples.length, radians: totalAngle, deadlineMs: 5000 };
}
