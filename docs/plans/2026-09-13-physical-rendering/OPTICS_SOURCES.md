# Atmospheric optics reference sources and qualification

Status: bounded reference model, not retrieved atmosphere or current weather.
The renderer consumes immutable physical body geometry; it does not estimate or
modify atmospheric, orbital, or solar state. Its three wavelength samples are an
RGB display approximation, not a calibrated spectrum or apparent sky color.

## Admitted Earth and Mars profiles

Lengths are kilometres, extinction/scattering coefficients are inverse kilometres,
phase functions are inverse steradians, and vertical optical depths are dimensionless.
The outer boundary truncates a smooth density profile for computation; it is not a
physical edge. Density surfaces use the catalogue's oblate axis ratio and equivalent
ellipsoidal altitude. This is a reference approximation, not geopotential integration.

Earth uses a molecular exponential scale height of 8 km and an aerosol scale height
of 1.2 km. Molecular scattering follows the published Bruneton reference coefficient
`1.24062e-6 * wavelength_micrometres^-4` per metre, sampled at 680, 550, and 440 nm.
The aerosol vertical extinction optical depth is 0.005328, with single-scattering
albedo 0.9 and asymmetry 0.8. These are that reference demonstration's clear-air
parameters, not a retrieval of Earth's present atmospheric conditions. The rendering
uses a normalized Henyey-Greenstein particle phase function instead of a full Mie
particle-size calculation. Ozone absorption and multiple scattering are not enabled.

