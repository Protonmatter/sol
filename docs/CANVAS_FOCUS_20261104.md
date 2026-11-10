# Solar System keyboard focus — 2026-11-04

Keyboard focus on the Solar System canvas is now visible inside its clipping
viewport. A narrow live audit reproduced the original defect, the settled
original-artifact regression fails, and the corrected artifact passes the full
browser and native rendering scenarios. Requirements: `SOL-UX-002`, `SOL-TEST-001`.
This is a local verified correction; the production-readiness goal remains active.

## Defect and minimal correction

The runtime makes only `orreryCanvas` keyboard-focusable. The global focus rule
placed its 2px blue outline 2px outside the canvas, where the parent viewport's
`overflow:hidden` clipped it. Keyboard users could operate the camera while
losing the visible location of focus. Severity: P2.

The production delta is five lines in `apps/web/styles.css`: retain the existing
focus ring and inset it with `#orreryCanvas:focus-visible { outline-offset:-4px; }`.
The selector affects only the keyboard-focused Solar System canvas. Dimensions,
rendering programs, geometry, orbital calculations, input handlers and other
controls' focus styling are unchanged. Sun and Sky keep their textual controls.

Original stylesheet SHA-256:
`8c3530fa77ef8b3a3e1af908d134486c97c77e1ebbe276a6399a483c0c8ac7ac`.
Corrected stylesheet SHA-256:
`a16b6c959eb05b8efdb6c4badfddd4278df5c7a8aa18f8fed6c8478dc91b6efe`.
Removing exactly this rule and comment reproduces the original bytes. Independent
read-only review verifies the delta and staged source mapping.

## Regression and rendering evidence

`tools/review_ui_contract.mjs` adds `assertSceneCanvasFocus`, called by the
existing complete browser scenario after initial WebGL readiness. It records
actual focus/pseudo state, outline ink, rectangular ancestor clipping, CSSOM
diagnostics and a screenshot. `browser_validation.mjs` includes the helper's hash
in its evidence. Final helper SHA-256:
`30be503c9cdf7df2d53716b3d0fd5d76f75002f07deed7bd1a01dacdd8c85f6a`.

The first measurements were taken before the focus paint settled: both runs
reported the preceding 3px/current-color outline, while the candidate screenshot
already showed the blue inset ring. Those failed runs remain preserved. The
assertion now waits for two animation-frame callbacks, captures the painted
state, then measures. It uses no fixed sleep or larger rendering deadline.

A replay of the old artifact initially refused the current candidate stylesheet
at the existing source-hash guard. That refusal is retained. A bounded local test
driver snapshots both byte sets, temporarily restores only the exact original
stylesheet for the red replay, then restores the candidate in `finally` only if
the source is still the expected original. It records successful restoration
and candidate equality after the green run; the source guard is unchanged.

| Check | Actual result |
| --- | --- |
| Settled original artifact | Fails exactly the outline-clipping assertion: 2px blue outline, offset +2px, clipped by `.viewport` |
| Settled corrected artifact | Passes the outline assertion: 2px blue outline, offset -4px, no rectangular ancestor clipping |
| Complete existing SwiftShader browser scenario | Passes, including Sun color, blue Earth, camera round-trip, shadows, appearance, worker execution and runtime errors |
| Native Adreno rendering | All 22 checks pass, including context restoration, level-4 Moon/Mars geometry, physical optical animation, actual source-image gallery and 390px reflow |
| Node suites, final source | All 1,428 tests pass |
| Whole hand-written web runtime | 97.54% line coverage at unchanged 90% floor; fresh browser map merged with the retained Node map for byte-identical JavaScript |
| Static UX, JavaScript syntax, docs and SDLC | Pass locally |

The new manifest is
`9dd2d12c14eeda5a385d5c48002abd71da3c0fe39b93ede4952cf02bff15d65a`,
release `local-canvas-focus-20261104`. Its 128 HTML/CSS/JavaScript source identities
match the prior artifact except the stylesheet. Rebuilt qualification-compiler
WASM remains byte-identical to the previous Windows candidate:

