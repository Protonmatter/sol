#!/usr/bin/env python3
"""Regenerate native-only evidence from retained Horizons responses, offline."""
from __future__ import annotations
import sys
import argparse
import subprocess
import independent_vector_evidence as evidence
import validate_vectors


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--require-all-pass', action='store_true', help='fail if any recorded sample exceeds its unchanged budget')
    args = parser.parse_args()
    try:
        before = evidence.validation_hashes()
        report = validate_vectors.validate(evidence.ROOT / evidence.REFERENCE)
        document = evidence.build_document(report)
        if before != evidence.validation_hashes():
            raise ValueError('evidence generator changed during native replay')
        raw = evidence.serialize(document)
        (evidence.ROOT / evidence.REGISTRY).write_bytes(raw)
        (evidence.ROOT / evidence.BINDING).write_text(evidence.binding_source(raw, document))
        worst = max(document['records'], key=lambda r: r['relative_vector_norm_arcsec'])
        passing = sum(row['passed'] for row in document['records'])
        print(f"Generated {len(document['records'])} native samples; {passing}/{len(document['records'])} pass the unchanged sample budget; worst {worst['relative_vector_norm_arcsec']:.9f} "
              f"arcsecond-equivalent relative vector residual ({worst['case']}, JD/TDB {worst['jd_tdb']}); "
              'no WASM numerical or continuous-date qualification')
        return 1 if args.require_all_pass and passing != len(document['records']) else 0
    except (ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError) as exc:
        print(f'Independent evidence generation failed: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__': raise SystemExit(main())
