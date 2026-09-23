# Science and mathematical model

This document separates established physical relationships, empirical solar approximations, and proposed visual models. Source identifiers resolve in [sources.md](sources.md). Equations specify the intended implementation; writing them is not evidence that the solver has been implemented or validated.

## 1. Physical layers and observing channels

| Layer | Physical interpretation | Proposed display |
|---|---|---|
| Core | Nuclear energy production, approximately inner quarter of solar radius | Cutaway only; explanatory energy-flow depiction, not a movie of measured convection. |
| Radiative zone | Radiative energy transport outside the core to approximately 0.7 solar radius | Cutaway only; schematic diffusion, no suggestion photons cross it in displayed seconds. |
| Convective zone | Outer interior where bulk motions transport energy | Cutaway plus a separate close-up photosphere illustration; never represent the entire convection zone as a solid shell. |
| Photosphere | Thin continuum-forming region, conventionally the visible surface; nominal effective temperature 5,772 K | Opaque emissive boundary; continuum limb darkening, sunspots, faculae, resolved granulation. |
| Chromosphere | Structured lower atmosphere above the photosphere; line-dependent emission/absorption | Observed 304 imagery and labeled schematic spicule/prominence view; not a generic fire layer. |
| Transition region | Highly structured interface with rapidly increasing temperature | Explain through channel choice and thin emitting structures; no globally uniform solid orange shell. |
| Corona | Tenuous hot plasma; field-related structure and optically thin emission in many EUV channels | Volumetric/strand emission with photospheric occultation; channel response and relative brightness explicit. |
| Extended corona / wind | Expanding magnetized plasma | Separate extended view with suitable scale; field/plasma tracers illustrative, not individually visible solar-wind particles. |

Approximate interior boundaries are educational choices based on NASA layer descriptions [N01–N04], not a precision solar-structure model. Use existing source constants and IAU nominal conversion constants [P01] for geometry. Distinguish a nominal radius from wavelength-dependent apparent radius and a source header's reference radius.

Initial channel rules [N05]:

- **Visible continuum:** quiet disk near neutral white; the instrument-specific HMI product is a derived continuum observable near Fe I 6173 Å, not a full visible-color photograph.
- **171 Å:** gold false-color display; strong quiet-corona/upper-transition-region response near log10(T/K)=5.8. This nominal value is descriptive, not a thermometer for each pixel.
- **193 Å:** distinct cool-corona and hot-flare contributions. Do not use a single peak for quantitative work.
- **304 Å:** He II/lower-atmosphere diagnostic with transfer complexities. It cannot inherit the optically thin iron-channel approximation without review.
- Magnetic polarity overlay is a visualization of a field model or magnetogram, not visible emitted light.

## 2. Units, axes, rotation and clocks

### 2.1 Canonical scene coordinates

Use solar-centered right-handed Cartesian coordinates in the Carrington frame. Define +Z toward solar north, +X at longitude zero, and +Y at +90 degrees west-positive Carrington longitude. Heliographic latitude b and west-positive longitude l are radians inside numerical routines:

`p/R = (cos(b) cos(l), cos(b) sin(l), sin(b))`.

World/observer conversion is one explicit orthonormal matrix with determinant +1, validated against known source WCS and the current ephemeris orientation. The existing source-frame +Y-north convention is adapted once, not silently reused as the new canonical frame. Test handedness with a labeled north/east/west reference. Preserve FITS pixel-center and image-v sign conventions in observed mode.

Lengths are meters in Rust scientific routines, solar radii in browser geometry and Blender, with one declared scale `R = 6.957e8 m`. Time is SI seconds since scenario epoch. UTC strings identify observations; numeric model durations are monotonic seconds. Keep the orbital ephemeris's existing TT/UTC conversion independent. Millisecond timestamps do not imply subsecond observational precision.

### 2.2 Differential rotation

Adopt the **existing engine's** declared magnetic-tracer fit for related modeled components:

`Omega(b) = 14.713 - 2.396 sin²(b) - 1.787 sin⁴(b)` degrees/day.

In the Carrington frame use `Omega_rel = Omega - 14.1844`. Convert to radians/second exactly once at the boundary. The browser receives already posed region anchors or model coefficients for pure rendering evaluation; it does not add a second full sidereal rotation to an already transported field.

The legacy renderer's NSSDC-style coefficients remain confined to legacy mode. Rotation fits depend on tracer and latitude, so do not advertise one fit as an exact universal fluid rotation rate. NASA rotation context is [N04]; baseline implementation is `crates/solar-core/src/differential_rotation.rs`.

### 2.3 Time model

`scenario_time = anchor_scenario_time + rate * (monotonic_now - anchor_wall_time)` while playing. On pause, rate change, backgrounding, or visibility loss, materialize the current scenario time and stop accumulation. Background return remains paused until explicit resume; no hidden catch-up jump. Seeking samples the absolute scenario time, never integrates a shader counter forward.

