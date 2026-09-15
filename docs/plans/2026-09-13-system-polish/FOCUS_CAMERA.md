# Focus camera framing

Explicit planet and moon focus fits the existing display geometry to 76% of the
limiting canvas dimension. The vertical field of view remains 42 degrees. The
fit uses the exact sphere angular radius, `asin(extent / distance)`, and accounts
for portrait aspect ratios. A ringed planet uses its outer admitted ring radius
as the enclosing extent. This preserves the whole ring system when its plane is
oblique to the view.

After explicit focus, the orbit camera retains that nominal fit separately from
the user's zoom distance. Before constructing each orbit projection it recomputes
the fit from the current enclosing display extent and actual canvas aspect ratio.
A physical/enlarged toggle, display-size change, unavailable-moon parent fallback,
or landscape/portrait resize scales the camera distance by the ratio of the new
fit to the previous fit. Manual zoom therefore remains relative to the framing;
an ordinary repaint or same-aspect/DPR-only resize does not reset it. The current
outside-surface and Float32 separation bound still takes precedence over zoom.

The camera reads the same capped display radii used by the renderer; it does not
modify body radius, ephemeris coordinates, moon-system scaling, orbit paths, or
the selected epoch. A moon outside its accepted position interval continues to
anchor and frame its parent while the existing unavailable-position notice is
shown. The initial and explicit Sun overview remains at 26 AU. Small-body marker
focus, galaxy/neighbourhood views, overview controls and free flight retain their
existing behavior. Adaptive framing is suspended in free flight, top-down
overview and galaxy views. Returning to the same focused orbit reconciles any
extent or aspect changes while preserving its prior relative zoom. Explicit Sun
or small-body marker focus clears adaptive framing.

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

PR 107 camera review regressions additionally reproduce the pre-fix interior
camera after physical-to-enlarged Earth and unavailable Io-to-Jupiter fallback,
and a Saturn ring extent occupying 171% of a portrait canvas after resize. The
three new production-harness tests cover automatic growth/shrink framing,
manual zoom and near-surface bounds, moon fallback and return without another
Focus action, portrait resizing, DPR-only resizing, and preserved overview,
free-flight, engine body records and epoch. Run them with:

```sh
node --experimental-vm-modules --test --test-name-pattern='focused camera follows|existing focus refits|focused moon crossing' tests/web/orreryCoverage.test.mjs
```

Real-browser full-scene appearance is a separate build gate; these tests check
the production camera integration and submitted matrices using the existing
browser/GPU boundary doubles.
