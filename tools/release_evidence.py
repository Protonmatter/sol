"""Build provenance and denominator-bearing evidence from actual retained reports."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET

from validate_release_manifest import digest, validate_manifest, relative_path


def source_path(value: str) -> str:
    value = value.replace("\\", "/")
    for marker in ("apps/web/", "crates/", "tools/", "services/"):
        if marker in value:
            return relative_path(marker + value.split(marker, 1)[1])
    return relative_path(value)


def coverage_entry(total: int, covered: int, files: list[str], path: Path) -> dict:
    if total <= 0 or not 0 <= covered <= total or covered * 100 < total * 90 or not files:
        raise ValueError("coverage missing/invalid/below 90 percent")
    return {"lines_total": total, "lines_covered": covered, "minimum_lines_percent": 90,
        "denominator": sorted(set(files)), "report_sha256": digest(path)}


def python_denominator(report: ET.Element, repository_root: Path) -> list[str]:
    """Resolve both coverage.py report shapes without expanding the source scope."""
    repository_root = repository_root.resolve()
    allowed = {repository_root / "tools", repository_root / "services/ephemeris-server"}
    roots = []
    for item in report.findall("./sources/source"):
        raw = (item.text or "").strip().replace("\\", "/")
        if not raw or ".." in raw.split("/"):
            raise ValueError("invalid Python coverage source root")
        declared = Path(raw)
        source = declared if declared.is_absolute() else repository_root / relative_path(raw)
        # A separate `coverage xml` CLI process emits the checkout root and
        # repository-relative filenames; --source belongs to the earlier run.
        # Accept that exact root, but still enforce allowed source trees per file.
        if (any(part.is_symlink() for part in (source, *source.parents)) or source.resolve() not in allowed | {repository_root} or
                not source.is_dir()):
            raise ValueError("unresolved or escaping Python coverage source root")
        if source.resolve() in roots:
            raise ValueError("duplicate Python coverage source root")
        roots.append(source.resolve())
    if not roots:
        raise ValueError("Python coverage source roots missing")
    files = []
    for item in report.iter("class"):
        filename = relative_path(item.attrib["filename"].replace("\\", "/"))
        candidates = []
        for source in roots:
            target = source / filename
            if any(part.is_symlink() for part in (target, *target.parents)) or not target.resolve().is_relative_to(source):
                raise ValueError("unsafe Python coverage file identity")
            if target.is_file():
                if not any(target.resolve().is_relative_to(root) for root in allowed):
                    raise ValueError("Python coverage file is outside the configured source population")
                candidates.append(target.resolve().relative_to(repository_root).as_posix())
        if len(candidates) != 1:
            raise ValueError("unresolved or ambiguous Python coverage file: " + filename)
        files.append(candidates[0])
    if len(set(files)) != len(files):
        raise ValueError("duplicate Python coverage file identity")
    return sorted(files)


def collect(manifest_path: Path, coverage_root: Path, provenance: dict, *, source_root: Path | None = None) -> dict:
    manifest = validate_manifest(manifest_path)
    if provenance.get("schema_version") != "build-provenance.v1" or provenance.get("source_sha") != manifest["source_sha"]:
        raise ValueError("build provenance source/version mismatch")
    if not provenance.get("toolchains") or not provenance.get("locks") or any(
            not re.fullmatch("[0-9a-f]{64}", value) for value in provenance["locks"].values()):
        raise ValueError("missing toolchain/lock provenance")
    def report(name: str) -> Path:
        paths = list(coverage_root.rglob(name))
        if len(paths) != 1 or paths[0].is_symlink() or paths[0].stat().st_size > 32 * 1024 * 1024:
            raise ValueError("missing/ambiguous/oversized coverage report: " + name)
        return paths[0]
    rust_path, python_path, web_path = report("rust.lcov"), report("python.xml"), report("combined/coverage-summary.json")
    rust = rust_path.read_text(encoding="utf-8").splitlines()
    rust_total = sum(int(line[3:]) for line in rust if line.startswith("LF:"))
    rust_covered = sum(int(line[3:]) for line in rust if line.startswith("LH:"))
    raw_xml = python_path.read_text(encoding="utf-8")
    if re.search(r"<!\s*(?:DOCTYPE|ENTITY)\b", raw_xml, re.IGNORECASE):
        raise ValueError("unexpected coverage XML declaration")
    python = ET.fromstring(raw_xml)
    web = json.loads(web_path.read_text(encoding="utf-8"))
    coverage = {
        "rust": coverage_entry(rust_total, rust_covered, [source_path(line[3:]) for line in rust if line.startswith("SF:")], rust_path),
        "python": coverage_entry(int(python.attrib["lines-valid"]), int(python.attrib["lines-covered"]),
            python_denominator(python, source_root or Path(__file__).resolve().parents[1]), python_path),
        "web": coverage_entry(web["total"]["lines"]["total"], web["total"]["lines"]["covered"],
            [source_path(path) for path in web if path != "total"], web_path)}
    return {"toolchains": provenance["toolchains"], "lock_sha256": provenance["locks"],
        **{key: manifest[key] for key in ("wasm_sha256", "abi_versions", "data_bundle_id")},
        "coverage": coverage, "source_mapping": {asset["path"]: {key: asset[key] for key in ("source_path", "source_sha256")}
            for asset in manifest["assets"] if "source_path" in asset and asset["path"].startswith(manifest["namespace"])},
        "critical_assets": {asset["path"]: asset["sha256"] for asset in manifest["assets"] if asset["role"] == "critical"},
        "approved_profile": None, "policy_digest": None, "qualification_applicability": [],
        "reference_freshness": [], "limitations": ["CI has no protected qualification authority; Node branch/function thresholds are enforced by the authoritative job, not inferred from whole-web line totals."]}


def capture(root: Path) -> dict:
    def command(*args: str) -> str:
        return subprocess.run(args, cwd=root, check=True, capture_output=True, text=True, timeout=30).stdout.strip()
    return {"schema_version": "build-provenance.v1", "source_sha": command("git", "rev-parse", "HEAD"),
        "toolchains": {"rustc": command("rustc", "--version", "--verbose"), "cargo": command("cargo", "--version"),
            "python": command(sys.executable, "--version")},
        "locks": {name: digest(root / name) for name in ("Cargo.lock", "package-lock.json")}}


def validate_outer(evidence: dict, manifest_path: Path) -> None:
    manifest = validate_manifest(manifest_path)
    for key in ("wasm_sha256", "abi_versions", "data_bundle_id"):
        if evidence.get(key) != manifest[key]:
            raise ValueError("outer evidence/staged identity mismatch: " + key)
    expected = {asset["path"]: {key: asset[key] for key in ("source_path", "source_sha256")}
        for asset in manifest["assets"] if "source_path" in asset and asset["path"].startswith(manifest["namespace"])}
    if evidence.get("source_mapping") != expected:
        raise ValueError("outer evidence source mapping mismatch")
    if evidence.get("critical_assets") != {asset["path"]: asset["sha256"] for asset in manifest["assets"] if asset["role"] == "critical"}:
        raise ValueError("outer critical asset inventory mismatch")
    if not evidence.get("toolchains") or set(evidence.get("lock_sha256", {})) != {"Cargo.lock", "package-lock.json"}:
        raise ValueError("outer toolchain/lock evidence missing")
    coverage = evidence.get("coverage", {})
    if set(coverage) != {"rust", "python", "web"}:
        raise ValueError("outer coverage evidence missing")
    for entry in coverage.values():
        total, covered = entry.get("lines_total"), entry.get("lines_covered")
        if (type(total) is not int or type(covered) is not int or not 0 < total or not 0 <= covered <= total or
                covered * 100 < total * 90 or entry.get("minimum_lines_percent") != 90 or not entry.get("denominator") or
                not re.fullmatch("[0-9a-f]{64}", str(entry.get("report_sha256", "")))):
            raise ValueError("outer coverage evidence invalid")
        for path in entry["denominator"]:
            relative_path(path)
    if any(not path.startswith(("tools/", "services/ephemeris-server/")) for path in coverage["python"]["denominator"]):
        raise ValueError("outer Python coverage denominator lacks a configured repository source root")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--capture-build", action="store_true")
    parser.add_argument("--source-root", type=Path, default=Path.cwd())
    args = parser.parse_args()
    try:
        if not args.capture_build:
            raise ValueError("--capture-build is required")
        print(json.dumps(capture(args.source_root), sort_keys=True, indent=2))
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        parser.exit(1, f"ERROR: {error}\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