Proposed presets: **Detail 60x**, **Activity 600x**, **Rotation 7,200x**, plus **1x**. These are explicit temporal multipliers shared by all modeled processes. At high rates, unresolved fast variability is time-averaged, not secretly slowed. Source-sequence rate advances acquisition time only. Changing the planet date does not claim that a selected historical Sun sequence occurred at that date.

## 3. Photosphere image formation

### 3.1 Planck-based contrast and limb darkening

Use the wavelength-domain Planck function [P02]:

`B_lambda(T) = (2 h c² / lambda^5) / expm1(h c / (lambda k_B T))`.

Units are W m^-3 sr^-1 when wavelength is meters. Use f64 and `expm1`; reject nonfinite or nonpositive wavelength/temperature. This is a thermal approximation, not a replacement for a stellar-atmosphere spectrum.

For the first illustrative continuum mode, use a normalized grayscale contrast at a declared reference wavelength of 550 nm:

`C(T) = B_550nm(T) / B_550nm(5772 K)`.

Map quiet continuum to neutral display white. This avoids pretending an arbitrary orange palette is true solar color. A later broadband color mode must use pinned spectral-response/color-matching tables with explicit observer and white-point definitions, not three ad hoc RGB wavelengths.

For each visible surface point let `mu = max(0, dot(normal, direction_to_camera))`. Initial illustrative linear limb law:

`I(mu,T) = C(T) * [1 - u*(1-mu)]`, with initial `u=0.6`.

The coefficient is a **proposed illustrative setting**, not measured limb darkening for every instrument. Store the law, coefficient, wavelength and source/assumption in the manifest. Unit test monotonicity, nonnegative intensity, center value and disk-integrated factor `1-u/3`. Upgrade to tabulated wavelength-dependent coefficients only with an admitted source. Do not reapply limb darkening to an observed image that already contains it [N06].

### 3.2 Granulation without a false resolution claim

Granules have order-1,000-km sizes and minute-scale lifetimes; supergranulation is substantially larger and slower [N07,N08]. At projected solar diameter D pixels, a feature of physical size d has approximate central projected size `p = D*d/(2R)`. Require at least two pixels for resolved detail and blend its contrast from zero to one between p=1 and p=3. Also filter using local surface derivatives toward the limb. At D=300, d=1,000 km, p≈0.216: individual granules should be unresolved.

Keep the existing coarse magnetic transport grid unchanged. Add a separate deterministic **statistical appearance field**, clearly marked as such:

1. Evaluate a Cartesian 3-D cellular field on unit sphere directions to avoid longitude seams/pole singularities. Physical cell scale sets `S=R/d` in `x=S*p_unit`.
2. Use an explicitly specified u32 hash shared by Rust and GLSL. Hash `(scenario_seed, integer_cell_xyz, generation)` to derive site jitter, lifetime and phase. No wall-clock randomness or platform-dependent library RNG.
3. Within each cell, use overlapping generations with compact C1 growth/decay envelopes. Stable per-site IDs control radius/temperature contrast; neighboring sites grow, displace boundaries and disappear. Compute weighted nearest and second-nearest sites over a fixed 3×3×3 neighborhood. A bounded distance difference provides bright cell centers and narrow intergranular lanes.
4. The initial center/lane contrast is a manifest parameter, tuned against separately admitted resolution-matched references; it is not a measured temperature map. Temperature perturbations are capped, and sunspot masks reduce granular contrast.
5. Evaluate only when resolvable. At coarse scale render its filtered mean, with limited aggregate texture if supported by the selected channel. Do not enlarge 1,000-km granules into Earth-sized cells to make them visible.
6. A zoomed patch shows a scale bar and its global anchor. Use analytic spherical mapping rather than a tiled flat texture dragged across the disk.

This model gives convection-like morphology; it does **not** solve compressible convection or preserve a measured velocity field. A future Bifrost-derived patch can replace its input data after source, units, boundaries and temporal sampling are validated [P05]. Distinguish patch-domain evidence from full-star reconstruction.

Recipe v1 makes the first implementation reproducible without an unspecified noise library. Use the following u32 mixing operation, with wrapping multiplication: `x ^= x >> 16; x *= 0x7feb352d; x ^= x >> 15; x *= 0x846ca68b; x ^= x >> 16`. Combine signed integer cell coordinates converted modulo 2^32 as `mix(seed ^ mix(cx) ^ rotl(mix(cy),11) ^ rotl(mix(cz),22) ^ mix(generation))`. Derive independent attributes by mixing distinct fixed attribute IDs; convert the upper 24 bits to [0,1) with division by 2^24. Rust and GLSL must agree bit-for-bit for this integer stage, including negative coordinates.

