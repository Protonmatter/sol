import {writeText,writeAttribute,writeBoolean} from './domWrites.js';

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
  if (panel) { writeBoolean(panel, 'hidden', !open); writeBoolean(panel, 'inert', !open); }
  const overview = document.getElementById('destinationOverview');
  if (overview) writeBoolean(overview, 'hidden', surface === 'today' || open || workspace.focus);
  const toggle = document.getElementById('panelToggle');
  if (toggle) {
    writeText(toggle, open ? 'Close inspector' : 'Open inspector');
    writeAttribute(toggle, 'aria-label', toggle.textContent);
    writeAttribute(toggle, 'aria-expanded', String(open));
  }
  const timeline = document.getElementById('timeline');
  if (timeline) writeBoolean(timeline, 'hidden', !timelineOpen);
  const timeToggle = document.getElementById('timelineToggle');
  if (timeToggle) {
    writeText(timeToggle, surface === 'today' ? (timelineOpen ? 'Close timeline' : 'Open timeline') : 'Date & time');
    writeAttribute(timeToggle, 'aria-controls', surface === 'today' ? 'timeline' : 'viewInspector');
    writeAttribute(timeToggle, 'aria-expanded', String(surface === 'today' ? timelineOpen : open));
  }
  const focus = document.getElementById('focusToggle');
  if (focus) { writeText(focus, workspace.focus ? 'Exit focus' : 'Focus view'); writeAttribute(focus, 'aria-pressed', String(workspace.focus)); }
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
