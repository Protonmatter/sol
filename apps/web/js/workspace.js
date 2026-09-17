// Session-only layout choices; no source, time, consent or scientific state lives here.
export function createWorkspaceState() {
  const inspectors = new Map([['today', false], ['sky', false], ['orrery', false]]);
  return {
    focus: false,
    timelineOpen: false,
    inspectorOpen(surface) { return inspectors.get(surface) === true; },
    inspectorVisible(surface) { return !this.focus && this.inspectorOpen(surface); },
    setInspector(surface, open) {
      if (!inspectors.has(surface)) throw new Error(`Unknown surface: ${surface}`);
      inspectors.set(surface, Boolean(open));
    },
  };
}

export const workspace = createWorkspaceState();
let layoutKey = '';

export function renderWorkspace(surface) {
  const open = workspace.inspectorVisible(surface);
  const timelineOpen = surface === 'today' && workspace.timelineOpen && !workspace.focus;
  document.body.classList?.toggle('panel-collapsed', !open);
  document.body.classList?.toggle('focus-mode', workspace.focus);
  const panel = document.getElementById('viewInspector');
  if (panel) { panel.hidden = !open; panel.inert = !open; }
  const overview = document.getElementById('destinationOverview');
  if (overview) overview.hidden = surface === 'today' || open || workspace.focus;
  const toggle = document.getElementById('panelToggle');
  if (toggle) {
    toggle.textContent = open ? 'Close inspector' : 'Open inspector';
    toggle.setAttribute('aria-label', toggle.textContent);
    toggle.setAttribute('aria-expanded', String(open));
  }
  const timeline = document.getElementById('timeline');
  if (timeline) timeline.hidden = !timelineOpen;
  const timeToggle = document.getElementById('timelineToggle');
  if (timeToggle) {
    timeToggle.textContent = surface === 'today' ? (timelineOpen ? 'Close timeline' : 'Open timeline') : 'Date & time';
    timeToggle.setAttribute('aria-controls', surface === 'today' ? 'timeline' : 'viewInspector');
    timeToggle.setAttribute('aria-expanded', String(surface === 'today' ? timelineOpen : open));
  }
  const focus = document.getElementById('focusToggle');
  if (focus) { focus.textContent = workspace.focus ? 'Exit focus' : 'Focus view'; focus.setAttribute('aria-pressed', String(workspace.focus)); }
  const key = `${surface}:${open}:${timelineOpen}:${workspace.focus}`;
  if (key !== layoutKey) {
    layoutKey = key;
    if (typeof window !== 'undefined' && typeof Event !== 'undefined') window.dispatchEvent?.(new Event('resize'));
  }
}

export function openInspector(surface) {
  workspace.focus = false;
  workspace.setInspector(surface, true);
  renderWorkspace(surface);
}

// A task opens its containing native disclosures before moving keyboard focus.
export function revealWorkspaceControl(surface, controlId) {
  openInspector(surface);
  const control = document.getElementById(controlId);
  let ancestor = control?.parentElement;
  while (ancestor && ancestor.id !== 'viewInspector') {
    if (ancestor.tagName === 'DETAILS') /** @type {HTMLDetailsElement} */ (ancestor).open = true;
    ancestor = ancestor.parentElement;
  }
  control?.focus();
  control?.scrollIntoView?.({ block: 'nearest', behavior: 'auto' });
}
