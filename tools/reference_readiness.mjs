// Settle only requested maps. Deferred references are deliberately absent from GPU
// memory; a body-specific capture additionally requires its enabled material layers.
export async function waitForReferenceReadiness(page, body = null) {
  await page.waitForFunction(async expectedBody => {
    const entry = document.querySelector('script[type="module"][src^="app.js"]');
    const token = new URL(entry.src).search;
    const [{ store }, { appearanceReference, earthCloudRole }] = await Promise.all([
      import(`./js/store.js${token}`), import(`./js/planetAppearance.js${token}`),
    ]);
    const state = store.orrery, status = state?.appearanceStatus || {};
    if (!state || Object.values(status).some(value => ['queued', 'loading'].includes(value))) return false;
    if (Object.values(status).includes('unavailable')) return true; // Report an explicit failure below.
    const roles = ['surface'];
    if (expectedBody === 'Earth') {
      if (state.earthNight !== false) roles.push('night-lights');
      if (state.earthWeather !== false) roles.push(earthCloudRole(state));
      if (state.earthIce === true) roles.push('sea-ice');
    }
    return !expectedBody || !state.useTextures || roles.every(role => {
      const asset = appearanceReference(expectedBody, role);
      return !asset || status[asset.id] === 'ready';
    });
  }, { timeout: 75_000, polling: 50 }, body);
  const status = await page.evaluate(async () => {
    const entry = document.querySelector('script[type="module"][src^="app.js"]');
    const { store } = await import(`./js/store.js${new URL(entry.src).search}`);
    return { ...store.orrery.appearanceStatus };
  });
  if (Object.values(status).includes('unavailable')) throw new Error(`reference imagery unavailable: ${JSON.stringify(status)}`);
  return status;
}
