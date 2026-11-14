# Seasonal observer minimum-compiler verification — 2026-11-04

The current seasonal candidate passes native Linux x86-64 verification on the
authorized Google Cloud Shell VM using Rust 1.85.0 and Python 3.12.3. The actual
saved archive, file inventories, current input correspondence and execution logs
are admitted locally. Rust 1.96.0 remains the qualification compiler. This is
sampled model/observer and compiler-compatibility evidence.

## Inputs and execution

The frozen input manifest contains 621 public project/test files, 24,708,246
bytes. Every source hash matches the current checkout through its explicit
`source_path`; the two stale WASM seeds and public-CLI helper have transfer
aliases. The bootstrap checks the archive hash and bounded regular-file
inventory before extracting or launching the reviewed driver. Helper snapshots
are evidence; no returned Python or Rust code is executed during local admission.

The official compiler installation uses isolated HOME, Cargo, Rustup, target and
temporary directories. It does not select a global default compiler. The optional
Cloud API credential grant was rejected; no paid VM or cloud-project change was
needed. Commands use two build/test threads, explicit deadlines, separate process
groups and owned-group cleanup. All ten actual commands return zero:

| Command or check | Actual result |
| --- | --- |
| Official Rust installation and compiler/Cargo identity | Rust/Cargo 1.85.0, Linux x86-64 |
| Locked offline workspace/all-target check | Passed |
| Locked offline workspace tests | 224 passed |
| Seasonal offline reference tests | 11 passed |
| Fixed 1900–2200 model matrix | 109,900 checks, 74,575 records, 3,925 epochs passed |
| Actual configured-target WASM build/staging | Both staged modules match actual Cargo output |
| Actual Cargo-selected original sky CLI | 48 full v3 snapshots, 2,160 comparisons passed |
| Frozen/work input correspondence after commands | Both unchanged |

The model observer uses an exact source copy plus its recorded read-only probe;
the seasonal observer uses the actual `sky` executable selected from Cargo JSON
under the owned target directory. Those are separate evidence paths. Its recorded
native CLI digest is `30bfa97ad0bf4dd9f06a8e1b92f00c75455f60e55732856c0f160e4f0773133e`.
All snapshot output and stderr bytes, command lines, source pins and logs remain
in the original native archive. Executable bytes are not included in that return
payload; attribution uses the actual Cargo artifact log and the pinned harness's
recorded ELF/hash/command checks, not independent local executable hashing.

The WASM selection control deliberately leaves the qualification compiler's old
outputs at the conventional workspace target path. Actual minimum-compiler
outputs must match staging and differ from those seeds. Both conditions pass:

| Module | Actual/staged SHA-256 | Deliberately stale seed SHA-256 |
| --- | --- | --- |
| `solar_ephemeris.wasm` | `cbd5b3dec6756c14b8e39b5cd3efa9aa9b3dbec7e6bc3aed0f37dd91754a944c` | `2b49b29098e07475cdb73cab45ee784a6017424dfacc32a6882719564ed05ca2` |
| `solar_wasm.wasm` | `89bbecbaa64bf86e7435dd94247ca9a077caed55a49a117cc74688b182bf901d` | `f8a78a07da7c742735288b32613a8344fe7ab5df2eedea27b4a4d866c9599199` |

## Saved evidence and local admission

The reviewed return helper serves one declared archive on a bounded loopback
listener through authenticated preview. The saved Windows download matches its
advertised size and hash. Both bounded archives reject traversal, links,
duplicates, unexpected files and oversized members; all 118 native evidence
records and all source mappings match. Inner and detached receipt bytes agree.
Completion, bootstrap, installer, input archive, source manifest and driver
identities are joined; a completion marker alone is insufficient.