- [Published implementation and validation](https://ebruneton.github.io/precomputed_atmospheric_scattering/)
- [Author's coefficient definitions](https://github.com/ebruneton/precomputed_atmospheric_scattering/blob/master/atmosphere/demo/demo.cc)

Mars uses a deliberately thin reference scenario: 610 Pa, 210 K, CO2 molar mass
44.01 g/mol and an 11.1 km exponential scale height. The molecular coefficient is
derived from the refractive-index cross-section equation with the wavelength-dependent
CO2 standard refractivity equation in NASA PSG's handbook at 101325 Pa and 288.15 K.
The King/depolarization correction is omitted; this is a bounded ideal-gas approximation,
not a measured Mars scattering spectrum. Standard and local number densities are
computed from the exact Boltzmann constant. The aerosol scenario has vertical optical
depth 0.05, scale height 11.1 km, grey extinction, and single-scattering albedo 0.94.
The 0.94 albedo is grounded in the solar-band dust example of Wolff et al. (2009).
The optical depth and single-lobe asymmetry `g=0.65` are explicit thin-dust scenario
parameters, not retrieved data. They do not reproduce Mars sunset spectral structure.

- [NASA Goddard atmospheric structure, Rayleigh and refraction methods](https://psg.gsfc.nasa.gov/helpatm.php)
- [Wolff et al. 2009, MRO/CRISM and MER dust properties](https://doi.org/10.1029/2009JE003350)
- [NASA Mars reference facts](https://science.nasa.gov/mars/facts/)
- [JPL Mars atmosphere propagation reference, pressure and scale height](https://descanso.jpl.nasa.gov/propagation/mars/MarsPub_sec4.pdf)

Dense atmospheres (Venus, Titan and giant planets), Triton's thin atmosphere,
exospheres and localized plumes do not acquire these profiles by analogy. The API
returns unavailable for every body except Earth and Mars. No atmospheric condition,
wind, cloud cover, or other weather is synthesized from an image or the model clock.

## Transfer and composition

The GPU integrates single scattering along view rays, with separately integrated
solar optical depth and solid-body shadow rays. Surface rays stop at the ground;
off-disk rays traverse the complete shell. Extinction is wavelength-dependent.
Surface transmission and scattered radiance compose in linear display light before
sRGB encoding. A unit-white Lambert surface uses `cos(theta)` in the existing view,
so normalized scattered radiance is multiplied by pi to match that display convention.
Atmospheric paths include self-shadowing by the solid planet; volumetric eclipse
shadows from other bodies are not included in this initial profile solver. Existing
surface eclipse shadows retain their separate renderer path.
Physical irradiance scales as inverse squared heliocentric distance; display exposure
is separate. This does not calibrate the archived display RGB as surface reflectance.

The off-disk shell's extinction of the already rendered sRGB star background is an
explicit approximation if the renderer does not provide a linear scene-color target.
The on-disk path must not be replaced with an additive halo or scalar-alpha attenuation.
The density profile and optical transfer themselves have no dependence on displayed
body inflation. Ray steps and bounding intersections are fixed and deterministic.
Eight Gauss-Legendre nodes integrate each density component, clipped at its own
12-scale-height support (or profile top). Twelve nodes integrate each monotonic
illuminated view segment. Intersections at closest approach and at the analytic
planet-shadow boundary split those segments, so grazing density maxima and twilight
discontinuities cannot fall between unsplit sample nodes. The usual surface path
uses one view segment; an off-disk path uses at most three.

The surface shader carries vertex radial scale independently of the interpolated
object direction. A 48-by-96 tessellated Earth has chord midpoints about 3.4 km
below its intended ellipsoid and cell interiors up to about 6.8 km below it. Using
those chord points as atmospheric endpoints falsely added kilometres of dense
air and produced a repeating dark grid near the limb. Reconstructing the radial
endpoint removes this tessellation error while retaining interpolated numerical
terrain displacement; normalizing every displaced point to a unit sphere would
incorrectly erase real elevation. The mesh and physical orbital state are unchanged.

## Incident solar refraction and reflection boundary

Earth and Mars direct surface illumination use a qualified lookup of curved incident
solar rays. The production vertex shader performs eight nearest-texel reads and
explicit trilinear interpolation; it contains no shooting loop or RK4 integration.
The ray solve therefore cannot multiply with terrain vertex count or animation frames.
Physical terrain geometry, the engine epoch and orbital positions are unchanged.

The immutable numerical fields are generated explicitly by
`node tools/prepare_atmosphere_incident.mjs`. This offline tool solves
`dx/ds = u` and `du/ds = (grad(n) - u*(u·grad(n)))/n`, with up to six shooting
iterations and one final ray, each capped at 96 RK4 steps. Molecular and aerosol
density columns follow the same curved ray. Any nonfinite, negative-column or
nonconverged sample fails admission. No build or browser frame invokes preparation.
Dry-air and CO2 refractivities at 550 nm follow NASA PSG's dispersion equations.
Earth's reference uses 101325 Pa and 288.15 K; Mars scales standard CO2 refractivity
by `(610/101325)*(288.15/210)`. These are reference conditions, without humidity,
measured thermal inversions, current weather or chromatic splitting.

Each body has a 385 by 65 by 3 field with four float32 channels: signed small-angle
bending, molecular column, aerosol column and integration-valid marker. Each file
is 1,201,200 bytes; both total 2,402,400 bytes. Cosine addressing allocates 256 cells
to solar-normal cosine `[-0.02, 0.02]`, concentrating samples near the horizon.
The remaining cells cover zenith through 93 degrees. Earth altitude is 0 to 16 km
with quadratic spacing; Mars is -24 to 24 km with linear spacing, preserving signed
MOLA heights. Three curvature slices span 0.98 to 1.02 times the profile radius.
Near a hidden-side boundary the generator retains the limiting tangent-ray columns;
visibility is evaluated from the apparent direction independently. Interpolating a
zero column from a blocked neighbor must not brighten a still-visible ray. The small
bend is computed directly with `atan(cross, dot)`, avoiding cancellation between two
large approximate inverse-trigonometric angles.

The spherical field is applied to an oblate exponential atmosphere through a local
density-gradient and normal-curvature reduction. For physical point `p`, axis ratio
`q`, and profile radius `R`, let `rho = length(p.x, p.y, p.z/q)`,
`gvec = (p.x, p.y, p.z/q²)/rho`, `g = length(gvec)`, and `h = rho - R`.
The local normal is `gvec/g`; `t` is the unit Sun direction projected into its tangent
plane. The density-coordinate tangent Hessian is
`Htt = (t.x² + t.y² + t.z²/q²)/rho`. The field's equivalent spherical reference
radius is `g²/Htt - h`, and its columns are divided by `g`. This matches local normal
gradient and curvature through second order; it is an approximation to the full
ellipsoidal ray, qualified against that independent reference below. It is exact in
the spherical geometric reduction, without changing actual body/terrain positions.

Fields are pinned to the body profile, sampling domain, dimensions, format, source
modules, expanded generator GLSL, generation browser and binary SHA-256. The build
checks source and copied artifacts. Runtime independently checks the optical profile
encoding and hash, domain/format, exact byte count, finite decoded values and asset hash.
Loads have a single 20-second deadline, cancellation and a two-entry context-owned
cache. The selected/focused body requests its field at inspection size; resident
fields are reusable. Loading/unavailable fields retain straight incident transfer and
show that refraction state explicitly. Toggle optical transfer to retry. Departure,
visibility or selection changes abort obsolete pending work; context loss discards
its GPU resources. A late result cannot upload after its demand/context changes.

Profile identity uses `serializeAtmosphereProfile()` and the version
`atmosphere-profile-binary32-v1`. Its SHA-256 covers UTF-8 JSON with the envelope
`{encoding, profile}`. The profile is encoded recursively as typed tuples: numbers
use `["binary32", "3f800000"]` for the example value 1, strings and booleans retain
their values under their own type tags, null has a null tag, arrays retain element
order, and objects retain sorted key/value pairs. The full profile remains bound,
including body, model version, classification, source references and limitations.
Distinct scalar and container tags prevent metadata from impersonating a numeric
encoding. Numeric values must be finite both before and after `Math.fround`;
nonfinite values, binary32 overflow and unsupported value types are rejected.
Each numeric word is exactly eight lowercase hexadecimal digits from its big-endian
IEEE 754 binary32 bits, preserving signed zero. This identity byte order is separate
from the unchanged little-endian numerical field format.

The conversion binds the shader-facing binary32 profile values. ECMAScript permits
implementation-approximated exponentiation, while `Math.fround` specifies binary32
rounding with ties to even. Equal binary32 values therefore share an identity even
when a runtime's final binary64 coefficient bit differs; a changed binary32 word or
semantic value changes the identity. See [ECMAScript exponentiation](https://tc39.es/ecma262/2025/multipage/ecmascript-data-types-and-values.html#sec-numeric-types-number-exponentiate)
and [ECMAScript Math.fround](https://tc39.es/ecma262/2025/multipage/numbers-and-dates.html#sec-math.fround).
Preparation and runtime use this same encoding, and manifests must declare its
version; missing or unsupported encodings and mismatched profile hashes are rejected.
This identity operation does not mutate reference profiles, alter physical formulas,
or change uniform uploads, GLSL, field samples or numerical admission tolerances.
It uses no arbitrary decimal rounding or epsilon-based hash comparison. Separate
source/generator hashes, exact domain checks and data hashes continue to bind the
prepared artifact.

The committed fields were generated using Chrome 151.0.7922.174 / SwiftShader.
Byte-for-byte replay across GPU implementations or browser versions is not claimed;
regeneration requires fresh independent numerical admission. Ordinary builds verify
the pinned bytes and do not regenerate them. Lambert illumination and terrain direct
shadows use the apparent ray; night emission remains independent of solar attenuation.
Points outside the admitted field domain retain straight incident transport. This is
neither a trapped-ray solver nor a ray-traced camera image.

The observer/view path and the incident rays used by atmospheric single scattering
remain straight. Existing other-body eclipse geometry remains separate. The finite
solar disk, refracted eclipse boundaries, sub-triangle horizon precision, chromatic
dispersion, multiple scattering and cloud coupling are outside this implementation.
The vertex-level numerical tolerance below must not be presented as per-pixel or
astrometric observer accuracy. The separate world rotation removes oblate mesh scale
before transforming a physical ray, preventing body inflation from changing refraction.

The pure reference also includes unpolarized dielectric Fresnel reflectance and
Snell interface refraction with total internal reflection. GPU ocean glint remains
unavailable: the repository has no qualified water/material mask or cloud transmission
map. Archived blue pixels and negative DEM elevations are not ocean masks. A later
glint material needs an admitted binary water mask, source epoch/ice constraints,
explicit reference surface roughness, and either separated clouds or glint disabled
for opaque cloud composites. No claim of observational calibration follows from
passing mathematical tests.

- [NASA PSG radiative-transfer and refraction documentation](https://psg.gsfc.nasa.gov/images/help/handbook.pdf)
- [JPL Cassini lake reflection, explicitly infrared](https://www.jpl.nasa.gov/images/pia12481-reflection-of-sunlight-off-titan-lake/)
- [NASA MOD44W water-mask product](https://modis.gsfc.nasa.gov/data/dataprod/mod44w.php)
- [NASA ocean-color atmospheric correction and sun glint, chapter 7](https://oceancolor.gsfc.nasa.gov/docs/technical/NASA-TM-2016-217551.pdf)

## Numerical acceptance

The independent Python double-precision reference verifies exponential vertical optical
depth, grazing-ray convergence, solid-body solar occlusion, the vacuum limit, and
curved-ray escape/vacuum behavior. JS tests verify normalized phase functions,
Beer-Lambert transmission, Fresnel energy bounds, Snell's law, and inverse-square solar
scaling. GPU validation must compare actual compiled fragment results against the
reference at fixed camera/Sun geometries; surface-material tests that disable the
atmosphere do not satisfy this gate. Multiple scattering, measured spectral color,
cloud coupling, live weather, observer-ray refraction and mesh-interpolation accuracy
remain outside this qualification.

The initial float GPU readback against independent 512-view/512-column midpoint
reference covered 11 Earth/Mars cases: day, night, vacuum, inverse-square flux,
oblate polar geometry, 100 m grazing height, 10 km limb height, full and partial
twilight. The largest absolute transmission difference was below `9.7e-6`; the
largest nonzero scattered-light relative difference was below `0.00036`. These are
local SwiftShader numerical comparisons for those reference inputs, not empirical
atmospheric validation or a mobile performance guarantee. The runtime integration
and final artifact require their separate staged-browser checks.

The incident-refraction gate captures the actual production vertex shader's body
direction, rotated world direction and transmission through transform feedback with
ready, hash-checked fields. Thirty-six geometries cover the original thirteen rays
plus fractional lookup cells, sub-kilometer Earth heights, signed Mars elevations
through -22.37 and +20.73 km, polar/midlatitude meridional and diagonal rays, and a
closely spaced sweep through the refracted-rise boundary. The independent Python
solver uses float64, fixed 0.2 km RK4 steps and up to sixteen shooting iterations.
Acceptance remains 0.003 degrees for a visible vertex ray and
`0.0002 + 0.002*abs(T)` for each transmission channel. The v3 field candidate passed
all 187 assertions without changing those tolerances: 26 transfer, 18 combined
material, 108 physical incident-ray and 35 CPU/GPU field-interpolation comparisons.

That candidate's largest direction difference was 0.0002353 degrees; the largest
absolute transmission difference was 0.0003273. The largest fraction of the allowed
transmission error was 0.451. CPU/GPU lookup comparisons independently require
componentwise direction difference below `3e-6` and transmission difference below
`5e-5`; measured maxima were `1.174e-6` and `2.523e-5`, respectively. These are
point-sample model comparisons, not empirical calibration or a uniform all-rays
error proof. Final staged validation remains required after any source or field change.

`tools/incident_budget_validation.mjs` additionally runs the real production shader
with the admitted MOLA terrain at 4,753 and 74,305 vertices, checks all output values,
verifies the shared points agree, and rejects production RK4/shooting source. Its
recorded timings describe that test machine only; no frame-rate threshold is relaxed.

Run `node tools/atmosphere_validation.mjs --web-root=build/site --out=coverage/atmosphere`
against the chosen staged artifact. The gate verifies the selected release's module
hashes and records actual GPU results and independent reference hashes. Combined
surface-material probes also exercise incident and view transfer, linear-light
composition, inverse-square flux, legacy behavior, terrain shadowing, and preservation
of night emission. Staged whole-app render checks remain required separately.

The chord regression requires edge and cell-center samples to match the same
analytic surface, including an oblique limb view and a surface elevated by 10 km.
The original shader failed the three initial midpoint/elevation cases; the corrected
shader passes them without loosening the material tolerance. The original gate had
83 assertions: 26 transfer, 18 combined-material, and 39 vertex-refraction checks.
An actual staged Earth capture independently confirmed that the visible grid disappeared.
