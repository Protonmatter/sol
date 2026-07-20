#!/usr/bin/env python3
"""Validate repository Markdown against the actual build state — offline.

Two families of deterministic, network-free checks so documentation can't
silently drift from the tree it describes or rot stylistically:

REFERENCE INTEGRITY
  1. Local links & images resolve. Every ``[text](path)`` / ``![alt](path)`` /
     reference definition ``[label]: path`` that points at a repo-local file
     (not http/https/mailto/anchor-only) must exist.
  2. Workflow badges point at real workflows. Every
     ``actions/workflows/<name>.yml`` reference must have a matching file under
     ``.github/workflows/``.

STYLE (offline markdown lint; code fences excluded where noted)
  3. no-hard-tabs        — literal tab characters in prose.
  4. no-trailing-space   — trailing whitespace (two spaces = an allowed line break).
  5. heading-space       — ATX heading needs a space after the ``#`` run.
  6. heading-increment   — heading level must not jump by more than one.
  7. fenced-code-lang    — every opening ``` code fence needs a language label.
  8. fence-closed        — every opened code fence must be closed.

External URLs and pure ``#anchor`` fragments are never fetched (no network).

Exit status is non-zero if any file has a broken reference or style violation,
so this is safe to gate every PR. Standard library only.

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
# ATX heading: leading #'s (up to 3 spaces of indent allowed by CommonMark).
HEADING_RE = re.compile(r"^ {0,3}(#{1,6})(.*)$")

SKIP_DIRS = {".git", "target", "node_modules", "pkg", "textures"}


def is_external(target: str) -> bool:
    return target.startswith(("http://", "https://", "mailto:", "tel:", "//"))


def clean_target(raw: str) -> str:
    t = raw.strip()
    if t.startswith("<") and t.endswith(">"):
        t = t[1:-1]
    t = t.split("#", 1)[0].split("?", 1)[0]
    return t.replace("%20", " ").strip()


def fence_marker(stripped: str) -> str | None:
    """Return the fence marker (``` or ~~~) if the line opens/closes a fence."""
    if stripped.startswith("```"):
        return "```"
    if stripped.startswith("~~~"):
        return "~~~"
    return None


def check_file(md_path: Path, repo_root: Path) -> list[str]:
    errors: list[str] = []
    text = md_path.read_text(encoding="utf-8", errors="replace")

    in_fence = False
    open_marker = ""
    last_heading_level = 0

    def err(lineno: int, rule: str, msg: str) -> None:
        errors.append(f"{md_path}:{lineno}: [{rule}] {msg}")

    for lineno, line in enumerate(text.splitlines(), 1):
        stripped = line.lstrip()
        marker = fence_marker(stripped)

        # Fence open/close bookkeeping (honoring the marker that opened it).
        if marker:
            if not in_fence:
                info = stripped[len(marker):].strip()
                if not info:
                    err(lineno, "fenced-code-lang", "opening code fence has no language label")
                in_fence, open_marker = True, marker
            elif stripped.startswith(open_marker):
                in_fence, open_marker = False, ""
            continue  # the fence line itself is not prose

        # Workflow badges live in link URLs; check them regardless of fence state.
        for m in WORKFLOW_RE.finditer(line):
            wf = m.group(1)
            if not (repo_root / ".github" / "workflows" / wf).exists():
                err(lineno, "workflow-badge", f"references missing workflow .github/workflows/{wf}")

        if in_fence:
            continue

        # ---- style checks (prose only) ----
        if "\t" in line:
            err(lineno, "no-hard-tabs", "line contains a hard tab")
        trailing = line[len(line.rstrip()):]
        if line.strip() != "" and trailing and trailing != "  ":
            # Exactly two trailing spaces are an intentional Markdown line break
            # (MD009 br_spaces=2); anything else (1, 3+, or a tab) is accidental.
            err(lineno, "no-trailing-space",
                "trailing whitespace (only exactly two spaces, as a line break, are allowed)")

        heading = HEADING_RE.match(line)
        if heading:
            hashes, rest = heading.group(1), heading.group(2)
            if rest and not rest.startswith(" "):
                err(lineno, "heading-space", "missing space after '#' in heading")
            else:
                level = len(hashes)
                if last_heading_level and level > last_heading_level + 1:
                    err(
                        lineno,
                        "heading-increment",
                        f"heading jumps from h{last_heading_level} to h{level} (skips a level)",
                    )
                last_heading_level = level

        # ---- reference integrity (prose only) ----
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
                err(lineno, "broken-link", f"broken local link -> {target}")

    if in_fence:
        err(len(text.splitlines()), "fence-closed", "unclosed code fence at end of file")

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
            f"\n{len(all_errors)} problem(s) across {len(md_files)} Markdown file(s).",
            file=sys.stderr,
        )
        return 1

    print(f"OK: {len(md_files)} Markdown file(s) — references resolve and style checks pass.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
