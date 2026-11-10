# Matched Earth material diagnostic — 2026-11-05

The private diagnostic now captures and replays an actual ready Source-qualified
Earth surface draw on Windows software/native and Linux software backends. Each
completes with original-program versus clone raw RGBA equality and restored tracked
GL state. No shader optimization is promoted. Application, public validator, model
and stage bytes are unchanged.
This follows the [surface-log investigation](SURFACE_LOG_FIELD_20261105.md).

## Captured identity and controls

The capture matches complete linked vertex/fragment source, 68 active uniforms,
ten sampler bindings, and the actual sphere vertex/index buffers against the
48 × 96 geometry construction. Both shadow arrays retain all four vec4 elements.
It requires refraction and incident-field readiness, SDR, current Earth scattering,
and the expected physical Earth mode before freezing the app's GL-instance calls.

The original program and baseline clone render into the same owned multisampled
target at 796 × 612. Raw RGBA differing bytes are zero. The replay retains the
captured geometry, textures, uniforms, vertex shader, viewport and sample count.
Seven variants replace one declared fragment function body each. Their deliberately
nonphysical results are cost controls, not appearance candidates.

One baseline timer warmup is retained separately, followed by six ABBA blocks
(24 positive, non-disjoint query results). All samples remain in the receipt.
Two-sample means below describe only this single software-renderer cohort:

| Fragment intervention | Paired baseline mean, ms | Intervention mean, ms |
| --- | ---: | ---: |
| Reference normalization returns one | 42.545 | 36.641 |
| Scattering residual returns one | 44.650 | 33.095 |
| View transmission returns one | 45.307 | 40.857 |
| Inactive direct-transmission fallback returns one | 45.243 | 44.525 |
| Surface transport returns the input color | 44.698 | 20.636 |
| Surface map sample returns a constant | 42.228 | 32.962 |

The direct row edits an unselected fragment fallback: captured refraction selects
the unchanged vertex-provided incident transmission. Its raw output hash equals
baseline. It cannot measure the cost of active direct transmission. The other
interventions can alter optimization, register allocation and dependent work;
their differences are not an additive partition or an application speedup.

## Native and Linux extension

Windows native04 repeats the same seven-source cohort on the observed Qualcomm
Adreno X1-85 through ANGLE D3D11. The launcher changes only its network setup to
the main validator's CDP Network blocking policy and records that policy. The
hostname resolver and two URL patterns do not establish a general firewall.
No application network calls or dependencies are introduced.

The prior Cloud Shell temporary runtime was gone on resumption. A fresh short
`/tmp/sol-mat-e2kazjac` directory is reconstructed from the retained hash-pinned
public inputs and official Chrome archive. It uses stock Node 26.13.0/npm 12.2.1,
with isolated HOME/cache/empty npm configuration, locked dependencies, install
scripts disabled and no Cloud API credential grant. Chrome for Testing is still
157.0.8103.38; the actual renderer reports SwiftShader Subzero. This is a changed
host/Node environment, not timing parity with the earlier Node 24 runtime.

Both new runs retain one separate warmup and 24 ABBA queries. Each records seven
images, 68 complete uniforms, the exact geometry buffers, zero original/clone raw
RGBA differences, unchanged original uniforms and successful tracked-state/query/
guard restoration. Their target is 796 × 612, four samples, RGBA8/depth24. The
actual captured surface field is 128 × 193 × 1 at the recorded pose.

| Fragment intervention | Native baseline, ms | Native control, ms | Linux baseline, ms | Linux control, ms |
| --- | ---: | ---: | ---: | ---: |
| Reference normalization returns one | 7.161 | 6.544 | 1504.891 | 1309.099 |
| Scattering residual returns one | 7.145 | 3.155 | 1626.302 | 1050.772 |
| View transmission returns one | 7.146 | 6.784 | 1494.914 | 1440.894 |
| Inactive direct fallback returns one | 7.151 | 7.245 | 1488.449 | 1516.529 |
| Surface transport returns the input color | 7.150 | 1.153 | 1497.352 | 642.679 |
| Surface map sample returns a constant | 7.142 | 6.574 | 1496.508 | 1312.236 |

Each cell is its own two-query mean, not a pooled estimate. The controls change
compiler optimization and dependent work; these differences do not prove an
additive cost partition. They support testing an equivalent interpolation
implementation next. No map, physical formula, field, sample count, resolution,
appearance default, numerical tolerance or original acceptance gate is reduced.

The owned RGBA8/depth24 target has cleared isolated depth and alpha, while the
original default framebuffer reports 8/8/8/0/24 bits. Other geometry/occlusion is
omitted. Equality concerns the original program and clone in that controlled
target, not a full default-framebuffer image. Saved PNG alpha is forced opaque;
the raw-byte comparison runs before this presentation conversion.

## Reliability and saved review

An initial failed run exposed incomplete reflected array capture and is retained
without timings. Independent review also reproduced query acquisition leaks,
possible interference with a borrowed active query, and primary-error masking
when query reading and release both fail. The private diagnostic now preflights
full uniforms, tracks allocations immediately, releases only owned queries, retries
failed cleanup before state restoration, and preserves compound errors.

Seven supplied CPU tests, thirteen independent timer controls and twelve final-loop
failure controls pass. The saved result review checks exact sources, geometry,
images, query sequence, camera, epoch, uniforms, input postchecks and restoration.
The actual source fixture's old canvas was 732 × 612; layout identity is not claimed.

