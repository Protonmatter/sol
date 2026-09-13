#!/usr/bin/env python3
"""Reproduce reviewed planetary display maps from pinned local agency originals.

Explicit offline workflow; Pillow 12.2.0 is needed only for image preparation.
No dependency installation, network request, build hook or runtime admission.

  python tools/prepare_planet_reference.py --source-root build/planet-sources-20260913 \
      --out build/planet-reference-replay

The source filenames, byte hashes, dimensions, masks and output byte hashes are
fixed below. Fetch originals using the source record in PLANET_SOURCES.md and the
committed visual inventory; this tool never fetches or substitutes them. Outputs
are published as a new directory below build/ only after every selected hash
matches. Existing source/output files are not replaced. Exit0 means reproduced;
exit1 means rejected or the explicitly required Pillow environment is absent.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
import hashlib
import json
import logging
import math
from pathlib import Path
import shutil
import tempfile

ROOT = Path(__file__).resolve().parents[1]
PILLOW_VERSION = "12.2.0"
MAX_SOURCE_BYTES = 200_000_000
MAX_SOURCE_PIXELS = 240_000_000


@dataclass(frozen=True)
class SourceSpec:
    body: str
    filename: str
    sha256: str
    dimensions: tuple[int, int]
    output: str
    output_sha256: str
    output_dimensions: tuple[int, int]
    latitude_bounds: tuple[float, float] = (-90, 90)
    valid_bands: tuple[tuple[float, float], ...] = ((-90, 90),)
    nodata_zero_channel: bool = False
    endpoint_inclusive: bool = False
    resampling: str = "LANCZOS"
    original_copy: bool = False


SOURCE_SPECS = (
    SourceSpec("Mercury", "mercury-usgs-bdr-1024.jpg",
               "f7a5b7b3e7a7e7b61c0e9267d87432a1c5f3f18282b55e264f14ef2f3bff8d31", (1024,512),
               "mercury-bdr-reference-1k.png", "1dc83dbbf0b59633673dd325b6f3e0f453c4a33c09a54c008bef71c2a0cd5ead", (1024,512), valid_bands=((-85,85),)),
    SourceSpec("Mars", "mars-viking-mdim21-1km.jpg",
               "fdfcd335559c3dc67052b7e8a9565d850e336ac0d1f3ea7f5eb7826ffb44ecb2", (21339,10670),
               "mars-viking-reference-2k.png", "f62de76a876702a3959dc5b2873c34f5cdeedda4c54eb7bddb6f78f62dbcfc74", (2048,1024),
               latitude_bounds=(-math.degrees(5335000/3396190), math.degrees(5335000/3396190)), nodata_zero_channel=True, resampling="BOX"),
    SourceSpec("Venus", "venus-usgs-c3-2025m.tif",
               "833d5368564b626a787b6d0a2b2432a0afaa89f72d4b46e5221a19b3a01ec380", (18775,9388),
               "venus-magellan-radar-reference-2k.png", "fc043e4ebabe8d50eba42c80378dbb82284f2e3ff7e59f1a0870f17e52c03bd7", (2048,1024),
               latitude_bounds=(math.degrees((9504888.573436-9388*2025)/6051000), math.degrees(9504888.573436/6051000)),
               nodata_zero_channel=True, resampling="BOX"),
    SourceSpec("Jupiter", "jupiter-opal-2015a.tif",
               "c3b915227ef88899a07a2b62584d9303d77d3491b9bb7de8824fb6df4a52f7b2", (3600,1800),
               "jupiter-opal-reference-2k.png", "b134fbf614aa21dda6e951f616067b2d32ed825950e48d35d35d09f6a5c80637", (2048,1024),
               valid_bands=((-79.8,79.8),), nodata_zero_channel=True),
    SourceSpec("Saturn", "saturn-opal-2025a.tif",
               "c34a13a8253a39bcc1f8376b24c077b89f05ce0b5202706f535ded20314440d7", (1800,900),
               "saturn-opal-reference.png", "c88eb864e3c6a2c4a23f7b8cfa32a510e4dc46431da8b0697b7121f45e307fee", (1800,900),
               valid_bands=((-80,0),(7,75)), nodata_zero_channel=True),
    SourceSpec("Uranus", "uranus-opal-2024a.tif",
               "838dbf45072d4354425389d7c5869312185fd8df3d0d5ee526661b22db4c3c12", (721,361),
               "uranus-opal-reference.png", "d59ba81033bba3faf30950c2d8893319a8f3e94f968a648c03b16b5d0fd8c8a5", (721,361),
               valid_bands=((-5,90),), nodata_zero_channel=True, endpoint_inclusive=True),
    SourceSpec("Neptune", "neptune-opal-2025b.tif",
               "8c17a2872b5d55577c63abe7ba1369997ff32bb83e0f9b9c350a46db96713cb8", (721,361),
               "neptune-opal-reference.png", "c9dee0f329268f801ae5e4c736da72c329539f862a651f536e0c3d4846682adf", (721,361),
               valid_bands=((-90,35),), nodata_zero_channel=True, endpoint_inclusive=True),
    SourceSpec("Moon", "moon-lroc-2025-2k.jpg",
               "f7130a1822681fa7512d7dcfd40db8c10b9ba4f06777910348698260ed7a2170", (2048,1024),
               "moon-lroc-2025-2k.jpg", "f7130a1822681fa7512d7dcfd40db8c10b9ba4f06777910348698260ed7a2170", (2048,1024), original_copy=True),
)


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def verify_source(path: Path, expected_sha256: str) -> None:
    if not path.is_file() or not 0 < path.stat().st_size <= MAX_SOURCE_BYTES:
        raise ValueError(f"Missing or oversized source: {path.name}")
    if digest(path) != expected_sha256:
        raise ValueError(f"Source byte identity mismatch: {path.name}")


def affine_window(west: float, east: float, south: float, north: float) -> dict:
    """Map nominal 360x180-degree UV onto unchanged affine raster extents."""
    if (not all(math.isfinite(x) for x in (west,east,south,north))
            or not 0 < east-west <= 361 or not -91 <= south < north <= 91):
        raise ValueError("Invalid affine geographic bounds")
    return {"phasePrimeU": (-west/360) % 1,
            "uvScale": [360/(east-west), 180/(north-south)],
            "uvOffset": [0, (north-90)/(north-south)]}


def endpoint_window(width: int, height: int) -> dict:
    """Explicit endpoint-inclusive display convention; does not establish WCS."""
    if type(width) is not int or type(height) is not int or min(width,height) < 2:
        raise ValueError("Endpoint grid requires at least two samples on each axis")
    return {"phasePrimeU": 0, "uvScale": [(width-1)/width,(height-1)/height],
            "uvOffset": [.5/width,.5/height]}


def valid_rows(height: int, bounds: tuple[float,float], bands: tuple[tuple[float,float], ...],
               endpoint_inclusive: bool = False) -> list[bool]:
    if type(height) is not int or height < 2:
        raise ValueError("At least two latitude samples required")
    south, north = bounds
    if not all(math.isfinite(x) for x in bounds) or not -91 <= south < north <= 91:
        raise ValueError("Invalid latitude bounds")
    if not bands or any(not all(math.isfinite(x) for x in band)
                        or not -90 <= band[0] <= band[1] <= 90 for band in bands):
        raise ValueError("Invalid display latitude bands")
    step = (north-south)/(height-1) if endpoint_inclusive else None
    latitudes = (north-i*step if endpoint_inclusive else north-(i+.5)*(north-south)/height for i in range(height))
    return [any(low <= latitude <= high for low,high in bands) for latitude in latitudes]


def _pillow():
    try:
        import PIL
        from PIL import Image, ImageChops, ImageFilter
    except ImportError as exc:
        raise ValueError("Offline preparation requires the optional Pillow 12.2.0 image environment") from exc
    if PIL.__version__ != PILLOW_VERSION:
        raise ValueError(f"Byte reproduction requires Pillow {PILLOW_VERSION}; found {PIL.__version__}")
    return Image, ImageChops, ImageFilter


def derive_image(image, spec: SourceSpec):
    """Keep RGB channels; add a conservative binary coverage mask, then resize."""
    Image, ImageChops, ImageFilter = _pillow()
    if image.size != spec.dimensions or image.mode not in ("RGB", "L"):
        raise ValueError("Source dimensions or channel format differ from the pinned recipe")
    width, height = image.size
    out_width, out_height = spec.output_dimensions
    if (min(out_width,out_height) < 2 or out_width > width or out_height > height
            or max(width/out_width,height/out_height) > 16):
        raise ValueError("Unsupported resampling ratio; review mask support before changing the recipe")
    if spec.resampling not in ("BOX", "LANCZOS"):
        raise ValueError("Unsupported resampling filter")
    source_rgb = image.convert("RGB")
    rgb = source_rgb if source_rgb.size == spec.output_dimensions else source_rgb.resize(
        spec.output_dimensions, getattr(Image.Resampling, spec.resampling))
    mask = Image.new("L", (width,height), 255)
    if spec.nodata_zero_channel:
        minimum = ImageChops.darker(source_rgb.getchannel(0), source_rgb.getchannel(1))
        minimum = ImageChops.darker(minimum, source_rgb.getchannel(2))
        mask = minimum.point(lambda value: 255 if value else 0)
    for row, valid in enumerate(valid_rows(height, spec.latitude_bounds, spec.valid_bands, spec.endpoint_inclusive)):
        if not valid:
            mask.paste(0, (0,row,width,row+1))
    if spec.nodata_zero_channel:
        mask = mask.filter(ImageFilter.MinFilter(5))
    if mask.size != rgb.size:
        mask = mask.resize(rgb.size, Image.Resampling.BOX)
        mask = mask.point(lambda value: 255 if value == 255 else 0)
    rgba = rgb.copy()
    rgba.putalpha(mask)
    return rgba, mask


def _prepare_one(source_root: Path, output_root: Path, spec: SourceSpec) -> dict:
    source = source_root/spec.filename
    verify_source(source, spec.sha256)
    output = output_root/spec.output
    mask_name = None
    if spec.original_copy:
        shutil.copyfile(source, output)
    else:
        Image, _, _ = _pillow()
        previous_limit = Image.MAX_IMAGE_PIXELS
        try:
            # The bytes were authenticated before lifting Pillow's generic limit.
            Image.MAX_IMAGE_PIXELS = MAX_SOURCE_PIXELS
            with Image.open(source) as image:
                if image.size != spec.dimensions:
                    raise ValueError("Pinned source dimensions mismatch")
                image.load()
                rgba, mask = derive_image(image, spec)
                rgba.save(output, format="PNG", optimize=False, compress_level=9)
                mask_name = Path(spec.output).stem + "-coverage.png"
                mask.save(output_root/mask_name, format="PNG", optimize=False, compress_level=9)
        finally:
            Image.MAX_IMAGE_PIXELS = previous_limit
    actual = digest(output)
    if actual != spec.output_sha256:
        raise ValueError(f"Derived byte identity mismatch for {spec.body}; keep the existing admitted map and review the decoder environment")
    return {"recipe": asdict(spec), "derived_sha256": actual, "derived_bytes": output.stat().st_size,
            "coverage_mask": mask_name,
            "coverage_sha256": digest(output_root/mask_name) if mask_name else None,
            "pillow_version": PILLOW_VERSION if not spec.original_copy else None}


def prepare(source_root: Path, out: Path, bodies: tuple[str,...], *, build_root: Path = ROOT/"build") -> list[dict]:
    source_root, out, build_root = source_root.resolve(), out.resolve(), build_root.resolve()
    if not out.is_relative_to(build_root) or out == build_root or out.exists():
        raise ValueError("Output must be a new directory below build/")
    selected = [spec for spec in SOURCE_SPECS if spec.body in bodies]
    if not selected or len(selected) != len(bodies):
        raise ValueError("Select distinct supported body names")
    if not source_root.is_dir():
        raise ValueError("Original source directory is absent")
    # Reject all wrong originals before decoding any image or publishing output.
    for spec in selected:
        verify_source(source_root/spec.filename, spec.sha256)
    out.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".planet-reference-", dir=out.parent) as scratch:
        staged = Path(scratch)/"prepared"
        staged.mkdir()
        result = [_prepare_one(source_root, staged, spec) for spec in selected]
        (staged/"derivation.json").write_text(json.dumps(result,indent=2)+"\n",encoding="utf-8")
        staged.rename(out)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--body", choices=[s.body for s in SOURCE_SPECS], action="append")
    args = parser.parse_args()
    try:
        result = prepare(args.source_root, args.out, tuple(args.body or [s.body for s in SOURCE_SPECS]))
    except (OSError, ValueError) as exc:
        logging.error("Planet reference preparation rejected: %s", exc)
        return 1
    logging.info("Reproduced %d body references; original and derived hashes verified",len(result))
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,format="%(levelname)s: %(message)s")
    raise SystemExit(main())
