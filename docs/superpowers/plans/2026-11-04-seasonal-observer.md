# Seasonal original-API observer reference regression

Continue the production-readiness goal and accepted seasonal observer matrix.
The1900–2200 target remains; this cohort characterizes monthly2026 samples only.
Do not infer continuous accuracy, visibility, event timing or a full-span guarantee.

The original plan was frozen before acquisition: four existing observer sites,
12 monthly epochs on the15th at each site's existing odd-second UTC time, and
nine bodies. All36 batched JPL Horizons queries use quantities2/4/20/49, explicit
Gregorian UT/JD, geodetic terrestrial coordinates and airless apparent output.
There are432 observations. Existing10/12-arcsecond,3ms DUT1 and max(1km,10ppm)
range budgets are unchanged. Plan SHA-256:
`7d5c6df57cf8994aecef9867848ecda36964a800cf360c2e8369d76c14a05bf3`.

The first capture stopped after six responses because the research guard
incorrectly assumed every Earth-center kernel is DE441. The original retained
36-response corpus already identifies Jupiter/Neptune Earth-center kernels
separately. A fixed per-body provenance amendment was frozen from that historical
data, retaining the original failure and all six bytesets. No query, epoch, site,
quantity, budget or model changed. The remaining30 queries were acquired once;
the sixth response's acquisition time stays bounded by the original interval,
without inventing an exact timestamp. Amendment SHA-256:
`a07ddeacc639bbb98d0f9a4105404c5726f17be4e0d502d1c04138efe3c68fa3`.

All36 admitted replies total354,484bytes. An actual current-source original sky
CLI diagnostic admits all48 full v3 snapshots, independently binds each returned
epoch/site and passes all2,160 comparisons. This is a retained diagnostic, not yet
a registered offline/Cargo qualification. No native values were synthesized.

1. Freeze the original/amended acquisition, helper snapshots, requests, raw
   replies, historical kernel provenance and derived CSV in a small fixture pack.
2. Add a bounded network-free admission module under `tools/`, with immutable
   parsed rows and exact plan/amendment/query/record/metadata/CSV correspondence.
   Exercise missing/duplicated/rehased malformed source, epoch, units, columns,
   nonfinite values, path/size and chronology controls. Do not execute snapshot
   helper text while admitting a pack.
3. Add the new module to the governed Python scope and actual workflow commands.
   Keep all existing exclusions and the90% floor unchanged.
4. Add the432-row native regression inside the existing cfg(test) module, covering
   RA/Dec, alt/az, altitude, range and clock at the fixed limits. Preserve the prior
   four-site corpus. Do not alter runtime ephemeris functions or binary tables.
5. Run full Python/provider coverage, Rust tests/fmt/clippy and release-WASM byte
   comparison. Refresh source-bound model/native correspondence after test-only
   source additions; preserve original reports rather than relabeling them.
6. Obtain independent read-only review; update evidence/status/docs and enumerate
   remaining continuous, observer/event, EOP, platform/manual and release holds.

Affected files: new reference module and Python tests, fixture/raw/CSV data,
coverage scope/workflow, test-only Rust block, relevant docs. Risk is medium for
scientific reference admission and low for test-only runtime exposure. No external
dependency, application network path, model, tolerance, licensing, production
setting, commit, push or deployment change. Rollback removes the new regression
and reference binding together, preserving raw evidence and unrelated goal work.

## Recorded execution

The immutable fixture and network-free admission are implemented. All 11
admission tests, 729 repository/39 provider Python tests and 224 Rust tests pass.
The 50-module Python profile reaches 90.319592% aggregate coverage at the same
90% floor; current Rust coverage is 95.821058%. Independent raw/CSV/native review
passes. The fresh local original CLI passes all 48 snapshots/2,160 comparisons;
the current 3,925-epoch model replay passes all 109,900 checks. Rebuilt 1.96 WASM
bytes are unchanged. See [seasonal results](../../SEASONAL_OBSERVER_20261104.md)
and the separate [minimum-compiler run](../../SEASONAL_MSRV_20261104.md).

The original failed capture and kernel-identity amendment remain preserved.
These are finite seasonal results; continuous/held-out physical accuracy and
full-span Earth rotation remain open. No production or release status is promoted.
