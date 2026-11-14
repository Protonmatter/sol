# Approved production precision target — 2026-11-04

The owner selected: **qualify 1900–2200; retain years 1–9999 as approximate
exploration outside that precision target**. This decision changes the required
precision envelope; it does not reduce the supported computation calendar.
Qualification is pending until the corresponding independent gates pass.

The later [actual System WASM verification](SYSTEM_WASM_PRECISION_20261105.md)
replays all39,250 geometric comparisons through the exact current browser-tested
binary, plus32 original frontend reader/projection cases. Its sampled result and
artifact identities are separate from the earlier source-observer work below.

The later [public Sky WASM replay](SKY_WASM_PRECISION_20261105.md) also passes
all 70,650 retained apparent-direction/range comparisons through the same actual
binary and original public snapshot ABI. Both full frontend/Python readers accept
all 3,925 saved snapshots. Its finite numerical result, exact identities and
separate Earth-rotation/qualification limits are recorded in that report.

The user-facing target is the complete UTC calendar interval
`1900-01-01T00:00:00Z <= input < 2201-01-01T00:00:00Z`, including all of 2200.
Historical UTC inputs retain the documented UT1-proxy interpretation. Reference
model arguments use TT/TDB with explicit conversion; the numerical sweep pads
the calendar edges by one day to cover those offsets. A date's presence in the
target is not itself independent accuracy evidence.

Main-body qualification covers the quantities currently governed by the
accuracy contract: heliocentric/geocentric geometric model positions and
apparent directions/ranges at matched model times. Existing 10-arcsecond
full-vector, 10/12-arcsecond pointing and max(1km,10ppm) range budgets remain
unchanged. Body, quantity, frame, time and source identities remain explicit.

Earth-rotation quality is separate. A numerical orbit qualification cannot
guarantee unknown future leap seconds, future physical Earth orientation,
historical clock reconstruction, local terrain/weather or observed rise/set
times. Those fields retain their existing measured/predicted/degraded status.
Catalogue-star approximations, illustrative minor bodies and finite major-moon
knot windows retain their separately stated limits.

The retained reference sweep uses a fixed 30-day grid across the padded interval,
257 deterministic irregular instants and exact boundary probes, declared before
acquisition. It compares every admitted sample and preserves every failure.
Additional targeted geometry/observer/event checks indicated by measured
residuals remain separate. A passing sampled sweep is described with its tested coverage;
it must not be presented as a mathematical proof of error at every instant.

The older full-range geometric/apparent characterizations remain immutable
evidence of approximation limits. The isolated long-term frame prototype is
research only. It does not replace the production formulas or the accepted
precision target.

## Reference acquisition and current sampled result

The frozen plan SHA-256 is
`e18f2b66cb60fd06d4f8a9ed15c4ddc0b44a28602af803bb204be5d81e4ab8c1`.
The [raw packet](../tests/fixtures/horizons-precision-1900-2200-20261104/README.md)
contains 190 original responses and 10,686,539 response bytes. Its unchanged
manifest SHA-256 is
`d3ea57a0eef1347dda375f0f66614a8d4235a0a179d08bbdba2184cec0e6cccb`.
All3,925 epochs, ten geometric target/origin pairs and nine apparent targets
are checked. The recorded32-entry transport amendment preserves the original
scientific matrix and every numerical limit.

The normal coefficient baseline failed797 of109,900 checks inside the approved
window:793 range checks and four Mars pointing checks. All geometric checks
already passed. Substituting only the existing upstream VSOP2013 `08-big`
tier at the same pinned commit removes every sampled failure, without fitting
coefficients or changing equations, ELP/TOP, Earth-orientation policy or budgets.
Two offline reconstructions reproduce the same729,349-byte VSOP blob,
SHA-256 `92182f58432b04d453a6d5c95bc35c20d1521d8eb3a280e51506179d21eb0fd2`.
The default current-profile reconstruction also verifies exact shipped identity.
The archived normal recipe remains reproducible with `--profile legacy-normal`.

The final repeatable comparison is
`build/precision-final-validation-20261104/summary.json`, SHA-256
`5c2ec9663f4e229d71e516009bef93ae9bcb8bd1f3d5a1525c87748a57065323`.
It records **109,900 passes, zero failures**, from74,575 observed model records.
The complete comparison CSV SHA-256 is
`2e3838d2eb05f623554404522674211f0bc359c6e7f5c2795036b811a4aa83a5`;
the source-observer receipt SHA-256 is
`ca8efe008f6edc8d60e31be3a8b5ae543b5942b16a2f9d41e6226e55ddf7c4b0`.

