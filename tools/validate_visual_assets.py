"""Offline visual inventory gate. --require-qualified additionally rejects held assets.

No network access. --write-js regenerates only the browser copy after validation.
"""
from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import json
import math
from pathlib import Path
import re
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parents[1]
WEB = ROOT / "apps/web"
MANIFEST = WEB / "visual-assets.v1.json"
SDO_BASE = "https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_"
SDO_CHANNELS = {"continuum": "HMIIC.jpg", "magnetogram": "HMIB.jpg", "aia1700": "1700.jpg",
                "aia304": "0304.jpg", "aia171": "0171.jpg", "aia193": "0193.jpg", "aia211": "0211.jpg",
                "aia335": "0335.jpg", "aia131": "0131.jpg", "aia094": "0094.jpg"}
PROCEDURAL_IDS = {"earth-generated", "moon-generated", "surface-shaders", "galaxy-model", "solar-model", "ring-opacity-profile"} | {
    name + "-fallback" for name in ("titan", "mimas", "triton", "miranda", "ariel", "umbriel", "titania", "oberon", "deimos", "proteus", "nereid")}
OBSERVED_MAX_BYTES = 2_000_000
OBSERVED_ARCHIVE = re.compile(
    r"https://sdo\.gsfc\.nasa\.gov/assets/img/browse/(\d{4})/(\d{2})/(\d{2})/"
    r"(\d{8})_(\d{6})_1024_0171\.jpg"
)


def validate_color(fallback: dict) -> None:
    if not isinstance(fallback, dict) or not isinstance(fallback.get("label"), str) or not fallback["label"].strip():
        raise ValueError("missing fallback interpretation")
    rgb = fallback.get("rgb")
    if not isinstance(rgb, list) or len(rgb) != 3 or any(type(v) not in (int, float) or not math.isfinite(v) or not 0 <= v <= 1 for v in rgb):
        raise ValueError("invalid fallback RGB")


def validate_time(value: object) -> None:
    if value is None:
        return
    try:
        parsed = datetime.fromisoformat(value)
        if parsed.tzinfo is None:
            raise ValueError("time requires timezone")
    except (TypeError, ValueError) as exc:
        raise ValueError("invalid visual timestamp") from exc


def validate_mapping_evidence(asset: dict) -> None:
    """A status flag cannot substitute for the product-to-renderer coordinate review."""
    evidence = asset.get("mapping_evidence")
    if not isinstance(evidence, dict):
        raise ValueError("global mapping evidence missing")
    for field in ("mission", "instrument", "color_interpretation", "product_id"):
        if asset[field].lower().startswith("unknown"):
            raise ValueError("global mapping evidence requires known product interpretation")
    if evidence.get("asset_sha256") != asset["sha256"] or evidence.get("renderer_transform_verified") is not True:
        raise ValueError("global mapping evidence must bind reviewed bytes and renderer transform")
    if evidence.get("longitude_direction") not in {"east-positive", "west-positive"} or evidence.get("vertical_orientation") not in {"north-at-top", "south-at-top"}:
        raise ValueError("global mapping evidence requires image axis conventions")
    for field in ("coordinate_frame", "prime_meridian_definition", "renderer_transform", "color_processing", "coverage_interpretation"):
        if not isinstance(evidence.get(field), str) or not evidence[field].strip() or evidence[field].lower().startswith("unknown"):
            raise ValueError(f"global mapping evidence missing {field}")
    pixel = evidence.get("prime_meridian_u")
    if type(pixel) not in (int, float) or not math.isfinite(pixel) or not 0 <= pixel <= 1:
        raise ValueError("global mapping evidence requires prime-meridian pixel registration")
    sources = evidence.get("source_urls")
    if not isinstance(sources, list) or not sources:
        raise ValueError("global mapping evidence requires source references")
    for source in sources:
        parsed = urlparse(source)
        host = parsed.hostname or ""
        if parsed.scheme != "https" or not any(host == domain or host.endswith("." + domain) for domain in ("nasa.gov", "usgs.gov")):
            raise ValueError("global mapping evidence requires official source references")
    if not evidence.get("reviewed_at"):
        raise ValueError("global mapping evidence requires review epoch")
    validate_time(evidence["reviewed_at"])


