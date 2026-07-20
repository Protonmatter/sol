# Star-catalogue source data (pristine, committed)

Raw upstream files for `tools/generate_star_catalog.py`. Committed byte-exact so the
derived catalogue (`apps/web/js/starcatalog.js`, `crates/solar-ephemeris/src/stars.rs`)
is reproducible offline forever; do not edit these by hand.

| File | Upstream | License | sha256 |
|---|---|---|---|
| `hipparcos_mag7.json` | [`star-catalog` crate v0.2.0](https://crates.io/crates/star-catalog) (`hipparcos_mag7.json`, unmodified) | MIT OR Apache-2.0 | `392f86c4cb52f13976b667e08d86686e390481a50349e6130e245bd287131368` |
| `hipparcos_names.json` | same crate (`names.json`, unmodified) | MIT OR Apache-2.0 | `e227dcd897c7a67b06e6b4640f850b050ca0a0119bcdd08e8694d721d2a50017` |
| `d3celestial_starnames.json` | [`d3-celestial` npm v0.7.35](https://www.npmjs.com/package/d3-celestial) (`data/starnames.json`, unmodified) | BSD-3-Clause | `044a73db97f45c51e194db64e2555dc295be57897bf9da90bc3781dcd17ba216` |
| `pyephem_bright_stars.edb` | [`ephem` PyPI v4.2.1](https://pypi.org/project/ephem/) — the 116-line bright-star `db` block from `ephem/stars.py`, extracted verbatim | package LGPL-3.0+; entries are XEphem-format catalogue facts compiled from the Yale Bright Star Catalogue | `900c4c434144f0a03802ec6fa299e613736e18dd1dd2c8646ca3c050692e8c9d` |

## Field semantics

`hipparcos_mag7.json` → `{"stars": [[HIP, ra_rad, dec_rad, distance_ly, Vmag, B−V], …]}`,
15,386 stars complete to V ≈ 7. Positions and parallax-derived distances are from the
ESA **Hipparcos** catalogue (ESA SP-1200, 1997; Perryman et al. 1997, A&A 323, L49).
Spot-verified against the published catalogue (e.g. HIP 3: RA 0.00501°, Dec +38.859°,
V 6.61, B−V −0.019, d ≈ 1161 ly). `hipparcos_names.json` maps HIP → IAU proper name
(96 entries); `d3celestial_starnames.json` maps HIP → Bayer/Flamsteed designation and
constellation (4,870 entries).

`pyephem_bright_stars.edb` is XEphem "edb" format:
`Name,f|S|<spectral>,<RA_hours>|<pmRA mas/yr>,<Dec_deg>|<pmDec mas/yr>,<Vmag>[,epoch]`.
It contributes proper motion and spectral type for the bright named set (the fields
Hipparcos_mag7 lacks). A few entries are alias duplicates of the same star
(e.g. Adara/Adhara); the generator dedupes by coordinates.

## Accuracy notes (honest limits)

- Distances are Hipparcos trigonometric parallaxes: excellent inside ~100 pc, degrading
  to ≥10–20 % relative error by a few hundred pc. The generator carries 4 significant
  digits — presentation precision, not a claim of accuracy beyond the parallax error.
- Luminosity, temperature, and radius in the derived catalogue are computed
  (M_V from V + distance; Teff from B−V via Ballesteros 2012; R from Stefan–Boltzmann)
  and labelled derived. Stellar mass has no measured per-star source at this scale and
  is emitted only as a mass–luminosity-relation **estimate**, labelled as such.
