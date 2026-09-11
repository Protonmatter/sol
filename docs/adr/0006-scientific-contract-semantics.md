# ADR 0006: Scientific contract semantics

Status: accepted for local source implementation and preview; production activation remains held.

## Solar snapshot v3

The live boundary is exclusively `solar-state-snapshot.v3`. It is a closed schema shared by the native producer, CLI replay, Python validation and browser intake. Historical v2 data is validated and copied only through explicitly named historical tools. No browser fallback silently converts a v2 physical claim into a v3 claim.

Activity uncertainty is one scalar illustrative variance in `activity_index_squared`. It is not a spatial magnetic covariance. Default process noise is zero and is labelled disabled. A positive configured rate is illustrative, not calibrated: the forecast is `P(t) = P(anchor) + q_per_day * (t-anchor)/86400`. Analysis resets that scalar anchor; partial transport calls do not reset it. Zero prior and observation variance gives zero gain, not a fabricated epsilon variance.

The serialized spatial `confidence` layer is a heuristic model score, explicitly not a probability or calibrated uncertainty. Scalar assimilation does not inflate it. Magnetic uncertainty is explicitly unavailable. The former per-cell `br_variance_normalized` is not emitted in v3.

Each region has immutable `birth` metadata and a producer-derived `model_position` at exactly the snapshot model time. Longitude is west-positive Carrington, using the supported 14.1844 degree/day reference only. The current anchor uses the existing differential rotation law minus that reference; the browser does not evolve region physics. Latitude remains the birth latitude. A current anchor is a model location, not an observed feature match.

`solar-image-registration.v1` is separate evidence, not a field in the solar snapshot. Its current guard checks bounded structure, selected asset identity and capture/model epoch compatibility. Every result has `compositing_permitted: false`: numeric consistency does not establish measured image geometry, calibration or registration accuracy. Missing, stale or inconsistent evidence produces an explicit unavailable result. See [the migration and validation record](../SOLAR_V3_MIGRATION.md).

## Consequences

Live v2 clients and data must not be mixed with v3 producers. A future release requires one coherent immutable artifact and the delivery transition gates, not merely a schema-name replacement. Historical bytes remain inspectable without replacing the live alias. Neither this ADR nor the tests establish operational forecast calibration, astronomical image registration accuracy, or production migration success.

Ephemeris contract decisions are documented separately in `docs/EPHEMERIS_V3.md`; their owner may append the corresponding decision record here.

## Ephemeris snapshot v3

Live ephemeris accepts only `ephemeris-snapshot.v3`; v2 readers and archived fixtures remain explicitly historical. Finite bodies carry separate positive geocentric and observer ranges. Angular size uses observer range, parallax uses geocentric range, and Moon phase pairs geocentric directions and ranges. Catalogue-star null ranges explicitly mean the infinite-distance approximation, not measured distance.

The observer mean-solar event window is half-open `[start,end)`, not civil midnight. An unavailable numerical peak is failed/unknown, not proof of no occurrence; genuinely absent and uncomputed events have separate statuses. Gregorian years 1–9999 are computational admission bounds, not an accuracy envelope. Historical times explicitly use a degraded UT1 proxy. Hybrid event/star augmentation requires exact terrestrial observer and instantaneous epoch binding, not just the same day, and never replaces the server's source time/EOP metadata.

No current registry entry independently qualifies apparent-place, range or event accuracy. The eight immutable TOP2013 vector records are source-theory parity at recorded samples only; they cannot certify a broad time span or a remote provider. Worker and raw-ABI bounds, strict request/result intake, inline recipient-specific consent, and explicit last-valid/error presentation preserve these semantics when work is cancelled or unavailable. See [Ephemeris v3](../EPHEMERIS_V3.md) for limits and evidence qualifications.
