# Independent Geometric Vector Reference Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task by task. No commit, push, new application dependency, licensing change or production deployment is authorized.

**Goal:** Independently compare the orbit view's geometric vectors with retained JPL Horizons references across the supported calendar range, and correct only demonstrated defects.

**Architecture:** Retain ten bounded serial vector queries before comparing the model. An offline Python loader binds headers, exact queries, epochs, raw hashes and a derived CSV. A Rust example observes the existing f64 System ABI at matching dynamical model arguments; a crate regression independently checks the native model. Neither changes product network behavior or promotes UI accuracy status.

**Tech Stack:** Existing Rust/Cargo, Python standard library and the existing Horizons endpoint. No new dependency or public API is required.

**Spec:** `docs/ACCURACY_CONTRACT.md`, `docs/EPHEMERIS_V3.md`, and the immutable `predeclared-plan.txt` in the new fixture pack.

## Global constraints and predeclared budget

- The predeclared fixture plan below is frozen and hashed before acquisition and numerical comparison.
- Ten target/origin pairs: Mercury 1/10, Venus 2/10, Earth centre 399/10, Mars system 4/10, Jupiter system 5/10, Saturn system 6/10, Uranus system 7/10, Neptune system 8/10, Moon 301/10 and geocentric Moon 301/399.
- Sixteen proleptic Gregorian dynamical epochs: Jan 1 00:00 in years 1, 1000, 1600, 1800, 1900, 1950, 2050, 2100, 2200, 2400, 3000, 5000, 7000 and 9999; J2000 Jan 1 2000 12:00; July 1 2026 00:00. All are numeric JD/TDB requests.
- Request geometric vectors (`NONE` correction), ecliptic J2000 / ICRF, AU-day units, position-only CSV. Planetary system barycentres are explicit; these do not measure the giant planets' centre-to-barycentre offsets.
- Primary intended acceptance budget: relative vector-norm residual `norm(model-reference)/norm(reference) * 206264.80624709636 <= 10` arcsecond-equivalent, declared before measurement. This is a full-vector metric, not an angular pointing measurement. True angular and radial residuals are reported separately. Do not relax the budget to fit failures.
- The direct model is evaluated at the requested TDB argument. The public ABI comparison inverts the existing TT mapping to within 1 ms; TT approximates TDB within 2 ms. This isolates coordinate-model error from historical UT1/Delta-T uncertainty; it does not qualify absolute ancient UTC timing.
- Preserve both coefficient and moon assets, numerical thresholds and current UI evidence status. Source mismatch, omitted/duplicate/reordered epochs, wrong target/origin/frame/correction/units, nonfinite values or changed raw bytes fail admission.

## Review focus

- Barycentre versus body-centre identity and heliocentric versus geocentric origin.
- Geometric vectors versus apparent/light-time/aberrated positions.
- Exact epoch, TDB/TT argument and proleptic Gregorian interpretation at both date extremes.
- Complete finite strict numeric CSV records bound to original raw responses and a crate-local copy.
- Claims limited to actual samples, retaining failures and continuous/event/platform holds.

## Tasks

- [x] Acquire and retain the ten exact queries, original responses, acquisition times and hashes; budget frozen before comparison. The 160-vector matrix contains 62,777 raw response bytes.
- [x] Add failing parsing/admission/integrity tests and implement `tools/horizons_vectors.py` plus its offline reference loader. Eleven focused tests pass; the historical baseline retains all 29 scientific failures.
- [x] Add native example/regression and offline `tools/validate_vectors.py`; characterize the complete matrix and isolate demonstrated defects. No explaining harness/port error was found; a higher-tier scratch experiment still fails 19 samples. Unsupported accuracy comments and a provenance-gate whole-file-freeze defect were corrected without changing product math/data or thresholds.
- [x] Complete final full Python, docs and diff checks. Python567 and Rust196/fmt/clippy pass, with refreshed Rust95.54% coverage and exact WASM byte identity. Independent reviews found no remaining actionable harness/provenance findings and supplementary raw-initializer review matches the installed JPL asset exactly. The full-span scientific gate remains failed and no UI qualification is promoted. Date-range preference is optional user steering; until answered, the full supported range remains the working objective.
