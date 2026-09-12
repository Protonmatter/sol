# Experience design review and proposed redesign

## Recommendation and alternatives

Use a substantial native-ESM shell and workflow redesign. Retain the Rust engines and existing canvas/WebGL renderers while changing navigation, hierarchy, controls, status, selection, responsive composition and explanations.

| Approach | Benefit | Limitation | Decision |
|---|---|---|---|
| Patch the existing panel | Fastest path to correct claims and focus behavior | Tall mobile controls and hideable navigation still obscure the task | Use for immediate corrections only |
| Redesign the shared shell and destination workflows | Material task improvement with a common evidence/privacy model and incremental migration | Requires coordinated HTML/CSS/state tests | Recommended |
| Split into three independently routed applications | Each destination can optimize independently | Duplicates lifecycle, privacy, evidence and offline behavior | Defer; no demonstrated need |

The current desktop control panel is also the navigation container. Narrow CSS places that entire panel before the hero and stacks destination buttons vertically. The proposal removes that structural obstacle, not merely its spacing. The existing seven-step tour becomes optional Help content instead of automatically obscuring first paint.

## Information architecture

Persistent header: **Sol · The Sun · My Sky · Solar System · Sources & limits · Help**. Keep destination navigation outside the collapsible inspector. Use ordinary navigation links/buttons with native semantics; do not simulate a desktop menubar. Native disclosures handle research detail; an actual modal is reserved for consent or an intentionally modal mobile inspector.

Desktop, approximately 1100 CSS pixels and wider:

```text
Sol       The Sun | My Sky | Solar System          Sources & limits   Help
View title   One concise interpretation      Source / time / status
+------------------------------------------------+----------------------+
|                                                | Selected item        |
|         Primary visualization                  | Key facts            |
|                                                | Objects / Layers     |
| Minimal viewport controls                      | Research disclosure  |
+------------------------------------------------+----------------------+
Contextual timeline / playback / task-specific controls
Optional learning content
```

Use a 20–24rem inspector with a useful flexible visualization column. Expand view hides the inspector but never navigation, active time, essential status or the Show inspector action. Avoid floating panels over important objects by default.

Narrow layout, one document scroll:

```text
Sol       Sun | My Sky | Solar System
Title + one sentence + essential source/time
Visualization
Primary time/selection controls
Selected item + searchable textual alternative
Layers / Learn / Model and data disclosures
```

Use DOM order that matches visual, reading and keyboard order. At short landscape heights or zoom, let content reflow rather than forcing an above-the-fold canvas at the cost of clipped controls. Three short destination labels remain reachable at 320 CSS pixels; accessible names retain full destination names. Tabs do not disappear inside an overflow menu.

## Visual system

Retain the restrained dark scientific theme and system fonts. Define CSS tokens for surface/base/elevated backgrounds, text/muted text, border, focus, selection and source status. Use a 4/8/12/16/24/32px spacing scale, body text around 1rem with 1.5 line height, and tabular numerals for changing values. Text density increases only in the research inspector. Do not encode observed/synthetic/stale solely through color.

Before approval, provide a component sheet covering destination navigation, status chip, compact evidence row, selected-object card, disclosure, labeled input with error, timeline entry/gap, modal consent and unavailable state. Measure colors on their actual backgrounds, including disabled, selected and focus states. Preserve a strong visible focus indicator; do not hide it for visual polish.

Primary touch actions target 44x44 CSS pixels as a product choice. WCAG 2.2 AA remains the scoped accessibility target, including reflow, keyboard access, visible/unobscured focus, non-text contrast and alternatives to dragging. These targets require manual complete-flow review; automation alone is not a conformance claim. [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/)

## The Sun: observe, understand, inspect

Default composition: recognizable Sun image or honest model fallback, one plain-language sentence, image/model time, source kind and Research and learning boundary. Move equations, adapter internals and long product introductions into disclosures.

Primary choices are **Observed image** and **Model**. Wavelength controls belong to Observed image. A registered comparison can be enabled only with the AC-06 evidence; otherwise the disabled comparison action explains that alignment is unavailable. Model regions never sit on an unregistered observed image as if they were measured locations.

Representative copy contracts:

- Image with known capture time: `SDO continuum image from [capture time]. Model results are available separately.`
- Missing image: `Observed image unavailable. Showing the synthetic model.`
- Scalar-context fixture: `An illustrative model using context from [source date]; magnetic regions are synthetic.`
- Cycle: `Idealized cycle, month 24. These regions are generated.`
- Cached image with unknown capture time: `Cached observed image; capture time unavailable.`

