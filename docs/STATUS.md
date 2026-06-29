# Status — Web redesign (v0.2)

Branch: `redesign/web-v0.2` · Baseline rollback point: `master` (`5f92fa6`)
Last updated: 2026-06-28

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

### Finish the ES-module split (in progress)
The WASM milestone started the migration: `app.js` is now a module importing `engine.js`.
Next, split the still-monolithic `app.js` into `data/` `render/` `ui/` `state/` modules and
add `// @ts-check` + a JSDoc `@typedef` for the snapshot contract (optional
`npx tsc --noEmit` gate). No bundler — keep the no-build, zero-dependency property.

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
