# Problem and scope specification

Status: Accepted for local implementation under RFC 0002 on 2026-09-11. BCP 14 words govern implementation, not a claim of present compliance or production qualification.

## Users and measurable outcomes

- A newcomer can identify whether the displayed Sun is observed or modeled, its time, and one defensible interpretation without opening research detail.
- A sky observer can choose a location/time, identify a body and understand its geometric position without accidentally sharing location or confusing above-horizon with observable.
- An explorer can select a Solar System body, change time/scale and read its evidence without losing keyboard focus or being obscured by labels.
- A researcher can inspect source, coordinate, uncertainty, accuracy and generation evidence and reproduce a snapshot without treating a view export as a restorable model checkpoint.
- A maintainer can determine whether a refresh was fetched, validated, merged, deployed and actually served, and can recover a coherent prior release.

## Scope and non-goals

In scope: all F01–F22, directly related parser/ingest/coverage/worker/provider/PowerShell/provenance recommendations, three-destination UI redesign, contract migrations, CI/CD enforcement, documentation and GitHub presentation.

Out of scope: operational forecasting approval; calibrated Gauss/Mx or posterior probabilities; full MHD/meridional/spherical-diffusion implementation; new GPU/NPU work; new timezone/geocoding/location services; analytics/telemetry; framework/package-manager migration; mass cleanup of existing PRs/branches; new credentials, GitHub App installation or unattended merging; production changes during planning.

## Acceptance catalogue

All criteria also inherit `SOL-TEST-001` and `SOL-DOC-001`. Specific traceability is shown below; the [test matrix](test-matrix.md) defines observable cases and gates.

