#!/usr/bin/env python3
"""Reproduce pinned, registered moon display maps from local NASA originals.

Offline operator workflow; no network, installation, production-asset update or
runtime admission. Requires the existing Pillow 12.2.0 image environment.
See docs/plans/2026-09-13-system-polish/MOON_SOURCES.md for original URLs.

  python tools/prepare_moon_reference.py --source-root build/moon-source-review-20260913 \
      --out build/moon-reference-replay --body Mimas --body Iapetus

Output must be a new directory below build/. All selected original and derived
hashes must match before the directory is published. Exit 0 means reproduced;
exit 1 means rejected. Black pixels are preserved unless an archive explicitly
defines zero as NoData; those recipes retain RGB but publish transparent gaps.
"""
from __future__ import annotations

import argparse
from dataclasses import asdict, dataclass
import hashlib
import json
import logging
import math
from pathlib import Path
import tempfile

if __package__:
    from . import prepare_planet_reference as planet
else:
    import prepare_planet_reference as planet

ROOT = Path(__file__).resolve().parents[1]
PILLOW_VERSION = "12.2.0"
MAX_SOURCE_BYTES = 200_000_000
MAX_SOURCE_PIXELS = 300_000_000


@dataclass(frozen=True)
class SourceSpec:
    body: str
    filename: str
    sha256: str
    source_bytes: int
    dimensions: tuple[int, int]
    mode: str
    crop: tuple[int, int, int, int]
    output_dimensions: tuple[int, int]
    output: str
    output_sha256: str
    latitude_bounds: tuple[float, float] = (-90, 90)
    valid_latitude_bounds: tuple[float, float] = (-90, 90)
    nodata_zero_channel: bool = False


# Retained for offline reproduction of the previously admitted grayscale map.
# The active Io recipe below uses the producer's registered color-merged map;
# both products retain the same complete affine image grid and source channels.
IO_MONOCHROME_SOURCE_SPEC = SourceSpec("Io", "io-original.tif",
    "cf65a0323aac9c4c9eb582aa7b7ce0d36be8e445316fa6dba49ab5647b63584c", 65546342,
    (11445, 5723), "L", (0, 0, 11445, 5723), (2048, 1024), "io-voyager-galileo-reference-2k.png",
    "eabc16b3b001ecf53802688d6a6481029b71cc567190cb91b971ab439aa63449",
    latitude_bounds=(math.degrees((2862000-5723*1000)/1821460), math.degrees(2862000/1821460)),
    nodata_zero_channel=True)


