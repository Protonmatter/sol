#!/usr/bin/env python3
"""Download real planetary surface maps into apps/web/textures/ for the 3-D View.

The 3-D renderer (apps/web/js/orrery.js) wraps these equirectangular maps onto its spheres when
present, and falls back to its procedural shader for any that are missing — so the textures are an
optional, gitignored enhancement (run this once to fetch them), not a hard dependency.

Sources (all free to use; attribution written to textures/ATTRIBUTION.txt):
  • Earth  — NASA Visible Earth "Blue Marble" land/topo mosaic (public domain, NASA/GSFC).
  • Planets — Solar System Scope texture set (CC-BY 4.0), cylindrical maps derived from NASA / USGS /
    ESA mission imagery (MESSENGER, Magellan, Viking/MGS, Cassini, Voyager, LRO/Clementine).
  • Moons  — USGS Astrogeology (Astropedia) 1024-px browse renderings of the published global
    mosaics, in SIMPLE CYLINDRICAL (equirectangular) projection — the projection the sphere shader
    samples. USGS/NASA planetary mosaics are US-Government works in the public domain. Solar System
    Scope ships no satellite maps beyond Earth's Moon, and the archival GeoTIFFs on
    planetarymaps.usgs.gov are 16–800 MB and undecodable by a browser, so the browse JPEG is the
    right rung of the same ladder: same product, same authority, web-sized.
  • Sun   — NASA SDO/HMI continuum "latest" browse frame (today's real solar disk, public domain). The
    3-D Sun maps it onto its sphere via a camera-facing projection; re-run this to refresh it. Absent →
    the procedural granulation/sunspot shader. (Loaded same-origin: sdo.gsfc.nasa.gov sends no CORS.)

The eleven catalogued moons with NO entry are not oversights — see NO_MOSAIC below for the reason
each one keeps its procedural surface. Guessing a face for a body nobody has mapped is the same
mistake tools/fetch_geography.py refused to make for Mars and Mercury albedo features.

Usage:  python tools/fetch_textures.py [--force]
"""

from __future__ import annotations

