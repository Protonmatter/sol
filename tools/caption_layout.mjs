// This function is serialized into Chromium; imports resolve against the actual
// release page. Presentation clones must never change the engine's state.
export async function measureCaptionLayout({ focus }) {
  const entry = document.querySelector('script[type="module"][src^="app.js"]');
  const query = entry ? new URL(entry.src).search : '';
  const [{ store }, { renderDestinationOverview }] = await Promise.all([
    import(`./js/store.js${query}`), import(`./js/destinationOverview.js${query}`),
  ]);
  await document.fonts.ready;
  const state = store.orrery;
  const invariant = () => JSON.stringify([state.renderUnix, state.bodies, state.animate]);
  const original = invariant(), previousFocus = document.body.classList.contains('focus-mode');
  if (state.animate) throw new Error('Caption layout regression requires the scientific engine paused');
  const canvas = document.getElementById('orreryCanvas');
  const caption = document.querySelector('.destination-caption');
  const scene = canvas.closest('.viewport');
  const rect = node => { const r = node.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; };
  const alias = count => `${count} inner moon${count > 1 ? 's' : ''} hidden — the clock is advancing faster than they orbit. Slow the speed or untick Animate to see them.`;
  const cases = [
    { name: 'empty', moonsHiddenReason: '', spinLimitedCount: 0, simStepSeconds: 0 },
    { name: 'spin', moonsHiddenReason: '', spinLimitedCount: 8, simStepSeconds: 0 },
    { name: 'one-alias', moonsHiddenReason: alias(1), spinLimitedCount: 8, simStepSeconds: 0 },
    { name: 'multiple-alias', moonsHiddenReason: alias(12), spinLimitedCount: 8, simStepSeconds: 0 },
    { name: 'full-warning', moonsHiddenReason: alias(21), spinLimitedCount: 8, simStepSeconds: 86400 * 30 },
    { name: 'empty-return', moonsHiddenReason: '', spinLimitedCount: 0, simStepSeconds: 0 },
  ];
  const records = [];
  try {
    document.body.classList.toggle('focus-mode', focus);
    let baseline;
    for (const scenario of cases) {
      try {
        renderDestinationOverview('orrery', store.sky, { ...state, ...scenario,
          selected: 'Earth', selectedStar: null, galaxy: false, animate: true });
        const canvasRect = rect(canvas), captionRect = rect(caption), sceneRect = rect(scene);
        const text = document.getElementById('destinationCaveat').textContent;
        const record = { name: scenario.name, canvas: canvasRect, caption: captionRect, scene: sceneRect, text };
        records.push(record);
        baseline ??= canvasRect;
        if (JSON.stringify(canvasRect) !== JSON.stringify(baseline)) {
          throw new Error(`caption layout moved the canvas: ${JSON.stringify({ width: innerWidth, focus, baseline, record })}`);
        }
        const within = captionRect[1] >= canvasRect[1] + canvasRect[3] - .01
          && captionRect[1] + captionRect[3] <= sceneRect[1] + sceneRect[3] + .01
          && captionRect[0] >= sceneRect[0] - .01
          && captionRect[0] + captionRect[2] <= sceneRect[0] + sceneRect[2] + .01;
        const paragraphs = [...caption.querySelectorAll('p')].filter(node => node.textContent);
        const complete = caption.scrollHeight <= caption.clientHeight + 1 && paragraphs.every(node => {
          const p = node.getBoundingClientRect(), style = getComputedStyle(node);
          return node.getClientRects().length && style.visibility !== 'hidden'
            && node.scrollHeight <= node.clientHeight + 1 && node.scrollWidth <= node.clientWidth + 1
            && p.top >= captionRect[1] - .01 && p.bottom <= captionRect[1] + captionRect[3] + .01;
        });
        if (!within || !complete || canvasRect[2] <= 0 || canvasRect[3] <= 0
            || document.documentElement.scrollWidth > innerWidth) {
          throw new Error(`caption is clipped, overlaps, or overflows: ${JSON.stringify({ width: innerWidth, focus, within, complete, record })}`);
        }
        if (scenario.name === 'full-warning' && ![
          '21 inner moons hidden', 'The Moon’s drawn motion is under-sampled',
          'Rotation display rate-limited', 'Reference layers:',
        ].every(part => text.includes(part))) throw new Error('Caption regression omitted a requested warning');
      } finally {
        renderDestinationOverview('orrery', store.sky, state);
        if (invariant() !== original) throw new Error('Caption presentation changed scientific engine state');
      }
    }
    return { width: innerWidth, height: innerHeight, focus, engineUnchanged: true, records };
  } finally {
    document.body.classList.toggle('focus-mode', previousFocus);
    renderDestinationOverview('orrery', store.sky, state);
  }
}

export async function assertCaptionLayouts(page) {
  const original = page.viewport();
  if (!original) throw new Error('Caption layout regression requires an explicit browser viewport');
  const records = [];
  try {
    for (const [width, height] of [[1280, 900], [881, 900], [880, 900], [390, 844]]) {
      await page.setViewport({ ...original, width, height });
      for (const focus of [false, true]) records.push(await page.evaluate(measureCaptionLayout, { focus }));
    }
    return records;
  } finally {
    await page.setViewport(original);
  }
}
