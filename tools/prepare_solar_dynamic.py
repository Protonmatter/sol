"""Offline, no-network appearance assets. Rust owns topology and region poses.
Scalar splatting is a declared relative-emission reconstruction of Rust strands.
No calibration, observed plasma or MHD claim. Output is immutable/idempotent.
"""

from __future__ import annotations
import argparse
import array
import hashlib
import json
import math
import pathlib
import re
import tempfile
import subprocess
import sys

try:
    from tools.solar_gaussian_deposition import deposit_line_segment
except ModuleNotFoundError:
    from solar_gaussian_deposition import deposit_line_segment

ROOT = pathlib.Path(__file__).resolve().parents[1]


# Cache only verified artifacts inside this process. Every reuse rechecks both
# complete input identity and binary bytes; no manifest can select an executable.
_PRODUCER_CACHE: tuple[pathlib.Path, dict] | None = None


def producer_inputs() -> tuple[str, list[dict]]:
    paths = {
        ROOT / "Cargo.toml",
        ROOT / "Cargo.lock",
        pathlib.Path(__file__).resolve(),
        ROOT / "tools" / "solar_gaussian_deposition.py",
    }
    for name in ("solar-core", "solar-cli", "solar-ingest"):
        base = ROOT / "crates" / name
        paths.add(base / "Cargo.toml")
        paths.update((base / "src").rglob("*.rs"))
    for path in list(paths):
        if path.suffix == ".rs":
            for name in re.findall(
                r'include_(?:str|bytes)!\s*\(\s*"([^"]+)"\s*,?\s*\)',
                path.read_text(encoding="utf-8"),
            ):
                included = (path.parent / name).resolve()
                if not included.is_relative_to(ROOT):
                    raise ValueError("build include escapes repository")
                paths.add(included)
    paths.update((ROOT / ".cargo").glob("*") if (ROOT / ".cargo").is_dir() else [])
    for name in ("rust-toolchain", "rust-toolchain.toml"):
        if (ROOT / name).is_file():
            paths.add(ROOT / name)
    paths.update((ROOT / "assets" / "solar" / "recipes").glob("*-definition.json"))
    records = []
    for path in sorted(paths):
        if path.is_file():
            records.append(
                {
                    "path": path.relative_to(ROOT).as_posix(),
                    "sha256": hashlib.sha256(path.read_bytes()).hexdigest(),
                }
            )
    digest = hashlib.sha256(
        json.dumps(records, sort_keys=True, separators=(",", ":")).encode()
    ).hexdigest()
    return digest, records


def ensure_producer() -> tuple[pathlib.Path, dict]:
    """Build in a fresh isolated target directory; never use target/release cache."""
    global _PRODUCER_CACHE
    identity, inputs = producer_inputs()
    if _PRODUCER_CACHE is not None:
        binary, receipt = _PRODUCER_CACHE
        if (
            receipt["build_input_sha256"] == identity
            and binary.is_file()
            and hashlib.sha256(binary.read_bytes()).hexdigest()
            == receipt["binary_sha256"]
        ):
            return binary, receipt
    compiler = subprocess.run(
        ["rustc", "-vV"], check=True, capture_output=True, text=True, cwd=ROOT
    ).stdout.strip()
    host = next(
        (
            line.removeprefix("host: ")
            for line in compiler.splitlines()
            if line.startswith("host: ")
        ),
        "",
    )
    if not re.fullmatch(r"[A-Za-z0-9_-]+", host):
        raise ValueError("invalid native compiler host")
    target_parent = ROOT / "target"
    target_parent.mkdir(exist_ok=True)
    target = pathlib.Path(
        tempfile.mkdtemp(prefix="appearance-producer-", dir=target_parent)
    )
    command = [
        "cargo",
        "build",
        "--locked",
        "--offline",
        "--release",
        "--target",
        host,
        "--target-dir",
        str(target),
        "-p",
        "solar-cli",
    ]
    result = subprocess.run(command, cwd=ROOT, capture_output=True, text=True)
    if result.returncode:
        raise ValueError(
            f"isolated locked offline producer build failed: exit {result.returncode}"
        )
    if producer_inputs()[0] != identity:
        raise ValueError("producer source changed during isolated build")
    binary = (
        target
        / host
        / "release"
        / ("solar-cli.exe" if sys.platform == "win32" else "solar-cli")
    )
    receipt = {
        "schema_version": "solar-appearance-producer.v1",
        "build_input_sha256": identity,
        "binary_sha256": hashlib.sha256(binary.read_bytes()).hexdigest(),
        "compiler": compiler,
        "target": host,
        "profile": "release",
        "locked": True,
        "offline": True,
        "fresh_target_directory": True,
        "inputs": inputs,
    }
    (target / "appearance-build-receipt.json").write_text(
        json.dumps(receipt, indent=2) + "\n", encoding="utf-8"
    )
    _PRODUCER_CACHE = (binary, receipt)
    return binary, receipt


