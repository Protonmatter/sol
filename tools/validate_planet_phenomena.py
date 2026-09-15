#!/usr/bin/env python3
"""Offline source/build gate for a bounded historical mission observation gallery.

No network, writes, image decoder dependency or globe-registration upgrade.
"""
from __future__ import annotations
import argparse
from datetime import date
import json
from pathlib import Path
import re
import struct
from urllib.parse import urlparse
try:
    from .validate_physical_assets import read_json,text,sha,asset,timestamp
except ImportError:
    from validate_physical_assets import read_json,text,sha,asset,timestamp

ROOT=Path(__file__).resolve().parents[1]
CAP=400000
TOTAL_CAP=1500000
PREFIX="// Generated from planet-phenomena.v1.json; observation-gallery use only.\nexport const planetPhenomenaManifest = "
EXPECTED={"jupiter-aurora":("Jupiter","north"),"jupiter-storm":("Jupiter","regional"),
          "saturn-hexagon":("Saturn","north"),"saturn-decagon":("Saturn","south"),"neptune-aurora":("Neptune","mid-latitudes")}


def official_url(value: object, *, image: bool=False, jpl: bool=False) -> None:
    url=urlparse(text(value,"observation source URL"))
    host=url.hostname
    try:port=url.port
    except ValueError as exc:raise ValueError("invalid observation source origin") from exc
    if url.scheme!="https" or url.username or url.password or port not in (None,443):
        raise ValueError("observation source requires official HTTPS")
    allowed=("assets.science.nasa.gov",) if image else ("science.nasa.gov","www.jpl.nasa.gov")
    if host in allowed:return
    if image and jpl and host=="d2pn8kiwq2w21t.cloudfront.net" and re.fullmatch(r"/original_images/jpegPIA[0-9]+\.jpg",url.path):return
    raise ValueError("unreviewed observation source origin")


def image_dimensions(raw: bytes,mime: str) -> tuple[int,int]:
    if mime=="image/png":
        if len(raw)<33 or raw[:8]!=b"\x89PNG\r\n\x1a\n" or raw[12:16]!=b"IHDR" or raw[24:26]!=bytes([8,2]):
            raise ValueError("unsupported observation PNG header")
        return struct.unpack(">II",raw[16:24])
    if mime!="image/jpeg" or raw[:2]!=b"\xff\xd8":raise ValueError("unsupported observation image header")
    offset=2
    while offset<len(raw):
        if raw[offset]!=255:raise ValueError("invalid observation JPEG marker")
        while offset<len(raw) and raw[offset]==255:offset+=1
        if offset>=len(raw):break
        marker=raw[offset];offset+=1
        if marker in (0,0xD9,0xDA):break
        if marker==1 or 0xD0<=marker<=0xD8:continue
        if offset+2>len(raw):break
        size=int.from_bytes(raw[offset:offset+2],"big")
        if size<2 or offset+size>len(raw):break
        if marker in (0xC0,0xC1,0xC2):
            if size<8 or raw[offset+2]!=8:raise ValueError("unsupported observation JPEG precision")
            height,width=struct.unpack(">HH",raw[offset+3:offset+7]);return width,height
        offset+=size
    raise ValueError("missing or truncated observation image dimensions")


def generated_module(data: dict) -> str:
    return PREFIX+json.dumps(data,separators=(",",":"))+";\n"


