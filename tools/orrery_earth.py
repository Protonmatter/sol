"""Read-only Earth candidate verification and explicit disposable-checkout staging.

No network, subprocess, or application-default changes. Local evidence hashes
establish consistency, not independent authentication of a remote provider.
"""
from __future__ import annotations

from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import stat
from urllib.parse import parse_qsl, urlsplit, urlencode

from validate_snapshot import loads_strict

import fetch_earth_reference as earth
import validate_visual_assets as visual

RECIPE_ID = "earth-modis-terra-aqua.v1"
WEATHER_PATH = "textures/reference/earth-weather-daily.png"
INVENTORY_PATH = "apps/web/visual-assets.v1.json"
MODULE_PATH = "apps/web/js/visualAssetManifest.js"
GRID = {"crs": "EPSG:4326", "wms_version": "1.1.1", "bbox": [-180, -90, 180, 90],
        "dimensions": [2048, 1024], "north_up": True, "east_right": True}
DERIVATION = ("Preserve original RGB; published MODIS Data mask becomes alpha 255 and NoData becomes alpha 0. "
              "Terra has priority; same-date Aqua fills only missing Terra pixels. No interpolation, averaging or invented pixels.")


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def canonical(data: object) -> bytes:
    return json.dumps(data, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")


def _json(raw: bytes) -> dict:
    try:
        value = loads_strict(raw.decode("utf-8"))
        if not isinstance(value, dict):
            raise ValueError("JSON object required")
        return value
    except (UnicodeDecodeError, ValueError, RecursionError):
        # The shared loader includes offending values/keys in errors. Keep
        # untrusted candidate text out of operator logs, including deep inputs.
        raise ValueError("invalid candidate JSON") from None


def _safe_path(root: Path, relative: str = "") -> Path:
    root = root.absolute()
    path = root / relative
    if not path.absolute().is_relative_to(root) or ".." in Path(relative).parts:
        raise ValueError("candidate path escapes root")
    # Check ancestors before resolving; Windows junctions must not redirect writes.
    for part in (path, *path.parents):
        if part.is_symlink() or (part.exists() and getattr(part.lstat(), "st_file_attributes", 0) & stat.FILE_ATTRIBUTE_REPARSE_POINT):
            raise ValueError("symlinks and reparse points are not permitted")
    if not path.resolve().is_relative_to(root.resolve()):
        raise ValueError("candidate path escapes root")
    return path


def _read(root: Path, name: str, limit: int) -> bytes:
    path = _safe_path(root, name)
    if not path.is_file() or not 0 < path.stat().st_size <= limit:
        raise ValueError("missing or oversized candidate evidence: " + name)
    with path.open("rb") as handle:
        raw = handle.read(limit + 1)
    if not 0 < len(raw) <= limit:
        raise ValueError("oversized candidate evidence: " + name)
    return raw


def _map_url(layer: str, day: str) -> str:
    return earth.BASE + "?" + urlencode({"SERVICE": "WMS", "REQUEST": "GetMap", "VERSION": "1.1.1", "STYLES": "",
        "FORMAT": "image/png", "TRANSPARENT": "TRUE", "SRS": "EPSG:4326", "BBOX": "-180,-90,180,90",
        "WIDTH": "2048", "HEIGHT": "1024", "TIME": day, "LAYERS": layer})


def _same_url(actual: object, expected: str) -> bool:
    if not isinstance(actual, str):
        return False
    try:
        left, right = urlsplit(actual), urlsplit(expected)
        return ((left.scheme, left.netloc, left.path, left.fragment) == (right.scheme, right.netloc, right.path, right.fragment)
                and sorted(parse_qsl(left.query, keep_blank_values=True)) == sorted(parse_qsl(right.query, keep_blank_values=True)))
    except ValueError:
        return False


@dataclass(frozen=True)
class EarthCandidate:
    data_date: str
    sha256: str
    semantic_id: str
    manifest_sha256: str
    derived_bytes: bytes
    manifest: dict


def validate_candidate(path: Path, now: datetime) -> EarthCandidate:
    """Recompute every source/derived identity; never trust manifest status claims."""
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("validation requires a timezone-aware clock")
    now = now.astimezone(timezone.utc)
    raw_manifest = _read(Path(path), "earth-reference.json", 128 * 1024)
    manifest = _json(raw_manifest)
    try:
        day = earth.strict_date(manifest["data_date"])
        retrieved = datetime.fromisoformat(manifest["retrieved_at"])
        if retrieved.tzinfo is None or retrieved > now or day >= retrieved.astimezone(timezone.utc).date():
            raise ValueError("invalid retrieval clock")
        if not 1 <= (now.date() - day).days <= 3:
            raise ValueError("Earth data must be a prior UTC date no more than three days old")
        if (manifest["schema_version"] != "earth-reference.v1" or manifest["status"] != "review-required"
                or manifest["live"] is not False or manifest["global_observed_coverage"] is not False
                or canonical(manifest["grid"]) != canonical(GRID) or manifest["source_priority"] != ["Terra MODIS", "Aqua MODIS"]):
            raise ValueError("invalid Earth candidate recipe/grid")
        descriptors = [(manifest["original"], "weather-original.png", _map_url(earth.WEATHER, day.isoformat()), earth.MAX_IMAGE_BYTES),
            (manifest["mask"], "no-data-original.png", _map_url(earth.MASK, day.isoformat()), earth.MAX_IMAGE_BYTES),
            (manifest["palette"], "no-data-palette.xml", earth.PALETTE_URL, 64 * 1024),
            (manifest["aqua"]["original"], "aqua-weather-original.png", _map_url(earth.AQUA_WEATHER, day.isoformat()), earth.MAX_IMAGE_BYTES),
            (manifest["aqua"]["mask"], "aqua-no-data-original.png", _map_url(earth.AQUA_MASK, day.isoformat()), earth.MAX_IMAGE_BYTES),
            (manifest["capabilities"], "capabilities.xml", earth.CAPABILITIES_URL, 8 * 1024 * 1024),
            (manifest["derived"], "weather-rgba.png", None, earth.MAX_IMAGE_BYTES)]
        blobs = {}
        for evidence, name, url, limit in descriptors:
            if evidence["path"] != name or type(evidence["bytes"]) is not int:
                raise ValueError("invalid candidate evidence path/size")
            raw = _read(Path(path), name, limit)
            if len(raw) != evidence["bytes"] or digest(raw) != evidence["sha256"]:
                raise ValueError("candidate evidence hash/size mismatch: " + name)
            if url and (not _same_url(evidence["url"], url) or not _same_url(evidence["final_url"], url)):
                raise ValueError("candidate URL differs from pinned date/product/grid")
            blobs[name] = raw
        actual = {entry.name for entry in Path(path).iterdir()}
        if actual != {"earth-reference.json", *blobs}:
            raise ValueError("unexpected candidate evidence files")
        earth.select_day(blobs["capabilities.xml"], day.isoformat(), now.date(), aqua_fill=True)
        for name in ("weather-original.png", "no-data-original.png", "aqua-weather-original.png", "aqua-no-data-original.png"):
            if earth.decode_rgba(blobs[name])[:2] != (2048, 1024):
                raise ValueError("candidate source grid differs from pinned grid")
        terra, _ = earth.derive_weather_rgba(blobs["weather-original.png"], blobs["no-data-original.png"], blobs["no-data-palette.xml"])
        aqua, aqua_stats = earth.derive_weather_rgba(blobs["aqua-weather-original.png"], blobs["aqua-no-data-original.png"], blobs["no-data-palette.xml"])
        derived, coverage = earth.fill_weather_gaps(terra, aqua)
        if (derived != blobs["weather-rgba.png"] or canonical(coverage) != canonical(manifest["coverage"])
                or canonical(aqua_stats) != canonical(manifest["aqua"]["coverage"]) or coverage["valid_pixels"] == 0):
            raise ValueError("rederived pixels or coverage differ from candidate")
        semantic = {"recipe_id": RECIPE_ID, "data_date": day.isoformat(), "grid": GRID, "sha256": digest(derived),
                    "inputs": [{"url": url, "sha256": digest(blobs[name]), "bytes": len(blobs[name])}
                               for _, name, url, _ in descriptors[:5]]}
        return EarthCandidate(day.isoformat(), digest(derived), digest(canonical(semantic)), digest(raw_manifest), derived, manifest)
    except (KeyError, TypeError, AttributeError) as exc:
        raise ValueError("missing or malformed candidate evidence") from exc


def get_weather(inventory: dict) -> dict:
    records = [r for r in inventory.get("mapped_references", []) if r.get("body") == "Earth" and r.get("role") == "weather"]
    if len(records) != 1:
        raise ValueError("exactly one existing Earth weather record required")
    return records[0]


def _weather_day(record: dict) -> str:
    values = dict(parse_qsl(urlsplit(record["source_url"]).query)).get("TIME")
    if not isinstance(values, str):
        raise ValueError("weather record requires a dated source URL")
    return earth.strict_date(values).isoformat()


def _record(candidate: EarthCandidate, now: datetime) -> dict:
    m = candidate.manifest
    inputs = [m["original"], m["mask"], m["palette"], m["aqua"]["original"], m["aqua"]["mask"]]
    urls = [_map_url(earth.WEATHER, candidate.data_date), _map_url(earth.MASK, candidate.data_date), earth.PALETTE_URL,
            _map_url(earth.AQUA_WEATHER, candidate.data_date), _map_url(earth.AQUA_MASK, candidate.data_date)]
    return {"id": "earth-modis-weather-daily", "body": "Earth", "role": "weather", "path": WEATHER_PATH,
        "sha256": candidate.sha256, "bytes": len(candidate.derived_bytes), "dimensions": [2048, 1024],
        "label": "NASA satellite clouds and surface", "credits": "NASA Terra/Aqua MODIS / EOSDIS GIBS",
        "source_url": urls[0], "source_sha256": m["original"]["sha256"], "source_bytes": m["original"]["bytes"],
        "source_retrieved_at": m["retrieved_at"], "reviewed_at": None,
        "observation_label": candidate.data_date + " daily composite",
        "color_interpretation": "MODIS corrected-reflectance display RGB; not a cloud-only layer or calibrated albedo.",
        "limitations": "Dated Terra-priority/Aqua-fallback surface and cloud mosaic; overpasses differ within the same UTC day. "
                        "Seams and missing observations remain. No simultaneous observation, global completeness or live weather claim. "
                        "Missing areas show historical land; night lights are a separately dated annual reference.",
        "projection": "equirectangular", "mapping": {"primeMeridianU": .5, "longitudeDirection": "east",
            "latitudeType": "planetographic", "latitudeBounds": [-90, 90]}, "validLatitudeBounds": [-90, 90], "nodata": "alpha",
        "derivation": DERIVATION + " Coverage: " + json.dumps(m["coverage"], sort_keys=True),
        "derivation_inputs": [{"url": url, "sha256": item["sha256"], "bytes": item["bytes"]} for item, url in zip(inputs, urls)],
        "metadata_urls": ["https://nasa-gibs.github.io/gibs-api-docs/python-usage/#using-a-mask", earth.PALETTE_URL,
            "https://gibs.earthdata.nasa.gov/layer-metadata/v1.0/MODIS_Aqua_Data_No_Data.json"],
        "automated_refresh": {"recipe_id": RECIPE_ID, "validated_at": now.astimezone(timezone.utc).isoformat(),
            "data_date": candidate.data_date, "source_manifest_sha256": candidate.manifest_sha256, "semantic_id": candidate.semantic_id}}


def validate_inventory_transition(base_bytes: bytes, candidate_bytes: bytes, png_bytes: bytes, module_bytes: bytes) -> dict:
    """Independently constrain a committed inventory transition to its Earth record."""
    base, after = _json(base_bytes), _json(candidate_bytes)
    visual.validate_inventory(base); visual.validate_inventory(after)
    old, new = get_weather(base), get_weather(after)
    expected = deepcopy(base)
    expected["mapped_references"][base["mapped_references"].index(old)] = new
    if after != expected or new.get("automated_refresh", {}).get("recipe_id") != RECIPE_ID:
        raise ValueError("candidate changes more than the bounded Earth weather record")
    if _weather_day(new) < _weather_day(old):
        raise ValueError("Earth weather date rollback is forbidden")
    auto = new["automated_refresh"]
    inputs = new.get("derivation_inputs", [])
    if len(inputs) != 5 or auto["data_date"] != _weather_day(new):
        raise ValueError("machine recipe requires five bound same-date source inputs")
    prefix = DERIVATION + " Coverage: "
    if not new["derivation"].startswith(prefix):
        raise ValueError("machine recipe derivation differs from pinned algorithm")
    coverage = _json(new["derivation"][len(prefix):].encode())
    if (set(coverage) != {"valid_pixels", "no_data_pixels", "total_pixels", "terra_pixels", "aqua_fill_pixels"}
            or any(type(value) is not int or value < 0 for value in coverage.values())
            or coverage["total_pixels"] != 2048 * 1024 or coverage["valid_pixels"] == 0
            or coverage["valid_pixels"] + coverage["no_data_pixels"] != coverage["total_pixels"]
            or coverage["terra_pixels"] + coverage["aqua_fill_pixels"] != coverage["valid_pixels"]):
        raise ValueError("invalid machine recipe coverage")
    manifest = {"original": inputs[0], "mask": inputs[1], "palette": inputs[2],
                "aqua": {"original": inputs[3], "mask": inputs[4]}, "coverage": coverage,
                "retrieved_at": new["source_retrieved_at"]}
    semantic = {"recipe_id": RECIPE_ID, "data_date": auto["data_date"], "grid": GRID, "sha256": new["sha256"], "inputs": inputs}
    candidate = EarthCandidate(auto["data_date"], new["sha256"], digest(canonical(semantic)),
                               auto["source_manifest_sha256"], png_bytes, manifest)
    if new != _record(candidate, datetime.fromisoformat(auto["validated_at"])):
        raise ValueError("machine recipe record differs from pinned metadata/source identity")
    if (digest(png_bytes) != new["sha256"] or len(png_bytes) != new["bytes"]
            or earth.decode_rgba(png_bytes)[:2] != (2048, 1024)
            or module_bytes != visual.browser_module(after).encode("utf-8")):
        raise ValueError("candidate raster/module bytes differ from inventory")
    return new


def stage_candidate(checkout: Path, candidate_dir: Path, now: datetime, apply: bool = False) -> dict:
    """Preview by default. Apply only to an explicitly supplied disposable checkout."""
    candidate = validate_candidate(candidate_dir, now)
    root = Path(checkout)
    inventory_raw = _read(root, INVENTORY_PATH, 4 * 1024 * 1024)
    data = _json(inventory_raw); visual.validate_inventory(data)
    before = get_weather(data)
    if candidate.data_date < _weather_day(before):
        raise ValueError("Earth weather date rollback is forbidden")
    old_path = "apps/web/" + before["path"]
    if not re.fullmatch(r"apps/web/textures/reference/earth-weather-(?:\d{8}|daily)\.png", old_path):
        raise ValueError("existing weather path is not an admitted replacement target")
    old_raw = _read(root, old_path, earth.MAX_IMAGE_BYTES)
    if digest(old_raw) != before["sha256"] or len(old_raw) != before["bytes"]:
        raise ValueError("existing weather raster differs from inventory")
    module_raw = _read(root, MODULE_PATH, 4 * 1024 * 1024)
    if module_raw.replace(b"\r\n", b"\n") != visual.browser_module(data).encode():
        raise ValueError("existing browser module differs from inventory")
    after = _record(candidate, now)
    no_op = (before.get("automated_refresh", {}).get("semantic_id") == candidate.semantic_id
             and before["sha256"] == candidate.sha256 and before.get("derivation_inputs") == after["derivation_inputs"]
             and _weather_day(before) == candidate.data_date)
    if no_op:
        after = deepcopy(before)
    updated = deepcopy(data)
    updated["mapped_references"][data["mapped_references"].index(before)] = after
    inventory_after = (json.dumps(updated, indent=2, ensure_ascii=False) + "\n").encode("utf-8")
    module_after = visual.browser_module(updated).encode("utf-8")
    validate_inventory_transition(inventory_raw, inventory_after, candidate.derived_bytes, module_after)
    new_path = "apps/web/" + WEATHER_PATH
    writes = {} if no_op else {INVENTORY_PATH: inventory_after, MODULE_PATH: module_after, new_path: candidate.derived_bytes}
    if not no_op and old_path != new_path:
        if _safe_path(root, new_path).exists():
            raise ValueError("uninventoried daily target already exists")
        writes[old_path] = None
    before_hashes, after_hashes = {}, {}
    allowed_paths = sorted(writes)
    unchanged = []
    for name, raw in writes.items():
        target = _safe_path(root, name)
        before_hashes[name] = digest(target.read_bytes()) if target.exists() else None
        after_hashes[name] = digest(raw) if raw is not None else None
        if before_hashes[name] == after_hashes[name]:
            unchanged.append(name)
    for name in unchanged:
        del writes[name]
        del before_hashes[name]
        del after_hashes[name]
    result = {"state": "no-op" if no_op else "validated", "changed_paths": sorted(writes), "allowed_paths": allowed_paths,
        "data_date": candidate.data_date, "sha256": candidate.sha256, "semantic_id": candidate.semantic_id,
        "manifest_sha256": candidate.manifest_sha256,
        "before_weather": deepcopy(before), "after_weather": deepcopy(after),
        "before_weather_sha256": digest(canonical(before)), "after_weather_sha256": digest(canonical(after)),
        "file_hashes_before": before_hashes, "file_hashes_after": after_hashes}
    if apply:
        for name, raw in writes.items():
            target = _safe_path(root, name)
            if raw is None:
                target.unlink()
            else:
                target.write_bytes(raw)
    return result
