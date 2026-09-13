/** Runs inside Chromium via ElementHandle.evaluate; keep this function serializable. */
export async function waitForCanvasGeometry(node) {
  await document.fonts.ready;
  const sample = () => {
    const rect = node.getBoundingClientRect();
    return { rect, value: [rect.x, rect.y, rect.width, rect.height,
      visualViewport.pageLeft, visualViewport.pageTop, node.width, node.height] };
  };
  const initial = sample().value;
  const started = performance.now();
  let previous = initial, previousKey = JSON.stringify(initial), stableSince = started;
  let samples = 1;
  const changes = [{ elapsedMs: 0, geometry: initial }];
  const failure = reason => new Error(`${reason}: ${JSON.stringify({ initial, last: previous,
    elapsedMs: performance.now() - started, samples, changes })}`);
  // Measure layout independently of compositor cadence. Hosted Chromium withheld
  // even the first RAF callback. A callback would not prove rendered pixels:
  // the driver still captures and validates the actual screenshot after this wait.
  while (performance.now() - started < 10_000) {
    await new Promise(resolve => setTimeout(resolve,
      Math.max(0, Math.ceil(Math.min(50, 10_000 - (performance.now() - started))))));
    const { rect, value } = sample(), now = performance.now();
    samples += 1;
    const key = JSON.stringify(value);
    if (key !== previousKey) {
      previous = value; previousKey = key; stableSince = now;
      changes.push({ elapsedMs: now - started, geometry: value });
      if (changes.length > 32) changes.shift();
    }
    // Timers can also be delayed by a busy main thread: check after delivery.
    if (now - started >= 10_000) throw failure('canvas capture did not settle');
    // The initial real sample counts toward stability; actual geometry changes
    // always restart the full interval.
    if (now - stableSince >= 200) {
      if (rect.left < 0 || rect.top < 0 || rect.right > innerWidth || rect.bottom > innerHeight
          || node.width !== Math.round(node.clientWidth * devicePixelRatio)
          || node.height !== Math.round(node.clientHeight * devicePixelRatio)) {
        throw failure('canvas capture geometry is not visible/aligned');
      }
      return value;
    }
  }
  throw failure('canvas capture did not settle');
}
