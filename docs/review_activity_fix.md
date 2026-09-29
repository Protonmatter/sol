# Review correction: activity evidence and daily stage

The Python daily producer now emits `observed_context.activity_observation` separately
from the illustrative `activity_index` used to choose fixture density. The latter
retains its existing 0.9 fallback when no proxy is present; that fallback is not an
observation and cannot reduce analysis uncertainty.

The additive descriptor contains `status` (`available` or `unavailable`), a nullable
`value`, and an ordered list of `{id, value}` contributors. Eligible sources are
solar-region counts, sunspot-report counts, recent flare counts, and F10.7 (daily
before the existing monthly fallback). Inputs must have attributable provenance,
known nonfuture timestamps within their freshness limit, and not be explicitly
inactive. Count contributions use only qualifying fresh rows, not older history in
the same payload. RTSW wind/magnetic context, Kp, and X-ray flux are not activity
contributors. Contributions and their mean are rounded to six decimal places;
the scalar remains an illustrative proxy, not an empirically calibrated quantity.

Rust CLI assimilation requires a nonempty available descriptor, supported unique
contributor identities, matching admitted observation frames, known fresh ages,
and a value consistent with the mean of contributor values. Unavailable or malformed
descriptors preserve the synthetic prior and variance and explain why. The accepted
report and its observed context are retained unchanged for audit.

Existing historical snapshots remain readable. Older Python reports with count
metadata but no descriptor can be assimilated only when all of their actual proxy
contributors have attributable frames and known fresh ages. A missing proxy does
not inherit wind/magnetic freshness. Ambiguous historical daily/monthly F10.7
attribution is withheld instead of guessed. Existing native single-signal and
historical simple observation reports retain their prior explicit scalar contract.
No committed historical bundle was regenerated or relabelled.

Daily fixture `learning.cycle_stage` now follows the same instantaneous thresholds
as Rust and the browser: below 0.45 is solar minimum, 0.45 through below 0.75 is
rising or declining phase, and 0.75 onward is solar maximum. This does not alter
phase-based synthetic cycle-series labels or claim that a scalar determines an
observed solar-cycle phase. Literal threshold cases are shared in
`tests/fixtures/activity-stage-cases.json`.

Validation commands:

```text
python -m unittest discover -s tests/python -p test_activity_observation.py -v
python -m unittest discover -s tests/python -p test_bundle_observation_provenance.py -v
python -m unittest discover -s tests/python -p test_future_freshness.py -v
cargo test -p solar-cli --locked
```

CI builds the native CLI and sets `SOL_REQUIRE_CLI=1` before the Python activity
suite, so its producer-to-CLI checks cannot silently skip. The round-trip uses
explicit fresh, missing and stale synthetic activity reports; it checks mode,
activity, variance, shared snapshot admission and research-only readiness after
48 transport steps. It does not require the app's historical report to qualify
for new assimilation.

The missing-proxy end-to-end reproduction now keeps a 0.2 prior at 0.2 with variance
0.04 and mode Synthetic, where the earlier implementation emitted 0.76, variance
approximately 0.008, and mode Assimilation. These are offline synthetic regression
results, not upstream or independent scientific qualification.