def verify_producer(binary: pathlib.Path, receipt: dict) -> None:
    if (
        producer_inputs()[0] != receipt["build_input_sha256"]
        or hashlib.sha256(binary.read_bytes()).hexdigest() != receipt["binary_sha256"]
    ):
        raise ValueError("producer input or binary identity changed before publication")


def write_once(path: pathlib.Path, data: bytes) -> None:
    if path.exists():
        if path.stat().st_size != len(data) or path.read_bytes() != data:
            raise ValueError(f"different existing output: {path}")
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as handle:
        handle.write(data)


def resource(path: pathlib.Path, data: bytes, web: pathlib.Path) -> dict:
    write_once(path, data)
    return {
        "path": path.relative_to(web).as_posix(),
        "bytes": len(data),
        "sha256": hashlib.sha256(data).hexdigest(),
    }


def floats(values: array.array) -> bytes:
    if sys.byteorder != "little":
        values.byteswap()
    return values.tobytes()


def volume(packet: dict, n: int, background_bytes: bytes) -> tuple[bytes, bytes, dict]:
    """CDF cell averages of physical Gaussian tubes; never renormalize clipping."""
    if n not in (32, 64, 96) or len(background_bytes) != n**3 * 4:
        raise ValueError("volume background dimensions")
    values = array.array("f")
    values.frombytes(background_bytes)
    if sys.byteorder != "little":
        values.byteswap()
    if any(not math.isfinite(v) or v < 0 for v in values):
        raise ValueError("invalid background scalar")
    attributes = array.array("f", [0.0]) * (n**3 * 4)
    mass = {
        k: 0.0 for k in ("target_mass", "retained_mass", "tail_mass", "clipped_mass")
    }
    mass["samples"] = 0
    for strand in packet["strands"]:
        if strand["classification"] == "incomplete":
            continue
        points = strand["points"]
        gains = strand["emissivity_gain"]
        if len(gains) != len(points):
            raise ValueError("strand gain/point correspondence")
        local: dict[int, tuple[float, float]] = {}
        arc = 0.0
        for i, (a, b) in enumerate(zip(points, points[1:])):
            deposited = deposit_line_segment(
                local,
                a,
                b,
                n,
                strand["emission_relative"],
                arc,
                gain_a=gains[i],
                gain_b=gains[i + 1],
            )
            for key in mass:
                mass[key] += getattr(deposited, key)
            arc += math.sqrt(sum((b[j] - a[j]) ** 2 for j in range(3)))
        for index, (support, weighted_arc) in local.items():
            values[index] += support
            if support > attributes[index * 4 + 3]:
                attributes[index * 4] = weighted_arc / support
                attributes[index * 4 + 1] = strand["pulse"]["onset_s"]
                attributes[index * 4 + 2] = strand["pulse"]["duration_s"]
                attributes[index * 4 + 3] = support
    mass["units"] = "relative_emission_times_solar_radius_squared"
    mass["scope"] = (
        "strand-only before float32 accumulation; midpoint line quadrature; shell voxel-center clipping"
    )
    return floats(values), floats(attributes), mass


