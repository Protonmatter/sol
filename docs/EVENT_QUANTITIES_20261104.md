# Sky event quantities and observer diagnostics — 2026-11-04

The Sky facts and tooltip now label the existing v3 altitude-maximum event
**peak altitude**. The previous `transits` label implied a different
astronomical quantity. This patch preserves all numerical algorithms, event
times, schemas, source metadata, unavailable states and the `events.transit`
compatibility key.

## Finding and existing contract

**P2 — `apps/web/js/sky.js::fillTooltip`.** The accepted AC-08
[event contract](plans/2026-09-11-correctness-and-experience/problem-and-scope.md)
requires the earliest genuine altitude maximum inside the half-open local
mean-solar day. `events_detailed` and `refine_culmination` implement that
quantity. The renderer called it a transit in both the selected-object facts
and canvas tooltip, because those surfaces share `fillTooltip`.

The [JPL event definitions](https://ssd.jpl.nasa.gov/horizons/manual.html#understanding-rise-elevation-max-transit-and-set-indicators)
distinguish elevation maximum (`e`) from passage through the observer meridian
(`t`). Normal-table markers bound an event to the preceding output interval;
coarse output can suppress the separate elevation marker. Independent
comparisons must match the intended quantity. A missing `e` marker does not
establish absence of an altitude maximum. The high-latitude June Sun table
also contains two `t` markers, so taking the first marker as the upper passage
would produce a false comparison.

A read-only observation of the exact current Rust source illustrates the
difference. For the Moon at 75 degrees north, longitude/elevation zero, on
2026-06-21, the altitude peak occurs 918.760657 seconds before the modeled
upper meridian crossing. These are two model quantities, not observed event
truth. The retained JPL table independently places `e` and `t` in different
one-minute intervals about fifteen minutes apart.

## Native and independent diagnostic correspondence

Research artifacts are retained locally under
`build/event-semantics-20261104/` and
`build/event-semantics-horizons-20261104/`. They are ignored research output,
not a new accepted accuracy registry or a portable CI fixture.

The native probe uses the exact owning `lib.rs` prefix plus a read-only
observation entry. It covers Sun/Moon, latitudes 0,42.36,75 degrees, longitude
and elevation zero, on 2026-03-21 and 2026-06-21. It observes the private event,
topocentric and EOP functions without changing the model. All owning crate
source hashes remained unchanged. The successful probes are distinct from the
retained initial diagnostic compile failure:

- `native-fixed.csv`, SHA-256 `6ae2e079ee257995348905b5f93a30df8d9deb8ee0efa76b2d549d306e5538c9`,
  is bound to the corrected observation entry whose SHA-256 begins `23bbbaa1`.
  Its full successful source is `corrected-entry-source.rs.txt`, SHA-256
  `5c2ef8304346f0bc1a3e35516dc9c1fcaf51917195f24a82f920ea02c1e240f3`.
  The original input manifest's different entry hash identifies the earlier
  failed formatter probe and is not reused as successful-entry identity.
- `native-with-eop.csv`, SHA-256 `7fe5a0f5fcb5ee01559623817890e3cc3bbb2a2c2336d4b0703fa47d3a3494bc`,
  retains twelve event/EOP observations. Its clock-probe receipt hash is
  `25a8b95c646a0f8276af0cd4a74da1d5b571cf81f481b1cff9e49b3690c8b8a5`.
- `native-points.csv`, SHA-256 `c875ba41f568ab49dabac4a14f8d1759866beb4bcdfbca9caa42e654051566ce`,
  retains 17,292 one-minute topocentric/EOP observations. Its point-probe
  receipt hash is `727e11bfa77454b5a66632a858985a8cadc8c0f01bf02be01b9ef64044e9d2ea`.

The twelve-query plan was frozen before external acquisition, SHA-256
`bcea0a00174f462a3b9da29a6beb951a0d1d5f2343412113f162bb5bae1465b5`.
It uses the selected diagnostic dates/sites, not a held-out or continuous
qualification design. Acquisition reused the existing Horizons transport with
one attempt per query and retained all twelve original responses, 1,832,388
bytes. Acquisition receipt SHA-256 is
`42c94a80ac12de804e7b91882c896a3046d3e69b695b6107dd0d300f968a8884`.
The raw tables identify DE441, the exact terrestrial sites, airless apparent
angles, Gregorian UT/JD, one-minute cadence and their EOP source/coverage.

Offline replay checks every response hash, body/source/site/clock convention,
finite quantity domain and complete 1,441-row minute matrix. It compares the
same native instants and retains all `e` and `t` markers. The final report is
`characterization-headers-checked.json`, SHA-256
`4b58e100a39eeb31d9489f80e3c1e526487f11570791dc3b1ff2d72c882a70f8`.
It records **`passed: false`**:

| Diagnostic | Checks | Failures | Largest measured difference |
| --- | ---: | ---: | ---: |
| Topocentric equatorial direction | 17,292 | 0 | 0.517805 arcseconds |
| Airless horizontal direction | 17,292 | 0 | 2.462600 arcseconds |
| Airless altitude | 17,292 | 0 | 1.228327 arcseconds |
| DUT1 at fixed 3 ms control | 17,292 | 17,292 | 0.056230 seconds |
| Altitude-peak time versus three-point minute-grid fit | 12 | 0 | 0.721783 seconds |

Pointing/altitude limits remain 10 arcseconds for Sun and12 for Moon. The
peak-fit diagnostic limit was10 seconds before acquisition. This interpolation
has no certified error bound, especially near the zenith; its residual is not
a physical event-accuracy bound or proof of subsecond engine error.

Every native case is explicitly `degraded`: the bundled measured EOP samples
cover only late June/early July2026, and these dates precede that interval.
Native DUT1 is zero with the existing0.9-second degraded uncertainty, while
JPL supplies measured historical values. Failed3ms controls remain failures.
The final analyzer exits1 for this failed result; the earlier analysis that
only signalled successful report generation remains retained separately.
Extending measured EOP history was the next observer-accuracy work item.
The subsequent [daily EOP follow-up](EOP_HISTORY_20261104.md) retains this failed
predecessor and clears the same sampled controls with the unchanged raw
references and limits. It does not turn this original report into a passing run.

Independent review found an admission gap in the initial research parser:
fixed returned columns were interpreted without checking their headings.
The final parser requires the exact returned UT/JD, apparent frame, quantity
order and degree units. Four altered-header/units controls reproduced rejection
failures before the correction; all five positive/adversarial controls now
pass. Replaying all original responses preserves every numerical measurement
and decision. Earlier reports/parsers remain retained as diagnostic history.

## Presentation validation and current artifact

Two visible-output regressions failed with the old label and pass after the
correction, retaining actual event time formatting, measured altitude and
unavailable-state distinctions. All1,423 Node tests pass. The fixed Node-only
90/90/90 gates pass at98.31% lines,91.28% branches and96.28% functions.
TypeScript5.9.3 typechecking passes124 files; UX/static/documentation/SDLC checks
also pass.

The new local staged release is `local-event-semantics-20261104`, manifest
SHA-256 `a82357be463ba7e9727d31ef23fd026167b9f509acedcd77446a50bbe0df08e4`.
It reuses the exact Linux-built modules from the
[native qualification pass](NATIVE_PRECISION_20261104.md). A full staged browser
run passes, receipt
`coverage/event-semantics-browser-20261104/browser-evidence.json`, SHA-256
`c3fb5855bdf31db16323749fa0eb709fbfa55f2a8abeed9493de01af9d645b25`.
The current denominator-complete Node/Chromium merge covers17,787/18,235 lines,
97.54%, at the unchanged90% floor. Summary SHA-256 is
`3ecdfe8d3e984c4c13c2bba59738845942e88468de3762d22b3959401218bc79`.

Actual selected facts and canvas-click tooltips pass at1280×900 and390×844
with the frozen public fixture observer/time, real worker/native WASM and no
page errors or horizontal overflow. Receipt
`coverage/event-semantics-responsive-final-20261104/receipt.json`, SHA-256
`42214399d788ca477368341625d3ab4954f8b4144bc8df3e9448042d6d608d2a`,
binds the manifest, probe, exact event values and four PNG hashes. Narrow facts
and wide tooltip captures were visually inspected.

Two earlier research harness failures remain separate. Selecting a row pins
the object and intentionally suppresses hover changes, so the corrected probe
uses a real canvas click. An intermediate copied harness decoded a degree sign
using the Windows default encoding; the final copy uses explicit UTF-8 and a
Unicode escape. Neither case changed product behavior or widened a deadline.

## Limits and rollback

The [1900–2200 precision target](PRECISION_WINDOW_20261104.md) remains unchanged.
UI/provider accuracy status is still unvalidated. These selected diagnostics
do not establish continuous observer/event precision, future physical EOP,
rise/set atmospheric accuracy, hosted CI or production acceptance.
No Rust numerical source, coefficient, dependency, API schema or production
system changed in this correction. No commit, push or deployment occurred.

Rollback only the `sky.js` label/comment/local-variable hunk and its matching
tests/docs. Preserve all earlier goal work and research receipts. Rebuild a
fresh staged artifact after any runtime change; do not attribute this stage's
browser evidence to different bytes.
