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
  let frames = 0, firstFrameMs = null;
  const changes = [{ elapsedMs: 0, geometry: initial }];
  const failure = reason => new Error(`${reason}: ${JSON.stringify({ initial, last: previous,
    elapsedMs: performance.now() - started, frames, firstFrameMs, changes })}`);
  while (performance.now() - started < 10_000) {
    // A stalled compositor must not leave an unresolved RAF beyond the deadline.
    await new Promise((resolve, reject) => {
      let frame;
      const timer = setTimeout(() => {
        cancelAnimationFrame(frame);
        reject(failure('canvas capture did not settle'));
      }, Math.max(0, 10_000 - (performance.now() - started)));
      frame = requestAnimationFrame(() => { clearTimeout(timer); resolve(); });
    });
    const now = performance.now(), { rect, value } = sample();
    frames += 1;
    if (firstFrameMs === null) firstFrameMs = now - started;
    const key = JSON.stringify(value);
    if (key !== previousKey) {
      previous = value; previousKey = key; stableSince = now;
      changes.push({ elapsedMs: now - started, geometry: value });
      if (changes.length > 32) changes.shift();
    }
    // Timers can also be delayed by a busy main thread: check after delivery.
    if (now - started >= 10_000) throw failure('canvas capture did not settle');
    // The initial real sample counts toward stability; waiting for the first RAF
    // must not discard an otherwise unchanged interval on a shared CI runner.
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
