"""Derive bounded physical terrain from pinned NASA numerical elevation products.

Offline by default. The source cache must contain the original files identified below.
No RGB interpretation, height invention, resampling, or network acquisition occurs.
Usage: python tools/prepare_terrain_reference.py --source-dir build/terrain-source-cache
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import struct
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
WIDTH, HEIGHT = 1440, 720
MOLA_REFERENCE_RADIUS_KM = 3396.0
LOLA_REFERENCE_RADIUS_KM = 1737.4
HEIGHT_OFFSET_KM = -32.768
HEIGHT_SCALE_KM = 0.001
SOURCE_FILES = {
    "ldem_4.tif": "330afa2556a86fd05ac6ba2f912f246600fdade35de2a0d90593d50d07b01b65",
    "megr90n000cb.img": "f03189d62bb882f81d4f1dd08537e56d42f3d0371747ce62c9f01db3f552834a",
    "megr90n000cb.lbl": "5b5887d828354542e92eb404c1b7c25371b2aedeeedf645a18da22efaf06a8a9",
    "megr90n000cb.xml": "18a41c681c7d418eca3be847f8b0b33bbb6f2bfe838b41c96f047c2e4540b332",
}
NASA_BASE = "https://svs.gsfc.nasa.gov/vis/a000000/a004700/a004720/"
PDS_BASE = "https://pds-geosciences.wustl.edu/mgs/urn-nasa-pds-mgs_mola_topography_derived/meg004/"


def verified_source(path: Path, sha256: str) -> bytes:
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != sha256:
        raise ValueError(f"source SHA-256 mismatch: {path.name}")
    return raw


def read_mola_radius(raw: bytes, width: int, height: int) -> list[float]:
    if len(raw) != width * height * 2:
        raise ValueError("MOLA source size does not match dimensions")
    return [value[0] / 1000.0 for value in struct.iter_unpack(">h", raw)]


def encode_heights(values: Iterable[float]) -> bytes:
    output = bytearray()
    for value in values:
        if not math.isfinite(value):
            raise ValueError("terrain height must be finite")
        code = math.floor(value * 1000.0 + 32768.0 + 0.5)
        if not 0 <= code < 65535:
            raise ValueError("terrain height outside signed metre encoding range")
        output.extend(struct.pack("<H", code))
    return bytes(output)


def decode_heights(raw: bytes) -> list[float]:
    if len(raw) % 2:
        raise ValueError("terrain encoded byte size must be even")
    return [(value[0] - 32768) / 1000.0 for value in struct.iter_unpack("<H", raw)]


def prepare(source_dir: Path, web_root: Path) -> dict:
    try:
        import PIL
        from PIL import Image
    except ImportError as exc:
        raise ValueError("Offline terrain preparation requires optional Pillow 12.2.0") from exc
    if PIL.__version__ != "12.2.0":
        raise ValueError(f"Byte reproduction requires Pillow 12.2.0; found {PIL.__version__}")
    # Validate every byte identity before writing derived outputs.
    source = {name: verified_source(source_dir / name, digest) for name, digest in SOURCE_FILES.items()}
    with Image.open(source_dir / "ldem_4.tif") as moon:
        if moon.mode != "F" or moon.size != (WIDTH, HEIGHT):
            raise ValueError("LOLA source must be 1440x720 float-kilometre TIFF")
        lunar = list(moon.get_flattened_data())
    martian = read_mola_radius(source["megr90n000cb.img"], WIDTH, HEIGHT)
    references = []
    products = [
        ("Moon", lunar, LOLA_REFERENCE_RADIUS_KM, 0.5, "ldem_4.tif", NASA_BASE,
         "LRO / LOLA measured relief", "LOLA gridded reference available in spring 2019; not a single observation epoch",
         ["https://svs.gsfc.nasa.gov/4720/"],
         "NASA Scientific Visualization Studio / LRO LOLA instrument team",
         "Numerical laser-altimetry grid, not the CGI kit's aesthetic color image. Native 0.25-degree cells; source gridding is retained. No sub-cell geological detail. Lunar reference orientation is not a current-facing feature-location claim."),
        ("Mars", martian, MOLA_REFERENCE_RADIUS_KM, 0.0, "megr90n000cb.img", PDS_BASE,
         "MGS / MOLA measured relief", "MOLA 1997-2001 source interval; MEGR product 2.0 created 2003-04-03",
         ["https://pds-geosciences.wustl.edu/missions/mgs/megdr.html", PDS_BASE + "megr90n000cb.lbl", PDS_BASE + "megr90n000cb.xml"],
         "NASA Goddard / MGS MOLA Science Team / PDS Geosciences Node",
         "Mean planetary radius, not height above areoid. IAU2000 planetocentric positive-east coordinates. Source team interpolates bins without measurements; about 55 percent of equatorial bins contain a shot. No local interpolation is claimed as newly observed geology."),
    ]
    destination = web_root / "textures/terrain"
    destination.mkdir(parents=True, exist_ok=True)
    for body, values, radius, prime, filename, base, label, epoch, urls, credits, limits in products:
        raw = encode_heights(values)
        decoded = decode_heights(raw)
        name = f"{body.lower()}-radial-height.u16.bin"
        (destination / name).write_bytes(raw)
        references.append({
            "id": f"{body.lower()}-radial-height-v1", "body": body,
            "path": f"textures/terrain/{name}", "sha256": hashlib.sha256(raw).hexdigest(),
            "bytes": len(raw), "width": WIDTH, "height": HEIGHT,
            "encoding": "uint16-little-endian", "nodata_code": 65535,
            "heightOffsetKm": HEIGHT_OFFSET_KM, "heightScaleKm": HEIGHT_SCALE_KM,
            "quantity": "radial-height-from-reference-sphere", "referenceRadiusKm": radius,
            "minHeightKm": min(decoded), "maxHeightKm": max(decoded),
            "minRadiusKm": radius + min(decoded), "maxRadiusKm": radius + max(decoded),
            "nativeDegreesPerTexel": 0.25, "nativeEquatorialKmPerTexel": radius * math.pi / 720,
            "mapping": {"primeMeridianU": prime, "longitudeDirection": "east", "latitudeType": "planetocentric",
                        "latitudeBounds": [-90, 90], "pixelRegistration": "cell-centered", "rowOrder": "north-to-south"},
            "coverage": "global source grid, including source-team interpolation", "label": label,
            "source_url": base + filename, "source_sha256": SOURCE_FILES[filename],
            "source_bytes": len(source[filename]), "source_retrieved_at": "2026-09-13",
            "metadata_urls": urls, "metadata_sha256": {name: digest for name, digest in SOURCE_FILES.items() if body == "Mars" and name.endswith((".lbl", ".xml"))},
            "observation_label": epoch, "credits": credits,
            "derivation": "prepare_terrain_reference.py v1; native samples retained; float kilometres (Moon) or signed big-endian integer metres (Mars) to little-endian unsigned integer metres with -32768m offset; round-half-up; no resampling; maximum quantization error 0.5m",
            "limitations": limits,
        })
    manifest = {"schema_version": "terrain-assets.v1", "references": references}
    (web_root / "terrain-assets.v1.json").write_text(json.dumps(manifest, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    # Runtime reference identities are hash-bound by the application's module graph.
    module = web_root / "js/terrainAssets.js"
    if module.exists():
        text = module.read_text(encoding="utf-8")
        start, end = "// BEGIN GENERATED TERRAIN REFERENCES", "// END GENERATED TERRAIN REFERENCES"
        if text.count(start) != 1 or text.count(end) != 1:
            raise ValueError("terrain module missing unique generation markers")
        prefix, rest = text.split(start, 1)
        _, suffix = rest.split(end, 1)
        generated = "\nconst REFERENCES = " + json.dumps(references, indent=2, allow_nan=False) + ";\n"
        module.write_text(prefix + start + generated + end + suffix, encoding="utf-8", newline="\n")
    try:
        from .validate_physical_assets import validate_terrain
    except ImportError:
        from validate_physical_assets import validate_terrain
    validate_terrain(manifest, web_root)
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-dir", type=Path, required=True)
    parser.add_argument("--web-root", type=Path, default=ROOT / "apps/web")
    args = parser.parse_args()
    manifest = prepare(args.source_dir, args.web_root)
    print(json.dumps({"products": len(manifest["references"]), "bytes": sum(r["bytes"] for r in manifest["references"])}))


if __name__ == "__main__":
    main()
