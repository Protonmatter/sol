#!/usr/bin/env python3
"""Reproduce the pinned educational solar reference from local NASA originals.

Offline by default. Inputs are fixed JP2/XML files documented in SOLAR_SOURCES.md.
No network calls, dependency installation, runtime hook or mutable source pointer.
Pillow 12.2.0 is required for decoding and BOX area resampling. Output must be a
new directory under build/. Exit 0 means reproduced, 1 rejected, 2 CLI misuse.
"""
from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import json
import logging
import math
from pathlib import Path
import shutil
import tempfile
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
PILLOW_VERSION = "12.2.0"
MAX_BYTES = 8_000_000
MAX_HEADER_BYTES = 30_000
SOURCES = (
    ("120009", "156611963", "2c49076995696cbafd77b00289d66452266210f59d1f4f07c327200984207903",
     "4fe0c23018743fe661e791fd2f7ded7793821c446c445fb2c07c10c40aa05725"),
    ("121957", "156612438", "79bcae5c5b931db234eb5f75dd058af566bb1264e1a0184d154147e9fb261525",
     "64ea4070602ccee349fcfbe817344287c467ff6d59b9dbf320b0d9f1e3bd9663"),
)
ATLAS_PATH = "textures/solar/aia171-20240510-reference-atlas.png"
# Hashes are checked after the first admitted derivation, before publishing it.
ATLAS_SHA256 = "f05f77184be4c1ed7f7630ba0ca49d8899f13a1bcdaabd4bd3c7d3bd65f97f8b"


def verify_source(path: Path, expected_hash: str) -> bytes:
    """Bound and hash source bytes before any image decoder receives them."""
    if not path.is_file() or not 0 < path.stat().st_size <= MAX_BYTES:
        raise ValueError(f"Missing or oversized source: {path.name}")
    raw = path.read_bytes()
    if hashlib.sha256(raw).hexdigest() != expected_hash:
        raise ValueError(f"Source identity mismatch: {path.name}")
    return raw


def embedded_header(raw: bytes) -> bytes:
    """Extract the bounded XML box, retaining the JP2-to-metadata association."""
    offset = 0
    while offset + 8 <= len(raw):
        size = int.from_bytes(raw[offset:offset+4], "big")
        kind = raw[offset+4:offset+8]
        header_size = 8
        if size == 1:
            if offset+16 > len(raw):
                raise ValueError("Truncated JP2 extended box")
            size = int.from_bytes(raw[offset+8:offset+16], "big")
            header_size = 16
        elif size == 0:
            size = len(raw)-offset
        if size < header_size or offset+size > len(raw):
            raise ValueError("Invalid JP2 box size")
        if kind == b"xml ":
            if size-header_size > MAX_HEADER_BYTES:
                raise ValueError("Oversized embedded JP2 metadata")
            # These pinned JP2 XML boxes carry one C-string terminator; the
            # separately served header omits it. Never remove interior bytes.
            return raw[offset+header_size:offset+size].removesuffix(b"\0")
        offset += size
    raise ValueError("JP2 has no embedded FITS metadata")


