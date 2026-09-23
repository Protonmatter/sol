# Decision log

Status terminology: **proposed choice** means the implementation plan selects it; **verified fact** means inspected in this planning task; **qualification pending** means execution/evidence is still required. None is production approval.

| ID | Decision and reason | Alternative / consequence | Status |
|---|---|---|---|
| D01 | Separate observed Sun and illustrative full-sphere 3-D; preserve main Observe destination | A single image wrapped onto a freely orbitable sphere cannot provide measured far-side coverage | Proposed choice |
| D02 | New 3-D inspection defaults to a labeled 171-style illustrative corona after qualification | Keeping half-observed default preserves the reported visual defect; visible-light mode remains available | Proposed choice |
| D03 | Keep Rust/offline products authoritative; shader evaluates declared appearance fields only | Browser-owned physics would duplicate model state and provenance | Proposed choice |
| D04 | Use current engine rotation coefficients for related modeled features and explicit Carrington frame | Legacy NSSDC-style recipe remains readable but cannot control new shared region poses | Proposed choice; coefficient difference verified |
| D05 | Preserve snapshot v3, existing raw ABI and old appearance v1; add separate contracts/exports | In-place schema reinterpretation breaks existing scientific/readback guarantees | Proposed choice |
| D06 | Statistical granulation with scale filtering initially; optional simulation patch later | Full convection solver is out of scope; oversized boiling cells at whole-disk scale would mislead | Proposed choice |
| D07 | Offline PFSS constrains quiet topology; plasma emissivity remains a declared model | PFSS is not dynamic MHD and cannot justify eruptions or thermal inference | Proposed choice |
| D08 | Use PFSS analytic papers/reference code as validation context; no mandatory pfsspy dependency | Project documentation says pfsspy is archived; introducing it as maintained runtime dependency is unjustified | Verified upstream status; proposed implementation choice |
| D09 | One model scenario clock, separate observed acquisition clock and orbital clock | Independent hidden texture/loop speeds produce incompatible feature positions and apparent events | Proposed choice |
| D10 | Fast processes are filtered at high rates; no hidden slowed granulation | One attractive animation rate cannot represent minutes and weeks simultaneously without disclosure | Proposed choice |
| D11 | Blender offline reference/authoring, native WebGL2 runtime | A baked movie loses free orbit; arbitrary Blender node graphs/volumes do not transfer as equivalent glTF shaders | Proposed choice |
| D12 | CPU Cycles first on local ARM64; separately test EEVEE/Vulkan | Adreno Cycles support and render throughput are not established; no installation located in bounded checks | Verified local discovery; runtime qualification pending |
| D13 | Scene-linear diagnostic parity before tone mapping; separate AgX preview | Tone-map differences can conceal or invent apparent renderer disagreements | Proposed choice |
| D14 | Retain existing shared HDR tone map initially; add encoding opt-in and optional bounded bloom | A global color-pipeline rewrite risks unrelated planetary regressions | Proposed choice |
| D15 | No new mandatory Cargo/npm dependencies | Optional FITS/calibration/VDB authoring tools get a separately pinned environment if needed | Proposed choice |
| D16 | No automatic repetitive CME; events are explicitly selected finite lessons | Repeating eruptions at arbitrary intervals teach a false solar rhythm | Proposed choice |
| D17 | New assets admitted by exact bundle/generation/context identity with bounded resource budgets | Best-effort mixed-data rendering is visually confusing and invalidates evidence | Proposed choice |
| D18 | Preserve old release and legacy mode through migration; enable new default only after gates | Source-only rollback can mismatch new manifests and cached assets | Proposed choice |

## External evidence still needed

| Item | Work can proceed before it? | Required before |
|---|---|---|
| Exact Blender executable/version and CPU/EEVEE smoke test | Yes: model/contracts/browser plan and implementation | Claiming Blender pipeline works on this host |
| Qualified bounded SDO sequence, metadata, rights and quality interpretation | Yes: synthetic fixtures and sequence loader | Observed sequence acceptance / distribution |
| Instrument response/calibration data for quantitative EUV synthesis | Yes: explicitly relative illustrative emission | Calibrated radiance, temperature or density claims |
| Physical iPhone model and Safari test access | Yes: CPU/desktop work and responsive layout | Mobile rendering/performance acceptance |
| Scientific reviewer comparison against independent observations | Yes: implementation under proposed assumptions | Scientific visual acceptance |
| Actual measurements for morphology/performance thresholds | Yes: numeric fixtures and proposed budgets | Empirical fidelity/performance claims |
| Maintainer/release acceptance under existing policy | Yes: isolated local implementation and evidence | External publication/deployment |

These evidence needs do not block creation of this implementation plan. They remain named tasks in its execution path. No user confirmation is requested merely to decide low-risk reversible implementation details.

## Options intentionally deferred

Full MHD imports, non-LTE chromospheric line synthesis, true multi-instrument instantaneous far-side reconstruction, inverse thermal diagnostics, physically calibrated white-light Thomson scattering, a WebGPU backend, and cloud/GPU render services require separate scoped designs. They are not implied prerequisites for correcting the current visual experience, and the initial release must not claim them.
