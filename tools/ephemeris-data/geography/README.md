# Surface-geography source data (pristine, committed)

Raw upstream files for `tools/generate_geography.py`. Committed byte-exact so the derived
module (`apps/web/js/geography.js`) is reproducible offline forever; do not edit these by
hand — re-run `tools/fetch_geography.py`, which is the only networked step and is never run
by CI.

| File | Upstream | License | sha256 |
|---|---|---|---|
| `ne_110m_land.geojson` | [Natural Earth](https://www.naturalearthdata.com/) 1:110m physical `land`, via [natural-earth-vector](https://github.com/nvkelso/natural-earth-vector) (unmodified) | public domain | `9e0729ee253ca7d7a5c4ae9395fb1902264c5377c52e224d13dd85010e2835d9` |
| `ne_110m_lakes.geojson` | same, `lakes` (unmodified) | public domain | `eb02ecc86c82004fccbf979058bfabbbd6c2d07968c7844d38eb1c9152d2ffc9` |
| `ne_110m_glaciated_areas.geojson` | same, `glaciated_areas` (unmodified) | public domain | `e61e3f45e22f087f861ac2fda6258fc15c849a216d74c27ccf0164eeafbd950a` |
| `iau_surface_features.csv` | [IAU/USGS Gazetteer of Planetary Nomenclature](https://planetarynames.wr.usgs.gov/) — **row + field subset**, see note | public domain (US Government) | `fc96f547fa47d141afa45cd16c55c327a071a1de4bc4e7e578d954e61893dd34` |

> `iau_surface_features.csv` is the one file here that is **not** byte-verbatim. The gazetteer
> serves one ~24 MB HTML page per target, so `tools/fetch_geography.py` keeps a mechanical
> subset: approved features only, of the feature types listed in its `SELECT` table, above a
> per-body diameter floor; the retained fields are copied verbatim. Re-derive and compare with
> `python tools/fetch_geography.py --check`.

## Why these layers

Before this data existed the 3-D view had no committed surface maps at all. `apps/web/textures/`
is `.gitignore`d and is populated only by the optional `tools/fetch_textures.py`, so every
deployment — including GitHub Pages — fell through to the procedural shader, where Earth's
"continents" were value-noise (`fbm(p*2.3)` thresholded into land). Recognisable, real geography
had to come from something the repository actually carries.

Natural Earth 1:110m is the cartographic standard for whole-globe rendering (its "1:110 million"
scale *is* the world-view scale), it is public domain with no attribution requirement, and at
5,143 land points it costs a fraction of a raster map.

## Field semantics

### Natural Earth GeoJSON

Standard GeoJSON `Polygon`/`MultiPolygon` in WGS84 degrees, `[longitude, latitude]`, longitude
east-positive in −180…180. Rings are closed.

**A polygon's second and later rings are HOLES.** Both `land` and `glaciated_areas` contain one,
and flattening them in with the outer rings makes a rasteriser fill each independently — painting
the gap solid. `generate_geography.py` keeps the grouping (`[outerRing, ...holes]`) and
`surfacemap.js` fills each polygon in a single path with the even-odd rule, so holes subtract.

`land` is the coastline fill; `lakes` are the major inland water bodies; `glaciated_areas` is
permanent ice (Antarctica, the Greenland ice sheet), which is why the poles can be drawn from
data rather than from a latitude cut-off.

### `iau_surface_features.csv`

| Column | Meaning |
|---|---|
| `target` | `Moon` in the committed subset |
| `name` | IAU-approved feature name |
| `feature_type` | gazetteer descriptor term (`Mare, maria`, `Terra, terrae`, …) |
| `diameter_km` | mean diameter |
| `center_lat_deg`, `center_lon_deg` | feature centre in the Moon's planetographic, east-positive convention |
| `north_lat_deg`, `south_lat_deg`, `east_lon_deg`, `west_lon_deg` | bounding box in the same convention |
| `coordinate_system` | the source convention string, preserved verbatim |

The committed subset contains lunar maria only. `tools/generate_geography.py` normalises their
longitudes to east-positive `[0, 360)`, and `tests/web/geography.test.mjs` pins named near-side
maria so a sign or seam regression cannot silently mirror the map.

## What is *not* in here, and why

The gazetteer's own **`Albedo Feature`** type — classical telescopic markings — is deliberately
excluded. Those entries are stored as bare points:
`diameter_km` is `0.00` and all four bounding-box values equal the centre. They record *where* a
marking is named, not how large it is, so rendering them as regions would mean inventing every
extent. The lunar mare entries used here have real non-zero diameters and bounds, so they can be
rendered without inventing an extent.

Contrast (which units read dark and which read bright) is **not** in this data. The generator
assigns it from feature type, which is a stated approximation rather than photometry — see the
`CONTRAST` table in `tools/generate_geography.py` for the rule and its justification per body.
