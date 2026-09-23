"""Offline validation of immutable dynamic and optional native-derived products."""

from __future__ import annotations
import argparse
import array
import hashlib
import json
import math
import pathlib
import sys
import subprocess
import importlib.util

ROOT = pathlib.Path(__file__).resolve().parents[1]


def _unique(pairs: list[tuple[str, object]]) -> dict:
    out = {}
    for key, value in pairs:
        if key in out:
            raise ValueError(f"duplicate key: {key}")
        out[key] = value
    return out


def _json(data: bytes | str) -> dict:
    def reject(value: str) -> None:
        raise ValueError(f"nonfinite JSON: {value}")

    result = json.loads(data, object_pairs_hook=_unique, parse_constant=reject)
    if not isinstance(result, dict):
        raise ValueError("object required")
    return result


def _resource(
    record: dict, root: pathlib.Path, maximum: int = 16 * 1024 * 1024
) -> bytes:
    if (
        not isinstance(record, dict)
        or not {"path", "bytes", "sha256"} <= set(record)
        or not isinstance(record["path"], str)
        or not _sha(record["sha256"])
    ):
        raise ValueError("resource identity fields")
    relative = pathlib.PurePosixPath(record["path"])
    if relative.is_absolute() or ".." in relative.parts or "\\" in record["path"]:
        raise ValueError("asset path components")
    path = (root / record["path"]).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError("asset path escape")
    size = path.stat().st_size
    if type(record["bytes"]) is not int or size != record["bytes"] or size > maximum:
        raise ValueError("byte bounds")
    data = path.read_bytes()
    if hashlib.sha256(data).hexdigest() != record["sha256"]:
        raise ValueError("digest")
    return data


_PRODUCER_MODULE = None


def _shared_validate(raw: bytes | str, kind: str) -> None:
    global _PRODUCER_MODULE
    if _PRODUCER_MODULE is None:
        spec = importlib.util.spec_from_file_location(
            "solar_dynamic_trusted_producer",
            pathlib.Path(__file__).with_name("prepare_solar_dynamic.py"),
        )
        if spec is None or spec.loader is None:
            raise ValueError("producer helper unavailable")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        _PRODUCER_MODULE = module
    binary, receipt = _PRODUCER_MODULE.ensure_producer()
    payload = raw.decode("utf-8") if isinstance(raw, bytes) else raw
    result = subprocess.run(
        [str(binary), "appearance", "validate-json", "--kind", kind],
        input=payload,
        text=True,
        encoding="utf-8",
        capture_output=True,
        cwd=ROOT,
    )
    if result.returncode:
        raise ValueError(
            f"shared Rust {kind} admission rejected: {result.stderr.strip()[:1024]}"
        )
    _PRODUCER_MODULE.verify_producer(binary, receipt)


def _geometry(packet: dict) -> None:
    _shared_validate(json.dumps(packet, separators=(",", ":")), "packet")


