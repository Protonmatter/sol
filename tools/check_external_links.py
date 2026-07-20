#!/usr/bin/env python3
"""Check that external (http/https) links in repository Markdown are reachable.

Network-dependent, so this is deliberately NOT part of PR-gating CI — a flaky or
rate-limited host must never redden an unrelated PR. It runs on a schedule and on
demand (see .github/workflows/docs-links.yml), the same pattern as the JPL
Horizons accuracy check.

Signal discipline — the run FAILS only on *definitively* dead links:

    * HTTP 404 / 410
    * a domain that does not resolve (DNS failure)

Everything ambiguous is reported as a WARNING but does not fail the run:

    * timeouts, connection resets, TLS errors (often transient / network policy)
    * 401 / 403 / 405 / 429 (host reachable but blocks automated HEAD/bots)
    * other 5xx (server-side, usually transient)

Links inside fenced code blocks and a few non-checkable hosts (localhost,
example.*) are skipped. Standard library only.

Usage:
    python tools/check_external_links.py
    python tools/check_external_links.py --root . --timeout 15 --workers 8
"""
from __future__ import annotations

import argparse
import socket
import sys
import urllib.error
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import re

URL_RE = re.compile(r"https?://[^\s)\]<>\"'`]+")
TRIM_TRAILING = ".,;:!?)]}'\""
SKIP_DIRS = {".git", "target", "node_modules", "pkg", "textures"}
# Hosts that are never meaningfully reachable from CI (examples / loopback).
SKIP_HOST_SUBSTRINGS = ("localhost", "127.0.0.1", "0.0.0.0", "example.com", "example.org", "example.net")
USER_AGENT = "Protonmatter-Sol-linkcheck/1.0 (+https://github.com/Protonmatter/sol)"

FAIL_STATUS = {404, 410}
SOFT_STATUS = {401, 403, 405, 406, 429}  # reachable but bot-blocked / restricted


def clean_url(raw: str) -> str:
    url = raw
    while url and url[-1] in TRIM_TRAILING:
        url = url[:-1]
    return url


def is_skippable(url: str) -> bool:
    return any(host in url for host in SKIP_HOST_SUBSTRINGS)


def collect_urls(md_files: list[Path]) -> dict[str, list[str]]:
    """Return {url: [ "path:line", ... ]}, skipping fenced code blocks."""
    urls: dict[str, list[str]] = {}
    for path in md_files:
        text = path.read_text(encoding="utf-8", errors="replace")
        in_fence = False
        marker = ""
        for lineno, line in enumerate(text.splitlines(), 1):
            stripped = line.lstrip()
            if stripped.startswith(("```", "~~~")):
                m = stripped[:3]
                if not in_fence:
                    in_fence, marker = True, m
                elif stripped.startswith(marker):
                    in_fence, marker = False, ""
                continue
            if in_fence:
                continue
            for match in URL_RE.finditer(line):
                url = clean_url(match.group(0))
                if not url or is_skippable(url):
                    continue
                urls.setdefault(url, []).append(f"{path}:{lineno}")
    return urls


def _open(url: str, method: str, timeout: float) -> int:
    request = urllib.request.Request(url, method=method, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.status or 200


def check_url(url: str, timeout: float) -> tuple[str, str, str]:
    """Return (url, verdict, detail); verdict is 'ok' | 'warn' | 'fail'."""
    last_detail = ""
    for method in ("HEAD", "GET"):
        try:
            status = _open(url, method, timeout)
            if status in FAIL_STATUS:
                return (url, "fail", f"HTTP {status}")
            if status in SOFT_STATUS:
                return (url, "warn", f"HTTP {status} (restricted/bot-blocked)")
            return (url, "ok", f"HTTP {status}")
        except urllib.error.HTTPError as exc:
            if exc.code in FAIL_STATUS:
                return (url, "fail", f"HTTP {exc.code}")
            if exc.code == 405 and method == "HEAD":
                last_detail = "HEAD 405; retrying with GET"
                continue  # some servers reject HEAD — try GET
            if exc.code in SOFT_STATUS:
                return (url, "warn", f"HTTP {exc.code} (restricted/bot-blocked)")
            return (url, "warn", f"HTTP {exc.code}")
        except (socket.gaierror,) as exc:
            return (url, "fail", f"DNS failure ({exc})")
        except urllib.error.URLError as exc:
            reason = getattr(exc, "reason", exc)
            if isinstance(reason, socket.gaierror):
                return (url, "fail", f"DNS failure ({reason})")
            last_detail = f"{reason}"
            break  # network-level error — don't hammer with GET too
        except (TimeoutError, socket.timeout) as exc:
            last_detail = f"timeout ({exc})"
            break
        except Exception as exc:  # pragma: no cover - defensive
            last_detail = f"{type(exc).__name__}: {exc}"
            break
    return (url, "warn", last_detail or "unreachable")


def iter_markdown(root: Path):
    for path in sorted(root.rglob("*.md")):
        if any(part in SKIP_DIRS for part in path.relative_to(root).parts):
            continue
        yield path


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", default=".", help="Repo root (default: .)")
    parser.add_argument("--timeout", type=float, default=15.0, help="Per-request timeout seconds")
    parser.add_argument("--workers", type=int, default=8, help="Concurrent requests")
    args = parser.parse_args(argv)

    root = Path(args.root).resolve()
    md_files = list(iter_markdown(root))
    urls = collect_urls(md_files)
    if not urls:
        print("No external links found.")
        return 0

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = list(pool.map(lambda u: check_url(u, args.timeout), sorted(urls)))

    fails = [(u, d) for (u, v, d) in results if v == "fail"]
    warns = [(u, d) for (u, v, d) in results if v == "warn"]
    oks = [u for (u, v, d) in results if v == "ok"]

    for url, detail in warns:
        print(f"WARN: {url} — {detail}  ({urls[url][0]})", file=sys.stderr)
    for url, detail in fails:
        print(f"FAIL: {url} — {detail}  (in {', '.join(urls[url])})", file=sys.stderr)

    print(
        f"\nChecked {len(urls)} external link(s) across {len(md_files)} file(s): "
        f"{len(oks)} ok, {len(warns)} warn, {len(fails)} dead."
    )
    return 1 if fails else 0


if __name__ == "__main__":
    raise SystemExit(main())
