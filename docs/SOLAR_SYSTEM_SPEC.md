# Solar System & Sky Engine — Spec (v0.3 "Orrery + My Sky")

Status: Draft for review (build gated on sign-off)
Date: 2026-06-28
Relationship: extends the Solar Maximum Engine. Reuses the Rust→WASM deterministic
engine pattern, the snapshot/provenance contracts, the operational-honesty discipline,
and the ES-module web shell. The existing solar-surface app becomes the **Sun** object.

---

## 0. Purpose & north star

> **"Where is everything in the solar system right now — and exactly where would I see it
> from where I'm standing — with every number derived from orbital mechanics and physics, and
> checked against JPL."**

Two reference points the user named:
- **NASA's Eyes on the Solar System** — real-time **3D** flythrough positioned from JPL
  ephemerides/SPICE. Strong renderer + mission data; does **not** answer "what can I see from my
  backyard."
- **SkyView** — point-your-phone AR sky with object **altitude/azimuth**. Strong observer-centric
  local sky; thin on data/physics/provenance.

**The niche we own = the intersection:** rigorous, deterministic orbital math **plus** the
observer-centric "from your exact lat/long, here's where it is and why" view — every value
labelled with its method and its measured error vs JPL Horizons. We win on **usability + fact
grounding + the local-sky integration**, not on out-rendering JPL's 3D on day one.

## 1. Invariants (carried over from Sol)

- **Deterministic, math-first engine.** Positions come from published analytic theory compiled
  into Rust→WASM — not a runtime data feed. Same seed/time ⇒ same answer, byte-for-byte.
- **Grounded in facts = validated against JPL Horizons.** Every body's apparent RA/Dec and
  topocentric alt/az is regression-tested against Horizons to a stated tolerance. Constants come
  from IAU / NASA fact sheets with provenance.
- **Honesty about accuracy.** Outputs carry an `accuracy_class` (e.g. "arcminute analytic,
  validated vs JPL Horizons to < X"). **Not** for navigation, spacecraft ops, or occultation
  timing. Mirrors `operational_readiness`.
- **Snapshot-driven UI.** The renderer consumes immutable `ephemeris-snapshot.v1`; the UI never
  invents geometry.
- **No bundler, no Node at runtime.** Native ES modules + a WASM engine, hostable as static files.
- **Privacy.** The observer's location is obtained only via the browser Geolocation API (the user
  grants it) or manual entry. Location is never sent anywhere; geocoding is opt-in (§5.4).

## 2. Architecture (how it fits Sol)

- **New Rust crate `solar-ephemeris`** (zero/minimal deps) → compiled to WASM exactly like
  `solar-wasm`. Pure functions; deterministic; host-testable.
- **New WASM surface** alongside `solar_wasm`: `ephemeris.wasm` exporting
  `sky_snapshot(jd, lat, lon, elev) → JSON` and `system_snapshot(jd) → JSON`.
- **New web surfaces** (new ES modules under `apps/web/js/`): **"My Sky"** (local horizon) and
  **"Solar System"** (orbit view), added to the existing surface set; object **detail** reuses the
  disclosure machine.
- **New contract** `ephemeris-snapshot.v1` (§6), validated by a new `tools/validate_ephemeris.py`
  and a Horizons cross-check harness (§7), wired into the existing validator suite.

### 2.1 Provider tiers (hybrid — decided 2026-06-29)

`ephemeris-snapshot.v1` is provider-agnostic: the renderer doesn't care whether a snapshot was
computed in-browser or fetched from a server. That makes a **hybrid** the design:

- **Client tier (default, always available):** the `solar-ephemeris` WASM engine — analytic
  theory (VSOP2013/TOP2013/ELP-MPP02 after P4), runs offline/instant, free to host as static
  files, mas-class over roughly ±6000 yr. Handles the everyday "My Sky / live sky" case with **no
  server**. This is the strength we keep.
- **Server tier (optional, on-demand):** a backend high-precision provider serving full
  **DE440/DE441** (JPL numerical, sub-meter, the −13200…+17191 / 30,000-yr span Horizons itself
  uses) — or NASA **SPICE**, or cached Horizons. The frontend escalates to it **only** when the
  precision or time-span demand exceeds the client engine (deep-time queries, definitive
  accuracy, validation). Same contract; non-breaking to add.

Rule: never round-trip to the server for routine ticks (e.g. the per-minute "live" sky) — the
client engine serves those. The server is for *"compute the exact state in 9000 BC"* class needs.
This preserves the static/offline/zero-ops identity for the common case while removing the
asset-size ceiling for the premium case. The "No Node/bundler at runtime" invariant (§1) applies
to the **client tier**; the server tier may use any toolchain (cspice, calceph, DE readers).