def prepare(
    recipe: pathlib.Path,
    web: pathlib.Path,
    keys: bool,
    reference_times: tuple[int, ...] = (),
) -> pathlib.Path:
    if len(set(reference_times) | {0}) > 25 or any(
        type(t) is not int or not 0 <= t <= 21600 for t in reference_times
    ):
        raise ValueError("reference time/count bounds")
    if recipe.stat().st_size > 65536:
        raise ValueError("recipe byte limit")
    config = json.loads(recipe.read_text(encoding="utf-8"))
    if (
        set(config) != {"schema_version", "recipe_id", "seed", "authority"}
        or config["schema_version"] != "solar-appearance-recipe.v1"
        or config["authority"] != "illustrative"
        or config["recipe_id"] not in ("quiet-v1", "active-v1")
        or type(config["seed"]) is not int
        or not 0 <= config["seed"] <= 0xFFFFFFFF
    ):
        raise ValueError("strict pinned recipe required")
    name = config["recipe_id"]
    recipe_hash = hashlib.sha256(
        (
            ROOT / "assets" / "solar" / "recipes" / (name + "-definition.json")
        ).read_bytes()
    ).hexdigest()
    cli, receipt = ensure_producer()
    source_hash = receipt["build_input_sha256"]
    dest = web / "solar-dynamic" / name
    frames = []
    times = range(0, 21601, 900) if keys else [0]
    for time in times:
        folder = dest / f"t{time:05d}"
        subprocess.run(
            [
                str(cli),
                "appearance",
                "prepare",
                "--recipe",
                str(recipe),
                "--out",
                str(folder),
                "--time",
                str(time),
                "--lod",
                "1",
            ],
            check=True,
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
        )
        data = (folder / "packet.json").read_bytes()
        if json.loads(data).get("recipe_hash") != recipe_hash:
            raise ValueError("Rust recipe hash differs from definition; rebuild CLI")
        frames.append(
            {
                "time_s": time,
                "packet": resource(folder / "packet.json", data, web),
                "transition_kind": "hold_geometry",
                "topology_id": json.loads(data)["topology_id"],
            }
        )
    packet = json.loads((dest / "t00000" / "packet.json").read_text())
    surface_path = dest / "reference-euv-t00000.f32"
    subprocess.run(
        [
            str(cli),
            "appearance",
            "raster",
            "--recipe",
            str(recipe),
            "--packet",
            str(dest / "t00000" / "packet.json"),
            "--out",
            str(surface_path),
        ],
        check=True,
        cwd=ROOT,
        stdout=subprocess.DEVNULL,
    )
    surface_data = resource(surface_path, surface_path.read_bytes(), web)
    surface_data.update(
        dimensions=[2048, 1024],
        dtype="float32-le",
        longitude_positive="west",
        latitude_row_zero="south",
        texel_centers=True,
        units="relative_emission",
        time_s=0,
    )
    surface_data["transfer_id"] = "hierarchical-euv-linear-v1"
    volumes = []
    for quality, n in [("low", 64), ("standard", 96)]:
        background_path = dest / f"{quality}-background.f32"
        subprocess.run(
            [
                str(cli),
                "appearance",
                "background",
                "--recipe",
                str(recipe),
                "--packet",
                str(dest / "t00000" / "packet.json"),
                "--width",
                str(n),
                "--out",
                str(background_path),
            ],
            check=True,
            cwd=ROOT,
            stdout=subprocess.DEVNULL,
        )
        background_bytes = background_path.read_bytes()
        emission, pulse, mass = volume(packet, n, background_bytes)
        item = resource(dest / f"{quality}-emission.f32", emission, web)
        pulse_resource = resource(dest / f"{quality}-pulse.f32", pulse, web)
        pulse_resource.update(
            dimensions=[n, n, n],
            components=4,
            dtype="float32-le",
            layout="x-fastest-y-next-z-slowest-RGBA",
            channels=["arc_length_R", "onset_s", "duration_s", "support_relative"],
            width_R=0.04,
            speed_R_per_s=0.0002,
            amplitude=0.3,
            window="sin_squared_nonrepeating",
            selection="strongest strand support per voxel; support-weighted arc length",
        )
        background_resource = resource(background_path, background_bytes, web)
        background_resource.update(
            dimensions=[n, n, n],
            bounds=[-2.5, 2.5],
            dtype="float32-le",
            layout="x-fastest-y-next-z-slowest",
            voxel_centers=True,
            units="relative_emission_per_solar_radius",
            contains_strands=False,
            time_s=0,
        )
        item["background"] = background_resource
        item["pulse"] = pulse_resource
        item.update(
            id=quality,
            dimensions=[n, n, n],
            bounds=[-2.5, 2.5],
            dtype="float32-le",
            layout="x-fastest-y-next-z-slowest",
            voxel_centers=True,
            units="relative_emission_per_solar_radius",
            time_s=0,
            temporal_authority="time-averaged illustrative background; rotation transform only",
            width_filter="physical Gaussian voxel CDF; five sigma axis tails; no variance inflation; no clipping renormalization",
            deposition_mass=mass,
        )
        volumes.append(item)
    receipt_resource = resource(
        dest / "producer-receipt.json",
        (json.dumps(receipt, indent=2) + "\n").encode(),
        web,
    )
    manifest = {
        "schema_version": "solar-dynamic-appearance.v1",
        "id": name,
        "seed": config["seed"],
        "recipe_hash": recipe_hash,
        "generator_source_sha256": source_hash,
        "producer_binary_sha256": receipt["binary_sha256"],
        "producer_receipt": receipt_resource,
        "authority": "illustrative",
        "frame": "carrington_z_north_west_positive",
        "radius_km": 695700,
        "duration_seconds": 21600,
        "rotation": {
            "coefficients_deg_per_day": [14.713, -2.396, -1.787],
            "frame_rate_deg_per_day": 14.1844,
        },
        "packet": frames[0]["packet"],
        "surface": surface_data,
        "volumes": volumes,
        "keyframes": frames,
        "credits": [
            "Sol dependency-free Rust synthetic PFSS and statistical appearance model"
        ],
        "limits": [
            "Normalized synthetic magnetic boundary; no measured magnetogram",
            "PFSS potential field does not model currents, reconnection, plasma temperature or density",
            "Relative emission, no AIA response calibration",
            "Volume uses a fixed time-averaged background; per-strand local pulses are separate descriptors",
            "L32 PFSS; numerical convergence checked against L16/64; no observed-topology validation",
            "Keyframe geometry switches without topology morphing",
            "Browser evaluates analytic attachment kernels from admitted packet; reference raster is not a browser texture",
            "2048x1024 reference core integrals qualified for actual nonpolar anchors; polar kernels and pixel peaks not qualified",
            "Fallback volume retains declared five-sigma tail and shell voxel-center clipping losses; no survivor renormalization",
        ],
    }
    reference_times = tuple(sorted(set(reference_times) | {0}))
    if reference_times:
        manifest["surface_keyframes"] = []
        for time in sorted(set(reference_times)):
            if not 0 <= time <= 21600:
                raise ValueError("reference time bounds")
            path = dest / f"reference-euv-t{time:05d}.f32"
            if time != 0:
                subprocess.run(
                    [
                        str(cli),
                        "appearance",
                        "raster",
                        "--packet",
                        str(dest / "t00000" / "packet.json"),
                        "--recipe",
                        str(recipe),
                        "--time",
                        str(time),
                        "--out",
                        str(path),
                    ],
                    check=True,
                    cwd=ROOT,
                    stdout=subprocess.DEVNULL,
                )
            record = resource(path, path.read_bytes(), web)
            record.update(
                dimensions=[2048, 1024],
                dtype="float32-le",
                longitude_positive="west",
                latitude_row_zero="south",
                texel_centers=True,
                units="relative_emission",
                time_s=time,
                recipe_hash=recipe_hash,
                temporal_policy="absolute-differential-unadvection-already-applied",
                transfer_id="hierarchical-euv-linear-v1",
                resolved_visibility=1,
            )
            manifest["surface_keyframes"].append(record)
    verify_producer(cli, receipt)
    path = dest / "manifest.json"
    write_once(path, (json.dumps(manifest, indent=2) + "\n").encode())
    return path


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--recipe", required=True, type=pathlib.Path)
    parser.add_argument("--web-root", type=pathlib.Path, default=ROOT / "apps" / "web")
    parser.add_argument("--single-key", action="store_true")
    parser.add_argument("--reference-times", nargs="*", type=int, default=[])
    args = parser.parse_args()
    print(
        prepare(
            args.recipe.resolve(),
            args.web_root.resolve(),
            not args.single_key,
            tuple(args.reference_times),
        )
    )


if __name__ == "__main__":
    main()
