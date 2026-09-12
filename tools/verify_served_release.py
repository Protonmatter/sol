"""Read-only served manifest/critical-byte verification. Does not deploy or grant approval."""
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
from pathlib import Path
from typing import Callable
import urllib.error
import urllib.parse
import urllib.request

from validate_release_manifest import digest, validate_manifest


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("served redirects are not accepted")


def fetch_bytes(url: str, limit: int) -> bytes:
    request = urllib.request.Request(url, headers={"Cache-Control": "no-cache", "Accept-Encoding": "identity"})
    with urllib.request.build_opener(NoRedirect()).open(request, timeout=20) as response:
        if response.status != 200 or response.geturl() != url:
            raise ValueError("served response status/URL mismatch")
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError("served response exceeds expected size")
    return data


def verify(manifest_path: Path, origin: str, *, fetch: Callable[[str, int], bytes] = fetch_bytes) -> dict:
    manifest = validate_manifest(manifest_path)
    parsed = urllib.parse.urlsplit(origin)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password or
            parsed.query or parsed.fragment or parsed.path != manifest["base_path"] or
            any(character.isspace() for character in origin)):
        raise ValueError("served origin must be credential-free HTTPS with the exact manifest base path")
    expected = manifest_path.read_bytes()
    if fetch(origin + "web-release-manifest.json", len(expected)) != expected:
        raise ValueError("served manifest differs from qualified artifact")
    critical = {}
    for asset in manifest["assets"]:
        if asset["role"] != "critical":
            continue
        data = fetch(origin + asset["path"], asset["size"])
        if len(data) != asset["size"] or hashlib.sha256(data).hexdigest() != asset["sha256"]:
            raise ValueError("served critical asset differs: " + asset["path"])
        critical[asset["path"]] = asset["sha256"]
    return {"schema_version": "served-release-evidence.v1", "origin": origin,
        "verified_at": dt.datetime.now(dt.timezone.utc).isoformat(), "manifest_sha256": digest(manifest_path),
        **{key: manifest[key] for key in ("repository", "source_sha", "release_id", "schemas", "abi_versions", "data_bundle_id")},
        "critical_assets": critical, "limitations": ["Point-in-time byte verification; no browser/platform qualification or publication authority."]}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--origin", required=True, help="Explicit authorized HTTPS endpoint, including trailing base path slash")
    args = parser.parse_args()
    try:
        result = verify(args.manifest, args.origin)
    except (ValueError, KeyError, OSError, urllib.error.URLError) as error:
        parser.exit(1, f"ERROR: {error}\n")
    print(json.dumps(result, sort_keys=True, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
