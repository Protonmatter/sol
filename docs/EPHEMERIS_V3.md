# Ephemeris v3 — local preview contract

This is the live contract in the reviewed local tree, not a production release claim. The normative shape is `ephemeris-snapshot-v3.schema.json`. Historical v2 documents and their validator remain frozen; live providers reject other versions instead of converting missing information.

## Ranges and frames

Every Solar System body has positive finite `geocentric_range_km` and `observer_range_km`. The native engine subtracts the terrestrial observer vector in the same equatorial frame as its apparent geocentric direction. The server uses the distinct geocentric and topocentric Horizons range queries. Angular size uses observer range; horizontal parallax uses geocentric range. The browser lunar phase calculation pairs geocentric RA/Dec and geocentric ranges for both Sun and Moon. This is not a blind field rename.

Catalogue stars use both ranges `null` and `range_approximation: infinite_catalogue_star`; annual parallax and aberration are omitted. This is an explicit approximation, not a measured infinite distance.

`above_horizon` still means `alt_refracted_deg > 0`. My Sky grouping and counts use the geometric `alt_deg > 0` instead; zero belongs at/below the geometric horizon. Neither implies visibility through terrain, weather or light pollution.

## Event window and availability

`events_window` declares `convention: observer_local_mean_solar_day`, `time_scale: UTC`, `interval: [start,end)`. With east-positive longitude, start is `floor(jd_utc - 0.5 + longitude/360) + 0.5 - longitude/360`; end is exactly start + 1. This is not civil midnight in an IANA time zone. Browser event clock labels use the selected device civil timezone or UTC, explicitly separately from this window.

Each `body.events.rise`, `.transit`, and `.set` contains `jd`, `calculation_status`, `occurrence_status`, and `source: {engine,version}`. Transit additionally has `altitude_deg`, null exactly when its time is null.

| Time | Calculation | Occurrence | Meaning |
| --- | --- | --- | --- |
| finite in [start,end) | calculated | occurs | Bounded event is available |
| null | calculated | none_in_window | Search found no occurrence in this window |
| null | not_calculated | unknown | Provider did not calculate it |
| null | failed | unknown | Numerical ambiguity prevents assigning an event safely |

The server emits not_calculated/unknown. Native culmination search retains the P05 subsecond/adjacent-float boundary checks and refuses to fabricate an in-window event from an equal-valued midnight plateau. Such bounded ambiguity is failed/unknown, never proof of non-occurrence. Browser text keeps the three null reasons distinct.

Hybrid backfill requires both snapshots to validate as v3 and match exact terrestrial observer, window, and instantaneous epoch. Epoch equality admits only the inclusive serialization/binary64 allowance of 2^-29 day (about 0.161 milliseconds): four ulps at a modern JD, two near the upper supported bound. This is not an event-window allowance. The merger appends complete instantaneous star bodies as well as daily events, so different instants within one mean-solar day are rejected. It clones inputs, retains local per-event source metadata, and validates the composite again. Server instantaneous time/EOP metadata is not overwritten by local values; different provider EOP reductions at the same requested instant are allowed.

Remote intake independently binds each strictly validated response to the exact requested terrestrial latitude, longitude and elevation and to the requested Unix-derived JD within that same small epoch allowance, before augmentation or publication. Internally consistent stale or misassociated responses are not accepted merely because they share the requested local day.

## Calendar and boundaries

My Sky accepts proleptic Gregorian years 1–9999: `-62135596800 <= unix < 253402300800`, equivalently `1721425.5 <= jd_utc < 5373484.5`. Observer limits are latitude [-90,90], longitude [-360,360], and elevation [-12000,100000] metres. Unsupported/nonfinite requests fail before calculation or remote I/O; they are not clamped. Individual Horizons targets can have narrower coverage and fail visibly.

`time.calendar` is `proleptic_gregorian`; `input_time_semantics` is `utc` where TAI is supported, or `historical_ut1_proxy` with null TAI and degraded `pre_utc_ut1_proxy` metadata. These historical labels do not claim modern UTC existed in antiquity. The server uses explicit numeric JD TLIST, JD input type, UT, Gregorian calendar and fractional seconds; returned geocentric and topocentric epochs are verified before publication. Cache identity preserves exact input floats, including fractional seconds and observer coordinates.

## Evidence, not an inferred accuracy span

`apps/web/data/accuracy-evidence.json` conforms to `accuracy-evidence-v1.schema.json`. Each record identifies a body, quantity, exact tested epoch set, method, observer domain, immutable source identity and measured error. The current eight records are TOP2013 source-theory parity at ±5000 Julian years for Jupiter, Saturn, Uranus and Neptune, traced to baseline commit `25efcd528c13bb46a0caf364b37b98801232e7be` and the literal vectors in `top2013.rs`. Their metric is relative vector-norm error scaled to arcseconds, not independent pointing accuracy. The original `truth.js` generator is absent; no stronger provenance is claimed.

No immutable raw reference for the proposed new Moon range counterexample was available. It is deliberately not treated as a qualification fixture. Independent vector-triangle tests establish internal frame/range correctness, not external accuracy. Snapshot evidence therefore remains unvalidated, and the UI does not convert source parity into an accuracy claim between sample epochs or for topocentric sky quantities. Existing 10 arcsecond general, 12 arcsecond Moon and 10 arcsecond syzygy regression thresholds remain unchanged; network checks were not run in this task.

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

Full local snapshots (including event solving) and finite-body trajectories run in a module worker. The `sol-worker.v1` envelope binds engine `ephemeris`, schema `ephemeris-snapshot.v3`, ABI 1, release identity and generation. The client has one active and one latest pending job; stale results cannot publish, navigation disposes the worker, and a 10-second wall deadline terminates uncooperative synchronous work. Snapshot results are schema-validated and bound to the original observer/epoch on the main side. Parsed sparse arrays are rejected. System rendering owns a separate fixed-nine-body fast path; its separate measured performance exception is not a Sky exception.

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
python tools/validate_ephemeris_snapshot.py <live-v3.json>
python tools/validate_ephemeris_snapshot.py --historical-v2 <unchanged-archived-v2.json>
```

The shared positive/negative corpus is `tests/fixtures/ephemeris-v3-corpus.json`. It is synthetic/native-model contract evidence, not JPL truth. Fresh native snapshots at modern, historical and exact-pole observer inputs pass through both live readers in the native integration test. Historical v2 browser validation is isolated in `ephemerisContractV2.js` and never statically imported by live providers.