def validate_manifest(data: dict,root: Path) -> int:
    if not isinstance(data,dict) or set(data)!={"schema_version","reviewed_at","policy","observations"} or data["schema_version"]!="planet-phenomena.v1":
        raise ValueError("unsupported planet observation manifest schema")
    reviewed=date.fromisoformat(text(data["reviewed_at"],"review date"));text(data["policy"],"observation policy")
    observations=data["observations"]
    if not isinstance(observations,list) or len(observations)!=5:raise ValueError("unexpected observation inventory")
    ids=set();total=0
    fields={"id","body","title","hemisphere","mission","instrument","band","observation","published_at","coverage",
            "color_interpretation","description","alt","source_page","credits","asset","source_url","source_sha256","source_retrieved_at",
            "source_identity","mapping_status","allowed_usages","playback","derivation"}
    for item in observations:
        if not isinstance(item,dict) or set(item)!=fields:raise ValueError("invalid observation record schema")
        key=item["id"]
        if not isinstance(key,str) or key not in EXPECTED or key in ids:raise ValueError("duplicate or unknown observation")
        ids.add(key)
        if (item["body"],item["hemisphere"])!=EXPECTED[key]:raise ValueError("incorrect observation body or hemisphere")
        for name in ("title","mission","instrument","band","coverage","color_interpretation","description","alt","credits","derivation"):
            text(item[name],name)
        if item["source_identity"]!="verified-published-bytes" or item["mapping_status"]!="unqualified" or item["allowed_usages"]!=["observation-gallery"] or item["playback"]!="static-reference":
            raise ValueError("observation scientific qualification may not be upgraded")
        official_url(item["source_page"]);official_url(item["source_url"],image=True,jpl=urlparse(item["source_page"]).hostname=="www.jpl.nasa.gov")
        observation=item["observation"]
        if not isinstance(observation,dict) or set(observation)!={"label","precision","value"}:raise ValueError("invalid observation epoch")
        text(observation["label"],"observation date label")
        precision=observation["precision"];value=text(observation["value"],"source epoch")
        if precision not in ("day","month") or not re.fullmatch(r"[0-9]{4}-[0-9]{2}"+(r"-[0-9]{2}" if precision=="day" else ""),value):
            raise ValueError("invalid observation epoch precision")
        observed=date.fromisoformat(value+("-01" if precision=="month" else ""))
        published=date.fromisoformat(text(item["published_at"],"publication date"))
        retrieved=timestamp(item["source_retrieved_at"])
        if not observed<=published<=reviewed or retrieved.date()<published:raise ValueError("observation and publication epochs conflict")
        descriptor=item["asset"]
        if not isinstance(descriptor,dict) or set(descriptor)!={"path","bytes","sha256","mime","dimensions"}:raise ValueError("invalid observation asset")
        mime=descriptor["mime"]
        if mime not in ("image/png","image/jpeg"):raise ValueError("observation image format not admitted")
        expected_suffix=".png" if mime=="image/png" else ".jpg"
        if descriptor["path"]!=f"textures/phenomena/{key}{expected_suffix}":raise ValueError("observation path not admitted")
        sha(item["source_sha256"])
        if item["source_sha256"]!=descriptor["sha256"]:raise ValueError("source hash does not match unmodified display bytes")
        raw=asset(root,descriptor,"phenomena",CAP);total+=len(raw)
        dimensions=image_dimensions(raw,mime)
        if list(dimensions)!=descriptor["dimensions"] or not all(128<=size<=1600 for size in dimensions):
            raise ValueError("observation dimensions differ from source")
        if key=="saturn-decagon" and ("missing" not in item["coverage"].lower() or "F763M" not in item["band"]):
            raise ValueError("south polar source missing-data or band qualification lost")
        if key=="neptune-aurora" and "mid-latitude" not in item["coverage"]:
            raise ValueError("Neptune mid-latitude coverage lost")
    if total>TOTAL_CAP:raise ValueError("observation gallery total byte cap exceeded")
    return len(ids)


def validate_phenomena_source(root: Path) -> int:
    manifest=root/"planet-phenomena.v1.json"
    runtimes=("js/planetPhenomena.js","js/planetPhenomenaManifest.js")
    if not manifest.exists() and not any((root/name).exists() for name in runtimes):return 0
    if not manifest.is_file():raise ValueError("planet phenomena runtime requires its manifest")
    data=read_json(manifest);count=validate_manifest(data,root)
    module=root/"js/planetPhenomenaManifest.js"
    if not module.is_file() or module.is_symlink() or module.read_text(encoding="utf-8")!=generated_module(data):
        raise ValueError("browser planet phenomena manifest drift")
    return count


def main() -> int:
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument("--web-root",type=Path,default=ROOT/"apps/web")
    args=parser.parse_args()
    try:print(json.dumps({"status":"passed","observations":validate_phenomena_source(args.web_root.resolve())}));return 0
    except (ValueError,TypeError,KeyError,OSError) as exc:print(f"Planet observation validation failed: {exc}");return 1


if __name__=="__main__":raise SystemExit(main())
