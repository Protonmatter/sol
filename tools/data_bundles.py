"""Immutable local feed transactions and resolve-once readers (stdlib only).

Publication is a single fsynced pointer replacement, never a sequence of aliases.
File replacement is atomic on the supported local filesystem; directory fsync is
best-effort on POSIX and unavailable here on Windows. No network or garbage collection.
"""
from __future__ import annotations

import hashlib
import json
import os
import re
import tempfile
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Callable

import jsonschema_min
from validate_snapshot import loads_strict, validate as validate_snapshot

ROOT = Path(__file__).resolve().parents[1]
LIMIT = 16 * 1024 * 1024
IDENTITY = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,119}\Z")
HASH = re.compile(r"[a-f0-9]{64}\Z")
# Explicit shared attribution whitespace; U+FEFF is not whitespace here.
ATTRIBUTION_WHITESPACE = "\u0009\u000a\u000b\u000c\u000d\u001c\u001d\u001e\u001f\u0020\u0085\u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000"
SCHEMAS = {name: ROOT / "docs" / file for name, file in {
    "bundle-pointer.v1": "bundle-pointer-v1.schema.json",
    "public-data-cache-manifest.v2": "public-data-cache-manifest-v2.schema.json",
    "research-data-bundle.v1": "research-data-bundle-v1.schema.json",
    "daily-ingest-status.v2": "daily-ingest-status-v2.schema.json",
}.items()}


def json_bytes(value: Any) -> bytes:
    return (json.dumps(value, sort_keys=True, separators=(",", ":"), allow_nan=False) + "\n").encode()


def digest(raw: bytes) -> str:
    return hashlib.sha256(raw).hexdigest()


def relative_path(relative: str) -> str:
    if not isinstance(relative, str) or not re.fullmatch(r"[A-Za-z0-9._/-]+", relative):
        raise ValueError("invalid bundle relative path")
    parts = relative.split("/")
    if any(part in ("", ".", "..") for part in parts):
        raise ValueError("bundle traversal or empty path segment")
    return relative


def safe_path(root: Path, relative: str) -> Path:
    parts = relative_path(relative).split("/")
    base = root.resolve()
    candidate = base
    for part in parts:
        candidate = candidate / part
        if candidate.is_symlink():
            raise ValueError("bundle symlink is forbidden")
    if not candidate.resolve().is_relative_to(base):
        raise ValueError("bundle path escapes root")
    return candidate


def read_bytes(path: Path) -> bytes:
    if path.is_symlink() or not path.is_file() or path.stat().st_size > LIMIT:
        raise ValueError("missing, oversized or symlink bundle file")
    with path.open("rb") as stream:
        raw = stream.read(LIMIT + 1)
    if len(raw) > LIMIT:
        raise ValueError("bundle file exceeds size limit")
    return raw


def timestamp(value: Any, *, nullable: bool = False) -> None:
    if value is None and nullable:
        return
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|\+00:00)", value):
        raise ValueError("timestamp requires explicit UTC or null when unknown")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("invalid UTC timestamp") from exc
    if parsed.utcoffset() != timezone.utc.utcoffset(parsed):
        raise ValueError("timestamp must be UTC")


def schema(value: Any, version: str) -> None:
    errors = jsonschema_min.validate(value, json.loads(SCHEMAS[version].read_text(encoding="utf-8")))
    if errors:
        raise ValueError("; ".join(errors))


@dataclass(frozen=True)
class Component:
    role: str
    relative_path: str
    schema_version: str
    size_bytes: int
    sha256: str
    path: Path
    raw: bytes


@dataclass(frozen=True)
class ResolvedBundle:
    bundle_id: str
    source_bundle_id: str | None
    manifest_path: Path
    manifest_sha256: str
    manifest_raw: bytes
    components: tuple[Component, ...]

    def component(self, role: str) -> Component:
        return next(item for item in self.components if item.role == role)


def _manifest(pointer_path: Path, expected: str) -> tuple[dict, bytes, Path]:
    # Read pointer exactly once; all subsequent paths are bound to this manifest.
    pointer = loads_strict(read_bytes(pointer_path).decode("utf-8"))
    schema(pointer, "bundle-pointer.v1")
    if not IDENTITY.fullmatch(pointer["bundle_id"]) or not HASH.fullmatch(pointer["manifest_sha256"]):
        raise ValueError("invalid pointer identity/hash")
    path = safe_path(pointer_path.parent, pointer["manifest_path"])
    raw = read_bytes(path)
    if digest(raw) != pointer["manifest_sha256"]:
        raise ValueError("bundle manifest hash mismatch")
    value = loads_strict(raw.decode("utf-8"))
    schema(value, expected)
    if value["bundle_id"] != pointer["bundle_id"] or path.parent.name != pointer["bundle_id"]:
        raise ValueError("bundle identity mismatch")
    return value, raw, path


