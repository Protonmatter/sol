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
from validate_snapshot import loads_strict

MAX_JSON_BYTES = 16 * 1024 * 1024
MAX_PACKAGE_MEMBERS = 4096
CRLF_TEXT_INPUTS = frozenset({"Cargo.lock", "crates/solar-ephemeris/LICENSE-MIT", "crates/solar-ephemeris/LICENSE-APACHE"})


def _json_object(raw: bytes, context: str) -> dict:
    if not isinstance(raw, bytes) or len(raw) > MAX_JSON_BYTES:
        raise ValueError(f"{context} JSON unavailable/oversized")
    try:
        result = loads_strict(raw.decode("utf-8"))
    except (ValueError, RecursionError) as error:
        raise ValueError(f"{context} JSON invalid") from error
    if not isinstance(result, dict):
        raise ValueError(f"{context} JSON object required")
    return result


def _committed_source_ids(root: Path, source_sha: str) -> dict[str, str]:
    """Read immutable Git blob identities; never refresh the index or write objects."""
    result = subprocess.run(["git", "--no-lazy-fetch", "--no-optional-locks", "-C", str(root), "ls-tree", "-r", "-z", "--full-tree",
        source_sha, "--", "Cargo.toml", "Cargo.lock", "crates/solar-ephemeris"],
        check=True, capture_output=True, timeout=30)
    if len(result.stdout) > MAX_JSON_BYTES:
        raise ValueError("committed source inventory oversized")
    entries = result.stdout.split(b"\0")
    if entries[-1] != b"":
        raise ValueError("committed source inventory malformed")
    identities: dict[str, str] = {}
    for entry in entries[:-1]:
        try:
            header, name = entry.split(b"\t", 1)
            mode, kind, object_id = header.decode("ascii").split(" ")
            filename = name.decode("utf-8")
        except (ValueError, UnicodeError) as error:
            raise ValueError("committed source inventory malformed") from error
        if not re.fullmatch(r"[0-9a-f]{40}", object_id) or filename in identities:
            raise ValueError("committed source identity malformed/duplicate")
        relative_path(filename)
        if filename not in {"Cargo.toml", "Cargo.lock"} and not filename.startswith("crates/solar-ephemeris/"):
            raise ValueError("committed source inventory outside package scope")
        # Non-file Git objects cannot establish regular packaged-file identity.
        if kind == "blob" and mode in {"100644", "100755"}:
            identities[filename] = object_id
    return identities


def _require_committed_bytes(data: bytes, filename: str, identities: dict[str, str]) -> bool:
    # SHA-1 here is Git's blob identifier, not a new artifact security digest.
    # The full archive and every output member retain their separate SHA-256.
    def object_id(content: bytes) -> str:
        return hashlib.sha1(b"blob " + str(len(content)).encode("ascii") + b"\0" + content,
                           usedforsecurity=False).hexdigest()
    expected = identities.get(filename)
    if expected == object_id(data):
        return False
    # These three existing plaintext inputs use Git text=auto on Windows.
    # Keep their raw archive/working-copy equality and SHA-256 receipts, while
    # explicitly recording a canonical Git-text match. Never normalize source,
    # TOML, numerical or binary assets, or run configurable Git filters.
    if filename in CRLF_TEXT_INPUTS and b"\r\n" in data and expected == object_id(data.replace(b"\r\n", b"\n")):
        return True
    raise ValueError("package/workspace bytes do not match the claimed source commit")


def registry_state(status: int, body: bytes, name: str, version: str) -> str:
    if status == 404:
        return "absent"
    if status != 200:
        raise ValueError(f"registry lookup failed ({status}); absence is not established")
    result = _json_object(body, "registry").get("version")
    if not isinstance(result, dict):
        raise ValueError("registry version object required")
    if result.get("crate") != name or result.get("num") != version:
        raise ValueError("registry response identity mismatch")
    return "present"


