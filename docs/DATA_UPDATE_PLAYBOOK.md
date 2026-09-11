# Data Update Playbook

How to refresh the repository's pinned datasets. The historical edition inventory below
is not a current upstream survey; verify primary sources during an authorized refresh.

> **Code and pin change together.** Any PR that touches a governed value must update both
> the implementation and its pin in `tools/validate_body_constants.py` (or the relevant
> regen source), and must cite the source edition in the PR description. The gates in
> [ACCURACY_CONTRACT.md](ACCURACY_CONTRACT.md) turn red on half-updates by design.

## 1. Historical source inventory (recorded 2026-07; current availability unverified)

| Domain | Recorded edition | Repository context |
| --- | --- | --- |
| Rotational elements | IAU WGCCRE 2015 report (Archinal et al. 2018; correction 2019), NAIF `pck00011.tpc` | Pinned implementation; do not infer there is no newer upstream report. |
| Planetary ephemerides (reference) | JPL DE440/DE441 | Preserve the actual captured reference/version; do not infer a current Horizons response. |
| Analytic planetary theories (on-device) | VSOP2013 (inner), TOP2013 (giants) | Repository theories; accuracy claims require dated matching evidence. |
| Lunar theory (on-device) | ELP-MPP02 | Repository theory; accuracy claims require dated matching evidence. |
| Major-moon elements | JPL Horizons osculating elements (fetched knots, committed) | Refresh extends the validity window; see §2.3. |
| ΔT / Earth orientation | measured IERS knots to 2026 + plateau | Refresh yearly-ish; gate requires ≥ 90 days of prediction coverage. |
| Surface textures | Solar System Scope set (CC-BY 4.0), NASA Blue Marble, historical NASA SDO/HMI assets | Committed/selected release bytes; deployment does not refresh them. Solar observed compositing remains disabled without validated geometry and provenance. |
| Star catalogue | Hipparcos | Regen-stable from committed pristine sources. |

The source edition, implementation, pinned constants, and supporting evidence must move
together. A historical source label is not proof of current upstream availability.

## 2. Update procedures

### 2.1 A new WGCCRE report or NAIF pck kernel appears

1. Fetch the new `pckXXXXX.tpc` from
   `https://naif.jpl.nasa.gov/pub/naif/generic_kernels/pck/` and diff the `BODYnnn_POLE_*`
   and `BODYnnn_PM` blocks against the pins in `tools/validate_body_constants.py`.
2. For each changed body, decide whether the new model is representable by the linear
   `poleAt()`/`rotationPhase()` in `apps/web/js/bodyData.js`:
   - constant + secular terms only → transcribe directly;
   - significant trigonometric series (Mars already; historically also the giant-planet
     satellites) → either implement the series or keep the older self-consistent constants
     **with a warning comment**, Mars-style. Never transcribe constants whose series you
     dropped.
3. Update `bodyData.js`, the pins, `rotationHours` (= 360/|Ẇ| in hours, sign of Ẇ), and the
   provenance comments — one PR, citing the kernel/report version.
4. `python tools/validate_body_constants.py` must pass; the browser smoke exercises the
   rendered spin path.

### 2.2 A new JPL development ephemeris (DE) appears

During an explicitly authorized reference refresh, capture the actual Horizons reference
identity and response. Do not assume a scheduled workflow ran or changed reference models.
If measured gates move, update the wording of the
accuracy claims (snapshot `accuracy` block, `docs/SOLAR_SYSTEM_SPEC.md` §8) to the new
measured numbers — claims follow measurements, never the reverse.

### 2.3 Extending the moons' validity window

1. **First edit the interval constants** `MODEL_START` / `MODEL_STOP` at the top of
   `tools/fetch_moons.py`, and move `DEFAULT_CHECK_START` / `DEFAULT_CHECK_STOP` and
   `FINE_CHECK_START` / `FINE_CHECK_STOP` with them — the check bounds sit half a knot inside
   each end so validation never lands on a training row. They are hard-coded, and re-running
   the fetch without moving them refetches the same window and leaves the shipped validity
   range exactly where it was (the UI would still hide every moon after the old end date).
