#!/usr/bin/env python3
"""Stage one immutable web release; never restamp the source checkout."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import tempfile
from pathlib import Path

from validate_release_manifest import RELEASE_ID, base_path as validate_base_path, digest, validate_manifest

ROOT = Path(__file__).resolve().parent.parent


def validate_visual_source(source_root: Path) -> frozenset[str]:
    """Validate visual identity and return images required by the initial experience."""
    if not any((source_root / name).exists() for name in ("js/visualAssets.js", "js/solarObservation.js")):
        return frozenset()  # Historical artifacts retain their optional-texture contract.
    from validate_visual_assets import browser_module, validate_inventory
    inventory = source_root / "visual-assets.v1.json"
    if not inventory.is_file() or inventory.is_symlink():
        raise ValueError("visual runtime requires its reviewed inventory")
    data = json.loads(inventory.read_text(encoding="utf-8"))
    validate_inventory(data, source_root)
    generated = source_root / "js/visualAssetManifest.js"
    if not generated.is_file() or generated.read_text(encoding="utf-8") != browser_module(data):
        raise ValueError("browser visual inventory drift")
    # solarObservation.js selects observed_images[0] for the default Sun view.
    # Its first request can precede SW control, so installation must admit these
    # exact pinned bytes; remaining archive previews and textures stay on demand.
    # Cache admission does not upgrade a source's scientific qualification.
    if (source_root / "js/solarObservation.js").is_file():
        return frozenset({data["observed_images"][0]["path"]})
    return frozenset()

TOKEN = re.compile(r"\?v=[0-9a-zA-Z._-]+")
WASM_FILES = ("solar_wasm.wasm", "solar_ephemeris.wasm")
TRANSITION_SCHEMAS = {"solar-state-snapshot.v2", "solar-state-snapshot.v3", "ephemeris-snapshot.v2", "ephemeris-snapshot.v3"}
SCIENCE_MODULES = frozenset({"engine.js", "skyEngine.js", "accuracy.js", "ephemerisSchema.js", "ephemerisContract.js", "ephemerisContractV2.js",
    "solarSchema.js", "solarContract.js", "systemContract.js", "dataBundle.js", "sourceAttribution.js",
    "solarProjection.js", "solarRegionFacts.js", "celestial.js", "engineLimits.js",
    "displayGeometry.js", "labelOcclusion.js", "visualAssets.js", "visualAssetManifest.js", "solarObservation.js", "orreryShaders.js", "planetAppearance.js", "surfaceMapping.js",
    "bodyData.js", "moonelements.js", "moonorbits.js", "moonshadows.js", "starphysics.js", "starcatalog.js",
    "orreryMath.js", "orreryTime.js", "solarWorker.js", "skyWorker.js", "systemWorker.js",
    "workerClient.js", "solarWorkerClient.js", "skyWorkerClient.js", "systemWorkerClient.js"})


def build_site(source_root: Path, wasm_root: Path, out_root: Path, *, release_id: str,
               source_sha: str, repository: str, run_id: int, run_attempt: int,
               base_path: str = "/", previous_root: Path | None = None,
               schemas: list[str] | None = None, bundle_pointer: Path | None = None) -> dict:
    source_root, wasm_root, out_root = source_root.resolve(), wasm_root.resolve(), out_root.resolve()
    if out_root.exists():
        raise ValueError("output root already exists; choose a new release output directory")
    if out_root.is_relative_to(source_root) or source_root.is_relative_to(out_root):
        raise ValueError("staging output must be disjoint from source")
    if not RELEASE_ID.fullmatch(release_id):
        raise ValueError("invalid release ID")
    validate_base_path(base_path)
    critical_visuals = validate_visual_source(source_root)
    if schemas is None:
        solar_text = (source_root / "js/solarSchema.js").read_text(encoding="utf-8")
        declarations = [line.strip() for line in solar_text.splitlines() if line.strip() and not line.lstrip().startswith("//")]
        solar_schema = None
        for declaration in declarations:
            if declaration == "export const SOLAR_STATE_SNAPSHOT_SCHEMA = solarSchema.properties.schema_version.const;":
                continue
            match = re.fullmatch(r"export const (solarSchema|solarImageRegistrationSchema) = (.+);", declaration)
            if not match:
                raise ValueError("unexpected generated solar schema declaration")
            value = json.loads(match[2])
            if match[1] == "solarSchema":
                if solar_schema is not None:
                    raise ValueError("duplicate generated solar schema")
                solar_schema = value
        if solar_schema is None:
            raise ValueError("missing generated solar schema")
        ephemeris_text = (source_root / "js/ephemerisContract.js").read_text(encoding="utf-8")
        versions = set(re.findall(r'schema_version\s*!==\s*"(ephemeris-snapshot\.v\d+)"', ephemeris_text))
        if len(versions) != 1:
            raise ValueError("cannot determine unique live ephemeris schema from runtime guard")
        schemas = [solar_schema["properties"]["schema_version"]["const"], versions.pop()]
    selected_bundle = None
    if "solar-state-snapshot.v3" in schemas:
        from data_bundles import resolve_derived_bundle
        selected_bundle = resolve_derived_bundle(bundle_pointer or source_root / "data/current.json")
    for name in WASM_FILES:
        file = wasm_root / name
        if file.is_symlink() or not file.is_file() or not file.read_bytes().startswith(b"\0asm\1\0\0\0"):
            raise ValueError(f"missing/invalid WASM input: {name}")
    previous = validate_manifest(previous_root / "web-release-manifest.json") if previous_root else None
    if previous and previous["release_id"] == release_id:
        raise ValueError("release ID collision with previous artifact")
    out_root.parent.mkdir(parents=True, exist_ok=True)
    temporary = Path(tempfile.mkdtemp(prefix=".sol-stage-", dir=out_root.parent))
    namespace = f"releases/{release_id}/"
    critical_visual_paths = {namespace + path for path in critical_visuals}
    source_map: dict[str, dict] = {}
    try:
        for file in sorted(source_root.rglob("*")):
            if file.is_symlink():
                raise ValueError("symlink source input is not permitted")
            if not file.is_file():
                continue
            relative = file.relative_to(source_root).as_posix()
            if selected_bundle and (relative in {"data/latest-state.json", "data/latest-observations.json", "data/feed-status.json", "data/current.json"}
                                    or relative.startswith(("data/bundles/", "data/series/", "data/attempts/", "data/.bundle", "data/.pointer", "data/.probe", "data/.verify"))):
                continue
            if relative.startswith(("pkg/", "releases/")) or relative == "web-release-manifest.json":
                continue
            destination = relative if relative == "sw.js" else namespace + relative
            target = temporary / destination
            target.parent.mkdir(parents=True, exist_ok=True)
            raw = file.read_bytes()
            if file.suffix in (".html", ".js", ".css", ".webmanifest"):
                content = TOKEN.sub(f"?v={release_id}", raw.decode("utf-8"))
                for old, new in (("__SOL_RELEASE_ID__", release_id), ("__SOL_RELEASE_NAMESPACE__", namespace), ("__SOL_BASE_PATH__", base_path)):
                    content = content.replace(old, new)
                target.write_text(content, encoding="utf-8", newline="\n")
            else:
                target.write_bytes(raw)
            source_map[destination] = {"source_path": "apps/web/" + relative,
                                       "source_sha256": hashlib.sha256(raw).hexdigest()}
        bundle_descriptor = None
        if selected_bundle:
            bundle_root = namespace + "data/bundles/" + selected_bundle.bundle_id + "/"
            bundle_descriptor = {"bundle_id": selected_bundle.bundle_id,
                                 "manifest_path": bundle_root + "manifest.json",
                                 "manifest_sha256": selected_bundle.manifest_sha256}
            payloads = [("manifest.json", selected_bundle.manifest_raw)] + [(item.relative_path, item.raw) for item in selected_bundle.components]
            for relative, raw in payloads:
                target = temporary / bundle_root / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(raw)
        package = temporary / namespace / "pkg"
        package.mkdir(parents=True, exist_ok=True)
        for name in WASM_FILES:
            shutil.copyfile(wasm_root / name, package / name)
        url = base_path + namespace + "index.html"
        (temporary / "index.html").write_text(
            '<!doctype html><html lang="en"><meta charset="utf-8">'
            '<title>Sol</title>'
            f'<a id="openSol" href="{url}">Open this Sol release</a>'
            # Meta refresh discards fragments in Chromium. Keep a shared Sky's
            # captured observer/time in the fragment, never in the request path.
            '<script>'
            f'const target=new URL({json.dumps(url)},location.href);'
            'target.hash=location.hash;document.getElementById("openSol").href=target.href;'
            'location.replace(target.href);</script>'
            f'<noscript><meta http-equiv="refresh" content="0;url={url}"></noscript>'
            '</html>\n', encoding="utf-8", newline="\n")
        if previous:
            if previous["base_path"] != base_path:
                raise ValueError("previous artifact base path is incompatible")
            old_namespace = previous["namespace"]
            shutil.copytree(previous_root / old_namespace, temporary / old_namespace)
            for asset in previous["assets"]:
                if asset["path"].startswith(old_namespace) and "source_path" in asset:
                    source_map[asset["path"]] = {key: asset[key] for key in ("source_path", "source_sha256")}
        assets = []
        for file in sorted(temporary.rglob("*")):
            if not file.is_file():
                continue
            relative = file.relative_to(temporary).as_posix()
            current = relative in ("index.html", "sw.js") or relative.startswith(namespace)
            role = "optional" if not current or ("/textures/" in relative and relative not in critical_visual_paths) else "critical"
            assets.append({"path": relative, "size": file.stat().st_size, "sha256": digest(file),
                           "role": role, **source_map.get(relative, {})})
        data_assets = [asset for asset in assets if asset["path"].startswith(namespace + "data/")]
        bundle_digest = hashlib.sha256(json.dumps([(asset["path"][len(namespace):], asset["sha256"]) for asset in data_assets], separators=(",", ":")).encode()).hexdigest()
        wasm_hashes = {name: digest(package / name) for name in WASM_FILES}
        ui_fingerprints = [(asset["source_path"], asset["source_sha256"]) for asset in assets
                           if (asset["path"].startswith(namespace) or asset["path"] == "sw.js") and "source_path" in asset and asset["path"].endswith((".js", ".html", ".css"))]
        science_fingerprints = [(path, sha) for path, sha in ui_fingerprints if Path(path).name in SCIENCE_MODULES]
        manifest = {"schema_version": "web-release-manifest.v1", "release_id": release_id,
            "source_sha": source_sha, "repository": repository, "run_id": run_id, "run_attempt": run_attempt,
            "base_path": base_path, "namespace": namespace,
            "schemas": schemas,
            "abi_versions": {"solar": 1, "ephemeris": 1},
            "data_bundle_id": selected_bundle.bundle_id if selected_bundle else "materialized-sha256-" + bundle_digest,
            "wasm_sha256": wasm_hashes, "components": {
                "ui": hashlib.sha256(json.dumps(ui_fingerprints, separators=(",", ":")).encode()).hexdigest(),
                "science": hashlib.sha256(json.dumps({"wasm": wasm_hashes, "schemas": schemas,
                    "methods_contracts_coefficients": science_fingerprints}, sort_keys=True).encode()).hexdigest()},
            "previous_release_id": previous["release_id"] if previous else None, "assets": assets}
        if bundle_descriptor:
            manifest["data_bundle"] = bundle_descriptor
        # Historical and current clients keep their own validated code/data/WASM;
        # retaining a recognized v2 namespace alongside v3 is not live adaptation.
        if previous and (not set(previous["schemas"] + manifest["schemas"]).issubset(TRANSITION_SCHEMAS)
                         or previous["abi_versions"] != manifest["abi_versions"]):
            raise ValueError("previous artifact schema/ABI is incompatible")
        manifest_bytes = (json.dumps(manifest, indent=2, sort_keys=True, allow_nan=False) + "\n").encode()
        (temporary / "web-release-manifest.json").write_bytes(manifest_bytes)
        (temporary / namespace / "web-release-manifest.json").write_bytes(manifest_bytes)
        validate_manifest(temporary / "web-release-manifest.json")
        os.rename(temporary, out_root)
        return manifest
    finally:
        if temporary.exists():
            shutil.rmtree(temporary)


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=ROOT / "apps/web")
    parser.add_argument("--wasm-dir", type=Path, default=ROOT / "build/wasm")
    parser.add_argument("--out-root", "--out-dir", dest="out_root", type=Path, default=ROOT / "build/site")
    parser.add_argument("--release-id", required=True)
    parser.add_argument("--source-sha", required=True)
    parser.add_argument("--repository", required=True)
    parser.add_argument("--run-id", type=int, required=True)
    parser.add_argument("--run-attempt", type=int, default=1)
    parser.add_argument("--base-path", default="/")
    parser.add_argument("--previous-root", type=Path)
    parser.add_argument("--bundle-pointer", type=Path, help="Resolve one validated derived bundle before staging live v3 data.")
    args = parser.parse_args()
    try:
        build_site(args.source_root, args.wasm_dir, args.out_root, release_id=args.release_id,
                   source_sha=args.source_sha, repository=args.repository, run_id=args.run_id,
                   run_attempt=args.run_attempt, base_path=args.base_path, previous_root=args.previous_root,
                   bundle_pointer=args.bundle_pointer)
    except (OSError, ValueError) as error:
        parser.exit(1, f"ERROR: {error}\n")
    print(f"Staged {args.release_id}: {digest(args.out_root / 'web-release-manifest.json')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
