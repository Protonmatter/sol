# PR 107: terrain demand and selected-star context

Baseline: `069d0ba459b68b5f25815532e50997f7b029f0d1`.
Scope: review comments `4001090426` and `4001090431`; display status,
selection context and resource demand. These changes do not alter physical
coordinates, source imagery, terrain geometry, optical equations or quality limits.

## Requested terrain detail and fallback availability

A ready lower terrain level previously overrode the status of a requested finer
level. Consequently a failed refinement could appear ready and omit recovery guidance.

The renderer now records the demanded cache key for each focused body. Status
comes from that key; selecting an already cached lower level updates status even
when the cache emits no notification. A view below the terrain threshold has
deferred status. Queued notifications read current demand and ignore replaced
cache/context generations.

Mesh selection continues to use the highest available level at or below demand.
While finer detail loads or is unavailable, a rendered lower level remains visible
and the status names that fallback. An unavailable requested level includes the
existing recovery action: turn terrain relief off and on. Ordinary paints retain
the failure and do not retry it. Ready mesh resources survive this explicit retry.

## Planetary context when inspecting a star

Any selected catalogue star suppresses the planetary physical-status panel and
mission gallery, including a star picked on the normal Solar System backdrop when
the separate planetary selection is null. The camera anchor does not become an
implicit planetary context while a star is selected.

Selection updates this context immediately, independently of an animation frame
or usable canvas dimensions. Disposing the previous gallery aborts its pending
image. No replacement anchor observation is requested. Choosing a planet again
restores that planet's context and permits its selected mission observation to load.

## Verification

Regressions were observed against the baseline before the production fixes:
ready lower detail masked pending/current failure, a late lower-detail completion
overrode current demand, and background-star selection retained planetary status.

The focused suite uses the production renderer lifecycle, cache, DOM presenters,
selection handlers and catalogue projection. Only browser/GPU and external I/O
are doubled. New assertions cover failed refinement with retained lower geometry,
viewport demand changes, explicit retry, late completion, normal-system background
star selection, object-row star selection, immediate gallery cancellation and
restoration on planet selection. The gallery harness injects only its image loader;
the production gallery and disposer execute unchanged.

```powershell
node --experimental-vm-modules --test tests/web/orreryPhysicalLifecycle.test.mjs tests/web/orreryCoverage.test.mjs tests/web/orreryIncidentLifecycle.test.mjs tests/web/orreryContextRecovery.test.mjs tests/web/terrainAssets.test.mjs tests/web/physicalRendering.test.mjs tests/web/planetPhenomena.test.mjs
git diff --check
```

## Final local qualification

The final runtime was staged as `pr107-review-p2-final` at `/sol/`, with manifest
SHA-256 `1ffe4d1b5e3b2c6fb7626a9d4ea76fb2ae2aaf4baac864afc427660e0b2113ac`.
Its baseline metadata names `069d0ba`; the manifest's per-file source hashes bind
the actual P2 changes. All source comparisons matched during application validation.

- The focused suite passed 92/92. The complete suite passed 981/981 on both
  Node 22.23.2 and Node 24.18.0, with no skipped tests.
- Source Node coverage passed the existing 90% gates: 98.04% lines, 91.45%
  branches and 95.32% functions. Typecheck passed all 99 web files.
- Documentation, SDLC and UX structure validators passed, including 23
  requirements and the existing RFC and accessibility contracts.
- `tools/physical_rendering_validation.mjs --context-loss` passed 19/19 checks
  and produced 20 captures in 50.343 seconds. It used actual terrain workers,
  optical fields and mission assets. Native context restoration took 52.1 ms;
  rendered resource readiness took 11,464.3 ms, within the original 10s/40s limits.
- `tools/browser_validation.mjs` passed the complete browser journey and WebGL
  assertions, including four submitted Earth draws and the frozen-transform
  negative control under the original five-second rule. This is a local result;
  it does not resolve the known hosted scattering performance finding.
- Combined staged Node and Chromium runtime line coverage passed at 96.95%,
  retaining the complete runtime denominator and the existing 90% minimum.

Receipts and captures are retained under `build/pr107-review-069d0ba/p2-final`.
The first browser-tool invocation lacked the Windows `CHROME_BIN` setting and
stopped before launch; its setup log was retained. The completed run uses the
explicit installed Chrome path and a new evidence directory.

These graphics checks use Windows Chrome/SwiftShader. Native GPU performance,
other browsers and physical mobile devices are not qualified by them. The full
Python and Rust suites were not rerun for these JavaScript status/selection changes.
Fresh hosted checks, merge eligibility and deployment remain separate.