SOURCE_SPECS = (
    SourceSpec("Mimas", "mimas-PIA17214-unlabeled-original.png",
        "f8ffa667b2c35ec890973ea3300a33d3ee506f596b53d3818cdfee56943e038b", 6959979,
        (5760, 2880), "L", (0, 0, 5760, 2880), (2048, 1024), "mimas-cassini-reference-2k.png",
        "fbb571b298642fe64899c548ff6948daf0634e15b8ce6ba3abe963abd7d40196"),
    SourceSpec("Iapetus", "iapetus-nasa-map.jpg",
        "c054d5927ca1f3b42914fef82cd700c8bbfd28c6890b5410faaf79e3368d0887", 2057630,
        (6199, 3407), "RGB", (240, 203, 6000, 3083), (2048, 1024), "iapetus-cassini-reference-2k.png",
        "519dd1c1781d2a183666ed4b3fc5541cbaa351e604214a0a774e298db49bd6a0"),
    SourceSpec("Enceladus", "enceladus-nasa-map.jpg",
        "52bf59db9a98cce6073139fb649282113e0dde92d39b84bb029636ca9671537b", 4136213,
        (7200, 3600), "L", (0, 0, 7200, 3600), (2048, 1024), "enceladus-cassini-reference-2k.png",
        "ec869b20d7aa570b55ecd0bbda42ba42797d84e1eeaf4bfc5a5f52ca312e1c9c"),
    SourceSpec("Tethys", "tethys-nasa-map.jpg",
        "08f6fed39325fa7532be01eebc85c0b2a55bf0b9fdcfbf85c878db5bbac45ae5", 7104011,
        (11520, 5760), "L", (0, 0, 11520, 5760), (2048, 1024), "tethys-cassini-reference-2k.png",
        "ecc49fcac05091c42d456d23266fd378d6e7728c90024bf65728637767fe77af"),
    SourceSpec("Dione", "dione-nasa-map.jpg",
        "de59158e9d9b5b00d717bb0d2750e960dc3eb68f5aed36a3b214ce6db46660ec", 21677835,
        (23040, 11520), "L", (0, 0, 23040, 11520), (2048, 1024), "dione-cassini-reference-2k.png",
        "e95437fecb7d447179b65427afcb80c1eaa948f1073470995d1c21a25ba8467d"),
    SourceSpec("Rhea", "rhea-nasa-map.jpg",
        "dd17563a8cd20fb057af7f4f0df465855f895e61cf29ec0a27e3e8862d14bd5e", 5583646,
        (11520, 5760), "L", (0, 0, 11520, 5760), (2048, 1024), "rhea-cassini-reference-2k.png",
        "759e9732ad7804221bc85da61c459d6846342d4aa1fe06d67b566d4b9b889779"),
    SourceSpec("Phobos", "phobos-usgs-source.jpg",
        "d8a00068ac8e13821528d546b2e1d2c613e5225a22da04ad7d05bf3b727f3ce4", 161960,
        (1024, 512), "L", (0, 0, 1024, 512), (1024, 512), "phobos-viking-reference-1k.png",
        "57b0b9bb3d69e2735cfe19b68d6d64d05a6cd7cf33ae0a3bd87501f70e90b5fe"),
    # GeoTIFF image extents differ slightly from the nominal +/-90-degree grid.
    # Use the source tie point, pixel scale and ISIS sphere when masking rows.
    # The producer identifies the polar five degrees as interpolated. Retain
    # their RGB in the archive-derived raster, but withhold display coverage.
    SourceSpec("Io", "Io_Galileo_SSI_Global_Mosaic_ClrMerge_1km.tif",
        "524dcabd247c889a4e7c2a1bfd9e5fcc545c6a039b2c765da9b741befdfd00bd", 196637696,
        (11445, 5723), "RGB", (0, 0, 11445, 5723), (2048, 1024), "io-galileo-color-reference-2k.png",
        "f83b274d56021fa11eac9c0c3755bd6ffc1397d93cc9fadb6207faca77366ed8",
        latitude_bounds=(math.degrees((2862000-5723*1000)/1821460), math.degrees(2862000/1821460)),
        valid_latitude_bounds=(-85, 85), nodata_zero_channel=True),
    SourceSpec("Europa", "europa-original.tif",
        "a323f0c9ccb47d5af9902ea8297fe81f9a9708795645b80801f103c3f7c9a624", 192777263,
        (19631, 9816), "L", (0, 0, 19631, 9816), (2048, 1024), "europa-voyager-galileo-reference-2k.png",
        "87ad2488589f01e72a4bbc3656c22555728b21e38b4d0df2a6c2aeb9fc894a07",
        latitude_bounds=(math.degrees((2453875.1727718-9816*499.97456657942)/1562089.9658), math.degrees(2453875.1727718/1562089.9658)),
        valid_latitude_bounds=(-83, 90), nodata_zero_channel=True),
    SourceSpec("Ganymede", "ganymede-original.tif",
        "c2c8d9506b8cf8f7a0a90d823d9052e91c8d9885cf7267fdce8de8216f4df888", 136844537,
        (16539, 8270), "L", (0, 0, 16539, 8270), (2048, 1024), "ganymede-voyager-galileo-reference-2k.png",
        "900af8e39acb7137e2c6d1745279ebdac1152702818711336f149972a055b050",
        latitude_bounds=(math.degrees((4135277.8377093-8270*1000.0671917072)/2632344.9707), math.degrees(4135277.8377093/2632344.9707)),
        nodata_zero_channel=True),
    SourceSpec("Callisto", "callisto-original.tif",
        "e1f0bd2e0e05de605d067d6b5f5ededddaf31ca6c064562a1ca770f15a7dbaa3", 114640717,
        (15138, 7569), "L", (0, 0, 15138, 7569), (2048, 1024), "callisto-voyager-galileo-reference-2k.png",
        "fb8cd280cd2fbd82f55b33f8a7710087cc590f128e72adac95fc1e21dc88a909",
        nodata_zero_channel=True),
)


