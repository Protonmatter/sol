# Handoff — Sol web redesign (v0.2)

For the next engineer or agent picking this up. Read this, then
[STATUS.md](STATUS.md) (what's done/left) and [WEB_REDESIGN_SPEC.md](WEB_REDESIGN_SPEC.md)
(the plan). [INSTRUCTIONS.md](INSTRUCTIONS.md) has the commands.

## 1. What this project actually is

"Sol" = the **Solar Maximum Engine**, a deterministic solar-cycle / space-weather
simulation engine (Sol = the Sun), **not** a file explorer.

The engine produces immutable, versioned JSON snapshots; the web app only renders them.
That separation is the core architectural invariant — **do not compute physics in the
browser.**

## 2. Where things stand

- **`master` is the only branch** — default, protected (PRs + 4 CI checks required), and
  deployed to GitHub Pages at https://protonmatter.github.io/sol/ on every push. The
  former `redesign/web-v0.2` branch was fully merged (PR #1) and deleted.
- Repo: github.com/Protonmatter/sol. CI: `.github/workflows/ci.yml` (tests, blocking
  fmt+clippy, wasm build, web validators, determinism gate, cache-bust sync) plus a
  weekly network `ephemeris-accuracy.yml` (JPL Horizons) and `deploy-pages.yml`.
- Redesign Phases 1–3 plus the Solar-System/My-Sky engine work are **done and verified
  in-browser**. See STATUS.md for the current done/left detail.

## 3. The redesign in one paragraph

The old app was a dense, jargon-first status dashboard with the Sun stranded below the fold
and a fake butterfly diagram. It now opens on a **real NASA SDO image of the Sun** with one
plain sentence, and earns its way into depth through **three destinations (The Sun / My Sky /
Solar System)** — the Sun surface layers further via progressive-disclosure drawers
(layers & region inspection / what it means for Earth / under the hood).
Every science term has a glossary tooltip; an onboarding tour orients first-timers; a
timeline scrubber plays an idealized 11-year cycle; and the butterfly diagram is now a real
latitude-vs-time plot driven by a deterministic snapshot series.

## 4. How the code is organized (`apps/web/`)

Native ES modules (no bundler). `apps/web/app.js` is a thin entry (event wiring + boot);
the rest lives under `apps/web/js/`:

| module | responsibility |
|---|---|
| `config.js` | constants, copy, and the JSDoc `Snapshot` typedef |
| `store.js` | shared **mutable** state — cross-module via one `store` object (you can't reassign an imported binding, so write `store.x = …`) |
| `format.js` | pure number/string/array helpers |
| `dom.js` | `text`/`textWithTitle`/`setPill` + the layer-control refs |
| `selectors.js` | derived reads over `store.state` (selectedRegion, dataStateLabel, summaries…) |
| `render.js` | all canvas drawing — disk, overlays, butterfly, `projectRegion` |
| `panels.js` | DOM text/panel updates + `updateModeButtons` |
| `view.js` | `renderAll` + `applySurfaceVisibility` (the render orchestrator) |
| `data.js` | snapshot/series/feed loaders + the observed-image cache (`currentBaseImage`) |
| `timeline.js` | scrubber/playback + `runLiveEngine` (imports `../engine.js`) |
| `tour.js` | onboarding spotlight (modal: sets `<main>` `inert`, traps + restores focus) |
| `tooltip.js` | glossary tooltips |
| `wavelength.js` | SDO wavelength-channel selector bar |
| `sunlayers.js` | the Sun-interior cutaway |
| `sky.js` | **My Sky** horizon dome (topocentric alt/az; loads `skyEngine.js`) |
| `skyEngine.js` | loads `solar_ephemeris.wasm`; `skySnapshot`/`systemSnapshot`/`bodyTrack` |
| `orrery.js` | **Solar System** — the WebGL2 renderer/orchestrator: GL plumbing, camera, input, draw loop |
| `orreryMath.js` | pure mat4/vec3 helpers, IAU WGCCRE orientation, sphere/ring/ellipse geometry |
| `orreryShaders.js` | the five GLSL programs (sphere/line/ring/point/glow) as string constants |
| `orreryGalaxy.js` | the Milky-Way model: constants, Sun's galactic orbit, shear, point-cloud generation |
| `orreryDetail.js` | the click-to-inspect physical-facts panel (pure DOM from bodyData + live row) |
| `bodyData.js` | NASA fact-sheet constants + IAU pole/rotation per body |
| `celestial.js` | star / constellation / pulsar / deep-sky catalogues |
| `galacticobjects.js` | galactic-frame objects for the Milky-Way zoom-out |
| `smallbodies.js` | dwarf planets + comets (a small Kepler propagator) |
| `accuracy.js` | epoch-accuracy labels for the deep-time scrubbers |

There are a few **runtime** import cycles (e.g. `view → render → data → view` via `renderAll`);
ESM handles them because the cyclic functions are only *called* at runtime, never during module
evaluation. Don't call an imported function at a module's top level.

The `tools/validate_web_static.py` `REQUIRED_IDS` set is the de-facto DOM contract, and it now
scans `js/*.js` for required JS bindings — keep both in sync when you add/rename ids or move code.

## 5. Gotchas

- **Cache-bust**: after editing anything under `apps/web/`, run **`python tools/build_web.py`**.
  It stamps a single content-hash `?v=<hash>` across every HTML/JS reference, so the token changes
  only when content changes and all references move together — no more hand-bumping `?v=N` per file
  (which risked a stale-module mismatch if one was missed).
- **Toolchains**: data is generated with Python (stdlib only); `node --check` is the
  zero-dep JS syntax gate in CI; cargo builds the engines. The web app itself deliberately
  needs no build/bundler.
- **SDO images** load without `crossOrigin` (display-only draw; canvas is never read back).
  If you ever need `getImageData`, you'll need a CORS-enabled source.
- **Cycle frames drop `observed_context`** to stay small, so Space-Weather chips read "n/a"
  while scrubbing. Live mode is unaffected.
- Line-ending warnings on commit (LF→CRLF) are harmless on Windows; `.gitattributes`
  pins the files that must stay LF.
- **WASM**: the modules under `apps/web/pkg/` are **not committed** — the deploy workflow
  builds them from source, and locally you run `python tools/build_wasm.py` after cloning
  or after changing any engine crate. The wasm ABI returns a pointer + length into
  linear memory; `engine.js` must read the bytes immediately, before any other wasm call.

## 6. Migration decision — RESOLVED: Rust → WASM + ES modules

**Outcome:** we took the low-level path — compile the real Rust engine to WebAssembly and
run it client-side (see "Migration" in [STATUS.md](STATUS.md)). `crates/solar-wasm` is a raw
`cdylib` (no wasm-bindgen) built with `tools/build_wasm.py` to `apps/web/pkg/solar_wasm.wasm`;
`apps/web/engine.js` loads it and `app.js` is now an ES module. Rebuild the wasm whenever
`solar-core` or `solar-wasm` changes. The next step is splitting the rest of `app.js` into
modules + `// @ts-check`. **Vite was not adopted** — it needs Node (not installed) and is
orthogonal to the low-level win. The original trade-off analysis is kept below for context.

`app.js` was ~1,357 lines of single-file vanilla JS with global state. **Two paths were weighed:**

| | **A. ES modules + `// @ts-check`** (recommended) | **B. Vite + TypeScript** |
|---|---|---|
| Build step | none — still open `index.html` / `http.server` | dev server + `npm run build` |
| Dependencies | zero runtime; Node only for an optional CI `tsc --noEmit` | `node_modules` (Vite + plugins) |
| Type safety | JSDoc `@typedef` for the snapshot contract, checked by `tsc`/editor | full `.ts` |
| Bundling/HMR | native ESM (fine for this size) | yes |
| Fit with project's "dependency-free, no-build" value | **preserves it** | breaks "open index.html directly" |

**Recommendation: Path A.** It delivers the real wins of the migration (modularity + type
safety, which would have caught the `APPLICATION_COPY.cycle` bug) while keeping the
zero-dependency, instantly-hostable, inspectable nature that is a genuine strength of this
project — and it doesn't require installing a toolchain the machine lacks. Vite's bundling
buys little for a ~1.3k-line static educational app. Choose Path B only if you plan to pull
in npm UI libraries or expect the app to grow large.

Suggested Path A module split: `data/` (loaders + `contract.d.ts`/JSDoc types), `render/`
(disk, butterfly, overlays, projection), `ui/` (surfaces, disclosure, tooltip, tour,
timeline), `state/` (the store). Add `<script type="module">` and an optional
`npx tsc --noEmit` check to the validators.

## 7. Definition of done for the remaining phases

See [STATUS.md](STATUS.md) "What's left". Grade Phase 4/5 against the spec's acceptance
criteria: beginner can state one true thing in 30s; researcher reaches
equations/provenance/export in ≤2 clicks; no horizontal overflow desktop/mobile; WCAG AA;
all validators green; operational gate still `false`.