def _component(root: Path, record: dict, role: str, version: str) -> Component:
    path = safe_path(root, record["path"])
    raw = read_bytes(path)
    if len(raw) != record["size_bytes"] or digest(raw) != record["sha256"]:
        raise ValueError("component hash/size mismatch: " + role)
    return Component(role, record["path"], version, len(raw), digest(raw), path, raw)


def validate_source_manifest(value: dict) -> None:
    schema(value, "public-data-cache-manifest.v2")
    timestamp(value["acquired_at_utc"])
    ids, paths = set(), set()
    for product in value["products"]:
        relative_path(product["path"])
        if not IDENTITY.fullmatch(product["product_id"]) or product["product_id"].lower() in ids or product["path"].lower() in paths:
            raise ValueError("duplicate/invalid source product identity")
        if not attributable_source(product["source"]) or not HASH.fullmatch(product["sha256"]):
            raise ValueError("unattributable source/hash")
        timestamp(product["observation_time_utc"], nullable=True)
        timestamp(product["retrieved_at_utc"], nullable=True)
        ids.add(product["product_id"].lower()); paths.add(product["path"].lower())


def resolve_source_bundle(pointer_path: Path) -> ResolvedBundle:
    value, raw, path = _manifest(pointer_path, "public-data-cache-manifest.v2")
    validate_source_manifest(value)
    components = tuple(_component(path.parent, p, p["product_id"], "public-json.v1") for p in value["products"])
    for item in components:
        data = loads_strict(item.raw.decode("utf-8"))
        if not isinstance(data, (dict, list)) or not data:
            raise ValueError("source JSON must be a nonempty object or array")
    return ResolvedBundle(value["bundle_id"], None, path, digest(raw), raw, components)


def resolve_derived_bundle(pointer_path: Path, *, component_hook: Callable[[str], None] | None = None) -> ResolvedBundle:
    value, raw, path = _manifest(pointer_path, "research-data-bundle.v1")
    return _resolve_derived(value, raw, path, component_hook)


def resolve_derived_manifest(path: Path, bundle_id: str, manifest_sha256: str) -> ResolvedBundle:
    """Read-only release-bound entry, with no mutable pointer or temporary write."""
    raw = read_bytes(path)
    if not HASH.fullmatch(manifest_sha256) or digest(raw) != manifest_sha256:
        raise ValueError("release-bound manifest hash mismatch")
    value = loads_strict(raw.decode("utf-8"))
    schema(value, "research-data-bundle.v1")
    if value["bundle_id"] != bundle_id or path.parent.name != bundle_id:
        raise ValueError("release-bound bundle identity mismatch")
    return _resolve_derived(value, raw, path, None)


def _same_json(left: Any, right: Any) -> bool:
    """JSON equality: object order is irrelevant, array order and scalar types are not."""
    if isinstance(left, dict) and isinstance(right, dict):
        return left.keys() == right.keys() and all(_same_json(v, right[k]) for k, v in left.items())
    if isinstance(left, list) and isinstance(right, list):
        return len(left) == len(right) and all(_same_json(a, b) for a, b in zip(left, right))
    if isinstance(left, bool) or isinstance(right, bool):
        return type(left) is type(right) and left == right
    if isinstance(left, (int, float)) and isinstance(right, (int, float)):
        # Native/browser JSON uses f64. Never admit oversized counters after rounding.
        return abs(left) <= 9007199254740991 and abs(right) <= 9007199254740991 and left == right
    return type(left) is type(right) and left == right


def attributable_source(value: Any) -> bool:
    """Shared producer/reader rule; language-default whitespace sets differ."""
    if not isinstance(value, str):
        return False
    source = value.strip(ATTRIBUTION_WHITESPACE)
    return bool(source) and source.lower() != "unknown"


