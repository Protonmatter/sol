# Development dependency security correction — 2026-11-07 UTC

The actual installed development graph now reports **zero npm advisories at every
severity**. A fresh audit initially reported eight affected-package entries,
including four high and four moderate. The high-only checkpoint was implemented
and verified first; the user subsequently authorized the required new development
helper and scoped major-version overrides. The complete approved resolution is
now installed and verified. Illustrative Earth, application code, orbital data
and both numerical WASM binaries are preserved.

## Exact installed graph and authorization

All eight direct development dependency names are retained. Puppeteer 25.4.0 is
updated to 25.13.0, with its maintained Chromium-BiDi/Zod 4 chain (locked Zod 4.6.7).
c8 stays 12.0.0 and TypeScript stays 5.9.3. The coverage consumer test-exclude 8.0.0
currently declares glob 13/minimatch 10; scoped overrides select published fixes
in glob 14.0.2 and minimatch 11.0.1, including the nested matcher used by glob:

```json
"overrides": {
  "test-exclude": {
    "glob": {".": "14.0.2", "minimatch": "11.0.1"},
    "minimatch": "11.0.1"
  }
}
```

This also brings path-scurry 3, brace-expansion 5.0.12 and the explicitly approved
@isaacs/nonrecursive-glob-match1.1.0 (BlueOak-1.0.0). Unique package names move
from 64 to 65; physical installed entries move from 67 to 70 because two dependencies
are also nested. Every installed Node package remains development-only. No
application runtime dependency, service, telemetry, provider, renderer or physics
feature is added. Project MIT/Apache and component LGPL declarations are unchanged.

The overrides intentionally cross test-exclude's declared major ranges; they are
not labelled ordinary patch substitutions or an upstream support declaration.
The required glob.glob/glob.sync/minimatch.minimatch APIs, ordinary coverage
selection probes and full integration/denominator checks pass. Keep this scoped
exception documented and review removal when upstream adopts the fixed majors.
Node >=22.12.0 remains the existing Puppeteer floor, now explicit in the operator
prerequisites; not every 22.x minor is supported.

The initial no-new-package high-only correction eliminated all four high entries
while retaining four moderate entries. Its independent review and admission
remain historical, as do its pre-/post-LF source snapshots. The user then approved
the exact four-file proposal and one helper addition. After verifying reviewed
before/proposed hashes, only the root package.json/package-lock.json and their
component rebuild-kit copies were replaced. npm ci uses --ignore-scripts. No
commit, push, publication or workflow-policy change was authorized or performed.

Published fixes:

