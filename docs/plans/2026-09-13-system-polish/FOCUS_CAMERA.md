# Focus camera framing

Explicit planet and moon focus fits the existing display geometry to 76% of the
limiting canvas dimension. The vertical field of view remains 42 degrees. The
fit uses the exact sphere angular radius, `asin(extent / distance)`, and accounts
for portrait aspect ratios. A ringed planet uses its outer admitted ring radius
as the enclosing extent. This preserves the whole ring system when its plane is
oblique to the view.

The camera reads the same capped display radii used by the renderer; it does not
modify body radius, ephemeris coordinates, moon-system scaling, orbit paths, or
the selected epoch. A moon outside its accepted position interval continues to
anchor and frame its parent while the existing unavailable-position notice is
shown. The initial and explicit Sun overview remains at 26 AU. Small-body marker
focus, galaxy/neighbourhood views, overview controls and free flight retain their
existing behavior.

Orbit zoom stops outside the enclosing geometry at the greater of 1.08 times
its extent or extent plus a numerical separation margin. The perspective near
plane is the smaller of 0.008 AU and one quarter of camera-to-nearest-enclosing-
surface distance, bounded below by 1e-9 AU. Free flight and galaxy views retain
their existing 0.008 AU near plane.

World positions and the final GPU transforms remain Float32. For very small
physical-scale moons far from the origin, the camera therefore also retains a
conservative separation of 32 relative Float32 ulps of world distance (at least
1e-8 AU). This avoids pretending that arbitrarily close views recover precision
the renderer does not have. It does not restore camera-relative precision or
qualify detailed physical-scale close-ups of every small moon. Physical-scale
objects can remain sub-pixel; the existing scale notice remains applicable.

Verification:

- `node --experimental-vm-modules --test tests/web/orbitCamera.test.mjs tests/web/orreryCoverage.test.mjs`: 26 passed locally. Tests cover projected extent on desktop and portrait canvases, ring framing, relative zoom limits, near-plane bounds, invalid input and numerical separation, preserved core and reappearing moon model matrices, epoch invariance, and unavailable-moon parent framing.
- `python tools/typecheck_web.py`: 80 modules passed locally.

Real-browser full-scene appearance is a separate build gate; these tests check
the production camera integration and submitted matrices using the existing
browser/GPU boundary doubles.
