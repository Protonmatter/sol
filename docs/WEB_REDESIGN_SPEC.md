# Solar Maximum Engine — Web Redesign Spec (v0.2 "Sol")

Status: Draft for implementation
Date: 2026-06-28
Supersedes: the in-session "UI Redesign Plan" (Codex), which it extends from a UX-architecture
correction into a fundamental rebuild.

## 0. Decisions locked (from product owner)

1. **Audience: both, layered.** A beginner "front door" that earns its way into a research
   "back room" via genuine progressive disclosure (NN/g sense), not a flat dashboard.
2. **Visual: real imagery + synthetic model layer.** Real Helioviewer SDO imagery as the
   photosphere base; the engine's predicted fields composited on top, always labeled
   observed-vs-model.
3. **Scope: fundamental rebuild.** A real frontend (build step allowed), real time-evolution /
   playback, onboarding, a correct butterfly diagram. The current `apps/web/app.js` is treated
   as a prototype to replace, not patch.

## 1. North star

> **"See the real Sun. Understand what's happening on it. Then see exactly what the model
> knows, how it knows it, and what it still can't claim."**

One product, three depths. The Sun is always the hero. Jargon is always optional. Provenance and
uncertainty are always one deliberate step away — never in your face, never hidden.

### Non-goals / invariants (must survive the rebuild)

- **No browser-side physics.** The snapshot contract remains the source of truth. The UI may
  animate, scrub, composite, and explain, but must never invent physical values.
- **Operational boundary stays.** `operational_readiness.space_weather_operational` remains
  `false` until the existing gates are met. The UI must never imply forecasting authority.
- **Provenance + labeling preserved.** Every rendered layer keeps its kind
  (`synthetic | observed | blended | inferred | degraded`).
- **Determinism preserved.** Seeded runs reproduce byte-identical snapshots; golden tests still gate.

## 2. Personas & jobs-to-be-done

| Persona | Knows about the Sun | First 30s job | Deep job |
|---|---|---|---|
| **Newcomer** (curious public) | ~nothing | "What am I looking at, and why is it interesting right now?" | Follow a guided story of one solar cycle. |
| **Student / educator** | some | "Show me min→max→declining and active regions, clearly." | Manipulate stage/activity, read correct diagrams, cite sources. |
| **Researcher / practitioner** | a lot | "Is this real data or model? How fresh? What's the confidence?" | Compare observed vs model, inspect provenance, export a seeded run. |

Design rule: **default to the Newcomer.** The other two opt in. The current app defaults to the
Researcher and abandons the Newcomer — that is the central defect.

## 3. Design principles (Nielsen Norman heuristics → concrete rules)

The redesign is graded against these. Each is a testable rule, not a slogan.

1. **Visibility of system status / strong first impression.** The recognizable Sun is above the
   fold on load, with one plain idea. No scrolling through empty space to find the hero.
   (Fixes the current "Sun stranded in a black void" layout.)
2. **Match between system and the real world.** Use real imagery so the Sun *looks like the Sun*.
   Speak plain language first; every science term has an inline plain-language gloss + "why it
   matters." (Fixes "billiard-ball Sun" + unexplained `Br`/`F10.7`/`Kp`/`MSH`.)