def validate_inventory(data: dict, web_root: Path | None = None, *, require_qualified: bool = False) -> dict:
    if data.get("schema_version") != "visual-assets.v1" or not data.get("assets"):
        raise ValueError("invalid visual inventory schema")
    ids, paths = set(), set()
    for asset in data["assets"]:
        for field in ("id", "body", "path", "label", "credits", "source_url", "qualification_notes", "mission", "instrument", "color_interpretation", "derivation", "product_id"):
            if not isinstance(asset.get(field), str) or not asset[field].strip():
                raise ValueError(f"missing visual {field}")
        if asset["id"] in ids or asset["path"] in paths:
            raise ValueError("duplicate visual identity")
        ids.add(asset["id"])
        paths.add(asset["path"])
        if urlparse(asset["source_url"]).scheme != "https":
            raise ValueError("visual source requires HTTPS")
        if asset.get("projection") not in {"unknown", "equirectangular", "camera-disk", "radial-profile"}:
            raise ValueError("invalid visual projection")
        if asset.get("mapping_status") not in {"hold", "qualified"}:
            raise ValueError("invalid mapping status")
        coverage = asset.get("coverage", {})
        if not isinstance(coverage, dict) or coverage.get("status") not in {"unknown", "verified"}:
            raise ValueError("invalid coverage status")
        for field, low, high in (("latitude_deg", -90, 90), ("longitude_deg", -180, 360)):
            values = coverage.get(field)
            if coverage["status"] == "unknown":
                if values is not None:
                    raise ValueError("unknown coverage must not assert extents")
            elif not isinstance(values, list) or len(values) != 2 or any(type(v) not in (int, float) or not math.isfinite(v) for v in values) or not low <= values[0] < values[1] <= high or (field == "longitude_deg" and values[1] - values[0] > 360):
                raise ValueError("invalid coverage extents")
        validate_color(asset.get("fallback"))
        for field in ("observation_time", "original_retrieval_time"):
            if field not in asset:
                raise ValueError("missing visual timestamp field")
            validate_time(asset[field])
        path = Path(asset["path"])
        if path.is_absolute() or ".." in path.parts or not asset["path"].startswith("textures/"):
            raise ValueError("invalid visual path")
        if not re.fullmatch(r"[0-9a-f]{64}", asset.get("sha256", "")):
            raise ValueError("invalid visual SHA256")
        if type(asset.get("bytes")) is not int or asset["bytes"] <= 0:
            raise ValueError("invalid visual size")
        if web_root:
            file = web_root / path
            if file.is_symlink() or not file.is_file():
                raise ValueError("missing visual raster")
            raw = file.read_bytes()
            if hashlib.sha256(raw).hexdigest() != asset["sha256"] or len(raw) != asset["bytes"]:
                raise ValueError("visual bytes differ from inventory")
        identity = asset.get("source_identity", {})
        if identity.get("status") not in {"verified", "unverified"}:
            raise ValueError("invalid source identity status")
        if identity["status"] == "verified":
            evidence = identity.get("evidence") or {}
            host = urlparse(evidence.get("final_url", "")).hostname or ""
            if not any(host == d or host.endswith("." + d) for d in ("nasa.gov", "usgs.gov")):
                raise ValueError("verified imagery requires official source")
            if evidence.get("sha256") != asset["sha256"] or evidence.get("bytes") != asset["bytes"] or evidence.get("matches") is not True or not evidence.get("verified_at"):
                raise ValueError("source identity evidence mismatch")
            validate_time(evidence["verified_at"])
            if asset["source_url"] != evidence["final_url"]:
                raise ValueError("official preview source URL must match verified final URL")
        usages = asset.get("allowed_usages")
        if not isinstance(usages, list) or any(u not in {"browse-preview", "global-sphere", "observed-disk", "ring-profile"} for u in usages):
            raise ValueError("invalid visual usage")
        if usages and identity["status"] != "verified":
            raise ValueError("unverified release usage")
        if "global-sphere" in usages:
            c = asset.get("coverage", {})
            if c.get("status") != "verified" or c.get("latitude_deg") != [-90, 90] or c.get("longitude_deg") not in ([0, 360], [-180, 180]) or asset.get("projection") != "equirectangular" or asset.get("mapping_status") != "qualified":
                raise ValueError("global mapping requires qualified full coverage")
            validate_mapping_evidence(asset)
        if any(u in usages for u in ("observed-disk", "ring-profile")) and asset.get("mapping_status") != "qualified":
            raise ValueError("visual mapping not qualified")
        if "observed-disk" in usages and (asset["projection"] != "camera-disk" or asset["observation_time"] is None):
            raise ValueError("observed disk requires projection and observation epoch")
        if "ring-profile" in usages and asset["projection"] != "radial-profile":
            raise ValueError("ring profile requires radial projection")
        if require_qualified and asset.get("mapping_status") != "qualified":
            raise ValueError(f"visual qualification hold: {asset['id']}")
    if not isinstance(data.get("fallbacks"), dict) or "Titan" not in data["fallbacks"]:
        raise ValueError("required fallback inventory missing")
    for fallback in data["fallbacks"].values():
        validate_color(fallback)
    if not isinstance(data.get("procedural_assets"), list):
        raise ValueError("required procedural inventory missing")
    procedural_ids = set()
    for procedural in data["procedural_assets"]:
        if not isinstance(procedural, dict) or not isinstance(procedural.get("id"), str) or procedural["id"] in procedural_ids:
            raise ValueError("invalid procedural identity")
        procedural_ids.add(procedural["id"])
        if procedural.get("kind") not in {"procedural", "missing-detail"} or procedural.get("qualification") not in {"hold", "neutral-display"}:
            raise ValueError("invalid procedural qualification")
        if procedural["kind"] == "procedural":
            path = procedural.get("path", "")
            if not re.fullmatch(r"js/[A-Za-z0-9_]+\.js", path):
                raise ValueError("invalid procedural source path")
            if web_root and not (web_root / path).is_file():
                raise ValueError("missing procedural source file")
        if not isinstance(procedural.get("notes"), str) or not procedural["notes"].strip() or procedural.get("detail_allowed") is not False:
            raise ValueError("procedural detail requires separate qualification")
        if require_qualified and procedural.get("qualification") == "hold":
            raise ValueError("procedural visual qualification hold")
    if not PROCEDURAL_IDS.issubset(procedural_ids):
        raise ValueError("required procedural inventory incomplete")
    observed_ids, observed_paths = validate_observed_images(data, web_root)
    if ids & observed_ids or paths & observed_paths:
        raise ValueError("duplicate visual identity across raster collections")
    paths.update(observed_paths)
    reference_ids, reference_paths = validate_mapped_references(data, web_root)
    if (ids | observed_ids) & reference_ids or paths & reference_paths:
        raise ValueError("duplicate visual identity across raster collections")
    validate_dynamic_sources(data, web_root)
    if web_root:
        actual = {p.relative_to(web_root).as_posix() for p in (web_root / "textures").iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}}
        if actual != paths:
            raise ValueError("raster inventory incomplete")
    return data


