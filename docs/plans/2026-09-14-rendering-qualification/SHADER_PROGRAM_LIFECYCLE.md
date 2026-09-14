# Context-owned shader program completion

Status: implemented candidate; CPU lifecycle validation is distinct from native
startup and frame-performance qualification. This slice does not replace the
retained native FAILED startup receipt or increase its 30,000 ms gate.

## Trigger and scope

The [native texture qualification](NATIVE_TEXTURE_QUALIFICATION.md) retained an
actual 26,343.4 ms main-thread `LINK_STATUS` query for the eagerly created physical
sphere program. The same native context exposed `KHR_parallel_shader_compile`;
the matched SwiftShader context did not. No texture memory-pressure evidence
justifies changing source formats to address that shader wait.

`shaderPrograms.js` owns the program lifecycle. `orrery.js` uses it for six base
programs (sphere, line, ring, points, glow and solar) and the demanded physical
sphere/atmosphere pair. Mandatory programs must be ready before the base scene
renders. Physical program compilation begins only with a qualified Earth/Mars
close-view optical demand. The base scene remains available while those programs
and their separately admitted numerical fields load.

The [Khronos extension specification](https://registry.khronos.org/webgl/extensions/KHR_parallel_shader_compile/)
defines a nonblocking completion query. It does not promise a shorter total
compiler duration. Without the extension, checking compilation/linking may block;
the existing supported synchronous fallback remains explicit. Driver work within
compile/link calls is still implementation dependent and must be measured.

## Admission and resource contract

- A manager binds one WebGL context and integer generation. A key binds the exact
  vertex and fragment source strings for that manager's lifetime, including after
  cancellation or retry. Changed source requires a new context-owned identity.
- The application uses eight program slots. The helper accepts 1–16 slots, no
  more than 1,000,000 characters per shader source, and a positive completion
  budget no greater than 30,000 ms. Each pending program owns at most two shader
  objects; successful link validation detaches and deletes them. Ready programs remain
  resident within the fixed slot bound until context disposal.
- `request(key, vertexSource, fragmentSource)` returns a frozen ticket with
  `key`, `generation` and `done`. The promise resolves for ready, unavailable or
  cancelled outcomes; errors are not unhandled promise rejections. `status`,
  `diagnostic` and `get` expose lifecycle state, bounded error text and a handle
  only when ready in the current manager.
- Parallel requests compile and link without reading `COMPILE_STATUS`,
  `LINK_STATUS`, driver logs, or uniform locations. One animation-frame callback
  polls `COMPLETION_STATUS_KHR`; only a completed program can undergo compile/link
  validation. The renderer queries optional uniforms only after both companion
  programs pass. Those maps include the existing color and HDR uniforms.
- Poll generation invalidation rejects a cancelled callback even if it arrives
  after a newer request. Context/manager identity is checked again before runtime
  admission. A late queued failure notification reads current state and cannot
  cancel a newer explicit retry.
- Allocation, compile, link and completion-timeout failures release owned shader
  and program objects. Failed demand does not silently recompile each frame.
  Optical off/on retries unavailable optional programs and numerical fields.
  Core failure retains the text fallback and explicit core Retry control.
- Leaving, hiding, or removing optical demand cancels pending compilation. Ready
  base programs can be reused on reentry; numerical fields keep their existing
  cancellation and disposal rules. Context loss disposes every program, and a
  restored context builds new program handles and uniform maps. A failed restore
  remains visible and does not restart the frame loop.
- `cancelPending()` settles pending tickets and invalidates their poll.
  `dispose()` is idempotent and releases ready resources as well. Status observer
  exceptions are recorded separately as `notificationError` and cannot interrupt
  cleanup or leave a disposed request unresolved.

The UI's optical `ready` state requires the real physical program pair plus the
incident and column fields. Illustrative sphere/shell draws are never counted as
physical readiness. This change does not alter radiative formulas, interpolation
tolerances, geometry, field bytes, image source interpretation, or HDR opt-in.

## Validation and remaining gate

Regression development first reproduced the existing renderer's premature
`COMPILE_STATUS` query with a strict WebGL double. It also reproduced pending
startup resource leakage. Additional failing regressions established stale poll
generation, source identity after retry, throwing-observer cleanup, and missing
failure disclosure after asynchronous context restoration before their fixes.

CPU validation commands use the repository's existing Node test runner:

```text
node --experimental-vm-modules --test tests/web/shaderPrograms.test.mjs tests/web/orreryProgramLifecycle.test.mjs
node --experimental-vm-modules --test tests/web/texturePipelineValidation.test.mjs
node --experimental-vm-modules --test tests/web/orreryIncidentLifecycle.test.mjs tests/web/orreryContextRecovery.test.mjs tests/web/orreryHdrLifecycle.test.mjs tests/web/orreryPhysicalLifecycle.test.mjs tests/web/planetAppearanceRuntime.test.mjs
python tools/typecheck_web.py
python tools/validate_web_static.py
python tools/validate_docs.py
python tools/validate_sdlc.py
```

The focused helper/runtime suite covers query ordering, bounded slots, exact source
identity, no-extension behavior, deferred physical readiness, allocation/compile/
link/timeout failures, cancellation, retry, old callback delivery, context
replacement and observer failure. Existing field/terrain/HDR tests exercise the
combined integration rather than substituting production lifecycle functions.

The final CPU run passed **1,049 / 1,049 web tests** with Node 22 and test
concurrency 2. This includes 22 helper/runtime lifecycle regressions and the
startup predicate regression. TypeScript 5.9.3 checked 108 web files; static web,
117-document, SDLC and whitespace checks passed. The helper, renderer and profiler
also passed Node syntax checks. Independent helper review supplied the observer
failure and attached-shader lifetime cases; both have failing-then-passing tests.
The local full-suite receipt is
`build/rendering-qualification-20260914/program-final-web-tests.tap`, SHA-256
`89b5af85a3a61af71c47be6cc3249f7950f401a782278b61861c377564a1e858`.
The measured implementation hashes are helper
`3febea96c90cc448a615a4158ed7ef76f23c2f584c4aba95bbd010b8fe5077b8`
and renderer
`a8596e0ddd4e1d3723ac21570d2fb0aea0de6a468985604cd7708fc8d04a9790`.

The texture profiler's existing 30-second startup wait now requires ready base
programs on this candidate. Legacy immutable stages require their established
backend admission; neither can pass from nine ephemeris rows alone. Cache
snapshots retain program status and bounded diagnostics. The separate failed
startup continuation remains diagnostic and cannot change the original gate.

No GPU browser was launched for this CPU slice. Required follow-up is an immutable
combined-stage replay on the actual native context and SwiftShader: preserve the
original startup deadline, measure first base scene, wait for actual physical
readiness, and retain the original final-material and three-draw/five-second
gates. Native compiler scheduling and real frame latency cannot be established
from JavaScript mocks. Context-loss and close-view scenarios also need the staged
browser checks. Hosted CI and deployed behavior remain unqualified by this slice.

Rollback is a single runtime/helper/test/documentation commit revert. Existing
source and derivative assets, staged release bytes, installed dependencies,
drivers, graphics settings and power policy require no change.
