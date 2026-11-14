# End-to-end validation and regression plan

Status: current  
Updated: 2026-09-11

This is a required validation plan, not a report that every gate passed. The current
working tree is implemented-local; RFC 0002 remains Accepted. Full manual/scientific,
coverage/platform and release qualifications must retain explicit held/pending results.

The validation strategy follows the data and user flow from source input through contracts,
engines, WASM, browser interaction, coverage, and deployment. No single test tier is treated
as proof of the whole system.

## Validation layers

| Layer | Purpose | Primary evidence |
|---|---|---|
| Governance | Requirements, RFCs, docs, dependency and workflow integrity | `validate_sdlc.py`, `validate_docs.py` |
| Unit | Pure math, parsers, rendering helpers, state transitions | Rust, Python, and Node tests |
| Contract | Schema plus cross-field semantics across every producer/consumer | snapshot validators, runtime guard, provider tests |
| Integration | CLI ingest/simulate, WASM build, provider continuity, generated data | CI web job and Rust workspace |
| End-to-end | Served app with built WASM, Chromium, WebGL, user interactions, fallbacks | `browser_smoke.py`, `browser_validation.mjs` |
| Visual regression | Semantic colour, visibility, and camera continuity | PNG assertions and retained artifacts |
| Determinism | Repeatability within and across operating systems | CI matrix and byte comparison |
| Accuracy | Public-reference scientific envelope and freshness | Horizons and EOP workflows |
| Release | Exact tested SHA, reproducible build, artifact and environment evidence | Pages workflow |

## Change-to-test mapping

| Change | Required minimum evidence |
|---|---|
| Pure Rust/Python/JS logic | Unit tests with positive, boundary, and negative cases |
| JSON contract or provider | New version/compatibility policy, fixtures, schema and semantic tests, browser guard |
| Scientific constants or algorithms | Source edition, dimensional/range tests, accuracy-budget update, external evidence where available |
| Generated data | Generator test, immutable source/output hashes, qualified runtime and output diff; explicitly held where regeneration inputs are missing |
| UI structure or copy | UX contract, keyboard/status assertions, narrow/wide manual check |
| Canvas/WebGL behavior | Pure geometry tests, real-browser flow, semantic image assertion |
| Privacy or remote request | Exact-recipient consent, deny/revoke zero calls, pre-transmission redirect rejection, payload binding, last-valid retention and explicit recovery |
| Workflow/deployment | SDLC workflow validator, least privilege, immutable pins, rollback/evidence update |
| Documentation only | Offline link/style validation and claim-to-tree review |

Current coefficient-tier changes must retain immutable preferred source/output
pins, all canonical/component/web manifest copies, historical profiles and literal
bindings. Rebuild twice from delivered preferred sources on each declared native
platform; test the standalone delivered kit, altered large-source rejection and
actual current native source parity without weakening its reporting tolerance.
The [TOP08 follow-up](TOP2013_PRECISION_20261106.md) records a caught stale fourth
manifest, corrected source kit, 12-step app campaign and complete109,900-comparison
actual-WASM renewal. Empty-page timings, cross-build paired outputs, finite-domain
checks and first-shard preflight remain separate from final reference acceptance.
The existing 16 ms raw p95 and all coverage/physical gates remain unchanged. Freeze
source through terminal collection, analysis and posthash; only then update final
documentation, retaining its separate construction/runtime/archive cohorts.

## Browser and visual regression

Coordinate regressions cover zenith/nadir, transformed coordinate poles,
precessed poles and nonfinite inputs. A valid pole/zenith case must also produce
strict JSON through the actual native and WASM snapshot interfaces and pass
the original frontend reader. Served-app evidence must exercise the original
worker and publication path. The
[coordinate-pole correction](COORDINATE_POLES_20261106.md) retains original
failures, paired browser recovery, fresh 234-test Rust coverage and the complete
109,900-comparison candidate-WASM replay. LLVM-reported coverage and unique LCOV
line-entry diagnostics remain distinct; the existing 90% gate is unchanged.
Post-execution source verification precedes documentation edits, whose snapshot
must remain separate from the runtime/source-archive construction snapshot.