| Sampled quantity | Largest measured residual | Fixed acceptance limit |
| --- | --- | --- |
| Full relative vector norm |6.418395785″ equivalent, Uranus at JD2473519.5 |10″ equivalent |
| Geocentric apparent pointing |1.939378246″, Uranus at JD2524189.5 |10″ Sun/planet,12″ Moon |
| Geocentric apparent range, largest absolute residual |4,023.576800km, Uranus at JD2523919.5 |28,456.014433km at that reference distance |
| Geocentric apparent range, largest budget fraction |98.759270km, Mars at JD2498929.5 |690.501137km;14.30255% used |

The range threshold is always `max(1km,10ppm × reference range)`. Absolute
range maxima and worst budget fractions are retained separately: their winning
dates can differ. The full-vector metric includes radial as well as angular
error. Thirty authentic irregular vector JDs differ in printed serialization
by at most 80.47 microseconds; both requested and returned tokens remain in
the reports, with a fixed sub-millisecond admission allowance.

## Reproduction, review and runtime boundary

```text
python tools/validate_precision_window.py --out-dir build/NEW-precision-validation
python -m unittest discover -s tests/python -p "test_precision_window*.py" -v
cargo test --workspace --locked --offline
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked --offline -- -D warnings
```

The validator needs Python 3.11+ and the existing offline Rust toolchain. It adds
no dependency, download, application network call or public model interface.
It creates a new directory only under `build/`, copies the exact owning source
and data, and appends a read-only observation entry point. Every source copy,
adapted Cargo wrapper, model argument, record count and final source identity
is recorded. `summary.json` is the final completion marker; incomplete output
is retained for diagnosis. Exit0 means every sampled check passed,1 means
admission/calculation/I/O/numerical failure, and2 means invalid CLI usage.
No elevation or credentials are required. Production data is never written by
this validator; select a fresh output name after a failed run.

Independent review reproduced the coefficient serialization and all 109,900
measurements/decisions. It identified and closed a range-maxima reporting
ambiguity and strengthened the rehashed-amendment negative control. The18
worst-case Rust regressions bind exact raw-packet values and are separate from
the full matrix; their selection after observing failures is not held-out
qualification. Strict parser/validator tests cover wrong identities, units,
frames, epochs, malformed/nonfinite values, changed budgets, rehashed metadata,
partial matrices, radial errors, RA wrap and changing source inputs.

The final source observer also passes independent correspondence against the
original current root public APIs. All117,750 System coordinate scalars
(including derived geocentric Moon) are bitwise equal;32 serialized Sky
snapshots pass864 geocentric RA/Dec/range comparisons at the frozen output
serialization allowances. Maximum RA/Dec differences are4.969e-10°/4.989e-10°,
and range differences are 0 km. All32 full117-body snapshots pass both Python
and Node v3 readers. Fifty recorded current source/input files stayed stable.
The original32-epoch selection SHA-256 remains
`9bb53a17f270dffe35228b690a692892f0316b523a815705b0187c9aad4d7583`;
the current parity receipt is
`build/precision-current-api-parity-review-20261104/receipt.json`, SHA-256
`4f55b18b380453f5cd92213a16daa72aa2b51ebb2e7fe75a18509039a14755ca`.

The current ephemeris WASM is1,148,706 bytes, SHA-256
`0abfc389cfd9a70667779b04f37b7ee1e1e77c2ce09144cd6d6096fedb7d4d24`;
the solar WASM remains
`f8a78a07da7c742735288b32613a8344fe7ab5df2eedea27b4a4d866c9599199`.
The former is byte-identical to the larger-coefficient worker trial. The newly
staged local release `local-production-precision-20261104` has manifest SHA-256
`f8e0715f6daba11ac138d6eee1755eed625b0b69f0c4ad3bb455ebc2e807cb37`.
It includes the corrected scientific fingerprint inventory for
`physicalProgramSources.js` and `profiledScatteringTargets.js`. Red/green staged
tests prove that either module's isolated change invalidates scientific evidence
identity while leaving WASM/data identities unchanged.

The actual staged Sky worker passed 34 complete 117-body snapshots, including
the frozen32 reference epochs plus years 1/9999, with 576 independent pointing/
range checks. Maximum observed wall time was3,800 ms against the unchanged
10,000 ms deadline; this is local Chrome/Windows ARM64 evidence. The source-bound
receipt is `coverage/precision-current-worker-20261104.json`. A worker result
does not qualify complete rendering or physical-device performance.