| ID | Proposed requirement and acceptance | Existing requirement anchors |
|---|---|---|
| AC-01 | Source events MUST be applied exactly once with inclusive target ownership; long, hourly and irregular partitions MUST agree at the same target and preserve checkpoint/rebase correctness. | SOL-DET-001, SOL-ARCH-001 |
| AC-02 | Rust/Python/browser intake MUST agree on the supported JSON/schema/semantic corpus; malformed numbers, duplicate keys where accepted as raw text, invalid lengths, unsupported versions and nonfinite values MUST fail before publication. | SOL-CONTRACT-001, SOL-DATA-001 |
| AC-03 | Replay MUST fully validate before atomic output replacement; failure leaves the prior output byte-identical; historical copy MUST NOT claim transport checkpoint restoration. | SOL-CONTRACT-001, SOL-DATA-001 |
| AC-04 | Activity uncertainty MUST be scalar and explicitly illustrative; scalar observations MUST NOT become Br covariance or spatial confidence; elapsed-time noise policy and heuristic confidence semantics MUST be exported. | SOL-ARCH-001, SOL-SCI-001, SOL-CONTRACT-001 |
| AC-05 | All model projections MUST use declared west-positive Carrington coordinates, supported reference rate and producer-supplied current modeled anchors; birth metadata MUST remain immutable. | SOL-ARCH-001, SOL-CONTRACT-001, SOL-VIS-001 |
| AC-06 | Model-on-observed compositing MUST require valid capture-epoch registration; unavailable registration leaves separate observed and model views with a visible reason. | SOL-SCI-001, SOL-DATA-001, SOL-VIS-001 |
| AC-07 | Both ephemeris providers MUST emit explicit geocentric and observer ranges; apparent size and phase/parallax calculations MUST consume the correct geometrical quantities. | SOL-CONTRACT-001, SOL-SCI-001 |
| AC-08 | Events MUST belong to the declared local mean-solar day `[start,end)` or be null with occurrence/calculation/source status; a monotonic endpoint maximum MUST NOT be fabricated as an in-day culmination. | SOL-CONTRACT-001, SOL-SCI-001 |
| AC-09 | Supported observer inputs including exact poles MUST produce finite, normalized, validator-compatible geometry; unsupported inputs MUST fail explicitly. | SOL-ARCH-001, SOL-CONTRACT-001 |
| AC-10 | Historical remote queries MUST identify calendar and time scale and verify returned epoch; out-of-supported-range requests MUST fail before network I/O. | SOL-DATA-001, SOL-CONTRACT-001 |
| AC-11 | Accuracy copy MUST be derived from body/quantity/epoch/method-specific evidence; untested epochs MUST NOT inherit validated arcsecond claims. | SOL-SCI-001, SOL-DATA-001 |
| AC-12 | Every series entry MUST retain its identity, timestamp and load status; missing frames MUST remain gaps and use their actual temporal positions. | SOL-DATA-001, SOL-UX-003 |
| AC-13 | A single immutable presentation revision MUST drive headline, layer labels, counts, time, legend, accessible summary and view-evidence export without conflicting meanings. | SOL-ARCH-001, SOL-UX-001, SOL-SCI-001 |
| AC-14 | Confidence visualization MUST respond monotonically to the supplied heuristic score with a numerical legend; complexity MUST NOT masquerade as confidence and missing scores MUST be unavailable. | SOL-SCI-001, SOL-VIS-001 |
| AC-15 | All three destinations and inspector recovery MUST stay reachable when details are hidden; narrow layouts MUST be hero-first with logical DOM/focus order. | SOL-UX-001, SOL-UX-002 |
| AC-16 | The Sun workflow MUST distinguish observed image, synthetic model and idealized cycle, provide stable region/frame alternatives and keep scientific limits at the point of interpretation. | SOL-UX-001, SOL-SCI-001, SOL-DATA-001 |
| AC-17 | My Sky MUST provide stable search/filter/selection, explicit observer/timezone/provider status and null-event reasons; geometric grouping MUST use `alt_deg > 0`, not the refracted-horizon flag, and MUST NOT imply guaranteed visibility. | SOL-UX-001, SOL-UX-003, SOL-SCI-001 |
| AC-18 | Solar System MUST use actual rendered time for date/accuracy/validity; labels MUST follow deterministic collision priority while every object remains text-selectable. | SOL-ARCH-001, SOL-UX-001, SOL-VIS-001 |
| AC-19 | Animated updates MUST preserve focused object nodes and selection; updates MUST NOT flood assistive-technology announcements. | SOL-UX-002, SOL-UX-003 |
| AC-20 | Complete tasks MUST pass the scoped WCAG 2.2 AA audit, keyboard/zoom/touch/reflow/reduced-motion checks and non-canvas alternatives; automated checks MUST NOT be labeled full conformance. | SOL-UX-002, SOL-VIS-001 |
| AC-21 | Location MUST stay local by default; geolocation requires action, remote transmission requires recipient-specific consent, and share/export controls MUST preview included location/time. | SOL-PRIV-001, SOL-UX-003 |
| AC-22 | Loading, stale, offline, failed image/WASM/WebGL/provider and invalid data states MUST preserve a useful honest last-valid state or explicit unavailable state with recovery. | SOL-UX-003, SOL-DATA-001 |
| AC-23 | Engine requests MUST have bounded aggregate cost, cancellable worker execution and latest-request publication; stale results MUST never overwrite newer intent. | SOL-ARCH-001, SOL-UX-003 |
| AC-24 | The redesigned tasks MUST meet the accepted controlled performance profile and recorded artifact-growth budget without changing scientific quantities to hide slowness. | SOL-UX-003, SOL-VIS-001, SOL-REL-001 |
| AC-25 | Cache installation/upgrade/rollback MUST maintain coherent JS/WASM/schema/data identity; an engine-only update MUST reach returning users; failed installs MUST preserve a complete prior release. | SOL-CI-001, SOL-REL-001, SOL-UX-003 |
| AC-26 | A same-run complete aggregate gate MUST authorize only the actual validated master SHA and artifact; failed, skipped, cancelled, foreign, mismatched or untested candidates MUST fail eligibility. | SOL-CI-001, SOL-COV-001, SOL-REL-001 |
| AC-27 | Refresh status MUST distinguish generation, approval, checks, merge, master validation, deployment and served verification; no direct-push fallback or implicit approval bypass is permitted. | SOL-CI-001, SOL-DATA-001, SOL-REL-001 |
| AC-28 | Ingest MUST derive from one immutable attributable source bundle and atomically select a validated multi-file result; interrupted attempts MUST preserve the prior bundle and report failure. | SOL-DATA-001, SOL-DET-001 |
| AC-29 | Reference simulations MUST stay cross-OS byte-identical; canonical generated assets MUST reproduce under a pinned recorded generator with independent numerical bounds unchanged. | SOL-DET-001, SOL-SUPPLY-001 |
| AC-30 | Coverage MUST retain the 90% policy and enumerate all hand-written runtime/new affected Python modules; exclusions MUST be explicit and generated catalogues MUST not inflate coverage. | SOL-COV-001, SOL-TEST-001 |
| AC-31 | Development dependency and action updates MUST be narrowly reviewed, locked/pinned and verified; crate publishing MUST have separate exact-source/package eligibility and authority. | SOL-SUPPLY-001, SOL-CI-001 |
| AC-32 | PowerShell helpers MUST propagate child failure and distinguish applied/skipped removal accurately under mocks, without installing tasks or changing machine state during tests. | SOL-TEST-001, SOL-UX-003 |
| AC-33 | Scientific asset packs MUST retain immutable upstream identity, source hash, generator/version, notices and source-to-output correspondence; unavailable regeneration MUST be disclosed. | SOL-SUPPLY-001, SOL-SCI-001, SOL-DET-001 |
| AC-34 | README, specs, runbooks, requirement evidence and GitHub-facing status MUST distinguish implemented, proposed, measured and unvalidated behavior at the released SHA. | SOL-DOC-001, SOL-SCI-001, SOL-REL-001 |
| AC-35 | Final promotion MUST retain test/visual/manual/reference evidence and pass served-manifest verification plus a compatible rollback drill; operational status MUST remain false. | SOL-REL-001, SOL-CI-001, SOL-SCI-001 |

