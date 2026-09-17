# Bounded physical material consumer

`SCATTERING_SPHERE_FS` admits the renderer's existing Earth/Mars material
contract: mode `0`, style `-1`. Other mode/style values discard. Both uniforms
remain active for independent draw evidence. Only unreachable Sun/halo and
procedural style branches are removed from this consumer. `SPHERE_FS`,
`BASE_SPHERE_FS`, the vertex source, mathematical scattering expressions, texture
lookups, neutral fallback, terrain and moon shadows, Earth layers, and the
lighting/composition tail are preserved by the specialization.

The change followed an isolated native compile regression at source
`649ab1ca56402765fed601c4d1424e2bae1c82f6`. With the current mathematical source,
the unguarded surface and generator exceeded their original 30,000 ms deadlines.
A candidate with only the material specialization admitted surface/shell/generator
in 4,814.8 / 2,064.7 / 24,080.7 ms. These are isolated concurrent compiler
observations, not application frame timings. Loop, paired-column, and scalar
mathematical experiments remain excluded from production.

## Material fixture

Run from the repository root with the existing Node dependencies and Chrome.
`CHROME_BIN` may select an installed Chrome executable. No dependency installation
or runtime telemetry is involved. Coordinate exclusive GPU use on the test host.

```powershell
node tools/physical_material_validation.mjs --web-root=<frozen-web-root> --backend=swiftshader --out=<new-receipt-directory>
node tools/physical_material_validation.mjs --web-root=<same-frozen-web-root> --backend=native --reference-mode=fixed-domain --out=<another-new-receipt-directory>
```

`--web-root` defaults to `apps/web` and accepts a release manifest namespace.
`--backend` defaults to `swiftshader`. `--reference-mode` defaults to `uniform`.
Native `fixed-domain` keeps the complete reference text and substitutes only its
mode/style declarations with constants `0`/`-1`; this is explicitly distinguished
from native unspecialized-reference parity. The production consumer always keeps
real uniforms and its misuse rejection controls. Each program retains a 30,000 ms
compiler deadline; the fixture has a separate 120,000 ms total deadline.

The fixture compares 160 Earth/Mars material combinations and 80 final HDR outputs.
It covers neutral/registered materials, actual source latitude/window/no-data
transforms, Earth hardware sRGB decoding versus Mars manual decoding, optional
Earth night/weather/sea-ice, signed relief, terrain/moon shadow code, refraction
flags, and both output modes. Every valid raw pair must have finite RGBA and
opaque alpha, including legitimate black night pixels. Final pixels must both
match one another and the current float producer's fixed exposure/transfer.
Mode/style misuse, held producer, held presentation, and incorrect encoding are
negative controls. Synthetic image/height/residual fields isolate material
control flow; shipped numerical column bytes are validated by their normal loader.
This does not qualify atlas accuracy, actual terrain meshes, source imagery,
dynamic producer identity, HDR displays, or absolute radiometry.

Exit `0` means all checks and identity checks passed; exit `1` retains a failed
receipt. Output directories containing a receipt cannot be reused. Receipts bind
the tool, helper, serialized predicates, served source/data, expanded shaders,
observed backend, compiler outcomes, and post-run identity checks. Owned browsers
close when the run finishes.

The initial exact native reference failed its unchanged compiler deadline; that
receipt is retained. Earlier SwiftShader exact-reference and native fixed-domain
runs passed 265/265 checks, but predate the per-case write assertion, exact Mars
mapping, and held-presentation additions. The corrected fixture and forthcoming
observer geometry require fresh combined-source GPU receipts. Original full-app
timing, physical/terrain draw evidence, numerical, appearance, and HDR gates remain
independent requirements. Reverting this isolated change restores the generic
bounded consumer without altering any mathematical source or resource deadline.
