# RFC 0003: Scientific workspace and visual provenance

- Status: Accepted
- Authors: Min Kang, Codex
- Created: 2026-09-12
- Target: Local scientific workspace candidate; qualification held
- Requirements: `SOL-UX-004`, `SOL-VIS-003`, `SOL-VIS-002`, `SOL-ARCH-001`, `SOL-SCI-001`, `SOL-PRIV-001`

## Summary

Implement the user-approved layered Sun, My Sky and Solar System workspace, using the
four supplied design references for composition. Scientific appearance requires a
traceable NASA/JPL mission source chain. Display enlargement must not introduce body
penetration. This RFC supplements RFC 0002; it does not complete its qualification.

## Context

The selected clean baseline is `1f2073f8befbe3725380d46ab63fcbb79db56289` in
`sol-review-20260911`. The separate dirty checkout is outside this change. The user
approved implementation after selecting a layered workspace, all three destinations,
accurate geometry with decluttering, and NASA/JPL-grounded imagery. Existing textures
mix direct agency products, third-party derivatives and procedural representations.
Source labels alone do not qualify local bytes or global mapping.

## Requirements

- `SOL-UX-004`: Navigation and essential source/time/readiness MUST remain accessible
  while inspectors, timeline and research controls are disclosed on intent.
- `SOL-VIS-003`: Scientific raster assets MUST carry byte identity, source, interpretation,
  projection/coverage limits and credits. Unsupported surface detail MUST fall back visibly.
- `SOL-VIS-002`: Enlarged display geometry MUST preserve physical centers and avoid
  artificial penetration; physical scale MUST ignore display exaggeration.
- Existing immutable v3 contracts, worker admission, privacy and export semantics MUST remain.
- Model/observed compositing MUST remain disabled pending independent registration evidence.
- Heuristic confidence MUST NOT be presented as probability or magnetic uncertainty.

## Design

Retain native ES modules, JSDoc, Rust/WASM, existing snapshot schemas and static delivery.
The shared workspace stores only per-destination disclosure/focus intent. Existing
presentation resolvers retain accepted result identity, pending status and last-valid time.
The Sun is the initial destination. The September 13 design correction makes a preserved
NASA observation the default: one full-disk image, short explanation, capture time and
compact contextual overview. The native Observe/Research switch separates that image
from the model workspace. Model feed/readiness and all simulation/export/overlay controls
remain available in Research; they MUST NOT describe an unrelated observed image.
The inspector and model timeline start closed; direct buttons expose each. Explicit object
selection opens the Sun model inspector. Sky/System selection updates a compact card;
full tools open for explicit search, location, time or details tasks. Native disclosure
ancestors open before task focus moves, while selection within an open list retains focus.
Navigation never changes scientific state.

Use a wide left navigation rail at 1100 CSS pixels and horizontal navigation below it.
On narrow screens the visualization precedes expanded controls. Focus mode retains the
scientific status, navigation and exit. Gold is selection accent, not an activity claim.

The compact desktop rail and observation canvas follow the supplied immersive design
references. Reference scaffolding, constellations and small-body layers start off in the
System destination; Sky constellation scaffolding also starts off. Their controls and
catalogue capabilities remain available. Concise Sky/System cards occupy a separate column
on desktop and follow the canvas on mobile. Card facts use the admitted scene and actual
source. Display-scale and motion-limit caveats occupy their own visible caption, never a
hidden tools-only notice. Source previews hide during replacement until the new image
decodes; galactic views clear planetary facts and warnings.
Observation failure displays an unavailable state and retries the same original asset;
it MUST NOT silently substitute a synthetic model. The image retains its original plane,
aspect and caption. Its summary export carries observation provenance and no model bundle.

Asset inventory separates source-byte correspondence from projection, coverage, color and
use qualification. Exact byte matches to NASA or mission-derived authoritative archives
can establish source correspondence; an ordinary disk photo is not a global map. Retain
original bytes and attribution. No invented craters, hemisphere mirroring, partial-map
stretching or generative fill. Unknown metadata stays unknown. A neutral low-detail
fallback remains selectable with explicit unavailable-detail text. No acquisition occurs
during build or promotion. NASA-hosted art is still illustrative, not observed.

