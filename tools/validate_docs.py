#!/usr/bin/env python3
"""Validate repository Markdown against the actual build state — offline.

Two deterministic, network-free checks so documentation can't silently drift
from the tree it describes:

  1. Local links & images resolve. Every ``[text](path)`` / ``![alt](path)`` /
     reference definition ``[label]: path`` that points at a repo-local file
     (not http/https/mailto/anchor-only) must exist. Catches docs that reference
     a moved, renamed, or deleted file/script.

  2. Workflow badges point at real workflows. Every
     ``actions/workflows/<name>.yml`` reference (README status badges, etc.)
     must have a matching file under ``.github/workflows/``. Catches a badge for
     a workflow that was renamed or removed, or a workflow added without a badge
     mention going stale the other way.

Links inside fenced code blocks are ignored (they are examples, not references).
External URLs and pure ``#anchor`` fragments are not checked (no network).

Exit status is non-zero if any Markdown file has a broken local reference, so
this is safe to gate every PR. Standard library only.

Usage:
    python tools/validate_docs.py                # scan the whole repo
    python tools/validate_docs.py README.md ...  # scan specific files
    python tools/validate_docs.py --root .
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

# Inline links and images: [text](target) / ![alt](target "title")
LINK_RE = re.compile(r"!?\[[^\]]*\]\(\s*(<[^>]+>|[^)\s]+)(?:\s+\"[^\"]*\")?\s*\)")
# Reference-style link definitions: [label]: target
REFDEF_RE = re.compile(r"^\s{0,3}\[[^\]]+\]:\s*(<[^>]+>|\S+)")
# Workflow references (badges / links): actions/workflows/<file>.yml
WORKFLOW_RE = re.compile(r"actions/workflows/([A-Za-z0-9._-]+\.ya?ml)")

SKIP_DIRS = {".git", "target", "node_modules", "pkg", "textures"}


def is_external(target: str) -> bool:
    return target.startswith(("http://", "https://", "mailto:", "tel:", "//"))


def clean_target(raw: str) -> str:
    # Strip optional <...> angle brackets and any #fragment / ?query, decode %20.
    t = raw.strip()
    if t.startswith("<") and t.endswith(">"):
        t = t[1:-1]
    t = t.split("#", 1)[0].split("?", 1)[0]
    return t.replace("%20", " ").strip()


def check_file(md_path: Path, repo_root: Path) -> list[str]:
    errors: list[str] = []
    text = md_path.read_text(encoding="utf-8", errors="replace")
    in_fence = False
    fence_marker = ""

    for lineno, line in enumerate(text.splitlines(), 1):
        stripped = line.lstrip()
        # Toggle fenced code blocks (``` or ~~~), honoring the marker length.
        if stripped.startswith(("```", "~~~")):
            marker = stripped[:3]
            if not in_fence:
                in_fence, fence_marker = True, marker
            elif stripped.startswith(fence_marker):
                in_fence, fence_marker = False, ""
            continue

        # Workflow badges are checked even outside prose (they live in link URLs).
        for m in WORKFLOW_RE.finditer(line):
            wf = m.group(1)
            if not (repo_root / ".github" / "workflows" / wf).exists():
                errors.append(
                    f"{md_path}:{lineno}: badge/link references missing workflow "
                    f".github/workflows/{wf}"
                )

        if in_fence:
            continue

        targets = [m.group(1) for m in LINK_RE.finditer(line)]
        ref = REFDEF_RE.match(line)
        if ref:
            targets.append(ref.group(1))

        for raw in targets:
            target = clean_target(raw)
            if not target or target.startswith("#") or is_external(target):
                continue
            base = repo_root if target.startswith("/") else md_path.parent
            resolved = (base / target.lstrip("/")).resolve()
            if not resolved.exists():
                errors.append(f"{md_path}:{lineno}: broken local link -> {target}")

    return errors


def iter_markdown(root: Path):
    for path in sorted(root.rglob("*.md")):
        if any(part in SKIP_DIRS for part in path.relative_to(root).parts):
            continue
        yield path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="*", help="Markdown files (default: whole repo)")
    parser.add_argument("--root", default=".", help="Repo root (default: .)")
    args = parser.parse_args(argv)

    repo_root = Path(args.root).resolve()
    if args.files:
        md_files = [Path(f).resolve() for f in args.files]
    else:
        md_files = list(iter_markdown(repo_root))

    all_errors: list[str] = []
    for md_path in md_files:
        all_errors.extend(check_file(md_path, repo_root))

    if all_errors:
        for err in all_errors:
            print(f"ERROR: {err}", file=sys.stderr)
        print(
            f"\n{len(all_errors)} broken reference(s) across "
            f"{len(md_files)} Markdown file(s).",
            file=sys.stderr,
        )
        return 1

    print(f"OK: {len(md_files)} Markdown file(s) — all local links and workflow badges resolve.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
