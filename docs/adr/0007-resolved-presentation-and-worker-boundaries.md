# ADR 0007: Resolved presentation and worker boundaries

- Status: Accepted for local engineering under RFC 0002; qualification remains held
- Date: 2026-09-11

## Context

Independent display strings, stale clock labels, mutable selections and synchronous engine
work made the original interface hard to interpret and recover. A framework replacement
does not address those boundaries. ADRs 0001 and 0003 remain in force.

## Decision

1. Retain native ES modules, raw Rust/WASM and one Sun / My Sky / Solar System shell.
   Navigation stays available outside the optional inspector; narrow layouts show the
   visualization before extended controls. Stable keyed object rows preserve focus.
2. Resolve immutable presentation records from validated inputs. Source, freshness,
   provider, availability and limits are explicit. Sun model time, image capture time,
   astronomical render time and illustrative galactic time are not interchangeable.
   View-evidence export freezes its previewed revision and redacts precise observer
   coordinates; scientific snapshot export remains a separate contract.
3. Keep observed imagery and modeled anchors separate. Missing image capture/registration
   evidence is unavailable, not an inferred match. Model score is a heuristic, not a
   probability or magnetic uncertainty estimate.
4. Run full Solar forecast, Sky snapshot and System metadata work in bounded workers.
   Each client has one active and at most one latest pending intent; cancellation,
   generation, deadline, schema, ABI and release identity guard publication. Errors retain
   the last valid result with explicit recovery. No automatic remote fallback is allowed.
5. System has one measured main-thread exception: the fixed 27-float position result for
   nine bodies. Validate all coordinates and derived distances before publishing time
   and positions together. Full JSON/phase/orbital metadata remains worker-owned and its
   sampled epoch is disclosed separately from current position markers.
6. Default Sky computation is local. Remote health and location-bearing requests need
   exact-recipient session consent; redirects are rejected. Changed recipient, denial,
   cancellation and revocation cannot silently authorize a different destination.

## Consequences and evidence boundary

Cancellation/recovery, request identity, projection/selection, reflow and privacy have
regression tests. Local headless Chromium checks exercise real workers and pixels. A
SwiftShader/4x-throttled sample measured the fixed position pair at p95 6 ms (maximum
13 ms); this is not a physical-device frame SLO or cross-browser performance certificate.
Screen-reader, physical touch, usability, full WCAG and independent scientific accuracy
qualification remain required. See [validation](../VALIDATION_PLAN.md),
[System contract](../../apps/web/js/systemContract.js) and
[presentation resolver](../../apps/web/js/presentationState.js).