The bracketed values above are formatted fields supplied by the resolver, not free-form placeholders in implementation. A fresh HTTP response cannot produce “current observation” without source-time evidence. Counts explicitly separate total modeled regions and geometrically visible modeled regions.

Selecting a region from canvas or the keyed list opens one compact card: name/ID, current modeled anchor, birth information, model age, normalized magnetic context and heuristic score with limits. Never call a modeled anchor an observed sunspot centroid. The confidence overlay uses a declared monotone encoding of the actual per-cell score, with tick marks 0, 0.25, 0.5, 0.75, 1 and the label **Heuristic model score — not probability**. A separate magnetic-field layer uses normalized units and a signed diverging palette. Complexity can change region morphology only, not confidence color/opacity.

Explore the cycle uses actual series months for scrubber and butterfly x positions. The example `[0,12,24]` with month 12 unavailable shows a gap at 12; month 24 is never relabeled 12. Step next/previous moves to the next available entry and announces skipped unavailable entries; selecting a gap shows its own unavailable explanation. Playback does not synthesize interpolation. A native range/step interface and a textual frame table provide non-canvas access.

Learning disclosures: **Inside the Sun**, **What it means for Earth**, **Model and data**. Keep selected-item evidence and export within two deliberate actions, without nesting a drawer inside a drawer inside a modal.

## My Sky: choose a place and find an object

Keep location, time and **Computed on your device** beside the dome. An example observer is labeled as an example. Entry never calls geolocation automatically. Manual coordinates have persistent labels, ranges and inline errors; failed input does not erase the last valid observer.

Provide a stable searchable object browser with Sun/Moon/planets and bright-star filters, above/below-horizon groups and a persistent selection card. Use `Above the geometric horizon`, not guaranteed visible. Show daylight/twilight/dark-sky context from the existing Sun altitude; disclose that weather, terrain, obstruction and light pollution are not modeled.

Geometric grouping is explicitly `alt_deg > 0`; exact zero belongs to `At or below the geometric horizon`. Do not reuse the existing `above_horizon` boolean, which means `alt_refracted_deg > 0`. Keep that contract meaning unchanged unless a future accepted version replaces it, and label refracted/apparent altitude separately in details. Body-center horizon classification is not the rise/set threshold that also includes refraction and semidiameter. Shared fixtures must cover negative geometric but positive refracted altitude, exact geometric zero and clearly positive/negative cases across providers, resolver, counts and list copy.

The selected card shows altitude, azimuth/compass, relevant range, events with declared day convention, and body/quantity-specific accuracy. Null events distinguish none in this interval, not calculated and calculation failed. Device civil time is explicitly labeled; UTC remains available. No automatic observer-timezone resolver is introduced.

Remote provider flow: configured recipient -> explain location/time to be sent -> explicit Allow or Keep on device -> request -> actual-provider status. Denial makes no request. Changing endpoint invalidates prior recipient consent. Failure offers local computation without sending additional information. Returning local mode is explicit. Share view previews included location/time before copying; raw scientific download and optional view-evidence export stay distinct.

## Solar System: orient, select and explore time

Primary controls: actual rendered date/time, play/pause, a few speed presets, 3-D/top-down, object search/focus, and explicit **Enlarged for visibility / Physical scale** state. Place free-flight, fine body scaling and optional sky layers in disclosures. Galaxy and Solar neighbourhood are deliberate scene choices with their own distance/time meaning.

The date, accuracy window, body visibility and celestial geometry consume the same `renderUnix` revision. Crossing New Year, the moon-data limit or a scientific-evidence boundary updates them together. UI simplifications never change the model clock.

Use deterministic screen-space label placement: selected object, camera anchor, major planets, focused-system moons, optional stars. Cull offscreen candidates; reserve bounding boxes with at least 4 CSS pixels clearance; stable body ID breaks ties. Initial caps are 16 desktop / 8 narrow labels. If the selected object collides, use a readable callout instead of hiding it. The text browser retains all objects regardless of label suppression. Label layout is presentation only; physical positions remain unchanged.

Update object rows/details in place by stable ID, preserving focus across animation. Live regions announce explicit selection, committed time changes, errors and recovery, not 800ms position refreshes. Paused and hidden destinations stop continuous animation work; user-controlled step actions remain available with reduced motion.

## Shared modules and lifecycle

