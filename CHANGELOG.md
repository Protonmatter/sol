# Changelog

Notable changes to this repository. The format loosely follows
[Keep a Changelog](https://keepachangelog.com/); the published `solar-ephemeris`
crate follows [SemVer](https://semver.org/).

## [Unreleased]

### Added

- **Earth has real geography.** `apps/web/textures/` is `.gitignore`d and is populated only by the
  optional `tools/fetch_textures.py`, so every deployment — GitHub Pages included — fell through
  to the procedural shader, where Earth's "continents" were value noise (`fbm(p*2.3)` thresholded
  into land). Real coastlines, lakes and permanent ice now ship with the repository: Natural Earth
  1:110m vectors (public domain) committed under `tools/ephemeris-data/geography/`, turned into a
  compact delta-encoded module by `tools/generate_geography.py`, and rasterised into an
  equirectangular WebGL texture in the browser by `apps/web/js/surfacemap.js`. No binary assets, no
  network, and the module is lazy-loaded behind the 3-D view so first paint is untouched.
- **The Moon's maria are the real ones**, at their IAU/USGS gazetteer coordinates and diameters,
  multiplied over the procedural surface rather than replacing it so crater detail survives
  underneath. Only the Moon gets this treatment, and the reason is in
  `tools/fetch_geography.py`: mare/oceanus/lacus/sinus/palus name a *rock* — flood basalt, dark by
  definition — whereas nothing in the catalogue says which Martian or Mercurian units are dark. A
  "lowlands are darker" rule would get Acidalia and Utopia Planitia right and Hellas, Amazonis,
  Elysium and Arcadia backwards, so Mars and Mercury keep the procedural shader instead of a guess.

### Fixed

- **Planetary axes no longer freeze at J2000.** The IAU WGCCRE elements carry secular rates in
  α0/δ0 that were simply absent, so every body's spin axis was pinned to its J2000 orientation
  while the date slider ranged over ±5000 years. All ten bodies now carry their published rates.
- **Earth's axis precesses properly instead of drifting in a straight line.** Earth's IAU rates
  (−0.641°/cty in RA, −0.557°/cty in declination) are the *tangent* to a ~25,770-year precession
  cone, intended for use near J2000. Applied literally over the slider's range they return δ0 =
  95.6° at −1000 yr and 117.9° at −5000 yr, which are not declinations; `iauRotation` builds the
  equator's node from α0, so the effect would have been a **180° prime-meridian error across the
  entire BCE half of the slider** — Greenwich where the dateline belongs. Earth now models the cone
  directly. It agrees with the IAU rates to 0.001° over the first few centuries, and at −4800 yr it
  puts the celestial pole 0.26° from Thuban, which was the pole star then.
- Sub-solar longitude, checked against Sun apparent RA − Greenwich apparent sidereal time, improves
  from 0.172° to 0.144° worst-case, and the old error grew with epoch where the new one does not.
- `tests/web/rotation.test.mjs` and `tests/web/geography.test.mjs` (15 tests) pin all of the above:
  sub-solar longitude across five epochs, the 15°/hour sweep, δ0 staying a real declination across
  the full slider, the pole landing on Polaris and Thuban, coastlines putting Paris and Cairo on
  land and the mid-Atlantic at sea, the antimeridian and polar-cap seams, and the maria coming out
  overwhelmingly near-side.

- **The Moon's card now explains that it is tidally locked.** It previously listed
  "Rotation (sidereal): 655.72 h" and left the reader to notice that this is *exactly* the
  27.322 d orbital period — so the 3-D view, which correctly shows the Moon turning, read
  as a contradiction of tidal locking rather than a demonstration of it. The rotation row
  now says so outright, a Libration row gives the ±7.9°/±6.7° monthly wobble and the 59%
  of the surface it reveals, and two glossary entries spell out that a locked body still
  turns once per orbit in an inertial frame. `tests/web/moonlock.test.mjs` pins the
  invariant behind the claim: locking is emergent here, not a stored flag — it holds only
  because the IAU rotation elements match the orbit — so the test projects the Moon→Earth
  direction into the body frame across two synodic months and fails if the sub-Earth point
  ever winds away from the prime meridian, or if the libration is flattened out.
- **All 88 constellations, up from 7.** The figures were a hand-written array that joined
  stars by NAME, so a figure could only use stars that happened to be in a curated list —
  which is why the sky showed Orion, Ursa Major, Cassiopeia, Crux, Cygnus, Scorpius, and
  Leo and nothing else. They are now generated from the IAU line data as RA/Dec polylines
  (`tools/generate_constellations.py` -> `apps/web/js/constellations.js`, 88 figures / 150
  polylines / 743 segments), which drops the star-name lookup entirely. Both the
  Solar-System 3-D sky and the My Sky dome draw the full set; Serpens is correctly one
  constellation with two disjoint halves. Regeneration byte-stability and the 88-count are
  gated in CI, and `tests/web/constellations.test.mjs` checks the shape the renderers rely
  on plus known sky positions.
- **Click a star to inspect it.** Named catalogue stars are now pickable in the
  Solar-System sky and the Solar-neighbourhood view, opening a facts card that finally
  surfaces the physics the app was already computing: distance, apparent and absolute
  magnitude, B−V colour, spectral type, effective temperature, luminosity, radius, and a
  mass estimate. The card separates **measured** rows (Hipparcos) from **derived** ones
  and names the method for each. Two honesty guards: a star with no usable parallax shows
  "—" for everything distance-dependent rather than a number built on a guess, and an
  evolved star's mass row declines to answer, because the main-sequence mass–luminosity
  relation does not apply to giants and supergiants.
- Glossary entries for parallax distance, colour index, spectral type, absolute magnitude,
  effective temperature, luminosity, and stellar mass, so every new term has its `?`.
- `tests/web/starphysics.test.mjs` — the shipped JS physics is now tested directly against
  published values. `validate_star_catalog.py` only ever checked a Python mirror of these
  formulas, so an edit to `starphysics.js` could previously change what users see while
  that gate stayed green.

## [0.2.0] — 2026-07-20

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
[0.2.0]: https://crates.io/crates/solar-ephemeris/0.2.0
[0.1.1]: https://crates.io/crates/solar-ephemeris/0.1.1