The staged Sun/My Sky/interactive3DSystem smoke passes using the explicitly
configured installed Chrome. The full Python suite passes 599 tests, the Node
suite 1,423 tests, Rust workspace 205 tests, rustfmt and strict Clippy. Two further
documentation-scan regressions pass after excluding ignored generated root
copies from the default scan; nested source guides remain checked. The default
documentation gate passes176 documents, and static web validation passes.
The final local Rust coverage run executes 205 tests with 8,303/8,682 lines hit,
95.634646% at the unchanged 90% floor. LCOV SHA-256 is
`f4049d8356c7cdb037bdaedc2d013c4f3c6f21d640f4f2482265f6e6a3998edf`;
the current receipt is
`coverage/production-20261104-precision-rust-coverage-receipt.json`.

The complete rendered-date probe passes 22 cases at 1280×900 and 390×844:
Sky's last supported minute before 1900, first minute of 1900, last minute
of 2200, first minute of 2201, years 1/9999, invalid-input retention, and System
slider dates on both sides of each precision boundary. Labels use the rendered
epoch, show pending/unvalidated inside the target and approximate outside it,
and fit within both inspector widths. The four retained screenshots were
visually inspected. The receipt is
`coverage/precision-date-policy-cdp-20261104/receipt.json`, SHA-256
`629973beb0362926e0dcba0cfdfad090ec9d1e00675c7af1fb36f86513c29fcb`.

Earlier diagnostic probes are retained separately and are not passing evidence.
The first supplied seconds to a minute-only control; another attempted label
geometry while the System inspector was closed. Page-level Fetch interception
also intermittently stranded worker startup at the unchanged10-second limit,
matching the existing warning in `tools/browser_validation.mjs`. The final
probe uses that tool's established CDP/DNS external-blocking approach without
intercepting loopback module imports. The same artifact and product deadlines
are unchanged. Separate cold/warm follow-ups passed on native GPU and
SwiftShader in 2,297–2,541ms. Those diagnostic passes do not establish stress-load
or cross-device performance guarantees.

The current full-application native GPU validator passes 20 checks with 20
captures, including real source playback, Earth optical/night-light layers,
Moon/Mars terrain, context loss/restoration,390-pixel layout, and animated
Mars level 4 geometry with physical optical fields and matching HDR final draws.
The renderer is observed from the actual WebGL context as Qualcomm Adreno
X1-85 through ANGLE/D3D11. There are no page, console, shader compilation or
WebGL errors. The evidence file is
`coverage/precision-current-physical-native-20261104/evidence.json`, SHA-256
`754e34aa919129b9c1dbbc08d8b3e9ef132bff8b32a68c08c1f9b589c92b97f5`.
Earth optics and restored Mars captures were visually inspected. This local
headless native run is separate from physical mobile or complete platform
acceptance.

A final independent read-only review found no actionable P0–P2 issue in the
date-policy helper, committed-state UI call sites, retained-snapshot tests or
documentation discovery change. It reran 51 focused Node tests, both
documentation regressions and the 176-document gate.

The current SwiftShader browser execution/visual scenario also passes against
the same manifest, including source playback, Sky interactions, System motion,
moon-shadow controls and recovered Earth/planet appearances. Its receipt is
`coverage/precision-browser-20261104/browser-evidence.json`, SHA-256
`107b0dc05ab623b50642294113de94359203f8eb7b8c4419480b59e82ef5b61b`.
Node execution coverage passes the fixed 90/90/90 floors at 98.31% lines,
91.28% branches and 96.28% functions. The denominator-complete Node/Chromium
merge covers 17,786/18,234 hand-written runtime lines,97.54%, at the unchanged
90% floor. Its summary SHA-256 is
`0f46b2f5ddca5eafc714ae25dc7a6df6c36c12657b835eeec0a11e8e91c5c36f`.
Generated catalogue rows remain excluded from that denominator, while all
hand-written workers remain included.

The refreshed Python coverage run passes 601 repository tests plus 39 provider
tests. The unchanged CI-selected statement/branch gate passes 90.604381%;
statement coverage separately is93.217666%. Receipt
`coverage/precision-python-20261104-receipt.json`, SHA-256
`67d21db277aaddb6a96d8236f766c8b8aeef644d5e3634b02c84b8bb4614abf9`,
records Python 3.14.3/coverage 7.13.5 on Windows ARM64. This is not the exact
hosted Python 3.12/coverage 7.15.2 environment. JSDoc typechecking passes 124
files with the existing TypeScript 5.9.3; UX structure, body motion/constants,
SDLC/workflow validation and whitespace checks also pass.