def _validate_observation_coherence(snapshot: dict, report: dict) -> None:
    # Daily derivation embeds the report envelope with only attributable frames.
    # Preserve all other report data and exact frame ordering; never repair a reader input.
    frames = []
    for frame in report["frames"]:
        provenance = frame.get("provenance") if isinstance(frame, dict) else None
        source = provenance.get("source") if isinstance(provenance, dict) else None
        if attributable_source(source):
            frames.append(frame)
    expected = {**report, "frames": frames}
    if not _same_json(snapshot["observations"], [expected]):
        raise ValueError("snapshot embedded observations disagree with normalized observations")
    context = report.get("observed_context")
    if context is None:
        context = {}
    if "observed_context" not in snapshot or not _same_json(snapshot["observed_context"], context):
        raise ValueError("snapshot observation context disagrees with normalized observations")


def _resolve_derived(value: dict, raw: bytes, path: Path, component_hook) -> ResolvedBundle:
    timestamp(value["generated_at_utc"])
    if not IDENTITY.fullmatch(value["source_bundle_id"]) or not HASH.fullmatch(value["source_manifest_sha256"]):
        raise ValueError("invalid derived source identity")
    components, roles, paths = [], set(), set()
    for record in value["components"]:
        role = record["role"]
        if role in roles or record["path"].lower() in paths:
            raise ValueError("duplicate component role/path")
        component = _component(path.parent, record, role, record["schema_version"])
        components.append(component); roles.add(role); paths.add(record["path"].lower())
        if component_hook:
            component_hook(role)
    bundle = ResolvedBundle(value["bundle_id"], value["source_bundle_id"], path, digest(raw), raw, tuple(components))
    required = {"snapshot", "observations", "feed_status", "series_manifest", "source_manifest"}
    if not required <= roles or any(role not in required and not re.fullmatch(r"series_frame:\d+", role) for role in roles):
        raise ValueError("missing or unknown bundle component role")
    data = {c.role: loads_strict(c.raw.decode("utf-8")) for c in components}
    for item in components:
        if not isinstance(data[item.role], dict) or data[item.role].get("schema_version") != item.schema_version:
            raise ValueError("component schema identity mismatch")
    source = data["source_manifest"]
    validate_source_manifest(source)
    if source["bundle_id"] != value["source_bundle_id"] or bundle.component("source_manifest").sha256 != value["source_manifest_sha256"]:
        raise ValueError("derived/source identity mismatch")
    status = data["feed_status"]
    schema(status, "daily-ingest-status.v2")
    if status["bundle_id"] != bundle.bundle_id or status["source_bundle_id"] != bundle.source_bundle_id or status["generated_at_utc"] != value["generated_at_utc"]:
        raise ValueError("feed status bundle identity mismatch")
    timestamp(status["observation_time_utc"], nullable=True)
    degraded = bool(source["failures"]) or any(p["origin"] != "current-fetch" or p["failure"] is not None for p in source["products"])
    if status["status"] != ("degraded" if degraded else "ok"):
        raise ValueError("feed status must preserve source degradation")
    observations = data["observations"]
    if observations.get("schema_version") != "observation-frame.v1" or not isinstance(observations.get("frames"), list) or not observations.get("source_mode"):
        raise ValueError("invalid normalized observations")
    errors = validate_snapshot(data["snapshot"])
    if errors:
        raise ValueError("invalid snapshot: " + "; ".join(errors))
    _validate_observation_coherence(data["snapshot"], observations)
    series = data["series_manifest"]
    if series.get("schema_version") != "series-manifest.v1" or not isinstance(series.get("frames"), list):
        raise ValueError("invalid series manifest")
    names, previous, selected_roles = set(), -1.0, set()
    for index, entry in enumerate(series["frames"]):
        name, months = entry.get("file"), entry.get("months")
        if not isinstance(name, str) or not re.fullmatch(r"[A-Za-z0-9_-]+\.json", name) or name in names or isinstance(months, bool) or not isinstance(months, (float, int)) or not 0 <= months <= 1.7976931348623157e308 or not months > previous:
            raise ValueError("invalid series identity/time")
        names.add(name); previous = months
        role = f"series_frame:{index}"
        if entry.get("availability") == "unavailable":
            if not entry.get("reason") or role in roles:
                raise ValueError("unavailable series entry must explain gap without payload")
        elif role not in roles or bundle.component(role).relative_path != "series/" + name or validate_snapshot(data[role]):
            raise ValueError("missing/invalid series component")
        else:
            selected_roles.add(role)
    if any(role not in selected_roles for role in roles if role.startswith("series_frame:")):
        raise ValueError("orphan series frame")
    return bundle


