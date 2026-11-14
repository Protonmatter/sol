# Ephemeris notice decision packet — 2026-11-06

Status: historical factual packet; the owner subsequently approved the
[component-LGPL implementation](LGPL_COMPONENT_20261106.md).
At packet creation no product licensing, application, numerical input, WASM or release declaration
changed. The earlier [package/notice audit](PACKAGE_NOTICE_AUDIT_20261104.md)
remains a separate historical diagnostic. This follow-up makes the outstanding
decision concrete; it does not provide legal clearance or publication authority.

## Verified source and notice facts

The retained ephem.js inputs match revision
`2f679a1f698b4f20f9579d94da24af51559458ed`. All four input sizes/hashes and all
three shipped coefficient outputs still match the current manifest. Their
generated JavaScript headers retain Marcel Greter's 2016–2021 attribution.
The matching [upstream root license](https://raw.githubusercontent.com/THRASTRO/ephem.js/2f679a1f698b4f20f9579d94da24af51559458ed/LICENSE)
contains LGPL version 3. No supporting MIT notice was established in those inputs.

The preceding private notice proposal retained the LGPL text but omitted its
companion GPL text. LGPL v3 incorporates GPL v3; section 4(b) describes supplying
both documents for Combined Works. GNU's [license-use guidance](https://www.gnu.org/licenses/gpl-howto.html)
also explains the two-document requirement. This identifies an incomplete review
packet; it does not determine how a particular Sol artifact is legally classified.

| Retained text | Bytes | SHA-256 |
|---|---:|---|
| Original upstream LGPL v3 |7,651|`da7eabb7bafdf7d3ae5e9f223aa5bdc1eece45ac569dc21b3b037520b4464768`|
| GPL v3 companion, captured from GNU |35,149|`3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`|

The new GPL acquisition records HTTP 200 from
`https://www.gnu.org/licenses/gpl-3.0.txt`, exact response bytes, a complete-text
marker and its digest. Neither text is rewritten. The proposed coefficient
manifest is likewise an exact copy of the current pinned manifest.

The exact pinned upstream README is also retained and checked against the
GitHub contents API's decoded bytes, size and Git blob identity:

- 14,812 bytes; SHA-256
  `11b355131b8375091e5df2621e6fb3b13f762d32daa5c755e26e5d5a776babec`.
- Git blob `379946d4feca1758b09991bbe68b356ad08f43d6`.

Its Bureau des Longitudes / IMCCE references are attribution leads, not a separate
permission grant. Complete underlying-theory attributions and rights remain review
items. The Rust lunar and outer-planet evaluator comments identify faithful ports;
the lunar extraction initializer also identifies copied initialization logic.
Consequently, a notice review cannot assume this is solely a numerical-data case.
These are source/header observations, not an independent legal derivation finding.

## Concrete proposal and authority boundary

The ignored local packet is under `build/notice-review-20261106-01/proposal/`:

- both complete verbatim license texts;
- exact `COEFFICIENT-SOURCES.json`;
- factual `NOTICE-EPHEMERIS.md` draft;
- `PROPOSED_CHANGESET.md` with exact proposed file targets and alternatives.

Path A, subject to the owner's decision and applicable-rights review, scopes an
LGPL ephemeris component separately from the application's original MIT/Apache
terms. It proposes a component-specific Cargo declaration, both license texts,
source/copyright notices, coefficient identities, actual crate/web inclusion and
Sources links. The precise version grant is still conditional; a root v3 text by
itself does not establish an "or later" permission.

That path also needs an accepted recipient source/build/recombination delivery
plan. Existing offline rebuild tools and the separate WASM ABI inform that plan;
the two notice texts alone do not establish compliance. Clean-source packaging,
registry correspondence and publication authority remain separate requirements.

Path B retains a permissive-only policy: establish separate permission or replace
the affected sources/ports and repeat the corresponding numerical/integration
qualification. Neither permission nor replacement is established by this packet.
No upstream contact was made.

The supplied AGENTS.md explicitly forbids licensing changes without instruction.
At packet creation the owner policy question was pending; neither elapsed time
nor the default option was treated as approval. The owner subsequently approved
the component-LGPL proposal. The [implementation follow-up](LGPL_COMPONENT_20261106.md)
records that separate current state; the packet and diagnostic identities below
remain historical evidence for their original, unchanged declarations.

## Fresh diagnostic package and verification

The current checkout packages and compiles offline with the selected Rust/Cargo
1.96.0 toolchain:

```text
cargo package --locked --offline --allow-dirty -p solar-ephemeris --target-dir build/notice-review-20261106-01/package-target
```

The new archive contains **40 files**, totals **1,314,032 compressed bytes**, and
has SHA-256
`f0d3ec9f9f7e70082bd5c7b7d5018062ed4c7c618e985695a7d20edad6e9c4e1`.
It differs from the earlier 37-file diagnostic; neither archive is silently
substituted for the other. Its actual generated metadata still declares
`MIT OR Apache-2.0`, its VCS metadata is dirty, and its only notice files are
`LICENSE-MIT` and `LICENSE-APACHE`. All three archived coefficient blobs match
the shipped pinned outputs. Cargo's extracted-package compile exits zero.

The private offline `verify-v3.py` and `verification-v3.json` check seventeen
frozen repository inputs, four upstream inputs, three shipped blobs, both
verbatim texts, pinned README correspondence and the actual bounded archive
inventory. Earlier verifier/result versions remain preserved. Its receipt
explicitly records proposal-only status, pending policy, no applicability/legal
clearance, and held publication. A successful diagnostic compile does not clear
those conditions.

## Limits and rollback

This follow-up does not determine copyright ownership, license applicability,
version grants, complete attribution, source-delivery compliance or legal
sufficiency. It does not change application appearance, scientific calculations,
coefficient tables, accuracy budgets or current production artifacts. No new
numerical comparison, browser run or full Rust test suite is claimed here.

Rollback is withdrawing this new proposal/report selection. Preserve the original
inputs, previous notice draft, archives, verifier versions and acquisition receipts.
No dependency, product network call, licensing declaration, Git commit, push,
upstream message or deployment change occurs.
