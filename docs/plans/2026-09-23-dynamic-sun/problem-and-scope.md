# Problem, scope and acceptance

The current Sun becomes partly or almost wholly smooth when viewed outside source-image coverage. Its disk is a paused or finite two-frame reference; its dominant coronal motion comes from repeating display effects. The task is a coherent, scientifically grounded dynamic experience across camera angles, zoom levels and devices.

## Intended result

Users can explore a luminous star with scale-appropriate evolving detail, understand which layer/channel they are viewing, and distinguish measurements from models without reading a long technical disclaimer. Researchers can inspect exact source epoch, coordinates, model assumptions, units, quality and display transforms. The scene remains usable on mobile through bounded quality tiers and explicit state transitions.

The design prioritizes physical consistency and honest provenance. It does not require every process to be solved from first principles. In particular, a reduced-model corona is a plausible educational model, not a reconstructed observation or calibrated space-weather prediction.

## Included

- Visible photosphere: neutral-white continuum appearance, limb darkening, spots/penumbrae, facular contrast and evolving granulation at appropriate zoom.
- Chromosphere/transition-region explanation and observed channel support; illustrative spicules/prominences after their bounded transfer path passes tests.
- EUV coronal rendering: field-aligned strands, diffuse emission, coronal holes/plumes, local evolution, proper limb occlusion and optional events.
- Educational interior cutaway: core, radiative and convective zones, physically ordered with explicitly exaggerated thin atmospheric layers where necessary.
- Observed sequence ingest/preparation/playback; no compulsory live internet dependency.
- Deterministic Rust appearance fields and offline field extrapolation products; additive raw WASM interface and bounded worker integration.
- Blender scene construction, reference render specification, numeric interchange and comparison workflow.
- Mobile controls, pause/scrub/rate, quality admission, failure states, accessibility and validation.

## Excluded from initial release

Full radiative MHD, coronal heating prediction, non-LTE line synthesis, reliable magnetic energy budgets, calibrated electron density/temperature inversion, measured far-side reconstruction from a single image, operational CME prediction, dynamically simulated stellar interior, a new 3-D framework, cloud rendering service, automatic public-data scheduling, and unreviewed production release changes.

Observed 131/94 flare diagnostics and calibrated response synthesis are later extensions requiring their own calibration products; never label a single-temperature Gaussian approximation as the instrument response. A scripted flare or CME remains explicitly illustrative and opt-in.

## Acceptance requirements

| ID | Requirement |
|---|---|
| SUN-01 | Illustrative 3-D coverage is continuous through a full orbit and at both poles; there is no unexplained smooth hemisphere or duplicated observational active region. |
| SUN-02 | Observed/source, illustrative/model and legacy reference are visibly distinct; original observation timestamps and coverage remain intact. |
| SUN-03 | Visible and EUV modes use different physically justified image formation; photospheric granulation is not passed off as measured EUV structure. |
| SUN-04 | A single modeled scenario clock and coordinate contract control related surface, field and atmosphere features; acquisition and orbital clocks remain separately labeled. |
| SUN-05 | Local disk structure evolves beyond camera motion, rigid rotation and uniform brightness change; the motion is measurable only where its scale and selected time rate make it resolvable. |
| SUN-06 | Coronal structures have localized intensity/shape evolution and field-related topology; no mandatory global pulse or repetitive eruption substitutes for it. |
| SUN-07 | The photosphere occludes background and rear atmosphere correctly; foreground cool material can absorb where its recipe allows; volume bounds do not create a solid shell. |
| SUN-08 | Source data is immutable, hash-bound, channel/epoch/quality-aware, and kept separate from model assumptions and display LUTs. |
| SUN-09 | Identical seed, scenario and target time give reproducible descriptors, independent of frame rate, seek history and scheduling; floating-point portability uses stated tolerances. |
| SUN-10 | Fine-detail visibility and temporal filtering depend on physical projected scale; enlargement or time averaging is disclosed. |
| SUN-11 | Pause, explicit scrub, rate change, sequence end, mode switch, reduced motion and background resume have defined tested behavior. |
| SUN-12 | Shader, worker, asset, resize and context-loss failure retain a truthful usable state without stale cross-generation publication or leaked GPU resources. |
| SUN-13 | Performance and memory admission meet the proposed device-tier budgets in design-review; measurements identify real hardware and feature set. |
| SUN-14 | Linear composition, exposure, tone mapping, source-intensity normalization, palette and bloom are individually testable; measurements never use post-bloom RGB as plasma data. |
| SUN-15 | Blender and browser consume matched scene inputs; numerical transfer comparison uses linear, bloom-free outputs and separate scientific observation references. |
| SUN-16 | Interior/layer controls preserve the distinction between an educational cutaway and an external observation; no transparent external photosphere exposes interior structure by accident. |
| SUN-17 | Existing snapshot, WASM, ephemeris, sky, planetary appearance, accessibility and release identity contracts remain compatible; v1 legacy references remain readable. |
| SUN-18 | All new renderer components, scenario data and offline recipes enter the existing immutable build manifest and qualification process; a rollback switches the whole compatible bundle. |

## Proposed acceptance scenes

Define fixtures before tuning against them: quiet photosphere; active photosphere; quiet EUV; active EUV; source-view observation sequence; near-limb loops; polar view; far side; an isolated cool prominence; an explicitly initiated eruption; cutaway; missing/corrupt source; low-capability device. Scenarios have independent deterministic IDs and source/model labels. Quiet and active states are educational scenarios, not a claim of the Sun's current condition.

Use one observational sequence for development and a separate held-out sequence for morphology review. Match channel, resolution, PSF treatment and temporal sampling before comparing statistics. Do not tune every acceptance image until a prescribed similarity score passes.