def validate_derived(path: pathlib.Path, doc: dict) -> dict:
    _shared_validate(json.dumps(doc, separators=(",", ":")), "manifest")
    if doc["id"] == "snapshot-boundary-v1":
        receipt_data = _resource(doc["source_receipt"], path.parent, 65536)
        descriptor = _json(receipt_data)
        if (
            set(descriptor) != {"schema_version", "field_authority", "snapshots"}
            or descriptor["schema_version"] != "solar-appearance-source-sequence.v1"
            or descriptor["field_authority"] != "normalized_model"
            or len(descriptor["snapshots"]) != len(doc["source_snapshots"])
        ):
            raise ValueError("source descriptor receipt contract")
        baseline = None
        births = {}
        for index, source in enumerate(doc["source_snapshots"]):
            original = descriptor["snapshots"][index]
            if (
                set(original) != {"path", "sha256"}
                or original["sha256"] != source["resource"]["sha256"]
            ):
                raise ValueError("source receipt digest correspondence")
            original_path = pathlib.PurePosixPath(original["path"])
            if (
                original_path.is_absolute()
                or any(p in ("..", ".") for p in original_path.parts)
                or "\\" in original["path"]
                or ":" in original["path"]
            ):
                raise ValueError("source descriptor path")
            data = _resource(source["resource"], path.parent, 16 * 1024 * 1024)
            _shared_validate(data, "source")
            snapshot = _json(data)
            if snapshot["run"]["time_seconds"] != source["time_seconds"]:
                raise ValueError("captured source time")
            context = (
                snapshot["run"]["seed"],
                snapshot["coordinates"],
                snapshot["grid"],
            )
            if baseline is not None and context != baseline:
                raise ValueError("captured source frame/grid/seed mismatch")
            baseline = context
            for region in snapshot["active_regions"]:
                previous = births.setdefault(region["id"], region["birth"])
                if previous != region["birth"]:
                    raise ValueError("captured source birth changed")
    if (
        doc["id"] not in {"rotation-v1", "snapshot-boundary-v1"}
        or doc["field_units"] != "normalized"
        or doc["plasma_authority"] != "illustrative"
    ):
        raise ValueError("derived authority")
    if (
        not 0 <= doc["duration_seconds"] <= 518400
        or not 1 <= len(doc["keyframes"]) <= 25
    ):
        raise ValueError("derived capacity")
    last = -1.0
    stable_ids = None
    for key in doc["keyframes"]:
        time = key["time_s"]
        if not last < time <= doc["duration_seconds"]:
            raise ValueError("derived time order")
        last = time
        packet = _json(_resource(key["packet"], path.parent, 4 * 1024 * 1024))
        if (
            packet["schema_version"] != "solar-derived-render-packet.v1"
            or packet["recipe_id"] != doc["id"]
            or packet["seed"] != doc["seed"]
            or packet["time_s"] != time
            or packet["source_snapshot_sha256"] != key["source_snapshot_sha256"]
        ):
            raise ValueError("derived packet identity")
        if packet["valid_time_range_seconds"] != [0, doc["duration_seconds"]]:
            raise ValueError("packet/manifest validity mismatch")
        _geometry(packet)
        ids = [s["id"] for s in packet["strands"]]
        if stable_ids is not None and ids != stable_ids:
            raise ValueError("unstable reference seed IDs")
        stable_ids = ids
        for r in packet["regions"]:
            if (
                not all(math.isfinite(v) for v in r["center"])
                or abs(sum(v * v for v in r["center"]) - 1) > 1e-8
                or not 0 <= r["radius_rad"] <= 0.3
                or r["strength"] < 0
            ):
                raise ValueError("derived region pose")
    return {
        "valid": True,
        "id": doc["id"],
        "resources": len(doc["keyframes"]),
        "native_only": True,
    }


def _keys(value: dict, keys: set[str]) -> None:
    if not isinstance(value, dict) or set(value) != keys:
        raise ValueError("unexpected or missing contract keys")


def _sha(value: object) -> bool:
    return (
        isinstance(value, str)
        and len(value) == 64
        and all(c in "0123456789abcdef" for c in value)
    )


def _same_pinned(actual: object, wanted: object) -> bool:
    if type(wanted) is bool:
        return type(actual) is bool and actual == wanted
    if type(wanted) in (int, float):
        return (
            type(actual) in (int, float) and math.isfinite(actual) and actual == wanted
        )
    if isinstance(wanted, list):
        return (
            isinstance(actual, list)
            and len(actual) == len(wanted)
            and all(_same_pinned(a, b) for a, b in zip(actual, wanted))
        )
    return type(actual) is type(wanted) and actual == wanted


def _pinned(value: dict, expected: dict) -> None:
    for key, wanted in expected.items():
        if not _same_pinned(value.get(key), wanted):
            raise ValueError(f"pinned metadata {key}")


