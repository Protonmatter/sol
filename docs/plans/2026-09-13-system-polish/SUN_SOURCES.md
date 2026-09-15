# Sun presentation and source boundaries

Date: 2026-09-13. Scope: observation presentation and the Sun's display material;
no ephemeris, state estimation, model-region, physical-scale, or collision changes.

## Source-preserving observations

The default Observe view retains the original 1024x1024 NASA SDO/AIA 171 JPEG,
captured 2026-09-12 at 00:07:22 UTC. Its source archive URL, embedded caption,
SHA-256, byte count, credit and archival status remain in `visual-assets.v1.json`.
This change does not replace or requalify that source. Gold is the provider's
false-color EUV display, not a visible-light color measurement.

Research's optional NASA browse channels also remain in the original camera
plane. The renderer fits the complete image, with its aspect ratio unchanged,
inside the canvas. Normal browser image resampling is permitted; crop, recolor,
extra limb shading, and a model-radius outline are not applied. This preserves
source captions and off-limb corona and avoids darkening magnetogram display
values. Synthetic model rendering and its coordinates remain a separate branch.

The mutable Research channel URLs have no verified capture epoch. Their UI
continues to say that capture time is unavailable; a successful image load is
not evidence of freshness or registration. HMIIC is explicitly identified as
provider-colorized continuum intensity. Model markers and magnetic fields are
not overlaid on these unregistered observations.

Observe initially shows a loading message and reports its media region busy.
Failure retains the archival source/date and offers a user-triggered retry.
Retry restores visible pending feedback until load or error; repeated renders
do not create requests or manufacture readiness. Hidden pending images still
load eagerly and never use lazy loading.

## Three-dimensional Sun

The existing shader's emissive Sun branch now receives the explicit display
RGB `[1, 0.98, 0.94]` instead of the gray missing-detail material. NASA documents
the Sun's visible-light appearance as white. The small warmth, display exposure,
existing smooth limb factor and additive halo are illustrative presentation
choices, not calibrated radiance, a measured limb-darkening law, or a corona
reconstruction. The material is independent of the externally lit planet branch.

`u_style=-1` stays in force. The retained unverified `textures/sun.jpg` stays
ineligible. This change does not enable its dormant hemisphere projection,
procedural spots, invented granulation, or magnetic loops. It does not reuse the
AIA camera image as a sphere texture or imply observed far-side detail.

## Acceptance evidence

- Actual renderer tests require a white emissive Sun material, no qualified
  texture substitution, the original engine origin, and unchanged body state
  and time when toggling Reference imagery.
- The browser Sun assertion retains its tint bounds and requires median
  luminance at least 190/255 among its existing central bright-pixel sample.
  This catches the former gray display. It is a deterministic UI regression
  threshold, not photometry or a claim about monitor calibration.
- Source-render tests exercise HMI continuum, HMI magnetogram and AIA 171;
  verify full-frame placement and no added limb shading or model outline;
  test nonsquare aspect fitting; and verify the model retains its own rim.
- Observation tests cover initial pending, failure, explicit retry, delayed
  completion, source-date retention, busy state and deliberate model entry.

Initial focused regressions recorded seven expected failures before the changes
(`coverage/system-polish-sun-red.log`). The caption correction separately failed
before implementation (`coverage/system-polish-sun-caption-red.log`). Final
focused results are retained in `coverage/system-polish-sun-green.log`.

## Official references

- [NASA SDO HMI and AIA channels](https://sdo.gsfc.nasa.gov/data/channels.php):
  instrument observables and spectral interpretation.
- [NASA explanation of solar colors](https://svs.gsfc.nasa.gov/vis/a010000/a013800/a013859/script_31299_00.html):
  visible white appearance and assigned colors for SDO's nonvisible channels.
- [NASA SDO image products](https://sdo.gsfc.nasa.gov/data/):
  HMI intensitygram color, flattened and ordinary display products are distinct.
- [NASA comparison of AIA wavelengths](https://science.nasa.gov/photojournal/comparing-wavelengths/):
  171 and 304 expose different plasma structures.
- [NASA SDO data rights and rules](https://sdo.gsfc.nasa.gov/data/rules.php):
  source attribution and the limits of browse products for scientific analysis.

A future higher-resolution image or dated movie needs its own immutable source
record and original-frame review. More detailed 3-D reconstruction is a separate
qualification task, not a reason to relax the existing source holds.