def digest(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def verify_source(path: Path, spec: SourceSpec) -> None:
    if path.is_symlink() or not path.is_file() or not 0 < path.stat().st_size <= MAX_SOURCE_BYTES:
        raise ValueError(f"Missing, linked or oversized original: {path.name}")
    if path.stat().st_size != spec.source_bytes or digest(path) != spec.sha256:
        raise ValueError(f"Original byte identity mismatch: {path.name}")


def image_module():
    try:
        import PIL
        from PIL import Image
    except ImportError as exc:
        raise ValueError("Offline preparation requires Pillow 12.2.0") from exc
    if PIL.__version__ != PILLOW_VERSION:
        raise ValueError(f"Byte reproduction requires Pillow {PILLOW_VERSION}; found {PIL.__version__}")
    return Image


def derive(image, spec: SourceSpec):
    """Extract only the reviewed data rectangle, preserving every source channel."""
    Image = image_module()
    if image.size != spec.dimensions or image.mode != spec.mode or image.mode not in ("L", "RGB"):
        raise ValueError("Source dimensions or channel interpretation differ from the pinned recipe")
    left, top, right, bottom = spec.crop
    width, height = spec.dimensions
    out_width, out_height = spec.output_dimensions
    masked = spec.nodata_zero_channel or spec.valid_latitude_bounds != (-90, 90)
    if (any(type(value) is not int for value in (*spec.crop, *spec.output_dimensions))
            or not 0 <= left < right <= width or not 0 <= top < bottom <= height
            or (not masked and right - left != 2 * (bottom - top)) or out_width != 2 * out_height
            or out_height < 2 or out_width > right - left or out_height > bottom - top):
        raise ValueError("Unreviewed map crop, aspect ratio or upsampling request")
    if masked:
        if spec.crop != (0, 0, width, height):
            raise ValueError("Masked archive maps must retain their entire affine image grid")
        recipe = planet.SourceSpec(spec.body, spec.filename, spec.sha256, spec.dimensions,
            spec.output, spec.output_sha256, spec.output_dimensions,
            latitude_bounds=spec.latitude_bounds, valid_bands=(spec.valid_latitude_bounds,),
            nodata_zero_channel=spec.nodata_zero_channel, resampling="BOX")
        return planet.derive_image(image, recipe)[0]
    # A crop is explicit only for the Iapetus sheet. Do not discover bounds from
    # brightness: dark craters and Iapetus's dark terrain are valid measurements.
    data = image.crop(spec.crop)
    return data if data.size == spec.output_dimensions else data.resize(spec.output_dimensions, Image.Resampling.BOX)


def prepare(source_root: Path, out: Path, bodies: tuple[str, ...], *, build_root: Path = ROOT / "build") -> list[dict]:
    source_root, out, build_root = source_root.resolve(), out.resolve(), build_root.resolve()
    if not out.is_relative_to(build_root) or out == build_root or out.exists():
        raise ValueError("Output must be a new directory below build/")
    selected = [spec for spec in SOURCE_SPECS if spec.body in bodies]
    if not selected or len(selected) != len(bodies):
        raise ValueError("Select distinct supported moon names")
    for spec in selected:
        verify_source(source_root / spec.filename, spec)
    Image = image_module()
    out.parent.mkdir(parents=True, exist_ok=True)
    previous_limit = Image.MAX_IMAGE_PIXELS
    try:
        # Original identity is checked before lifting the generic image limit.
        Image.MAX_IMAGE_PIXELS = MAX_SOURCE_PIXELS
        with tempfile.TemporaryDirectory(prefix=".moon-reference-", dir=out.parent) as scratch:
            staged = Path(scratch) / "prepared"; staged.mkdir()
            records = []
            for spec in selected:
                with Image.open(source_root / spec.filename) as image:
                    if image.width * image.height > MAX_SOURCE_PIXELS:
                        raise ValueError("Source pixel limit exceeded")
                    result = derive(image, spec)
                    result.save(staged / spec.output, format="PNG", optimize=False, compress_level=9)
                actual = digest(staged / spec.output)
                if actual != spec.output_sha256:
                    raise ValueError(f"Derived byte identity mismatch for {spec.body}; review decoder environment")
                records.append({"recipe": asdict(spec), "derived_sha256": actual,
                    "derived_bytes": (staged / spec.output).stat().st_size, "pillow_version": PILLOW_VERSION,
                    "resampling": "BOX", "color_adjustment": "none",
                    "nodata": "alpha" if result.mode == "RGBA" else "none"})
            (staged / "derivation.json").write_text(json.dumps(records, indent=2) + "\n", encoding="utf-8")
            staged.rename(out)
            return records
    finally:
        Image.MAX_IMAGE_PIXELS = previous_limit


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--body", choices=[spec.body for spec in SOURCE_SPECS], action="append")
    args = parser.parse_args()
    try:
        result = prepare(args.source_root, args.out, tuple(args.body or [spec.body for spec in SOURCE_SPECS]))
    except (OSError, ValueError) as exc:
        logging.error("Moon reference preparation rejected: %s", exc)
        return 1
    logging.info("Reproduced %d registered moon references", len(result))
    return 0


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    raise SystemExit(main())