## 3. The math (pillars 1–3) — what's computed and how

### 3.1 Time systems
- Calendar (local, with the observer's IANA time zone / DST) → **UTC** → **Julian Date (JD)**.
- **TT = UTC + ΔT** (ΔT ≈ +69 s in 2024; tabulated + polynomial extrapolation). TT drives the
  ephemeris; **UT1 ≈ UTC** (sub-second; ignored at arcminute precision) drives sidereal time.
- **GMST** (IAU 1982 polynomial in JD) → **GAST** (+ equation of equinoxes) → **LST = GAST + λ_east**.
- Mean **obliquity ε** (IAU secular polynomial); true obliquity adds nutation.

### 3.2 Ephemerides (geometry of the bodies)
Bodies: Sun, Moon, Mercury…Neptune (Pluto optional), plus a small curated set of named
asteroids/comets later (orbital elements from the IAU MPC).
- **MVP theory:** Standish/JPL **"Keplerian Elements for Approximate Positions of the Major
  Planets"** (linear element rates, valid 1800–2050). Heliocentric ecliptic → subtract Earth's
  heliocentric vector → geocentric. ~arcminute class.
- **Moon (MVP):** truncated **ELP2000-82** (Meeus Ch. 47) — ~10″.
- **Sun (MVP):** geometric solar position (Meeus Ch. 25) — ~arcsecond.
- **Upgrade path:** **VSOP87** (planets, ~1″) + **ELP/MPP02** (Moon) as compiled term tables.
- **Apparent-place corrections** (applied to get "what you actually see," matching Horizons
  *apparent* coordinates): light-time/planetary aberration (iterate on r/c), annual aberration
  (~20″), precession to date, and nutation (Moon especially). Phase-gated (§9): MVP includes
  light-time + precession; nutation/aberration added in the accuracy phase.

### 3.3 Coordinate transform chain (the sky-view)
```
heliocentric ecliptic (theory)
  → geocentric ecliptic (− Earth vector)
  → geocentric equatorial RA/Dec  (rotate by obliquity ε)
  → apparent RA/Dec of date       (precession, nutation, aberration)
  → topocentric                   (− observer geocentric vector; parallax)
  → horizontal alt/az             (hour angle H = LST − RA; spherical trig)
  → apparent altitude             (+ atmospheric refraction near horizon)
```
- **Topocentric parallax** uses the **WGS84** ellipsoid (ρ·sinφ′, ρ·cosφ′). Negligible for
  planets (arcsec), but **up to ~1° for the Moon** — required.
- **Refraction:** Bennett's formula (~34′ lift at the horizon).
- **Azimuth** reported from **true north, clockwise** (0°=N, 90°=E, 180°=S, 270°=W) → mapped to
  the 8/16-point compass; magnetic-vs-true north noted (we report **true**; magnetic declination
  is an optional later overlay).
- **Rise / set / transit:** standard altitude-crossing solve (h₀ = −0°34′ for point bodies;
  −0°50′ for the Sun's upper limb; +Moon parallax−semidiameter), with iteration over the day.

## 4. Derived physics (pillar making it "based on physics/thermodynamics/velocity")

Each body in a snapshot also carries, all from first principles or cited constants:
- **Distances:** heliocentric r and geocentric Δ (AU + km), plus light-travel time Δ/c.
- **Orbital velocity:** vis-viva **v = √(GM☉ (2/r − 1/a))** (km/s); plus geocentric range-rate.
- **Phase angle** and **illuminated fraction** k (Moon + inner planets).
- **Angular size** θ = 2·atan(R_body / Δ) (arcsec).
- **Apparent magnitude** from standard photometric models (per-planet, Moon by phase).
- **Equilibrium temperature** **T_eq = T☉·√(R☉/2d)·(1−A)^¼** (thermodynamic black-body estimate;
  labelled as equilibrium, *not* measured surface temperature; albedo A from fact sheets).
- Static facts (radius, mass, rotation period, axial tilt, albedo) from **NASA planetary fact
  sheets / IAU**, carried with a `source` tag.

Every derived value is provenance-tagged; physical constants (GM☉, c, AU, R☉, T☉) are pinned in
one audited module, mirroring `solar-core/constants`.

## 5. Observer location (pillar 3 detail)

1. **Browser Geolocation API** (default; user grants permission) → lat/lon/elev. Private; nothing
   leaves the device.
2. **Manual lat/long** entry (and elevation).
3. **ZIP / postal code** → a **bundled public US ZIP-centroid table** (offline, ~1 MB, public
   domain) → lat/lon. Other countries: later.
4. **Street address** → needs an **external geocoder** (e.g. OSM Nominatim) — the one networked,
   ToS-bound piece; **opt-in**, behind explicit consent, with the query never auto-submitted.

Time zone derived from location (IANA tz database) so local clock + DST are correct.

## 6. Data contract — `ephemeris-snapshot.v1`

Immutable JSON the UI renders (same philosophy as `solar-state-snapshot.v1`):
```text
EphemerisSnapshotV1 {
  schema_version = "ephemeris-snapshot.v1"
  engine_version
  time { utc, jd_tt, jd_ut1, delta_t_seconds, lst_deg, obliquity_deg }
  observer { lat_deg, lon_deg, elev_m, source }          // source: geolocation|manual|zip
  accuracy { class, theory, validated_against, max_error_arcsec }   // honesty fields
  bodies: Body[] {
    id, name, kind                                       // star|planet|moon|dwarf|asteroid|comet
    helio_ecliptic_au { x, y, z }
    geo_equatorial { ra_deg, dec_deg, distance_au, light_time_s }
    topocentric { alt_deg, az_deg, compass, above_horizon }
    derived { velocity_km_s, phase_angle_deg, illuminated_fraction,
              angular_size_arcsec, apparent_magnitude, equilibrium_temp_k }
    events { rise_utc, transit_utc, set_utc, transit_alt_deg }
    provenance { theory, constants_source }
  }
  warnings: string[]
}
```
`system-snapshot.v1` is the heliocentric subset (no observer/topocentric block) for the orbit view.

## 7. Validation strategy ("grounded in facts" = enforced)

- **Ground truth: JPL Horizons.** A harness (`tools/validate_ephemeris.py`, building on the
  existing Horizons cache/ingest) queries apparent RA/Dec + topocentric alt/az for each body across
  a sampled grid of dates and observer sites, and asserts our WASM output is within tolerance.
- **Golden fixtures** (deterministic, checked-in) for offline CI; a separate live cross-check job
  for drift. Same split as the snapshot validators today.
- **Tolerances** (= the published `max_error_arcsec`): see §8. A snapshot whose self-reported class
  can't be met by the validators fails CI — the analog of the operational-readiness gate.
- Host-side Rust unit tests for each transform against worked examples (Meeus), so failures localize
  to a stage (time / theory / transform / topocentric).

## 8. Accuracy budget (target error vs JPL Horizons apparent place)

| Body | MVP (Keplerian/ELP-trunc) | Upgraded (VSOP87/MPP02) | Notes |
|---|---|---|---|
| Sun | ≲ 30″ | ≲ 1″ | drives twilight |
| Moon | ≲ 2′ | ≲ 15″ | parallax mandatory; biggest topocentric term |
| Mercury | ≲ 1′ | ≲ 5″ | Keplerian weakest here |
| Venus…Mars | ≲ 1′ | ≲ 2″ | |
| Jupiter…Neptune | ≲ 30″ | ≲ 2″ | slow movers |
| Alt/az (after refraction) | ≲ 2′ typical | ≲ 0.5′ | refraction model dominates near horizon |

These are *visualization/observing-planning* tolerances. Explicit non-goal: sub-arcsecond /
occultation / navigation accuracy.

## 9. Phased delivery (each phase shippable + Horizons-validated)

- **P0 — Ephemeris foundation. ✅ DONE (2026-06-29).** `solar-ephemeris` crate: time systems
  (JD, ΔT, nutation, obliquity, GMST/GAST/LST), Sun (Meeus 25) + Moon (Meeus 47 principal terms),
  full apparent-place + topocentric chain (parallax via WGS84, refraction), rise/transit/set,
  `ephemeris-snapshot.v1` JSON, raw-ABI WASM (`apps/web/pkg/solar_ephemeris.wasm`, ~80 KB), a `sky`
  CLI, Meeus worked-example unit tests, and `tools/validate_ephemeris.py`. **Validated vs JPL
  Horizons DE441** across Boston (day/night) + Sydney: worst alt/az error **37.5″**, most < 15″ —
  arcsecond class, well inside §8.
- **P1 — "My Sky" MVP. ✅ DONE.** New web surface (`apps/web/js/sky.js` + `skyEngine.js`): a 2D
  horizon dome (alt/az, compass, altitude rings, sky colour by Sun altitude), observer input
  (browser Geolocation or manual lat/long), a live "Up now" list with altitude/compass/rise-set in
  local time, fed by `solar_ephemeris.wasm`. Verified in-browser against the engine/Horizons.
- **P2 — Planets + "what's up." ✅ DONE.** Added Standish/JPL Keplerian elements for all 8 planets
  (`planets.rs`); they flow into My Sky automatically. **Validated vs JPL Horizons** (Boston +
  Sydney): Sun/Moon/Mercury/Venus/Mars/Uranus/Neptune all < ~50″; Jupiter < ~1′; **Saturn ~2-5′**
  (the known Standish "great inequality" limit — arcsecond accuracy needs VSOP87, see P4). Ranked
  "Up now" list with rise/set. *Deferred to later:* magnitude/phase, object-detail panel, search.
- **P3 — Solar System view.** 2D top-down ecliptic orbit view with time controls and click-through
  to detail; the Sun object links into the existing solar-surface app.
- **P4 — Accuracy upgrade (IN PROGRESS).** Replace Standish-Keplerian with **VSOP2013** (inner) +
  **TOP2013** (outer giants) + **ELP-MPP02** (Moon), extracted from ephem.js's truncated tiers via
  a one-time Node data-gen step and embedded in the Rust→WASM engine. Target mas-class over
  ±6000 yr; fixes Jupiter/Saturn to arcseconds. Plus velocity (vis-viva), equilibrium temperature,
  illumination/phase; provenance/error-budget panels. Validated vs Horizons; tighten §8 tolerances.
- **P5 — WebGPU 3D (the "match NASA" stretch).** `wgpu` 3D solar system; reuse the same snapshots.
- **P6 — Polish.** ZIP table, opt-in address geocoding, a11y (WCAG AA), mobile, performance, and a
  device-orientation "point your phone" mode where supported.
- **P7 — Backend high-precision provider (hybrid, §2.1).** An optional server that serves full
  **DE440/DE441** (or SPICE/cached Horizons) behind `ephemeris-snapshot.v1`, for definitive
  accuracy and deep-time spans. The client engine stays the default; the frontend escalates to the
  server only when precision/span demand exceeds it.

## 10. UX surfaces (NN/g progressive disclosure, reused)

- **My Sky** — azimuthal-equidistant horizon dome (zenith centre, N/E/S/W rim), bodies at their
  alt/az, below-horizon dimmed, day/twilight shading, a time scrubber, and a plain-language "what's
  up" list. L0 glance: *"Jupiter — bright, high in the south."* → L3 research: full vectors + error
  budget + sources.
- **Solar System** — top-down orbits at time T, zoom, time controls, click a body → detail.
- **Object detail** — distance, velocity, phase, magnitude, angular size, rise/transit/set for the
  observer, equilibrium temp; every value with provenance + accuracy. The Sun opens the
  solar-surface app.

## 11. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Coordinate-convention bugs (the classic) | Validate every stage vs Meeus worked examples + Horizons; fail CI on drift. |
| Accuracy drift outside 1800–2050 (Keplerian) | Gate date range; show a warning; VSOP87 widens it. |
| Horizons rate limits / offline | Cache + checked-in golden fixtures; live job is a separate drift check. |
| Time-zone / DST / leap-second errors | IANA tz + tabulated ΔT/leap seconds; unit-tested. |
| Privacy of location | Geolocation only with consent; never transmitted; geocoding opt-in. |
| 3D scope (P5) balloons | Phases 1–4 ship full value in 2D first; 3D is additive. |
| Overclaiming accuracy | `accuracy_class` + non-goals on every snapshot, enforced by validators. |

## 12. Open decisions (for the build kickoff)

1. **First slice** (if/when we build): "My Sky" core vs orbit view vs thin end-to-end — see the
   chat options; spec assumes **My Sky first**.
2. **Ephemeris start:** Keplerian MVP (fast, ~arcmin) vs straight to VSOP87 (more work, ~arcsec).
   Recommend **Keplerian MVP → upgrade**, validated throughout.
3. **Where it lives:** new surfaces inside the current app (recommended) vs a separate page.
4. **WASM packaging:** one combined `engine.wasm` (solar-core + ephemeris) vs two modules.
   Recommend **two** for separation; both raw-ABI, no wasm-bindgen.

## 13. Sources & public-method anchors

All public and inspectable, consistent with Sol's anchoring discipline:
- Standish, *Keplerian Elements for Approximate Positions of the Major Planets* (JPL SSD).
- Bretagnon & Francou, **VSOP87**; Chapront, **ELP2000 / ELP-MPP02**.
- Meeus, *Astronomical Algorithms* (2nd ed.) — transforms, Sun/Moon, rise/set.
- **IAU SOFA** conventions (precession/nutation, sidereal time); **WGS84** ellipsoid.
- **JPL Horizons** (validation ground truth); **USNO** data; **NASA planetary fact sheets**
  (radii, masses, albedos); **IANA tz database**; **IERS** ΔT / leap seconds.
- No proprietary or non-public algorithm is used or claimed.
