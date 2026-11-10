# Nutation source-delivery follow-up - 2026-11-07

Status: output-directory and source-archive input fixes are applied; ERFA adoption
remains a private proposal. This follows the
[numerical candidate](NUTATION_ERFA_CANDIDATE_20261107.md), preserving its original
evidence and mixed accuracy results. Requirements: `SOL-SCI-001`, `SOL-TEST-001`,
`SOL-COV-001`.

## Applied safety fix

`tools/rebuild_coefficients.py::output_path` previously rejected the build root
only when it existed. A fresh source archive has no build directory, exposing
that it admitted the root itself. The implementation now explicitly rejects
that path, while retaining admission of a new child without filesystem writes.
The canonical script and packaged mirror remain identical. Two independent
temporary-root tests cover the missing-root rejection and valid child.

The main checkout passes all 18 coefficient tests and 26 distribution tests,
plus SDLC and documentation checks. Only the script, packaged mirror and coefficient
test changed for the output-directory fix. The existing documentation already requires a new
directory under build; the fix enforces that documented boundary. No numerical
Rust source, table, interface or rendered asset changed.

## Private delivery proposal

The private proposal adds complete ERFA notice/source admission, three matching
web portal materials and offline reconstruction instructions. It retains the
component LGPL and original application MIT/Apache declarations. It adds no
runtime package, telemetry, network call or service. The generator becomes the
55th governed Python module, with the unchanged 90 percent floor and exact
workflow include lists; CI explicitly checks its reconstruction.

Missing/altered nutation inputs and web notices were accepted by the old helper.
New tests first reproduced that gap, then passed after the helper required the
pinned manifest, complete source copyright/conditions/disclaimer, all seven
preferred sources, generated data and canonical rebuild copies. A symbolic-link
parent cannot satisfy the preferred-source check. Historical coefficient-profile
and web-fixture behavior remain covered separately.

Independent review found one P2: ordinary Windows checkout conversion changed
the pinned ERFA bytes. The proposal now preserves the raw ERFA subtree and
explicit LF BSD notice copies. Its new regression uses a temporary Git index
and actual checkout operations under both autocrlf policies, without a commit,
shared index write or inherited global configuration. It also checks staged
whitespace while preserving the original upstream bytes.

## Actual source-archive validation

The first archive omitted legacy cycle-series migration inputs and three legacy
fixture aliases still used by offline regeneration/tests. Its full test run is
retained as failed: 817 tests, five failures, 81 errors and two skipped producer
checks. Further failures identified the checkout-dependent test, stale 54-module
scope assertion and missing-build-root case. These failures are not relabelled.

The generic input-inclusion fix is also applied to the main packaging helper
and its mirror, with its regression and matching source-rebuild instructions.
It introduces no ERFA material or numerical model change. The helper now
includes all 15 legacy inputs as source materials when they are
absent from explicit source/captured-data maps. Captured aliases retain
precedence, and served application data stays selected by its existing bundle.
A synthetic regression checks source inclusion and precedence. The preferred-JS
filter test now uses its own repository so an unpacked archive needs no Git
metadata. A fresh exact source-archive run builds its native prerequisite and
requires the producer checks instead of skipping them.

The corrected v4 archive has 1,787 source records, all checked
against recorded byte counts and SHA-256. An initial Windows-mounted run reached
late tests but its process was killed at the 600-second harness cap; that
incomplete run remains retained. A subsequent tmpfs run completed 829 tests
with 21 errors: its filesystem blocked native execution and exhausted temporary
capacity, and Git-aware provenance tests had no Git context. Those failed
environment receipts and logs remain retained. The final run used an independently
byte-verified copy of the same archive on executable, adequately sized Linux
tmpfs with a 1,200-second suite cap. Its owned Git metadata points at the
existing base commit through a read-only object store, while keeping the proposed
working copy explicitly dirty. It creates no commit or shared index write.
Archive reconstruction/build was separately verified without any Git metadata.
These are test-environment changes, with no product response-target or
coverage-floor change.

- Linux ARM64 provider suite: 39 passed.
- Linux ARM64 complete tool suite: 829 passed, with no skips.
- Exact 55-module branch-inclusive Python coverage: 91.02350 percent,
  above the unchanged 90 percent floor. Generator, SDLC, documentation,
  staged-manifest and static-web checks pass.
- Node suite: all 1,930 tests pass without skips or failures, associated with
  the v4 staged artifact. Its source inputs remain unchanged. The console wrapper
  failed while printing an already saved UTF-8 log after successful completion;
  the saved result/coverage were verified directly without rerunning tests.
- The actual source archive reconstructs all three coefficient tables and the
  nutation data exactly, without installation or network access.
- Both WASMs rebuilt from that archive are byte-identical to the v4 staged
  candidate: ephemeris `36a93f7327bd8e4274a98206f2a8cf36fe9fbc2fbac1937f939a4d4aad1a1e2f`,
  solar `eb0fe6fbd28296d0bb877e9b6008e4628141b62155f738a2fceebe16cf688f9b`.
- The actual Cargo archive has 72 members. All
  70 required package materials match
  the reviewed source bytes. This local unversioned/dirty diagnostic does not
  establish clean-source publication acceptance.

The v4 staged manifest is
`da783fc4b9e45a84dcf220b76720ecd2e4a6aaeef40125702a27ffa7e87ec9c1`.
Its Rust/data/build inputs match the previously characterized numerical
candidate. Those earlier native/WASM scientific results retain their own scope;
these source checks do not establish new physical or continuous-date accuracy.

## Boundaries and next work

Evidence, original failed runs, review receipts, exact source inventories and
rebuild outputs are retained under
`build/nutation-delivery-20261107-baf26236fe6341f59241a2e32933e9cb/`.
The prior numerical candidate and its evidence remain untouched.

The main application still uses four-term nutation. ERFA source/notice adoption,
browser/worker acceptance of the candidate, new rendering/timing qualification,
clean-source publication and hosted CI remain separate. The 200 ms response
target remains binding for both hardware and software; whole-driver software
emulation still has an unresolved timing hold. Illustrative Earth remains the
approved look, with no rendering asset or shader change in this pass.

No commit, push, release, deployment, external message or new dependency
installation occurred. The production-readiness goal remains active.