Review of the new Linux controller additionally reproduced two inherited P2
defects before execution. Browser cleanup could signal a foreign process if a
scanned PID was reused. It now obtains a process descriptor, rechecks UID/start
identity and executable, signals through that handle and closes it in `finally`.
Python documents process-descriptor management separately from numeric-PID
signalling: [os.pidfd_open](https://docs.python.org/3/library/os.html#os.pidfd_open)
and [signal.pidfd_send_signal](https://docs.python.org/3/library/signal.html#signal.pidfd_send_signal).
There is no numeric-PID fallback. A second defect let cleanup failure erase a
command's primary timeout/status/log record. The command now saves its starting
record before launch and persists elapsed time, exit outcome, log hash and both
failure outcomes before propagation. Thirty-seven bounded controls cover these
fixes, admission rejection and exited-leader group cleanup. Historical unexecuted
v2/v3 remain preserved; only reviewed v4 runs on the VM. A subsequent harmless
Linux self-process descriptor open/close succeeds and the signal API is present;
that probe sends no signals. The live successful run needs no browser-scan kills,
so actual TERM/KILL behavior remains covered by CPU failure/race controls.

Ignored local evidence:

- `build/material-cost-20261105/windows-swiftshader-03/`, receipt SHA-256
  `724fc0e727c4707fde38c5bff87be981c6884efe09497d4455de228be65e5021`;
  exact runtime sources and camera fixture are retained in `sources/`.
- `build/material-cost-source-review-20261105/REVIEW.md`, SHA-256
  `8a6507754a6db7f67370759639b279a25a82ef892e37948be3bae3de77816633`;
  review receipt `64be250872780e095a8937cc888bcac4f35ac71267f74b47adbcb3164151a8e8`.
- Stage manifest before/after:
  `9dd2d12c14eeda5a385d5c48002abd71da3c0fe39b93ede4952cf02bff15d65a`.

Additional local evidence:

- Native04: `build/material-cost-20261105/windows-native-04/`, receipt
  `aa044035f26bc685b7755414eb492fabe51b816bd5935d24b977d27b6fdebd7f`.
  Its independent delta/result review receipt is
  `cb51c72467ee82fa5d7f4093d81d026e6486436ab9e70d95c7c8ccb77c4310e4`.
- Reviewed Linux driver: `build/material-cost-20261105/linux-upload-v4/driver.py`, SHA
  `a50c37d8e36c1147347c9ab9c4c5c48bede3b009cd71107537da438fa22ccf1f`.
  Controller review receipt:
  `df015cf11dd7b86325ea1efae50dbef11a90d8296b1e36ab3b87f9677bdba32f`.
- Actual saved Linux archive:
  `C:/Users/mkang/Downloads/linux-material-20261105.tar.gz`, 2,056,140 bytes,
  SHA `1d7ff7aed9ca2799bfcedd76e9e34bd83c5009ba028e3a2deb77188c48fc408e`.
  Its 26 ordinary members total 2,756,449 payload bytes and match their inventory.
  A retained copy and admitted extraction are under
  `build/material-cost-20261105/linux-returned/`.
- Linux controller receipt:
  `de151a0f1c13e12fb82576d8d8623b89b42f32c5e3b6fd43a77f281306364d9c`;
  material receipt:
  `7240a42dd2428939ae1b3abfbd1cc5f666805f6ebfb3d6266254b130a2990c9c`.
- Independent Linux saved-result review receipt:
  `90c8d88c8c6fe458d8ce251ff6c5e9b57f75f2339ca2863e36837e05fac90df1`,
  under `build/material-linux-result-review-20261105/`. It regenerates the seven
  shader variants, verifies uniform bits/types, geometry, decoded PNG RGB counts,
  saved state and rational query means. Raw alpha remains a source-bound recorded
  postcondition, with no cross-backend or full-frame equality claim.
- The bounded return helper serves only the admitted archive on loopback, with two
  handler slots, ten-second socket and 240-second transfer bounds. Its source
  review receipt is `6625f903ead242954a2c382553dd23ffe81ba5f4c21d11bc91ca07efe3903d6e`.
  Actual saved-byte admission remains separate from local write/flush success.

All six Linux commands exit zero, with group absence/reaping and empty successful
browser cleanup recorded. A separate parent read-only live check confirms the
controller, six command PIDs and transfer PID absent, port 8081 refusing
connections and the preview closed. Seven baseline-protected processes remain
exempt, with no scan errors. All 604 reconstructed files and 429 frozen blobs
remain byte-identical. `live-closure.json` binds those observations separately
from scientific/rendering proof.

These full-material diagnostic controls now have native and Linux observations.
Original application gates, strict physical equivalence, net performance and
production readiness remain unqualified. A candidate must pass adversarial helper
and actual-material equivalence, retain all quality settings, then be rebuilt and
checked with the original complete Windows/Linux gates before promotion.
User-requested
[appearance comparisons](EARTH_APPEARANCE_COMPARISON_20261105.md) are actual
application mode captures, separately labeled from these isolated material images.

The later [surface-unroll controls](SURFACE_UNROLL_20261105.md) reach sampled helper
and material equality on all three backends, but the specialized design is slower
on Linux and remains rejected. The next control is a single shared interpolation
body; no measured ablation result by itself grants an application optimization.
