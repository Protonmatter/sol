# Changelog

Notable changes to this repository. The format loosely follows
[Keep a Changelog](https://keepachangelog.com/); the published `solar-ephemeris`
crate follows [SemVer](https://semver.org/).

## [Unreleased]

### Added

- **The major moons.** Twenty-one of them — Mars's two, the four Galileans, seven Saturnian
  including Titan, the five Uranian, and Triton, Nereid and Proteus — drawn in their real orbits
  around the planets they belong to, lit, labelled, and clickable for a facts card. Every
  satellite with a mean radius of at least 150 km, plus Phobos and Deimos.
  Orbits come from JPL Horizons via `tools/fetch_moons.py`, sampled weekly (every 84 hours for
  Mimas and Enceladus) across **2021-01 to 2030-12**, and accuracy is gated in CI by
  `tools/validate_moons.py` against committed Horizons state vectors: **worst 0.1384° angular
  and 0.1893% radial error** across 11,985 checks, at times interleaved between the element
  knots. Note the angular figure is 92% of the 0.15° CI limit — Nereid's eccentric, strongly
  perturbed orbit sets the ceiling, and widening the window further will need a finer cadence
  for that moon rather than more of the same.

  The renderer withholds the moons entirely outside that interval, explaining itself in the
  accuracy line rather than leaving them to vanish silently; the notice derives its dates from
  `MOON_VALID_MIN_JD`/`MAX_JD`, so re-running the fetcher cannot leave it stating a window that
  is no longer true. Earth's Moon is unaffected either way — it has its own ELP-MPP02 solution
  and was never in this table.

  The element knots live in `apps/web/js/moonelements.js`, imported dynamically on entry to the
  Solar System view and marked `@lazy-module` so `validate_web_static.py` enforces that it is
  never preloaded or statically imported. They are ~99% of the bytes, so the static `moons.js`
  is **8 KB** while carrying the same 21 moons: the Focus control and the accessible positions
  list keep their first-entry guarantee, and first paint never pays for a megabyte of orbital
  elements.

  Because planets are drawn oversized, each satellite system is inflated by ONE factor so its
  innermost moon clears the planet's disc while the spacing between moons stays true — Callisto
  still sits 4.46× farther out than Io.

  Two things had to be got right, and both are recorded in `tools/ephemeris-data/moons/README.md`:

  - **JPL's satellite mean-elements table cannot be used.** It is the obvious source and it does
    not work: its angles are referred to three different planes depending on the satellite, and
    even with all three implemented and all 18 node/apsis sign conventions searched, it reproduces
    Mars's and Jupiter's moons to ~0.1° while missing Saturn's and Uranus's by 24–165° **at its own
    epoch**. Horizons osculating elements requested in the ecliptic frame have no such ambiguity.
  - **One osculating epoch is not a long-lived orbit.** Satellite orbits are perturbed hard
    enough that Kepler-propagating a snapshot puts fast inner moons on the wrong side of their
    planet. The fetcher now samples fresh elements weekly (every 84 hours for Mimas and
    Enceladus), and the renderer interpolates modified equinoctial elements so circular-orbit
    angle singularities cannot introduce jumps.

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

Review round (all findings from the Codex PR reviewer, each verified before acting on it):

- **The Moon layer now stops where its evidence stops.** The elements are validated from January
  2021 through December 2030, but the date slider spans ±5000 years and would happily propagate
  them the whole way. Outside the exact shared validation interval the moons are withheld and the
  accuracy line says why. Separately, at the default 0.5 simulated years per second one frame
  covers ~3 days — past
  the Nyquist rate for Io, Mimas and Phobos, where apparent motion can visibly run backwards — so
  moons the clock has outrun are dropped until it slows.
- **Moon suppression notices now follow the frame they describe.** The accuracy line is updated
  after painting computes visibility, fast moons return immediately when animation is paused,
  and hidden counts are accumulated across all five parent systems instead of being overwritten
  by the last one drawn.
- **Moon phases and ring occlusion now use physical geometry.** Inflated display spacing no longer
  rotates a moon's terminator, and transparent rings are composed after opaque moons so the
  foreground half of a ring correctly covers a moon behind it.
- **Retrograde is decided against the planet's spin, not ecliptic inclination.** The card called
  all five Uranian moons retrograde because they sit near 98°. They are prograde; *Uranus* is
  tipped. Worse, the spin axis is not the IAU pole either — Uranus turns backwards about its own
  north pole — so the test and the card now share one `isRetrograde` helper that gets it right.
  Only Triton qualifies.
- **Unticking "NASA textures" no longer replaces real coastlines with noise.** The generated
  geography was gated behind the same flag as the optional photographic downloads, so the control
  silently undid the headline change of this release. It now governs only the downloads it names.
- **Per-moon colours are visible.** Moons reused the Mercury and Venus shader branches, both of
  which overwrite the base colour, so every catalogue colour was discarded — Io rendered
  Mercury-grey. Two moon styles now modulate the body's own colour instead of replacing it.
- **An unmeasured GM reads as unknown.** JPL writes `0.00000` where a satellite's GM has never
  been measured; Nereid's card was printing "0.0000 km³/s²" as though a 170 km moon were massless.
- **GeoJSON holes subtract instead of filling.** Inner rings were flattened in with outer ones and
  each filled independently, painting gaps solid. Polygons keep their grouping and are filled with
  the even-odd rule.
- **Moons are lifted clear of their planet's rings.** Clearance was measured against the planet
  alone, so Mimas was drawn inside Saturn's rendered rings — inverting a real relationship, since
  every moon here orbits beyond its planet's outer ring.
- **Moon orbit paths are drawn** under the Orbits overlay, at the same system scale as the markers.
  `moonOrbitPath` had been imported and never called.
- **Moons are reachable without a mouse.** The positions panel is the canvas's text alternative but
  listed only planets, and the label overlay is `aria-hidden` — so the moons existed for pointer
  users only. Rows are now buttons, with each planet's moons nested beneath it.
- **The Earth map no longer blocks the frame.** Its per-pixel tint pass could not yield once
  started, so `requestIdleCallback` only delayed the stall. The noise is now evaluated on a coarse
  lattice and interpolated (900 ms → 441 ms median) and the pass yields every 128 rows.
- `tests/web/moonlock.test.mjs` claimed two synodic months but its fixtures spanned 32 days. It now
  has 16 engine-generated samples covering 60 days, so the locking invariant really is checked
  across two lunations.

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