| Proposed module | Responsibility / boundary |
|---|---|
| `apps/web/js/presentationState.js` | Pure resolver returning frozen presentation revision; no DOM/network/physics |
| `apps/web/js/solarContract.js` | Solar raw-text/schema/semantic intake; no store mutation on failure |
| `apps/web/js/solarProjection.js` | Coordinate projection shared by fields, markers and hit testing |
| `apps/web/js/seriesModel.js` | Stable frame records, gaps and actual-time coordinates |
| `apps/web/js/objectBrowser.js` | Keyed native buttons/list selection and filtering; focus preservation |
| `apps/web/js/labelLayout.js` | Deterministic viewport label placement |
| `apps/web/js/solarWorkerClient.js`, `solarWorker.js` | Bounded raw-WASM solar requests and cancellation |
| `apps/web/js/skyWorkerClient.js`, `skyWorker.js` | Equivalent ephemeris worker boundary if profile requires it; same admission protocol |

Existing `store.js` is incrementally separated into immutable scientific inputs, user intent and module-local renderer internals; do not rewrite every store consumer at once. Surface modules own their lifecycle. Every listener/timer/worker/request has an explicit disposal path on navigation, cancellation and context loss. Stabilize both `sky.js` and `orrery.js` object lists.

## Error and recovery design

| State | Visible behavior | Recovery |
|---|---|---|
| First load | Stable layout, named loading status, navigation available | Cancel optional work or use another destination |
| Invalid replacement snapshot | Retain labeled last-valid snapshot and its time; show validation failure | Retry or inspect evidence; never half-publish |
| No valid snapshot | Textual unavailable state; no made-up values | Load approved fixture explicitly labeled synthetic |
| Missing registration/image | Separate model/image, visible missing-evidence reason | Retry image or remain in model view |
| Offline complete release | App and cached data remain usable with cached identity/source age | Reconnect/check for update |
| Missing WASM or worker deadline | Surface-specific unavailable result; input preserved | Retry bounded request; no automatic remote transmission |
| WebGL context lost | Preserve selected object/time and textual facts | Restore context or choose text/top-down supported fallback |
| Old app / new schema mismatch | Upgrade-required notice; coherent prior release remains | Explicit reload into verified compatible release |

## Qualification targets

Test desktop 1440x900 and 1280x900, mobile 390x844 and 360x800, 320-CSS-pixel reflow, short landscape, 200% zoom and changed text spacing. Run keyboard-only primary tasks; preserve focused node through at least ten animated updates. Manually qualify NVDA + Edge and VoiceOver + Safari, including dialogs and virtual-cursor summaries. Follow WAI-ARIA's modal focus entry, containment, Escape and focus-return guidance only for actually modal interactions. [WAI-ARIA modal dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)

Proposed controlled performance profile: pinned Chromium, 4x CPU slowdown, 1.6Mbps downlink, 150ms latency, ten cold and ten warm runs. Product targets: p75 meaningful-Sun LCP <=2.5s, CLS <=0.1, p95 interaction-to-visible-feedback <=200ms for the declared task set, and no solar WASM work on the main thread. Measure animation separately on a named physical reference device: p95 frame interval <=33ms over a fixed 60-second scenario. These are qualification proposals, not observed results or field INP claims.

If a budget fails, reduce optional density/resolution/lazy-loading cost and retest; do not relabel the metric or loosen the budget without a documented decision. Record transferred bytes by class and block unexplained >10% growth from the accepted P00 baseline. Initial Sun loading must not eagerly download moon tables, full star catalogues or planetary textures. No production measurement SDK is added.

Run a small formative task study before promotion: recruit at least three first-time users and two research-oriented users with consent and no location retention. Each newcomer identifies source kind, source time and model limits, then selects a region/cycle frame; each researcher finds provenance and exports the intended artifact. Target at least 4/5 unaided completions for each shared critical task and zero unresolved misleading-science/privacy interpretations. This is a usability acceptance check, not statistically representative population evidence. Failure leads to a focused design revision and rerun, not a claim that aesthetic improvement implies task success.

## Rollout

Truthfulness and privacy fixes ship in the old shell first. Preview the new shell in a separate CI artifact using the same corrected scientific/presentation modules; no remotely toggled production experiment is needed. Complete a feature-parity inventory before changing the default. Rollback can restore the prior corrected shell/artifact, but must not restore the old incorrect claims, projection, cache behavior or incompatible schemas. Remove temporary preview scaffolding after acceptance.
