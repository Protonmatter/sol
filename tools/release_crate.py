"""Offline registry-response classification and exact-source package evidence; publication held."""
from __future__ import annotations
import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess
import tarfile
import tomllib

from validate_release_manifest import digest, relative_path


def registry_state(status: int, body: bytes, name: str, version: str) -> str:
    if status == 404:
        return "absent"
    if status != 200:
        raise ValueError(f"registry lookup failed ({status}); absence is not established")
    result = json.loads(body).get("version", {})
    if result.get("crate") != name or result.get("num") != version:
        raise ValueError("registry response identity mismatch")
    return "present"


def package_evidence(package: Path, root: Path, source_sha: str, dry_run_log: Path, *, dry_run_exit: int) -> dict:
    if dry_run_exit != 0 or not dry_run_log.is_file() or dry_run_log.stat().st_size == 0:
        raise ValueError("successful retained dry-run evidence is required")
    if not re.fullmatch("[0-9a-f]{40}", source_sha):
        raise ValueError("exact source SHA required")
    contents, total = {}, 0
    with tarfile.open(package, "r:gz") as archive:
        for member in archive:
            relative_path(member.name)
            if not member.isfile() or member.size < 0 or member.name in contents:
                raise ValueError("unsafe/duplicate package member")
            total += member.size
            if total > 128 * 1024 * 1024:
                raise ValueError("package exceeds bounded inventory size")
            contents[member.name] = archive.extractfile(member).read()
    prefixes = {name.split("/", 1)[0] for name in contents}
    if len(prefixes) != 1:
        raise ValueError("package root ambiguity")
    prefix = prefixes.pop()
    files = {name[len(prefix) + 1:]: data for name, data in contents.items()}
    metadata = tomllib.loads(files["Cargo.toml"].decode())["package"]
    name, version = metadata["name"], metadata["version"]
    if name != "solar-ephemeris" or prefix != f"{name}-{version}" or package.name != prefix + ".crate":
        raise ValueError("package identity mismatch")
    vcs = json.loads(files[".cargo_vcs_info.json"])
    if vcs.get("git", {}).get("sha1") != source_sha or vcs.get("git", {}).get("dirty", False) is not False or vcs.get("path_in_vcs") != "crates/solar-ephemeris":
        raise ValueError("package source identity/dirty mismatch")
    source = root.resolve() / "crates/solar-ephemeris"
    generated = {"Cargo.toml", "Cargo.lock", ".cargo_vcs_info.json"}
    for filename, data in files.items():
        if filename in generated:
            continue
        target = source / ("Cargo.toml" if filename == "Cargo.toml.orig" else filename)
        if any(part.is_symlink() for part in (target, *target.parents)) or not target.resolve().is_relative_to(source):
            raise ValueError("unsafe package source path")
        if target.read_bytes() != data:
            raise ValueError("package/source bytes mismatch: " + filename)
    notices = sorted(name for name in files if name.startswith(("LICENSE", "NOTICE", "COPYING")))
    if not {"LICENSE-MIT", "LICENSE-APACHE"}.issubset(notices) or "Cargo.toml.orig" not in files:
        raise ValueError("package notices/source manifest missing")
    return {"schema_version": "crate-release-evidence.v1", "name": name, "version": version,
        "source_sha": source_sha, "package_sha256": digest(package), "package_size": package.stat().st_size,
        "contents": {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())},
        "cargo_generated_files": sorted(generated.intersection(files)), "notices": notices,
        "dry_run": {"exit_code": dry_run_exit, "log_sha256": digest(dry_run_log)},
        "registry": "not_checked", "publication": "held",
        "limitations": ["Package bytes are a dry-run candidate, not registry publication. Cargo publish can repackage; separate authority and post-publication registry checksum verification remain required."]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", type=Path)
    parser.add_argument("--source-root", type=Path, default=Path.cwd())
    parser.add_argument("--source-sha")
    parser.add_argument("--dry-run-log", type=Path)
    parser.add_argument("--dry-run-exit", type=int)
    parser.add_argument("--registry-status", type=int)
    parser.add_argument("--registry-body", type=Path)
    parser.add_argument("--version")
    args = parser.parse_args()
    try:
        if args.registry_status is not None:
            if not args.version or not args.registry_body:
                raise ValueError("registry status requires version and captured response body")
            result = {"registry": registry_state(args.registry_status, args.registry_body.read_bytes(), "solar-ephemeris", args.version), "publication": "held"}
        else:
            if not args.package or not args.source_sha or not args.dry_run_log or args.dry_run_exit is None:
                raise ValueError("package, exact source, and retained dry-run result required")
            actual = subprocess.run(["git", "-C", str(args.source_root), "rev-parse", "HEAD"], check=True, capture_output=True, text=True, timeout=30).stdout.strip()
            if actual != args.source_sha:
                raise ValueError("checkout source SHA mismatch")
            result = package_evidence(args.package, args.source_root, args.source_sha, args.dry_run_log, dry_run_exit=args.dry_run_exit)
        print(json.dumps(result, sort_keys=True, indent=2))
    except (ValueError, KeyError, OSError, tarfile.TarError, subprocess.SubprocessError) as error:
        parser.exit(1, f"ERROR: {error}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