| Artifact | SHA-256 |
| --- | --- |
| Input manifest | `1f01b3f09009f1ce57de4d064eeb3831e44b5004960822d02f1f03731b88afa5` |
| Input archive v3 | `1b1413338bbdaa5b6ff60aada2add078c676eb3bb07de518de181236a917a5de` |
| Executed driver v3 | `d6c50088c500f7d366c143988216e7c37656f9e4d840fef2564e8a3094dac8f8` |
| Executed bootstrap v3 | `40811f835013967a7e41b64f6eae6320b34ed7071744160155be3763c1d50c73` |
| Saved outer archive, 11,982,656 bytes | `7ccc8feebf1f1580eb3519d5bd488c48ce67e495f2835ac64f24fae0cd6080e3` |
| Original native archive, 11,961,642 bytes | `5eaaa796876972c09afe5fd4e8affb434beee1ada33328e5559d1dba365f1f51` |
| Original native receipt | `75b34f525961d82fee4ea1b7b081bb66ffd97603e2f65184904a2f3c34e9c4bf` |
| Model summary | `468b1a5e7ca98a7c36732c1397e6f3995a386facb2f58ca1d30c0a06906678a2` |
| Model native CSV | `27266010fa600b6e120789bc9d9d90e605102ecfd78ec50283fb949dc27b3e42` |
| Model comparison CSV | `cc3adfeada860158b2e89d6cd8be72a41f52740e07c04e3d319df0e8cb6470cb` |
| Seasonal original-CLI summary | `194bc5eef022a242bd2621e0c590cf6cf8351542c3d795c7f3dc24d3ac7450bb` |

Current owning offline comparison code replays all 109,900 saved model checks on
Windows successfully. All native/reference/epoch/source/control fields match
the saved report. Cross-platform Python arithmetic changes 5,073 measured-value
strings and 5,068 budget-fraction strings, by at most
`4.887516086293786e-11` arcsec in the great-circle metric. The original CSV and
summary remain unchanged. An initial private replay helper's byte-equality
assumption failed and is retained separately; it is not an accuracy failure.

Comparing native Linux 1.85 results with Windows 1.96 results gives maximum
component differences of `2.8421709430404007e-13` degrees RA,
`4.879430193227563e-14` degrees Dec and `2.86102294921875e-6` km range. The largest
vector-component difference is `6.128431095930864e-14` AU. TT argument errors
match exactly. These are measured finite samples, not a universal parity proof.

Independent harness review closed cleanup, packaging-completion and stale-seed
controls before v3 execution. Independent return-helper review closed four
receipt/source correspondence paths before transfer: 18 admission and 17
HTTP/lifecycle controls pass. Legitimate failed runs remain returnable.
Independent review of the actual downloaded evidence passes with no actionable
P0–P2 finding. It verifies all 621 source mappings, command/log counts, 48 full v3
snapshot schemas and exact epochs/sites, then independently recomputes all 2,160
seasonal metrics and all 109,900 model metrics from saved native outputs and
admitted raw references. Its vector-angle arithmetic confirms the fixed controls
and the measured cross-platform rounding difference. Review receipt SHA-256:
`1d4b8ba2c92d3ef4ea8c4c645823250859ef0d2ffb686703168065745961df8a`.

After local saved-byte/hash/source admission, the transfer acknowledgement
succeeded. The actual driver and return-server processes are absent, all owned
command groups are empty, and loopback port 8081 refuses connections. This
cleanup observation is separate from the immutable downloaded archive. The
preview tab is closed; the authorized console remains available for handoff.

## Reproduction and limits

Use the existing [seasonal reference commands](SEASONAL_OBSERVER_20261104.md)
and [bounded VM plan](superpowers/plans/2026-11-04-seasonal-msrv.md). Local
reviewable evidence is under `build/seasonal-msrv-20261104/returned-admitted/`;
the saved download and failed helper assumptions remain separately preserved.
No broad cleanup or computed-path recursive removal is required.

No fresh browser/GPU run is attributed to this VM follow-up. The 1.96 release
WASM bytes and staged application remain unchanged by the test-only Rust and
offline Python additions. Earlier browser evidence retains its original
artifact identity. Full-span Earth rotation, continuous physical/observer/event
accuracy, visibility/navigation, broader platforms and manual accessibility,
exact-source hosted CI, package notices and publication remain open. The user
approved 1900–2200 as the qualification target and years 1–9999 as approximate
outside it. No commit, push, merge, release or deployment occurred.
