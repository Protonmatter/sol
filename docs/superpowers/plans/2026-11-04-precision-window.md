# Qualify the approved 1900–2200 precision window

The owner explicitly chose the 1900–2200 precision target with years 1–9999
retained as approximate exploration. Preserve the broader production-readiness
goal, all existing numerical budgets and the supported calendar.

- [x] Record the approved scope, exact inclusive-year/exclusive-time boundary
  and distinctions between model accuracy and Earth-orientation quality.
- [x] Add exact date-policy boundary tests and show the target/approximate
  distinction in Sky/System without promoting pending accuracy evidence.
- [x] Freeze and acquire the dense/irregular independent reference matrix.
- [x] Observe the actual model efficiently at every reference epoch, with
  serialized-producer parity checks and no duplicate numerical implementation.
- [x] Run all fixed-budget comparisons, diagnose/fix failures and preserve
  complete source-bound reports.
- [x] Independently review numerical, evidence-admission and date-policy work.
- [ ] Verify the rebuilt application, workers, current rendering, performance
  and failure paths before accepting a qualification or release claim.

Current completed verification includes exact current native/public-API parity,
34 real staged worker snapshots/576 references,22 responsive/date-policy cases,
20 native GPU integration checks with context restoration/animated physical
terrain,205 Rust/601 Python/39 provider/1,423 Node tests,20 precision controls,
strict Clippy/rustfmt and124-file JSDoc typechecking. Current coverage gates
pass95.634646% Rust,97.54% whole-web and90.604381% governed Python. The full
precision replay is now blocking in the existing required web CI job; its
configuration/failure propagation were independently reviewed. Hosted execution,
complete platform/scientific/protected qualification and release acceptance
remain distinct; the final checkbox is deliberately still open.

Initial UI files: `apps/web/js/accuracy.js`, `sky.js`, `orrery.js` and existing
accuracy tests. Risk: medium for quality classification/retained-state labels;
no projection formula or computation-limit changes are required for that step.
Use focused/full Node tests, static checks and a staged browser with exact
boundary/approximate dates. Reference acquisition and numerical observation
receive their own fixed plans and source identities before execution.