MAPPED_REFERENCE_FIELDS = frozenset({"id", "body", "role", "path", "sha256", "bytes", "dimensions", "label", "credits",
    "source_url", "source_sha256", "source_bytes", "source_retrieved_at", "observation_label", "color_interpretation",
    "limitations", "projection", "mapping", "validLatitudeBounds", "nodata", "derivation", "metadata_urls", "reviewed_at"})
REFERENCE_ARCHIVES = frozenset({"archive.stsci.edu", "outerplanets.stsci.edu"})


def reference_url(value: object, *, metadata: bool = False) -> str:
    """Return an admitted public archive host; this does not fetch or authenticate bytes."""
    if not isinstance(value, str) or value != value.strip() or any(ord(char) < 32 or ord(char) == 127 for char in value):
        raise ValueError("mapped reference requires an official HTTPS URL")
    try:
        parsed = urlparse(value)
        host = parsed.hostname or ""
        official = any(host == domain or host.endswith("." + domain) for domain in ("nasa.gov", "usgs.gov"))
        if parsed.scheme != "https" or parsed.username or parsed.password or parsed.port not in (None, 443) or not (official or host in REFERENCE_ARCHIVES or (metadata and host == "nasa-gibs.github.io")):
            raise ValueError("unapproved archive")
    except ValueError as exc:
        raise ValueError("mapped reference requires an official HTTPS URL") from exc
    return host


def reference_latitudes(value: object) -> list[float]:
    if (not isinstance(value, list) or len(value) != 2
            or any(type(number) not in (int, float) or not math.isfinite(number) for number in value)
            or not -90 <= value[0] < value[1] <= 90):
        raise ValueError("invalid mapped reference latitude bounds")
    return value


