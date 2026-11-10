# ERFA nutation candidate characterization - 2026-11-07

Status: isolated source and numerical candidate; not applied to the application.
The current checkout retains its four-term nutation, approved Illustrative
Earth and existing staged application. The production-readiness goal remains
active. Requirements: `SOL-SCI-001`, `SOL-TEST-001`, `SOL-COV-001`.

The [source-delivery follow-up](NUTATION_DELIVERY_20261107.md) records
a later tested packaging/CI cohort and the separately applied output-directory
safety fix. The original numerical cohort below remains unchanged; adoption,
browser and timing qualification are still pending.

## Source and model boundary

This follows the [initial characterization](NUTATION_CHARACTERIZATION_20261107.md)
and [independent regression-oracle follow-up](NUTATION_REGRESSIONS_20261107.md).
It implements the full 106-term IAU1980 series in a private Rust candidate,
retaining the existing IAU76/80 frame convention and public TT-centuries/degrees
interface. Precession, obliquity baseline, planetary/lunar theory, Earth
orientation inputs, observer reductions and application rendering are unchanged.

The source is ERFA v2.0.1, immutable revision
`9915ba38c9365f8b0738269b8c2ac1fdd5f8dee3`. ERFA describes itself as derived,
with permission, from SOFA and distributed under a three-clause BSD license.
The private candidate retains the complete source copyright/conditions/disclaimer,
the upstream license and README, the two C kernels, headers and official test
file. No ERFA runtime package, dependency installation or runtime network call
is introduced. The component LGPL and application MIT/Apache declarations are
unchanged; source and notice integration remains a separate pending decision.
See the pinned [ERFA README](https://github.com/liberfa/erfa/blob/9915ba38c9365f8b0738269b8c2ac1fdd5f8dee3/README.rst)
and [nut80 source and complete notice](https://github.com/liberfa/erfa/blob/9915ba38c9365f8b0738269b8c2ac1fdd5f8dee3/src/nut80.c).

## Reproduced checks

- The unmodified ERFA C kernel passes its two published `t_nut80` coordinates.
  At all 3,940 retained TT epochs its two angles exactly equal the earlier
  unmodified SOFA reference. An independent actual-Rust module probe matches
  ERFA bit for bit in all 7,880 components. Through the public degrees-returning
  interface and back to radians, the maximum difference is
  `1.3552527156068805e-20` radians, about `2.7954e-15` arcseconds.
- Linux ARM64 formatting, strict workspace Clippy and all 236 workspace tests
  pass, with zero failed, ignored or filtered tests. Windows ARM64 repeats all
  236 tests under LLVM coverage: 8,982/9,356 reported lines, printed 96.00%,
  above the unchanged 90% floor. This does not establish hosted CI acceptance.
- The existing padded/irregular 3,925-epoch precision harness passes all
  109,900 checks on 74,575 native outputs. Its geometric-vector worst sample
  is 1.565027527 arcseconds for Uranus. Its geocentric apparent worst sample
  is 1.760395169 arcseconds for Uranus, versus 1.939378246 in the earlier
  paired baseline cohort. These are sampled residuals, not uncertainty bounds.
- Original public snapshot validation passes 51 native snapshots per model:
  48 seasonal observers and three fixed regression observers, 117 bodies each.
  All 2,160 seasonal checks per model pass the unchanged pointing, range and
  clock budgets. Across 17,901 paired body/event entries, occurrence statuses
  do not change; the largest paired finite event shift is 1.190418005 seconds.
  Atomic-clock/EOP fields and geocentric ranges remain identical.
- The original public WASM Sky export agrees with native results at all 51
  observers under the separately declared numerical parity budgets below.
  All snapshots also pass the production browser parser and request binding.
  System metadata and its 27-component position ABI pass at those 51 epochs.
  This uses Node's WASM runtime, not a browser rendering or timing campaign.
- The actual private Cargo archive contains all 14 required ERFA adaptation,
  notice, preferred-source and reconstruction files byte for byte. It unpacks,
  builds offline, and reconstructs the generated data byte for byte. This
  `--allow-dirty --no-verify` diagnostic is not clean-source/package publication
  admission and does not complete the web source-delivery integration.
- Six generator regression tests pass. Focused branch-inclusive coverage prints
  91%; the governed whole-Python coverage cohort has not yet been extended from
  54 to 55 modules. Tests include polynomial signs, altered/missing sources,
  malformed manifests, deterministic reconstruction and no output replacement.

## Seasonal results are mixed

| Metric, 432 seasonal observations | Current four-term baseline | Full-series candidate |
| --- | ---: | ---: |
| Worst topocentric RA/Dec residual, arcsec | 0.819566194 | 0.818070847 |
| Worst airless alt/az residual, arcsec | 0.856446487 | 0.866586129 |
| Worst airless altitude residual, arcsec | 0.690536211 | 0.692497787 |
| Worst observer-range residual, km | 952.420365810 | 952.420614243 |
| Worst DUT1 residual, seconds | 0.001432404 | 0.001432404 |

The RA/Dec maximum remains Uranus: the baseline record is Reykjavik in November,
where the candidate improves from 0.819566194 to 0.640852178 arcseconds. The new
candidate record is Nairobi in June, where the residual increases from
0.677524738 to 0.818070847 arcseconds. Boston/June Uranus holds both alt/az
records. RA/Dec residuals improve in 203 observations and worsen in 229;
alt/az improves in 232 and worsens in 200. The full series removes the known
nutation truncation but does not explain or eliminate the seasonal maximum.
No deep-sub-arcsecond or continuous-date qualification is established.

The wider 144-direction historical diagnostic remains failed: 28 samples exceed
the modern pointing limits, all at four epochs outside 1900-2200. Its worst is
about 1,990.14 arcseconds, Uranus near year 9999. The failed report is retained.
The approved precision scope remains complete UTC years 1900-2200; years 1-9999
outside that scope remain explicitly approximate.

## Native/WASM numerical conditioning

The first harness required `1e-7` degree horizontal-direction agreement
everywhere. It failed on fixed-observer Alshain after the 48 seasonal cases:
native and WASM differ by `1.1620380439776493e-7` degrees, about 0.418 mas.
Both actual output altitudes reproduce inverse sines of values exactly 14
and 13 binary64 ulps below one. Independent arithmetic reproduces the angular
difference from that one-ulp change. This is conditioning in the unchanged
`coords::alt_az` inverse-sine calculation, not evidence of an ERFA port defect.

The separate replay plan, recorded before replay, retains `1e-7` degree for
ordinary horizontal directions. It uses the existing `2e-6` degree (7.2 mas)
zenith regression budget only when both geometric altitudes have magnitude
greater than 89.999 degrees, and asserts their classification agrees. It uses
robust unit-vector angular separation, including for refracted directions.
Other declared budgets remain: 0.01 second event times, `2e-9` degree equatorial
angles, `1e-6` degree transit altitudes, and a 1 cm absolute range allowance
plus the declared small relative floating-point allowance. The replay also
corrects a suffix-matching ordering error so transit altitude uses its already
declared specific budget. The original failed run is retained unchanged.

This is an engineering parity budget for the existing implementation, not a
derived bound on all platforms or a physical accuracy claim. Ordinary and polar
maxima, classification cases and all numerical budgets are in the replay receipt.

## Retained evidence and remaining work

The owned audit is
`build/nutation-integration-review-20261107-e80ed953765a4e63bcf35840c27e337f/`.
It retains immutable acquisition/Git-blob/SHA-256 records; C, Rust and native
outputs; both failed development attempts; complete comparison CSVs; source
freezes; reviewer receipts; the original failed WASM comparison and its separate
replay; Windows coverage; and the actual Cargo archive/unpacked rebuild proof.
`numerical-source-only.patch` has 19 paths (17 added, two modified) and passes
read-only application checking. It is explicitly incomplete as a production
proposal: do not apply it as a substitute for the pending integration steps.

Remaining steps include complete web notice/source-delivery admission, canonical
and packaged rebuild-copy checks, 55-module CI/coverage enrollment, clean-source
package validation, browser/worker checks for the new WASM, and fresh timing
qualification. Any required source/notice approval must concern a concrete tested
integration packet; the earlier component-LGPL approval is not being requested
again. The main model has not been changed for this candidate.

Both hardware and software retain the 200 ms response target. Earlier native
and ordinary software-fallback timing evidence belongs to its original stage05
artifact. The whole-driver software-emulation timing hold remains unresolved;
there is no waiver. Rendering assets and the approved Illustrative Earth remain
unchanged. No new browser, visual-quality, hosted CI, physical-observation,
release or deployment acceptance is claimed here.

Rollback of this documentation checkpoint removes only this report and its
cross-reference paragraph in the initial characterization. The exact prior
characterization bytes are retained in the owned audit. Preserve unrelated work.
