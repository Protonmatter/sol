#!/usr/bin/env python3
"""One-time correction for Clippy's field-reassign-with-default finding."""

from pathlib import Path

PATH = Path("crates/solar-core/src/flux_transport.rs")
OLD = '''        let mut cfg = FluxTransportConfig::default();
        cfg.diffusion = 0.0;
'''
NEW = '''        let cfg = FluxTransportConfig {
            diffusion: 0.0,
            ..FluxTransportConfig::default()
        };
'''


def main() -> int:
    text = PATH.read_text(encoding="utf-8")
    if NEW in text:
        print("Clippy correction already applied")
        return 0
    if OLD not in text:
        raise SystemExit("Clippy correction marker not found")
    PATH.write_text(text.replace(OLD, NEW, 1), encoding="utf-8")
    print(f"updated {PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
