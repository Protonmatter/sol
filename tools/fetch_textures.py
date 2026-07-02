#!/usr/bin/env python3
"""Download real planetary surface maps into apps/web/textures/ for the 3-D View.

The 3-D renderer (apps/web/js/orrery.js) wraps these equirectangular maps onto its spheres when
present, and falls back to its procedural shader for any that are missing — so the textures are an
optional, gitignored enhancement (run this once to fetch them), not a hard dependency.

Sources (all free to use; attribution written to textures/ATTRIBUTION.txt):
  • Earth  — NASA Visible Earth "Blue Marble" land/topo mosaic (public domain, NASA/GSFC).
  • Others — Solar System Scope texture set (CC-BY 4.0), cylindrical maps derived from NASA / USGS /
    ESA mission imagery (MESSENGER, Magellan, Viking/MGS, Cassini, Voyager, LRO/Clementine).
  • Sun   — NASA SDO/HMI continuum "latest" browse frame (today's real solar disk, public domain). The
    3-D Sun maps it onto its sphere via a camera-facing projection; re-run this to refresh it. Absent →
    the procedural granulation/sunspot shader. (Loaded same-origin: sdo.gsfc.nasa.gov sends no CORS.)

Usage:  python tools/fetch_textures.py [--force]
"""

from __future__ import annotations

import sys
import urllib.request
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "apps" / "web" / "textures"

# key (renderer looks up <key>.<ext>) → (url, source label)
TEXTURES = {
    "mercury": ("https://www.solarsystemscope.com/textures/download/2k_mercury.jpg", "Solar System Scope (CC-BY 4.0) · NASA/MESSENGER"),
    "venus": ("https://www.solarsystemscope.com/textures/download/2k_venus_atmosphere.jpg", "Solar System Scope (CC-BY 4.0) · NASA/Magellan + Pioneer Venus"),
    "earth": ("https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57752/land_shallow_topo_2048.jpg", "NASA Visible Earth — Blue Marble (public domain)"),
    "mars": ("https://www.solarsystemscope.com/textures/download/2k_mars.jpg", "Solar System Scope (CC-BY 4.0) · NASA/Viking + MGS/MOLA"),
    "jupiter": ("https://www.solarsystemscope.com/textures/download/2k_jupiter.jpg", "Solar System Scope (CC-BY 4.0) · NASA/Cassini + Juno"),
    "saturn": ("https://www.solarsystemscope.com/textures/download/2k_saturn.jpg", "Solar System Scope (CC-BY 4.0) · NASA/Cassini"),
    "uranus": ("https://www.solarsystemscope.com/textures/download/2k_uranus.jpg", "Solar System Scope (CC-BY 4.0) · NASA/Voyager 2"),
    "neptune": ("https://www.solarsystemscope.com/textures/download/2k_neptune.jpg", "Solar System Scope (CC-BY 4.0) · NASA/Voyager 2"),
    "moon": ("https://www.solarsystemscope.com/textures/download/2k_moon.jpg", "Solar System Scope (CC-BY 4.0) · NASA/LRO + Clementine"),
    "saturn_ring": ("https://www.solarsystemscope.com/textures/download/2k_saturn_ring_alpha.png", "Solar System Scope (CC-BY 4.0) · NASA/Cassini ring photometry"),
    "sun": ("https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_HMIIC.jpg", "NASA SDO/HMI continuum — today's real Sun (public domain, NASA/SDO)"),
    # The other SDO channels, for the 3-D Sun's channel selector (each shows a different
    # layer/temperature of the solar atmosphere — same set as the 2-D wavelength bar).
    "sun_hmib": ("https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_HMIB.jpg", "NASA SDO/HMI magnetogram (public domain, NASA/SDO)"),
    "sun_1700": ("https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_1700.jpg", "NASA SDO/AIA 1700 Å (public domain, NASA/SDO)"),
    "sun_0304": ("https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0304.jpg", "NASA SDO/AIA 304 Å (public domain, NASA/SDO)"),
    "sun_0171": ("https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0171.jpg", "NASA SDO/AIA 171 Å (public domain, NASA/SDO)"),
    "sun_0193": ("https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0193.jpg", "NASA SDO/AIA 193 Å (public domain, NASA/SDO)"),
    "sun_0211": ("https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0211.jpg", "NASA SDO/AIA 211 Å (public domain, NASA/SDO)"),
    "sun_0335": ("https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0335.jpg", "NASA SDO/AIA 335 Å (public domain, NASA/SDO)"),
    "sun_0131": ("https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0131.jpg", "NASA SDO/AIA 131 Å (public domain, NASA/SDO)"),
    "sun_0094": ("https://sdo.gsfc.nasa.gov/assets/img/latest/latest_1024_0094.jpg", "NASA SDO/AIA 94 Å (public domain, NASA/SDO)"),
}

UA = {"User-Agent": "Mozilla/5.0 (SolarMaximumEngine texture fetcher)"}


MAGIC = {".jpg": b"\xff\xd8\xff", ".png": b"\x89PNG"}


def fetch(key: str, url: str) -> tuple[str, int]:
    ext = ".png" if url.endswith(".png") else ".jpg"
    dst = OUT / f"{key}{ext}"
    if dst.exists() and "--force" not in sys.argv:
        return f"skip {dst.name} (exists)", dst.stat().st_size
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = resp.read()
    # Refuse an HTML error page served as 200, and write atomically — a truncated
    # multi-MB write used to satisfy the exists-skip forever, blocking its own repair.
    if not data.startswith(MAGIC[ext]):
        raise ValueError(f"{url} did not return a {ext} image ({data[:12]!r})")
    tmp = dst.with_suffix(dst.suffix + ".tmp")
    tmp.write_bytes(data)
    tmp.replace(dst)
    return f"saved {dst.name}", len(data)


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    total, ok = 0, 0
    attribution = ["Planetary texture maps used by the 3-D View (apps/web/js/orrery.js).", ""]
    for key, (url, src) in TEXTURES.items():
        try:
            msg, n = fetch(key, url)
            print(f"  {msg}  ({n // 1024} KB)")
            total += n
            ok += 1
            attribution.append(f"{key}: {src}\n    {url}")
        except Exception as e:  # noqa: BLE001 — best-effort; missing files fall back to procedural
            print(f"  FAILED {key}: {e}")
    (OUT / "ATTRIBUTION.txt").write_text("\n".join(attribution) + "\n", encoding="utf-8")
    print(f"{ok}/{len(TEXTURES)} textures in {OUT}  ({total // 1024} KB total)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