The full independent sweep is now an unconditional blocking command in the
existing required CI `web` job, reusing its Python/Rust setup. An always-run
upload retains only reports, native CSV and epochs, under commit/run/attempt
identity; compiled binaries and build trees are excluded. Independent review
found no actionable issue in ordering, offline prerequisites, failure
propagation or retention. Two additional CLI controls verify nonzero exits for
recorded numerical failures, bad references and failed native subprocesses;
the precision suites now pass 20 tests. The hosted job/upload has not run.

Vector rows use the engine's TT dynamical argument at the reference's numeric
JDTDB value, consistent with the existing TT-as-TDB approximation. The 1 ms
argument reconstruction control verifies that numeric match; it is not proof
that physical TT/TDB or historical/future UTC clocks are identical.

## Remaining work and rollback

The [native Linux/compiler follow-up](NATIVE_PRECISION_20261104.md) records the
same complete sampled matrix passing on native x86-64, exact source/transfer
correspondence, explained cross-host WASM representation differences, and the
new Rust 1.96.0 policy. Its current-policy Windows rerun supersedes the earlier
validator metadata hashes while preserving the exact comparison CSV and all
numerical results. Historical receipts above remain intact.

Complete staged rendering/performance/failure
acceptance, cross-platform/hosted CI, and independently scoped observer/event
qualification remain separate work. The UI and provider registry continue to
report unvalidated; no protected qualification acceptance or release promotion
was performed. Source notice/package correspondence remains held.

The full-range analytic/frame limitations remain outside this approved precision
target. A larger coefficient set does not justify guaranteeing every instant
through year9999, future physical UTC/EOP or observed local event times.

For this uncommitted local candidate, the previous VSOP bytes and manifest are
retained in `build/precision-vsop08-promotion-20261104/`; the immutable legacy
manifest also pins their identity. A rollback must restore the corresponding
coefficient profile, term-count/test fixtures and rebuild all dependent WASM/
artifacts together, then rerun the fixed gates. Do not discard unrelated working
changes. No production system, Git history or published artifact was changed.

## Files changed for this precision-window pass

The following inventory is scoped to this pass. Earlier accumulated production
work remains in the same uncommitted workspace. The raw packet's manifest and
acquisition records enumerate every original metadata/response filename.

```text
.gitattributes
.github/workflows/ci.yml
apps/web/js/accuracy.js
apps/web/js/orrery.js
apps/web/js/sky.js
crates/solar-ephemeris/README.md
crates/solar-ephemeris/data/vsop2013.bin
crates/solar-ephemeris/data/precision-regressions-20261104.csv
crates/solar-ephemeris/src/blob_validate.rs
crates/solar-ephemeris/src/lib.rs
crates/solar-ephemeris/src/top2013.rs
crates/solar-ephemeris/src/vsop2013.rs
crates/solar-ephemeris/src/vsop2013_data.rs
docs/ACCURACY_CONTRACT.md
docs/COEFFICIENT_PROVENANCE.md
docs/EPHEMERIS_V3.md
docs/GRAZING_EVENTS_20261104.md
docs/PRECISION_WINDOW_20261104.md
docs/RUST_COVERAGE_20261103.md
docs/STATUS.md
docs/superpowers/plans/2026-11-04-precision-window.md
tests/fixtures/coefficient-sources-normal-20261103.json
tests/fixtures/horizons-precision-1900-2200-20261104/
tests/fixtures/precision-regressions-20261104.csv
tests/python/test_coefficient_recovery.py
tests/python/test_documentation_scan.py
tests/python/test_precision_window_reference.py
tests/python/test_precision_window_validation.py
tests/python/test_release_artifact.py
tests/web/accuracyEvidence.test.mjs
tests/web/sky_review_regressions.test.mjs
tools/build_web.py
tools/ephemeris-data/README.md
tools/ephemeris-data/coefficient-sources.json
tools/ephemeris-data/coefficient-sources-vsop08.json
tools/ephemeris-data/extract_coefficient_literals.mjs
tools/precision_model_probe.rs.txt
tools/precision_window_reference.py
tools/rebuild_coefficients.py
tools/validate_docs.py
tools/validate_precision_window.py
```
