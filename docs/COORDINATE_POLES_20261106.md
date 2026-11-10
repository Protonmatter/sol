# Finite coordinate poles and Sky snapshot recovery — 2026-11-06

Valid observer input could make an entire Sky snapshot invalid JSON when a
catalogue star was exactly overhead. Four unit-vector inverse-sine calculations
now bound their arguments to the mathematical interval `[-1, 1]`. The original
native and WASM failures are reproduced; the corrected application publishes
the complete Sky view. All 109,900 retained sampled reference comparisons pass
on the new binary. Illustrative Earth is preserved.

Requirements: `SOL-ARCH-001`, `SOL-CONTRACT-001`, `SOL-SCI-001`, `SOL-TEST-001`,
`SOL-COV-001`; acceptance catalogue `AC-02`, `AC-09`, `AC-22`.

## Reproduced input and smallest correction

P1 — `coords.rs` coordinate transforms and their `sky_snapshot_json` consumer:
at UTC JD 2461041.5 / Unix 1767225600, latitude 6.4717687563178625 degrees,
longitude 198.48616092057026 degrees east and elevation 0 m, Alshain is overhead.
The original native engine and browser WASM both emit `NaN` for its `alt_deg`
and `alt_refracted_deg`. Strict JSON parsing rejects the whole snapshot.

Binary64 trigonometric arithmetic can round a unit-vector component one ULP
above 1 or below −1. Its exact mathematical value is inside the inverse-sine
domain. The correction bounds only those arguments in `coords.rs`: horizontal
altitude, ecliptic-to-equatorial declination, equatorial-to-ecliptic latitude and
precessed ecliptic latitude. Ordinary in-range arguments are retained. Nonfinite
angular inputs still produce nonfinite trigonometric values; unsupported inputs
do not become valid poles. The existing azimuth at a zenith/nadir remains finite
and deterministic, although a bearing at that singularity is nonunique.

Six regressions cover zenith/nadir, both transformed poles, date-ecliptic poles,
nonfinite inputs and the actual catalogue-star snapshot. Five fail on the original
code; the invalid-input regression already passes. The original library run is
73 passes / five failures; the corrected library passes all 78 tests. The full
workspace passes 234 tests.

## Actual served application behavior

The baseline is `local-bundle-transport-20261106-02`, manifest
`f67946e6279a5e3c18e99bd495ad51cc6fe9d8a3a0af5db391564079cd26a2ba`.
The candidate is `local-coordinate-poles-20261106-01`, manifest
`949a4e179f5ffc4a36f41be4b47ca916e1b83eedb61f978c4bab5f786ddf3528`.
Both are mounted at `/sol/` in separate fresh owned Chromium contexts.

The same accepted Sky deep link supplies the precise observer/time. Trusted
navigation invokes the original application and Sky worker. The baseline displays
the JSON parse failure and retains no snapshot. The candidate publishes all
117 bodies, clears the error and displays Alshain at 90 degrees when selected
through the actual search control. Worker URLs and numerical-module requests
match each stage namespace. Readers, workers, store and returned JSON are original.

The paired receipt is
`build/coordinate-poles-20261106-01/browser-9550f3fb-cdfa-4842-aefd-d562f8190297/evidence.json`.
It retains both outcomes, trusted navigation, complete source readback, screenshots,
and successful context/browser/server closure with no recorded browser errors.

## Verification and unchanged accuracy boundaries

| Check | Result |
|---|---|
| Windows and pinned native Linux ARM64 workspace Rust suites | **234 passed** each; Linux source unchanged and owned container absent. |
| Formatting and strict workspace/all-target Clippy | Passed. |
| Fresh workspace/all-features Rust coverage | LLVM reports **8,871 / 9,243 lines, 95.98%**, with 234 tests passing and the unchanged 90% floor. |
| Complete Node gate and runtime collection | **1,593 passed** each; unchanged 90% line/branch/function floors pass. |
| Fresh Node/native-browser runtime line coverage | **17,963 / 18,408, 97.58%**; all 117 hand-written modules retained. |
| Complete native and software browser workflows | Both pass the original gates and seven trusted-touch cases each. Native retains 1K/2K/4K Sun; software retains 1K. |
| Sky and experience | **Nine and 24 groups** pass. Raw-position p95 is **8.9 ms** at 4x CPU throttle, below the unchanged 16 ms gate; JSON timing is separately retained. |
| Expanded physical rendering | **22 checks** pass, including context restoration, level-4 Moon/Mars terrain and submitted animated Mars draws. Actual software backend observed. |
| Actual candidate WASM reference replay | **109,900 comparisons pass** at all 3,925 retained model epochs, with zero failures. |

