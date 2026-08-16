# Data Update Playbook

How to refresh every external dataset this project depends on, what the *current latest
edition* of each source is, and the one rule that prevents drift:

> **Code and pin change together.** Any PR that touches a governed value must update both
> the implementation and its pin in `tools/validate_body_constants.py` (or the relevant
> regen source), and must cite the source edition in the PR description. The gates in
> [ACCURACY_CONTRACT.md](ACCURACY_CONTRACT.md) turn red on half-updates by design.

## 1. Current source editions (as of 2026-07)

| Domain | Latest edition | Status |
| --- | --- | --- |
| Rotational elements | **IAU WGCCRE 2015 report** (Archinal et al. 2018, Celest Mech Dyn Astr 130:22; correction 2019), distributed as NAIF `pck00011.tpc` | **Latest that exists.** The WG skipped 1997 and 2012 and has published no report after 2015; it is now a standing "functional" working group, so watch for a future report rather than expecting a triennial one. |
| Planetary ephemerides (truth) | **JPL DE440/DE441** (2020) — what Horizons serves | Latest general-purpose JPL ephemeris; DE441 is the long-span variant used by every Horizons gate here. |
| Analytic planetary theories (on-device) | VSOP2013 (inner), TOP2013 (giants) | Latest published analytic theories of their kind; validated against DE441 here. |
| Lunar theory (on-device) | ELP-MPP02 | Latest ELP series; validated against DE441 here. |
| Major-moon elements | JPL Horizons osculating elements (fetched knots, committed) | Refresh extends the validity window; see §2.3. |
| ΔT / Earth orientation | measured IERS knots to 2026 + plateau | Refresh yearly-ish; gate requires ≥ 90 days of prediction coverage. |
| Surface textures | Solar System Scope set (CC-BY 4.0), NASA Blue Marble, NASA SDO/HMI "latest" | Committed baseline + deploy-time refresh. |
| Star catalogue | Hipparcos | Regen-stable from committed pristine sources. |

So no — there is nothing newer than WGCCRE 2015 for rotation, and Neptune's 2009→2015 fix
brought the repo to the newest standard that exists. The "newer than 2015" things to watch
are *kernels and ephemerides* (a future `pck00012`, a future DE), not reports.

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

Horizons switches server-side, so the weekly `ephemeris-accuracy` workflow automatically
starts comparing against the new DE. If the measured gates move, update the wording of the
accuracy claims (snapshot `accuracy` block, `docs/SOLAR_SYSTEM_SPEC.md` §8) to the new
measured numbers — claims follow measurements, never the reverse.

### 2.3 Extending the moons' validity window

1. **First edit the interval constants** `MODEL_START` / `MODEL_STOP` at the top of
   `tools/fetch_moons.py` — they are hard-coded, and re-running the fetch without moving
   them refetches the same window and leaves the shipped validity range exactly where it
   was (the UI would still hide every moon after the old end date).
2. Run `python tools/fetch_moons.py` (networked) to fetch fresh Horizons element knots and
   validation vectors, and commit the regenerated `apps/web/js/moons.js`.
3. `tools/validate_moons.py` proves regen byte-identity and interpolation accuracy; the
   shipped window constants (`MOON_VALID_MIN_JD`/`MAX_JD`) ride along automatically.

### 2.4 ΔT / EOP refresh

Update the measured IERS knots in `crates/solar-ephemeris/src/earth_orientation.rs` (the
file `tools/check_eop_freshness.py` inspects), with the near-present ΔT handling in that
same crate's `time.rs` (see the comment block there — do **not** revert to the E&M
polynomial, it runs ~6 s hot near-present), and keep `check_eop_freshness.py` green.

### 2.5 Textures

`python tools/fetch_textures.py --force` refreshes all maps and writes
`textures/sun.jpg.json` (`fetched_unix` — the download time, an upper bound on the frame's
capture time; SDO's "latest" endpoint lags by up to ~1 h ≈ ≤0.6° of solar rotation, the
accepted error. The renderer maps the disk for this epoch). Failed downloads never clobber
committed files, and
attribution is rebuilt from what is present on disk. Commit the changed files; they feed
the cache token, so clients refetch automatically.

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
