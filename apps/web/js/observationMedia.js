// Shared by the small first-paint entry and the main application. No model,
// catalogue or visual-inventory import may delay the parser-discovered image.
const controllers = new WeakMap();

/** @param {Document} document */
export function initObservationMedia(document) {
  const image = /** @type {HTMLImageElement|null} */ (document.getElementById('observationImage'));
  if (!image) return null;
  if (controllers.has(image)) return controllers.get(image);
  let media = 'loading';
  const listeners = new Set();
  const publish = next => {
    media = next;
    image.hidden = media !== 'ready';
    const loading = document.getElementById('observationLoading');
    if (loading) loading.hidden = media !== 'loading';
    const unavailable = document.getElementById('observationUnavailable');
    if (unavailable) unavailable.hidden = media !== 'failed';
    document.getElementById('observationMedia')?.setAttribute('aria-busy', String(media === 'loading'));
    for (const listener of listeners) listener(media);
  };
  const loaded = () => {
    // A stale load event must not label a newly requested source as ready.
    const source = image.getAttribute('src');
    if (!source || (image.currentSrc && image.currentSrc !== new URL(source, document.baseURI).href)) return;
    publish(image.naturalWidth > 0 ? 'ready' : 'failed');
  };
  image.addEventListener('load', loaded);
  image.addEventListener('error', () => publish('failed'));
  document.getElementById('observationRetry')?.addEventListener('click', () => {
    const source = image.getAttribute('src');
    if (!source) return;
    publish('loading');
    image.src = source;
  });
  const controller = {
    get media() { return media; },
    subscribe(listener) { listeners.add(listener); listener(media); return () => listeners.delete(listener); },
  };
  controllers.set(image, controller);
  // load/error may already have fired before either entry executed. complete is
  // also true for a broken image, so naturalWidth must independently prove success.
  publish('loading');
  if (image.getAttribute('src') && image.complete) loaded();
  return controller;
}
