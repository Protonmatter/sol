# Canonical moon generation

## Status and authority

The current authoritative `moons.js` and `moonelements.js` are preserved. Their exact
source and output SHA-256 identities, numerical generator source hashes, serialization
rules and upstream notices are bound in
[`generation-manifest.json`](../tools/ephemeris-data/generation-manifest.json).
This is a **moon-assets contract**, not the simulation's cross-OS byte-identity contract.

Canonical qualification is **pending**. The candidate is CPython 3.12.12 on Linux
x86_64 (`linux/amd64`), image `python:3.12.12-slim-bookworm`, architecture-specific digest
`sha256:2986c55feb36e6cae00fa1fefb454283e4b33f35e75ff8bdd123b134130be301`.
That digest was resolved from [official Docker Hub image metadata](https://hub.docker.com/v2/repositories/library/python/tags/3.12.12-slim-bookworm)
on 2026-09-11; it has **not** been executed here. Neither a mutable tag nor a Linux ARM
run qualifies the selected x86_64 image. The locally available WSL/Docker platform is
aarch64, and its installed Python images are ARM64. No image was pulled and no host
software or dependency was installed for this investigation.

## Operator commands and exits

No credentials, administrator permission or network access are needed for the checks.
Use the committed pristine CSV inputs; do not fetch data during reproduction.

```text
python tools/generate_moons.py --check
python tools/validate_moons.py
python -m unittest discover -s tests/python -p test_moon_generation.py -v
```

The first command checks all source/generator hashes, regenerates both outputs in memory,
and compares generated and committed UTF-8/LF bytes with the reviewed hashes. It does not
write. A successful noncanonical comparison prints a warning and is **not** canonical
qualification. The validator also runs the independent held-out-vector accuracy checks.
Its fixed limits remain 0.15 degrees angular error and 0.0025 fractional radial error,
with at least 100 checks per moon; this work did not change the model or these limits.

`generate_moons.py` exits 0 on a successful permitted operation, 1 on output byte/hash
mismatch, and 2 on invalid source/manifest or unqualified authoritative-generation
request. `validate_moons.py` exits nonzero for any regeneration or numerical failure.
Default generation without `--check` refuses unqualified runtimes before touching outputs.
`--require-canonical` also refuses a read-only check unless every qualification condition
is satisfied. Never respond to a noncanonical byte mismatch by overwriting the files.

## Recorded two-platform comparison (2026-09-11)

The exact same committed three source files were used on both platforms; their hashes
are in the manifest. The complete generator was evaluated without writing either output.

| Observation | Windows ARM64 CPython 3.14.3 | WSL Ubuntu Linux aarch64 CPython 3.14.4, glibc 2.43 |
| --- | --- | --- |
| `moons.js` SHA-256 | `0fe13220d6214d62a6b472f5cc8e2ccb2f8fbfaeb7eb1d5e611b40c272a90f51` | same |
| `moonelements.js` SHA-256 | `3353c5e2ff630c78b25c4f61a62fd5d97718d271ad051a87c2d77dc620f70f09` | `e1dfc8d737bf92c96cc132756c7e13e0c6bb9a6c49b86654996bb472112be05f` (committed) |
| Oberon knot 320 `q.hex()` | `-0x1.1f4400d2bab6bp+0` | `-0x1.1f4400d2bab6ap+0` |
| Serialized `round(q, 12)` | `-1.122131396721` | `-1.12213139672` |

The differing knot uses these exact input CSV values:

```json
{"M":215.330717637,"a":583559.370317,"argp":173.844573139,"code":"704","e":0.002339866198,"i":97.905866073,"jd":2461455.5,"n":26.730324243881,"name":"Oberon","node":167.707504141,"planet":"Uranus"}
```

The measured `q` values differ by one binary64 ULP near a decimal rounding boundary.
That establishes a runtime-dependent numerical/serialization difference, **not** its
unique cause: OS, C math library and Python version also differ. No claim of an isolated
CPython, architecture or libm defect is made. Linux ARM's successful reproduction proves
source-to-output correspondence on that observed runtime, not universal Linux identity.
Its independent 11,985 checks measured maximum angular error 0.1384 degrees (Nereid,
JD 2461053.0) and radial error 0.1893 percent (Enceladus, JD 2461674.2), across the shared
JD 2459219.0–2462859.0 validation interval.

## Complete the canonical qualification

This requires an operator-authorized Linux x86_64 environment with the exact pinned image
already available. Do not silently pull a replacement tag or count an ARM image as amd64.
Inspect the image digest/platform and observe `platform.machine()`, implementation and
Python version inside the container. Keep the checkout read-only for both comparison runs.
For example, from a Linux shell with the repository as the current directory:

```sh
docker image inspect python@sha256:2986c55feb36e6cae00fa1fefb454283e4b33f35e75ff8bdd123b134130be301
docker run --pull=never --rm --platform linux/amd64 --network none --read-only \
  --mount "type=bind,src=$PWD,dst=/work,readonly" --workdir /work \
  python@sha256:2986c55feb36e6cae00fa1fefb454283e4b33f35e75ff8bdd123b134130be301 \
  python -B tools/validate_moons.py
```

Run the complete comparison twice in separate fresh containers, preserving both logs,
observed runtime facts, input/generator/output hashes and numerical maxima. While status
is pending, diagnostic runs will say noncanonical; this is deliberate. If either run
differs, leave status pending and preserve authoritative files. Investigate the difference
before proposing new output hashes; never lower tolerances to obtain a green check.

After independent review confirms both full runs have the same reviewed output hashes
and pass the unchanged numerical bounds, record the evidence path and `identical_runs: 2`
and set `canonical.status` to `qualified`. The invoking workflow must then use the exact
digest and set `SOL_MOON_GENERATOR_IMAGE_DIGEST` to that same digest, and run:

```text
python -B tools/validate_moons.py --require-canonical
```

The environment variable is an assertion by the trusted launcher, **not** an independent
container attestation; Python cannot prove an image digest from inside a process. Workflow
image pinning and image inspection supply that part of the evidence. Do not set the variable
on an arbitrary host as a workaround. CI enforcement must not label pending qualification
as passed. The delivery workflow and its qualification evidence are owned separately.

## Updating sources or generators and rollback

Treat sources, generator source hashes, reviewed output hashes and qualification as one
reviewed change. Source bytes are immutable evidence: retain the previous version in Git
and record new upstream provenance/notices before replacing inputs. A source/model change
must reset canonical qualification to pending. The CLI intentionally refuses unreviewed
source or output hashes. Candidate output review can be performed by importing `build()`
in an isolated scratch checkout; it returns two strings without modifying authoritative
files. Compare the complete outputs, not just the known Oberon knot, and independently
run the numerical validator before accepting any new pin. No automatic manifest updater
or tolerance relaxation is provided.

After review, update the manifest and both generated modules together in the same bounded
change, then rebuild and validate the release/cache graph. A qualified default write only
allows bytes already matching the reviewed manifest. Roll back by restoring the previously
reviewed source, generator, manifest and two-output set together through normal code review;
do not restore one moon file independently or use a broad worktree reset.
