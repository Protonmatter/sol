# Sky altitude-peak semantics correction

**Goal:** Make the visible event name match the existing v3 numerical contract
before comparing it with independent Horizons event quantities.

**Requirements:** `SOL-SCI-001`, `SOL-UX-001`, `SOL-TEST-001`; existing AC-08
requires the earliest genuine altitude maximum in the half-open mean-solar day.

**Finding:** `sky.js::fillTooltip` labels `events.transit` as a meridian transit,
but the accepted contract and solver define an altitude maximum. The JPL
manual distinguishes those quantities. A read-only exact-source probe shows a
918.76-second separation for the Moon at 75 degrees north on 2026-06-21.
This is a model illustration, not independent event truth.

**Scope/risk:** Low-risk patch to `apps/web/js/sky.js`,
`tests/web/skyEvents.test.mjs`, current event/accuracy documentation and status.
Public schema fields, numerical algorithms, thresholds and source metadata
remain compatible. Existing local-day and unavailable-event distinctions remain.

## Acceptance and validation

- [x] Reproduce the existing misleading label with a failing visible-output test.
- [x] Label the event `peak altitude` in both selected facts and tooltip output.
- [x] Preserve the exact timestamp, altitude, event source and all null states.
- [x] Document the compatibility field's altitude-maximum meaning and the JPL quantity mapping.
- [x] Pass focused event tests, full Node tests/coverage, existing type/UX/documentation gates and source-bound staged browser validation.
- [x] Inspect narrow/wide selected-facts output and obtain independent read-only review.

The [event quantity report](../../EVENT_QUANTITIES_20261104.md) records the
bounded correction, current artifact, independent diagnostic differences and
the explicitly failed EOP clock controls. Broader observer/event and production
qualification remains pending.

Use `node --test tests/web/skyEvents.test.mjs`, existing Node coverage commands,
`python tools/typecheck_web.py`, `python tools/validate_ux_contract.py`,
`python tools/validate_docs.py`, `python tools/validate_sdlc.py` and the existing
staged browser validator. Check the actual available typecheck command before
execution. Keep evidence bound to the new staged bytes and preserve prior
receipts. Rollback only the presentation/docs/test hunks; never change solver
semantics to make mismatched reference events agree.
