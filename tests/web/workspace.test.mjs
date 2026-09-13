import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createWorkspaceState, workspace, renderWorkspace, openInspector, revealWorkspaceControl } from "../../apps/web/js/workspace.js";

test("each surface starts closed and preserves its own inspector choice", () => {
  const state = createWorkspaceState();
  assert.equal(state.inspectorOpen("today"), false);
  state.setInspector("today", true);
  assert.equal(state.inspectorOpen("sky"), false);
  state.setInspector("sky", true);
  state.setInspector("sky", false);
  assert.equal(state.inspectorOpen("today"), true);
  assert.equal(state.inspectorOpen("orrery"), false);
});

test("focus temporarily hides drawers without destroying disclosure choices", () => {
  const state = createWorkspaceState();
  assert.equal(state.timelineOpen, false);
  state.setInspector("sky", true);
  state.timelineOpen = true;
  state.focus = true;
  assert.equal(state.inspectorVisible("sky"), false);
  state.focus = false;
  assert.equal(state.inspectorVisible("sky"), true);
  assert.equal(state.timelineOpen, true);
});

test("unknown destinations are rejected without mutating session state", () => {
  const state = createWorkspaceState();
  assert.throws(() => state.setInspector("__proto__", true), /Unknown surface/);
  assert.equal(state.inspectorOpen("today"), false);
});

test("layout rendering exposes accessible state and does not resize on every scientific frame", () => {
  const nodes = new Map(['viewInspector', 'panelToggle', 'timeline', 'timelineToggle', 'focusToggle'].map(id => [id, {
    hidden: false, inert: false, textContent: '', attributes: new Map(),
    setAttribute(name, value) { this.attributes.set(name, value); },
  }]));
  const classes = new Set();
  const priorDocument = globalThis.document, priorWindow = globalThis.window;
  let resizeCount = 0;
  globalThis.document = { getElementById: id => nodes.get(id), body: { classList: { toggle(name, enabled) { if (enabled) classes.add(name); else classes.delete(name); } } } };
  globalThis.window = { dispatchEvent() { resizeCount++; } };
  try {
    renderWorkspace('today');
    assert.equal(nodes.get('viewInspector').inert, true);
    assert.equal(nodes.get('viewInspector').hidden, true);
    assert.equal(nodes.get('timeline').hidden, true);
    assert.equal(nodes.get('panelToggle').attributes.get('aria-expanded'), 'false');
    const initialResizes = resizeCount;
    renderWorkspace('today');
    assert.equal(resizeCount, initialResizes);
    openInspector('today');
    assert.equal(nodes.get('viewInspector').hidden, false);
    assert.equal(nodes.get('panelToggle').attributes.get('aria-expanded'), 'true');
    renderWorkspace('sky');
    assert.equal(nodes.get('viewInspector').hidden, true);
    assert.equal(nodes.get('timelineToggle').textContent, 'Date & time');
    workspace.focus = true;
    openInspector('today');
    assert.equal(workspace.focus, false);
    assert.equal(nodes.get('viewInspector').inert, false);
  } finally {
    workspace.setInspector('today', false);
    workspace.focus = false;
    if (priorDocument === undefined) delete globalThis.document; else globalThis.document = priorDocument;
    if (priorWindow === undefined) delete globalThis.window; else globalThis.window = priorWindow;
  }
});

test("initial document has discoverable workspace controls and evidence outside the closed inspector", () => {
  const html = readFileSync(new URL('../../apps/web/index.html', import.meta.url), 'utf8');
  const inspectorIndex = html.indexOf('<aside id="viewInspector"');
  for (const id of ['timelineToggle', 'panelToggle', 'focusToggle', 'viewSource', 'viewTime', 'readinessState', 'ingestState']) {
    const index = html.indexOf(`id="${id}"`);
    assert.ok(index >= 0 && index < inspectorIndex, `${id} must be outside the inspector`);
  }
  assert.match(html, /id="timeline"[^>]* hidden/);
  assert.match(html, /id="viewInspector"[^>]* hidden inert/);
  assert.match(html, /id="panelToggle"[^>]*aria-expanded="false"/);
});

test('task entry opens nested native disclosures before focusing a hidden control', () => {
  const oldDocument = globalThis.document;
  const events = [];
  const inspector = { id: 'viewInspector', hidden: true, inert: true };
  const outer = { tagName: 'DETAILS', open: false, parentElement: inspector };
  const inner = { tagName: 'DETAILS', open: false, parentElement: outer };
  const control = { parentElement: inner, focus() { events.push([outer.open, inner.open, inspector.hidden, inspector.inert]); }, scrollIntoView(options) { events.push(options.block); } };
  const overview = { hidden: false };
  globalThis.document = { body: {}, getElementById: id => ({ viewInspector: inspector, skyTime: control, destinationOverview: overview })[id] };
  try {
    revealWorkspaceControl('sky', 'skyTime');
    assert.deepEqual(events, [[true, true, false, false], 'nearest']);
    assert.equal(overview.hidden, true, 'full tools and compact context must not compete');
    workspace.setInspector('sky', false); renderWorkspace('sky');
    assert.equal(overview.hidden, false);
    workspace.focus = true; renderWorkspace('sky');
    assert.equal(overview.hidden, true);
    revealWorkspaceControl('sky', 'missing');
    assert.equal(workspace.focus, false, 'an unavailable task target still reveals safe controls');
  } finally { globalThis.document = oldDocument; workspace.focus = false; workspace.setInspector('sky', false); }
});
