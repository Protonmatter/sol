#!/usr/bin/env python3
"""Validate bound native sample evidence offline; --replay repeats native execution."""
from __future__ import annotations
import argparse
from pathlib import Path
import subprocess
import sys
import independent_vector_evidence as evidence
import validate_vectors


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--replay', action='store_true')
    parser.add_argument('--require-all-pass', action='store_true', help='also enforce the unchanged numerical gate for every sample')
    parser.add_argument('--wasm-root', type=Path, help='also bind corresponding WASM sources; not numerical WASM validation')
    args = parser.parse_args(argv)
    try:
        raw = (evidence.ROOT / evidence.REGISTRY).read_bytes()
        document = evidence.read_json(raw)
        evidence.validate_document(document)
        if (evidence.ROOT / evidence.BINDING).read_text() != evidence.binding_source(raw, document):
            raise ValueError('browser evidence binding differs')
        if args.replay:
            replay = evidence.build_document(validate_vectors.validate(evidence.ROOT / evidence.REFERENCE))
            evidence.compare_replay(document, replay)
        if args.wasm_root:
            evidence.validate_release_binding(evidence.ROOT, args.wasm_root)
        passing = sum(row['passed'] for row in document['records'])
        if args.require_all_pass and passing != len(document['records']):
            raise ValueError('one or more retained native samples failed the predeclared budget')
        print(f"VALID EVIDENCE: {len(document['records'])} exact native samples; {passing}/{len(document['records'])} pass the unchanged sample budget; source/provenance/metrics bound"
              + ('; native replay matched' if args.replay else '; no native execution this run'))
        return 0
    except (ValueError, KeyError, TypeError, OSError, subprocess.SubprocessError) as exc:
        print(f'Independent evidence validation failed: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__': raise SystemExit(main())
