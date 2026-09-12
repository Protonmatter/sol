# Context map

## Baseline and evidence

The inspected source is `917ad5b1c06a5070c371ffb4dc033ae2ffbc83a7` on `master`. The September 11 review recorded 87 Rust tests, 162 Node tests, 30 Python contract/governance tests and 13 optional-server tests passing, plus local Rust formatting/lint, WASM builds and web static/type checks. It also preserved independent counterexamples for event scheduling, browser presentation/cache behavior, historical calendars, event windows and range semantics. These are historical baseline results, not verification of this plan's proposed changes.

The review observed a deployed SHA older than master, accumulated ingest PRs, approval-required automation checks, incomplete required-check settings, and a manual deployment bypass. Re-fetch those settings and run identities during authorized implementation; the plan does not assume September 11 remote state remains unchanged.

No tracked `AGENTS.md`, `code_review.md` or `CODEOWNERS` was found in the reviewed tree. The user's supplied engineering and review rules apply. The separate dirty working copy is out of scope.

## Components, boundaries and consumers

| Component / current files | Responsibility | Consumers and risk |
|---|---|---|
| `crates/solar-core/src/{flux_transport,active_region,assimilation,grid,contracts,json_read}.rs` | Reference model, event evolution, fields, scalar correction and JSON intake/output | CLI and solar WASM; event loss, invalid intake, uncertainty and coordinate semantics |
| `crates/solar-cli/src/main.rs`, `crates/solar-ingest/src/lib.rs` | Simulation, replay and public-data normalization | Data pipeline, research exports, fixtures; atomic replacement and truthful observation provenance |
| `crates/solar-wasm/src/lib.rs`, `apps/web/engine.js` | Raw ABI and solar browser execution | UI responsiveness, deterministic output and cache/ABI pairing |
| `crates/solar-ephemeris/src/{lib,earth_orientation,timescales,stars}.rs` | Local positions, observer geometry, time and events | CLI, optional provider compatibility and My Sky; date, poles, range and accuracy scope |
| `services/ephemeris-server/{server,test_server}.py` | Optional configured Horizons provider | Consent-bound remote location/time; calendars, request bounds, response validation and source attribution |
| `apps/web/js/{data,store,selectors,render,panels,timeline,wavelength}.js` | Solar intake, presentation and temporal exploration | Headline, legend, image, model markers, timeline and exports currently derive state separately |
| `apps/web/js/{sky,skyEngine,accuracy,orrery,orreryTime,orreryDetail}.js` | Sky and Solar System tasks | Focus stability, actual rendered epoch, object lists, label density and scientific claim scope |
| `apps/web/{index.html,styles.css,app.js,sw.js}` | Shell, responsive layout, lifecycle and offline cache | All three destinations; mobile ordering, navigation visibility and coherent upgrades |
| `tools/{fetch_public_data,run_daily_ingest,generate_fixture_snapshot,generate_series}.py` | Acquisition, derivation and publication | Source age must survive fallback; individual atomic writes are not a multi-file transaction |
| `tools/{generate_moons,moon_model}.py`, `tools/ephemeris-data/` | Generated scientific assets and provenance | Canonical rounding, coefficient/source correspondence, immutable inputs and notices |
| `tools/{validate_snapshot,validate_ephemeris_snapshot,snapshot_semantics,jsonschema_min}.py` | Structural and semantic contracts | Shared corpus required; lightweight schema engine does not enforce all declared keywords |
| `.github/workflows/`, `tools/{build_web,build_wasm,validate_sdlc}.py` | Validation and release | Separate workflow success is not a same-SHA complete gate; deployment rebuild and manual bypass require change |
| `tools/browser_validation.mjs`, `tests/web/`, `tests/python/`, Rust tests | Assurance | Existing Chromium/SwiftShader profile is not mobile, real consent, active-motion or full accessibility qualification |

Rust workspace runtime dependencies remain zero; web production code remains dependency-free. Existing locked development tools are retained. Empty GPU shader placeholders are not implementation targets and must not be advertised as acceleration.

## Proposed architecture

```text
Immutable source bundle -> Python normalization -> validated solar snapshots
                                      Rust core -> solar WASM worker --+
Rust ephemeris -> local WASM ------------------------------------------+-->
Optional configured + consented provider -> validated ephemeris -------+   validated revision
Image identity + registration + accuracy evidence ---------------------+         |
                                                                                v
User intent + supplied clock -> pure presentation resolver -> canvas + text + evidence

Exact source SHA -> one CI candidate -> tested static artifact -> eligibility gate
                                                       -> Pages promotion -> served verification
```

Snapshot validation precedes state publication. Presentation may project declared geometry but does not evolve physics. Provenance, freshness, provider, source kind, availability and accuracy are independent dimensions. A cached observation is still observed, but neither cached nor freshly fetched means newly observed.

## Ownership and review lanes

| Role to assign at P00 | Owns acceptance | Must review |
|---|---|---|
| Maintainer / integration owner | Scope, RFC acceptance, repository authority and release decision | Every contract or release-policy change |
| Scientific contract reviewer | Event ownership, uncertainty, coordinates, ranges, time and accuracy claims | P02, P05, P07, P08 and provenance/generator changes |
| Experience/accessibility reviewer | Primary tasks, responsive design, focus, semantics and manual qualification | P04 and P10–P14, final task audit |
| Delivery reviewer | Same-SHA gate, artifact trust, publication transactions, permissions and rollback | P01, P06, P09, P15 and P17 |

One person may fill several roles in a small project; the author cannot substitute an unrecorded self-approval for a required independent review. No CODEOWNERS identities are guessed.

## Boundaries and unknowns

- No operational forecasting, calibrated magnetic units, new magnetogram assimilation, new ephemeris theory or new GPU backend is included.
- Historical external accuracy reports do not qualify every body, quantity and epoch. Keep claims narrow until a new reference matrix supplies evidence.
- Local mobile emulation does not establish physical-device touch, GPU performance, Safari behavior or assistive-technology usability.
- F18's one observed rounding difference is real; its cross-platform cause is not fully established. The generator decision below defines canonical reproducibility without claiming a proven root cause.
- Owner-managed branch settings and environment reviewers require live verification and separately authorized configuration. A repository validator cannot prove those controls.
- This plan extends coverage of affected Python production paths; it must not continue labeling a five-file denominator as coverage of all Python tooling.
