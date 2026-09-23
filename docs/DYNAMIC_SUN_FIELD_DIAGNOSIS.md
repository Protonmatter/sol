# Solar emission-field diagnosis and revised acceptance

The user's later reference images and written critique are visual targets, not
calibrated observations. They supersede the earlier aesthetic acceptance of the
R2/R3 previews. The original research plan remains unchanged. Work continues on
the shared field and active-region representation before further color or glow work.

## What the controlled comparisons establish

The R2 pattern is present in an independent analytic-sphere projection of the
admitted float32 source raster. That projection has no Blender material, volume,
glare, denoising, or tone mapping. The defect therefore exists upstream of those
rendering stages. The direct scalar EXR is retained.

An exact Rust control changes only the cellular scale from 10,000 to 20,000 km.
The 10,000-km output is byte-identical to the retained R2 reference raster
(`6af835e8320fbd054ec5fd727d2198b36ef9b2ff6a1469cb90c8f82021985b8e`).
The lower-frequency field enlarges the same cellular pattern. It does not remove it.
This supports changing the lattice-based emission primitive, rather than hiding it
with blur. R3's correlated multiscale field removes the obvious lattice morphology
and is retained as the basis for the next hierarchy.

The 512-pixel versus twice-resolution/area-downsample test gives scalar mean absolute
differences of approximately 0.00947 for R2 and 0.001406 for R3. Sampling contributes
to the displayed result, but it does not account for the source pattern by itself.
These are diagnostic errors in relative units, not solar accuracy estimates.

The 0, -2, and -4 EV comparisons multiply **linear RGB before Reinhard** and retain
Standard/sRGB output at zero additional exposure. They expose some internal detail,
but broad active-region shapes remain. Neither displayed set has a channel reaching
255, so the apparent white regions are not literal 8-bit clipping. Broad source
envelopes and display compression both matter; exposure alone does not supply the
missing hierarchy.

An independent Blender attachment defect was also reproduced. The disk used world
position, so rotating the sphere hardly changed the image, while an equivalent
inverse camera orbit did. The scalar mismatch was about 0.10704. Canonical
`SolarRoot` coordinates corrected the same-data comparison to approximately
1.22e-6; a whole-root check reached 1.75e-7. Previous scenes and source snapshots
remain retained instead of being relabeled as corrected renders.

The diagnostic report and evidence are local artifacts under
`.superpowers/sdd/engineering-plan/surface-diagnostic-report.md` and
`build/solar-authoring/surface-diagnostic-summary/`. The latter has the raw,
exposure, resolution, frequency, and attachment comparison sheets and an index
covering 391 artifacts.

## Exact R3 source of the broad regions

The earlier preparation code constructs a 512-by-256 base as follows:

```python
emission = 0.12
for region in packet["regions"]:
    d = sum(a * b for a, b in zip(p, region["center"]))
    emission += 2 * math.exp((d - 1) / 0.015)
```

R3 modulates that base by `exp(0.65 * (correlated_field - 0.2))`.
The Gaussian envelope is therefore still a broad emitting source. Replacing the
fine texture alone cannot eliminate the low-frequency blob. Every original strand
also used a constant 0.008-solar-radius Gaussian width, while the diffuse volume
used a spherical `0.015 * exp(-height / 0.12)` field. These are inspected code
properties, not inferences from screenshots.

## Required next preview

Keep the display transform, exposure baseline and palette fixed. Omit loops,
corona and optical glow from the first hierarchy preview.

| First row | Second row |
| --- | --- |
| Macro field only | Active-region placement mask |
| Macro plus meso network | Active-region internal structure |
| Macro plus meso plus micro | Compact cores and low-emission lanes |
| Complete disk including active regions | Final active-region emission |

Retain float component rasters and identify each diagnostic quantity and scale.
Use one declared display mapping for comparable summed-emission panels; do not
use independent automatic exposure to make each panel attractive. Dimensionless
mask views may show their explicitly labeled 0-to-1 range.

The Gaussian changes role to a placement mask. The emitting structure must have
multiple compact cores, connected fragmented emission and coherent dark lanes.
Core definitions must refer to actual strand endpoints through checked attachment
groups. Loops, bundle envelopes and diffuse emission can be judged after the disk
hierarchy passes visual inspection, followed by the same four views in Blender and
the interactive browser.

## Scientific interpretation

### R4 diagnostic closure

The requested eight-panel disk diagnostic is now retained at
`build/solar-authoring/r4-smooth-disk-components/contact-sheet.png`. It uses native
2048x1024 fields, fixed grayscale mapping, no loop/corona/glow and no independent
panel exposure. Placement masks now have zero contribution to the emission sum.
Compact cores and sparse structure are attached to fixed logical endpoint groups;
moving those groups moves their disk sources. Rendering subdivision leaves disk
budgets unchanged. The old broad region-centered Python surface is no longer the
published base path; the base aliases the admitted native t0 hierarchical raster.
The browser evaluates the same field analytically and records that it does not
fetch the reference texture.

The separate attached generator sampling diagnosis was reproduced and corrected
with Gaussian voxel-CDF integration, physical widths and explicit retained/tail/
clipped budgets. These changes do not resolve all morphology problems. Combined
actual browser and Cycles views still show rounded dark regions and isolated
bright arcs. The four-view sheet is explicitly marked appearance NOT accepted.
The full current evidence and outstanding criteria are in
[DYNAMIC_SUN_HANDOFF.md](DYNAMIC_SUN_HANDOFF.md).

The intended appearance is an illustrative false-color EUV view. HMI continuum
and AIA's coronal channels are distinct observables. NASA identifies AIA 171 Å
primarily with quiet-coronal and upper-transition-region Fe IX emission, and
304 Å with chromospheric/transition-region He II emission.
[NASA's channel definitions](https://sdo.gsfc.nasa.gov/data/channels.php).
NASA also presents the same eruption and evolving loop system separately in
171 Å and 304 Å, providing useful morphology references.
[NASA SVS, eruption and coronal loops](https://svs.gsfc.nasa.gov/4323/).

The procedural dark regions are low-emission, coronal-hole-like features; they are
not automatically sunspots. A traced magnetic path guides an emitting structure
but is not itself a photograph of plasma. Relative emissivity, geometric guidance,
source-image playback and optical display processing retain separate authority.
