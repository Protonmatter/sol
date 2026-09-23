# Sun look development

`sun-look-lab.html` is a standalone WebGL2 prototype for the Solar System Sun's
appearance. It is a design reference for porting into the dynamic Sun renderer
(`apps/web/js/solarSurfaceShaders.js` and `solarAtmosphereShaders.js`). It is not
part of the web release and is not loaded by the app.

Open the file directly in a browser. The live render appears beside a reference
image. Controls cover:

- palette (orange, or gold in the style of AIA 171 Å)
- size on screen, from the Solar System overview to a close-up
- individual layers: network, dark regions, loop fans, limb corona, prominences
  and bloom
- evolution speed; reduced motion starts the render paused

## Techniques

| Feature | Technique |
| --- | --- |
| Quiet network | Two Worley layers with bright points, plus ridged "flame" noise. Lattice gradients rotate over time (flow noise), so the surface evolves in place instead of sliding. |
| Dark regions | A domain-warped threshold roughened at two finer scales, dimmed to about 30% with texture kept inside. |
| Active regions | Contours of the angle two poles subtend give dipole fan arcs, frayed by noise, over uneven hot cores and a plage. |
| Off-limb | Emissive rim, radial streaks stretched along height, loop arcades footed along the limb near active regions, and turbulent prominence ropes in their own channel. |
| Composition | Scalar intensity is rendered to a float target, blurred for bloom, then mapped through one palette so highlights roll off to white. |
| Level of detail | Fine terms fade in with the disk's radius in pixels, so the overview Sun stays a clean glowing disk. |

## Port status

The first port lives in `apps/web/js/solarLookShaders.js` (see "Artistic detail
layer" in `docs/DYNAMIC_SUN.md`). It differs from this prototype on purpose:

- Loop fans are 3-D loops between each emission region's admitted footpoints,
  thinner than the prototype's surface arcs.
- The prominence is a thinner three-thread arch.
- Limb fur takes its brightness from the surface beneath it, so it is strong over
  active regions and network and nearly absent over coronal holes, instead of an
  even rim around the whole circumference.

This prototype has not been updated with those changes.

## Limitations

- The render is illustrative. Fan arcs and prominences are artistic, not measured
  magnetic structure or observations.
- The page loads fonts from Google Fonts and falls back to system fonts offline.

## Reference images

The page embeds three reference images, downscaled to 560 pixels:

- Reference 2 is an SDO/AIA 171 Å image, courtesy of NASA/SDO and the AIA
  science team.
- References 1 and 3 are artistic renders supplied by the project owner for look
  matching.