def parse_header(raw: bytes) -> dict:
    """Admit only the pinned AIA north-up tangent-plane recipe; never guess WCS."""
    if not 0 < len(raw) <= MAX_HEADER_BYTES or b"<!" in raw:
        raise ValueError("Unsupported or oversized XML header")
    try:
        fits = ET.fromstring(raw).find("fits")
    except ET.ParseError as exc:
        raise ValueError("Malformed solar header") from exc
    if fits is None:
        raise ValueError("Missing FITS geometry")

    def text(name: str) -> str:
        value = fits.findtext(name)
        if value is None:
            raise ValueError(f"Missing FITS {name}")
        return value.strip()

    def number(name: str) -> float:
        try:
            value = float(text(name))
        except ValueError as exc:
            raise ValueError(f"Invalid FITS {name}") from exc
        if not math.isfinite(value):
            raise ValueError(f"Nonfinite FITS {name}")
        return value

    for name, expected in (("TELESCOP", "SDO"), ("CTYPE1", "HPLN-TAN"),
                           ("CTYPE2", "HPLT-TAN"), ("CUNIT1", "arcsec"), ("CUNIT2", "arcsec")):
        if text(name) != expected:
            raise ValueError(f"Unsupported FITS {name}")
    for name, expected in (("WAVELNTH", 171), ("NAXIS1", 4096), ("NAXIS2", 4096),
                           ("CROTA2", 0), ("CRVAL1", 0), ("CRVAL2", 0),
                           ("MISSVALS", 0), ("LVL_NUM", 1.5)):
        if number(name) != expected:
            raise ValueError(f"Unsupported FITS {name}")
    crpix = [number("CRPIX1"), number("CRPIX2")]
    cdelt = [number("CDELT1"), number("CDELT2")]
    longitude, latitude = number("CRLN_OBS"), number("CRLT_OBS")
    distance, radius, radius_pixels = number("DSUN_OBS"), number("RSUN_REF"), number("R_SUN")
    quality = number("QUALITY")
    if (not all(1 <= v <= 4096 for v in crpix) or not all(.5 <= v <= .7 for v in cdelt)
            or not 0 <= longitude < 360 or not -8 <= latitude <= 8
            or not 100 < distance/radius < 300 or not 1500 <= radius_pixels <= 1700
            or quality != 1073741824):
        raise ValueError("Solar header geometry/quality outside pinned recipe")
    observed = text("DATE-OBS")
    try:
        dt = datetime.fromisoformat(observed.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("Invalid source observation time") from exc
    if dt.year != 2024 or dt.month != 5 or dt.day != 10:
        raise ValueError("Observation outside the pinned reference interval")
    return {"observed_at": observed if observed.endswith("Z") else observed + "Z",
            "wavelength_angstrom": 171, "quality_word": int(quality),
            "wcs": {"dimensions": [4096, 4096], "crpix": crpix,
                    "cdelt_arcsec": cdelt, "longitude_deg": longitude,
                    "latitude_deg": latitude, "observer_distance_m": distance,
                    "solar_reference_radius_m": radius, "radius_pixels": radius_pixels,
                    "projection": "HPLN-TAN/HPLT-TAN", "rotation_deg": 0}}


def dot(a: list, b: list) -> float:
    return sum(x*y for x, y in zip(a, b))


def basis(wcs: dict) -> tuple[list, list, list]:
    longitude, latitude = (math.radians(wcs[name]) for name in ("longitude_deg", "latitude_deg"))
    cl, sl, cb, sb = math.cos(longitude), math.sin(longitude), math.cos(latitude), math.sin(latitude)
    return [-sl, cl, 0], [-sb*cl, -sb*sl, cb], [cb*cl, cb*sl, sb]


def pixel_to_surface(x: float, y: float, size: int, frame: dict) -> list | None:
    """Finite-distance inverse TAN projection, in Carrington Cartesian axes."""
    wcs = frame["wcs"]
    right, up, axis = basis(wcs)
    distance = wcs["observer_distance_m"] / wcs["solar_reference_radius_m"]
    rad2sec = 180*3600/math.pi
    image_x = ((x+.5)*4096/size-wcs["crpix"][0]+.5)*wcs["cdelt_arcsec"][0]/rad2sec
    image_y = ((1-(y+.5)/size)*4096-wcs["crpix"][1]+.5)*wcs["cdelt_arcsec"][1]/rad2sec
    direction = [image_x*right[i]+image_y*up[i]-axis[i] for i in range(3)]
    length = math.sqrt(dot(direction, direction))
    direction = [v/length for v in direction]
    origin = [v*distance for v in axis]
    b = dot(origin, direction)
    discriminant = b*b-dot(origin, origin)+1
    if discriminant < 0:
        return None
    t = -b-math.sqrt(discriminant)
    if t <= 0:
        return None
    point = [origin[i]+t*direction[i] for i in range(3)]
    # The analytically unit sphere intersection loses ~1e-11 in the distant
    # observer subtraction. Normalize that roundoff before forming local bases.
    point_length = math.sqrt(dot(point, point))
    return [v/point_length for v in point]


def model_loops(image, frame: dict) -> list:
    """Select separated source-brightness anchors; geometry remains explicitly modeled."""
    from PIL import Image
    small = image.resize((128, 128), Image.Resampling.BOX)
    pixels = small.load()
    assert pixels is not None
    r0, u0, a0 = basis(frame["wcs"])
    candidates = []
    for y in range(8, 120):
        for x in range(8, 120):
            point = pixel_to_surface(x, y, 128, frame)
            if point is None or dot(point, a0) < .3:
                continue
            intensity = sum(pixels[x+dx, y+dy] for dx in (-1, 0, 1) for dy in (-1, 0, 1))/9
            candidates.append((-intensity, y, x, point))
    candidates.sort()
    anchors = []
    for neg_intensity, y, x, point in candidates:
        if any(dot(point, old[3]) > math.cos(.38) for old in anchors):
            continue
        anchors.append((neg_intensity, y, x, point))
        if len(anchors) == 6:
            break
    if len(anchors) != 6:
        raise ValueError("Insufficient separated source-brightness anchors")
    loops = []
    for i, (neg_intensity, y, x, point) in enumerate(anchors):
        normal = [dot(point, v) for v in (r0, u0, a0)]
        # Reference frame axes are image-right, image-up, toward frame-0 observer.
        north = [dot([0, 0, 1], v) for v in (r0, u0, a0)]
        tangent = [north[1]*normal[2]-north[2]*normal[1],
                   north[2]*normal[0]-north[0]*normal[2],
                   north[0]*normal[1]-north[1]*normal[0]]
        tangent_length = math.sqrt(dot(tangent, tangent))
        tangent = [v/tangent_length for v in tangent]
        cross = [normal[1]*tangent[2]-normal[2]*tangent[1],
                 normal[2]*tangent[0]-normal[0]*tangent[2],
                 normal[0]*tangent[1]-normal[1]*tangent[0]]
        angle = math.radians(20+27*i)
        tangent = [tangent[j]*math.cos(angle)+cross[j]*math.sin(angle) for j in range(3)]
        for strand in range(2):
            loops.append({"normal": normal, "tangent": tangent,
                          "radius": .15+.055*strand, "width": .008+.002*strand,
                          "gain": round(-neg_intensity/255, 8),
                          "source_anchor_pixel_128": [x, y]})
    return loops


def derive(source_root: Path, out: Path) -> dict:
    import PIL
    from PIL import Image
    if PIL.__version__ != PILLOW_VERSION:
        raise ValueError(f"Pillow {PILLOW_VERSION} required; found {PIL.__version__}")
    atlas = Image.new("L", (2048, 1024))
    frames = []
    for index, (stamp, identifier, image_hash, header_hash) in enumerate(SOURCES):
        name = f"aia171-20240510-{stamp}"
        image_path, header_path = source_root/f"{name}.jp2", source_root/f"{name}-header.xml"
        original = verify_source(image_path, image_hash)
        header = verify_source(header_path, header_hash)
        frame = parse_header(header)
        if parse_header(embedded_header(original)) != frame:
            raise ValueError("External metadata does not match the pinned JP2 image")
        with Image.open(image_path) as image:
            if image.mode != "L" or image.size != (4096, 4096):
                raise ValueError("Source image format/geometry mismatch")
            image.load()
            reference = image.resize((1024, 1024), Image.Resampling.BOX)
        atlas.paste(reference, (index*1024, 0))
        frame.update({"image_id": identifier, "original_sha256": image_hash,
                      "original_bytes": len(original), "header_sha256": header_hash,
                      "source_url": f"https://api.helioviewer.org/v2/getJP2Image/?date=2024-05-10T{stamp[:2]}:{stamp[2:4]}:{stamp[4:]}Z&sourceId=10",
                      "metadata_url": f"https://api.helioviewer.org/v2/getJP2Header/?id={identifier}"})
        frames.append(frame)
        if index == 0:
            loops = model_loops(reference, frame)
    target = out/ATLAS_PATH
    target.parent.mkdir(parents=True, exist_ok=True)
    atlas.save(target, format="PNG", optimize=False, compress_level=9)
    digest = hashlib.sha256(target.read_bytes()).hexdigest()
    if digest != ATLAS_SHA256:
        raise ValueError(f"Derived atlas mismatch: {digest}")
    manifest = {
        "schema_version": "solar-appearance.v1", "id": "sdo-aia171-20240510-two-frame-reference",
        "label": "AIA 171 reference + modeled corona", "status": "educational-reconstruction",
        "credits": "Courtesy of NASA/SDO and the AIA, EVE, and HMI science teams.",
        "color_interpretation": "SOL gold false-color EUV display ramp; not visible-light color or calibrated radiance",
        "source_kind": "NASA SDO Level 1.5-derived JP2 display intensity via ESA/NASA Helioviewer",
        "atlas": {"path": ATLAS_PATH, "sha256": digest, "bytes": target.stat().st_size,
                  "dimensions": [2048, 1024], "channels": "grayscale intensity", "frame_dimensions": [1024, 1024],
                  "resampling": "Pillow 12.2.0 BOX area average; no recoloring, sharpening or synthetic source detail"},
        "frames": frames, "far_side": "unavailable", "surface_min_mu": .12, "surface_full_mu": .2,
        "reference_frame": "Frame-0 observer: +X image west/right, +Y image north/up, +Z toward observer; no IAU W assumption",
        "surface_interpretation": "Finite-distance source projection onto reference photosphere; coronal depth is not recovered; off-limb pixels excluded",
        "playback": {"duration_seconds": 20, "loop": False, "interpolation": "linear display intensity; intermediate frames are not observations",
                     "reduced_motion": "Model flow phase held at zero; explicit source scrubbing retained"},
        "geometry": {"status": "modeled-reference", "model": "source-anchored circular arcade emissivity v1",
                     "extent_solar_radii": 1.35, "ray_samples": 32, "loops": loops,
                     "limits": "Anchors derive from source brightness only; arc shape, height, orientation, width, gain and flow are educational model parameters, not measured magnetic connectivity, PFSS or MHD"},
    }
    (out/"solar-appearance.v1.json").write_text(json.dumps(manifest, indent=2)+"\n", encoding="utf-8", newline="\n")
    (out/"js").mkdir(exist_ok=True)
    (out/"js/solarAppearanceManifest.js").write_text(
        "// Generated by tools/prepare_solar_appearance.py; source and model qualifications are separate.\n"
        +"export const solarAppearanceManifest = "+json.dumps(manifest, separators=(",", ":"))+";\n",
        encoding="utf-8", newline="\n")
    try:
        from .validate_physical_assets import validate_physical_source
    except ImportError:  # Executed directly as an operator preparation command.
        from validate_physical_assets import validate_physical_source
    validate_physical_source(out)
    return manifest


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    out = args.out.resolve()
    build = (ROOT/"build").resolve()
    try:
        if not out.is_relative_to(build) or out == build or out.exists():
            raise ValueError("Output must be a new directory below build/")
        out.parent.mkdir(parents=True, exist_ok=True)
        temp = Path(tempfile.mkdtemp(prefix="solar-reference-", dir=build))
        try:
            manifest = derive(args.source_root.resolve(), temp)
            temp.rename(out)
        finally:
            if temp.exists():
                shutil.rmtree(temp)
        logging.info("Reproduced %s; atlas SHA-256 %s", out, manifest["atlas"]["sha256"])
        print(json.dumps({"output": str(out), "atlas": manifest["atlas"]}))
        return 0
    except (ValueError, OSError, ImportError) as exc:
        logging.error("Solar reference rejected: %s", exc)
        return 1


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    raise SystemExit(main())