- Ephemeris: `2b49b29098e07475cdb73cab45ee784a6017424dfacc32a6882719564ed05ca2`.
- Solar: `f8a78a07da7c742735288b32613a8344fe7ab5df2eedea27b4a4d866c9599199`.

The prior Linux artifact used different host-specific WASM bytes; the red/green
focus comparison does not claim cross-host binary identity. Source correspondence
proves the UI source change is limited to CSS. Scientific model qualification is
reported separately in the [validator follow-up](PYTHON_SCOPE_VALIDATORS_20261104.md).

The successful browser receipt is SHA-256
`fd478074c9ccda83a82d450f508e3c82118c2a1905c88ef0a8a55d4bf54e80d3`.
The native receipt is SHA-256
`0ddbea0ce59fe352057e08862bd8218fcc9f7fad97c95498771ec2ad3aeda088`.
It observes Qualcomm Adreno X1-85 through the actual application WebGL2 context,
reports no source differences, and retains empty page/console error lists.
Chrome is 156.0.8078.48 on Windows ARM64; Node is 24.18.0.

## Bounded manual observations

The live narrow audit verifies skip navigation, Observe/Research activation,
tour focus containment in both directions, Escape restoration, Sky object search,
retained Mars selection focus, inspector-close focus restoration, Date & time
disclosure focus and UTC selection. At2201-01-01, Sky explicitly displays
approximate exploration outside1900–2200, with accuracy still unvalidated.
Observed imagery is labelled archival and false color; synthetic/model and
visibility limitations remain visible.

After the fix, a fresh local candidate at580x330 CSS pixels reaches the actual
canvas in seven Tab presses from Solar System navigation. Focus remains on the
canvas during Left/Right keyboard input. The blue inset outline is visibly
present; read-only inspection reports `tabIndex:0`, active `:focus-visible`,
positive outline width and negative inset offset. There is no horizontal overflow.
The earlier audit ran at580x412. The browser viewport override did not change the
observed viewport; it is not counted as a successful wide manual test. Wide1280x900
and native390px results are separately automated. Owned tabs/listeners were closed.

## Reproduction, scope and rollback

Use fresh output paths and the existing local toolchain. The staging command
records an uncommitted snapshot based on the base revision; it does not imply
that revision alone contains the changes.

```text
python tools/build_wasm.py --out-root build/NEW-focus-wasm
python tools/build_web.py --wasm-dir build/NEW-focus-wasm --out-root build/NEW-focus-site --release-id local-focus-NEW --source-sha 3a55a795767f3043112673ea561cdaf6dc7e2d0f --repository Protonmatter/sol --run-id 20261104 --base-path /sol/
npm test
python tools/validate_ux_contract.py
node tools/browser_validation.mjs --web-root=build/NEW-focus-site --output-dir=coverage/NEW-focus-browser
node tools/physical_rendering_validation.mjs --web-root=build/NEW-focus-site --out=coverage/NEW-focus-native --backend=native --context-loss --mars-optical-animation --terrain-close-detail
python tools/validate_docs.py
python tools/validate_sdlc.py
git diff --check
```

Set `CHROME_BIN` to the installed official Chrome executable when needed.
The local previews bind loopback only. No credentials, cloud project mutation,
production access or application network call was added. Native execution must
be established from the observed context renderer, not launch flags alone.

The geometric assertion does not prove Tab reachability, opacity, occlusion,
contrast, viewport intersection, or transformed/nonrectangular clipping. Its
programmatic focus is complemented by the stated live Tab test and screenshots.
There is no screen-reader, full WCAG, cross-browser or physical touch certification.
It makes no continuous orbit/observer accuracy claim. Hosted/release/platform and
distribution-notice holds remain open.

Rollback removes only the new CSS rule and its assertion/call, preserving earlier
fixes and all red/green artifacts. The original focus-clipping defect would return.
No commit, push, publication or production deployment occurred.
