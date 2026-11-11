# Sky presentation and speed correction

This batch follows the November 10 structural review and the attached-label correction.

- Derive AU/Julian-year to km/s from the IAU AU and 365.25-day Julian year. Test the serialized Mercury speed against a displacement converted directly to kilometres/seconds across three epochs.
- Suppress catalogue-star rendering and hit targets in daylight, fading from full intensity at Sun altitude -18 degrees to zero at the horizon. This is a display heuristic, not a calibrated visibility model. Catalogue entries remain available.
- Reuse the pure label placement policy for Sky. Selected/hovered objects receive priority, then planets, then stars. Names that cannot fit beside their targets are suppressed. Preserve every astronomical marker position and catalogue selection.
- Retain the explicitly geometric horizon and compass-map orientation throughout the current UI. A future apparent-horizon change must update projection, list, details, trajectories and event explanation together.
- Constellation epoch reduction remains a separate numerical/worker-boundary change; this batch does not claim to correct it.

Validation sequence: failing regressions, corrected focused tests, full Rust and JavaScript suites, type/static checks, WASM and immutable web build, staged Chromium desktop/mobile checks. Browser runs use software GL and do not qualify physical-GPU performance. Source files must remain fixed while the distribution archive is built.

The staged recovery test also exposed a retained-snapshot redraw starting a trajectory worker after provider failure. A regression reproduced this, and trajectory requests now remain blocked while the presentation carries an error, until explicit recovery.

Validation completed: 2,116 JavaScript tests, 235 Rust release tests, Clippy with warnings denied, 139-file application typecheck, WASM/web build and staged Sky browser acceptance. See the [current remediation status](../../structural-remediation.md) for commands, evidence locations and limitations.
