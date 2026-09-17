#!/usr/bin/env python3
"""Fetch dated NASA MODIS references and their documented data/no-data masks.

Explicit operator workflow, standard library only; no imports perform network I/O.
  python tools/fetch_earth_reference.py --date 2026-09-12 --out build/earth-reference-20260912
  python tools/fetch_earth_reference.py --latest-prior-day --out build/earth-reference-review
  python tools/fetch_earth_reference.py --date 2026-09-12 --aqua-fill --out build/earth-reference-paired

Outputs original PNGs, capabilities, mask palette, an RGB-preserving alpha
derivative, and hashes in a new directory beneath build/. Existing directories
are never refreshed in place. Exit0 means acquired for review, not approved or
live. Exit1 means rejected or unavailable. No production manifest is changed.
The previous UTC day may still have gaps or later provider revisions.

Mask semantics: https://nasa-gibs.github.io/gibs-api-docs/python-usage/#using-a-mask
Palette: https://gibs.earthdata.nasa.gov/colormaps/v1.3/MODIS_Data_No_Data.xml
"""
from __future__ import annotations

import argparse
from datetime import date, datetime, timedelta, timezone
import hashlib
import json
import logging
from pathlib import Path
import re
import struct
import tempfile
from typing import Callable
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zlib

ROOT = Path(__file__).resolve().parents[1]
BASE = "https://gibs.earthdata.nasa.gov/wms/epsg4326/best/wms.cgi"
CAPABILITIES_URL = BASE + "?SERVICE=WMS&REQUEST=GetCapabilities&VERSION=1.1.1"
PALETTE_URL = "https://gibs.earthdata.nasa.gov/colormaps/v1.3/MODIS_Data_No_Data.xml"
WEATHER = "MODIS_Terra_CorrectedReflectance_TrueColor"
MASK = "MODIS_Terra_Data_No_Data"
AQUA_WEATHER = "MODIS_Aqua_CorrectedReflectance_TrueColor"
AQUA_MASK = "MODIS_Aqua_Data_No_Data"
PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
TIMEOUT_SECONDS = 45
MAX_IMAGE_BYTES = 24 * 1024 * 1024
Fetch = Callable[[str, int], tuple[bytes, dict]]


def check_source_url(url: str) -> None:
    parsed = urllib.parse.urlsplit(url)
    if (parsed.scheme != "https" or parsed.hostname != "gibs.earthdata.nasa.gov"
            or parsed.username or parsed.password or parsed.port not in (None, 443)):
        raise ValueError("Earth references require the fixed NASA GIBS HTTPS host")


class NasaRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Keep provider redirects on the source host before making another request."""

    def redirect_request(self, req, fp, code, msg, headers, newurl):
        check_source_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def download(url: str, limit: int) -> tuple[bytes, dict]:
    check_source_url(url)
    request = urllib.request.Request(url, headers={"User-Agent": "SOL-Earth-reference-review/1.0"})
    with urllib.request.build_opener(NasaRedirectHandler()).open(request, timeout=TIMEOUT_SECONDS) as response:
        check_source_url(response.url)
        if response.status != 200:
            raise ValueError("NASA reference returned an unsuccessful HTTP status")
        size = response.headers.get("Content-Length")
        if size is not None and (not size.isdigit() or int(size) > limit):
            raise ValueError("NASA reference exceeds the download size limit")
        data = response.read(limit + 1)
        if len(data) > limit or (size is not None and len(data) != int(size)):
            raise ValueError("NASA reference is oversized or its HTTP body is incomplete")
        return data, {"url": url, "final_url": response.url,
                      "content_type": response.headers.get("Content-Type"),
                      "http_last_modified": response.headers.get("Last-Modified")}


def strict_date(value: str) -> date:
    if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        raise ValueError("Reference dates must use YYYY-MM-DD")
    return date.fromisoformat(value)


def layer_intervals(capabilities: bytes, name: str) -> list[tuple[date, date]]:
    try:
        root = ET.fromstring(capabilities)
        matching = [layer for layer in root.iter("Layer") if layer.findtext("Name") == name]
        if len(matching) != 1 or "EPSG:4326" not in [srs.text for srs in matching[0].findall("SRS")]:
            raise ValueError("Required geographic NASA layer is absent or ambiguous")
        extent = matching[0].find("Extent[@name='time']")
        if extent is None or not extent.text:
            raise ValueError("NASA layer does not advertise dated availability")
        intervals = []
        for item in extent.text.split(","):
            fields = item.strip().split("/")
            if len(fields) == 1:
                start = end = strict_date(fields[0])
            elif len(fields) == 3 and fields[2] == "P1D":
                start, end = strict_date(fields[0]), strict_date(fields[1])
            else:
                raise ValueError("Unsupported NASA time interval")
            if end < start:
                raise ValueError("NASA time interval is reversed")
            intervals.append((start, end))
        return intervals
    except ET.ParseError as exc:
        raise ValueError("NASA capabilities are not valid XML") from exc


def select_day(capabilities: bytes, requested: str, today: date, *, aqua_fill: bool = False) -> date:
    cutoff = today - timedelta(days=1)
    common = [(date.min, cutoff)]
    for layer in ([WEATHER, MASK, AQUA_WEATHER, AQUA_MASK] if aqua_fill else [WEATHER, MASK]):
        intervals = layer_intervals(capabilities, layer)
        common = [(max(a, c), min(b, d)) for a, b in common for c, d in intervals if max(a, c) <= min(b, d)]
    if requested == "previous-day":
        if not common:
            raise ValueError("No common date for all requested NASA images and masks before today")
        return max(end for _, end in common)
    chosen = strict_date(requested)
    if not any(start <= chosen <= end for start, end in common):
        raise ValueError("Requested day is unavailable for every requested layer or is today/future")
    return chosen


def decode_rgba(data: bytes) -> tuple[int, int, bytes]:
    """Decode only the bounded, non-interlaced RGB+A8 PNG contract GIBS returns.

    Reject other encodings instead of silently changing their color meaning.
    CRCs, decompressed size, stream termination and scanline filters are checked.
    """
    if not data.startswith(PNG_SIGNATURE):
        raise ValueError("NASA image is not a PNG")
    cursor, width, height = 8, 0, 0
    compressed = bytearray()
    ended = False
    while cursor + 12 <= len(data):
        length = struct.unpack_from(">I", data, cursor)[0]
        kind = data[cursor + 4:cursor + 8]
        end = cursor + length + 12
        if end > len(data):
            raise ValueError("Truncated PNG chunk")
        payload = data[cursor + 8:end - 4]
        if zlib.crc32(kind + payload) != struct.unpack_from(">I", data, end - 4)[0]:
            raise ValueError("PNG checksum mismatch")
        if kind == b"IHDR":
            if cursor != 8 or length != 13:
                raise ValueError("Invalid PNG image header")
            width, height, depth, color, method, filtering, interlace = struct.unpack(">IIBBBBB", payload)
            if not (1 <= width <= 4096 and 1 <= height <= 2048) or (depth, color, method, filtering, interlace) != (8, 6, 0, 0, 0):
                raise ValueError("Unsupported PNG size or RGB+A8 encoding")
        elif kind == b"IDAT" and width:
            compressed.extend(payload)
        elif kind == b"IEND" and length == 0 and compressed:
            ended = True
            cursor = end
            break
        elif not kind or not (kind[0] & 32):
            raise ValueError("Unsupported PNG critical chunk")
        cursor = end
    if not ended or cursor != len(data):
        raise ValueError("PNG stream is incomplete or has trailing content")
    stride = width * 4
    expected = (stride + 1) * height
    try:
        stream = zlib.decompressobj()
        raw = stream.decompress(bytes(compressed), expected + 1)
        if len(raw) != expected or not stream.eof or stream.unused_data or stream.unconsumed_tail:
            raise ValueError("PNG decompressed size differs from the declared grid")
    except zlib.error as exc:
        raise ValueError("Invalid PNG compressed image") from exc
    pixels = bytearray(stride * height)
    previous = bytearray(stride)
    for y in range(height):
        offset = y * (stride + 1)
        filter_type = raw[offset]
        row = bytearray(raw[offset + 1:offset + 1 + stride])
        if filter_type > 4:
            raise ValueError("Unsupported PNG scanline filter")
        if filter_type:
            for x in range(stride):
                left = row[x - 4] if x >= 4 else 0
                above, upper_left = previous[x], previous[x - 4] if x >= 4 else 0
                if filter_type == 1:
                    predictor = left
                elif filter_type == 2:
                    predictor = above
                elif filter_type == 3:
                    predictor = (left + above) // 2
                else:
                    value = left + above - upper_left
                    a, b, c = abs(value - left), abs(value - above), abs(value - upper_left)
                    predictor = left if a <= b and a <= c else (above if b <= c else upper_left)
                row[x] = (row[x] + predictor) & 255
        pixels[y * stride:(y + 1) * stride] = row
        previous = row
    return width, height, bytes(pixels)


def encode_rgba(width: int, height: int, pixels: bytes) -> bytes:
    def chunk(kind: bytes, payload: bytes) -> bytes:
        return struct.pack(">I", len(payload)) + kind + payload + struct.pack(">I", zlib.crc32(kind + payload))
    stride = width * 4
    if len(pixels) != stride * height:
        raise ValueError("Derived pixels do not fit the declared grid")
    raw = b"".join(b"\0" + pixels[y * stride:(y + 1) * stride] for y in range(height))
    return PNG_SIGNATURE + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)) + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")


def derive_weather_rgba(weather: bytes, mask: bytes, palette: bytes) -> tuple[bytes, dict]:
    try:
        entries = ET.fromstring(palette).findall(".//ColorMapEntry")
    except ET.ParseError as exc:
        raise ValueError("NASA mask palette is not valid XML") from exc
    semantics = {(entry.get("sourceValue"), entry.get("rgb"), entry.get("transparent"), entry.get("nodata", "false")) for entry in entries}
    if len(entries) != 2 or semantics != {("1", "202,170,86", "false", "true"), ("0", "0,0,0", "true", "false")}:
        raise ValueError("NASA mask class semantics differ from the reviewed palette")
    width, height, rgb = decode_rgba(weather)
    mask_width, mask_height, validity = decode_rgba(mask)
    if (width, height) != (mask_width, mask_height):
        raise ValueError("Weather and validity mask grids differ")
    out = bytearray(rgb)
    valid_count = 0
    for offset in range(0, len(rgb), 4):
        cell = validity[offset:offset + 4]
        if cell == b"\0\0\0\0":
            out[offset + 3] = 255
            valid_count += 1
        elif cell == bytes((202, 170, 86, 255)):
            out[offset + 3] = 0
        else:
            raise ValueError("NASA mask has an unknown or interpolated class")
    stats = {"valid_pixels": valid_count, "no_data_pixels": width * height - valid_count, "total_pixels": width * height}
    return encode_rgba(width, height, bytes(out)), stats


def fill_weather_gaps(terra: bytes, aqua: bytes) -> tuple[bytes, dict]:
    """Select source pixels from two already mask-qualified, co-registered grids.

    Terra has priority even when its valid RGB is black. Aqua replaces a pixel
    only when Terra has no data and Aqua has data. No averages or spatial fills.
    """
    width, height, first = decode_rgba(terra)
    second_width, second_height, second = decode_rgba(aqua)
    if (width, height) != (second_width, second_height):
        raise ValueError("Terra and Aqua reference grids differ")
    out = bytearray(first)
    terra_pixels = aqua_pixels = 0
    for offset in range(0, len(first), 4):
        if first[offset + 3] not in (0, 255) or second[offset + 3] not in (0, 255):
            raise ValueError("Reference merge requires binary source validity")
        if first[offset + 3] == 255:
            terra_pixels += 1
        elif second[offset + 3] == 255:
            out[offset:offset + 4] = second[offset:offset + 4]
            aqua_pixels += 1
    valid = terra_pixels + aqua_pixels
    return encode_rgba(width, height, bytes(out)), {
        "valid_pixels": valid, "no_data_pixels": width * height - valid, "total_pixels": width * height,
        "terra_pixels": terra_pixels, "aqua_fill_pixels": aqua_pixels,
    }


def refresh(output: Path, requested: str, width: int, now: datetime,
            *, build_root: Path = ROOT / "build", fetcher: Fetch = download, aqua_fill: bool = False) -> Path:
    output, build_root = output.resolve(), build_root.resolve()
    if output == build_root or not output.is_relative_to(build_root) or output.exists():
        raise ValueError("Output must be a new review directory beneath build/")
    if width not in (2048, 4096) or now.tzinfo is None:
        raise ValueError("Reference requires width2048/4096 and a timezone-aware retrieval clock")
    now = now.astimezone(timezone.utc)
    if requested != "previous-day" and strict_date(requested) >= now.date():
        raise ValueError("Reference date must be strictly before today in UTC")
    capabilities, caps_metadata = fetcher(CAPABILITIES_URL, 8 * 1024 * 1024)
    day = select_day(capabilities, requested, now.date(), aqua_fill=aqua_fill)
    params = {"SERVICE": "WMS", "REQUEST": "GetMap", "VERSION": "1.1.1", "STYLES": "",
              "FORMAT": "image/png", "TRANSPARENT": "TRUE", "SRS": "EPSG:4326", "BBOX": "-180,-90,180,90",
              "WIDTH": str(width), "HEIGHT": str(width // 2), "TIME": day.isoformat()}
    weather, weather_metadata = fetcher(BASE + "?" + urllib.parse.urlencode({**params, "LAYERS": WEATHER}), MAX_IMAGE_BYTES)
    mask, mask_metadata = fetcher(BASE + "?" + urllib.parse.urlencode({**params, "LAYERS": MASK}), MAX_IMAGE_BYTES)
    palette, palette_metadata = fetcher(PALETTE_URL, 64 * 1024)
    if decode_rgba(weather)[:2] != (width, width // 2):
        raise ValueError("NASA image dimensions differ from the requested grid")
    derived, stats = derive_weather_rgba(weather, mask, palette)
    additional_files = []
    def evidence(name: str, data: bytes, source: dict | None = None) -> dict:
        return {"path": name, "sha256": hashlib.sha256(data).hexdigest(), "bytes": len(data), **(source or {})}
    manifest = {"schema_version": "earth-reference.v1", "status": "review-required", "live": False,
                "data_date": day.isoformat(), "retrieved_at": now.isoformat(), "date_selection": requested,
                "global_observed_coverage": False, "grid": {"crs": "EPSG:4326", "wms_version": "1.1.1", "bbox": [-180, -90, 180, 90], "dimensions": [width, width // 2], "north_up": True, "east_right": True},
                "original": evidence("weather-original.png", weather, weather_metadata),
                "mask": evidence("no-data-original.png", mask, mask_metadata),
                "palette": evidence("no-data-palette.xml", palette, palette_metadata),
                "capabilities": evidence("capabilities.xml", capabilities, caps_metadata),
                "derived": evidence("weather-rgba.png", derived), "coverage": stats,
                "derivation": "Preserve each original decoded RGB value. Set alpha255 for published mask Data(0,0,0,0), alpha0 for NoData(202,170,86,255). Reject other classes. No inferred cloud pixels or black-color threshold.",
                "interpretation": "Dated Terra MODIS corrected-reflectance mosaic; surface and clouds, missing observations transparent. Neither live weather nor a cloud-only measurement. Previous-day selection does not establish global completeness.",
                "source_references": ["https://nasa-gibs.github.io/gibs-api-docs/python-usage/#using-a-mask", PALETTE_URL]}
    if aqua_fill:
        aqua, aqua_metadata = fetcher(BASE + "?" + urllib.parse.urlencode({**params, "LAYERS": AQUA_WEATHER}), MAX_IMAGE_BYTES)
        aqua_mask, aqua_mask_metadata = fetcher(BASE + "?" + urllib.parse.urlencode({**params, "LAYERS": AQUA_MASK}), MAX_IMAGE_BYTES)
        aqua_derived, aqua_stats = derive_weather_rgba(aqua, aqua_mask, palette)
        derived, stats = fill_weather_gaps(derived, aqua_derived)
        manifest["aqua"] = {"original": evidence("aqua-weather-original.png", aqua, aqua_metadata),
                            "mask": evidence("aqua-no-data-original.png", aqua_mask, aqua_mask_metadata),
                            "coverage": aqua_stats}
        manifest["source_priority"] = ["Terra MODIS", "Aqua MODIS"]
        manifest["derived"] = evidence("weather-rgba.png", derived)
        manifest["coverage"] = stats
        manifest["derivation"] += " Same-date Aqua fills only pixels where Terra's published mask is NoData and Aqua's mask is Data. Retain Terra at overlap, including valid black RGB. No averaging, cloud motion extrapolation or interpolation. Both missing stays transparent."
        manifest["interpretation"] = "Dated Terra-priority/Aqua-fallback MODIS corrected-reflectance composite; different overpass times on the same UTC day. Surface and clouds, not simultaneous or live weather. Seams and remaining gaps are retained; no global completeness claim."
        manifest["source_references"] += ["https://gibs.earthdata.nasa.gov/layer-metadata/v1.0/MODIS_Aqua_Data_No_Data.json"]
        additional_files = [("aqua-weather-original.png", aqua), ("aqua-no-data-original.png", aqua_mask)]
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(prefix=".earth-reference-", dir=output.parent) as temporary:
        staging = Path(temporary)
        for name, data in [("weather-original.png", weather), ("no-data-original.png", mask),
                           ("no-data-palette.xml", palette), ("capabilities.xml", capabilities), ("weather-rgba.png", derived), *additional_files]:
            (staging / name).write_bytes(data)
        (staging / "earth-reference.json").write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")
        if output.exists():
            raise ValueError("Review output appeared during acquisition; preserve it")
        staging.rename(output)
    return output / "earth-reference.json"


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    selection = parser.add_mutually_exclusive_group(required=True)
    selection.add_argument("--date", help="Pinned prior UTC day, YYYY-MM-DD")
    selection.add_argument("--latest-prior-day", action="store_true", help="Latest common image/mask date strictly before UTC today")
    parser.add_argument("--out", type=Path, required=True, help="New ignored review directory beneath build/")
    parser.add_argument("--width", type=int, choices=(2048, 4096), default=2048)
    parser.add_argument("--aqua-fill", action="store_true", help="Fill only missing Terra pixels with same-day mask-valid Aqua pixels")
    args = parser.parse_args(argv)
    logging.basicConfig(level=logging.INFO, format="%(levelname)s: %(message)s")
    try:
        result = refresh(args.out, args.date or "previous-day", args.width, datetime.now(timezone.utc), aqua_fill=args.aqua_fill)
        logging.info("Earth reference acquired for review: %s", result)
        return 0
    except (ValueError, OSError) as exc:
        logging.error("Earth reference rejected: %s", exc)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