The Rust figure is the unchanged `cargo-llvm-cov` / LLVM reported line metric.
The individual LCOV `DA` entries separately contain 8,649 covered out of 8,955
unique recorded line entries; this diagnostic does not replace the existing gate.
All 34 reported source records match the tested source hashes. The run uses the
existing pinned tool version 0.6.16 and documented child-only LLD override, with
a fresh private target. Its LCOV SHA-256 is
`32beba91a638163ea8c0fe844dc02d7e8b499786c7a7438553f93933806a79bb`.

The new ephemeris WASM is SHA-256
`cb01bd16aaee9e063cbc9adc430a0a6730de164c60a71793a39719e66989fe6d`.
The Solar WASM remains
`f8a78a07da7c742735288b32613a8344fe7ab5df2eedea27b4a4d866c9599199`.
All 214 web source owners and the UI fingerprint are unchanged. The existing
science fingerprint rules correctly identify the numerical change. Orbital
coefficients, theory selection, time/EOP conventions, refraction, textures and
appearance remain unchanged. Restoring finite geometry does not establish a
tighter astronomical model error bound.

The complete fresh replay uses the original 3,925 padded/irregular epochs and
strictly admitted Horizons packet. Every full Sky snapshot passes the original
frontend and Python validators. The eight workers terminate successfully before
the collection receipt and source check complete; analysis then reads every
snapshot and System vector record, verifies exact index/hash/count correspondence,
and recomputes all comparisons without filtering failures.

| Quantity | Checks | Unchanged budget | Largest measured residual |
|---|---:|---|---|
| Full geometric vector | 39,250 | 10 arcseconds-equivalent vector-norm error | Uranus, **6.418395785″**, model JD 2473519.5 |
| Geocentric apparent direction and range | 70,650 | 10″ Sun/planets, 12″ Moon; range max(1 km, 10 ppm) | Direction: Uranus, **1.939378352″**, model JD 2524189.5; all range checks pass |

The analysis is retained under
`build/coordinate-poles-20261106-01/dense-6f482a46429547bf9b58b9c50663e0c3/`.
Its receipt SHA-256 is
`7d466c520b8a9f3ccf36eb204e7348fb289e3609f76ec262148396bfcc4f52be`.
Original TDB/TT model-time approximation and system-barycenter targets remain
explicit. Passing these samples proves no continuous interval, physical
observer/event or future Earth-rotation guarantee. The 1900–2200 target,
approximate dates outside it within 1–9999, and unvalidated UI evidence status
remain unchanged.

## Corresponding source and delivery evidence

The 12-step browser/Node campaign freezes 1,698 public source entries before/after.
The dense plan requires the exact 1,698 public plus eight named private inputs,
verifies all staged assets and checks source correspondence after execution and
analysis. The final pre-documentation readback matches all 1,706 inputs. Public
documentation follows those execution freezes and retains its separate snapshot.

The staged source archive is 99,181,364 bytes, SHA-256
`7a34b79b89085a6c909c6a10ad523efa24223ab59e6da4074912a5ddfa47da9d`.
Readback verifies all 1,678 inventoried ordinary source files, the additional
inventory member and all 214 web owners. The source-delivery policy excludes
20 public files; the archive is not a claim to package all 1,698 checkout files.
All 97 extracted compiler inputs remain unchanged during an isolated locked,
offline ephemeris build. Its output is byte-identical to the candidate WASM.
The approved component licensing and original application terms are unchanged.
This verifies construction-time source and binary; later documentation edits
require regenerating delivery artifacts before publication.

Raw originals, tests, exact commands/exits, browser receipts, source inventories,
coverage, archive readback/rebuild, dense comparisons and independent review are
under `build/coordinate-poles-20261106-01/`. The unexecuted initial dense plan
remains separate from the reviewed and executed v2 plan.

## Reproduction, limits and rollback

Use installed locked tooling and fresh output paths. Retained experiment outputs
are write-once evidence, not targets to overwrite on a later run.

```powershell
cargo test --workspace --locked --offline
cargo fmt --all -- --check
cargo clippy --workspace --all-targets --locked --offline -- -D warnings
python tools/typecheck_web.py
python tools/validate_sdlc.py
python tools/validate_docs.py
```

Independent numerical, protocol, coverage and archive reviews found no actionable
issue. The completed-evidence review and admission retain their own scope.
Hosted-current-source, served release/rollback, physical-device/mobile and manual
accessibility acceptance remain separate. The supported browser capability still
reports local use disabled; existing Google Cloud VM authority is already present,
and no browser-policy workaround or replacement job was started.

The extra 24 export reflow cases observe actual 120 ms resize-callback completion
and trusted Cancel input without reproducing the historical timeout. That result
does not identify its cause or close it, and introduces no application change.

Rollback reverses only the four inverse-sine guards, their six regressions and
the related report/status/plan/accuracy-documentation hunks. Preserve earlier
working changes and retained evidence. No commit, push, licensing, dependency,
workflow, supported-calendar or deployment change occurs. Overall goal completion
and release qualification remain false.