Initial granulation recipe: d=1,000 km; site jitter at most 0.2 lattice unit around the cell center; one birth each 600 scenario seconds with a per-cell phase offset; each generation lives 1,200 seconds, so evaluate the current and preceding generation. Use `envelope=sin²(pi*age/1200)` inside the lifetime, zero outside. This has zero derivative at birth/death and gives asynchronous growth across cells. Bound weighted-distance perturbation to 0.05 lattice-unit squared and test the selected neighbor support against a wider CPU search before admitting the 3×3×3 shader path. An illustrative temperature perturbation amplitude of 150 K is the initial tuning point, with total photospheric temperature constrained to a finite recipe range. These are model settings to review, not newly measured solar statistics. Any parameter revision changes the recipe hash and its reference fixtures.

### 3.3 Spots and faculae

Consume stable active-region IDs and poses from the model's validated snapshot sequence. Use smooth elliptical/geodesic masks for umbra and penumbra, with radial fine structure only when resolved. Temperatures/contrast are illustrative bounded parameters; initial umbral contrast should be reviewed against continuum references, not chosen to make black holes in the disk. Regions emerge/grow/decay using C1 envelopes and persist for appropriate scenario durations. Magnetic-field units remain normalized until calibration exists.

A facular mask can depend on the **modeled** field magnitude and viewing angle, using an explicit bounded contrast function that strengthens toward the limb. This is a phenomenological appearance relation, not an inversion from field strength to temperature. Keep quiet, spot and facular components separately available in diagnostic outputs.

## 4. Magnetic structure and coronal topology

### 4.1 Do not infer a magnetogram from image brightness

EUV intensity is neither signed magnetic flux nor unique loop connectivity. A scalar activity index is also insufficient. Use the existing normalized signed radial model field only as a **synthetic boundary field**, or admit a separately qualified radial magnetic map with its own units, epoch, observer and coverage [N09,P03]. A synoptic map is assembled over time; it is not an instantaneous full-Sun measurement.

For the first model pack, form a flux-balanced field from a low-order global component and modeled bipolar regions. Resample latitude/longitude cell averages using area weights `Delta_phi * (sin(b_hi)-sin(b_lo))`. Record any removed net monopole and the pre/post flux integrals. Never silently force measured data into a balanced map without a documented derivation.

### 4.2 Potential-field source-surface model

For a slowly evolving illustrative quiet/large-scale corona use PFSS [P03,P04]:

`curl(B)=0`, `div(B)=0`, `B=-grad(Psi)`, hence `laplacian(Psi)=0`.

Boundary conditions: `Br(R,b,l)` from the declared boundary field; tangential field zero at `Rss`. Set initial `Rss=2.5R` as an explicit model choice, not a measured edge of the corona.

In normalized radius r/R, use real orthonormal spherical harmonics with explicitly documented normalization, longitude sign, and Condon–Shortley convention:

`Psi = sum_(l=1..L,m) a_lm [r^l - Rss^(2l+1) r^(-(l+1))] Y_lm`.

At r=1, coefficient `a_lm = -b_lm / [l + (l+1) Rss^(2l+1)]`. Implement scaled ratios to avoid unnecessary large powers. Cartesian field/derivative evaluation handles poles without division by tiny sin(theta). Initial offline `L=32`; convergence qualification compares L=16/32/64. This is a new optional appearance solver, not a rewrite of `flux_transport.rs`.

Compute PFSS and trace geometry **offline in Rust/CLI**. Do not run a fresh global extrapolation per browser frame. The browser loads prevalidated scene keyframes. Optional research recomputation is a later bounded worker feature only after profiling.

Trace lines by `dx/ds = ±B/|B|`, using adaptive RK4 step-doubling, proposed positional local tolerance 1e-5 R, step range 1e-4–0.02 R, maximum 4,096 accepted steps per direction, and explicit termination on surface, source surface, domain escape, null/weak field or step budget. Seeds have stable IDs and reproducible field-weighted distribution. A budget termination is not relabeled as an open field line. Use stable geometry IDs between snapshots; a connectivity change is a classified topology event, not arbitrary vertex morphing.

**PFSS does not determine plasma density or temperature, cannot reproduce free magnetic energy/current systems, and cannot simulate reconnection, flares or a CME.** Use it to constrain quiet topology only. Do not generate erupting flux ropes by claiming that a sequence of potential fields is an MHD eruption. The current pfsspy project is archived; use its methods/tests as a reference, not a new mandatory runtime dependency [P03].

### 4.3 Density, heating and local motion

Initial emissivity is an explicitly **dimensionless reduced atmosphere model**. Give each admitted strand a cross-section, base amplitude, temperature proxy, local heating envelope and along-strand flow descriptor. All are scenario parameters with validity ranges.

