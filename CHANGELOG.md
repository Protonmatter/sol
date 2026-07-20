# Changelog

Notable changes to this repository. The format loosely follows
[Keep a Changelog](https://keepachangelog.com/); the published `solar-ephemeris`
crate follows [SemVer](https://semver.org/).

## [Unreleased]

### Added

- **Real star catalogue across the 3-D views.** The Solar-System view's background
  starfield is now the actual naked-eye Hipparcos catalogue — 8,867 stars (V ≤ 6.5) at
  true J2000 directions with measured magnitudes and B−V colours — replacing the
  procedural fake starfield. The Milky-Way view gains the same catalogue at its true
  galactic positions, plus a new light-year-scale **Solar neighbourhood** sub-view:
  every star at its real parallax-derived 3-D position around the Sun, with distance
  rings and "name · distance" labels. Derived physics (luminosity, temperature, radius,
  and a clearly-labelled mass estimate) lives in `apps/web/js/starphysics.js`; sources,
  licenses, and honest-accuracy notes in `tools/ephemeris-data/stars/README.md`.
  The ~370 KB catalogue module is **lazy-loaded** (dynamic import, in parallel with the
  WASM fetch) only when the 3-D view opens — the Sun / My Sky first paint pays nothing,
  and `validate_web_static.py` now enforces that lazy modules are never preloaded or
  statically imported.
- **Engine bright-star catalogue 26 → 108** (`solar-ephemeris`): the original 26
  SIMBAD-verified entries are frozen verbatim; the extension adds the PyEphem/Yale-BSC
  bright set with real proper motions. My Sky's dome and "Up now" list see all 108.
- `tools/generate_star_catalog.py` + `tools/validate_star_catalog.py`: deterministic,
  offline generation from committed pristine sources, with regeneration byte-stability
  and physics spot-checks (Sirius, Vega, …) gated in PR CI.

### CI / tooling

- Extend `tools/validate_docs.py` with offline Markdown **style** lint — heading
  hierarchy, trailing whitespace (two-space line breaks allowed), hard tabs, and
  labeled/closed code fences — gated on every PR via `docs.yml`.

## [0.1.1] — 2026-07-20

### Published

- First [crates.io](https://crates.io/crates/solar-ephemeris) release of the
  **`solar-ephemeris`** crate — a zero-dependency VSOP2013 + ELP-MPP02 + TOP2013
  ephemeris and topocentric sky engine, validated against JPL Horizons to arcsecond
  class. Install with `cargo add solar-ephemeris`.

### CI / tooling

- Add `.github/workflows/publish-crate.yml` — scheduled (weekly) and on-demand
  `cargo publish -p solar-ephemeris`, guarded to skip versions already on crates.io so
  scheduled runs stay green between releases.
- Harden `.github/workflows/ephemeris-accuracy.yml` — SHA-pin all actions, add a job
  timeout, and build with `--locked`, matching the repo's other workflows.
- Add `.github/workflows/docs.yml` + `tools/validate_docs.py` — offline Markdown
  link/reference and workflow-badge validation, run on every PR so documentation can't
  silently drift from the build.
- Add `tools/watch-ci.sh` — a reusable `gh` + `jq` CI watcher (poll → report
  transitions → merge-on-green).
- Document the crates.io release process in `BUILD_NOTES.md`.

[Unreleased]: https://github.com/Protonmatter/sol/compare/master...HEAD
[0.1.1]: https://crates.io/crates/solar-ephemeris/0.1.1