3. **Progressive disclosure (the spec's founding principle, done correctly).** Four explicit
   layers, L0–L3 (§4). The beginner layer is genuinely simple; depth is opt-in.
4. **Recognition rather than recall.** Replace the 6 abstract modes with a few intent-named
   surfaces whose payoff for switching is obvious (§5).
5. **Aesthetic & minimalist design.** One primary message per screen state. Secondary data is
   demoted, grouped, or deferred. Kill the "everything at equal weight" panel.
6. **User control & freedom.** Give the user the missing verb: **time.** Scrub/playback the cycle
   and rotation; switch base layer; reset. A tool about a *process* must let you run the process.
7. **Consistency & standards / scientific credibility.** The butterfly diagram becomes a real
   latitude-vs-time plot. Observed vs model is never ambiguous.
8. **Help & documentation.** Optional first-run tour (used sparingly), persistent glossary,
   self-evident controls. No assumed prior knowledge.
9. **Error prevention & graceful states.** Keep/extend the existing degraded/fallback handling;
   define explicit offline, loading, and stale-data states.
10. **Flexibility & efficiency of use.** Power users get keyboard nav, deep-links to a layer/region,
    and export without wading through the beginner path.

## 4. Information architecture — the four disclosure layers

Every existing data element is assigned a layer. Nothing is deleted; it is *placed*.

- **L0 — Glance (default, zero clicks).** The Sun (real imagery), the cycle stage on a labeled
  rail (Minimum → Rising → **Maximum** → Declining), and ONE plain sentence
  ("The Sun is near solar maximum: lots of active regions right now."). A single, obvious
  call to action ("Take the 60-second tour" / "Explore").
- **L1 — Guided (the story).** A short, paced narrative of a solar cycle with the imagery and a
  couple of highlighted regions. Auto-advance or click-through. Plain language throughout.
- **L2 — Explore (hands-on).** Layer toggles (continuum / magnetogram / confidence / regions),
  base-layer switch (observed image ↔ model field), click-a-region inspector, the time scrubber,
  and the real butterfly diagram. Tooltips on every term.
- **L3 — Research (the back room).** Equations, calibration state, per-layer provenance, observation
  frames, adapter health, daily feed health, the operational-readiness checklist, and run export.
  Reached in ≤2 deliberate clicks; never shown by default.

Mapping of today's elements:
`plain_language_insight` → L0/L1 (rewritten for beginners; the current SWPC-row string moves to L3).
`cycle_stage` → L0 stage rail. Layer toggles, selection panel, butterfly → L2. Metrics grid,
calibration, layer labels, observation/adapter/feed health, readiness checklist, equations, source
anchors, warnings → L3.

## 5. Surfaces (replacing the 6 modes)

Intent-named, not jargon-named. Each is a *view* over the same snapshot, with a clear reason to switch.

- **Today / Now** (was none): real Sun + current stage + plain insight. The L0/L1 home.
- **Explore** (merges Cycle Lab + Regions + Geometry): the L2 hands-on surface.
- **Space Weather** (was Weather): SWPC-backed Kp / F10.7 / GOES-X-ray / solar-wind mapped to
  plain-language impacts (aurora, GPS, radio, satellites) — explicitly *learning*, not alerts.
- **Research** (merges Schema harness + research panel): the L3 back room, incl. provenance,
  readiness, golden/seed info, export.

"Classroom Guided Journey" becomes the L1 **tour**, available from L0, not a peer tab.

## 6. The hero — observed + model compositing

This is the highest-leverage change and the one the prior plan declined to make.

### 6.1 Base layer (observed)
- Source: **Helioviewer** quicklook imagery (e.g., SDO/HMI continuum for the visible photosphere;
  SDO/AIA 171/193 as optional "active Sun" context). Public API:
  `https://api.helioviewer.org/v2/takeScreenshot/` or `/v2/getJP2Image/` per
  `docs/DATA_SOURCES.md`. Cache politely; store the image **plus its metadata** (sun-center pixel,
  arcsec-per-pixel scale, observation time) so overlays register correctly.
- Honesty: labeled `observed (Helioviewer quicklook)`; never presented as calibrated science FITS.
- Fallback: if imagery is unavailable/offline, fall back to an **upgraded synthetic** photosphere
  (flat limb-darkening — remove the 3-D specular highlight — real granulation, *dark* sunspots with
  penumbra), clearly labeled `synthetic`.

### 6.2 Model overlay (synthetic / inferred / blended)
- The engine's `active_regions`, `br_normalized`, `confidence` composited on top of the base,
  registered to the imagery's sun-center/scale.
- A base switch: **Observed image** ↔ **Model field** ↔ **Blend**, with the layer-kind label
  updating live (reuse `layers[].kind`).
- Selected region gets an unmistakable treatment (glow ring + label + optional magnetic-loop arcs),
  derived only from snapshot data.

### 6.3 Registration / projection
Replace the ad-hoc `projectRegion` with a projection that consumes the imagery metadata
(sun-center, radius in px, B0/P angle if available from JPL Horizons cache) so model lat/lon maps
onto the real disk. Keep CPU-simple; this is geometry, not physics.

## 7. Time & motion (the missing dimension)

The app is about a *process*; today it is frozen. Two time concepts:

- **Cycle time** (min→max→declining): drive the stage rail + butterfly. Requires a **series of
  snapshots**, not one. The engine must emit a frame manifest (see §8).
- **Rotation / short-term evolution** within a run: scrub `run.time_seconds` across a frame series;
  watch regions rotate and decay.

"What-if" without cheating the invariant: pre-generate a **small library of seeded snapshots**
(e.g., stage × activity-index) via `solar-cli`; the UI switches between them. This gives the *feel*
of manipulation while keeping "no browser-side physics" intact. A slider selects the nearest
pre-computed run; the UI labels it as a selected seeded scenario, not a live re-solve.

## 8. Engine / backend implications (beyond the browser)

The rebuild needs new data products. These extend, not break, existing contracts.

1. **Snapshot series for playback.** Add `solar-cli replay --series` (or a new `frames` command)
   that emits an ordered set of `solar-state-snapshot.v1` frames + a `series-manifest.v1`
   (frame list, times, stage labels). Deterministic + golden-tested.
2. **Real butterfly data.** Emit (or derive from SWPC historical `solar_regions` cache) a
   latitude-vs-time table so the diagram is scientifically correct. Add
   `tools/validate_*` coverage.
3. **Helioviewer image retrieval.** Extend `tools/fetch_public_data.py` to fetch an actual image
   (not just `getDataSources`) + metadata, cached under `.cache/solar-data/` with provenance.
4. **Scenario library.** A make/CLI target that generates the stage × activity snapshot set the UI
   needs for the what-if slider.
5. Preserve determinism, provenance, and the readiness gates throughout. `validate_snapshot.py`,
   `validate_operational_readiness.py`, `validate_web_static.py` remain in CI; add new validators.

## 9. Frontend architecture (the rebuild)

- **Stack:** Vite + TypeScript. Vanilla DOM or a tiny view layer (e.g., Preact/lit) — no heavy
  framework. Output stays **static** (deployable as files / `http.server`, same as today).
  Canvas 2D now; the workspace's `wgpu`/WebGPU roadmap (`docs/ROADMAP.md` v0.2) remains the future
  GPU path.
- **The snapshot JSON contract is the API boundary.** Generate TS types from the contract; the
  frontend only consumes snapshots/series/imagery/feed-status. The engine is untouched by UI churn.
- **Module breakdown:**
  - `data/` — snapshot loader, series loader, imagery loader, feed-status loader, TS contract types.
  - `render/` — `Photosphere` (image or synthetic base), `ModelOverlay`, `RegionMarkers`,
    `Butterfly`, `StageRail`, projection utils.
  - `ui/` — layer state machine (L0–L3), surfaces, tooltip/glossary, onboarding tour, scrubber,
    inspector, research panel.
  - `state/` — single UI store (active layer, surface, selected region, time index, base layer,
    toggles). Snapshot is immutable input; UI state is separate.
- **Accessibility from the start:** keyboard nav, focus-visible, ARIA on interactive canvas
  alternatives, WCAG AA contrast (audit the current gold-on-dark palette).

## 10. Phased delivery (each phase independently shippable + testable)

- **Phase 0 — Foundation.** `git` has **zero commits today**; commit the current v0.1.4 baseline
  first as a rollback point. Stand up Vite+TS, generate contract types, port the existing render as
  a baseline behind the new shell. *Done when:* current behavior reproduced on the new stack;
  `validate_web_static` passes.
- **Phase 1 — Hero + layout.** Kill the void (Sun above the fold), L0 Glance state, real
  Helioviewer base with synthetic fallback, observed/model label. *Done when:* first screen shows a
  recognizable Sun + stage + one plain sentence with no scroll, online and offline.
- **Phase 2 — Disclosure + language.** L0–L3 layer machine, intent surfaces (§5), beginner copy,
  tooltips/glossary, onboarding tour, region inspector with obvious selection. *Done when:* a
  newcomer can state one true thing in 30s; research stays hidden until requested.
- **Phase 3 — Time + correct science.** Snapshot series from engine, scrubber/playback, real
  latitude-vs-time butterfly, what-if scenario slider. *Done when:* playback animates the cycle and
  the butterfly is time-based.
- **Phase 4 — Research back room.** Provenance, adapter/feed health, readiness checklist, observed
  vs model comparison, run export. *Done when:* a researcher reaches equations/provenance/export in
  ≤2 clicks and can export a seeded run.
- **Phase 5 — Polish.** A11y audit, perf (imagery caching, canvas/DPR), mobile, copy pass.

## 11. Acceptance criteria (Definition of Done — measurable)

- **First impression:** recognizable Sun + stage + one plain idea, above the fold, ≤2s after load;
  no empty-void scrolling on a 1080p screen.
- **Beginner test:** a person who knows nothing can state one true thing about the Sun after 30s
  without using the glossary.
- **Researcher test:** equations, provenance, and export reachable in ≤2 clicks from any screen.
- **Honesty:** every layer shows its kind; base imagery labeled observed; offline falls back to
  labeled synthetic; operational use still reads blocked with its gate checklist.
- **Science:** butterfly is latitude-vs-time; no element is mislabeled.
- **Interactivity:** time scrubber/playback works; what-if selects pre-computed seeded runs (no
  browser-side physics).
- **Quality bars:** no horizontal overflow desktop or mobile; WCAG AA contrast; full keyboard nav;
  existing + new validators green.

## 12. Risks & mitigations

| Risk | Mitigation |
|---|---|
| "Both audiences" collapses back into "neither." | Strict layer discipline; default to L0; research is opt-in only; grade against §11 beginner + researcher tests every phase. |
| Helioviewer rate limits / offline. | Cache image + metadata; labeled synthetic fallback; never block first paint on the network. |
| Scope creep on a "fundamental rebuild." | Phases are independently shippable; Phase 1 alone already beats the current app. |
| Registration of overlays onto real imagery is wrong. | Use imagery metadata (sun-center, scale) + Horizons B0/P angle; validate with a known date; degrade to model-only base if metadata missing. |
| Snapshot-series work balloons the engine change. | Start with a short fixed series (golden-tested); expand later. |

## 13. Relationship to the prior (Codex) plan

The Codex plan's tactics are largely **adopted into Phase 2** (stage rail, tooltips, table/card
copy, selected-region effects, "what changed", workflow surfaces). What this spec adds — and what
makes it a *fundamental* redesign rather than a correction — is everything the prior plan explicitly
excluded in its Assumptions: **real imagery**, **time/playback**, a **real butterfly**, an
**onboarding path**, a **build/rebuild**, and the **engine-side data products** required to support
them.
