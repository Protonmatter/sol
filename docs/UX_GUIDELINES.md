# UI and UX engineering guidelines

Status: current  
Updated: 2026-09-13

These rules turn the product principles in `SPEC.md` into acceptance criteria. They use
Nielsen Norman guidance and WCAG/WAI-ARIA as references; the exact standards boundary is
recorded in `STANDARDS.md`.

## Progressive-disclosure contract

RFC 0003 leads with a preserved NASA observation, a compact overview and an explicit
Observe/Research choice. The model inspector and timeline start closed in Research,
each opened directly from its toolbar. Sun model selection opens its inspector; Sky/System
selection updates a concise context card without opening the full tools. Focus mode preserves essential
scientific status and an explicit exit. Layout choices are session-only and per destination.
Selected-object image/rendering sources distinguish verified browse products from qualified
global textures and neutral missing-detail fallbacks. A mission credit is not a live-data badge.

Sky/System context cards MUST use admitted scene state, including the retained observer and
actual provider after failure. Reference body facts MUST remain separate from epoch-dependent
metadata. Search, location, time and object-detail actions open their containing native
disclosures before moving focus. A selection made within an open object list preserves the
list's focus and disclosure intent. System camera shortcuts explicitly exit free flight
before anchoring; navigation and selection do not modify scientific positions.

Constellation scaffolding starts off in My Sky. Compass and text insets may declutter the
projection but MUST NOT change altitude/azimuth values. Display-scale, moon availability,
under-sampling and rotation-limit notices stay visible with tools closed and in focus mode.
The caption takes its own layout space, including at 320 pixels. Pending archive images stay
hidden until the matching source decodes; old pixels cannot acquire a new object's credits.

The initial Sun view MUST show:

- the primary destination choices;
- the original observed Sun image or an explicit unavailable state with retry;
- one plain-language interpretation;
- observation source, capture time, archival status and false-color interpretation;
- an obvious Research entry for the model timeline, model feed/readiness and deeper controls.

The observed-image overview MUST NOT use synthetic snapshot metrics as image facts.
Image failure MUST NOT substitute a model without explicit user choice. Research keeps
all model status, uncertainty, feed and source limitations visible at their point of use.

Secondary or rare controls MUST use clearly labelled native disclosure controls or a
similarly accessible pattern. Labels describe what users will find, not vague terms such
as "More." A primary task MUST NOT require opening an advanced disclosure. The normal
workflow SHOULD remain within two disclosure levels; a third level requires a task-analysis
record and usability evidence.

Defaults express importance:

- the essential current view is visible;
- advanced overlays, deep provenance, camera tuning, and research material are optional;
- safety, accuracy, privacy, degraded-state, and consent information is never hidden merely
  to make the interface look simpler;
- disclosure state must not erase user work or silently change the scientific state.

For Sol, the `Under the hood — model & data`, `What it means for Earth`, Solar System
overlays, and camera/motion controls are secondary. The current status summary and remote
location-transmission consent are primary at the moment they affect a decision.

## Accessibility and input

- Target WCAG 2.2 Level AA; do not claim conformance until a scoped manual audit exists.
- Prefer native HTML controls. Every control needs an accessible name and exposed state.
- Pointer gestures need keyboard or discrete-control equivalents. Drag-only behavior is
  insufficient.
- Canvas/WebGL information needs a textual or list alternative for meaningful objects,
  selection, position, and status.
- Focus must be visible and not obscured. Modal tours trap focus, support Escape/Skip, and
  restore focus to the invoker.
- Dynamic status uses appropriately scoped `aria-live` regions without flooding users.
- Respect reduced motion; essential state changes must not depend on animation.
- Responsive variants must preserve content, task completion, focus order, and labels.

## Feedback, errors, and user control

- Long or asynchronous actions expose progress or status and a stable completion state.
- Errors state what happened, what remains valid, and the recovery action.
- Provider failure returns to the on-device path or clearly explains unavailability.
- User-selected time, body, region, and disclosure state remain stable unless the user
  explicitly resets them.
- Destructive or privacy-sensitive actions require clear intent and, where applicable,
  confirmation.
- Copy distinguishes observed, synthetic, inferred, blended, cached, degraded, and
  unavailable states.

## Consistency, recognition, and help

- Use the same names for destinations, providers, coordinate/time concepts, and data states
  in controls, status, exports, and documentation.
- Keep common choices visible; avoid making users remember hidden state.
- Tooltips and glossary entries supplement labels but never replace them.
- Scientific detail cards separate measured, derived, estimated, and unavailable values.
- Help is contextual and skippable; the interface remains usable without completing a tour.

## UI change workflow

Before implementation:

1. name the primary user task and likely novice/advanced split;
2. map the information hierarchy and disclosure levels;
3. define empty, loading, success, degraded, unavailable, and error states;
4. define keyboard, focus, touch, pointer, responsive, and reduced-motion behavior;
5. attach affected `SOL-UX-*`, privacy, science, and data requirements.

Before merge:

1. add pure unit tests for state or geometry;
2. add static DOM contract checks;
3. exercise the full flow in Chromium with real WASM/WebGL;
4. add semantic visual assertions when pixels express correctness;
5. manually inspect narrow and wide layouts, keyboard-only use, zoom, and disclosure copy;
6. record any manual-only result in the pull request.

## Current automated UX contract

`tools/validate_ux_contract.py` checks the stable document structure: destination state,
essential status, native disclosures, default open/closed policy, accessible names,
text alternatives, dialog semantics, and responsive/reduced-motion hooks.

`tools/browser_validation.mjs` checks runtime state and interaction: initial disclosure,
open/close behavior, keyboard-accessible paths, tour focus/escape, provider recovery,
WASM flows, WebGL behavior, and semantic image properties.

Automated checks do not replace usability research, screen-reader testing, cognitive
walkthroughs, or a full WCAG audit.
