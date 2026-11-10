# Guarded interpolation application qualification — 2026-11-05

The isolated guarded candidate passes all 1,494 web tests and the complete
original Windows native and SwiftShader browser commands at `/sol/`, including
physical spin and image assertions. Linux execution has launched; its result is
not yet retrieved. No optimization,
production readiness or deployment follows from the Windows result.

The [private helper/material controls](SURFACE_GUARDED_20261105.md) preserve
sampled bits and captured pixels across three backends. Both Linux material
cohorts remain retained; their modest, variable timings justify this separate
application test without establishing application speedup. The approved crisp
Illustrative Earth default and the Source-qualified rendering recipe are preserved.

## Exact isolated source and build

`build/guarded-app-20261105/source/` is a plain copied source root. It is not a Git
worktree and creates no commit. Its inventory records all 1,631 current dirty
source files, 131,311,267 bytes, with per-file hashes and immediate copy readback.
The current checkout and original 227-asset stage remain unchanged. The original
stage's 207 source mappings pass immediately before isolation.

Only two copied files change:

- `apps/web/js/atmosphereScattering.js`: exactly the reviewed guarded horizontal
  reads and row arguments inside `scatteringResidual`. Reversing the replacement
  restores the original file byte for byte. The exported GLSL equals the private
  GPU-tested candidate exactly.
- `tests/web/scatteringSingleLayer.test.mjs`: three additional regression groups
  cover every interior stencil position, competing first events and invalid-alpha
  precedence when RGB is also nonpositive. They pass against the baseline before
  changing the shader, then as part of the complete candidate suite.

The existing builder stages the copied source root with the unchanged WASM.
Release `local-guarded-20261105` has 227 assets and 207 source mappings, with only
the scattering source identity changed. WASM hashes and data-bundle ID match the
baseline. HEAD `3a55a795…` records lineage; the inventory, transformation and build
manifest bind the actual dirty candidate bytes.

Source review identifies that this first build uses the builder's `/` default,
whereas the baseline uses `/sol/`. Retain its passing route-specific evidence.
A separate `local-guarded-sol-20261105` build at `site-sol/` restores `/sol/`
without changing source, WASM, data, tests or rendering settings. Its manifest
SHA-256 is `45e5ff86b94624b5af3b8318c74b7927999b726c1349a3c0ffbec1789ed89855`.
The baseline-path browser replay must use that exact second build.
It also completes with exit zero, `status:passed` and the original gates passed
with physical spin enabled. Its browser-only runtime coverage is 85.62% lines,
75.72% branches and 80.42% functions. Merging the same exact-source Node coverage
with this separate browser result again passes 97.55% runtime line coverage.
Evidence is retained separately in `windows-swiftshader-sol/` and
`combined-coverage-sol/`; the root-route run is not relabeled.

Key SHA-256 identities:

- Source-copy inventory: `69ecbd4451dfa794637fbae7971f20622d898c632ad2b105353ba68e1bcc1743`.
- Original shader module: `452ef5e5d94aacdbe12d861888b85dc96873ed947a7a8090fa22ae3f6e9942d5`.
- Candidate shader module: `f48e389cc118c123916f288b56ce8741adce4928491731f58359bb4792f66285`.
- Candidate scattering GLSL: `1089686906d40efd39a619a4771870dacc5febf3469eb25ca258edf02e2d277c`.
- Candidate stage: `37f064adea3bb574bc35fb8e0ecf1092d2e3da64fccc26f850d2f75249c75c76`.
- Unchanged browser validator: `640c4bb2114553744125008c8cb368616a1591f9cad6d8bc4d42fbe882a73497`.

## Windows validation

Commands run inside the copied source root:

```powershell
node --check apps/web/js/atmosphereScattering.js
node --experimental-vm-modules --test tests/web/scatteringSingleLayer.test.mjs
npm test
python tools/validate_release_manifest.py ../site/web-release-manifest.json --expected-sha256 37f064adea3bb574bc35fb8e0ecf1092d2e3da64fccc26f850d2f75249c75c76
$env:CHROME_BIN = 'C:/Program Files/Google/Chrome/Application/chrome.exe'
node tools/browser_validation.mjs --web-root=../site --output-dir=../windows-swiftshader --backend=swiftshader --physical-spin=true
```

The focused baseline has ten passing groups. The candidate has 1,494 passing
web tests, no failures or skips. Browser evidence records `status:passed` and
`original_gates.passed:true` with the exact candidate manifest and validator.
Earth's blue-pixel check, orbit round trip, submitted high-speed spin, Jupiter
transit and its control, lunar eclipse and its control, recovered Earth look,
illustrative Mercury/Venus and the remaining original scenarios pass. The
original thresholds, quality settings and application deadlines are unchanged.

Browser-only runtime coverage is 85.55% lines, 75.78% branches and 80.32%
functions. Fresh candidate Node coverage again passes all 1,494 tests; its merge
with the candidate browser result passes at 97.55% lines, 97.39% functions and
94.53% branches. The complete hand-written runtime denominator is retained.
Commands:

