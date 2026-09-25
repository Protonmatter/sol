# Publication and recovery rules

Before implementation that must be published, establish a supported authenticated
publication path and an approved persistent recovery destination. Do not discover
at the end that source exists only in an ephemeral workspace.

Use `tools/publish_pr_candidate.py` (`inspect`, `prepare`, `execute`, `resume`) and
`docs/PR_PUBLICATION.md`. A connected-app runtime may use a capability-equivalent
bridge, but must retain the exact source packet and immutable operation checkpoints
outside the session before remote writes. Retain storage IDs, checksums and
readback evidence, not just local filenames or chat claims.

Publish a reviewed, frozen commit. Never substitute a newly reconstructed asset for
an approved missing one, alter a checksum to pass a gate, or copy an old test count
as evidence of a new candidate. Preserve the approved scope and existing policies.

A blob or tree upload is not PR publication. Require remote branch/PR readback
matching the intended commit, including tree and parent identity. Report source
publication, CI observation, CI passing, merge and deployment separately. Uncertain
writes must be reconciled before retry; do not repeatedly create commits or PRs.

Use native Git with an explicit expected-head lease and ancestry validation, or
GraphQL `updateRefs` with `beforeOid` and `force: false`. REST `force: false` alone
is not CAS. A bridge lacking the expected-head primitive may create an authorized
absent branch but must not update an existing branch or delete/recreate it.

Do not push the default branch, force history rewrites, weaken branch protection,
activate the separately controlled daily-feed adapter, merge, or deploy without
separate explicit authorization. Do not put credentials or raw provider errors in
packets, source, comments or receipts.

Run the new publication tests and applicable full repository validation. Preserve
unavailable checks and failures by name; source publication is not proof of green
CI. Retain recovery packets and receipts through review and handoff.
