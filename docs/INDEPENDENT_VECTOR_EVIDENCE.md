# Typed independent native vector evidence

The stage-5 registry contains 160 actual native f64 System ABI comparisons with the retained NASA/JPL Horizons DE441 pack: 16 exact model epochs for ten target/origin cases. At generation on 2026-11-11, 141 samples pass the unchanged inclusive 10.0 arcsecond-equivalent relative-vector budget and 19 fail. The worst is geocentric Moon at JD/TDB 5373119.5: 2106.1849121265564 arcseconds-equivalent. Every native TT argument mismatch is zero in this run. Failed rows are retained and never selected as passing evidence.

The [earlier full-calendar investigation](GEOMETRIC_VECTORS_20261104.md) already documented the same approximately 2106.184912 geocentric-Moon worst case. These remote-epoch failures do not contradict the separate 1900–2200 dense-sample report's 1.5650 maximum: the matrices and date domains differ. No acceptance budget or model coefficient was changed to create this registry.

[Public explanation](../apps/web/accuracy/index.html), [full registry](../apps/web/data/independent-vector-evidence.json), and [strict schema](independent-vector-evidence-v1.schema.json) retain the distinction between geometric vector residual, angular separation and signed radial residual. Geometric ecliptic-J2000 positions have explicit target IDs, returned aliases and origin IDs. Several targets are system barycentres. Reference dates are TDB; the native probe numerically matches TT to the reference TDB date, retaining an approximately 2-ms time-scale approximation and no independent civil-time qualification.

The eight existing TOP2013 parity rows are unchanged. They continue to describe source-theory parity, never independent accuracy.

## Reproduction and integrity

Run from the source tree with the locked Rust toolchain/dependencies already available:

```sh
python tools/validate_independent_vector_evidence.py
python tools/validate_independent_vector_evidence.py --replay
python tools/validate_independent_vector_evidence.py --replay --require-all-pass
python tools/generate_independent_vector_evidence.py
```

The first command validates schema, exact sample identities, every residual derived from retained native/reference vectors, complete original-reference artifacts, current scientific-source inventory and generated browser binding without executing native code. The second additionally reproduces the native vectors. The third separately enforces the original numerical budget and currently exits 1 for the 19 retained failures. The generator performs actual native replay before writing the registry and binding; it also supports `--require-all-pass`. A failed numerical budget must not be concealed by dropping rows, changing epochs or widening thresholds.

Native replay permits only 2e-14 AU absolute / 2e-13 relative vector roundoff for host libm portability, plus 0.0001 seconds argument roundoff. Replay must retain each row's identity and acceptance result. These are reproduction tolerances, not changes to the scientific acceptance threshold. The recorded metrics themselves are recomputed exactly from their stored f64 vectors.

Source binding covers every ephemeris Rust source, binary coefficient file, native probe/epoch CSV, crate/root Cargo manifests, lockfile and toolchain. The full map and canonical digest remain in the registry. Validation-tool/schema hashes and all original reference artifacts are separately retained. Any source or validator change requires regeneration; no date interval is inferred from a digest. Build-time receipt validation matches each recorded native source against the corresponding WASM source inventory and verifies the actual receipt/binary hashes. This is provenance only: this registry contains no numerical WASM replay.

Browser admission hashes the exact registry bytes against the generated release binding. A private identity set distinguishes admitted frozen documents from raw caller objects, cloned records and arbitrary passing flags. Selection requires an exact recorded case/body, quantity, frame, TDB epoch, origin, observer domain, model-argument convention and native execution. Passing matches report `sampled`; failed/unmatched/UTC selections remain `unvalidated`. The separate summary accessor describes the historical sample set without certifying the displayed date. Release validation, rather than browser access to Rust source files, detects scientific-source staleness.

These unsigned integrity checks operate within repository/release trust. They are not independent compiler attestation, a continuous-domain proof, or qualification of apparent places, velocities, events, topocentric quantities, Earth orientation or image rendering.
