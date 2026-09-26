# Seven-planet rollout review - 2026-09-25

This records the seven-planet validation before the Earth follow-up. The latest
Sites Earth source was subsequently recovered and integrated under
[RFC 0009](rfcs/0009-sites-earth-v7.md). The counts and artifact identity below
remain evidence for the earlier seven-planet build, not the combined Earth build.

## Outcome and scope

This local candidate continues [PR 115](https://github.com/Protonmatter/sol/pull/115)
at `07eb75583a632aa9b5d6bd45a0b63de37701c371`. The owner requested Illustrative
look as the fresh-session default on 2026-09-25, with Source-qualified retained.
The candidate implements that choice for Mercury, Venus, Mars, Jupiter, Saturn,
Uranus and Neptune. It does not recover or deliver the missing newer Earth revision,
consolidate the Sun stack, or change publication policy.

Changes are uncommitted. The PR is still draft and the rollout is not merged or
deployed. RFC 0007 remains Draft pending the remaining appearance/release review.
Approval of the default choice is not acceptance of unmeasured device behavior.

## Corrected issues

- P1, `apps/web/js/orrery.js`, renderer state: the hosted typecheck rejected writes
  to undeclared `illustrativeDemandBodies` and `illustrativeVisibleFocused` fields.
  Explicit typed empty-array initialization resolves the four TS2339 errors.
  The same typecheck failed locally before the change and passes afterward.
- P2, `apps/web/js/bodyData.js`, `BODY.Neptune.blurb`: an unconditional Hubble
  attribution contradicted the selected artistic map. The source-specific sentence
  was removed; existing mode-aware appearance text supplies the actual attribution.
- Requested behavior: the renderer state and native selector both default to
  Illustrative look. The overview discloses artistic color/coverage before selection
  and identifies the texture-off state. Source-qualified remains available.

The new fresh-session regression failed against the old default, then passed with
all seven maps drawn without selecting an appearance mode. It also verifies the
two-map demand limit and restoration without changing body positions or time.
The new overview regression failed before its disclosure implementation and passes
for artistic, source-qualified and texture-off states.

Existing scientific-material unit fixtures explicitly retain Source-qualified.
The fresh-session test bypasses that fixture. The browser suite checks the real
default and selector together before explicitly selecting Source-qualified for
its existing reference-image, terrain and shadow baselines. No coverage floor or
existing rendering assertion was removed.

## Final local validation

- `npm test`: 1,324 passed, zero failures.
- `python tools/typecheck_web.py`: 114 files pass with TypeScript 5.9.3.
- `node --check` on the changed renderer/card/catalogue code and browser validator:
  pass.
- `python tools/validate_sdlc.py`, `python tools/validate_docs.py`,
  `python tools/validate_ux_contract.py`, `python tools/validate_web_static.py`:
  pass.
- `python tools/validate_body_constants.py`: pass; constants, rotation coherence
  and shader hygiene remain consistent with pinned sources.
- `python tools/build_wasm.py --locked --out-root build/wasm-planets`:
  both Rust WASM engines build successfully.
- Staged web build and release-manifest validation: pass.
- `node tools/collect_node_coverage.mjs` and `node tools/merge_web_coverage.mjs`,
  using the final staged build and its native browser coverage: 97.31% combined
  web line coverage; the existing 90% floor passes.
- `CHROME_BIN` set to the installed Chrome executable, then
  `node tools/browser_validation.mjs --web-root=build/site-planets-delivery --output-dir=build/planet-evidence/browser-delivery-native --backend=native`:
  pass, including fresh default, Sun/Sky/System, Earth color, orbit round trip,
  submitted rotation, Io transit/control and eclipse/control assertions.
- `git diff --check`: pass.

The native application context reports Qualcomm Adreno X1-85 through ANGLE
Direct3D 11. Browser-only execution coverage is 85.42% lines, 74.01% branches and
81.12% functions. Combined Node/browser line coverage is 97.31% and passes its
90% floor. Hosted CI has not run for this uncommitted tree.
This Windows run used Node 24.18.0, Python 3.14.3 and Rust 1.96.0; hosted
CI uses its own configured Node/Python environments.

An intermediate browser run completed the visual assertions but failed coverage
source-identity checking because source was edited while it ran. The final run
above used frozen source and passed. Intermediate artifacts are not release evidence.

## Visual evidence and artifact identity

The final staged release is `local-planets-20260925-6`. Its manifest SHA-256 is
`97302343c6d5bdd925bdb54d46c2d1fc152c7b6e16be6d15cda3197a0aa93b43`.
Its source SHA identifies PR lineage only; an uncommitted working tree is not an
exact commit attestation.

The local review file is
`build/planet-evidence/sol-seven-planets-approved-default-20260925.html`.
It contains the untouched fresh-session overview and fourteen actual SOL frames:
Source-qualified and Illustrative look for each of the seven planets. Each pair
uses the same camera and 2026-07-08 12:00 UTC with motion paused. Camera values,
readiness, demand, terrain state and WebGL error readbacks accompany the images.
All seven illustrative maps reported ready; sampled WebGL errors were zero.
Mars measured relief was enabled in the source comparison and suspended for the
artistic map. Screenshots were not retouched. Binary review evidence stays outside Git.

The current live site's manifest was read directly during this review and reports
source `88bfb852a9b19a101a59c5053c53bccf60c1aea1`, release
`ci-88bfb852a9b19a101a59c5053c53bccf60c1aea1-35815027677-1`.
It does not contain this candidate. This is manifest readback, not a full served-byte audit.

## Remaining delivery steps and rollback

The owner still needs to accept the demonstrated appearance. Commit/push require
the owner's explicit instruction. After updating the canonical PR, inspect fresh
required CI and review state, then obtain explicit merge authorization. Promotion
must use the repository's existing release policy and verify the deployed manifest
and served bytes afterward.

Physical mobile performance, Safari, mobile GPU behavior, manual accessibility,
and the complete release qualification packet are not established
by this desktop run. Rust/Python full suites were not rerun because this follow-up
changes browser behavior, fixtures and documentation, not those implementations.

For immediate visual rollback, select Solar System > View > Planet appearance >
Source-qualified. Turning Texture layers off remains supported. No user-data
migration or persistent appearance preference was added. Reverting the eventual
follow-up commit restores the prior default while retaining PR 115's asset work.
