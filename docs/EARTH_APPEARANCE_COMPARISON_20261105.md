# Earth appearance comparison — 2026-11-05

The user's soft/hazy and crisp/high-contrast Earth screenshots represent a
substantial appearance difference. Fresh matched application captures reproduce
that difference between Source-qualified and Illustrative. The screenshots alone
do not establish the original active modes, camera, or artifact identities.
The approved detailed Illustrative look remains the fresh-session default.
The user explicitly confirms keeping Illustrative Earth on 2026-11-05. Rendering
and performance changes must preserve that appearance choice, including the
recovered cloud recipe, dark oceans and atmospheric edge. The existing explicit
scientific-layer/HDR routes retain their separate behavior.
No application material, model, coefficient, or staged bytes changed in this check.

## Matched captures

Both captures use the actual staged application, Chrome 156, a paused epoch of
2026-07-08T12:00:00Z, the same nine positions, camera and 796 × 612 canvas.
Camera azimuth is -3.933385013174217, elevation 0.62, radius 0.2889281244233805.
The observed native backend is Qualcomm Adreno X1-85 through ANGLE D3D11.
A separate Windows SwiftShader LLVM pair reproduces the difference.

| Source-qualified | Illustrative, current default |
| --- | --- |
| Softer cloud/land contrast and a broad hazy response | Sharper clouds, darker oceans and brighter atmospheric edge |
| Registered January 2004 surface, existing reference optical path | Recovered July 2004 Look Lab v7 surface and display recipe |
| 5400 × 2700 source surface map | 5400 × 2700 source surface map |

The texture dimensions are unchanged between these modes; this is not evidence
of a source-resolution loss. Mode selection changes both imagery and material
treatment. The Illustrative recipe retains 1.6 exposure, dark-ocean grading,
cloud depth, cloud lighting and shadows, as documented in
[RFC 0009](rfcs/0009-sites-earth-v7.md). Appearance does not establish calibrated
reflectance or observed/current weather. The orbital positions and scene epoch
are independent of this appearance choice.

The native pair's diagnostic checks pass: fresh default is `illustrative`, the
look reaches `ready`, both actual Earth passes report exposure
1.600000023841858, clouds enabled and GL error zero. The cloud-off capture changes
pixels without changing the epoch, positions or camera. Source-qualified returns
to its ready physical path; the two mode captures match epoch, camera, canvas
and positions exactly. The observer does not qualify the scientific optical model.

## Local evidence and limits

Evidence is retained in ignored local output directories, not published assets:

- Native: `build/material-cost-20261105/appearance-native-07/`, receipt SHA-256
  `5c3875a8246a533069780b90cac20dce7dced1bb2d8438f34e7e1533324ba256`.
- Software: `build/material-cost-20261105/appearance-swiftshader-06/`, receipt SHA-256
  `7341846df1362c69fe0a0bd3de8036324dbce90aa1ba2d53fc82ec8b90b2e3e6`.
- Each contains `earth-sites-v7.png`, `earth-sites-v7-clouds-off.png`,
  `earth-source-qualified.png`, recorded state and the private comparison source.
- Stage manifest before/after:
  `9dd2d12c14eeda5a385d5c48002abd71da3c0fe39b93ede4952cf02bff15d65a`.
  All 227 staged asset hashes and 207 owning-source mappings remain unchanged.

These are comparison diagnostics, with `qualification:false`. The original
blue-ocean pixel assertion fails at this close Eurasian pose (native 7/47068 blue
pixels; software 2/47068). That result remains explicitly recorded as failed.
The private helper continues to collect the pair; no public assertion, tolerance,
acceptance camera, deadline or release gate is changed or granted a pass.

Earlier native attempts remain saved separately. Initial helpers lacked a base
program readiness check and used a synthetic window resize after assigning the
camera, which does not call this renderer's ResizeObserver. Explicit repaint alone
did not resolve the deferred runs. Native05 records `Engine exceeded its wall
deadline` before GL initialization under Puppeteer Fetch interception. Existing
[worker startup controls](WORKER_STARTUP_CONTROL_20261104.md) identify intermittent
worker-module delivery stalls in that policy. This individual failure's cause was
not isolated and it is not proof of an application defect. Native07 uses the main
validator's CDP Network blocking policy instead and completes; no timer is extended.

Fourteen Earth asset, shader and lifecycle tests pass. This check does not rerun
the complete application acceptance suite, performance qualification, Linux,
Safari, physical mobile, hosted CI or deployment checks. The approved default
appearance is preserved; the overall production-readiness goal remains open.