import json
import sys
import time
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
    # ---- Moons of the 21-body catalogue (apps/web/js/moons.js) -------------------------------
    # Each URL is the 1024-px browse rendering that USGS Astropedia publishes alongside the
    # archival GeoTIFF of the SAME product; the CKAN dataset/resource UUIDs are stable permalinks.
    # All are ~1024x512 (2:1 equirectangular, full 360° of longitude) unless noted; every one was
    # downloaded and its geometry checked before being listed here. They are single-band
    # (greyscale) mission mosaics: the renderer supplies hue from the catalogue and overall
    # brightness from the published geometric albedo (apps/web/js/moonAppearance.js), because a
    # contrast-stretched browse rendering carries structure, not photometry.
    "io": ("https://astrogeology.usgs.gov/ckan/dataset/b9102ce8-3ee4-4848-8558-3dab5f52091a/resource/19e9cb9d-a62e-4345-8778-9580db879922/download/full.jpg", "USGS Astrogeology — Io Voyager/Galileo SSI Global Mosaic 1 km, browse rendering (public domain, NASA/JPL/USGS)"),
    "europa": ("https://astrogeology.usgs.gov/ckan/dataset/4080036f-afc5-422e-abe9-1c0c8e4f98ea/resource/3647e7b3-425e-4dcf-951b-cc4a22fb0129/download/europa_voyager_galileossi_global_mosaic_500m_1024.jpg", "USGS Astrogeology — Europa Voyager/Galileo SSI Global Mosaic 500 m, browse rendering (public domain, NASA/JPL/USGS)"),
    "ganymede": ("https://astrogeology.usgs.gov/ckan/dataset/b2d0bf2c-1335-424b-a952-da3d8374723b/resource/19e807a2-9eee-4f24-9965-5e25f0bcb9fc/download/full.jpg", "USGS Astrogeology — Ganymede Voyager/Galileo Simple Cylindrical global mosaic, browse rendering (public domain, NASA/JPL/USGS)"),
    # Callisto's browse rendering is 1024x498, i.e. the mosaic stops ~2.4° short of each pole
    # (nothing imaged there). Sampled as if it were full-height, so the polar caps of the sphere
    # repeat the highest-latitude row — a sub-degree stretch, not a fabricated pole.
    "callisto": ("https://astrogeology.usgs.gov/ckan/dataset/842a3a75-af37-40ff-bf83-78ee5c76afb2/resource/b16c6dfd-199e-449e-9875-1361c1858af3/download/full.jpg", "USGS Astrogeology — Callisto Galileo/Voyager Simple Cylindrical Global Map 1 km, browse rendering; mosaic spans ±87.6° latitude (public domain, NASA/JPL/USGS)"),
    "enceladus": ("https://astrogeology.usgs.gov/ckan/dataset/30bff65e-56bb-4fd1-bd04-edd9bc2e77d0/resource/19ba2e14-9ceb-45e6-8cc8-e784e36ed4f0/download/full.jpg", "USGS Astrogeology — Enceladus Cassini Global Mosaic 110 m, browse rendering (public domain, NASA/JPL/SSI/USGS)"),
    "tethys": ("https://astrogeology.usgs.gov/ckan/dataset/e40296c1-b4bf-46d8-86af-4b6cf0301b0c/resource/36d40203-d9b3-447e-9004-c3dc100bde04/download/full.jpg", "USGS Astrogeology — Tethys Cassini Global Mosaic 293 m, browse rendering (public domain, NASA/JPL/SSI/USGS)"),
    "dione": ("https://astrogeology.usgs.gov/ckan/dataset/acb98ae6-ec50-42df-9a74-142d177bbe6d/resource/8a6a8ada-42e1-4b92-b13e-c63493133efc/download/full.jpg", "USGS Astrogeology — Dione Cassini/Voyager Global Mosaic 154 m, browse rendering (public domain, NASA/JPL/SSI/USGS)"),
    "rhea": ("https://astrogeology.usgs.gov/ckan/dataset/22bc1015-d9c9-4212-86c3-e42061b204d4/resource/77fa77f8-6d6b-4072-9360-17138caa6e7d/download/full.jpg", "USGS Astrogeology — Rhea Cassini/Voyager Global Mosaic 417 m, browse rendering (public domain, NASA/JPL/SSI/USGS)"),
    "iapetus": ("https://astrogeology.usgs.gov/ckan/dataset/6ac8ecfb-36e7-4113-8d16-c92ba857c3d7/resource/141c2d1e-aa01-4e2f-969a-e46a581db4b9/download/full.jpg", "USGS Astrogeology — Iapetus Cassini/Voyager Global Mosaic 803 m, browse rendering (public domain, NASA/JPL/SSI/USGS)"),
    "phobos": ("https://astrogeology.usgs.gov/ckan/dataset/85290c2c-7524-44ba-9251-61ea69fcd9dd/resource/876ae3aa-ac7b-434c-86f4-a2e50cc9826d/download/phobos_viking_mosaic_dlrcontrol_1024.jpg", "USGS Astrogeology — Phobos Viking Global Mosaic (DLR control), browse rendering (public domain, NASA/JPL/DLR/USGS)"),
}