def _write_new(path: Path, raw: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as stream:
        stream.write(raw); stream.flush(); os.fsync(stream.fileno())


def _sync_directory(path: Path) -> None:
    if os.name == "posix":
        handle = os.open(path, os.O_RDONLY)
        try: os.fsync(handle)
        finally: os.close(handle)


class CommittedSelectionError(OSError):
    """Replacement completed; subsequent durability/cleanup did not complete.

    This records the commit point, not a claim about the pointer's later value.
    Another selector may already have advanced it. Never roll it back implicitly.
    """
    def __init__(self, bundle: ResolvedBundle, phase: str):
        super().__init__(f"bundle {bundle.bundle_id} selection committed; {phase} failed; inspect current pointer before retry")
        self.bundle_id = bundle.bundle_id
        self.manifest_sha256 = bundle.manifest_sha256
        self.selection_kind = "derived" if bundle.source_bundle_id else "source"
        self.phase = phase


def failure_outcome(exc: BaseException, *, selected: bool = False, status: str = "failed") -> dict:
    result = {"selected": selected, "status": "interrupted" if isinstance(exc, KeyboardInterrupt) else status,
              "error_type": type(exc).__name__}
    if isinstance(exc, CommittedSelectionError):
        result.update(selected=True, status="committed-uncertain", committed_bundle_id=exc.bundle_id,
                      manifest_sha256=exc.manifest_sha256, selection_kind=exc.selection_kind, phase=exc.phase,
                      durability_uncertain=exc.phase == "directory-sync", current_selection="not-reobserved")
    return result


def select_bundle(pointer_path: Path, bundle: ResolvedBundle, *, expected: bytes | None = None) -> None:
    relative = bundle.manifest_path.relative_to(pointer_path.parent.resolve()).as_posix()
    pointer = {"schema_version":"bundle-pointer.v1", "bundle_id":bundle.bundle_id,
               "manifest_path":relative, "manifest_sha256":bundle.manifest_sha256}
    # Revalidate the complete target before selecting it, including rollback.
    probe = pointer_path.parent / (".verify-" + uuid.uuid4().hex + ".json")
    _write_new(probe, json_bytes(pointer))
    try:
        (resolve_derived_bundle if bundle.source_bundle_id else resolve_source_bundle)(probe)
    finally: probe.unlink()
    lock = pointer_path.parent / ".bundle-select.lock"
    lock_fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    temporary = pointer_path.parent / (".pointer-" + uuid.uuid4().hex + ".tmp")
    committed, error, phase = False, None, "before-replace"
    try:
        if expected is not None and (read_bytes(pointer_path) if pointer_path.exists() else b"") != expected:
            raise ValueError("selected pointer changed; regenerate against current bundle")
        _write_new(temporary, json_bytes(pointer))
        os.replace(temporary, pointer_path)
        committed, phase = True, "directory-sync"
        _sync_directory(pointer_path.parent)
    except BaseException as exc:
        error = exc
    finally:
        # Attempt all cleanup while preserving the first failure and its phase.
        for cleanup in (lambda: os.close(lock_fd), lambda: lock.unlink(),
                        lambda: temporary.unlink(missing_ok=True)):
            try: cleanup()
            except BaseException as exc:
                if error is None: error, phase = exc, "cleanup"
    if error is not None:
        if committed: raise CommittedSelectionError(bundle, phase) from error
        raise error


def _create(root: Path, manifest: dict, payloads: dict[str, bytes], *, stage_hook=None) -> ResolvedBundle:
    root = root.resolve(); root.mkdir(parents=True, exist_ok=True)
    identity = manifest["bundle_id"]
    if not IDENTITY.fullmatch(identity): raise ValueError("invalid bundle ID")
    final = root / "bundles" / identity
    if final.exists(): raise ValueError("immutable bundle ID already exists")
    expected = read_bytes(root / "current.json") if (root / "current.json").exists() else b""
    staging = Path(tempfile.mkdtemp(prefix=".bundle-stage-", dir=root))
    selected = False
    def stage(name):
        if stage_hook: stage_hook(name)
    try:
        stage("staged")
        for relative, raw in payloads.items(): _write_new(safe_path(staging, relative), raw)
        stage("components-written")
        _write_new(staging / "manifest.json", json_bytes(manifest))
        stage("manifest-written")
        final.parent.mkdir(exist_ok=True)
        os.rename(staging, final)
        _sync_directory(final.parent)
        pointer = {"schema_version":"bundle-pointer.v1", "bundle_id":identity,
                   "manifest_path":f"bundles/{identity}/manifest.json", "manifest_sha256":digest(json_bytes(manifest))}
        probe = root / (".probe-" + uuid.uuid4().hex + ".json")
        _write_new(probe, json_bytes(pointer))
        try: result = (resolve_derived_bundle if manifest["schema_version"] == "research-data-bundle.v1" else resolve_source_bundle)(probe)
        finally: probe.unlink()
        stage("validated"); stage("before-select")
        select_bundle(root / "current.json", result, expected=expected)
        selected = True
        stage("after-select")
        return result
    except BaseException as exc:
        _write_new(root / "attempts" / (uuid.uuid4().hex + ".json"), json_bytes({
            "schema_version":"bundle-attempt.v1", "bundle_id":identity,
            **failure_outcome(exc, selected=selected)}))
        raise


def create_source_bundle(root: Path, *, bundle_id: str, acquired_at_utc: str, products: list[dict], failures: list[dict] | None = None, stage_hook=None) -> ResolvedBundle:
    records, payloads = [], {}
    for product in products:
        record = {key:value for key,value in product.items() if key != "payload"}
        raw = product["payload"]
        relative = "payloads/" + product["product_id"]
        if relative in payloads: raise ValueError("duplicate source product")
        payloads[relative] = raw
        record.update(path=relative, size_bytes=len(raw), sha256=digest(raw)); records.append(record)
    manifest = {"schema_version":"public-data-cache-manifest.v2", "bundle_id":bundle_id,
                "acquired_at_utc":acquired_at_utc, "products":records, "failures":failures or []}
    return _create(root, manifest, payloads, stage_hook=stage_hook)


def create_derived_bundle(root: Path, *, bundle_id: str, source: ResolvedBundle, generated_at_utc: str,
                          components: dict[str, tuple[str, str, bytes]], stage_hook=None) -> ResolvedBundle:
    entries = {**components, "source_manifest":("source-manifest.json", "public-data-cache-manifest.v2", source.manifest_raw)}
    payloads, records = {}, []
    for role, (relative, version, raw) in entries.items():
        if relative in payloads: raise ValueError("duplicate derived path")
        payloads[relative] = raw
        records.append({"role":role, "path":relative, "schema_version":version, "size_bytes":len(raw), "sha256":digest(raw)})
    manifest = {"schema_version":"research-data-bundle.v1", "bundle_id":bundle_id, "source_bundle_id":source.bundle_id,
                "source_manifest_sha256":source.manifest_sha256, "generated_at_utc":generated_at_utc, "components":records}
    return _create(root, manifest, payloads, stage_hook=stage_hook)


def inventory_legacy_cache(root: Path) -> list[dict]:
    """Read-only v1 inventory. Missing clocks stay null, never filesystem mtime."""
    manifest = loads_strict(read_bytes(root / "manifest.json").decode("utf-8"))
    if not isinstance(manifest, dict) or manifest.get("schema_version") != "public-data-cache-manifest.v1":
        raise ValueError("explicit v1 cache inventory requires original manifest")
    products = []
    for record in manifest.get("fetched", []):
        name = record.get("file")
        source = record.get("source")
        if not isinstance(name, str) or not isinstance(source, str) or not source.strip() or source.strip().lower() == "unknown":
            raise ValueError("unattributable legacy cache entry")
        path = safe_path(root, name)
        if not path.is_file():
            if record.get("critical"): raise ValueError("missing critical legacy payload")
            continue
        raw = read_bytes(path)
        value = loads_strict(raw.decode("utf-8"))
        if not isinstance(value, (list, dict)) or not value: raise ValueError("malformed legacy source")
        known_hash = record.get("sha256")
        if known_hash is not None and digest(raw) != known_hash: raise ValueError("legacy hash mismatch")
        retrieval = record.get("fetched_at_utc") if record.get("ok") is True else None
        timestamp(retrieval, nullable=True)
        products.append({"product_id":name, "source":source, "origin":"cached-fallback",
                         "observation_time_utc":None, "retrieved_at_utc":retrieval,
                         "quality":["read-only v1 migration; observation time unknown", "legacy identity not authenticated"],
                         "failure":record.get("error"), "license":record.get("license") or "upstream public source terms; legacy notice unavailable",
                         "critical":bool(record.get("critical")), "payload":raw})
    if not products: raise ValueError("legacy inventory has no attributable payload")
    return products