Model-data transport tests cover stalled fetches, streams, hashing and reader
cancellation; one transaction-wide deadline; late response disposal; superseded
loads and old-owner completion. Existing byte/hash/schema and publication tests
remain mandatory. Served-app checks in Solar research must show a bounded failure, preservation of
the last valid view and recovery through the real Retry control, including first
load. The default budget is 30 seconds; synchronous work is rejected as overdue
when execution resumes rather than being preempted.

The [bundle-loading correction](BUNDLE_TRANSPORT_20261106.md) retains the original
unbounded-load experiment, final deadline/Retry/cancellation browser receipts and
current unit/coverage results. The deterministic hash test must prove hash entry;
an earlier timeout before the digest starts is insufficient evidence for that case.
Source archives, runtime captures and subsequent test/report changes retain their
separate snapshots.

Browser validation builds both WASM engines and serves the staged candidate, blocks uncontrolled
external requests, freezes time, and exercises the Sun, My Sky, Solar System, timeline,
tour, explicit provider recovery, selection, camera, and disclosure controls in Chromium.
Additional Sky and experience harnesses exercise actual worker scheduling/identity/cancel,
keyed focus, pending/errors, privacy previews and narrow reflow. The Sky redirect fixture
uses two local origins and requires zero requests to the unapproved destination.
These checks do not certify actual screen readers, touch platforms, contrast, system
clipboard permissions or general performance SLOs.

Both additional harnesses honor the staged manifest's declared mount, including
`/sol/`. Context checks exclude only explicitly hidden conditional context
controls; CSS-hidden active actions and required navigation remain failures.
System label checks use the renderer's integer client width for its existing
14/24 narrow/desktop caps, separately verify actual canvas bounds, and retain
four-pixel pairwise clearance with the existing 0.1-pixel rounding allowance.
Desktop and phone captures are independent checks. The experience tool retains
failure state and geometry when available. See the
[2026-11-06 local audit](READINESS_AUDIT_20261106.md) for completed checks and the
unresolved focus, label-clearance, diagnostic timing and intermittent export Cancel failures.
These local tool runs do not
establish hosted execution or a completed experience milestone.

The normal browser command also checks immediate scene-label placement under
reduced motion before rendering gates. It measures the actual styled box in the
same task as a coordinate update, requires the requested displacement and no
active CSS transitions, and removes its temporary fixture in `finally`. A frame
wait would conceal the reproduced defect. See the
[reduced-motion correction](REDUCED_MOTION_CORRECTION_20261106.md) for the retained
before/after experiment and later passing candidate; the earlier failures remain
in their separate cohorts.

Label-packing inputs use fractional DOM rectangles, not integer offset sizes.
The projection regression executes the production renderer with measured text
widths and an explicitly constructed fractional line height, checks both labels
remain readable, and rejects sub-target horizontal/vertical clearance. See the
[fractional clearance correction](LABEL_CLEARANCE_CORRECTION_20261106.md) for the
retained negative cases, precise scene-label fixture repair and final candidate.

The native backend profile requests all approved Sun qualities (1K/2K/4K); the
software profile keeps 1K. The requested list is recorded and checked against
actual probe results, and application renderer identity is observed at each Sun
capture. This affects qualification routing, not the application's 1K default.
The separate [native resource experiment](SUN_QUALITY_RESOURCE_VALIDATION_20261106.md)
records bounded logical allocations and active-4K context recovery outside the
original performance gates. It does not measure physical VRAM or all-app memory.

The [tour viewport regression](TOUR_ACCESSIBILITY_CORRECTION_20261106.md) exercises
all seven steps at portrait, landscape and short viewport sizes. It checks card
bounds, current-action visibility and hit testing, actual keyboard outline ink,
modal isolation, Tab wrapping and Escape focus restoration. Short-card overflow
must actually occur; fitting an unscrolled tall viewport is insufficient. Native
accessibility-tree name inspection remains bounded browser evidence and does not
replace manual screen-reader or WCAG acceptance.