def _manifest_contract(doc: dict, web: pathlib.Path) -> None:
    required = {
        "schema_version",
        "id",
        "seed",
        "recipe_hash",
        "generator_source_sha256",
        "producer_binary_sha256",
        "producer_receipt",
        "authority",
        "frame",
        "radius_km",
        "duration_seconds",
        "rotation",
        "packet",
        "surface",
        "volumes",
        "keyframes",
        "credits",
        "limits",
    }
    _keys(
        doc, required | ({"surface_keyframes"} if "surface_keyframes" in doc else set())
    )
    if (
        doc["id"] not in ("quiet-v1", "active-v1")
        or type(doc["seed"]) is not int
        or not 0 <= doc["seed"] <= 0xFFFFFFFF
    ):
        raise ValueError("manifest recipe/seed")
    _pinned(
        doc,
        {
            "schema_version": "solar-dynamic-appearance.v1",
            "authority": "illustrative",
            "frame": "carrington_z_north_west_positive",
            "radius_km": 695700,
            "duration_seconds": 21600,
        },
    )
    definition = (
        ROOT / "assets" / "solar" / "recipes" / (doc["id"] + "-definition.json")
    )
    if doc["recipe_hash"] != hashlib.sha256(definition.read_bytes()).hexdigest():
        raise ValueError("stale recipe identity")
    if not _sha(doc["generator_source_sha256"]) or not _sha(
        doc["producer_binary_sha256"]
    ):
        raise ValueError("producer identities")
    _keys(doc["rotation"], {"coefficients_deg_per_day", "frame_rate_deg_per_day"})
    _pinned(
        doc["rotation"],
        {
            "coefficients_deg_per_day": [14.713, -2.396, -1.787],
            "frame_rate_deg_per_day": 14.1844,
        },
    )
    base = {"path", "bytes", "sha256"}
    _keys(doc["producer_receipt"], base)
    receipt = _json(_resource(doc["producer_receipt"], web, 1024 * 1024))
    _keys(
        receipt,
        {
            "schema_version",
            "build_input_sha256",
            "binary_sha256",
            "compiler",
            "target",
            "profile",
            "locked",
            "offline",
            "fresh_target_directory",
            "inputs",
        },
    )
    _pinned(
        receipt,
        {
            "schema_version": "solar-appearance-producer.v1",
            "profile": "release",
            "locked": True,
            "offline": True,
            "fresh_target_directory": True,
        },
    )
    if (
        receipt["build_input_sha256"] != doc["generator_source_sha256"]
        or receipt["binary_sha256"] != doc["producer_binary_sha256"]
    ):
        raise ValueError("producer receipt binding")
    if (
        not isinstance(receipt["compiler"], str)
        or not 1 <= len(receipt["compiler"]) <= 4096
        or not isinstance(receipt["target"], str)
        or not receipt["target"]
        or any(
            not (c.isascii() and (c.isalnum() or c in "_-")) for c in receipt["target"]
        )
    ):
        raise ValueError("compiler identity")
    inputs = receipt["inputs"]
    if not isinstance(inputs, list) or not 1 <= len(inputs) <= 1024:
        raise ValueError("build input inventory")
    names = set()
    for entry in inputs:
        _keys(entry, {"path", "sha256"})
        if (
            not isinstance(entry["path"], str)
            or not entry["path"]
            or len(entry["path"]) > 512
            or entry["path"] in names
            or not _sha(entry["sha256"])
        ):
            raise ValueError("build input identity")
        names.add(entry["path"])
    if (
        not {
            "Cargo.toml",
            "Cargo.lock",
            "crates/solar-core/src/differential_rotation.rs",
            "crates/solar-cli/src/appearance.rs",
            "tools/prepare_solar_dynamic.py",
            "tools/solar_gaussian_deposition.py",
        }
        <= names
    ):
        raise ValueError("incomplete producer inputs")
    if (
        hashlib.sha256(
            json.dumps(inputs, sort_keys=True, separators=(",", ":")).encode()
        ).hexdigest()
        != receipt["build_input_sha256"]
    ):
        raise ValueError("build input digest")
    _keys(doc["packet"], base)
    surface = doc["surface"]
    _keys(
        surface,
        base
        | {
            "dimensions",
            "dtype",
            "longitude_positive",
            "latitude_row_zero",
            "texel_centers",
            "units",
            "time_s",
            "transfer_id",
        },
    )
    _pinned(
        surface,
        {
            "dimensions": [2048, 1024],
            "dtype": "float32-le",
            "longitude_positive": "west",
            "latitude_row_zero": "south",
            "texel_centers": True,
            "units": "relative_emission",
            "time_s": 0,
            "transfer_id": "hierarchical-euv-linear-v1",
        },
    )
    if not isinstance(doc["volumes"], list) or [
        v.get("id") for v in doc["volumes"]
    ] != ["low", "standard"]:
        raise ValueError("volume variants")
    for volume, n in zip(doc["volumes"], [64, 96]):
        scalar = {
            "dimensions": [n, n, n],
            "bounds": [-2.5, 2.5],
            "dtype": "float32-le",
            "layout": "x-fastest-y-next-z-slowest",
            "voxel_centers": True,
            "units": "relative_emission_per_solar_radius",
            "time_s": 0,
        }
        _keys(
            volume,
            base
            | set(scalar)
            | {
                "id",
                "pulse",
                "background",
                "temporal_authority",
                "width_filter",
                "deposition_mass",
            },
        )
        _pinned(
            volume,
            scalar
            | {
                "temporal_authority": "time-averaged illustrative background; rotation transform only",
                "width_filter": "physical Gaussian voxel CDF; five sigma axis tails; no variance inflation; no clipping renormalization",
            },
        )
        mass = volume["deposition_mass"]
        _keys(
            mass,
            {
                "target_mass",
                "retained_mass",
                "tail_mass",
                "clipped_mass",
                "samples",
                "units",
                "scope",
            },
        )
        _pinned(
            mass,
            {
                "units": "relative_emission_times_solar_radius_squared",
                "scope": "strand-only before float32 accumulation; midpoint line quadrature; shell voxel-center clipping",
            },
        )
        for key in ("target_mass", "retained_mass", "tail_mass", "clipped_mass"):
            if (
                type(mass[key]) not in (int, float)
                or not math.isfinite(mass[key])
                or mass[key] < 0
            ):
                raise ValueError("invalid deposition mass")
        if type(mass["samples"]) is not int or not 0 <= mass["samples"] <= 16777216:
            raise ValueError("deposition sample bounds")
        if not math.isclose(
            mass["target_mass"],
            sum(mass[k] for k in ("retained_mass", "tail_mass", "clipped_mass")),
            rel_tol=1e-10,
            abs_tol=1e-15,
        ):
            raise ValueError("deposition mass balance")
        if not math.isclose(
            mass["tail_mass"],
            mass["target_mass"] * (1 - math.erf(5 / math.sqrt(2)) ** 3),
            rel_tol=1e-9,
            abs_tol=1e-15,
        ):
            raise ValueError("deposition tail law")
        _keys(volume["background"], base | set(scalar) | {"contains_strands"})
        _pinned(volume["background"], scalar | {"contains_strands": False})
        pulse = {
            "dimensions": [n, n, n],
            "components": 4,
            "dtype": "float32-le",
            "layout": "x-fastest-y-next-z-slowest-RGBA",
            "channels": ["arc_length_R", "onset_s", "duration_s", "support_relative"],
            "width_R": 0.04,
            "speed_R_per_s": 0.0002,
            "amplitude": 0.3,
            "window": "sin_squared_nonrepeating",
            "selection": "strongest strand support per voxel; support-weighted arc length",
        }
        _keys(volume["pulse"], base | set(pulse))
        _pinned(volume["pulse"], pulse)
    frames = doc["keyframes"]
    if not isinstance(frames, list) or len(frames) not in (1, 25):
        raise ValueError("keyframe count")
    for i, key in enumerate(frames):
        _keys(key, {"time_s", "packet", "transition_kind", "topology_id"})
        _keys(key["packet"], base)
        _pinned(
            key,
            {
                "time_s": i * 900,
                "transition_kind": "hold_geometry",
                "topology_id": f"{doc['id']}-seed{doc['seed']}-t{i*900}",
            },
        )
    if frames[0]["packet"] != doc["packet"]:
        raise ValueError("first packet correspondence")
    refs = doc.get("surface_keyframes", [])
    if not isinstance(refs, list) or len(refs) > 25:
        raise ValueError("reference capacity")
    times = []
    for ref in refs:
        expected = {
            "dimensions": [2048, 1024],
            "dtype": "float32-le",
            "longitude_positive": "west",
            "latitude_row_zero": "south",
            "texel_centers": True,
            "units": "relative_emission",
            "recipe_hash": doc["recipe_hash"],
            "temporal_policy": "absolute-differential-unadvection-already-applied",
            "transfer_id": "hierarchical-euv-linear-v1",
            "resolved_visibility": 1,
        }
        _keys(ref, base | set(expected) | {"time_s"})
        _pinned(ref, expected)
        if type(ref["time_s"]) is not int or not 0 <= ref["time_s"] <= 21600:
            raise ValueError("reference time")
        times.append(ref["time_s"])
    if times != sorted(set(times)):
        raise ValueError("reference time order")
    for name in ("credits", "limits"):
        if (
            not isinstance(doc[name], list)
            or not 1 <= len(doc[name]) <= 16
            or any(not isinstance(s, str) or not 1 <= len(s) <= 1024 for s in doc[name])
        ):
            raise ValueError("manifest text bounds")


