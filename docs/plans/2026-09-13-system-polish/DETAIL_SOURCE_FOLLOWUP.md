# Object detail source disclosure review follow-up

Date: 2026-09-13. Scope: PR 107 review comment 3999301430.

## Reproduced problem

The renderer admitted `mars-mission-reference` and the registered lunar maps,
but the Object details disclosure read only the legacy browse asset collection.
A ready Mars map therefore appeared beside a statement that its source was
unverified and detailed rendering was disabled. Opening Object details also
hid the compact overview that contained the correct mapped-reference context.

## Implemented behavior

`orreryDetail.js` now accepts presentation appearance state when creating planet
and moon cards. The disclosure identifies the mapped surface record, observation
date or date limitations, interpretation, coverage limitations, credits and
official source link. It reports whether imagery is deferred until a useful
visible scale, queued, loading, unavailable, ready or switched off. A separately retained legacy browse preview is explicitly
labelled as not used for the globe.

The existing presentation update flow refreshes the source text in place when
image readiness or user layer settings change. The native disclosure, source
links, selected card and glossary controls retain their identity and open state.
Stale selections, galaxy mode and star cards are excluded from body-source
updates. No renderer, source data or physical-state calculation moves into this
DOM presenter.

Earth's enabled night lights, selected cloud source and optional sea-ice layer
each retain their own source dates and interpretation limits. Inactive layers
are hidden. A ready auxiliary map is explicitly withheld while its required
surface map is not ready; an available file is not presented as a rendered layer.

## Verification

Three new regression tests failed against the prior presenter: mapped source
identity/date, live appearance transitions, and Earth layer selection/readiness.
The existing fourteen detail-coverage cases remained green in that red run.

Commands:

```powershell
node --experimental-vm-modules --test tests/web/detailCoverage.test.mjs
node --experimental-vm-modules --test tests/web/detailCoverage.test.mjs tests/web/orreryDetail.test.mjs
python tools/typecheck_web.py
```

An additional production-renderer integration case exercises actual image
failure, explicit off/on retry, upload completion and graphics context loss
while retaining the same open inspector. This verifies the presentation hook
independently of direct calls to the detail presenter.

The second command passed all 23 cases after implementation. The type check
passed 81 source files in the shared review working tree. Local diagnostic logs
are `coverage/pr107-detail-red.log` and `coverage/pr107-detail-green.log`.
Integrated browser and hosted validation are recorded separately by the PR
publication workflow; these unit results do not establish deployed behavior.