The [trusted-touch regression](TOUCH_SELECTION_CORRECTION_20261106.md) runs after
the original browser gates in an isolated context. It observes transient selection
intents as well as final state, requires a live visible hit-testable canvas, and
checks drag, stationary contacts, pinch continuation, added contacts, cancellation,
view re-entry and a positive single-tap selection. Epoch and positions must remain
unchanged. Acceptance requires actual selective contact release, expected
surviving-finger movement with unchanged zoom, and a child-error/request check
through context closure. Work/context-closure deadlines and the new producer hash
are explicit; a follow-up failure fails the complete command. Both renderer runs,
1,534 Node tests and unchanged coverage floors pass for the recorded local stage.
Browser emulation does not establish physical-device acceptance.

The [export input/reflow diagnostic](EXPORT_READINESS_20261106.md) retains 24
pointer/keyboard Cancel cases across four viewport sizes and both motion
preferences. It observes actual trusted Cancel activation, frozen-preview
invariance and focus recovery after a180ms observation delay. Passed cases remain
finite current-candidate evidence and do not explain the older intermittent timeout
or replace physical-device/manual acceptance.

The [experience terminal-error correction](EXPERIENCE_CLOSURE_CORRECTION_20261106.md)
retains the historical Cancel question separately. Seven focused cases and a real
browser microtask-error control prove that a late page error must fail the complete
command. Browser/server cleanup is attempted independently; the final receipt
includes cleanup failures and is written before success output. Capture-only mode
remains diagnostic. The ordinary staged workflow passes all 24 original groups;
no interaction, layout or performance gate is relaxed.

The [integrated workflow finalizers](WORKFLOW_CLOSURE_CORRECTION_20261106.md)
apply the terminal-error requirement to Sky, the main browser and full physical
rendering. Every owned cleanup action is attempted before final error collection
and receipt persistence. Real late-error controls must reject after original
acceptance; individual preflight success does not establish whole-command success.
Worker error references survive earlier disposal, and native errors retain identity
across contexts. The final ordinary software workflows and Windows/Linux unit
checks pass within their recorded source cohorts.

The Earth and planet look probes also observe the exact sampled illustrative
texture handles. Distinct Earth surface/mask and Mercury/Venus maps must be live
when drawn and invalid after selecting Source-qualified. Their producer hashes
are included in the browser receipt's selected input inventory. The separate
[appearance resource experiment](APPEARANCE_RESOURCE_VALIDATION_20261106.md)
records the seven-map sweep, nominal mip allocations, late Earth decode rejection
and active-context Earth recovery. Test-owned suppressed-deletion controls must
make both permanent probes reject; no product source is patched for those controls.

The [pending-decode recovery experiment](APPEARANCE_CONTEXT_VALIDATION_20261106.md)
holds native decoded Earth/Mars results across context replacement, waits for
fresh-owner draws, then verifies obsolete completion closes without uploading or
displacing current resources. All seven artistic maps must draw their own pinned
images at their physical positions after recovery. The Earth lifecycle regression
also rejects a test-owned loader mutation that suppresses the early upload guard;
production/staged source remains unchanged. These cases complement active-resource
loss and do not imply every cancellation interleaving or whole-device memory bounds.

The visual checks are semantic rather than brittle full-page golden screenshots:

- the Sun must remain warm white instead of an incorrect orange cast;
- Earth must contain a meaningful visible blue-ocean population;
- a mathematically exact full camera orbit must return to a materially equivalent image.
- a physical-scale Neptune orbit guide must remain visible along its expected ellipse,
  while the opaque planet core remains unchanged and the fixed scene is restored;
  backing-buffer points are mapped through the recorded CSS rectangle and screenshot
  crop. See [the permanent orbit regression](ORBIT_CURVE_RENDERING_20261105.md#permanent-browser-regression).

Screenshots and browser coverage are uploaded even when the job fails. A future visual
assertion must explain the user-visible invariant, deterministic setup, tolerance, and
expected diagnostic image.

## Coverage policy

- Rust workspace line coverage: **at least 90%**.
- Python selected production validator/provider line coverage: **at least 90%**.
- Node-executed production modules: **at least 90% lines, branches, and functions**.
- Whole hand-written web runtime after Node plus Chromium merge: **at least 90% lines**.

The independent Node gate is `node tools/check_node_coverage.mjs`. It runs the
existing Node suites using the pinned c8 reporter and the original
`apps/web/**/*.js` imported-module population, including imported generated data.
Complete original-byte VM modules retain canonical source identities; versioned
URLs merge at reporting time, without changing ESM execution/cache identity.
All three floors compare integer covered/total counts against 90%, not rounded
display percentages. Empty reports, failed tests, configuration/threshold overrides,
and missing tests fail closed. Its retained reports are `coverage/node-executed/`.
This remains a **Node-only** gate: Chromium coverage cannot satisfy it.

The whole-web denominator seeds browser-only and WebGL modules at zero before merging
Chromium execution. Generated catalogues must load in Chromium but are excluded from the
percentage so data rows cannot inflate application coverage. Generated schema objects
require canonical-equality tests for exclusion; hand-written guards and workers stay in
the denominator. Coverage is a guardrail, not
a substitute for assertions or risk-based tests.

The [combined gate correction](MERGED_COVERAGE_CORRECTION_20261106.md) additionally
requires canonical runtime paths and the exact current V8 source-derived executable
line sets. Empty or reduced named-file maps and excluded/unrelated files cannot
replace or inflate that denominator. Paired maps/counters, branch arity and
nonnegative safe hit values are checked before and after merge. The default 90%
floor and supported higher floors use actual counts rather than truncated display
percentages. These checks do not authenticate execution; collector and source/CI
provenance remain separate requirements.

## Determinism and generated data

- Fixture and cycle-series generators run twice and compare byte-for-byte.
- Regenerated output must also match committed output.
- Reference Rust simulations run twice on Linux, macOS, and Windows.
- The three operating-system snapshots compare byte-for-byte and pass the shared schema.
- Cache tokens and manifest hashes bind final staged bytes; builds leave source unchanged.
- Canonical moon generation is a separately held Linux x86_64 qualification. Noncanonical
  diagnostic comparisons cannot authorize overwrites.
- Coefficient source/output identity and non-regenerable gaps are explicit in
  [COEFFICIENT_PROVENANCE.md](COEFFICIENT_PROVENANCE.md). No regeneration claim is made
  for missing raw inputs or serializer correspondence.

## Failure injection and degraded paths

Regression validation includes malformed and semantically invalid JSON, stale/future data,
missing optional values, remote-provider failure, absent network assets, unavailable remote
textures, invalid observer input, optional event absence, and explicit research-only
readiness blockers. An unavailable optional dependency must not corrupt the deterministic
core path. Include sparse/duplicate-key input, worker stale replies/wrong identity/deadlines,
bounded admission, queue cancellation, out-of-window/ambiguous event states, mixed bundle
hashes/identity, interrupted writes and pointer switches. Source/derived bundle faults
must preserve the old selection; browser intake must publish no partial store.

## Scientific and performance qualification

The current eight immutable TOP2013 vector cases establish source-theory parity at their
recorded epochs only. They do not qualify apparent place, observer/geocentric range or
event accuracy. New references must retain original immutable bytes, acquisition time,
quantity and frame/time-scale conventions, bounds and predeclared thresholds. Missing or
malformed reference/measured-threshold evidence fails closed. No external call is required
for the default offline suite; absence of required independent evidence remains a hold.

Measure fixed workloads with platform/browser/CPU conditions and source/artifact identity.
The System nine-body raw-position exception was locally profiled; it is not evidence for
all devices or the whole-app interaction budget. Full solves/metadata remain in workers.
Manual evidence must name actual cases, devices and source fingerprints; never replace
missing cases with broad accessibility or responsiveness claims.

## Release evidence

For every candidate SHA, GitHub Actions retains:

- Rust, JavaScript, and Python coverage reports;
- Chromium screenshots and browser execution coverage;
- cross-OS deterministic snapshots;
- crash artifacts from scheduled fuzzing when present;
- workflow logs that identify commands, toolchains, and the source SHA.

Normal GitHub Pages publication verifies and deploys the exact successful master CI
artifact, with no source rebuild on the privileged runner. Authoritative run/job/artifact
identity, current master, the manifest and rich outer evidence are rechecked before and
after environment approval. Served critical-byte verification follows deployment as a
distinct result.

That publication path does not consult manual/scientific qualification profiles. The
separate protected promotion/rollback evaluator retains its required profile, accepted
evidence, reference-freshness and settings checks; missing required inputs hold that
evaluation. Full production-readiness claims still require authoritative manual/scientific,
registry, settings and rollback evidence. See [RELEASE_DELIVERY.md](RELEASE_DELIVERY.md).
Local synthetic policy fixtures do not qualify hosted execution.

## Local validation

Run general repository checks and the relevant feature gates against the same source
and staged artifact. Record missing toolchains separately from passing checks.

## Physical rendering validation

The [Linux software-browser campaign](LINUX_BROWSER_VALIDATION_20261106.md) executes
the existing smoke, full browser/touch, Sky, experience and eight GPU commands against
the exact retained Windows-tested artifact. All 16 recorded steps pass, including
denominator-complete Node/Chromium coverage. Its source/stage/dependency invariants,
failed first output-path invocation and actual software renderer are retained separately;
physical GPU/device, hosted and manual qualification remain outside that campaign.

The [component-LGPL delivery checks](LGPL_COMPONENT_20261106.md) preserve original
application terms, validate actual package/source/notice bytes and require a
deterministic, bounded source archive in the staged web inventory. The source
archive is optional for caching; complete artifact validation still requires its
physical bytes and digest. Git-free offline rebuilding and an interface-compatible
modified-library load are distinct engineering proofs, with their own source and
artifact identities. Legal and release qualification are not inferred from them.

RFC 0005 source and numerical contracts add the following offline commands. Use the
same immutable staged directory for all GPU passes; the tools verify selected module
hashes against its release manifest. Full-app evidence also identifies working-tree
differences from the recorded base revision, so a preview is not a commit claim.

```powershell
python tools/validate_physical_assets.py
python tools/validate_planet_phenomena.py
node tools/atmosphere_validation.mjs --web-root=build/site --out=coverage/atmosphere
node tools/incident_budget_validation.mjs --web-root=build/site --out=coverage/incident-budget
node tools/terrain_shadow_validation.mjs --web-root=build/site --out=coverage/terrain-shadows
node tools/solar_appearance_validation.mjs --web-root=build/site --out=coverage/solar-appearance
node tools/planet_phenomena_validation.mjs --web-root=build/site --out=coverage/planet-phenomena
node tools/physical_rendering_validation.mjs --web-root=build/site --out=coverage/physical-rendering --context-loss
```

The full-app gate exercises actual source/terrain transfers, Workers, source playback,
inspection/overview, light/terrain A/B changes, mobile width and physical-state invariance.
The context-loss flag verifies recreation rather than reusing dead GPU handles. Missing
sources and compiler failures remain failures. CPU/GPU agreement qualifies the declared
numerical reference cases, not observed atmospheric/weather accuracy or device frame rate.
The incident budget gate executes the production vertex shader with ready, hash-checked
fields on real MOLA meshes at 4,753 and 74,305 vertices. It checks finite normalized
directions, bounded transmission, day/night separation, field-domain coverage and
identical illumination at shared terrain samples. Reported draw/readback times are
device-specific evidence; the whole-app deadlines remain unchanged.

## General local commands

Use the commands in `INSTRUCTIONS.md`. A developer without Rust or Chromium can run the
governance, docs, Python, Node unit, type, static-web, and deterministic generator checks,
but MUST state which toolchain-dependent gates were left to CI.

## Approved Solar System Sun

`SOL-VIS-011` is covered by `tests/web/sunLook.test.mjs`, `tests/python/test_sun_look_extraction.py` and the staged `tools/sun_look_probe.mjs` invoked by browser validation. The default 1K path runs in hosted browser checks; native 2K/4K captures separately verify real target uniforms and unchanged physical state. Existing AIA/visible checks explicitly select their reference modes. Physical mobile and sustained performance remain unqualified.

The native cancellation regression runs with `node tools/sun_pending_validation.mjs --url=<local-staged-SOL-URL>` and the existing `CHROME_BIN` override. It retires three pending sets sequentially and rejects graphics errors or GL_INVALID driver warnings.