2. With explicit networked-refresh authorization, run `python tools/fetch_moons.py` to fetch
   fresh Horizons element knots and validation vectors. Follow the qualification and
   source/output review procedure in [CANONICAL_GENERATION.md](CANONICAL_GENERATION.md)
   before running `python tools/generate_moons.py`. That writes **two** files and
   both must be committed: `apps/web/js/moons.js` (identity and the window constants) and
   `apps/web/js/moonelements.js` (the knots). Committing only the first ships a new window
   against old knots, which interpolates clamped and silently wrong.
3. **Use the qualified pinned Linux x86_64 image, not arbitrary Linux or WSL.** The observed
   Windows ARM64 and Linux ARM64 runs differ by one ULP at Oberon knot 320 and produce
   different serialized bytes. The exact cause has not been isolated. Canonical x86_64
   qualification is currently pending; noncanonical checks cannot authorize overwrites.
   `generation-manifest.json` binds source, generator, serialization and output identities;
   refresh those pins only after complete output review and two canonical runs.
4. Update the sha256 table in `tools/ephemeris-data/moons/README.md`, the accuracy figures
   quoted in `README.md` / `docs/STATUS.md` / `docs/DATA_SOURCES.md`, and the pinned check
   count in `tests/web/moons.test.mjs`.
5. Re-run `python tools/build_web.py` — the `?v=` token covers the regenerated modules and
   the dynamic import of `moonelements.js` carries it too.
6. `tools/validate_moons.py --require-canonical` gates canonical regen byte-identity and
   independent interpolation accuracy; plain `--check`/validation on another runtime is
   diagnostic comparison only. The
   shipped window constants (`MOON_VALID_MIN_JD`/`MAX_JD`) ride along automatically.

### 2.4 ΔT / EOP refresh

Update the measured IERS knots in `crates/solar-ephemeris/src/earth_orientation.rs` (the
file `tools/check_eop_freshness.py` inspects), with the near-present ΔT handling in that
same crate's `time.rs` (see the comment block there — do **not** revert to the E&M
polynomial, it runs ~6 s hot near-present), and keep `check_eop_freshness.py` green.

### 2.5 Textures

Texture acquisition requires separate network/asset-write authorization and review of
the exact outputs and notices. `fetched_unix` in legacy `textures/sun.jpg.json` is retrieval
time, not capture epoch or solar registration. It cannot authorize rotation correction,
observed/model pixel alignment, or a quantified image age. Observed solar compositing is
unavailable until actual image identity, capture epoch, geometry, and registration evidence
are supplied and validated. Deployment consumes previously selected immutable asset bytes;
it does not run a texture refresh. Publish changed assets only through the reviewed release
workflow and independently verify served identities.

### 2.6 Transactional solar feed and rolling delivery

The live local authority is now `apps/web/data/current.json`, selecting a fully validated
immutable `research-data-bundle.v1`. Acquisition has its own immutable source manifest and
pointer. Mutable root snapshot/status/series aliases remain explicit historical migration
inputs, not a read fallback. Use [TRANSACTIONAL_FEED.md](TRANSACTIONAL_FEED.md) for exact
commands, read-only v1 inventory, source clocks, failure retention, local pointer rollback,
and the future owned rolling-PR adapter. Default daily automation generates candidate
artifacts with `contents: read`; approval, merge, deployment, and served verification remain
separate. No live acquisition, PR write, production deployment, or hosted permission
qualification is claimed by the local fixture tests.

## 3. Where each gate lives

| Gate | Script | CI job |
| --- | --- | --- |
| Body constants + rotation coherence + GLSL hygiene | `tools/validate_body_constants.py` | Web, provider, and browser validation (every PR) |
| Motion contract (measured spin, sense, obliquity, moon periods, display cap) | `tools/validate_body_motion.py` | Web, provider, and browser validation (every PR) |
| Moons regen + accuracy | `tools/validate_moons.py` | Web (every PR) |
| Star catalogue regen + physics | `tools/validate_star_catalog.py` | Web (every PR) |
| Geography regen | `tools/generate_geography.py --check` | Web (every PR) |
| Engine vs theory sources | `cargo test --workspace` | Rust tests (every PR) |
| Engine vs JPL Horizons (networked) | `tools/validate_ephemeris.py`, `tools/stress_moon_syzygy.py` | ephemeris-accuracy (weekly + manual) |
| Browser behaviour (moons, aliasing, validity window, WebGL) | `tools/browser_smoke.py` | Web (every PR) |