# The other eleven catalogued moons, and why each keeps the procedural shader. Recorded here
# rather than left as an absence so that "no texture" reads as a decision with a reason, and so
# a future contributor can see exactly what would have to change to add one.
# Checked against USGS Astrogeology (Astropedia + the asc-pds-services mosaic archive) 2026-08-16.
NO_MOSAIC = {
    "Titan": "Cassini ISS published only a NEAR-global mosaic — 65°S to 45°N, a 1024x313 strip. "
             "Stretching 110° of latitude over 180° would put every feature at the wrong "
             "latitude. Titan's true visible appearance is a featureless orange haze anyway, "
             "which is what the hazy procedural style already draws; the ISS mosaic is a "
             "near-infrared view THROUGH that haze, so it is not what the eye would see.",
    "Mimas": "No equirectangular global mosaic is published. Astropedia's Mimas product is an "
             "airbrush shaded-relief map SHEET (borders, graticule, polar insets), which is a "
             "hand-drawn cartographic rendering, not imagery, and cannot be wrapped on a sphere.",
    "Triton": "Same: the published Voyager 2 product on Astropedia is a printed controlled-"
              "photomosaic sheet in an oblique frame. The archival GeoTIFF "
              "(Triton_Voyager2_ClrMosaic_GlobalFill_600m) has no browse JPEG.",
    "Miranda": "Voyager 2's 1986 Uranus flyby imaged only the southern hemisphere at usable "
               "resolution; USGS publishes no global mosaic for any Uranian moon, only "
               "nomenclature and control-network products. Half a moon is not a global map.",
    "Ariel": "As Miranda — Voyager 2 southern-hemisphere coverage only, no global mosaic.",
    "Umbriel": "As Miranda — Voyager 2 southern-hemisphere coverage only, no global mosaic.",
    "Titania": "As Miranda — Voyager 2 southern-hemisphere coverage only, no global mosaic.",
    "Oberon": "As Miranda — Voyager 2 southern-hemisphere coverage only, no global mosaic.",
    "Deimos": "Viking imaged Deimos, but USGS publishes a global mosaic for Phobos only; there "
              "is no Deimos entry in the mosaic archive.",
    "Proteus": "Voyager 2 resolved Proteus at a few kilometres per pixel over part of one "
               "hemisphere. No map product exists.",
    "Nereid": "Never resolved. Voyager 2's best images are a handful of pixels across.",
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
    for key, (url, src) in TEXTURES.items():
        try:
            msg, n = fetch(key, url)
            print(f"  {msg}  ({n // 1024} KB)")
            total += n
            ok += 1
            if key == "sun" and msg.startswith("saved"):
                # The Sun frame is a dated observation, not a static map: record its capture
                # epoch so the renderer can build the disk basis for the moment the image was
                # actually taken (apps/web/js/orrery.js sunDiskBasis) and label its age
                # honestly, instead of assuming "now" as a committed baseline ages.
                (OUT / "sun.jpg.json").write_text(
                    json.dumps({"fetched_unix": int(time.time()), "source": url}) + "\n",
                    encoding="utf-8",
                )
        except Exception as e:  # noqa: BLE001 — best-effort; missing files fall back to procedural
            print(f"  FAILED {key}: {e}")
    # Attribution covers every catalogued file PRESENT on disk, not just this run's successes:
    # a failed refresh retains the committed baseline image, so it must retain that image's
    # attribution line too — a partial fetch must never strip credits for files still shipped.
    attribution = ["Planetary texture maps used by the 3-D View (apps/web/js/orrery.js).", ""]
    for key, (url, src) in TEXTURES.items():
        ext = ".png" if url.endswith(".png") else ".jpg"
        if (OUT / f"{key}{ext}").exists():
            attribution.append(f"{key}: {src}\n    {url}")
    # The absences are part of the provenance record: a reader comparing this file against the
    # 21-moon catalogue must be able to see that the missing ones were considered and rejected,
    # not forgotten. Same reasoning as the rejected-source notes in tools/fetch_geography.py.
    attribution += ["", "Catalogued moons with NO published global mosaic (procedural surface):", ""]
    for moon, why in NO_MOSAIC.items():
        attribution.append(f"{moon}: {why}")
    (OUT / "ATTRIBUTION.txt").write_text("\n".join(attribution) + "\n", encoding="utf-8")
    print(f"{ok}/{len(TEXTURES)} textures in {OUT}  ({total // 1024} KB total)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
