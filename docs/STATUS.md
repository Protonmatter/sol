# Status — Web redesign (v0.2)

Branch: `redesign/web-v0.2` · Baseline rollback point: `master` (`5f92fa6`)
Last updated: 2026-06-29

This tracks the web redesign defined in [WEB_REDESIGN_SPEC.md](WEB_REDESIGN_SPEC.md).
The Rust engine and Python pipeline are unchanged except for the additive
`tools/generate_series.py`.

---

## Work completed

### Phase 0 — Foundation ✅
- Captured the v0.1.4 baseline as the first git commit on `master` (there were **no
  commits** before — no rollback point existed).
- All redesign work lives on `redesign/web-v0.2`.

### Phase 1 — Real-Sun hero + layout ✅
- Fixed the layout defect where the Sun was stranded in a black void: the first section
  fills the screen (`height: 100vh`) and the control panel scrolls in its own cell.
- Composited **real NASA SDO/HMI imagery** (continuum / magnetogram) as the observed
  photosphere base, registered to measured disk geometry (centre 0.5, radius 0.4565 of the
  1024px source), clipped to the disk. Synthetic render is the offline fallback.
- Added a Minimum→Rising→Maximum→Declining **stage rail** and an observed-vs-synthetic
  **base label**. Replaced the dense provenance string on first load with a plain-language
  insight.

### Phase 2 — Disclosure, language, onboarding ✅
- Replaced 6 abstract modes with **4 intent surfaces**: Today / Explore / Space Weather /
  Research.
- **Per-surface progressive disclosure**: Today is a true beginner glance; the dense panels
  appear only on the surface that needs them; the Research `<details>` opens only on Research.
- **Glossary tooltips** (hover / keyboard focus / tap) on the `?` metric affordances, the
  visible-layer legend chips, and the space-weather signal chips.
- **Onboarding tour** (5-step spotlight, auto-starts once per browser via `localStorage`,
  replayable from the "Take the 60-second tour" CTA).
- **Interactive stage rail** — each stage explains itself (L1 guided learning).