## Solar event and uncertainty semantics

An initial event at time zero is consumed on the first positive advance; zero-duration advance does not change fields or event state. A birth exactly at a requested target is applied before that target snapshot is published. Multiple events at one time are ordered by stable ID. Duplicate IDs with conflicting payloads are rejected. A newly introduced event before an already committed anchor is rejected with an actionable rewind/rebuild error; it is not silently dropped or retroactively injected.

Store the consumed-event identity/cursor in the deterministic anchor together with all state needed to replay a partial interval. A progress guard must select the next pending event as well as the next fixed boundary and target. Rebase explicitly after external field changes. Synthetic source generation uses a documented interval convention and emits endpoint events once, not once per caller chunk.

For scalar uncertainty, use elapsed model time:

```text
P_forecast(t2) = P_analysis(t1) + q_model_per_day * (t2-t1)/86400
K = P_forecast / (P_forecast + R)
g = freshness * K
x_analysis = x_forecast + g * (observation - x_forecast)
P_analysis = (1-g) * P_forecast
```

Require finite nonnegative variances/noise, freshness in `[0,1]`, and a defined zero-denominator result: when both P and R are zero, gain is zero and the unchanged state is disclosed, not divided by zero. Positive-q tests use a named illustrative value such as `0.02 activity_index_squared/day`; the product default is zero with `process_noise_status=disabled`, not a fitted number. The method is an illustrative uncertainty proxy, not calibrated Bayesian uncertainty.

The new solar v3 snapshot removes the misleading serialized Br-variance field and includes:

| Field | Type / semantics |
|---|---|
| `uncertainty.activity.variance` | finite nonnegative scalar, units `activity_index_squared` |
| `uncertainty.activity.method` | `freshness_damped_diagonal_proxy.v1`; status `illustrative` |
| `uncertainty.activity.at_time_seconds` | equals `run.time_seconds` |
| `uncertainty.activity.last_analysis_time_seconds` | finite past/current time or null |
| `uncertainty.activity.process_noise_per_day` / `process_noise_status` | finite nonnegative rate; `disabled` iff zero, otherwise `illustrative` |
| `uncertainty.magnetic` | status `unavailable`, nonempty reason; no fabricated covariance grid |
| `fields.confidence` | existing finite `[0,1]` array, explicitly a heuristic model score, not probability |
| `active_regions[].birth` | immutable time, latitude, longitude |
| `active_regions[].model_position` | producer-derived latitude/longitude, snapshot time, semantics `advected_model_anchor` |

For the current reduced model, anchor longitude is birth longitude plus the integrated differential rotation relative to Carrington; latitude is unchanged. Only the supported reference rate `14.1844 deg/day` is accepted. A modeled anchor is not an observed centroid; a grid-footprint test permits at most one longitudinal cell of centroid discrepancy for an isolated symmetric bipole in the diffusion-disabled reference fixture, and separately records diffusion/shear behavior without claiming exact centroid identity.

Observed-image registration is a separately versioned `solar-image-registration.v1` evidence object selected with the image asset. It includes source/image identity and SHA256, capture timestamp, L0/B0/P in declared degrees, disk center and radius in image pixels, dimensions and orientation conventions. Every numeric parameter is finite and bounded; the transform maps a declared west-positive Carrington model epoch to that capture epoch. The initial implementation permits compositing only when the model snapshot explicitly represents the same capture instant within its documented timestamp precision. Otherwise it shows separate views; no browser time evolution is invented. Capture time cannot be replaced by fetch/load time. The existing illustrative 3-D Sun texture allowance remains labeled separately and is not scientific overlay registration.

## Ephemeris v3 semantics

Replace ambiguous `distance_km` with `geocentric_range_km` and `observer_range_km`. Both are finite positive for Solar System bodies; the existing infinite-distance catalogue-star approximation may report both null with its approximation disclosed. Angular size uses observer range; horizontal parallax uses geocentric range. Phase calculations pair directions and distances from the same frame; no mechanical rename is sufficient.

