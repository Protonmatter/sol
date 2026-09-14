# Advanced material implementation evidence

The implementation extends the accepted rendering direction without changing source
images, engine state, orbit/radius values, or the existing Earth presentation gate.
Each source/model admission below is separate from whole-application qualification.

## D2: synthetic dielectric reflection

`surfaceReflection.js` implements the bounded GGX distribution, separable Smith
masking and exact dielectric Fresnel for slope width alpha in [0.05, 1]. The matching
GLSL include is available for independent shader qualification. Its Python float64
reference is separately implemented in `tools/reflection_reference.py`.

The directional corpus has 400 cases: incidence/emergence 0, 30, 60, 80 and 89 degrees,
relative azimuth 0, 45, 90 and 180 degrees, alpha 0.05, 0.2, 0.5 and 1, synthetic
indices 1 and 1.5. CPU comparisons, reciprocity, equal-index and total-internal-
reflection cases pass. Normal-incidence hemisphere integration for alpha 0.2, 0.5
and 1 converges by less than 1e-5 between 256 and 512 midpoint polar samples and
remains below unit incident energy. This limited convergence corpus does not qualify
all grazing or narrow-lobe hemispheric integrals. GPU evaluation remains pending.

No Earth reflection record is admitted. The concrete missing inputs are a registered
categorical water/land/ice/unknown product, a band-specific refractive-index and
roughness model, cloud/baked-highlight treatment, and independent held-out directional
measurements. NASA MOD44W alone supplies neither roughness nor the latter measurements.
The existing photographic material receives no added uncalibrated lobe.

References: [Walter et al. (2007)](https://www.cs.cornell.edu/~srm/publications/EGSR07-btdf.pdf),
[NASA MOD44W description](https://modis.gsfc.nasa.gov/data/dataprod/mod44w.php).
