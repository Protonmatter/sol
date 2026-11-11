# Ephemeris v3 — local preview contract

This is the live contract in the reviewed local tree, not a production release claim. The normative shape is `ephemeris-snapshot-v3.schema.json`. Historical v2 documents and their validator remain frozen; live providers reject other versions instead of converting missing information.

## Ranges and frames

Every Solar System body has positive finite `geocentric_range_km` and `observer_range_km`. The native engine subtracts the terrestrial observer vector in the same equatorial frame as its apparent geocentric direction. The server uses the distinct geocentric and topocentric Horizons range queries. Angular size uses observer range; horizontal parallax uses geocentric range. The browser lunar phase calculation pairs geocentric RA/Dec and geocentric ranges for both Sun and Moon. This is not a blind field rename.

Catalogue stars use both ranges `null` and `range_approximation: infinite_catalogue_star`; annual parallax and aberration are omitted. This is an explicit approximation, not a measured infinite distance.

The native Moon apparent range now includes Earth's heliocentric translation
between emission and reception. The native observer range still subtracts the
terrestrial vector along the apparent direction; it does not independently solve
site-specific un-aberrated light time. The [retained range regression](LUNAR_RANGE_20261103.md)
measures this approximation at its exact samples. It is not a full barycentric,
relativistic or navigation model.

`above_horizon` still means `alt_refracted_deg > 0`. My Sky grouping and counts use the geometric `alt_deg > 0` instead; zero belongs at/below the geometric horizon. Neither implies visibility through terrain, weather or light pollution.

## Event window and availability

`events_window` declares `convention: observer_local_mean_solar_day`, `time_scale: UTC`, `interval: [start,end)`. With east-positive longitude, start is `floor(jd_utc - 0.5 + longitude/360) + 0.5 - longitude/360`; end is exactly start + 1. This is not civil midnight in an IANA time zone. Browser event clock labels use the selected device civil timezone or UTC, explicitly separately from this window.

Each `body.events.rise`, `.transit`, and `.set` contains `jd`, `calculation_status`, `occurrence_status`, and `source: {engine,version}`. Transit additionally has `altitude_deg`, null exactly when its time is null.

