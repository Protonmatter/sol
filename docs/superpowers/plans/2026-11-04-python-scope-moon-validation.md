# Python scope reconciliation and moon validation

Continue the full production-readiness goal after verified fine-event reference
work. The prior turn made progress; no goal completion is claimed.

The current accepted AC-30 requires affected Python modules in the governed
coverage denominator. An actual Git/source inventory finds24 affected production
modules,16 absent from the existing26-module profile. The union is42 modules;
re-reporting the already captured current data fails the unchanged90% floor at88%.
Preserve that failing measurement; do not restore a passing result by exclusion.

The audit reproduces a P1 scientific-validator false pass: a reference x coordinate
changed toNaN is accepted by `validate_moons.main`, which still reports11985
checks. The existing successful generator process is isolated as a mocked boundary
for this numerical-intake reproduction; no production/source CSV was changed.

1. Add direct numerical-intake tests using a named subset of the actual retained
   Phobos data, with explicit adversarial mutations and isolated generator I/O.
2. Reject nonfinite/malformed reference epochs/vectors, invalid vector norms and
   invalid computed comparisons before they count as evidence. Enforce reference
   identity and distinct held-out samples. Preserve existing numerical budgets,
   valid results, public interfaces and canonical generator controls.
3. Declare the complete42-module union and inventory all remaining unchanged
   legacy exclusions explicitly. Excluded files are hash-pinned; a new or changed
   module cannot silently remain outside the denominator. Bind actual report/XML
   workflow scopes to the declaration without adding dependencies.
4. Exercise meaningful uncovered failure paths or real offline validator entry
   points, then run the full governed coverage gate. Keep90% unchanged.
5. Obtain independent read-only review; update status/report/reproduction and
   remaining qualification holds. Resume UI/browser inspection afterward.

Affected files: coverage workflow, a source-scope manifest, SDLC validator/tests,
moon validator and dedicated tests, relevant documentation. Risk is medium for
scientific validation and low for declaration/docs. No orbital/rendering algorithm,
dependency, licensing, deployment, production setting or Git history change.
No commit/push is authorized. Preserve all original fixtures and failed receipts.

## Completed scope and verification

The42-module union expanded to48 when static local runtime imports were included,
then49 when report publication moved to one shared guard. All37 unchanged legacy
exclusions are explicit and hash-pinned. Independent review closed qualified
namespace/package-import omissions and actual-workflow decoy cases. The 90% floor
and numerical limits remain unchanged.

The audit also reproduced existing-report overwrite and generator/HTTP resource
lifecycle defects. Small corrections and adversarial tests address those paths.
The [validator report](../../PYTHON_SCOPE_VALIDATORS_20261104.md) records the
changes, exact reproduction commands, retained red results and scope limits.
Full current verification passes710 repository plus39 provider tests and
90.115824% aggregate coverage across all49 modules. A fresh current-source replay
passes109,900 comparisons at3,925 model epochs with identical numerical CSV bytes.
The [canonical renewal](../../CANONICAL_MOON_REFRESH_20261104.md) completes two
pending and two strict reviewed native image runs with unchanged asset bytes.
The broader production-readiness goal and UI/platform/scientific holds remain open.
