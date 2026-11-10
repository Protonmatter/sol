# Paired scattering preparation candidate

This local candidate separates the original scattering numerator and the
normalization/residual tail into two programs. It does not change quadrature
nodes, coefficients, optical profile inputs, atlas dimensions or admitted ray
domains. The complete generic generator remains exported as a numerical oracle
and compatible source entry. Application/source adoption, release qualification
and deployment are separate; the implementation alone establishes none of them.

## Program and target ownership

`PHYSICAL_PROGRAM_ROLES` lists surface, shell, numerator and resolve. Each body's
four requests share one `performance.now()` demand origin through the optional
`startedAt` argument to the program owner. New expired work is refused before
allocation; both parallel and synchronous completion paths check the deadline
before reporting readiness. The existing 30,000 ms cap and visibility-resume
policy remain. The per-owner program bound becomes 15: six base programs, the
Earth Look program and four programs for each of Earth/Mars. The manager limit
of 16 and context ledger limit of 32 remain unchanged.

The target owner retains its original single-program API when no numerator is
specified. A paired owner requires a distinct ready numerator program and its
uniform locations, plus the resolve's numerator sampler. Both source-owner
identities, generation and current frame are checked around every stage. The
same current physical profile, camera, Sun, grid, column identity and texture
objects must match at consumption; the packed optical companion cannot be
substituted after submission.

Each paired group owns final surface/limb and matching numerator surface/limb
RGBA32F textures. The numerical envelope remains 65,536 evaluations and 1 MiB
of final atlas payload. Scratch adds at most 1 MiB, so the total owned payload
is bounded at 2 MiB per target, with at most two resident targets. Driver
overhead and separately owned optical companions are outside this payload bound.
Status reports the complete owned payload. There is no intermediate downsampling.

The caller supplies complete restore state for texture/sampler units 6–10 in
paired mode; legacy mode retains units 7–10. Both framebuffer bindings, viewport,
program, VAO, color/depth masks, enable states, bindings and active selector are
restored without frame-time state queries. No output becomes submitted until all
four ordered draws and restoration succeed. Cancellation, source replacement,
context loss, GL errors and stale frames invalidate admission. Submission does
not establish GPU completion or content correctness.

## Independent producer evidence

The producer observer recognizes actual linked numerator and resolve sources.
Each resolve must consume a matching current numerator draw with the same pass,
frame, grid, optical uniforms, column upload and packed optical texture revision.
The final consumer must bind the matching final pair. Relinks, held/cleared
numerators, mismatched samplers and mutated optical inputs reject evidence.
Later scratch reuse does not rewrite an already completed final atlas, so its
captured dependency remains valid while final sources and inputs remain current.

The validation hold supports `all`, `numerator` and `resolve`; default behavior
holds all live stages. It leaves the unused legacy oracle and unrelated draws
alone. This is qualification instrumentation, not runtime telemetry.

The numerical validator's profiled mode selects the actual live pair when the
tested snapshot supplies one; older snapshots retain their complete generator.
Generic mode retains the complete oracle. Generator mode, submitted draws and
owned payload are reported. Height-control metadata distinguishes declared,
selected and returned judgments; an incomplete case cannot claim returned
negative-control coverage.

## Validation and limits

Run the existing Node suite, web type check, static/module graph and artifact
validators before native browser work. Then run the complete numerical matrix
with terrain/explicit-height cases, full browser/context-recovery tests and the
original physical/terrain/HDR and memory gates against one pinned candidate.
Approved Illustrative Earth and Sun appearances must remain intact.

The optional Mars memory follow-up preserves the close camera view already
qualified by the mandatory level-4 animation gate. It refuses an unrelated
anchor before changing features. Reselecting Mars would refit its entire
satellite system; taking a fixed fraction of that distance does not reliably
request level-4 terrain. Earth preparation retains its prior selection behavior.
Active and restored memory checkpoints still require fresh actual terrain,
physical producer and final HDR draw evidence under the original limits.

The earlier isolated compiler pair and two-stage numerical prototype retain
their own identities. Their successful observations do not qualify this owner
integration. Full-scene rendered parity, current-source native program readiness,
physical-display acceptance and all-mode 200 ms response/p95 remain separate
requirements. No threshold, node count, source accuracy claim or required backend
is waived by this change. The agreed orbital window remains 1900–2200, with
outside years 1–9999 approximate; this renderer change does not requalify orbits.

MAIN is unchanged while this candidate is being evaluated. Adoption requires an
exact path/hash allowlist, backups and a conflict-aware rollback packet; this
document grants no commit, push, release or deployment authority.
