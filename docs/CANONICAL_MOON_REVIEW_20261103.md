# Independent moon-generation evidence review — 2026-11-03

Result: **no actionable findings in the passing execution chain**. An independent
read-only reviewer inspected the original reports, exact launchers, current input
bytes and local OCI archive before canonical metadata promotion. The reviewer
did not separately execute the VM or claim hosted CI success.

Requirements: `SOL-SCI-001`, `SOL-TEST-001`, `SOL-REL-001`.

The durable evidence is the hash inventory and raw files under
[`tests/fixtures/canonical-moon-20261103`](../tests/fixtures/canonical-moon-20261103/manifest.json).
The candidate reports retain their original pending status and
`qualification_granted: false`; review does not rewrite those historical facts.

## Checks independently completed

- All ten input SHA-256 identities match both reports and native metadata,
  including the exact preserved pending manifest. Before/after maps are equal.
- Both generated maps equal each other, the reviewed output pins and the actual
  authoritative files. Neither generated file was replaced.
- Both reports identify Linux x86_64 CPython 3.12.12 and the existing exact image
  digest. Both comparisons and numerical validators return success; stderr is empty.
- The full numerical logs report 21 moons and 11,985 held-out checks, maximum
  angular error 0.1384 degrees and radial error 0.1893%. Source comparison confirms
  the validator changed only to accept an optional argument list; its numerical
  calculations and limits were preserved.
- Local OCI archive SHA-256
  `a6b7a59930e3ebb097ea3306907265c2563ed74ff68ed42ccb8888e916492b62`
  matches the VM acquisition record. The embedded manifest hashes to the pinned
  digest, all five configuration/layer blobs match their sizes and SHA-256 values,
  and the image configuration declares Linux/amd64.
- The actual resume launcher, log, load log and digest-registration log match
  their VM hashes. That launcher verifies the archive and blobs, loads the image,
  registers the exact digest, verifies the original launcher and ten inputs, then
  executes its unchanged image-inspection and two-container comparison suffix.
- Each comparison starts a separate fresh container with read-only root/inputs,
  no container network, bounded resources, dropped capabilities and no new privileges.
  The original launcher embeds the current collector's exact bytes.
- The existing canonical admission function accepts the observed runtime/digest
  when supplied the two reviewed runs and an evidence reference. Nine focused
  admission tests passed at this review checkpoint; those mocked tests were not
  counted as native numerical evidence.

The raw report SHA-256 values are
`52b6f06fd685f62a7df432aecc13522b22167a428fc28e59cb7b96a3f29611cd`
and `127b885984893f3f011be9897ae87371c00629491638d8fb07bd4b77081c7d4f`.
The executed resume launcher SHA-256 is
`6e09a39655a5baea42b4569a9cc89d8ba9e7e3008f9a7e9617f92dea54064145`.

## Review scope and decision

The retained passing chain satisfies the existing two-run, exact-image,
source/output and numerical conditions in [canonical generation](CANONICAL_GENERATION.md).
It supports recording `identical_runs: 2` and referencing the reviewed evidence
while changing only canonical qualification metadata. It does not qualify the
whole application, continuous or event accuracy, other runtimes, hosted CI or release.

Five historical failed-attempt logs listed in the complete VM bundle were not
copied into this fixture. Their absence does not affect the complete passing
chain. No claim is made that every file in that larger VM bundle was verified
locally. No tag substitution, threshold change, automatic qualification or
credential persistence was found in the passing chain.

## Final patch follow-up

The reviewer subsequently checked the promoted metadata, strict post-promotion
reports and launcher, durable inventories, CI admission and release inventory,
tests and current docs. Both additional strict reports bind all ten current
inputs and the final manifest while passing the unchanged full numerical check.
The actual CI admission program rejects pending, failed and non-boolean success
values. Both image children remain required after moving the duplicate host
regeneration out of the web job.

One P2 integration defect was found and corrected: automatic Windows CRLF
checkout conversion could alter the hash-bound log fixtures. The new raw-tree
`.gitattributes` rule sets `text: unset` for all 22 fixture paths. The reviewer
independently repeated the read-only `core.autocrlf=true` filter simulation and
confirmed byte preservation without changing evidence bytes.

Final review reported no remaining actionable findings. It independently passed
12 canonical-evidence tests, eight generator tests, 27 release-policy tests,
SDLC/docs checks and workflow parsing. It also verified the Rust LCOV digest,
all 34 current source hashes and the 7,971/8,362 line totals against the retained
local coverage record. Native and coverage execution remained the parent
worker's work; the reviewer did not claim another VM or coverage run.
