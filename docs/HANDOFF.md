# Handoff — Sol web redesign (v0.2)

For the next engineer or agent picking this up. Read this, then
[STATUS.md](STATUS.md) (what's done/left) and [WEB_REDESIGN_SPEC.md](WEB_REDESIGN_SPEC.md)
(the plan). [INSTRUCTIONS.md](INSTRUCTIONS.md) has the commands.

## 1. What this project actually is

"Sol" = the **Solar Maximum Engine**, a deterministic solar-cycle / space-weather
simulation engine (Sol = the Sun), **not** a file explorer. Code lives at
`C:\Users\mkang\Documents\Sol`. The window titled "Sol - File Explorer" is just Windows
Explorer showing the folder.

The engine produces immutable, versioned JSON snapshots; the web app only renders them.
That separation is the core architectural invariant — **do not compute physics in the
browser.**

## 2. Where things stand

- **Branch `redesign/web-v0.2`** holds the redesign. **`master` is the untouched v0.1.4
  baseline** — the rollback point.
- Commit trail (newest first):
  - `90bd739` review cleanup (dead code + stale refs)
  - `222e4b6` Phase 3 — time playback + real butterfly
  - `904d72f` finish Phase 2 — onboarding tour + interactive stage rail
  - `5299ea8` Phase 2 — intent surfaces + disclosure + glossary
  - `e893025` Phase 1 — real-Sun hero + layout fix
  - `db179b6` redesign spec
  - `5f92fa6` v0.1.4 baseline (on master)
- Phases 1–3 are **done and verified in-browser** (no console errors). Phases 4–5 remain.
- Nothing is pushed to a remote and no PR exists yet — local branch only.

## 3. The redesign in one paragraph

The old app was a dense, jargon-first status dashboard with the Sun stranded below the fold
and a fake butterfly diagram. It now opens on a **real NASA SDO image of the Sun** with one
plain sentence (the "Today" glance), and earns its way into depth through four intent
surfaces (Today / Explore / Space Weather / Research) via genuine progressive disclosure.
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
| `tour.js` | onboarding spotlight |
| `tooltip.js` | glossary tooltips |

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
- **No Node/Cargo on this machine.** Data is generated with Python; `node --check` can't run
  here. The web app deliberately needs no build.
- **SDO images** load without `crossOrigin` (display-only draw; canvas is never read back).
  If you ever need `getImageData`, you'll need a CORS-enabled source.
- **Cycle frames drop `observed_context`** to stay small, so Space-Weather chips read "n/a"
  while scrubbing. Live mode is unaffected.
- **Local dev server** is currently running on `http://localhost:8765` (a `python -m
  http.server`), not the 8000 in the docs — either works.
- Line-ending warnings on commit (LF→CRLF) are harmless on Windows.
- **WASM**: `apps/web/pkg/solar_wasm.wasm` is a committed build artifact. After changing
  `solar-core` or `solar-wasm`, rerun `tools/build_wasm.ps1` (needs `cargo` +
  `rustup target add wasm32-unknown-unknown`). The wasm ABI returns a pointer + length into
  linear memory; `engine.js` must read the bytes immediately, before any other wasm call.
- `cargo` is on the PATH in PowerShell (`~/.cargo/bin`), not in the Bash tool's PATH.

## 6. Migration decision — RESOLVED: Rust → WASM + ES modules

**Outcome:** we took the low-level path — compile the real Rust engine to WebAssembly and
run it client-side (see "Migration" in [STATUS.md](STATUS.md)). `crates/solar-wasm` is a raw
`cdylib` (no wasm-bindgen) built with `tools/build_wasm.ps1` to `apps/web/pkg/solar_wasm.wasm`;
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
