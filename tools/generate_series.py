#!/usr/bin/env python3
"""Generate a deterministic solar-cycle snapshot series for web timeline playback.

Each frame is a valid solar-state-snapshot.v1 (it copies the validated base
snapshot and overrides only the cycle-varying fields), so the web app can swap a
frame in exactly like the live snapshot. Active-region latitudes follow an
idealized butterfly diagram (Spoerer's law): emergence latitude is high early in
the cycle and drifts toward the equator as activity peaks and declines.
"""

from __future__ import annotations

import argparse
import copy
import json
import math
import random
from pathlib import Path

from generate_fixture_snapshot import build_field, continuum_from_br, hale_polarity

STAGES = [
    (0.00, 0.12, "solar minimum"),
    (0.12, 0.42, "rising phase"),
    (0.42, 0.60, "solar maximum"),
    (0.60, 0.90, "declining phase"),
    (0.90, 1.01, "solar minimum"),
]

STAGE_INSIGHT = {
    "solar minimum": "Solar minimum: the Sun is quiet, with few or no sunspots and little flare activity.",
    "rising phase": "Rising phase: sunspots appear more often, at mid-latitudes, as activity climbs.",
    "solar maximum": "Solar maximum: the busy peak of the cycle, with the most sunspots, flares, and aurora.",
    "declining phase": "Declining phase: activity winds down and new sunspots drift toward the equator.",
}


def stage_for(phase: float) -> str:
    for low, high, name in STAGES:
        if low <= phase < high:
            return name
    return "solar minimum"


def activity_for(phase: float) -> float:
    # Smooth bump: ~0.2 at the cycle ends, ~0.95 at mid-cycle.
    return round(0.2 + 0.75 * math.sin(math.pi * min(max(phase, 0.0), 1.0)), 6)


def build_cycle_regions(rng: random.Random, count: int, phase: float) -> list[dict]:
    # Spoerer's law: mean emergence latitude is high early and migrates equatorward.
    mean_lat = 5.0 + 30.0 * (1.0 - phase)
    regions: list[dict] = []
    for idx in range(count):
        hemi = -1.0 if rng.random() < 0.5 else 1.0
        complexity = 0.35 + 0.65 * rng.random()
        lat = hemi * max(3.0, mean_lat + rng.uniform(-4.0, 4.0))
        lat = max(-40.0, min(40.0, lat))
        regions.append(
            {
                "id": idx + 1,
                "birth_seconds": round(idx * 3600.0, 6),
                "lat_deg": round(lat, 6),
                "lon_deg": round(360.0 * rng.random(), 6),
                "flux_norm": round(0.45 + 1.1 * rng.random() * (0.75 + complexity), 6),
                "area_msh": round(150.0 + 1800.0 * complexity, 6),
                "tilt_deg": round(hemi * (4.0 + 18.0 * rng.random()), 6),
                "complexity": round(complexity, 6),
                "polarity": hale_polarity(rng, hemi),
                "confidence": 0.65,
            }
        )
    return regions


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="apps/web/data/latest-state.json")
    parser.add_argument("--out-dir", default="apps/web/data/series")
    parser.add_argument("--frames", type=int, default=11)
    parser.add_argument("--lon-count", type=int, default=36)
    parser.add_argument("--lat-count", type=int, default=18)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--months-span", type=float, default=132.0)
    args = parser.parse_args()

    base = json.loads(Path(args.base).read_text(encoding="utf-8"))
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    lon, lat = args.lon_count, args.lat_count
    manifest_frames = []
    for i in range(args.frames):
        phase = i / (args.frames - 1) if args.frames > 1 else 0.0
        stage = stage_for(phase)
        activity = activity_for(phase)
        count = int(round(4 + 32 * activity))
        rng = random.Random(args.seed + i * 7919)
        regions = build_cycle_regions(rng, count, phase)
        br, confidence = build_field(lon, lat, regions)
        continuum = [continuum_from_br(value) for value in br]
        variance = [round(max(0.04, 1.0 - conf), 6) for conf in confidence]
        months = round(phase * args.months_span, 1)

        frame = copy.deepcopy(base)
        frame["source_mode"] = "synthetic-cycle-series"
        frame["grid"] = {
            "lon_count": lon,
            "lat_count": lat,
            "dlon_deg": round(360.0 / lon, 6),
            "dlat_deg": round(180.0 / lat, 6),
        }
        frame["fields"] = {
            "br_normalized": {"units": "normalized magnetic field", "values": br},
            "br_variance_normalized": {"units": "normalized variance", "values": variance},
            "continuum_proxy": {"units": "relative intensity", "values": continuum},
            "confidence": {"units": "0..1", "values": confidence},
        }
        frame["active_regions"] = regions
        frame["run"] = dict(frame.get("run", {}))
        # Provenance: record the seed this frame was ACTUALLY built from, not the base
        # snapshot's seed (the cloned run block used to claim seed 42 for every frame).
        frame["run"]["seed"] = args.seed + i * 7919
        frame["run"]["activity_index"] = activity
        frame["run"]["time_seconds"] = round(months * 30.0 * 86400.0, 1)
        frame["run"]["mode"] = "SyntheticCycleSeries"
        frame["learning"] = {
            "cycle_stage": stage,
            "plain_language_insight": STAGE_INSIGHT.get(stage, "Solar cycle frame."),
        }
        frame["observations"] = []
        frame.pop("observed_context", None)
        frame["warnings"] = [
            "Deterministic synthetic solar-cycle series for timeline playback.",
            "Latitudes follow an idealized butterfly (Spoerer's law), not observed positions.",
            "Research and learning use only; not operational space-weather forecasting.",
        ]

        name = f"frame-{i:02d}.json"
        atomic_write_text(out_dir / name, json.dumps(frame))
        manifest_frames.append(
            {
                "index": i,
                "file": name,
                "phase": round(phase, 4),
                "stage": stage,
                "activity_index": activity,
                "months": months,
                "region_count": count,
            }
        )

    manifest = {
        "schema_version": "series-manifest.v1",
        "frames": manifest_frames,
        "months_span": args.months_span,
        "note": "Deterministic synthetic solar-cycle series; latitudes follow an idealized butterfly diagram.",
    }
    atomic_write_text(out_dir / "manifest.json", json.dumps(manifest, indent=2))
    print(f"wrote {args.frames} frames + manifest to {out_dir}")
    return 0


def atomic_write_text(path: Path, content: str) -> None:
    """Write via a temp file + rename so an interrupted run never leaves a truncated frame."""
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(content, encoding="utf-8")
    tmp.replace(path)


if __name__ == "__main__":
    raise SystemExit(main())
