import assert from 'node:assert/strict';

export function assertManifestRequestIdentity(requests) {
  const manifest = requests.filter(url => new URL(url).pathname.endsWith('/js/visualAssetManifest.js'));
  assert.equal(manifest.length, 1, `visual inventory must load once through its exact import URL: ${JSON.stringify(manifest)}`);
  return manifest;
}

// Real mobile layout and native disclosure, with an isolated waiting-worker fixture.
// Production activation/identity checks execute without installing or activating a worker.
export async function assertMobileOfflineUpdate(page) {
  const viewport = page.viewport();
  try {
    await page.setViewport({ width: 390, height: 844, deviceScaleFactor: 1 });
    await page.evaluate(async () => {
      const entry = document.querySelector('script[type="module"][src^="app.js"]');
      const { registerOfflineRelease } = await import(`./js/releaseClient.js${new URL(entry.src).search}`);
      const button = document.getElementById('releaseUpdate'), status = document.getElementById('releaseStatus');
      const menu = button.closest('details');
      const saved = { hidden: button.hidden, disabled: button.disabled, onclick: button.onclick, text: status.textContent, open: menu.open };
      const messages = [], navigations = [], listeners = {};
      const waiting = { postMessage(message, ports = []) {
        messages.push(message);
        if (message.type === 'GET_RELEASE_ID') ports[0].postMessage({ type: 'RELEASE_ID', release_id: 'review-B', base_path: '/', namespace: 'releases/review-B/' });
      } };
      await registerOfflineRelease({
        serviceWorker: { register: async () => ({ waiting, active: {}, addEventListener() {} }), addEventListener: (type, fn) => { listeners[type] = fn; } },
        location: { hash: '#sky=0,0,0,0', assign: value => navigations.push(value) },
        document, basePath: '/', releaseId: 'review-A',
      });
      globalThis.__solReviewUpdate = { messages, navigations, listeners, restore() {
        button.hidden = saved.hidden; button.disabled = saved.disabled; button.onclick = saved.onclick;
        status.textContent = saved.text; menu.open = saved.open;
      } };
    });
    const summary = await page.$('.offline-menu summary');
    assert.ok(summary && await summary.isVisible(), 'mobile Offline disclosure must be visible');
    const closed = await summary.boundingBox();
    assert.ok(closed?.height >= 44, 'mobile Offline disclosure retains a 44px touch target');
    await summary.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.$eval('.offline-menu', node => node.open), true, 'keyboard opens native disclosure');
    const button = await page.$('#releaseUpdate');
    assert.ok(await button.isVisible(), 'verified update action is reachable on mobile');
    assert.match(await page.$eval('#releaseStatus', node => node.textContent), /Verified update ready/);
    const geometry = await page.$eval('#releaseUpdate', node => {
      const r = node.getBoundingClientRect();
      return { left: r.left, right: r.right, width: innerWidth, overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.ok(geometry.left >= 0 && geometry.right <= geometry.width && !geometry.overflow, `mobile update must fit: ${JSON.stringify(geometry)}`);
    await button.click();
    await page.waitForFunction(() => globalThis.__solReviewUpdate.messages.some(m => m.type === 'ACTIVATE_RELEASE'), { polling: 50 });
    const result = await page.evaluate(() => {
      const fixture = globalThis.__solReviewUpdate;
      const before = [...fixture.navigations];
      fixture.listeners.controllerchange();
      return { messages: fixture.messages, before, after: fixture.navigations };
    });
    assert.deepEqual(result.messages.at(-1), { type: 'ACTIVATE_RELEASE', release_id: 'review-B' });
    assert.deepEqual(result.before, []);
    assert.deepEqual(result.after, ['/#sky=0,0,0,0']);
    await summary.focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.$eval('.offline-menu', node => node.open), false);
    return { viewport: 390, touchTargetHeight: closed.height, ...result };
  } finally {
    await page.evaluate(() => { globalThis.__solReviewUpdate?.restore(); delete globalThis.__solReviewUpdate; });
    await page.setViewport(viewport);
  }
}