def validate_reference_mapping(value: object) -> tuple[list[float], list[float], list[float]]:
    required = {"primeMeridianU", "longitudeDirection", "latitudeType", "latitudeBounds"}
    if not isinstance(value, dict) or not required.issubset(value) or set(value) - required - {"uvScale", "uvOffset"}:
        raise ValueError("invalid mapped reference mapping fields")
    prime = value["primeMeridianU"]
    if type(prime) not in (int, float) or not math.isfinite(prime) or not 0 <= prime <= 1:
        raise ValueError("invalid mapped reference prime meridian")
    if value["longitudeDirection"] not in ("east", "west") or value["latitudeType"] not in ("planetocentric", "planetographic", "parametric"):
        raise ValueError("invalid mapped reference coordinate convention")
    latitudes = reference_latitudes(value["latitudeBounds"])
    scale, offset = value.get("uvScale", [1, 1]), value.get("uvOffset", [0, 0])
    for field, pair in (("uvScale", scale), ("uvOffset", offset)):
        if (not isinstance(pair, list) or len(pair) != 2
                or any(type(number) not in (int, float) or not math.isfinite(number) for number in pair)
                or (field == "uvScale" and any(number <= 0 for number in pair))):
            raise ValueError(f"invalid mapped reference {field}")
    if any(not math.isfinite(origin + extent) or origin >= 1 or origin + extent <= 0 for origin, extent in zip(offset, scale)):
        raise ValueError("mapped reference UV grid does not overlap its image")
    return latitudes, scale, offset


def reference_raster_dimensions(raw: bytes, suffix: str, nodata: str) -> list[int]:
    if suffix in {".jpg", ".jpeg"}:
        if nodata == "alpha":
            raise ValueError("mapped reference alpha nodata requires an alpha raster")
        return jpeg_dimensions(raw)
    if suffix == ".png" and len(raw) >= 33 and raw[:8] == b"\x89PNG\r\n\x1a\n" and raw[8:16] == b"\0\0\0\rIHDR":
        # RGBA/grayscale-alpha are explicit alpha products. Palette transparency
        # needs a separate reviewed conversion rather than inferred RGB nodata.
        if nodata == "alpha" and raw[25] not in {4, 6}:
            raise ValueError("mapped reference alpha nodata requires an alpha raster")
        return [int.from_bytes(raw[16:20], "big"), int.from_bytes(raw[20:24], "big")]
    raise ValueError("mapped reference raster format or dimensions unavailable")


