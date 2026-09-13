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

Earth and Mars direct surface illumination use a curved incident solar ray. At each
mesh vertex the GPU solves `dx/ds = u` and
`du/ds = (grad(n) - u*(u·grad(n)))/n`, shooting outward until the exit direction
matches the physical Sun direction. The exponential refractive-index profile uses
the same ellipsoidal altitude and gas scale height as molecular extinction. Dry-air
and CO2 refractivities at 550 nm follow NASA PSG's dispersion equations. Earth's
standard reference value is evaluated at 101325 Pa and 288.15 K; Mars CO2 scales
the standard refractivity by `(610/101325)*(288.15/210)`. These are reference
conditions, with no humidity, measured thermal inversions or chromatic ray splitting.

The shader uses at most six shooting iterations plus one final ray, each bounded
to 96 RK4 steps. Density columns are integrated in those same RK4 states, so the
incident attenuation follows the curved path. Apparent body-frame and world-frame
Sun directions and transmission are interpolated across mesh triangles. Surface
Lambert illumination and the terrain direct-shadow direction use the apparent ray;
night-light emission remains independent of solar attenuation. If a ray fails its
step bound, the model falls back to the existing straight incident path. This is
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
direction, rotated world direction and transmission through transform feedback.
Thirteen reference cases cover Earth zenith angles 0, 60, 80, 89, 90.2, 90.8 and
92.5 degrees; Mars 80, 89 and 90.01 degrees; oblate Earth at latitude 45 degrees;
10 km elevated terrain; and the `n -> 1` limit. The independent Python solver uses
float64, fixed 0.2 km RK4 steps and up to sixteen shooting iterations. Acceptance
is fixed at 0.003 degrees for a visible vertex ray and `0.0002 + 0.002*abs(T)`
for each incident transmission channel. The initial measured maximum visible ray
difference was below 0.000069 degrees and maximum absolute transmission difference
below 0.00004. This is a reference-model solver comparison, not empirical calibration.

Run `node tools/atmosphere_validation.mjs --web-root=build/site --out=coverage/atmosphere`
against the chosen staged artifact. The gate verifies the selected release's module
hashes and records actual GPU results and independent reference hashes. Combined
surface-material probes also exercise incident and view transfer, linear-light
composition, inverse-square flux, legacy behavior, terrain shadowing, and preservation
of night emission. Staged whole-app render checks remain required separately.

The chord regression requires edge and cell-center samples to match the same
analytic surface, including an oblique limb view and a surface elevated by 10 km.
The original shader failed the three initial midpoint/elevation cases; the corrected
shader passes them without loosening the material tolerance. The expanded gate has
83 assertions: 26 transfer, 18 combined-material, and 39 vertex-refraction checks.
An actual staged Earth capture independently confirmed that the visible grid disappeared.
