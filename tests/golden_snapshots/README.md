# Golden snapshots

The determinism invariant is now **enforced in CI**, not aspirational:

- `.github/workflows/ci.yml` "Determinism gate" regenerates the fixture-mode outputs twice
  (byte-identical) and diffs `tests/fixtures/live-swpc-normalized.json` against the
  committed copy — same seed/config ⇒ same bytes, on every platform (`.gitattributes`
  pins LF; the generator embeds POSIX paths and newline-normalized byte counts).
- `crates/solar-core` unit tests pin the model invariants directly: same-seed birth
  reproducibility, inject-once flux conservation, region-lifetime retirement, and
  hemisphere-coherent (Hale) polarity.

Add serialized engine-run goldens here if/when a CPU-vs-GPU kernel comparison lands
(the "kernels stay within tolerance" invariant still has no second implementation to
compare against).