Color and materials preserve visible versus enhanced/nonvisible interpretation. Static
clouds and storms are not synchronized weather. A 3-D render remains a reconstruction,
not a camera observation. Photos/videos inform appearance with retained instrument,
processing and epoch context; they do not replace ephemerides or establish a speed from
edited footage. Full appearance qualification includes linear-light shading, coverage,
orientation and avoidance of double-lighting baked photographs.

One deterministic display resolver bounds enlarged radii. Physical body centers stay
unchanged; disclosed satellite-system scaling remains common within a system. Render,
pick, orbit guide and camera anchor share transforms. For ordinary disjoint enlarged
spheres, the sum of display radii is at most 0.95 of center separation. Physical scale
does not impose a cosmetic gap. Include moon radius and ring clearance; reduce enlargement
instead of moving planets. Preserve true occultations and eclipses. Depth-aware orbit
visibility and focused moon systems explain projected crossings; trajectories are not bent.

## UX and accessibility

Target WCAG 2.2 AA without claiming conformance before manual qualification. Native
controls, visible focus, 44-pixel primary touch targets, 320-pixel reflow, reduced motion
and synchronized text selection are required. Modals retain focus containment and return;
ordinary inspectors remain nonmodal. Essential caveats are visible at the point of use.
Image/rendering provenance is one deliberate action from the selected object.

## Security and privacy

No new runtime dependencies, telemetry, accounts, remote provider or background service.
Asset links are data rendered through safe DOM APIs. Existing recipient consent, redirect
denial and explicit local recovery remain authoritative. Manifest paths/hashes must reject
malformed input. Acquisition uses official public products only and does not run on release.

## Alternatives

A separate marketing home obscures the primary task. A framework replacement adds risk
without addressing scientific truth. Arbitrary collision-avoidance motion corrupts
ephemerides. Third-party texture attribution without product lineage is insufficient.
Displaying unknown surface detail as photorealistic creates unsupported evidence.

## Risks

Some mission products have incomplete mapping metadata. Their presence in an archive
does not prove eligibility for spherical mapping. Neutral fallbacks may reduce visual
detail until that evidence exists. Larger UI changes can break selectors or focus;
preserve feature inventory and exercise real browser flows. Physical-scale objects can
be subpixel; the text browser must remain usable. Existing qualification holds persist.

## Acceptance criteria

1. All destinations preserve functions with accessible navigation and responsive controls.
2. Closed initial inspector/timeline still expose task and essential state.
3. Invalid/stale inputs never produce invented freshness or mixed result epochs.
4. Each scientific raster has an inventory identity and explicit eligibility; no unsupported
   global wrapping is silently used. Neutral fallback is labeled and selectable.
5. Physical scale ignores exaggeration; enlarged geometry clearance and shared transforms
   have deterministic positive, boundary and negative tests.
6. Real transits, eclipses, camera continuity, phase and orbital positions remain correct.
7. Existing gates and new asset/workspace/geometry tests pass without lowering floors.
8. Manual accessibility, source/appearance qualification and protected promotion are
   recorded separately; missing evidence is a hold, not success.

## Validation

Run SDLC/docs/UX/static/type checks, Node and Python tests, Rust workspace/format/Clippy,
both WASM builds and isolated candidate staging. Exercise real Chromium, focused Sky and
experience flows, semantic visual assertions, coverage and deterministic generation.
Test body/ring clearance, physical-scale toggles, camera anchoring, partial assets,
wrong hashes, unqualified mapping, unavailable image times and narrow/keyboard behavior.
Record physical-device performance, screen readers and formative user studies separately.

## Rollout and rollback

Deliver documentation/provenance, shell, Sun/Sky, System appearance/geometry and integration
slices. Do not commit, push or deploy without separate authorization. Build one candidate
from exact source bytes and retain its identity. Roll back only to a compatible complete
qualified artifact; never mix code/WASM/data/assets or re-download mutable assets.

## Documentation

Update requirements, current specification, UX guidelines, RFC alignment and the local
implementation ledger. Existing historical design documents remain informative.