A low-coronal background can use `n(h)/n0 = exp(-h/H)` over its declared limited height interval, with `H=k_B*T/(mu_bar*m_p*g)` as a hydrostatic scale-height estimate. For T=1 MK, mu_bar=0.6 and g=274 m/s², H≈50 Mm. This is a low-height, approximately isothermal reference, not a global wind solution. Outside its validity interval, use a separately documented extended-corona density model or fade the illustrative layer with a declared domain boundary.

Strand cross-section weight is `exp(-d_perp²/(2 sigma²))`. A local pulse moves along arc length with declared v(s,t), and each event has its own onset and decay. Pulses need not change the geometry. Their parameters are immutable per event; evaluated brightness must not depend on render fps. Do not call apparent moving brightenings measured mass transport.

Open/closed field classification can inform qualitative plumes and darker coronal-hole regions, but field topology alone is not a temperature/density measurement. Density/temperature changes remain heuristic unless imported from a qualified simulation.

## 5. Radiation and compositing

Along a ray, solve `dI/ds = j - alpha*I`. For a uniform segment, transmitted incident light is `I_in*exp(-alpha*ds)` and segment emission is `(j/alpha)*(1-exp(-alpha*ds))`; use the stable limit `j*ds` for alpha near zero.

For coronal iron-channel emission under an optically thin equilibrium approximation:

`I_channel = integral n_e² * R_channel(T, composition, calibration_epoch) ds`.

This notation assumes the response function incorporates the adopted abundance, ionization and density conventions. Some tables use `n_e*n_H` instead; schema and units must specify which. A true instrument-response path needs pinned effective-area/response tables and calibration history [P06]. For initial relative rendering use `j_relative` with explicit dimensionless units and a declared channel-style weighting. Do not invert stretched Helioviewer browse pixels into density or temperature [N10].

AIA/304 and H-alpha/cool prominence transfer require different treatment. Initial observed playback preserves the source pixels. Initial illustrative prominence uses a clearly labeled emission/absorption surrogate, with positive optical depth and bounded line-of-sight contrast; no non-LTE fidelity claim. It can appear bright off limb and dark against the disk depending on the recipe [N03].

White-light extended corona uses electron-scattered photospheric light, not a 1-MK blackbody. A later reference path can integrate a Thomson-scattering kernel with finite-disk illumination and pinned geometry. Until qualified, label its radial density/phase-function approximation. Never render the EUV corona using Blender's fire-temperature blackbody settings.

For a disk-intersecting ray, integrate foreground corona only up to the nearest opaque photosphere intersection; integrate the full bounded volume for off-limb rays. Sort/integrate absorptive cool structures within the same transfer path so multiplying a late full-screen alpha mask cannot absorb foreground light incorrectly. Opaque foreground planets/moons terminate or mask appropriate ray segments in the existing scene's depth convention.

## 6. Events, interiors and scientific limits

Flares are transient radiative events; CMEs eject material. They are not synonymous and one need not imply the other [N03]. Default illustrative scenarios are non-eruptive. Explicit event selection loads a tagged kinematic model with onset, growth, propagation and decay; no looping 22-second event timer. Trajectories obey the declared units and clock but are not predictions of magnetic instability. An eruption can initially be a separate bounded expanding toroidal/shell emissivity template with a finite source region and changing width, used only in the event lesson.

The interior cutaway may illustrate hydrostatic balance `dP/dr=-G M(r) rho/r²`, mass conservation `dM/dr=4 pi r² rho`, and radiative/convective transport conceptually. Without a qualified solar-structure profile, show schematic layer boundaries and no numerical density/pressure readouts. Do not run an invented stellar solver in the shader. Full radiative MHD requires continuity, momentum including Lorentz force, induction, energy, radiation, conduction, thermodynamics and boundary conditions; NASA/Bifrost examples demonstrate the much larger computational scope [P05,P07].

## 7. Numerical implementation rules

- Rust f64 references; f32 GPU evaluation and packed fields with a documented error budget.
- Deterministic seeds and absolute-time event IDs. Fixed ordering and versioned hashes; bitwise metadata/descriptor reproducibility on a pinned toolchain, tolerance-based floating-point parity across targets.
- Reject NaN/Inf, negative physical sizes, nonpositive lifetimes, out-of-range epochs, oversized grids and unsupported coordinate/time conventions.
- Reuse existing transport checkpoints and avoid changing their scientific state through appearance sampling.
- Do not extrapolate observed sequences, scenario geometry, response curves or magnetic maps beyond admitted validity windows.
- Every parameter is tagged `constant`, `observed`, `derived`, `model_assumption`, or `display_setting`. Parameter changes invalidate the scenario/recipe hash.
