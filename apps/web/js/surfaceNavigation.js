import { store } from './store.js?v=dcca6290db';

export function updateModeButtons() {
  document.querySelectorAll('.mode-button').forEach(node => {
    const isActive=/** @type {HTMLElement} */ (node).dataset.mode===store.activeMode;
    node.classList.toggle('active',isActive);
    node.setAttribute('aria-pressed',isActive?'true':'false');
  });
}
