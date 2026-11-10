# Responsive DOM and Research entry rendering — 2026-11-08

These local corrections reduce redundant browser work. They do not qualify a
release or clear the unchanged 200 ms response requirement in every required
graphics configuration. Historical timing cohorts retain their own source and
artifact identities; they do not qualify this updated checkout.

## Implemented behavior

Header, workspace and observation controls compare current native DOM values
before assigning unchanged plain text, fixed data/ARIA attributes and boolean
properties. The existing text writer moved unchanged apart from export into a
pure shared helper. Nonplain text still uses the flattening setter, absent and
empty attributes remain distinct, changed live DOM is repaired, and nonstring
inputs still reach native assignment. Facts, source/time/error state and fresh
Research preparation are recalculated on every requested refresh.

The Research entry/ready-callback path now requests one complete render instead
of three identical requests before bundle publication. First entry retains the
render made by model wavelength selection; cached entry retains its explicit
refresh. The app skips only Research's redundant final request. Other views,
visibility/current-owner checks, failure/retry behavior and the data loader's
success/failure render are preserved. Selection, publication and resize may
request additional necessary renders during a complete user interaction.

All scene samples, formulas, accepted-data gates, canvas sizes, shaders, styles,
context options, backends and metrics are unchanged. The pure helper adds one
static module; its exact URL is preloaded and the startup graph has 20 identities.
Illustrative Earth remains the approved default. No astronomy or licensing
change is part of these corrections.

## Evidence and qualification limits

The isolated source passes 2,033 Node tests, type/static/startup/build checks,
all three full browser/touch/coverage gates, docs and SDLC. Independent bounded
reviews found no actionable defect in either source correction. The actual
Research/wavelength modules and app callback reproduce three requests before
the correction, with one request after it at the rendering/data host boundary.
Those tests do not establish completed GPU frames or model-data acceptance.

The same reviewed real-browser attribution hook reduced observed mutation
records from 549 to 494 in each cold/warm visit of the DOM correction. All 55
removed records were unchanged attributes or equal plain-text replacements;
the late batch fell from 42 to 12. Callback timestamps are not setter times and
instrumentation perturbs latency, so counts are not a causal response claim.

Uninstrumented one-pair screens of the combined source stay under 200 ms for
native and normal software fallback, but original whole-driver cold Inspector
still reaches 284 ms. These screens cannot establish ten-cold/ten-warm p95.
The required full response qualification, native Mars shader-readiness hold,
scientific/manual/platform/hosted and release acceptance remain separate.
The agreed accuracy window stays 1900–2200, with 1–9999 approximate outside it.

Local audit evidence is under `build/research-entry-render-20261108-01/` and
`build/responsive-writes-20261108-02/`. The exact adopted source, staged MAIN
artifact and post-apply results are recorded separately in the former's
`main-adoption/` and `main-validation.json`. Private source results do not by
themselves claim a later MAIN artifact has passed its checks. Runtime CSS probes
removing backdrop effects remained unadopted and grant no quality/timing waiver.

## Projected label refresh

A later local correction retains unchanged projected-label text nodes, classes
and object IDs. It reuses the already loaded text writer, including its native
flattening behavior for nested content. Changed text/classes/IDs are repaired
from the live scene. Every redraw still recalculates candidates, projections,
occlusion and placement and reads current native text-box bounds. No projected
position or text-size cache is introduced. Callout classes may still change
during measurement and placement.

The isolated source passes 2,039 Node tests. Three intended regression failures
were reproduced before the correction. Seventy-two real-browser label cases,
across three graphics configurations and DPR 1/2, retain exact geometry, style,
facts and screenshot RGBA bytes. Those cases use controlled upstream scene
boundaries and render labels only; they do not prove application WebGL frames,
accepted model data or physical rendering. The bounded source review found no
actionable defect. Application/response evidence is recorded separately under
`build/label-dom-writes-20261108-01/`; no 200 ms or production qualification is
granted by these isolated cases or one-pair diagnostics.

Earlier DOM/Research results above retain their own source/artifact identities.
The latest local source and artifact evidence is indexed by
`build/current-responsive-rendering-main.json`. This correction preserves the
Illustrative Earth, drawing commands, scene quality and astronomy behavior.

## Verification and rollback

Use the repository commands from the selected checkout:

```text
npm run test:web
python -X utf8 -B tools/typecheck_web.py
python -X utf8 -B tools/validate_web_static.py
node tools/validate_module_graph.mjs
python -X utf8 -B tools/validate_docs.py
python -X utf8 -B tools/validate_sdlc.py
```

Build with the selected source-bound WASM artifacts, then run the existing full
browser/coverage tools in all three modes. Keep source/manifest/asset hashes,
native timing correlation, original flags and required acceptance limits.

Run the latest local guarded rollback from this checkout's root (the directory
containing `package.json`, not the outer workspace folder):

```text
python -X utf8 -B build/research-disclosure-clipping-20261108-01/rollback_disclosures.py
```

The latest packet is under
`build/research-disclosure-clipping-20261108-01/main-adoption-final/`.
It restores the three replaced files and removes the two newly added files,
returning the disclosure correction's 1,796-entry cohort to the recorded
1,794-entry source cohort. It exits 0 after restoration and refuses with exit 1
before writing if the complete current source inventory differs from the
recorded adopted cohort. The retained packet, apply receipt and verified backups
are required. Review later or unrelated changes manually; do not reset them.

To undo the preceding label correction too, first complete the disclosure
rollback above, then run the following command to restore 1,794 to 1,793 entries:

```text
python -X utf8 -B build/label-dom-writes-20261108-01/rollback_main.py
```

Only after that label rollback can the earlier DOM/Research packet be used:

```text
python -X utf8 -B build/research-entry-render-20261108-01/rollback_main.py
```

Each command independently refuses source drift and restores only its owned
paths. They are source rollbacks: they do not repoint the ignored local artifact
index, reset the shared checkout, alter commits, or roll back a deployment.
After rollback, retain the receipts and select or rebuild an artifact whose
source inventory matches the restored checkout before serving it.

The local adoption packet backs up every replaced path, lists new paths and
checks the full before/after source inventories. Its rollback restores only
paths whose current hashes still equal the applied payload; conflicts stop
automatic restoration instead of overwriting later work. It preserves unrelated
dirty files. No commit, push or deployment is included or authorized by this
checkpoint. See [current readiness](CURRENT_READINESS_20261107.md) and the
[accuracy contract](ACCURACY_CONTRACT.md).

## Research disclosure reachability

A later correction prevents Sun disclosure sections from shrinking to clipped
border boxes in the bounded Inspector. The native wheel/pointer/keyboard
regression and its scope are documented in
[Research disclosure reachability](RESEARCH_DISCLOSURES_20261108.md).
Existing response results retain their original source/artifact identities;
this correction changes no timing target, scene quality or astronomy model.
