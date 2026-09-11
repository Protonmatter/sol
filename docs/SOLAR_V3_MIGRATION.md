# Solar v3: local migration and evidence boundaries

This document describes the September 11, 2026 source implementation. Production activation, an actual old-client population transition, and registered-image accuracy qualification have **not** been performed. No commit, push or deployment is part of this work.

## Live and historical boundaries

The canonical live schema is `docs/solar-state-snapshot-v3.schema.json`. `apps/web/js/solarSchema.js` contains an equality-tested generated copy. `parseSolarSnapshot(raw)` performs strict JSON parsing, closed-schema and semantic validation, then recursive freezing. `assertSolarSnapshot(parsed)` applies the same validation and freezing after a structured clone. It does not trust a worker merely because the worker returned an object. Rust CLI replay and Python `validate_snapshot.py` use the same live contract and the shared mutation corpus.

Historical v2 is frozen in `tests/fixtures/historical/solar-v2.json`, with the prior schema unchanged at `docs/solar-state-snapshot-v2.schema.json`. Historical Python validation is explicit:

```powershell
python tools/validate_snapshot_v2.py tests/fixtures/historical/solar-v2.json
cargo run -p solar-cli -- replay --historical-v2 --snapshot tests/fixtures/historical/solar-v2.json --out <historical-output-directory>
```

The copy is named `historical-state-v2.json`; it never replaces `latest-state.json`. Without `--historical-v2`, live replay rejects v2. Historical browser guards are test-only under `tests/fixtures/historical` and are not imported by live modules. This is historical inspection, not an adapter or a resumption of a v2 covariance model. Invalid replay input leaves the previous output intact; replay retains the existing per-file atomic staging contract, not a new multi-file transaction guarantee.

## Scientific claims and units

`uncertainty.activity` is a scalar, nonnegative f64 variance in `activity_index_squared`, labelled `freshness_damped_diagonal_proxy.v1` and `illustrative`. Its epoch equals `run.time_seconds`; an optional analysis epoch cannot be later. The default `q=0` is disabled. Positive `--process-noise-per-day` is illustrative process noise, not an empirical uncertainty calibration. Given prior variance 0.1 and q=0.02/day, two model days produce 0.14, independently of the partition into partial transport calls. The CLI default prior is 0.04, so the same two-day CLI example yields 0.08. Noisy forecast changes no magnetic field or spatial score. Rejected stale or unattributable observations do not create a scalar analysis.

The old `fields.br_variance_normalized` is absent. `uncertainty.magnetic.status` is `unavailable`; scalar F10.7-derived activity cannot identify a magnetic covariance. `fields.confidence` retains a heuristic model score and explicitly disclaims probability and calibration. Existing physical normalization remains unchanged.

`active_regions[].birth` records the immutable birth time, latitude and longitude. `model_position` records the current model anchor and exact snapshot epoch. For elapsed days d and birth latitude b:

```text
longitude = mod360(birth_longitude +
  [14.713 - 2.396*sin(b)^2 - 1.787*sin(b)^4 - 14.1844] * d)
latitude = birth_latitude
```

Coordinates are west-positive Carrington. Only the 14.1844 degree/day reference is implemented; constructor, serializer and intake reject another value. The independent reference cases at birth longitude 359 degrees, elapsed two days and latitudes 0, -30 and 60 degrees yield 0.0572, 358.635825 and 354.452825 degrees. A diffusion-disabled isolated bipole centroid test uses a predeclared one-degree longitudinal cell tolerance. This is a reduced transport-model test, not observed feature-tracking accuracy. Model time and uncertainty timestamps use round-trippable numeric serialization, avoiding disagreements at fractional timesteps.

## Separate image evidence, currently unavailable for compositing

`docs/solar-image-registration-v1.schema.json` defines closed bounded metadata: source and SHA-256 asset identity; capture UTC, JD TT and declared time precision; TT-minus-UTC; L0, B0 and P angles; disk center/radius and image dimensions; west-positive longitude and explicit image-axis/P-angle conventions. JS `assessSolarImageRegistration` and Python `assess_registration` compare that metadata to an independently supplied selected-asset descriptor and the snapshot epoch. They check finite bounds, a real ISO UTC calendar instant, disk containment and consistency of UTC-to-TT conversion and model time within declared precision (0.001–1 second).

