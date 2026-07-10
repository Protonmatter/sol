#!/usr/bin/env python3
"""Fail before Sol's bundled IERS prediction window becomes operationally stale."""

from __future__ import annotations

import argparse
import datetime as dt
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "crates" / "solar-ephemeris" / "src" / "earth_orientation.rs"
SECONDS_PER_DAY = 86_400.0
UNIX_EPOCH_JD = 2_440_587.5


def current_mjd(now: dt.datetime | None = None) -> float:
    now = now or dt.datetime.now(dt.timezone.utc)
    if now.tzinfo is None:
        now = now.replace(tzinfo=dt.timezone.utc)
    jd = now.timestamp() / SECONDS_PER_DAY + UNIX_EPOCH_JD
    return jd - 2_400_000.5


def declared_prediction_end() -> float:
    text = SOURCE.read_text(encoding="utf-8")
    match = re.search(
        r"pub const PREDICTION_END_MJD:\s*f64\s*=\s*([0-9_]+(?:\.[0-9_]+)?)",
        text,
    )
    if not match:
        raise ValueError(f"PREDICTION_END_MJD not found in {SOURCE}")
    return float(match.group(1).replace("_", ""))


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--minimum-days",
        type=float,
        default=90.0,
        help="minimum required future prediction coverage",
    )
    args = parser.parse_args()

    end_mjd = declared_prediction_end()
    today_mjd = current_mjd()
    remaining = end_mjd - today_mjd
    print(
        f"IERS EOP prediction coverage: today MJD={today_mjd:.3f}, "
        f"end MJD={end_mjd:.3f}, remaining={remaining:.1f} days"
    )
    if remaining < args.minimum_days:
        print(
            "ERROR: bundled IERS prediction coverage is inside the refresh safety window; "
            "update earth_orientation.rs from a current Bulletin A before release."
        )
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
