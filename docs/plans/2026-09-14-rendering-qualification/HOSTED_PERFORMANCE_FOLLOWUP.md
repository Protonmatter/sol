# Hosted default-path performance follow-up

Status: performance P1 open. The finite current-host passes in the
[final application record](RUNTIME_FINAL_QUALIFICATION.md) remain valid for their
recorded configurations; they do not qualify the failing hosted backend.

## Published source and retained failures

PR head `89e1e28b226fa7346eaa53ecfa0d404dcbc37124` was tested through GitHub's
merge commit `a9dfadc36fd0afa14f494b1be5e4028fab072df9`, whose other parent is
master `841ba94eabe588f745625a995d20bf6c79ac97f3`. The complete production tree,
browser validator, Earth probe, release builder and coverage workflow are identical
between the head and merge commit. The merge provenance is not a rendering change.

Both [Coverage](https://github.com/Protonmatter/sol/actions/runs/34833369781) and
[CI's coverage job](https://github.com/Protonmatter/sol/actions/runs/34833369932)
fail the original Earth submission gate with one accepted final draw instead of
the required three in five seconds. The dependent Release gate also fails.
[Raw artifact identities and compact observations](HOSTED_PERFORMANCE_FAILURE.json)
retain each failed result, file hashes, launch source, backend and timing.

The observed backend is Chrome 152.0.7977.82, ANGLE Vulkan SwiftShader Subzero,
with a 732 by 612 antialiased default framebuffer. Earth optics and every program
are ready; animation, context and page visibility are healthy. HDR is disabled.
Each run records three complete frames, approximately 3.25 seconds apart, with
108 submitted indexed draws and 60 array draws. The probe correctly rejects the
later draws after its five-second deadline; no GPU mismatch, late readback,
physical rejection or frozen epoch explains the failure. A delayed JavaScript
timer does not extend the admission window.

## Diagnostic boundary

The passing local captures used Chrome 151.0.7922.174 and SwiftShader LLVM 10.0.0
or native Adreno. Local and hosted validator/probe sources are semantically
identical; both run precise page and worker coverage. Their configurations,
browser backends and host resources must still be qualified separately.

A matched local default-SDR replay also passes the original application gate:
four final Earth draws in 1,494.8 ms and four additional physically verified draws
in 1,411.1 ms. This isolates SDR as insufficient by itself to explain the hosted
slowdown. The replay is an additional finite observation; it does not override
either hosted failure or establish stable performance distributions.

An exact Chrome 152.0.7977.82 local replay observes Subzero and accepts four
original draws in 3,865.8 ms, but fails the additional preparation budget. The
additional observer begins at 136,775.8 ms against the original absolute deadline
of 108,954.8 ms and immediately rejects it without inspecting a physical draw.
This is late proof preparation, not an observed physical compilation failure.
The downloaded test browser is AMD64 on ARM64 Windows; architecture/emulation and
host resources prevent treating its timing as hosted throughput parity.

The [backend comparison](BACKEND_RENDERING_COMPARISON.json) records these runs,
source/tool reconciliation, PE architectures and original evidence identities.
Its immutable local capture SHA-256 is
`fb6b20c53549a3d6da80b0e8bb32120bf47be2d9a9d7278e1fa44ad3da63d173`;
the published copy is canonical UTF-8 JSON, SHA-256
`afd73eaf507ccb3224f3aa82c501ba8e30322920f7405ae1f402b55c5ffc1bcb`,
with identical parsed values. No local
attempt was overwritten or promoted from failed to passed.

Next diagnosis separates producer work, surface/shell rendering, composition and
synchronous API costs on the actual failing backend. Any failure-only replay is
separate from acceptance: preserve the original exception, exit status, numerical
references, texture/terrain detail and all existing deadlines. No per-pass cost
attribution or renderer correction is claimed until measured.
