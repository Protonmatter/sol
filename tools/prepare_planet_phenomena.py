#!/usr/bin/env python3
"""Reproduce the qualified gallery from locally acquired official published bytes.

No network or transformation. --source-root contains the five filenames declared
in the pinned manifest; --out must be a new directory below this checkout's build/.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import logging
from pathlib import Path
import tempfile
try:
    from .validate_physical_assets import read_json
    from .validate_planet_phenomena import generated_module,validate_phenomena_source
except ImportError:
    from validate_physical_assets import read_json
    from validate_planet_phenomena import generated_module,validate_phenomena_source

ROOT=Path(__file__).resolve().parents[1]


def prepare(source_root: Path,out: Path) -> dict:
    data=read_json(ROOT/"apps/web/planet-phenomena.v1.json")
    for observation in data["observations"]:
        item=observation["asset"];source=source_root/Path(item["path"]).name
        if source.is_symlink() or not source.is_file() or source.stat().st_size!=item["bytes"]:
            raise ValueError("missing, linked or incorrectly sized observation source")
        raw=source.read_bytes()
        if hashlib.sha256(raw).hexdigest()!=observation["source_sha256"]:
            raise ValueError("observation source hash mismatch")
        target=out/item["path"];target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(raw)
    (out/"planet-phenomena.v1.json").write_text(json.dumps(data,indent=2)+"\n",encoding="utf-8",newline="\n")
    (out/"js").mkdir(exist_ok=True)
    (out/"js/planetPhenomenaManifest.js").write_text(generated_module(data),encoding="utf-8",newline="\n")
    validate_phenomena_source(out)
    return data


def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root",type=Path,required=True);parser.add_argument("--out",type=Path,required=True)
    args=parser.parse_args();out=args.out.resolve();build=(ROOT/"build").resolve()
    try:
        if not out.is_relative_to(build) or out==build or out.exists():raise ValueError("output must be a new directory below build/")
        build.mkdir(exist_ok=True);out.parent.mkdir(parents=True,exist_ok=True)
        with tempfile.TemporaryDirectory(prefix="planet-observations-",dir=build) as temporary:
            staged=Path(temporary)/"web";staged.mkdir();data=prepare(args.source_root.resolve(),staged);staged.rename(out)
        logging.info("Reproduced %s qualified observation images in %s",len(data["observations"]),out);return 0
    except (ValueError,OSError,KeyError,TypeError) as exc:
        logging.error("Observation preparation rejected: %s",exc);return 1


if __name__=="__main__":
    logging.basicConfig(level=logging.INFO,format="%(levelname)s: %(message)s")
    raise SystemExit(main())