def package_evidence(package: Path, root: Path, source_sha: str, dry_run_log: Path, *, dry_run_exit: int) -> dict:
    if dry_run_exit != 0 or not dry_run_log.is_file() or dry_run_log.stat().st_size == 0:
        raise ValueError("successful retained dry-run evidence is required")
    if not isinstance(source_sha, str) or not re.fullmatch("[0-9a-f]{40}", source_sha):
        raise ValueError("exact source SHA required")
    contents, total = {}, 0
    with tarfile.open(package, "r:gz") as archive:
        for index, member in enumerate(archive):
            if index >= MAX_PACKAGE_MEMBERS:
                raise ValueError("package exceeds bounded member count")
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
    if not {"Cargo.toml", "Cargo.toml.orig", ".cargo_vcs_info.json"}.issubset(files):
        raise ValueError("package source manifests missing")
    metadata = tomllib.loads(files["Cargo.toml"].decode()).get("package")
    if not isinstance(metadata, dict) or not all(isinstance(metadata.get(key), str) for key in ("name", "version")):
        raise ValueError("package identity fields invalid")
    name, version = metadata["name"], metadata["version"]
    if name != "solar-ephemeris" or prefix != f"{name}-{version}" or package.name != prefix + ".crate":
        raise ValueError("package identity mismatch")
    vcs = _json_object(files[".cargo_vcs_info.json"], "package VCS")
    git = vcs.get("git")
    if not isinstance(git, dict) or git.get("sha1") != source_sha or git.get("dirty", False) is not False or vcs.get("path_in_vcs") != "crates/solar-ephemeris":
        raise ValueError("package source identity/dirty mismatch")
    committed = _committed_source_ids(root, source_sha)
    normalized: list[str] = []
    for filename in ("Cargo.toml", "Cargo.lock"):
        if _require_committed_bytes((root / filename).read_bytes(), filename, committed):
            normalized.append(filename)
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
        committed_name = "crates/solar-ephemeris/" + ("Cargo.toml" if filename == "Cargo.toml.orig" else filename)
        if _require_committed_bytes(data, committed_name, committed):
            normalized.append(committed_name)
    notices = sorted(name for name in files if name.startswith(("LICENSE", "NOTICE", "COPYING")))
    if not {"LICENSE-MIT", "LICENSE-APACHE"}.issubset(notices) or "Cargo.toml.orig" not in files:
        raise ValueError("package notices/source manifest missing")
    original_package = tomllib.loads(files['Cargo.toml.orig'].decode('utf-8')).get('package', {})
    if not isinstance(original_package, dict):
        raise ValueError('package source license declaration invalid')
    component_license = original_package.get('license')
    if component_license == {'workspace': True}:
        component_license = tomllib.loads((root / 'Cargo.toml').read_text(encoding='utf-8')).get(
            'workspace', {}).get('package', {}).get('license')
    if component_license != metadata.get('license'):
        raise ValueError('package generated/source license mismatch')
    component_materials = {}
    if component_license == 'LGPL-3.0-only':
        from ephemeris_distribution import required_package_materials
        component_materials = required_package_materials(root)
        for filename, expected in component_materials.items():
            if filename not in files or hashlib.sha256(files[filename]).hexdigest() != expected:
                raise ValueError('component source/notice material missing or changed: ' + filename)
    return {"schema_version": "crate-release-evidence.v1", "name": name, "version": version,
        "source_sha": source_sha, "package_sha256": digest(package), "package_size": package.stat().st_size,
        "source_binding": {"kind": "committed Git blob identity with declared canonical-text exceptions",
            "transform": "CRLF-to-LF for explicitly allowlisted text inputs", "normalized_paths": sorted(normalized)},
        "contents": {name: hashlib.sha256(data).hexdigest() for name, data in sorted(files.items())},
        "cargo_generated_files": sorted(generated.intersection(files)), "notices": notices,
        "component_license": component_license, "component_source_materials_sha256": component_materials,
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
            with args.registry_body.open("rb") as stream:
                body = stream.read(MAX_JSON_BYTES + 1)
            result = {"registry": registry_state(args.registry_status, body, "solar-ephemeris", args.version), "publication": "held"}
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
