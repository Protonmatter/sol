# Ring geometry and display contract

This change replaces filled ice-giant annuli with selected named bands and empty
intervals. It is a catalogue-based illustration, not a reconstructed observation,
an epoch-dependent ring solution, or calibrated ring photometry.

## Source snapshot and admitted geometry

The radial catalogue is the [USGS Gazetteer ring table](https://planetarynames.wr.usgs.gov/Page/Rings),
consulted on 2026-09-13. Radii are kilometres from the planet centre. Its Uranus
and Neptune entries are also presented in [NASA's Uranus facts](https://science.nasa.gov/uranus/facts/)
and [NASA's Neptune facts](https://science.nasa.gov/neptune/neptune-facts/).
The entries specify centres and widths or radial bounds; they do not supply an
optical RGB texture. The held Saturn raster remains ineligible.

| System | Admitted radial intervals (km) | Display choice and omissions |
| --- | --- | --- |
| Saturn | C: 74,500–91,980; B: 91,980–117,500; A: 122,050–136,770 | Retain the existing 74,500–136,780 clearance envelope. The C inner edge is clipped 10 km inside the catalogue's 74,490 edge. D, F, G, E and finer substructure are outside this selected model. |
| Uranus | 6: 41,838.5–41,841.5; 5: 42,228.5–42,231.5; 4: 42,578.5–42,581.5; Alpha: 44,714–44,726; Beta: 45,664–45,676; Eta: 47,189–47,191; Gamma: 47,628–47,632; Delta: 48,285.5–48,294.5; Lambda: 50,019–50,021; Epsilon: 51,130–51,150 | Representative widths within the listed ranges. Epsilon uses 20 km of its 20–100 km published range, retaining the existing outer envelope. Circular, constant-width bands do not reproduce eccentricity or azimuthal width changes. Zeta, Nu and Mu dust rings are omitted. |
| Neptune | Galle: 41,892.5–41,907.5; Le Verrier: 53,192.5–53,207.5; Adams: 62,910–62,950 | The selected catalogue lists 15 km widths for Galle and Le Verrier. Adams uses a representative 40 km within the listed <50 km bound. Its outer envelope is corrected from the former centre radius 62,930 to 62,950. Lassell, Arago and localized arcs are omitted; uniform Adams does not depict arc locations or brightness. |

**Known source conflict:** the narrow Galle width above follows this explicitly
selected USGS/NASA facts snapshot. The NASA-hosted JPL NIAC report
[Magnetour, July 2013, Table 5](https://www.nasa.gov/wp-content/uploads/2019/03/niac_2012_phasei_lantoine_magnetour_tagged.pdf)
instead tabulates approximately 2,000 km for Galle. SOL does not claim the selected
15 km depiction is a settled physical width. Resolving this discrepancy against
the underlying ring-observation literature remains necessary before claiming a
complete or exact Neptune ring reconstruction.

Saturn's empty intervals are Colombo 77,750–77,850; Maxwell 87,365–87,635;
Bond 88,690–88,720; Dawes 90,200–90,220; Cassini 117,500–122,050;
Encke 133,407.5–133,732.5; and Keeler 136,487.5–136,522.5 km. Centre/width
entries are converted deterministically as centre ± width/2.

## Appearance, shadows, and limitations

The neutral encoded RGB value is 0.55. Display opacity is 0.18/0.78/0.50 for
Saturn's C/B/A rings and 0.16 for the selected ice-giant bands. These values aid
legibility; they are not measured optical depths, colour retrievals, or a claim
of natural-colour appearance. Very narrow bands may remain below one pixel at
overview distances; the implementation does not widen them to force visibility.

The mesh inserts every admitted band and gap boundary. The planet-shadow lookup
uses the same piecewise opacity function, integrated over each of 2,048 radial
texel footprints before 8-bit quantization. This prevents point sampling from
missing narrow bands. Filtering and quantization still limit sub-texel shadows.
The outer-envelope edge fade is half one lookup texel, rather than 1.5% of the
entire ring span, so Epsilon and Adams are not erased by a broad edge fade.

Ring lighting decodes sRGB, applies the two-sided illustrative factor
`0.08 + 0.92 * abs(dot(normal, sunlight)) * sunVisibility`, and encodes sRGB again.
The existing geometric planet-shadow approximation gives `sunVisibility` between
0.18 and 1. Alpha is unchanged by lighting and shared with the radial profile.
This is a bounded diffuse display model, not calibrated particle scattering,
opposition effects, multiple scattering, or a full oblate occultation solution.

No planetary or moon positions, physical body radii, or ephemeris calculations
change. Clearance uses the admitted outer ring envelope as before.

## Verification and rollback

- `node --test tests/web/rings.test.mjs tests/web/orreryMath.test.mjs tests/web/displayGeometry.test.mjs`: 21 passed locally; interval, footprint, exact-mesh, invalid-input and existing clearance regressions.
- `node tools/ring_appearance_validation.mjs --out=coverage/system-polish-rings-gpu-green-01`: actual WebGL ring shaders and the exact production sphere ring-shadow block, ten checks passed locally. Earlier failing evidence is retained in `coverage/system-polish-rings-gpu-red` (the initial tool filename was `ring_validation.mjs`). This isolated GPU fixture does not prove full-scene appearance.
- `python tools/typecheck_web.py`: 79 modules passed before the separate camera work.

The GPU tool accepts `--web-root=build/site` and verifies imported staged module
hashes against the selected release manifest. Rollback is a normal revert of
ring records, math, shader blocks and their matching pins/tests; no persistent
data migration or runtime network dependency is introduced.