### Phase 3 — Time playback + real butterfly ✅
- `tools/generate_series.py` produces a deterministic 11-frame solar cycle (latitudes follow
  an idealized butterfly / Spörer's law). Each frame copies the validated base snapshot and
  **passes `validate_snapshot.py`**; cached under `apps/web/data/series/` (~250 KB total),
  so the static app needs no build step.
- **Timeline scrubber + Play/Pause + Now.** Playback animates the disk, stage rail, labels,
  and butterfly highlight through the cycle; cycle frames render synthetically (a model, not
  today's Sun) and are labelled accordingly; **Now** returns to the live SDO image.
- Replaced the fake latitude-vs-index scatter with a **real butterfly diagram**: latitude vs
  cycle time, two migrating wings, current frame highlighted, click-to-scrub.

### Migration — Rust → WebAssembly + ES modules ✅ (the "low-level" path)
Chosen over a Vite/TS rewrite: the real performance/capability lever is the engine itself,
and the Rust toolchain is installed.
- `crates/solar-wasm`: a raw `cdylib` (no wasm-bindgen / wasm-pack — just `cargo` + the
  `wasm32-unknown-unknown` target) exposing `simulate()` / `result_len()` over a tiny
  `extern "C"` ABI. It reuses solar-core's model + the same `solar_state_snapshot_json`
  serializer, so the browser emits **byte-compatible `solar-state-snapshot.v1`** — the
  contract and validators are unchanged. `tools/build_wasm.ps1` stages
  `apps/web/pkg/solar_wasm.wasm` (~91 KB).
- `apps/web/engine.js` (ES module) loads the wasm and marshals the JSON via linear memory;
  `app.js` is now a module. A **"Run the engine live"** activity slider re-solves the real
  model in-browser (~2 ms) and renders it synthetically (labelled), separate from the live
  SDO image.
- Verified: `cargo test --workspace` green (incl. solar-wasm); activity 0.20 → solar
  minimum / 0 regions and 0.90 → solar maximum, live, no console errors.

### Solar System engine — "SkyView meets NASA Eyes" (2026-06-29)
Tracked in [SOLAR_SYSTEM_SPEC.md](SOLAR_SYSTEM_SPEC.md); a second Rust→WASM engine
(`crates/solar-ephemeris`, `apps/web/pkg/solar_ephemeris.wasm`) grounded in orbital mechanics
and validated against **JPL Horizons (DE441)**.
- **P0–P2 ✅** — time/ΔT/nutation/sidereal, Sun + Moon + 8 planets, topocentric alt/az with
  refraction and rise/transit/set. **My Sky** surface: a local horizon dome for any lat/long.
- **P4 (accuracy + physics) ✅** — **VSOP2013** (Sun + 8 planets) and **ELP-MPP02** (Moon),
  generated from ephem.js tiers into `vsop2013_data.rs` / `elpmpp02_data.rs`; evaluators
  `vsop2013.rs` / `elpmpp02.rs`; light-time, aberration, nutation, and the full **Meeus Ch. 21
  ecliptic precession** (a longitude-only shift had cost every body ~12″ in dec). Validated vs
  Horizons to **arcsecond class** (Saturn 0.3″ vs Standish's 250″; Moon geocentric ~3″; worst
  alt/az 11.3″). TOP2013 dropped (VSOP2013 suffices). `physics.rs` adds phase/illumination,
  apparent magnitude, vis-viva speed, equilibrium temp → a per-object detail panel in P3.
  **Review (2026-06-29): green** — 26 workspace tests pass, Horizons gate (22″/32″) passes, web
  static passes, no compiler warnings, both snapshots well-formed, browser-verified.
- **P3 (orbit view) ✅** — **Solar System** surface: top-down ecliptic view (`js/system.js` +
  `system_snapshot` export), Sun-centred, real planet positions, **true orbit ellipses** from
  osculating elements, AU scale, ±100-yr time scrubber, 1.5–32 AU zoom, click-to-select with a
  per-object physics detail panel, and **Sun→solar-surface click-through**. Review (2026-06-29):
  green — all six surfaces switch cleanly, no console errors, validators pass.
- **P5 (WebGPU 3-D) ✅** — **3-D View** surface (`js/orrery.js`): a dependency-free orrery on the
  browser's native **WebGPU** API (not `wgpu` — wasm-bindgen won't build on this ARM64 toolchain),
  reusing `system_snapshot`. Billboarded Sun+planets in real 3-D, true inclined orbit ellipses,
  drag/zoom perspective camera, depth + blending, time scrubber; renders on-demand.
  **Hardened + cross-platform** (`3dccf17`): backend abstraction runs WebGPU first (D3D12 /
  Metal / Vulkan across arm64 + x86_64) with a **WebGL2 (ANGLE)** fallback; high-performance
  adapter, validation error-scoping, uncaptured-error logging, **GPU device-loss recovery**,
  ResizeObserver repaint, and the live GPU/backend shown in the panel. Verified on both backends
  (WebGPU → Adreno-7xx/D3D12; WebGL2 → ANGLE/D3D11). Review (2026-06-29): green — all 7 surfaces
  switch cleanly, no console errors, web-static passes.
- **P7 (DE441 backend, hybrid) ✅** (`3b6f395`) — `services/ephemeris-server/` (stdlib Python)
  serves the same `ephemeris-snapshot.v1` from **JPL Horizons (DE441)**: throttled parallel
  per-body queries with 429/503 retry, on-disk cache (~3 s cold, ~50 ms warm), open CORS,
  `/health` + `/v1/sky`; `definitive_positions()` is the seam for a future SPICE/DE440 reader.
  Frontend **My Sky** gains an *On-device / High-precision (DE441)* toggle — WASM stays the
  default, escalation renders the server snapshot through the same dome/list, graceful fallback
  when the optional server is down. Server vs on-device agree to ≤ 11.3″. Verified in-browser
  (escalation + fallback).

### Full end-to-end review — P0–P7 (2026-06-29): **green**
- **Rust:** 26 workspace tests pass; no compiler warnings; both WASM crates build; the committed
  `apps/web/pkg/*.wasm` reproduce byte-for-byte from source.
- **Ephemeris gate:** matches JPL Horizons DE441 within tolerance (worst 11.3″ vs 22″/32″).
- **Web:** `validate_web_static` passes; all 7 surfaces (Today/Explore/Space Weather/Research/My
  Sky/Solar System/3-D View) switch cleanly with no console errors; orrery renders on WebGPU and
  the WebGL2 fallback; My Sky escalates to the DE441 server and falls back gracefully.
- **No regression to the original app:** `latest-state.json` is valid `solar-state-snapshot.v1`,
  all 11 cycle series frames validate, and the operational-readiness gate is unchanged (still
  correctly blocked).

### Review follow-ups — P1 / P2 / P3 fixes (2026-06-29)
After a multi-lens review (JPL / NN-g / physics / math / end-user), the findings were actioned:
- **P1 (accuracy + honesty):** observer moved to Earth's **centre** (EMB − Moon offset), removing
  ~6″ on the Sun/inner planets; validator now reports **great-circle pointing error** over a
  **4-case** envelope (worst **5.2″**); claims reworded to match (near-present caveat; deep-time is
  ΔT-limited). Equilibrium temp shown as black-body **with the measured value** (Venus 227 K vs
  737 K). Nav grouped into ☀ The Sun / 🌌 Sky & Solar System.
- **P2:** `tools/build_web.py` replaces hand-bumped `?v=N` with one content hash; **My Sky time
  control** (datetime picker / Now, share-link deep-link, Export JSON); **a11y** (orrery keyboard
  + Solar System "Positions" text list); plain-language provider labels.
- **P3:** Saturn magnitude includes the ring term; orrery billboards near-opaque (depth-correct) +
  pinch-zoom; central-difference velocity; Kepler iterate-to-tolerance.
- **Bright-star catalogue ✅** (`crates/solar-ephemeris/src/stars.rs`): 26 brightest stars (J2000)
  flow through the same topocentric reduction (new `coords::equ_to_ecl`) and appear in the My Sky
  dome (magnitude-sized dots, brightest labelled) and the "Up now" list. Polaris altitude tracks
  observer latitude; 9-body Horizons gate unchanged.

---

## Review — bill of health (2026-06-28)

A full read-through of `apps/web/app.js` (now ~1,357 lines). **Verdict: green**, with the
findings below already addressed.

**Fixed in `90bd739`:**
- Latent `APPLICATION_COPY.cycle` fallback (removed key) → `today`.
- Stale "Regions mode" copy → "Explore".
- Removed ~225 lines of dead code: `drawClassroomOverlay`, `solarColor`, `solarTexture`,
  `sampleField`, `readinessSummary`.

**Verified:**
- No console errors across all four surfaces, the tour, and playback.
- `validate_web_static`, `validate_snapshot` (every series frame), and
  `validate_operational_readiness` all pass.
- Invariants intact: snapshot-driven (no browser physics), provenance/labels preserved,
  operational gate stays `false`, deterministic. Text is rendered via `textContent` (no
  `innerHTML`) — no injection surface from data.
- Graceful fallbacks: image `onerror` → synthetic; snapshot fetch fail → `FALLBACK_STATE`;
  series fetch fail → empty (butterfly degrades to the snapshot scatter).

**Known low-severity debt (not blockers):**
- `app.js` is a single ~1.3k-line file with global mutable state — the case for the
  structural migration (next).
- During cycle playback the `journeyText` still shows the "today" copy; the dedicated frame
  label is accurate. Minor wording only.
- Cycle frames intentionally drop `observed_context`, so the Space-Weather signal chips read
  "n/a" while scrubbing (live mode is unaffected).
- Tour dialog isn't focus-trapped; tooltip position isn't recomputed on scroll. → Phase 5
  (a11y/polish).

---

## What's left

### ES-module split ✅
`app.js` is now a 136-line entry; the rest is split into focused modules under
`apps/web/js/` (config / store / format / dom / selectors / render / panels / view / data /
timeline / tour / tooltip), with a JSDoc `Snapshot` typedef. Native ESM, no bundler.
Remaining type-checking polish: turn on `// @ts-check` per module and add an optional
`npx tsc --noEmit` gate once Node is available.

### Engine-in-browser follow-ups (now unlocked)
- Live **what-if** beyond activity: seed/steps and assimilation runs from the wasm engine.
- Replace the pre-baked `series/` frames with a live wasm-generated cycle (optional).
- WebGPU (`wgpu`) rendering per the roadmap, layered on the wasm engine.

### Phase 4 — Research back room
- Per-layer provenance detail; observed-vs-model comparison view; run/scenario **export**.
- Done when a researcher reaches equations/provenance/export in ≤2 clicks and can export a
  seeded run.

### Phase 5 — Polish
- a11y audit (WCAG AA contrast, full keyboard nav, focus trapping for the tour, reduced-motion
  for playback), performance, mobile passes, copy cleanup of the items above.

### Backlog / nice-to-have
- Magnetogram (HMIB) as a switchable base, not just a fallback.
- B0/P-angle correction so model overlays register more precisely on the real disk.
- Clip the Explore geometry overlay to the disk (longitude arcs currently extend past it).
- A `tsc --noEmit` (or `node --check`) gate in the validators once a toolchain is chosen.
