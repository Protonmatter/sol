# Changelog

Notable changes to this repository. The format loosely follows
[Keep a Changelog](https://keepachangelog.com/); the published `solar-ephemeris`
crate follows [SemVer](https://semver.org/).

## [Unreleased]

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