- [Brace-expansion advisory](https://github.com/advisories/GHSA-qhr7-859c-m2p7)
- [Glob maintainer 14.0.2 release](https://github.com/isaacs/node-glob/releases/tag/v14.0.2)
- [Minimatch maintainer 11.0.1 release](https://github.com/isaacs/minimatch/releases/tag/v11.0.1)
- [Puppeteer maintainer 25.13.0 release](https://github.com/puppeteer/puppeteer/releases/tag/puppeteer-core-v25.13.0)
- [Zod advisory](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)

These are package-level development-tool findings, not proof of an exposed
application exploit. No denial-of-service payload was run against the workstation.
The npm-suggested major downgrade of c8 was not used.

## Complete current-source verification

| Check | Observed result |
| --- | --- |
| Locked install | npm ci with scripts disabled; installed audit returns zero at every severity |
| Current full validation | All nine steps pass: 1,596 Node tests in each of two producers, 25 delivery tests, 16 coefficient tests, actual eight-sample native parity, type/static/governance checks and staging |
| Actual current-stage app | Native/software rendering, seven trusted touch cases each, nine Sky groups, 24 experience groups and 22 expanded physical checks pass |
| Runtime coverage | Full 117-module denominator; original 90% gate passes at 97.58% lines |
| Local performance | Original 4x-throttled 300-pair raw p95 12.6ms <=16ms; raw maximum 15.6ms; JSON p95 41.8ms remains off-main-thread |
| Isolated Linux execution | Native Linux ARM64 Node 22.23.4 passes full Node/coverage with the exact proposed pure JS dependency tree mounted read-only; owned container absent and 3,429 input hashes unchanged |
| Installed dependency correspondence | All 3,426 installed file hashes exactly match the isolated dependency tree used by Windows/Linux prototype checks |
| Browser-driver correspondence | All 24 resolved packages / 2,454 files are identical across high-only,full prototype and installed full graph |

Linux execution is not a Linux npm-install or Linux-browser qualification. The
installed/prototype file comparison covers contents rather than file modes.
Physical-device/Safari/screen-reader/manual acceptance and general performance
SLOs remain separate. Neither a percentile gate nor audit zero promises every frame
or the absence of future advisories.

The current stage is `build/readiness-gap-audit-20261107-01/full-site`, release
`local-dependency-full-fix-20261107-01`, mounted at /sol/. Its manifest SHA256 is
`a540ad779fa34a0b6b903bb2a8be7519402ca80b1e8ae4e2d45b7170649b2bc8`.
All 236 assets and 214 source owners retain their validation. The solar and
ephemeris WASM hashes, science fingerprint and UI fingerprint equal the preceding
TOP08 candidate. Its 109,900 sampled reference checks stay tied to the identical
actual numerical module/inputs rather than being rerun for a development-tool
change. No tighter accuracy claim follows.

## Evidence cohorts, failed artifacts and final documentation

The audit root is `build/readiness-gap-audit-20261107-01/`. Original/fixed audit
bytes, source snapshots, exact lock/installed identities, command exits, logs,
controlled performance samples, browser cleanup and independent reviews are
retained. The isolated full proposal precedes explicit approval and Root promotion;
its Linux/prototype scope is not silently converted into a main-checkout run.

The first high-only package writer emitted CRLF on Windows. Its complete passing
nine-step cohort is preserved. The following correction restores the original
project-required LF, without changing parsed JSON. Its separate source-delivery,
staging and runtime checks pass. A proposal diff writer compounded CRLF and made
the files appear entirely replaced; that rejected presentation artifact remains
separate. The corrected 13,660-byte, 380-line LF diff is independently regenerated
and passes read-only git apply --check. It was not applied as an unchecked patch;
approved exact file hashes guard the actual four-file replacement.

Current full validation and app runs retain equal source-before/source-after
inventories. This report and status update follow terminal postchecks. Preserve
the distinction between artifact-construction and final-documentation snapshots;
regenerate delivery artifacts from the final reviewed checkout before publication.
The high-only checkpoint documentation is preserved separately before this rewrite.

## Recheck, rollback and remaining production acceptance

```powershell
npm ci --ignore-scripts
npm audit --json --audit-level=low
node tools/check_node_coverage.mjs --output-dir=build/NEW-dependency-node-check
python -m unittest discover -s tests/python -p test_ephemeris_distribution.py -v
python tools/validate_accuracy_evidence.py
python tools/typecheck_web.py
python tools/validate_sdlc.py
python tools/validate_docs.py
```

Rollback must restore the corresponding four canonical/rebuild-kit files together,
after verifying current hashes. The intermediate high-only graph is retained under
`full-fix-before/`; the original vulnerable graph is under `high-fix-before/`.
Reinstall only the selected exact lock with scripts disabled, restage and verify.
Either rollback reintroduces documented findings; it is recovery, not a clean
security result. Preserve unrelated working changes and do not reset the checkout.

Fresh read-only remote metadata still identifies master 3a55a795 and successful
October 23 CI/Docs/Coverage run metadata for that baseline, not this dirty source.
Current-source hosted/served/release-rollback, physical-device and manual acceptance
remain outstanding. Supported access still reports browser use disabled; the
existing Cloud Shell job is neither restarted nor signalled. The overall
production-readiness goal remains active.