Declare `events_window` with convention `observer_local_mean_solar_day`, time scale `UTC`, interval `[start,end)`, and:

```text
start_jd = floor(jd_utc - 0.5 + longitude_east_deg/360) + 0.5 - longitude_east_deg/360
end_jd = start_jd + 1
```

Each event includes time or null, calculation status (`calculated`, `not_calculated`, `failed`), occurrence status (`occurs`, `none_in_window`, `unknown`) and source engine/version. Culmination altitude is null iff culmination time is null. Find genuine interior maxima, plus an exact start-boundary maximum only if bracketing evidence establishes it; the end belongs to the next day. If several qualify, select the earliest. No clipping or unconstrained parabola may fabricate an event. Root refinement targets a bracket width at most one second; that is numerical convergence, not an external accuracy claim.

Remote/local event composition is explicit: use local events only when observer, epoch window and contract version match; preserve local source metadata and validate the combined result again. A Horizons label does not claim Horizons produced those local events.

Historical remote requests use exact JD lists with `TLIST_TYPE=JD`, explicitly chosen supported `TIME_TYPE` and proleptic-Gregorian UI calendar; omit START_TIME/STOP_TIME/STEP_SIZE when using TLIST. The provider's chosen UT/TT meaning must match its conversion and metadata rather than labeling every historical value modern UTC. Verify returned JD differs by no more than the response's declared epoch precision, capped at one second. Pre-modern UTC/UT1 approximations remain visibly degraded. Bound input to the intersection of Python date representation, Horizons supported inputs and local provider contract; test both endpoints before enabling a range. Do not silently clamp. [JPL Horizons API time parameters](https://ssd-api.jpl.nasa.gov/doc/horizons.html)

## Contract migration and parsing

Both v2 schemas close affected objects with `additionalProperties:false`. Therefore v3 migrations update schema, semantic validators, Rust producers/intake, Python fixture/generators/server, WASM, JSDoc/runtime guards, consumers, examples, fixtures and docs in one PR per contract family. Never temporarily ship a v3 producer to a v2-only live consumer.

Frozen v2 validators remain available for an explicit CLI historical-copy/replay mode. Such files retain their original schema and labels and are not selected as the current live feed. No automatic adapter fabricates unavailable v3 information. Live provider version mismatch fails closed with an upgrade explanation.

Production activation of either v3 family requires P09's verified release-bound client/data/WASM transition first. Development and review can proceed in parallel, but a merged v3 producer must not be automatically promoted to unversioned URLs while old clients still depend on them. The migration test uses actual v2 release A and v3 release B across open, returning-warm, offline and fresh-navigation clients, including compatible rollback.

Use one shared positive/negative fixture corpus across Rust, Python and Node. The lightweight Python schema engine must either implement and test every keyword used by active schemas or reject unsupported keywords at schema-load time. Numeric bounds, conditional relationships, timestamps and event windows require explicit semantic checks; ignored keywords cannot count as validation. Raw text intake uses RFC 8259 number grammar and a project policy rejecting duplicate object keys. JSON already parsed by a platform API cannot prove duplicate-free original text; load raw text at guarded boundaries or document and close that gap before claiming parity.

## View state and asynchronous publication

```text
idle -> loading(request generation) -> validate -> resolve -> ready(revision)
                              \-> invalid/error -> last-valid + visible failure
newer request / navigation -> cancel previous -> discard any late result
image availability change -> resolve new presentation revision (same scientific snapshot)
```

The resolver receives validated data, image registration, actual view instant, requested/actual provider, delivery evidence, user intent and an explicitly supplied clock. It emits separate source kind, availability, freshness, delivery state, time domain, accuracy scope and operational boundary, plus the explanatory content. Snapshots are not mutated to make a label convenient. Raw snapshot download remains the scientific contract; optional `view-evidence.v1` is a separate export containing the presentation revision and references, with location preview.

Worker requests use one active computation per engine and a monotonically increasing generation ID. Cancellation terminates/replaces an uncooperative synchronous WASM worker; there is no promise of interrupting WASM in place. Results publish only if request, schema, build/ABI and generation match. One pending latest intent replaces older queued intent. Memory/grid/cell-step limits are checked before allocation; configure a conservative initial solar ceiling of 128x64 cells, 14 simulated days and 10 million cell-steps, with a 10-second wall deadline. Qualify or lower these ceilings in P14; raising them requires measured responsiveness/memory evidence and updated tests.

## Product verification boundary

No criterion authorizes production telemetry, a new external endpoint, public findings, privilege changes, automated merge, or operational forecasting. External scientific checks and live repository-setting verification are separate evidence lanes. Missing network/manual evidence is reported as missing, not converted into passing offline evidence.
