# Titan visible-light display

Titan retains its existing orange base material and published geometric-albedo display scale. The actual pre-change screenshot (`coverage/system-polish-preview/titan.png`) and GPU input both show an orange disk; the initial description of a gray Titan was not reproduced. The bounded change separates the main orange haze from the tenuous blue high-altitude rim, and makes the primary object card explain that this is an illustrative visible-light atmosphere whose opaque haze hides the surface.

## Source evidence

- [NASA/JPL PIA06230, Cassini's View of Titan: Natural Color Composite](https://www.jpl.nasa.gov/images/pia06230-cassinis-view-of-titan-natural-color-composite/) combines red, green and violet-filter images acquired on April 16, 2005. NASA describes an approximately human-eye view with an orange globe and a tenuous blue surrounding haze. The image was published April 22, 2005. This camera view establishes the qualitative hue distinction; it is not a globally registered surface map.
- [NASA PIA21625, Highlighting Titan's Hazes](https://science.nasa.gov/photojournal/highlighting-titans-hazes/) combines red, green and blue-filter images acquired May 29, 2017 and published August 11, 2017. The caption distinguishes the blue high-altitude haze from the orange main atmospheric haze in a backlit view. These acquisition dates remain source-reference dates, independent of SOL's model clock.

## Implementation boundary

- The existing `fallbacks.Titan.rgb` remains `[0.72, 0.48, 0.24]`. `moonBaseColor` continues to normalize its hue by the existing luma weights and scale it by `MOON_ALBEDO.Titan = 0.2` relative to the existing catalog reference. This patch does not revise the albedo table or claim a newly calibrated transfer function.
- `moonAtmosphereColor("Titan")` supplies `[0.35, 0.5, 0.7]` to the existing view-angle/illumination-dependent rim term. This exact RGB and the existing rim strength are illustrative display choices. Neither source is sampled to claim calibrated RGB, atmospheric altitude, optical depth, a precise scattering law, or present weather.
- The existing physical-position light direction and eclipse attenuation remain unchanged. Other moons receive zero atmosphere color. Titan still uses `u_style = -1` and no photographic texture, preventing procedural storms and unsupported infrared surface details.
- The primary card uses the manifest's explicit orange-haze/illustrative-color disclosure. The source agent maintains the official source link and provenance record. No new raster is admitted, and no legacy mapping hold changes.

## Acceptance and evidence

`tests/web/titanAppearance.test.mjs` executes the production renderer with controlled browser/GPU I/O. It checks the actual Titan sphere's physical position, orange base, blue rim, published-albedo/eclipsed display gain, absent texture/procedural features, cleared Earth layers and parent shadow uniforms, and unchanged epoch/body snapshot when reference imagery is toggled. A separate primary-card check retains the appearance explanation with imagery both on and off.

The pre-change run fails at the blue-rim and caption assertions while the orange-base and albedo assertions already pass. The two failures are retained in `coverage/system-polish-titan-red.log`. Final integrated browser appearance and the full repository gates are recorded by the root integration task.

After the helper and caption were integrated, `node --experimental-vm-modules --test tests/web/titanAppearance.test.mjs tests/web/orrery_review_regressions.test.mjs tests/web/destinationCards.test.mjs tests/web/visualAssets.test.mjs tests/web/moonShadows.test.mjs` passed all 46 tests. The log is `coverage/system-polish-titan-green.log`; it includes existing moon-shadow geometry and eclipse tests as well as the two new Titan regressions.