The compatible `transit` field records the earliest genuine geometric
altitude maximum in the declared window; the visible label is **peak altitude**.
Its timestamp and altitude follow the accepted AC-08 contract. A meridian
crossing is a different event: the [JPL Horizons event definitions](https://ssd.jpl.nasa.gov/horizons/manual.html#understanding-rise-elevation-max-transit-and-set-indicators)
use separate `e` (maximum elevation) and `t` (meridian transit) indicators.
Independent comparisons must match this field to the altitude maximum quantity.
The API key is retained for compatibility; no meridian-crossing event is
added to v3 by this presentation correction.

| Time | Calculation | Occurrence | Meaning |
| --- | --- | --- | --- |
| finite in [start,end) | calculated | occurs | Bounded event is available |
| null | calculated | none_in_window | Search found no occurrence in this window |
| null | not_calculated | unknown | Provider did not calculate it |
| null | failed | unknown | Numerical ambiguity prevents assigning an event safely |

The server emits not_calculated/unknown. Native culmination search retains the P05 subsecond/adjacent-float boundary checks and refuses to fabricate an in-window event from an equal-valued midnight plateau. Such bounded ambiguity is failed/unknown, never proof of non-occurrence. Browser text keeps the three null reasons distinct.

Native rise/set search also refines otherwise missed crossing-margin maxima
and minima between its ten-minute samples. It requires a sign change rather
than an isolated zero-valued tangency, preserves exact sampled boundary roots,
and retains the earliest event of each direction in `[start,end)`. This is
numerical convergence within the standard-threshold model; independent
physical event accuracy remains unqualified. See the
[grazing-event regressions and limits](GRAZING_EVENTS_20261104.md).

The [fine Sun/Moon reference packet](FINE_EVENTS_20261104.md) adds 32 passing
selected configured-model event comparisons at a fixed 10-second control. It uses
independent airless elevation/range for the standard threshold and retains full
two-second conditional sampled-unimodal peak intervals. Raw e/t markers do not
sharpen those intervals. The cases become native/offline-reference regressions;
they do not promote UI accuracy status or independently certify continuous bounds,
earlier unsampled events, whole-day absence or physical horizon visibility.

Hybrid backfill requires both snapshots to validate as v3 and match exact terrestrial observer, window, and instantaneous epoch. Epoch equality admits only the inclusive serialization/binary64 allowance of 2^-29 day (about 0.161 milliseconds): four ulps at a modern JD, two near the upper supported bound. This is not an event-window allowance. The merger appends complete instantaneous star bodies as well as daily events, so different instants within one mean-solar day are rejected. It clones inputs, retains local per-event source metadata, and validates the composite again. Server instantaneous time/EOP metadata is not overwritten by local values; different provider EOP reductions at the same requested instant are allowed.

Remote intake independently binds each strictly validated response to the exact requested terrestrial latitude, longitude and elevation and to the requested Unix-derived JD within that same small epoch allowance, before augmentation or publication. Internally consistent stale or misassociated responses are not accepted merely because they share the requested local day.

## Calendar and boundaries

The [matched-TT geocentric apparent comparison](APPARENT_EPOCHS_20261104.md)
retains the earlier normal-profile baseline of27 failures among144 directions
over16 recorded epochs. Sky apparent
planets currently use VSOP2013 for all targets; System geometric giants use
TOP2013. Independent apparent/geometric claims remain distinct. Neither this
sampling nor the supported input range qualifies a continuous precision span.

The approved precision target is complete UTC years1900–2200, ending just before
`2201-01-01T00:00:00Z`. Outside that target, years1–9999 remain approximate
exploration. The [dense precision follow-up](PRECISION_WINDOW_20261104.md)
uses the current larger VSOP tier and keeps TOP/ELP, equations and budgets
unchanged. Sky/System labels use the committed rendered epoch and continue to
say qualification is pending inside the target. A failed request cannot label
an older retained result with the requested new epoch. Neither this policy nor
a passing discrete model sweep promotes provider/evidence status.

My Sky accepts proleptic Gregorian years 1–9999: `-62135596800 <= unix < 253402300800`, equivalently `1721425.5 <= jd_utc < 5373484.5`. Observer limits are latitude [-90,90], longitude [-360,360], and elevation [-12000,100000] metres. Unsupported/nonfinite requests fail before calculation or remote I/O; they are not clamped. Individual Horizons targets can have narrower coverage and fail visibly.

`time.calendar` is `proleptic_gregorian`; `input_time_semantics` is `utc` for the supported modern clock, `historical_ut1_proxy` with null TAI and degraded `pre_utc_ut1_proxy` metadata before 1972, or `future_nominal_utc` beyond the bundled EOP endpoint. These historical labels do not claim modern UTC existed in antiquity. Future nominal UTC holds the last tabulated leap offset as an explicit assumption, not a prediction of future UTC or leap seconds; its numeric TAI/TT fields follow that convention. The server uses explicit numeric JD TLIST, JD input type, UT, Gregorian calendar and fractional seconds; returned geocentric and topocentric epochs are verified before publication. Cache identity preserves exact input floats, including fractional seconds and observer coordinates.

The native [Earth-orientation history](EOP_HISTORY_20261104.md) uses the pinned
USNO Bulletin A capture with 20,031 complete daily rows, from1973-01-02 through
2027-11-05 at00:00 UTC. Observed knots end2026-10-29; contributing prediction
rows make interpolation predicted. Four-point interpolation operates on
continuous UT1−TAI across leap seconds. Outside the admitted endpoints, Earth
orientation remains explicitly degraded; the date-only source tail supplies
no additional coverage. Reported DUT1 uncertainty propagates the published
formal errors, excluding interpolation and unmodeled subdaily terms. It is
not calibrated total uncertainty or a1900–2200 observer-accuracy guarantee.

Native ΔT is calculated directly as `TAI−UTC +32.184−DUT1` where TAI exists.
Live v3 readers retain the legacy50-microsecond JD-derived check and also
accept that atomic-offset identity with a1ns serialization allowance plus
scalar floating roundoff, capped at50 microseconds. The other clock relations
are still required at their existing2e-9-day limits. Large binary64 JD
construction can otherwise reject a consistent small offset. Frozen v2
readers retain their original policy.

Native periodic longitude, sidereal time and right ascension serialize at
binary64 round-trip precision. A value just below360° must stay below360°
after parsing; fixed decimal places can violate this open boundary. The
serialization preserves the computed value without clamping or changing
the coordinate model.

The owning coordinate normalization also maps an exact rounded360° result
from binary64 remainder to the equivalent0° meridian. This handles sufficiently
small negative inputs before serialization and preserves the adjacent value
strictly below360°. Tiny/subnormal longitude and coordinate controls cover
this separate endpoint case.

## Evidence, not an inferred accuracy span

The [geometric-vector corpus](GEOMETRIC_VECTORS_20261104.md) compares 160 DE441
vectors at 16 dynamical epochs from years 1–9999. The current model fails 29
samples at the predeclared 10-arcsecond-equivalent full-vector budget. This is
not apparent-place/event evidence and changes no UI accuracy status. Claims
that full-theory deep-time precision applied to this truncated tier are withdrawn.

`apps/web/data/accuracy-evidence.json` conforms to `accuracy-evidence-v1.schema.json`. Each record identifies a body, quantity, exact tested epoch set, method, observer domain, immutable source identity and measured error. The current eight records are TOP2013 source-theory parity at ±5000 Julian years for Jupiter, Saturn, Uranus and Neptune, traced to upstream commit `2f679a1f698b4f20f9579d94da24af51559458ed`, its exact TOP2013 08-big source and `top2k_theory` element function. The hash-bound function is evaluated only for the fixed eight samples, then independently converted to Cartesian vectors rounded to eight decimals. The validator checks both current Rust literals and registry vectors against those values. Their metric is relative vector-norm error scaled to arcseconds, not independent pointing accuracy. The historical normal-tier catalogue and its archived Rust-file binding remain preserved in fixtures. Existing locked Node/TypeScript tooling is required for current source-reference validation; no acquisition occurs.

The previously quoted Moon range counterexample still lacks its original raw reference and is not used as a fixture. A fresh, separate [72-response range acquisition](../tests/fixtures/horizons-ranges-20261103/README.md) now supports independent sampled Q20 regressions for geocentric and observer ranges at four instants/sites. Its predeclared 10 ppm/1 km budget caught and verifies the lunar Earth-motion correction. It is not in the UI accuracy registry and establishes no continuous range or event envelope. Snapshot accuracy status remains unvalidated. Existing 10 arcsecond general, 12 arcsecond Moon and 10 arcsecond syzygy pointing thresholds remain unchanged.

The separate [2026-11-03 observer reference pack](../tests/fixtures/horizons-observer-20261103/README.md)
retains 36 raw Horizons responses from the existing four-site/nine-body helper.
It supplies a repeatable offline regression for apparent RA/Dec, airless alt/az
and DUT1 at four instants on one UTC day. It contains no ranges, events or
heliocentric vectors and is not part of the UI accuracy registry. The
[acquisition and validation report](ASTRONOMY_REFERENCE_20261103.md) records its
hashes, measured residuals and limits. This adds independent sampled pointing
evidence without qualifying a continuous accuracy span or changing reader policy.

The current live readers reject a provider's self-certified `validated_at_recorded_samples`
flag: this registry has no independent apparent-place, range, or event reference records.
Admitting that status later requires adding immutable, scoped evidence and updating both
reader policies and the UI evidence selector together; nonempty arbitrary reference IDs
are not proof of validation. The current selector never returns validated status, even
for a caller-supplied independent_reference record with an apparently passing result.
It displays source-parity references only when their required reference/epoch metadata
and finite measurement are present and the value is strictly below the recorded threshold.
Malformed or failed evidence is withheld; this is not browser-side cryptographic acceptance
of an independent registry. The offline evidence validator remains responsible for checking
the committed source identities and numerical reproductions.

## My Sky execution and privacy boundary

Full local snapshots (including event solving) and finite-body trajectories run in a module worker. The `sol-worker.v1` envelope binds engine `ephemeris`, schema `ephemeris-snapshot.v3`, ABI 1, release identity and generation. The client has one active and one latest pending job; stale results cannot publish and navigation disposes the worker. Sky and System first prepare their module/engine under a separate 60-second initialization bound, using an identity-bound `initialize`/`ready` exchange before calculation admission. The unchanged 10-second calculation wall deadline then terminates uncooperative synchronous work. An already prepared worker can serve the next accepted request without repeated initialization. Cancellation terminates pending preparation as well as calculation; late readiness/results and cleared timers cannot affect a newer job or phase. Arrival-time monotonic checks reject responses at or beyond their phase deadline even when a timer callback is delayed. This does not promise a ten-second total first-download time. Snapshot results are schema-validated and bound to the original observer/epoch on the main side. Parsed sparse arrays are rejected. System rendering owns a separate fixed-nine-body fast path; its separate measured performance exception is not a Sky exception.

Trajectory admission is identical in JS and the raw Rust ABI: body index 0–8, 2–257 samples, finite nonzero step with magnitude at most 3600 seconds, aggregate span at most 172800 seconds, and supported observer/start/end epochs. No clamping, modulo-body selection or omitted samples are permitted. Capacity or numerical failures return typed errors. Apparent altitude is serialized at round-trip precision to preserve the `up` predicate.

The default observer is explicitly New York **example location**, not detected location. Device geolocation is only requested by its button. Device civil input is not the observer's timezone: users may select UTC, nonexistent local times are rejected, and repeated daylight-saving times follow the browser's earlier-occurrence convention. Search/filter controls use stable native object buttons; selected facts survive filtering and updates. Geometric altitude strictly greater than zero determines grouping; refracted altitude does not override this. Daylight, weather, terrain, extinction and glare limit visibility independently of the geometric group.

Remote consent is session-only, inline and recipient-specific. The displayed Sol recipient sends observer/time onward to JPL Horizons. Denial sends zero requests, including health checks. A changed endpoint invalidates consent, including a change while the consent panel is open. Revocation aborts current remote work; failed requests retain the last validated snapshot with an explicit error. Switching to local is an explicit action, never a hidden fallback. Successfully validated remote positions may remain usable if optional local augmentation fails; uncomputed events remain visibly uncomputed.

Share and export first preview the exact validated snapshot's latitude, longitude, elevation and epoch. Only a second explicit action copies a link or downloads JSON. Links preserve signed/fractional values and elevation without rounding; exports retain the immutable snapshot and provenance. Browser-local observer preferences remain stored on that device; they do not authorize any remote request.

The optional provider limits four serial upstream jobs plus eight queued exact identities, a 20-second deadline including queue residence, 5-second cumulative per-call deadline, 1 MiB per upstream response, and at most two attempts for transient idempotent reads. Coalesced subscribers cancel independently. HTTP admission is capped at 32 connections with 10-second socket inactivity; overload/deadline have typed responses. Disconnected subscribers release their interest; exceptions and logs never echo coordinates or upstream URLs. A transport blocked below Python (for example OS DNS resolution) cannot be forcibly killed by the stdlib thread coordinator: it retains one of the four slots until returning, while subscriber deadlines still expire and no replacement worker is spawned. This bounds amplification without claiming operating-system cancellation guarantees. Live upstream latency has not been qualified.

## Local verification commands

```text
cargo test --locked -p solar-ephemeris
python -m unittest discover -s tests/python -p test_ephemeris_v3.py
python -m unittest discover -s tests/python -p test_ephemeris_native_v3.py
node --test tests/web/ephemerisV3.test.mjs tests/web/skyEvents.test.mjs tests/web/accuracyEvidence.test.mjs
python tools/validate_accuracy_evidence.py
python tools/validate_ephemeris.py --reference-dir tests/fixtures/horizons-observer-20261103
python tools/validate_ranges.py
python tools/validate_ephemeris_snapshot.py <live-v3.json>
python tools/validate_ephemeris_snapshot.py --historical-v2 <unchanged-archived-v2.json>
```

The shared positive/negative corpus is `tests/fixtures/ephemeris-v3-corpus.json`. It is synthetic/native-model contract evidence, not JPL truth. Fresh native snapshots at modern, historical and exact-pole observer inputs pass through both live readers in the native integration test. Historical v2 browser validation is isolated in `ephemerisContractV2.js` and never statically imported by live providers.


### Optional constellation frame extension

On-device snapshots may provide `star_frame` version 1: a row-major
`j2000_to_true_equatorial` 3×3 rotation, source, UTC epoch, local apparent sidereal
time, and its complete observer record (including polar-motion-corrected latitude).
It applies the same precession and nutation reduction as engine catalogue stars.
Its UTC epoch and terrestrial observer must match the enclosing snapshot. The
browser also checks a finite proper orthonormal rotation before drawing figures.
Local augmentation preserves this frame separately from server body metadata.
Providers without the extension remain valid; constellation figures are unavailable
and the enabled-overlay readout states that limitation.

Optional `catalogue_ra_deg` and `catalogue_dec_deg` identify star J2000 catalogue
positions. Unambiguous constellation vertices within 0.001 degree (3.6 arcseconds,
allowing source rounding) use that star's already reduced geometric altitude and
azimuth, retaining its proper motion. Other vertices use the frame rotation with
zero proper motion; this limitation is displayed. Annual aberration and stellar
parallax remain omitted by this model. The matrix is a reduction mechanism, not
independent accuracy evidence.

The Sky dome, constellation figures, and `body_track` altitude samples use the
geometric horizon. The legacy snapshot `above_horizon` field retains its refracted
meaning; rise/set events retain their documented separate crossing thresholds.


### Future time convention

The client preserves all rapid/predicted EOP values through MJD 61714
(2027-11-05 00:00), inclusive. After that endpoint it emits `modeled_future`
Earth-orientation quality and `future_nominal_utc` input semantics. The final
37-second TAI−UTC value is held only to define a nominal calendar; TT remains
nominal TAI + 32.184 seconds. No future leap seconds or observed EOP are invented.

Let B be the last bundled EOP epoch and M(y) the existing approximate delta-T
curve. The future model is `D(J) = D(B) + M(year(J)) − M(year(B))`, where
`D(B) = 69.4003816` seconds comes from the final predicted EOP row. Then
`DUT1 = 37 + 32.184 − D(J)` and `UT1 = J + DUT1/86400`. This keeps the time-scale
values continuous at B while preserving the nominal TT mapping. The existing
plateau through 2035 and bridge to 2050 are application assumptions; later
terms follow the documented Espenak–Meeus curve. The endpoint offset is our
continuity convention, not a published correction or an accuracy qualification.
The model does not ensure derivative continuity or continuous polar motion.

Modeled DUT1 can exceed the real-UTC ±0.9-second steering range. Both live
validators permit that only with the explicit future semantics and modeled
quality; ordinary UTC retains the original range. Future
`dut1_uncertainty_seconds` is null: no defensible uncertainty bound is available.
Polar motion is omitted. Future snapshots remain degraded and independently
unvalidated; the displayed caveat names the assumption and absent uncertainty.
At 2200 the model delta-T is approximately 442 seconds; passing a snapshot
contract check establishes structural consistency, not astronomical accuracy.

The legacy field names `jd_utc`, `star_frame.jd_utc` and
`events_window.time_scale: UTC` identify the same requested calendar axis.
`time.input_time_semantics` governs the instantaneous fields. A wholly future
local-day window and its rise/set/transit labels use nominal UTC; they do not
promise the UTC that a future authority will realize.

The optional `events_window.future_nominal_utc_after_jd` separately identifies
the EOP endpoint after which event calculations use the nominal future model.
The client emits it whenever the event search can sample beyond that endpoint,
including its ten-minute bracketing support beyond the local-day window. A
snapshot at the endpoint can therefore retain instantaneous `utc`/`predicted`
metadata while warning that some event calculations use modeled UT1 with
unknown uncertainty and omitted polar motion. The marker must precede the end
of that extended calculation support. It is propagated with local event
augmentation without relabeling the server's instantaneous time/EOP metadata;
the Sky caveat also describes mixed windows. This optional extension preserves
compatibility with providers that do not supply these modeled local events.

The optional server does not translate its Horizons UT query into this nominal
future convention. It refuses dates after B with HTTP 422 `unsupported_time`,
before cache access, queued provider work or upstream I/O. The browser retains
its last validated snapshot, reports the unsupported time, and offers the
existing explicit **On your device** recovery. It does not silently substitute
local positions. Historical v2 artifacts and their validators remain frozen.
