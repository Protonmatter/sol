# Independent Range Reference Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans task by task. No commit, push, dependency installation, licensing change or production deployment is authorized.

**Goal:** Add retained independent references and offline/native regressions for the actual v3 geocentric and observer ranges, then correct any demonstrated numerical or parsing defect.

**Architecture:** Capture the existing provider's exact topocentric `2,4,20` and geocentric `2,20` queries for the existing four public-city fixture sites and nine bodies. Retain raw response bytes, exact queries, acquisition times and source identity before comparison. Bind derived range data to the raw records and compare the actual native engine. Snapshot/UI accuracy status remains held outside accepted evidence.

**Tech Stack:** Existing Python standard-library provider and installed native Rust tooling; no new application network call or dependency.

## Predeclared scope and acceptance budget

Declared before acquiring or inspecting new numerical residuals on 2026-11-03:

- Four existing `validate_ephemeris.py` sites/instants on 2026-07-01; Sun, Moon, Mercury, Venus, Mars, Jupiter, Saturn, Uranus and Neptune.
- 72 serial raw requests: an Earth-geocentric and an Earth-geodetic observer table for each body/site/instant pair. The provider's existing request parameters remain unchanged.
- Quantity 20 is the apparent, down-leg light-time-aberrated target range relative to the selected center. Convert AU using exactly 149597870.7 km/AU. It is not an instantaneous geometric heliocentric distance or event reference.
- For each separately identified range, require absolute residual <= `max(1 km, 1e-5 * reference_range_km)` (10 ppm with a 1 km floor). This is a new bounded engineering regression target for the educational model, declared before measurement; it does not assert empirical calibration, continuous accuracy or navigation suitability.
- Retain existing pointing and DUT1 thresholds unchanged. Never relax a failing range threshold to fit the new results.
- A source/header/epoch/quantity mismatch, incomplete matrix or nonfinite/invalid range fails admission. Captured references are unqualified until those checks pass.

## Tasks

- [x] Acquire and retain the exact existing query matrix with provenance, bounded serial reads and no new production network behavior.
- [x] Independently verify range conventions/units and characterize current native residuals. Isolate any demonstrated defect before choosing runtime changes.
- [x] Add failing regressions and implement the smallest verified correction plus immutable offline range fixtures and native tests.
- [x] Run relevant Rust/Python/contracts/accuracy checks and independent review; update docs with measured scope, exact identity, remaining holds and rollback.
