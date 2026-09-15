#!/usr/bin/env python3
"""Reproduce SOL's Earth cloud layer from NASA's pinned Blue Marble 2002 cloud JPEG.

Explicit offline workflow; Pillow 12.2.0 decodes the JPEGs. No network request,
build hook or runtime admission.

  python tools/prepare_earth_clouds.py --source build/downloads/cloud_combined_2048.jpg \
      --out build/earth-clouds/earth-blue-marble-2002-cloud-layer.png
  python tools/prepare_earth_clouds.py --source build/downloads/cloud_combined_2048.jpg \
      --fit-opacity --composite build/composite-57735.jpg

The source is NASA Visible Earth record 57747, a neutral grey cloud image. Every
output pixel is white RGB with alpha OPACITY_LUT[grey], so clouds are drawn over the
land map instead of replacing it. OPACITY_LUT is fitted from NASA's own 2002
land/ocean/ice/cloud composite (record 57735, the previous committed layer): over
dark-ocean blocks with a cloud-free base, the linear-light opacity each grey value
implies is taken as a median, made monotone, and pinned below. --fit-opacity
recomputes that curve and its held-out error from the two pinned originals and fails
if the curve differs. The PNG uses the same deterministic encoder as the dated
weather layer. Identities are recorded in EARTH_SOURCES.md and the visual inventory;
this tool never fetches or substitutes them and never replaces an existing file.
Exit 0 means the pinned result was reproduced; exit 1 means a hash, grid, neutrality
or curve check failed or the required Pillow version is absent.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import logging
from pathlib import Path
from statistics import median

try:
    from fetch_earth_reference import encode_rgba
except ImportError:  # imported as tools.prepare_earth_clouds
    from tools.fetch_earth_reference import encode_rgba

SOURCE_URL = "https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_2048.jpg"
SOURCE_SHA256 = "daddaad84d7a33bbbc86cdda3f591099f57cee8607b7bcf3b67eb7e4f7a1c793"
SOURCE_BYTES = 829_367
COMPOSITE_URL = "https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57735/land_ocean_ice_cloud_2048.jpg"
COMPOSITE_SHA256 = "fb67ac030214c1891994c8f976e7f6c9cd5b0f21586aba8567250781a4fe708e"
COMPOSITE_BYTES = 593_729
DIMENSIONS = (2048, 1024)
OUTPUT_SHA256 = "82005bba2cec05b41137b766985d516eaf6b66ea045191d8869d45abd05f7995"
OUTPUT_BYTES = 1_911_552
PILLOW_VERSION = "12.2.0"

# Fit domain: rows 112..911 span about 70.3 degrees north to 70.3 degrees south, away
# from the polar thermal-infrared day; 24-pixel blocks need a cloud-free base.
ROWS = (112, 912)
BLOCK = 24
CLEAR_GREY = 3
MIN_CLEAR = 40
MIN_SIGNAL = 20
DARK_BASE = 0.25
MIN_SAMPLES = 30

OPACITY_LUT: tuple[int, ...] = (
      0,   0,   0,   1,   1,   1,   2,   2,   3,   3,   4,   4,   5,   6,   6,   7,
      8,   8,   9,  10,  10,  11,  12,  13,  14,  14,  15,  16,  17,  18,  19,  20,
     21,  22,  23,  25,  26,  27,  28,  29,  30,  32,  33,  34,  35,  37,  38,  39,
     40,  42,  43,  44,  46,  47,  48,  50,  51,  53,  53,  56,  57,  58,  60,  61,
     63,  66,  67,  68,  70,  70,  72,  74,  76,  77,  78,  81,  82,  83,  86,  86,
     89,  90,  90,  92,  94,  97,  97,  99, 101, 104, 104, 106, 108, 110, 111, 111,
    114, 115, 117, 119, 120, 122, 123, 126, 128, 129, 130, 133, 134, 135, 136, 139,
    139, 141, 141, 144, 146, 147, 147, 149, 149, 153, 154, 157, 157, 157, 160, 162,
    163, 163, 165, 166, 168, 170, 170, 173, 174, 174, 177, 177, 178, 178, 181, 182,
    183, 185, 185, 186, 188, 191, 191, 191, 193, 194, 195, 195, 198, 198, 200, 202,
    202, 202, 203, 203, 205, 209, 209, 209, 211, 211, 212, 212, 212, 214, 214, 215,
    215, 216, 216, 218, 218, 220, 220, 220, 220, 222, 223, 224, 224, 224, 226, 226,
    226, 228, 228, 228, 228, 233, 233, 234, 235, 235, 235, 235, 235, 235, 235, 235,
    235, 236, 237, 238, 240, 241, 243, 243, 243, 244, 244, 244, 245, 245, 245, 246,
    246, 246, 246, 247, 247, 247, 248, 248, 248, 249, 249, 249, 249, 250, 250, 250,
    251, 251, 251, 251, 252, 252, 252, 253, 253, 253, 254, 254, 254, 254, 255, 255,
)


def _decode(value: float) -> float:
    return value / 12.92 if value <= 0.04045 else ((value + 0.055) / 1.055) ** 2.4


def _encode(value: float) -> float:
    value = max(value, 0.0)
    return value * 12.92 if value <= 0.0031308 else 1.055 * value ** (1 / 2.4) - 0.055


DECODE_BYTE = tuple(_decode(index / 255) for index in range(256))


def cloud_rgba(image, lut: tuple[int, ...] | None = None) -> bytes:
    """Return white RGBA pixels whose alpha maps the neutral grey source byte."""
    from PIL import Image

    lut = OPACITY_LUT if lut is None else lut
    if len(lut) != 256:
        raise ValueError("opacity curve must map all 256 grey values")
    if image.mode != "RGB":
        raise ValueError("cloud source must decode as RGB")
    red, green, blue = image.split()
    if not red.tobytes() == green.tobytes() == blue.tobytes():
        raise ValueError("cloud source is not neutral grey")
    white = Image.new("L", image.size, 255)
    return Image.merge("RGBA", (white, white, white, red.point(list(lut)))).tobytes()


def opacity_blocks(grey: bytes, composite: bytes, width: int, height: int) -> list[dict]:
    """Blocks with a cloud-free base colour estimated from the composite's clear pixels."""
    if len(grey) != width * height or len(composite) != 3 * width * height:
        raise ValueError("cloud and composite grids differ")
    blocks = []
    for y in range(ROWS[0], min(ROWS[1], height), BLOCK):
        for x in range(0, width, BLOCK):
            pixels = []
            for row in range(y, min(y + BLOCK, height)):
                for column in range(x, min(x + BLOCK, width)):
                    index = row * width + column
                    pixels.append((grey[index], composite[3 * index], composite[3 * index + 1], composite[3 * index + 2]))
            clear = [pixel for pixel in pixels if pixel[0] < CLEAR_GREY]
            if len(clear) < MIN_CLEAR or sum(pixel[0] > 10 for pixel in pixels) < MIN_SIGNAL:
                continue
            base = tuple(median(pixel[channel] for pixel in clear) / 255 for channel in (1, 2, 3))
            blocks.append({"row": y // BLOCK, "column": x // BLOCK, "base": base, "pixels": pixels})
    return blocks


def fit_opacity(blocks: list[dict]) -> tuple[int, ...]:
    """Monotone opacity per grey value from dark-ocean blocks, as 8-bit alpha."""
    estimates: list[list[float]] = [[] for _ in range(256)]
    for block in blocks:
        if max(block["base"]) >= DARK_BASE:
            continue
        linear_base = [_decode(value) for value in block["base"]]
        for grey, *rgb in block["pixels"]:
            estimates[grey].append(sum((DECODE_BYTE[value] - base) / (1 - base) for value, base in zip(rgb, linear_base)) / 3)
    anchors = {grey: median(values) for grey, values in enumerate(estimates) if len(values) >= MIN_SAMPLES}
    anchors[0] = 0.0
    anchors.setdefault(255, 1.0)
    keys = sorted(anchors)
    curve = []
    for grey in range(256):
        right = next(key for key in keys if key >= grey)
        left = max(key for key in keys if key <= grey)
        curve.append(anchors[left] if left == right else anchors[left] + (anchors[right] - anchors[left]) * (grey - left) / (right - left))
    # Pool adjacent violators, weighted by sample count, then clip to [0, 1].
    pools = [[min(max(value, 0.0), 1.0), max(len(estimates[grey]), 1), 1] for grey, value in enumerate(curve)]
    index = 0
    while index < len(pools) - 1:
        if pools[index][0] > pools[index + 1][0]:
            (left_value, left_weight, left_size), (right_value, right_weight, right_size) = pools[index], pools[index + 1]
            weight = left_weight + right_weight
            pools[index:index + 2] = [[(left_value * left_weight + right_value * right_weight) / weight, weight, left_size + right_size]]
            index = max(index - 1, 0)
        else:
            index += 1
    fitted = [value for value, _, size in pools for _ in range(size)]
    return tuple(int(round(value * 255)) for value in fitted)


def opacity_error(blocks: list[dict], lut: tuple[int, ...]) -> dict:
    """Mean absolute encoded error (x255) of white-over-base linear mixing against the composite."""
    errors: dict[str, list[float]] = {"dark_ocean": [], "bright_land": [], "thin_haze": []}
    for block in blocks:
        linear_base = [_decode(value) for value in block["base"]]
        for name, admit in (("cloud", lambda grey: grey > 60), ("haze", lambda grey: 15 < grey < 45)):
            chosen = [pixel for pixel in block["pixels"] if admit(pixel[0])]
            if len(chosen) < 10:
                continue
            total = 0.0
            for grey, *rgb in chosen:
                alpha = lut[grey] / 255
                total += sum(abs(_encode(base * (1 - alpha) + alpha) - value / 255) for base, value in zip(linear_base, rgb)) / 3
            key = "thin_haze" if name == "haze" else "dark_ocean" if max(block["base"]) < DARK_BASE else "bright_land"
            errors[key].append(total / len(chosen))
    return {key: round(255 * sum(values) / len(values), 2) for key, values in errors.items() if values}


def opacity_evidence(grey: bytes, composite: bytes, width: int, height: int) -> dict:
    blocks = opacity_blocks(grey, composite, width, height)
    train = [block for block in blocks if (block["row"] + block["column"]) % 2 == 0]
    test = [block for block in blocks if (block["row"] + block["column"]) % 2 == 1]
    identity = tuple(range(256))
    return {
        "lut": fit_opacity(blocks),
        "blocks": len(blocks),
        "held_out_blocks": len(test),
        "held_out_error_alpha_equals_grey": opacity_error(test, identity),
        "held_out_error_fitted_on_other_blocks": opacity_error(test, fit_opacity(train)),
    }


def _verified(path: Path, sha256: str, size: int, label: str) -> None:
    data = path.read_bytes()
    if len(data) != size or hashlib.sha256(data).hexdigest() != sha256:
        raise ValueError(f"{label} bytes differ from the pinned NASA original")


def _pillow():
    try:
        import PIL
        from PIL import Image
    except ImportError as exc:
        raise RuntimeError(f"Pillow {PILLOW_VERSION} is required") from exc
    if PIL.__version__ != PILLOW_VERSION:
        raise RuntimeError(f"Pillow {PILLOW_VERSION} is required, found {PIL.__version__}")
    return Image


def _grey_source(source: Path):
    _verified(source, SOURCE_SHA256, SOURCE_BYTES, "cloud source")
    image = _pillow().open(source)
    image.load()
    if image.size != DIMENSIONS:
        raise ValueError("cloud source grid differs from the pinned 2048 by 1024 map")
    return image


def fit(source: Path, composite: Path) -> dict:
    image = _grey_source(source)
    _verified(composite, COMPOSITE_SHA256, COMPOSITE_BYTES, "composite")
    with _pillow().open(composite) as reference:
        reference.load()
        if reference.size != DIMENSIONS:
            raise ValueError("composite grid differs from the cloud source")
        rgb = reference.convert("RGB").tobytes()
    evidence = opacity_evidence(image.getchannel("R").tobytes(), rgb, *DIMENSIONS)
    image.close()
    if evidence["lut"] != OPACITY_LUT:
        raise ValueError("refitted opacity curve differs from the pinned OPACITY_LUT")
    return evidence


def prepare(source: Path, out: Path) -> dict:
    image = _grey_source(source)
    try:
        png = encode_rgba(*DIMENSIONS, cloud_rgba(image))
    finally:
        image.close()
    digest = hashlib.sha256(png).hexdigest()
    if len(png) != OUTPUT_BYTES or digest != OUTPUT_SHA256:
        raise ValueError(f"derived cloud layer differs from the pinned output: {digest}")
    if out.exists():
        raise FileExistsError(f"refusing to replace {out}")
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(png)
    return {"source_url": SOURCE_URL, "source_sha256": SOURCE_SHA256, "output": str(out), "sha256": digest, "bytes": len(png)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--fit-opacity", action="store_true")
    parser.add_argument("--composite", type=Path)
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    if args.fit_opacity == (args.out is not None) or args.fit_opacity != (args.composite is not None):
        parser.error("use either --out, or --fit-opacity with --composite")
    try:
        if args.fit_opacity:
            evidence = fit(args.source, args.composite)
            print(json.dumps({key: value for key, value in evidence.items() if key != "lut"}, indent=2))
            logging.info("refitted opacity curve matches OPACITY_LUT")
        else:
            result = prepare(args.source, args.out)
            logging.info("reproduced %s (%d bytes, %s)", result["output"], result["bytes"], result["sha256"])
    except (OSError, ValueError, RuntimeError) as exc:
        logging.error("%s", exc)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
