# Scientific and distribution review dispositions

These decisions resolve recommendations that require source interpretation rather than an unconditional implementation change.

## Differential rotation attribution

The reduced model's `14.713 - 2.396 sin²(latitude) - 1.787 sin⁴(latitude)` degrees/day represents the Doppler-feature tracking fit of Snodgrass & Ulrich (1990), *Astrophysical Journal* 351, 309–316. [Original paper, Table 1 on page 315](https://articles.adsabs.harvard.edu/pdf/1990ApJ...351..309S) distinguishes Doppler Residuals, Magnetic and Spectroscopic fits. The Doppler column is `2.972, -0.484, -0.361` microradians/second. Its approximate degree/day representation is consistent with the reduced model; it is not the magnetic-tracer fit previously named in the comment.

The attribution is corrected in [differential_rotation.rs](../crates/solar-core/src/differential_rotation.rs). Numerical coefficients remain unchanged: changing the physical tracer model would be a different scientific choice, not an attribution correction. The paper's rounded coefficients and uncertainty do not support treating the model's extra decimal places as additional measurement precision.

## Out-of-range catalogue moons

The optional long-range fallback is not adopted. The retained rows are osculating elements and interpolated knots, not a verified long-range mean-element model. The [moon source notes](../tools/ephemeris-data/moons/README.md) describe the failure of simple propagation and the validated interval. Freezing an osculating ellipse and advancing its Kepler phase can produce a finite animation, but omitted perturbations, resonances and secular precession remove any established relationship to the selected distant date. A warning cannot supply that missing relationship.

Dated moon positions, hit targets and shadows therefore remain unavailable outside the admitted interval. Catalogue identities, facts, explicit unavailability and parent-body framing remain accessible. Earth’s Moon uses the separate engine model. This is a completed disposition of the optional fallback recommendation; it does not extend any accuracy claim.

## Catalogue format

Retain generated JavaScript and full numeric precision. Measurements on the reviewed data with gzip level 9:

| Data | Current JavaScript | Float64 binary alternative |
| --- | ---: | ---: |
| Moon elements | 429,886 bytes | 530,564 bytes, numeric payload only |
| Star catalogue | 141,791 bytes | 146,405 bytes numeric payload, plus 16,663 bytes named-star metadata |

Binary conversion would increase compressed transfer before adding its schema/container. Demand-driven loading addresses the actual first-use cost without losing precision or introducing a second data format. These are encoding measurements, not browser timing results.

## Corresponding-source distribution

Keep exact-version corresponding source in the immutable release. The source archive is already an optional manifest asset rather than ordinary application startup data. Moving it to another host would reduce deployment storage, not automatically reduce page transfer; no replacement hosting target has been supplied. Preserve the source portal, complete source inventory, artifact digests and offline release checks. The new bundling pipeline must retain original source binding independently of emitted chunk names.

## Qualification limits

Native reference comparisons qualify only their recorded runtime, quantities and samples. Matching source or build receipts establish provenance, not an unperformed numerical comparison of a different binary. Browser tests using software GL establish functional behavior on that renderer; physical-device frame timing, visual fidelity and thermal behavior require actual device evidence. Do not relabel either as completed hardware qualification.
