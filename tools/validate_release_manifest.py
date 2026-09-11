"""Validate immutable static-site bytes without executing assets or using a network."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
from pathlib import Path, PurePosixPath
from typing import Any

VERSION = "web-release-manifest.v1"
SHA256 = re.compile(r"[0-9a-f]{64}\Z")
RELEASE_ID = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}\Z")


def digest(path: Path) -> str:
    with path.open("rb") as handle:
        return hashlib.file_digest(handle, "sha256").hexdigest()


def relative_path(value: Any) -> str:
    if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9._~/-]+", value):
        raise ValueError("invalid relative asset path")
    if PurePosixPath(value).is_absolute() or any(part in ("", ".", "..") for part in value.split("/")):
        raise ValueError("asset path must remain relative to site root")
    return value


def base_path(value: Any) -> str:
    if value == "/":
        return value
    if not isinstance(value, str) or not value.startswith("/") or not value.endswith("/"):
        raise ValueError("base_path must be an absolute URL path ending in slash")
    relative_path(value[1:-1])
    return value


def load_json(path: Path) -> dict:
    def unique(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"duplicate JSON key: {key}")
            result[key] = value
        return result
    if path.stat().st_size > 16 * 1024 * 1024:
        raise ValueError("manifest exceeds size limit")
    data = json.loads(path.read_text(encoding="utf-8"), object_pairs_hook=unique,
                      parse_constant=lambda value: (_ for _ in ()).throw(ValueError(f"invalid JSON number {value}")))
    if not isinstance(data, dict):
        raise ValueError("manifest must be an object")
    return data


def validate_data(data: dict, root: Path) -> dict:
    import jsonschema_min
    schema = json.loads((Path(__file__).resolve().parents[1] / "docs/web-release-manifest-v1.schema.json").read_text(encoding="utf-8"))
    errors = jsonschema_min.validate(data, schema)
    if errors:
        raise ValueError("manifest schema: " + "; ".join(errors))
    release = data.get("release_id", "")
    if not isinstance(release, str) or not RELEASE_ID.fullmatch(release):
        raise ValueError("invalid release_id")
    namespace = f"releases/{release}/"
    if data.get("namespace") != namespace:
        raise ValueError("release namespace mismatch")
    base_path(data.get("base_path"))
    if not re.fullmatch(r"[0-9a-f]{40}", str(data.get("source_sha", ""))):
        raise ValueError("invalid source_sha")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+", str(data.get("repository", ""))):
        raise ValueError("invalid repository")
    assets = data.get("assets")
    if len(assets) > 100_000:
        raise ValueError("invalid asset inventory")
    root = root.resolve()
    listed: set[str] = set()
    folded: set[str] = set()
    for asset in assets:
        name = relative_path(asset.get("path"))
        if name.casefold() in folded:
            raise ValueError("duplicate/case-colliding asset path")
        listed.add(name)
        folded.add(name.casefold())
        if type(asset.get("size")) is not int or asset["size"] < 0 or not SHA256.fullmatch(str(asset.get("sha256", ""))):
            raise ValueError("invalid asset size/digest")
        file = root / name
        if any(parent.is_symlink() for parent in (file, *file.parents)):
            raise ValueError("symlink assets are not permitted")
        if not file.resolve().is_relative_to(root) or not file.is_file():
            raise ValueError("missing or escaped asset path")
        if file.stat().st_size != asset["size"] or digest(file) != asset["sha256"]:
            raise ValueError(f"asset size/digest mismatch: {name}")
        if "source_path" in asset:
            relative_path(asset["source_path"])
            if not asset["source_path"].startswith("apps/web/") or not SHA256.fullmatch(str(asset.get("source_sha256", ""))):
                raise ValueError("invalid coverage source identity")
    actual = set()
    for file in root.rglob("*"):
        if file.is_symlink():
            raise ValueError("symlink in artifact inventory")
        if file.is_file():
            actual.add(file.relative_to(root).as_posix())
    excluded = {"web-release-manifest.json", namespace + "web-release-manifest.json"}
    if actual - excluded != listed or listed.intersection(excluded):
        raise ValueError("artifact inventory differs from manifest")
    for name in ("index.html", "sw.js", namespace + "index.html", namespace + "app.js"):
        if not any(asset["path"] == name and asset["role"] == "critical" for asset in assets):
            raise ValueError(f"critical bootstrap missing: {name}")
    wasm = data.get("wasm_sha256")
    for name, expected in wasm.items():
        asset = next((asset for asset in assets if asset["path"] == namespace + "pkg/" + name), {})
        if asset.get("sha256") != expected or asset.get("role") != "critical":
            raise ValueError("WASM identity mismatch")
        if not (root / asset["path"]).read_bytes().startswith(b"\0asm\1\0\0\0"):
            raise ValueError("invalid WASM header")
    if "solar-state-snapshot.v3" in data["schemas"]:
        from data_bundles import resolve_derived_manifest
        descriptor = data.get("data_bundle")
        if not isinstance(descriptor, dict) or descriptor.get("bundle_id") != data["data_bundle_id"]:
            raise ValueError("live v3 requires one release-bound data bundle")
        name = relative_path(descriptor.get("manifest_path"))
        if not name.startswith(namespace + "data/bundles/"):
            raise ValueError("data bundle must stay inside current release namespace")
        entry = next((a for a in assets if a["path"] == name), {})
        if entry.get("sha256") != descriptor.get("manifest_sha256") or entry.get("role") != "critical":
            raise ValueError("data bundle manifest is not a critical hashed release asset")
        bundle = resolve_derived_manifest(root / name, descriptor["bundle_id"], descriptor["manifest_sha256"])
        for component in bundle.components:
            component_name = (component.path.relative_to(root)).as_posix()
            asset = next((a for a in assets if a["path"] == component_name), {})
            if asset.get("sha256") != component.sha256 or asset.get("size") != component.size_bytes or asset.get("role") != "critical":
                raise ValueError("bundle component not bound to critical release inventory")
    return data


def validate_manifest(path: Path) -> dict:
    path = Path(path)
    data = validate_data(load_json(path), path.parent)
    nested = path.parent / data["namespace"] / "web-release-manifest.json"
    if not nested.is_file() or path.read_bytes() != nested.read_bytes():
        raise ValueError("current namespace manifest copy differs")
    return data


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--expected-sha256")
    parser.add_argument("--source-sha")
    parser.add_argument("--run-id", type=int)
    parser.add_argument("--run-attempt", type=int)
    parser.add_argument("--repository")
    args = parser.parse_args()
    try:
        data = validate_manifest(args.manifest)
        if args.expected_sha256 and digest(args.manifest) != args.expected_sha256:
            raise ValueError("outer manifest digest mismatch")
        for key in ("source_sha", "run_id", "run_attempt", "repository"):
            expected = getattr(args, key)
            if expected is not None and data[key] != expected:
                raise ValueError(f"trusted metadata mismatch: {key}")
    except (ValueError, OSError) as error:
        parser.exit(1, f"ERROR: {error}\n")
    print(f"OK: {data['release_id']} {digest(args.manifest)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