def validate_reference_legend(value: object, web_root: Path | None) -> None:
    """Bind a same-origin original provider palette, separately from data pixels."""
    if not isinstance(value, dict) or set(value) != {"path", "sha256", "bytes", "dimensions", "source_url"}:
        raise ValueError("invalid mapped reference legend fields")
    if not isinstance(value["path"], str) or not re.fullmatch(r"images/[A-Za-z0-9][A-Za-z0-9._-]*\.png", value["path"]):
        raise ValueError("invalid mapped reference legend path")
    if not isinstance(value["sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", value["sha256"]):
        raise ValueError("invalid mapped reference legend SHA256")
    if type(value["bytes"]) is not int or value["bytes"] <= 0:
        raise ValueError("invalid mapped reference legend byte count")
    dimensions = value["dimensions"]
    if not isinstance(dimensions, list) or len(dimensions) != 2 or any(type(number) is not int or number <= 0 for number in dimensions):
        raise ValueError("invalid mapped reference legend dimensions")
    reference_url(value["source_url"])
    if web_root:
        file = web_root / value["path"]
        if file.is_symlink() or not file.is_file() or not file.resolve().is_relative_to(web_root.resolve()):
            raise ValueError("missing mapped reference legend")
        raw = file.read_bytes()
        if len(raw) != value["bytes"] or hashlib.sha256(raw).hexdigest() != value["sha256"]:
            raise ValueError("mapped reference legend bytes differ from inventory")
        if reference_raster_dimensions(raw, file.suffix, "none") != dimensions:
            raise ValueError("mapped reference legend dimensions differ from inventory")


def validate_earth_layer_grids(references: list[dict]) -> None:
    """Cross-record admission after field validation: Earth layers share shader UVs."""
    auxiliary = [item for item in references if item["role"] != "surface"]
    if not auxiliary:
        return
    if any(item["body"] != "Earth" for item in auxiliary):
        raise ValueError("mapped reference auxiliary roles are only supported for Earth")
    base = next((item for item in references if item["body"] == "Earth" and item["role"] == "surface"), None)
    if base is None:
        raise ValueError("mapped reference auxiliary layers require an Earth surface reference")
    base_mapping = base["mapping"]
    # A prime meridian at u=1 is equivalent to u=0 after the shader's fract().
    base_grid = (base["projection"], base_mapping["primeMeridianU"] % 1,
                 base_mapping["longitudeDirection"], base_mapping["latitudeType"])
    for item in [base, *auxiliary]:
        mapping = item["mapping"]
        if mapping["latitudeBounds"] != [-90, 90] or item["validLatitudeBounds"] != [-90, 90]:
            raise ValueError("Earth auxiliary rendering requires full latitude grid and valid bounds")
        # Night/ice lookups intentionally omit the affine window. A shared but
        # nonidentity window would therefore still misregister those layers.
        if mapping.get("uvScale", [1, 1]) != [1, 1] or mapping.get("uvOffset", [0, 0]) != [0, 0]:
            raise ValueError("Earth auxiliary rendering requires an identity image window")
        grid = (item["projection"], mapping["primeMeridianU"] % 1, mapping["longitudeDirection"], mapping["latitudeType"])
        if grid != base_grid:
            raise ValueError("Earth auxiliary mapping grid differs from the surface reference")
        if item["role"] != "surface" and item["nodata"] != {"night-lights": "none", "cloud-composite": "none", "weather": "alpha", "sea-ice": "alpha"}[item["role"]]:
            raise ValueError("Earth auxiliary nodata policy is incompatible with its shader role")


def validate_mapped_references(data: dict, web_root: Path | None = None) -> tuple[set[str], set[str]]:
    """Admit dated reference layers separately; never upgrade legacy surface holds."""
    references = data.get("mapped_references", [])
    if not isinstance(references, list):
        raise ValueError("invalid mapped reference collection")
    ids, paths, roles = set(), set(), set()
    for reference in references:
        if not isinstance(reference, dict) or not MAPPED_REFERENCE_FIELDS.issubset(reference) or set(reference) - MAPPED_REFERENCE_FIELDS - {"derivation_inputs", "legend", "moon_color_mode"}:
            raise ValueError("invalid mapped reference fields")
        for field in ("id", "body", "label", "credits", "observation_label", "color_interpretation", "limitations", "derivation"):
            if not isinstance(reference[field], str) or not reference[field].strip():
                raise ValueError(f"missing mapped reference {field}")
        if reference["role"] not in ("surface", "night-lights", "cloud-composite", "weather", "sea-ice"):
            raise ValueError("invalid mapped reference role")
        # Only Io's reviewed RGB product is admitted to the new moon material.
        # A label, filename or generic image mode cannot silently enable color.
        if "moon_color_mode" in reference and (reference["moon_color_mode"] != "source-rgb"
                or reference["body"] != "Io" or reference["role"] != "surface"):
            raise ValueError("invalid or unsupported mapped reference moon color mode")
        if "legend" in reference:
            if reference["role"] != "sea-ice":
                raise ValueError("mapped reference legend requires the sea-ice role")
            validate_reference_legend(reference["legend"], web_root)
        if not isinstance(reference["path"], str) or not re.fullmatch(r"textures/reference/[A-Za-z0-9][A-Za-z0-9._-]*\.(?:jpg|jpeg|png)", reference["path"]):
            raise ValueError("invalid mapped reference path")
        role = (reference["body"], reference["role"])
        if reference["id"] in ids or reference["path"] in paths or role in roles:
            raise ValueError("duplicate mapped reference identity or body role")
        ids.add(reference["id"]); paths.add(reference["path"]); roles.add(role)
        if reference["projection"] != "equirectangular" or reference["nodata"] not in ("none", "black", "alpha"):
            raise ValueError("invalid mapped reference projection or nodata")
        latitudes, _, _ = validate_reference_mapping(reference["mapping"])
        valid = reference_latitudes(reference["validLatitudeBounds"])
        if valid[0] < latitudes[0] or valid[1] > latitudes[1]:
            raise ValueError("mapped reference valid coverage exceeds its source grid")
        for field in ("sha256", "source_sha256"):
            if not isinstance(reference[field], str) or not re.fullmatch(r"[0-9a-f]{64}", reference[field]):
                raise ValueError("invalid mapped reference SHA256")
        for field in ("bytes", "source_bytes"):
            if type(reference[field]) is not int or reference[field] <= 0:
                raise ValueError("invalid mapped reference byte count")
        if reference["sha256"] == reference["source_sha256"] and reference["bytes"] != reference["source_bytes"]:
            raise ValueError("mapped reference identical source hash has inconsistent size")
        if reference["sha256"] != reference["source_sha256"] and reference["derivation"].strip().lower() in {"none", "identity", "original", "original bytes"}:
            raise ValueError("mapped reference derived bytes require their processing description")
        dimensions = reference["dimensions"]
        if not isinstance(dimensions, list) or len(dimensions) != 2 or any(type(number) is not int or number <= 0 for number in dimensions):
            raise ValueError("invalid mapped reference dimensions")
        stamps = []
        for field in ("source_retrieved_at", "reviewed_at"):
            if not isinstance(reference[field], str) or not reference[field]:
                raise ValueError("mapped reference timestamp requires an explicit timezone")
            validate_time(reference[field])
            stamps.append(datetime.fromisoformat(reference[field]))
        if stamps[1] < stamps[0]:
            raise ValueError("mapped reference review precedes source retrieval")
        if not re.search(r"\b[12]\d{3}\b", reference["observation_label"]):
            raise ValueError("mapped reference observation label requires a source date or range")
        if re.search(r"\b(?:live|real[ -]?time|current|today|now)\b", reference["label"] + " " + reference["observation_label"], re.I):
            raise ValueError("mapped reference cannot claim current observations")
        host = reference_url(reference["source_url"])
        metadata = reference["metadata_urls"]
        if not isinstance(metadata, list) or not metadata:
            raise ValueError("mapped reference requires official product metadata")
        metadata_hosts = [reference_url(url, metadata=True) for url in metadata]
        source_hosts = [host]
        if "derivation_inputs" in reference:
            inputs = reference["derivation_inputs"]
            if not isinstance(inputs, list) or not inputs:
                raise ValueError("mapped reference derivation inputs must be a nonempty list")
            input_urls = set()
            primary = False
            for item in inputs:
                if not isinstance(item, dict) or set(item) != {"url", "sha256", "bytes"}:
                    raise ValueError("invalid mapped reference derivation input")
                source_hosts.append(reference_url(item["url"]))
                if item["url"] in input_urls or not isinstance(item["sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", item["sha256"]) or type(item["bytes"]) is not int or item["bytes"] <= 0:
                    raise ValueError("invalid mapped reference derivation input identity")
                input_urls.add(item["url"])
                primary |= item == {"url": reference["source_url"], "sha256": reference["source_sha256"], "bytes": reference["source_bytes"]}
            if not primary:
                raise ValueError("mapped reference derivation inputs omit its bound primary source")
        if any(name in REFERENCE_ARCHIVES for name in source_hosts) and not any(name == "nasa.gov" or name.endswith(".nasa.gov") for name in metadata_hosts):
            raise ValueError("mapped reference STScI archive requires NASA mission evidence")
        if web_root:
            file = web_root / reference["path"]
            if file.is_symlink() or not file.is_file() or not file.resolve().is_relative_to(web_root.resolve()):
                raise ValueError("missing mapped reference raster")
            raw = file.read_bytes()
            if len(raw) != reference["bytes"] or hashlib.sha256(raw).hexdigest() != reference["sha256"]:
                raise ValueError("mapped reference bytes differ from inventory")
            if reference_raster_dimensions(raw, file.suffix, reference["nodata"]) != dimensions:
                raise ValueError("mapped reference dimensions differ from inventory")
    validate_earth_layer_grids(references)
    if web_root:
        directory = web_root / "textures/reference"
        if directory.is_symlink() or any(file.is_symlink() for file in directory.rglob("*")):
            raise ValueError("mapped reference symlinks are not permitted")
        actual = {file.relative_to(web_root).as_posix() for file in directory.rglob("*") if file.is_file()}
        if actual != paths:
            raise ValueError("mapped reference raster inventory incomplete")
    return ids, paths


def jpeg_dimensions(raw: bytes) -> list[int]:
    """Read the stored frame dimensions without decoding or altering image pixels."""
    if not raw.startswith(b"\xff\xd8\xff"):
        raise ValueError("observed image requires original JPEG bytes")
    offset = 2
    while offset + 4 <= len(raw):
        if raw[offset] != 0xFF:
            break
        marker = raw[offset + 1]
        length = int.from_bytes(raw[offset + 2:offset + 4], "big")
        if length < 2 or offset + 2 + length > len(raw):
            break
        if marker in {0xC0, 0xC1, 0xC2} and length >= 8:
            return [int.from_bytes(raw[offset + 7:offset + 9], "big"),
                    int.from_bytes(raw[offset + 5:offset + 7], "big")]
        if marker in {0xDA, 0xD9}:
            break
        offset += 2 + length
    raise ValueError("observed image JPEG dimensions unavailable")


def observed_utc(value: object) -> datetime:
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z", value):
        raise ValueError("observed image timestamp requires explicit UTC")
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("invalid observed image timestamp") from exc


def validate_observed_images(data: dict, web_root: Path | None = None) -> tuple[set[str], set[str]]:
    """Admit pinned SDO browse stills only for their original image-plane display."""
    images = data.get("observed_images")
    if not isinstance(images, list) or not images:
        raise ValueError("required observed image inventory missing")
    ids, paths = set(), set()
    for observed in images:
        if not isinstance(observed, dict):
            raise ValueError("invalid observed image record")
        for field in ("id", "label", "source_url", "path", "credits", "interpretation", "derivation", "limits"):
            if not isinstance(observed.get(field), str) or not observed[field].strip():
                raise ValueError(f"missing observed image {field}")
        if observed["id"] in ids or observed["path"] in paths:
            raise ValueError("duplicate observed image identity")
        ids.add(observed["id"])
        paths.add(observed["path"])
        if not re.fullmatch(r"textures/[a-z0-9-]+\.jpg", observed["path"]):
            raise ValueError("invalid observed image path")
        match = OBSERVED_ARCHIVE.fullmatch(observed["source_url"])
        if not match or "".join(match.group(1, 2, 3)) != match.group(4):
            raise ValueError("observed image requires dated official SDO AIA171 archive source")
        product_time = observed_utc(
            f"{match[1]}-{match[2]}-{match[3]}T{match[5][:2]}:{match[5][2:4]}:{match[5][4:]}Z")
        if (observed.get("mission") != "SDO" or observed.get("instrument") != "AIA"
                or observed.get("wavelength_angstrom") != 171 or observed.get("is_false_color") is not True):
            raise ValueError("invalid observed image instrument or spectral interpretation")
        if (observed.get("status") != "archival" or observed.get("source_policy") != "official-pinned-archive"
                or observed.get("projection") != "camera-disk" or observed.get("allowed_usages") != ["observed-image"]
                or observed.get("registration_verified") is not False or observed.get("global_mapping_allowed") is not False
                or observed.get("scientific_analysis_allowed") is not False):
            raise ValueError("invalid observed image use policy")
        coverage = observed.get("coverage")
        if coverage != {"status": "unknown", "latitude_deg": None, "longitude_deg": None}:
            raise ValueError("observed image does not establish heliographic map coverage")
        retrieved = observed_utc(observed.get("retrieved_at"))
        if retrieved < product_time:
            raise ValueError("observed image retrieval precedes archive product")
        evidence = observed.get("capture_time_evidence")
        if "captured_at" not in observed or not isinstance(evidence, dict):
            raise ValueError("missing observed image capture evidence")
        if observed["captured_at"] is None:
            if evidence != {"status": "unknown", "caption": None}:
                raise ValueError("unknown capture must retain unknown evidence")
        elif (observed_utc(observed["captured_at"]) != product_time or evidence.get("status") != "verified"
              or evidence.get("caption") != f"SDO/AIA 171 {product_time:%Y-%m-%d %H:%M:%S} UT"):
            raise ValueError("observed image capture must bind original caption and archive filename")
        digest, size = observed.get("sha256"), observed.get("bytes")
        if not isinstance(digest, str) or not re.fullmatch(r"[0-9a-f]{64}", digest):
            raise ValueError("invalid observed image SHA256")
        if type(size) is not int or not 0 < size <= OBSERVED_MAX_BYTES:
            raise ValueError("invalid observed image size")
        identity = observed.get("source_identity")
        if not isinstance(identity, dict) or identity.get("status") != "verified":
            raise ValueError("observed image requires verified source identity")
        verified = identity.get("evidence")
        if (not isinstance(verified, dict) or verified.get("final_url") != observed["source_url"]
                or verified.get("sha256") != digest or verified.get("bytes") != size
                or verified.get("matches") is not True or verified.get("verified_at") != observed["retrieved_at"]):
            raise ValueError("observed image source identity evidence mismatch")
        sources = observed.get("metadata_sources")
        if not isinstance(sources, list) or not sources:
            raise ValueError("observed image requires metadata sources")
        for source in sources:
            if not isinstance(source, str):
                raise ValueError("invalid observed image metadata source")
            parsed = urlparse(source)
            if (parsed.scheme != "https" or parsed.username or parsed.password
                    or not (parsed.hostname or "").endswith(".nasa.gov")):
                raise ValueError("observed image metadata requires official NASA source")
        if observed.get("dimensions") != [1024, 1024]:
            raise ValueError("invalid observed image dimensions")
        if web_root:
            file = web_root / observed["path"]
            if file.is_symlink() or not file.is_file() or not file.resolve().is_relative_to(web_root.resolve()):
                raise ValueError("missing observed image raster")
            if file.stat().st_size != size:
                raise ValueError("observed image bytes differ from inventory")
            raw = file.read_bytes()
            if hashlib.sha256(raw).hexdigest() != digest:
                raise ValueError("observed image bytes differ from inventory")
            if jpeg_dimensions(raw) != observed["dimensions"]:
                raise ValueError("observed image dimensions differ from inventory")
    return ids, paths


def validate_dynamic_sources(data: dict, web_root: Path | None = None) -> None:
    sources = data.get("dynamic_sources")
    if not isinstance(sources, list) or len(sources) != len(SDO_CHANNELS):
        raise ValueError("required dynamic source inventory missing")
    channels = {}
    for source in sources:
        channel = source.get("channel")
        if channel not in SDO_CHANNELS or channel in channels:
            raise ValueError("invalid dynamic source channel")
        url = source.get("source_url")
        if url != SDO_BASE + SDO_CHANNELS[channel]:
            raise ValueError("unapproved dynamic source URL")
        channels[channel] = url
        expected_instrument = "HMI" if channel in {"continuum", "magnetogram"} else "AIA"
        if source.get("mission") != "SDO" or source.get("instrument") != expected_instrument or source.get("id") != "sdo-" + channel:
            raise ValueError("invalid dynamic mission identity")
        for field in ("spectral_interpretation", "product_identity", "credits", "limits"):
            if not isinstance(source.get(field), str) or not source[field].strip():
                raise ValueError("missing dynamic source interpretation")
        if source.get("source_policy") != "official-mutable-browse" or source.get("allowed_usages") != ["observed-disk"] or source.get("registration_verified") is not False or source.get("global_mapping_allowed") is not False:
            raise ValueError("invalid dynamic source use policy")
        if "capture_time" not in source or source["capture_time"] is not None or "content_sha256" not in source or source["content_sha256"] is not None:
            raise ValueError("mutable stream cannot claim pinned capture or hash")
    if web_root:
        config = (web_root / "js/config.js").read_text(encoding="utf-8")
        prefix = re.search(r'const SDO = "([^"]+)";', config)
        block = re.search(r'export const BASE_IMAGES = \{(.*?)\n\};', config, re.S)
        if not prefix or not block:
            raise ValueError("cannot verify dynamic image config")
        entries = re.findall(r'(\w+):\s*\{ url: SDO \+ "([^"]+)"', block[1])
        declared = {key: prefix[1] + suffix for key, suffix in entries}
        if declared != channels or len(entries) != len(channels):
            raise ValueError("dynamic source config parity mismatch")


def browser_module(data: dict) -> str:
    return "// Generated by tools/validate_visual_assets.py --write-js.\nexport const visualAssetManifest = " + json.dumps(data, separators=(",", ":")) + ";\n"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--require-qualified", action="store_true")
    parser.add_argument("--write-js", action="store_true")
    args = parser.parse_args()
    data = validate_inventory(json.loads(MANIFEST.read_text(encoding="utf-8")), WEB, require_qualified=args.require_qualified)
    generated = WEB / "js/visualAssetManifest.js"
    expected = browser_module(data)
    if args.write_js:
        generated.write_text(expected, encoding="utf-8")
    elif generated.read_text(encoding="utf-8") != expected:
        raise ValueError("browser visual inventory drift; run --write-js")
    verified = sum(a["source_identity"]["status"] == "verified" for a in data["assets"])
    print(f"Visual inventory valid: {len(data['assets'])} legacy surface rasters; {verified} official legacy surface byte identities; "
          f"{len(data['observed_images'])} pinned observed images; {len(data.get('mapped_references', []))} dated mapped reference layers; "
          "legacy surface qualification holds remain.")


if __name__ == "__main__":
    main()
