# Contributing to Sol

Thank you for improving Sol. Read `docs/SDLC.md`, `docs/SPEC.md`, and
`docs/REQUIREMENTS.md` before changing behavior. The product is research and learning
software, not an operational warning or mission-safety system.

## Start with the contract

1. Describe the user or system problem and non-goals.
2. Link affected `SOL-*` IDs from `docs/requirements.json`.
3. For material design, contract, privacy, UX-workflow, or release-policy changes, write an
   RFC from `docs/rfcs/0000-template.md`.
4. Add an ADR when the accepted decision changes a durable architecture boundary.
5. Define observable acceptance criteria before implementation.

Small fixes may use an existing specification and requirement. They still need a regression
test that fails without the fix.

## Development setup

Required for the full local suite:

- Python 3.12 or compatible Python 3;
- Node 22 and `npm ci --ignore-scripts`;
- Rust 1.96 with `wasm32-unknown-unknown`;
- a Chromium-compatible browser for full browser validation.

Run the app and build the WASM engines using `docs/INSTRUCTIONS.md`.

## Before opening a pull request

Run the fast repository contract:

```bash
python tools/validate_sdlc.py
python tools/validate_docs.py
python tools/validate_ux_contract.py
PYTHONPATH=tools python -m unittest discover -s tests/python -p 'test_*.py' -v
npm test
python tools/typecheck_web.py
python tools/validate_web_static.py
python tools/build_web.py
git diff --check
```

When Rust and Chromium are available, also run:

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --workspace --locked
python tools/build_wasm.py
python tools/browser_smoke.py
node tools/browser_validation.mjs
```

Run change-specific generators and validators listed in `docs/VALIDATION_PLAN.md`. If a
local toolchain is unavailable, say exactly which checks remain for CI.

## Pull request evidence

Complete every applicable section of `.github/PULL_REQUEST_TEMPLATE.md`. Keep the change
focused and include:

- requirement, RFC, ADR, and specification links;
- before/after behavior and failure modes;
- test and coverage evidence;
- UX/accessibility, scientific-accuracy, privacy, security, and data-provenance impact;
- migration, release risk, monitoring, and rollback;
- documentation updated in the same change.

Do not merge with unresolved review findings or failing required checks. Do not use a commit
message skip marker to bypass validation.

## Code and data conventions

- Keep browser production code dependency-free native ES modules unless an ADR changes it.
- Use DOM APIs and `textContent`; never inject untrusted data with `innerHTML`.
- Preserve versioned snapshot boundaries and fail closed on incompatible contracts.
- Keep normalized and calibrated units distinct.
- Retain source, time, freshness, and quality for observed data.
- Make generated artifacts deterministic and commit source attribution.
- Pin CI actions by commit SHA and use lockfiles for package managers.
- Run `python tools/build_web.py` after editing stamped web files.

## Reporting vulnerabilities

Use GitHub private vulnerability reporting when the repository has enabled it. If that
interface is unavailable, ask a maintainer for a private reporting route without disclosing
the vulnerability in a public issue. Do not include secrets, personal data, or more exploit
detail than maintainers need to reproduce the problem. Supported-version and response-time
commitments require maintainer approval and are not inferred by this document.