```powershell
node tools/collect_node_coverage.mjs --web-root=../site --output-dir=../node-coverage
node tools/merge_web_coverage.mjs --web-root=../site --node-input=../node-coverage/coverage-final.json --browser-input=../windows-swiftshader/coverage-final.json --output-dir=../combined-coverage
```

The copied source uses a directory junction to the already
installed locked development dependencies; no package installation is performed
for the Windows copy.

Logs and evidence remain in `build/guarded-app-20261105/`. The 71 browser
artifacts total 7,460,575 bytes. The browser process exits zero after cleanup.
This command proves the recorded Windows software-renderer result, not native,
Linux, hosted CI or physical/scientific release qualification.

The separate native `/sol/` command also exits zero with original gates passed.
Its observed application context is Qualcomm Adreno X1-85 through ANGLE D3D11,
including the physical-spin context. The submitted high-speed check records six
draws and 0.1571 rad rotation. Its Earth, orbit, Sun, transit/control and
eclipse/control assertions pass; browser-only coverage is 85.84% lines, 75.90%
branches and 81.14% functions. This does not establish a native speedup.

Parent saved-result admission verifies all three actual Windows commands,
their exact stages and the complete fixed 17-source validator/helper map.
Twenty-one malformed receipt controls reject empty, omitted, extra or substituted
source identities, non-boolean gates, failed status and wrong artifacts. Earth
v7 receipts verify both passes, 1.6 exposure, cloud-on/off values, zero GL errors,
changed pixels and equal paused epoch/camera/positions. All 207 current main
source owners still match the baseline. Admission SHA-256:
`f2ad4df7b23e8c6f6eefbd6000b6bfd340f9d6e8501d165ce660c3e03d0fda5e`.
The user reconfirms keeping Illustrative Earth; its 14 focused source tests pass.

Independent source-copy/transform review receipt:
`66edec882fc4428b464b40773b55b197a471d82e073299f67539d457650eef29`.
Independent Linux v2/v3 source/transport review receipt:
`7deb93df7827f3e355888e149109330cbb24bd5dfdf7fb33a0e12a7891df8b8d`.
The first review scopes its root-route artifact separately; the second verifies
the `/sol/` delta. Neither source review claims a runtime or release pass.

## Linux replay boundary

A 314,309-byte delta is prepared over the retained 69,922,136-byte input archive
and pinned official Chrome157. It contains the new manifest, 47 new content
blobs and reviewed controller: 49 ordinary members. The new manifest maps 605
logical files to 430 blobs. It includes the current original validator and
`render_pair_state.mjs`, while retaining the historical input manifest separately.
The exact original browser command uses physical spin and its unchanged gates;
the controller's 1,200-second outer deadline is distinct from app deadlines.

The initial generator attempt stops at an exact string-occurrence assertion and
leaves only a manifest in `linux-upload/`; it is never uploaded or executed.
The separately generated complete root-route package is `linux-upload-v2/`.
It is also retained without execution. The baseline-path package is
`linux-upload-v3/`: 314,690 bytes, 49 members, SHA-256
`bc3d2f3ec53f084b4880888fcc171b1651e2f5f46c2c313645058185204dc415`.
Its manifest is `16357633…`, with the same 605 files/430 blobs; it selects the
exact `/sol/` stage `45e5ff86…`. Source and transport review completes without an
actionable P0–P2 execution blocker. Original Linux failures remain
failed. Any subsequent result must retain partial evidence, source postchecks,
owned-process cleanup and a separately observed live closure.

The three v3 files are transferred to the already authorized Cloud Shell home.
A separate read-only SHA-256 check verifies driver `d9879483…`, 314,690-byte
payload `bc3d2f3e…` and bootstrap `9e5e70fb…`. Only this reviewed v3 bootstrap is
executed. The actual launch marker identifies `/tmp/sol-gac-bkhj5nlo`, controller
PID3659, manifest `16357633…`, unchanged stock Node26.13.0/npm12.2.1 and the pinned
official browser archive. This proves launch, not completion or current liveness.

Browser control becomes unavailable after a read-only status command is pasted
but before it is submitted. The alternate connected-device route requires
reauthentication and supplies no remote observation. No Linux result, archive
admission or live closure is inferred, and the job is not restarted. Its reviewed
controller retains the 1,200-second browser bound, owned cleanup and failure
packaging. Retrieval must inspect the existing root and actual process/result
state when supported access returns. The local handoff is
`build/guarded-app-20261105/LINUX_RETRIEVAL.md`.

On the next capability check the JavaScript browser service is available again,
but its supported setup call explicitly returns `Local browser use is disabled
in Work settings`. The existing VM job remains unobserved and is not restarted.
The separate [offline source crosscheck](OFFLINE_READINESS_20261105.md) reproduces
both candidate WASM engines exactly while this external access remains unavailable.

Rollback is discarding this isolated candidate. The current application, baseline
stage, prior controls, failed evidence, accuracy contract and release holds remain
unchanged. No commit, push or deployment occurs.
