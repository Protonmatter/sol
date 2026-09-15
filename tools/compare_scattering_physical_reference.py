"""Join immutable direct-GPU source values to the converged CPU physical corpus.

This is read-only apart from its explicit JSON output. It does not launch a GPU,
change the atlas gate, or infer accuracy from a requested backend. No dependencies.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
from typing import Any, NoReturn


def digest(path: Path) -> str:
    return hashlib.sha256(path.read_bytes()).hexdigest()


def reject_constant(value: str) -> NoReturn:
    raise ValueError(f"Non-finite JSON: {value}")


def read_json(path: Path) -> dict[str, Any]:
    value = json.loads(path.read_text(encoding="utf-8"), parse_constant=reject_constant)
    if not isinstance(value, dict):
        raise ValueError("Receipt must be a JSON object")
    return value


def same_json(left: Any, right: Any) -> bool:
    # Python equality equates booleans and integers; JSON input identity must not.
    return json.dumps(left, sort_keys=True, separators=(",", ":")) == json.dumps(right, sort_keys=True, separators=(",", ":"))


def contained(root: Path, relative: str) -> Path:
    path = (root / relative).resolve()
    if not path.is_relative_to(root.resolve()):
        raise ValueError("Receipt path escapes its supplied root")
    return path


def rgb(value: Any, *, gpu: bool) -> list[float]:
    if (not isinstance(value, list) or len(value) != (4 if gpu else 3)
            or any(isinstance(v, bool) or not isinstance(v, (int, float)) or not math.isfinite(v) for v in value)):
        raise ValueError("Expected finite RGB reference or RGBA source readback")
    if gpu and value[3] != 1:
        raise ValueError("Direct-source validity channel is not one")
    return value[:3]


def compare_run(reference_path: Path, cpu_root: Path, gpu_root: Path, *, expected_count: int = 1600) -> dict[str, Any]:
    reference, evidence = read_json(reference_path), read_json(gpu_root / "evidence.json")
    if reference.get("schema_version") != "atmosphere-optical-coordinate-cpu-reference.v1":
        raise ValueError("Unexpected CPU reference schema")
    if evidence.get("schema_version") != "scattering-qualification.v1" or evidence.get("complete_matrix") is not True or evidence.get("errors") != []:
        raise ValueError("GPU matrix is incomplete or contains execution errors")
    shader = contained(gpu_root, "snapshot/js/atmosphereShaders.js")
    source_hash = digest(shader)
    if source_hash != reference["candidate_solver_sha256"] or evidence["hashes"].get("js/atmosphereShaders.js") != source_hash:
        raise ValueError("GPU direct-source shader differs from the qualified CPU proposal")
    expected = {row["name"]: row for row in reference["cases"] if row["group"] == "supplemental"}
    if len(expected) != expected_count or sum(row["group"] == "supplemental" for row in reference["cases"]) != expected_count:
        raise ValueError("CPU supplemental corpus count or identity is invalid")
    actual: dict[str, dict[str, Any]] = {}
    bindings = []
    for filename, cpu_hash in reference["input_sha256"].items():
        cpu_path, gpu_path = contained(cpu_root, filename), contained(gpu_root, filename)
        if digest(cpu_path) != cpu_hash:
            raise ValueError(f"Retained CPU input receipt changed: {filename}")
        cpu_data, gpu_data = read_json(cpu_path), read_json(gpu_path)
        # Compare every original fixture input, not just the query ID or requested
        # body. This includes profiles, camera/Sun, geometry and explicit heights.
        if not same_json(cpu_data["inputs"], gpu_data["inputs"]):
            raise ValueError(f"Physical fixture inputs changed: {filename}")
        queries = {query["name"]: query for query in cpu_data["inputs"]["queries"]}
        if len(queries) != len(cpu_data["inputs"]["queries"]) or len(gpu_data["samples"]) != len(queries):
            raise ValueError(f"Fixture query count or duplicate identity: {filename}")
        for sample in gpu_data["samples"]:
            name = sample["name"]
            if name in actual or name not in queries or name not in expected:
                raise ValueError(f"Unexpected or duplicate GPU query: {name}")
            if any(not same_json(sample.get(key), value) for key, value in queries[name].items()):
                raise ValueError(f"GPU sample geometry changed: {name}")
            actual[name] = sample
        bindings.append({"path": filename, "cpu_sha256": cpu_hash, "gpu_sha256": digest(gpu_path), "queries": len(queries)})
    if actual.keys() != expected.keys():
        raise ValueError("GPU source output does not cover the complete CPU corpus")
    rows = []
    for name, cpu in expected.items():
        comparison = {}
        for key, reference_key in (("scattering", "referenceS"), ("transmission", "referenceT")):
            truth = rgb(cpu[reference_key], gpu=False)
            measured = rgb(actual[name]["reference"][key], gpu=True)
            tolerance = [1e-7 if value == 0 else 1e-4 + .002 * abs(value) for value in truth]
            error = [abs(value - target) for value, target in zip(measured, truth)]
            comparison[key] = {"reference": truth, "actual": measured, "absolute_error": error,
                               "error_over_tolerance": [value / limit for value, limit in zip(error, tolerance)],
                               "passed": all(value <= limit for value, limit in zip(error, tolerance))}
        rows.append({"name": name, "passed": all(value["passed"] for value in comparison.values()), **comparison})
    return {"schema_version": "scattering-direct-source-physical-comparison.v1", "passed": all(row["passed"] for row in rows),
            "scope": "Direct GPU scattering/transmission against converged physical CPU values; atlas interpolation and application gates remain separate",
            "cpu_reference_sha256": digest(reference_path), "gpu_evidence_sha256": digest(gpu_root / "evidence.json"),
            "solver_sha256": source_hash, "gpu": evidence.get("gpu"), "observed_backend": evidence.get("observed_backend"),
            "requested_backend": evidence.get("requested_backend"), "gpu_atlas_gate_passed": evidence.get("passed"),
            "bindings": bindings, "count": len(rows), "failed": [row["name"] for row in rows if not row["passed"]],
            "maximum_error_over_tolerance": {key: max(max(row[key]["error_over_tolerance"]) for row in rows)
                                              for key in ("scattering", "transmission")}, "cases": rows}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--reference", type=Path, required=True)
    parser.add_argument("--cpu-source-root", type=Path, required=True)
    parser.add_argument("--gpu-run", type=Path, required=True)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    result = compare_run(args.reference, args.cpu_source_root, args.gpu_run)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(result, indent=2, allow_nan=False) + "\n", encoding="utf-8", newline="\n")
    print(json.dumps({key: result[key] for key in ("passed", "count", "failed", "maximum_error_over_tolerance")}))
    return 0 if result["passed"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