The currently supported UTC domain is `[2017-01-01T00:00:00Z, 2027-01-01T00:00:00Z)`, with TT-minus-UTC fixed at 69.184 seconds. This combines TT-minus-TAI=32.184 seconds with the 37-second TAI-minus-UTC offset and the no-leap-second end-of-2026 announcement in [IERS Bulletin C72](https://datacenter.iers.org/data/html/bulletinc-072.html). The guard does not extrapolate beyond this documented domain or implement a historical leap-second table. A leap-second timestamp itself is not accepted by this simplified millisecond-or-coarser parser.

A positive result is named `structure_epoch_compatible`, **not registered or calibrated**, and still has `compositing_permitted: false`. Selected asset descriptors are compared, not independently fetched or hashed by this pure guard. A future caller must derive identity from verified image bytes and supply actual validated image-geometry evidence and a tested transform before compositing can be enabled. All errors return `unavailable` with a reason and preserve the same false permission. The shared registration corpus is synthetic test geometry only; it contains no claimed real-image registration.

## Deterministic preview data

The migrated data was generated from the source model, not by relabelling historical v2 files:

```powershell
python tools/generate_fixture_snapshot.py --out apps/web/data/latest-state.json --observations-out tests/fixtures/live-swpc-normalized.json --seed 42
python tools/generate_series.py --base apps/web/data/latest-state.json --out-dir apps/web/data/series --frames 11 --seed 42 --months-span 132
```

No live cache was requested. The latest snapshot uses the committed `tests/swpc_scn26_21/rtsw_mag_1m_new.json` and `rtsw_wind_1m_new.json` fixture context, not current observed data. Series frames are explicitly synthetic cycle examples, not a continuous observed trajectory. The snapshot grid is 72 by 36; the 11-frame synthetic series grid is 36 by 18. Both use age-zero producer anchors. Two fresh Windows ARM64 / Python 3.14.3 runs matched all 13 live preview files (latest snapshot, eleven frames and series manifest) byte-for-byte.

SHA-256 identities at verification:

| Input or generator | SHA-256 |
| --- | --- |
| `tools/generate_fixture_snapshot.py` | `e6b48ab03f8b3fe8feefc21fb4e0affced52aede3b32acc9b3c1d67e37c4477f` |
| `tools/generate_series.py` | `b289ad7b5c9ad18babfce30a169348ba8439b63c1a2550508ad42b0ce16caa0b` |
| `rtsw_mag_1m_new.json` | `b26fca1e66547ad39297c0342ee51530268ef67f14da519fa8946d73c0effcf1` |
| `rtsw_wind_1m_new.json` | `551ae5c1aa1e7e47ac0ec371b816ad109e7eae5c11f5e8dc35956899e6724e12` |
| Frozen historical `solar-v2.json` | `5ebf47543242e698833a8451738906bee5ddff982b594e539cc63c6bdee79f36` |

This solar fixture reproducibility check is distinct from the moon generator's canonical Linux x86_64 qualification; it does not resolve that separately recorded pending gate.

## Validation and rollback

Run `cargo test --workspace`, `cargo clippy -p solar-core -p solar-cli --all-targets -- -D warnings`, `python -m unittest discover -s tests/python -v`, `node --test tests/web/solarContract.test.mjs tests/web/solarRegistration.test.mjs tests/web/solarPublication.test.mjs`, `python tools/typecheck_web.py`, and `python tools/validate_web_static.py --root apps/web`. The task report records observed results and unrelated concurrent-work limitations. The shared live snapshot corpus is exercised in Rust/Python/Node; the separate registration corpus is exercised in Python/Node. Browser physical evolution has not been introduced.

Do not publish mixed v2/v3 assets. Rollback, if a future release is authorized, must select a complete previously verified immutable application/data artifact through the delivery protocol. Do not change a schema string or overwrite a live v3 alias with historical v2 data. Source tests do not prove service-worker population transition, real image registration, visual/manual astronomical accuracy, forecast calibration or operational authorization.
