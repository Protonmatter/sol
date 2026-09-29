# Build Notes

Generated: 2026-06-28

## What was validated in this environment

- Python prototype executed successfully in the original v0.1.1 package.
- `synthetic_solar_maximum.ppm` / `.png` generated successfully in the original v0.1.1
  package. (These prototype outputs are no longer committed — a 3 MB uncompressed PPM at
  the repo root; regenerate with the `prototype_solar_maximum.py` command below.)

## What was not validated here

- Rust `cargo test` could not be executed in the original package because `cargo` was not installed in that runtime environment.

## Expected local validation

On a local machine with Rust installed:

```bash
cargo test --workspace
cargo run -p solar-cli -- simulate --steps 48 --dt-hours 1 --seed 42 --out apps/web/data/latest-state.json
cargo run -p solar-cli -- ingest swpc --cache .cache/solar-data --out tests/fixtures/live-swpc-normalized.json --fallback-fixtures tests/swpc_scn26_21
cargo run -p solar-cli -- replay --snapshot apps/web/data/latest-state.json --out apps/web/data
```

On any system with Python 3:

```bash
python3 python/prototype_solar_maximum.py --out synthetic_solar_maximum.ppm --seed 42 --spots 36
python3 tools/generate_fixture_snapshot.py --out apps/web/data/latest-state.json --observations-out tests/fixtures/live-swpc-normalized.json --seed 42
python3 tools/validate_snapshot.py apps/web/data/latest-state.json
python3 tools/validate_notebook.py notebooks/solar-maximum-lab.ipynb
```

## v0.1.1 patch

Patched after reviewing NWS Service Change Notice 26-21:

- Added `docs/SWPC_SCHEMA_CHANGE_2026_03_31.md`.
- Updated `docs/DATA_SOURCES.md` and `docs/ROADMAP.md`.
- Replaced the placeholder `solar-ingest` source file with SWPC schema-era constants, deprecated RTSW endpoint mappings, numeric normalization helpers, and field mapping helpers.
- Cargo was still unavailable in that runtime, so Rust compilation and tests were not executed there.

## v0.1.2 app build

- Added a dependency-free static web app under `apps/web`.
- Added `solar-state-snapshot.v1`, `observation-frame.v1`, and `model-run-manifest.v1` contract emitters.
- Added deterministic fixture generation and validation tools.
- Added tutorial and experiment notebooks that read the checked-in web fixture.
- Added public-data cache tooling for bounded live context; deterministic fixtures remain the default validation path.

## v0.1.3 readiness and UX hardening

- Added first-screen snapshot summarization, data-state badges, visible layer labels, and readiness status to the static web app.
- Added active-region selection from both the solar disk and butterfly diagram.
- Added `operational-readiness.v1` metadata to deterministic Python fixtures and Rust snapshot output.
- Added `tools/validate_operational_readiness.py` and `tools/validate_web_static.py`.
- Updated `docs/OPERATIONS.md`, `docs/SPEC.md`, `docs/OPERATIONAL_READINESS.md`, and `README.md` to separate research/learning operation from blocked space-weather operational use.

## v0.1.4 daily research ingest

- Expanded `tools/fetch_public_data.py` into a bounded public-source registry with daily archive support and source-health manifest output.
- Added `tools/run_daily_ingest.py` to fetch public data, regenerate `apps/web/data/latest-state.json`, validate readiness, and write `apps/web/data/feed-status.json`.
- Added `tools/install_daily_ingest_task.ps1` for optional per-user Windows daily scheduling.
- Extended cached snapshots with `observed-context.v1` so SWPC solar regions, sunspot rows, GOES flare rows, and cycle indices can tune the research fixture while preserving provenance and normalized-unit caveats.
- Updated the web UI to show daily feed status separately from snapshot readiness.

## Registry history and current package qualification

Reviewed: 2026-09-28. The historical registry publications remain valid:
[0.1.1](https://docs.rs/solar-ephemeris/0.1.1/solar_ephemeris/) was first published
on 2026-07-20, followed by
[0.2.0](https://docs.rs/solar-ephemeris/0.2.0/solar_ephemeris/) that day with the
108-star bright-star catalogue. The
[crates.io API record](https://crates.io/api/v1/crates/solar-ephemeris) confirms
both versions exist and are not yanked as of this review. The crates.io browser
pages returned HTTP 404 during the review; that does not establish registry absence.
The links above open the versioned API documentation. Published versions and the
current checkout's v3 contract are separate artifacts.

The current [package workflow](.github/workflows/publish-crate.yml) runs only on
**workflow_dispatch**, with a required exact 40-character `source_sha`. Its retained
name is "Publish solar-ephemeris to crates.io", but its implemented action is
**package qualification with publication held**. There is no weekly schedule,
registry credential input or registry publication step. A version bump does not
authorize publication.

### Qualify an exact source candidate

Use a clean checkout of the reviewed commit. The local package checks are:

```bash
cargo test -p solar-ephemeris --locked
cargo package --list -p solar-ephemeris --locked
cargo publish --dry-run -p solar-ephemeris --locked
```

The dry run can access the registry index; it does not upload the crate. Retain its
log and the resulting `.crate` bytes for package-content and notice review. For a
separately authorized hosted qualification, supply the reviewed commit explicitly:

```bash
gh workflow run publish-crate.yml --repo Protonmatter/sol -f source_sha=REVIEWED_40_CHARACTER_COMMIT_SHA
```

The workflow checks out that SHA, tests/packages it, records exact-source package
evidence with `tools/release_crate.py`, and uploads
`qualified-crate-candidate-RUN_ID-RUN_ATTEMPT` with 90-day retention. After successful
qualification/upload, its final hold step deliberately exits **1** to make the
publication boundary visible. Earlier failures may prevent candidate creation;
inspect the exact run's steps and artifacts before claiming qualification.

Actual publication remains held pending exact-source CI, accepted package
digest/contents/notices and separately protected registry authority. Do not add a
registry secret to bypass this hold. Any future publication path also needs
post-publication checksum verification, because publishing can repackage source.
See [release delivery](docs/RELEASE_DELIVERY.md) for the governing evidence boundaries.
