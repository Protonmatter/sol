# Optional full-feature process memory observations

The application validators accept `--memory` as a separate follow-up after all
their original application gates pass. This adds no runtime telemetry, network
requests, dependencies, or application settings persistence. It reuses
`tools/texture_device_telemetry.mjs` and the existing Windows PowerShell 5.1
collector `tools/texture_device_memory.ps1`.

The counters are OS process and WDDM observations. They are **not attributable
texture VRAM**, resident GPU allocation measurements, or a reason to replace
scientific data formats. Working sets may share pages; committed bytes are not
physical residency. Missing, failed, or unsupported counters remain unavailable.
Zero is retained only when the collector actually observes a valid zero.

## Commands and prerequisites

Use an immutable staged release, an immutable validator snapshot whose source
files match the release, the repository's Node 22 environment, and an installed
Chrome executable. `CHROME_BIN` selects Chrome for the browser validator;
`--browser=<absolute-path>` is also available in the physical validator.
Run the GPU tools serially. No elevation or additional permissions are needed.

```powershell
node tools/browser_validation.mjs --web-root=<staged-release> --backend=native --hdr-candidate=true --physical-spin=true --memory --output-dir=<new-evidence-directory>
node tools/physical_rendering_validation.mjs --web-root=<staged-release> --backend=native --terrain-close-detail --context-loss --mars-optical-animation --memory --out=<new-evidence-directory>
```

`--memory` takes no value and may occur once. The Mars validator requires
`--mars-optical-animation` with memory sampling so its original actual level-4
terrain/physical/HDR animation gate must pass first. Both tools default to
SwiftShader when `--backend` is omitted. The backend flag alone is insufficient:
the tools read the actual application context and reject a requested native
backend that reports software or an unknown renderer.

Exit zero means the requested application and optional memory-scope predicates
passed. Nonzero means validation or cleanup failed. Counter unavailability is
retained as unavailable evidence, not treated as an application rendering defect.
A successful process exit therefore does not imply every memory counter exists.

## Timing and ownership

OS sampling starts only after the entire original tool acceptance is complete.
The browser validator first finishes System, all visual and UI checks, and its
coverage output. The Mars validator first finishes its original 240-second run,
including the actual Mars five-second collection, and clears that timer. The
original 75-second System admission, five-second draw acceptance, 30-second
shader-manager deadline, and restoration gates are unchanged.

The optional follow-up has its own 300-second total bound. Each new preparation
uses the unchanged 75-second physical-readiness helper, followed by the unchanged
five-second actual-draw collector. Native restoration retains the existing
10-second event bound; the restored memory preparation is separately labelled.
The required registered imagery shares that preparation's absolute 75-second
deadline. Waiting for images, checking them before sampling, and the immediate
check after sampling never restart this deadline. A sample that crosses the
deadline cannot qualify as a full-feature checkpoint.
The existing OS collector retains its 15-second process limit. No OS sample can
overlap a protected preparation or draw window, and no protected window can start
during a sample. The evidence records monotonic start/end boundaries.

Every checkpoint obtains fresh `SystemInfo.getProcessInfo` results from the
exclusively launched browser's CDP session. Only these exact process IDs are passed
to PowerShell. The collector rejects unowned process/counter rows. After page
closure it discovers the surviving owned processes again. It neither discovers
arbitrary desktop processes nor terminates any unowned browser.

## Checkpoints and evidence limits

The evidence contains these five checkpoints:

1. Original gates complete: a baseline with current state, without a full-feature
   assertion.
2. Full features active: source textures, optical transfer, HDR and animation
   enabled; terrain also enabled. Actual physical producer and matching final
   presentation draws precede the sample. Mars additionally requires source-bound
   level-4 terrain and shadow-buffer proof. Earth has no supported terrain mesh.
3. Full features after context restoration: repeat preparation and actual draw
   proof, requiring a new graphics context generation before sampling.
4. System exited: the actual application reports System inactive.
5. Application page closed: fresh owned-process discovery without page heap data.

The two active checkpoints store full draw receipts, source identities, renderer
capabilities, and feature-state snapshots before and after OS sampling. Both
snapshots must retain enabled features, admitted optics/HDR, and the proven
graphics context generation. They also require registered imagery readiness:

- The selected checkpoint body's registered surface source must be ready.
- For Earth, every enabled night-lights, selected cloud source (historical
  composite or daily weather), and sea-ice role must be ready. Disabled roles
  and deferred/unavailable sources unrelated to the checkpoint are allowed.
- Preparation freezes the required source IDs, body/role, paths, SHA-256 digests,
  dimensions, and Earth layer selectors from the immutable page's registered
  inventory. Every check uses a fresh appearance-status snapshot. Missing,
  queued, loading, or deferred required sources keep preparation pending;
  unavailable sources or changed identities/selectors fail the checkpoint.
- Context restoration repeats the requirement derivation and waits for fresh
  readiness. The restored event precedes asynchronous base-program completion;
  the existing optics/HDR/terrain readiness wait must complete before imagery
  availability is classified. The temporary context-loss `unavailable` status
  cannot fail that pending restoration. A source still unavailable afterward
  does fail. Both waits share the same original absolute deadline.
  Before sampling, the same required sources must be ready. The
  post-sample check is immediate: waiting for a failed or unloaded source to
  recover would describe a later workload and does not rescue the sample.

Registered imagery readiness describes the loaded source/cache workload. It is
**not proof of the imagery textures bound at a GPU draw**. The independent actual
numeric optical field/producer and final HDR draw checks remain mandatory.
Actual submitted-draw proof precedes sampling; this
does not establish that every frame during the counter interval completed on the
GPU. Page JavaScript heap metrics are separately labelled and exclude image
pixels, workers, GPU allocations and total process memory.

The browser receipt is `browser-evidence.json`; the Mars receipt is `evidence.json`.
Both keep `original_gates` independently from the optional `memory` result and
hash the validator, producer/terrain probes, coordinator and PowerShell collector.
Failed and unavailable observations are retained. Final native measurements must
be collected against the final combined scientific source and stage; the older
2ba2911 application timing receipts do not establish memory usage for that source.

Rollback is omission of `--memory`; the original validation workflow then runs
without OS sampling. These changes make no production runtime modifications.
