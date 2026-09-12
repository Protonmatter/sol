"""Read-only Git source/config/asset classification; never select an approval profile."""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import subprocess

from validate_release_manifest import relative_path
from build_web import SCIENCE_MODULES


def report_digest(report: dict) -> str:
    return hashlib.sha256(json.dumps(report, sort_keys=True, separators=(",", ":"), allow_nan=False).encode()).hexdigest()


def parse_diff(raw: bytes) -> list[tuple[str, str]]:
    if not raw:
        return []
    fields = raw.decode("utf-8", errors="strict").split("\0")
    if fields.pop() != "" or len(fields) % 2:
        raise ValueError("incomplete NUL-delimited Git diff")
    result, seen = [], set()
    for status, path in zip(fields[::2], fields[1::2]):
        relative_path(path)
        if status not in ("A", "M", "D", "T") or path in seen:
            raise ValueError("unexpected/duplicate Git change")
        seen.add(path)
        result.append((status, path))
    return sorted(result, key=lambda item: item[1])


def category(path: str) -> str:
    # First matching boundary wins. Unknown tools/configs never become docs-only.
    if path.startswith((".github/", "tools/release", "tools/build_", "tools/validate_", "tools/browser_")) or path in ("Cargo.lock", "package-lock.json", "package.json", "Cargo.toml", "rust-toolchain.toml"):
        return "delivery"
    if path.startswith(("crates/", "services/", "docs/ephemeris-snapshot", "docs/solar-state-snapshot")):
        return "scientific"
    if path.startswith("apps/web/data/"):
        return "data"
    if path.startswith("apps/web/") and Path(path).name in SCIENCE_MODULES:
        return "scientific"
    if path.startswith("apps/web/") and re.search(r"(?:contract|guard|schema)", Path(path).stem, re.IGNORECASE):
        return "unknown"
    if path.startswith(("apps/web/", "tests/web/")):
        return "ui"
    if path.endswith(".md") and ("/" not in path or path.startswith("docs/")):
        return "documentation"
    return "unknown"


def classify(base_sha: str, head_sha: str, changes: list[tuple[str, str]]) -> dict:
    if any(not re.fullmatch("[0-9a-f]{40}", value) for value in (base_sha, head_sha)):
        raise ValueError("classification requires exact base/head SHAs")
    files = [{"status": status, "path": path, "category": category(path)} for status, path in sorted(changes, key=lambda item: item[1])]
    return {"schema_version": "release-changes.v1", "base_sha": base_sha, "source_sha": head_sha,
        "files": files, "categories": sorted({entry["category"] for entry in files})}


def inspect_git(root: Path, base_sha: str, head_sha: str) -> dict:
    classify(base_sha, head_sha, [])  # Validate arguments before invoking Git.
    def git(*args: str) -> bytes:
        return subprocess.run(["git", "-C", str(root), *args], check=True, capture_output=True, timeout=60).stdout
    for sha in (base_sha, head_sha):
        if git("rev-parse", "--verify", sha + "^{commit}").decode().strip() != sha:
            raise ValueError("unresolved source commit")
    # Renames are delete+add, so moving an algorithm cannot hide its old category.
    raw = git("diff", "--no-ext-diff", "--no-textconv", "--no-renames", "--name-status", "-z", base_sha, head_sha, "--")
    return classify(base_sha, head_sha, parse_diff(raw))


def validate_review(report: dict, selected: dict) -> None:
    if selected.get("base_sha") != report["base_sha"] or selected.get("diff_sha256") != report_digest(report):
        raise ValueError("protected source diff base/digest mismatch")
    unknown = sorted(entry["path"] for entry in report["files"] if entry["category"] == "unknown")
    review = selected.get("unknown_review", {})
    if unknown and (review.get("paths") != unknown or not review.get("reviewed_by") or not review.get("acceptance_id")):
        raise ValueError("unknown change paths require explicit protected maintainer review")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", type=Path, default=Path.cwd())
    parser.add_argument("--base-sha", required=True)
    parser.add_argument("--source-sha", required=True)
    args = parser.parse_args()
    try:
        report = inspect_git(args.source_root, args.base_sha, args.source_sha)
    except (ValueError, OSError, subprocess.SubprocessError) as error:
        parser.exit(1, f"ERROR: {error}\n")
    print(json.dumps({"report": report, "sha256": report_digest(report)}, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