def validate(path: pathlib.Path, web: pathlib.Path) -> dict:
    if path.stat().st_size > 1024 * 1024:
        raise ValueError("manifest capacity")
    doc = _json(path.read_bytes())
    if doc["schema_version"] == "solar-appearance-derived-sequence.v1":
        return validate_derived(path, doc)
    _manifest_contract(doc, web)
    if (
        doc["schema_version"] != "solar-dynamic-appearance.v1"
        or doc["authority"] != "illustrative"
        or doc["frame"] != "carrington_z_north_west_positive"
        or doc["radius_km"] != 695700
    ):
        raise ValueError("identity/authority/frame mismatch")
    entries = [(doc["packet"], 0), (doc["surface"], None)]
    for volume in doc["volumes"]:
        entries.append((volume, None))
        for name in ("pulse", "background"):
            if name in volume:
                entries.append((volume[name], None))
    for reference in doc.get("surface_keyframes", []):
        if (
            reference["recipe_hash"] != doc["recipe_hash"]
            or reference["temporal_policy"]
            != "absolute-differential-unadvection-already-applied"
            or not 0 <= reference["time_s"] <= 21600
        ):
            raise ValueError("reference identity/time policy")
        entries.append((reference, None))
    last = -1
    for key in doc["keyframes"]:
        if not last < key["time_s"] <= 21600:
            raise ValueError("time order")
        last = key["time_s"]
        entries.append((key["packet"], key["time_s"]))
    for record, time in entries:
        data = _resource(record, web)
        if record.get("dtype") == "float32-le":
            dimensions = record["dimensions"]
            if len(dimensions) not in (2, 3) or any(
                type(v) is not int or not 1 <= v <= 2048 for v in dimensions
            ):
                raise ValueError("dimensions")
            components = record.get("components", 1)
            if (
                components not in (1, 4)
                or len(data) != math.prod(dimensions) * 4 * components
            ):
                raise ValueError("scalar layout")
            values = array.array("f")
            values.frombytes(data)
            if sys.byteorder != "little":
                values.byteswap()
            if any(not math.isfinite(v) or not 0 <= v <= 65504 for v in values):
                raise ValueError("scalar finite/range")
        else:
            packet = _json(data)
            if (
                packet["schema_version"] != "solar-render-packet.v1"
                or packet["recipe_id"] != doc["id"]
                or packet["seed"] != doc["seed"]
                or packet["time_s"] != time
                or packet.get("recipe_hash") != doc.get("recipe_hash")
            ):
                raise ValueError("packet identity")
            _geometry(packet)
    return {"valid": True, "resources": len(entries), "id": doc["id"]}


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=pathlib.Path)
    parser.add_argument("--web-root", type=pathlib.Path, default=ROOT / "apps" / "web")
    args = parser.parse_args()
    print(json.dumps(validate(args.manifest, args.web_root)))


if __name__ == "__main__":
    main()
